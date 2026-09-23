import { fetchAllFeeds } from "./rss";
import { scoreNews } from "./anthropic";
import { supabase } from "./supabase";
import { isRealEstate } from "./classify";
import { orderForScoring } from "./score-queue";
import { recordTone, computeMarketTone, persistDailyIndex, isOwnPublication, type ToneEntry } from "./market-tone";
import type { ScoredNews } from "./types";

export interface ScanResult {
  scanned: number;
  scored: number;
  top3: ScoredNews[];
  /**
   * Rows that failed to land. Reported rather than swallowed: a scan that
   * ingests nothing must not be able to look like a scan that ingested
   * everything. Absent/0 means the whole sweep was stored.
   */
  ingestFailedRows?: number;
  /** Which run this was. "catchup" = the scoring-only pass after the morning scan. */
  mode?: ScanMode;
  /** Unscored items found in the scored feeds, before any cap. */
  unscoredFound?: number;
  /** Skipped by section (never real estate) — no tokens spent on them. */
  skipped?: number;
  /** Still unscored after this run. Non-zero is fine; zero is the goal. */
  leftUnscored?: number;
  /** Stories whose tone went into מד אמון השוק this run. */
  toned?: number;
}

export type ScanMode = "full" | "catchup";

/**
 * The most a cron day spends on scoring. It was already the ceiling of a normal
 * day (one wave of 75); the catch-up run only tops a short day up to it, so a
 * bad day now costs what a good day always cost — never more.
 */
const DAILY_SCORE_CAP = 75;

/**
 * Recompute today's מד אמון השוק from stored tone and write it to the daily
 * history the time machine reads. Plain DB arithmetic, no AI. Runs on every
 * scan — including one with nothing to score — so the stored day always matches
 * the current method. Never allowed to fail the scan.
 */
async function refreshDailyIndex(today: string, mode: ScanMode): Promise<void> {
  try {
    await persistDailyIndex(supabase, today, await computeMarketTone(supabase, today));
  } catch (e) {
    console.error(`[scan:${mode}] daily index refresh failed (scores are safe):`, e instanceof Error ? e.message : e);
  }
}

export async function runScan(opts: { mode?: ScanMode } = {}): Promise<ScanResult> {
  const mode: ScanMode = opts.mode || "full";
  const scanBatch = new Date().toISOString();
  // Phase timings. The scan runs against a hard 60s Vercel ceiling, and when it
  // blew past it the failure was a bare FUNCTION_INVOCATION_TIMEOUT that said
  // nothing about which phase was slow. Cheap to log, and it turns the next
  // timeout into a diagnosis instead of a guessing game.
  const t0 = Date.now();
  const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  // Step 1: Fetch the feeds. The catch-up run fetches only the ~8 scored feeds:
  // the ~95 ingest-only local feeds are what used the main run's time up, and
  // the catch-up needs every second of its own for scoring.
  const articles = await fetchAllFeeds({ scorableOnly: mode === "catchup" });
  console.log(`[scan:${mode}] fetched ${articles.length} articles @${since()}`);
  if (articles.length === 0) {
    return { scanned: 0, scored: 0, top3: [], mode };
  }

  // Step 2: Store raw news items (upsert to handle dedup)
  //
  // Deduped by URL in memory first: the same article legitimately arrives from
  // both its own outlet feed and the rss.app aggregate, and shipping the
  // duplicate only makes the statement below heavier for no gain.
  const seenUrls = new Set<string>();
  const newsInserts = articles
    .filter((a) => a.link && !seenUrls.has(a.link) && seenUrls.add(a.link))
    .map((a) => ({
      title: a.title,
      source: a.source,
      source_url: a.link,
      published_at: a.pubDate ? new Date(a.pubDate).toISOString() : new Date().toISOString(),
      summary: a.contentSnippet || null,
      scan_batch: scanBatch,
    }));

  // Chunked, because a single upsert of the whole sweep dies: once the dead
  // feeds were revived and the window widened to 72h the payload grew ~5x
  // (~370 rows/day → ~1,800), and Postgres answered `57014: canceling statement
  // due to statement timeout` — which surfaced as a bare "Scan failed" 500 with
  // ZERO rows ingested. Also dropped the trailing `.select()`: it made the
  // statement return every inserted row and the result was never read.
  //
  // One bad chunk must not swallow the rest, and must never pass silently:
  // that exact shape (an atomic chunk killing the upsert) once ate 50 days of
  // data while the run still reported healthy. Failures are counted, logged,
  // and returned — and only a total wipeout throws.
  const UPSERT_CHUNK = 300;
  let ingestFailedChunks = 0;
  let ingestFailedRows = 0;
  let lastIngestError: unknown = null;
  for (let i = 0; i < newsInserts.length; i += UPSERT_CHUNK) {
    const chunk = newsInserts.slice(i, i + UPSERT_CHUNK);
    const { error: insertError } = await supabase
      .from("news_items")
      .upsert(chunk, { onConflict: "source_url", ignoreDuplicates: true });
    if (insertError) {
      ingestFailedChunks++;
      ingestFailedRows += chunk.length;
      lastIngestError = insertError;
      console.error(
        `Error inserting news (chunk ${i}-${i + chunk.length}, ${chunk.length} rows):`,
        insertError
      );
    }
  }
  if (ingestFailedChunks && ingestFailedRows >= newsInserts.length) {
    // Nothing landed at all — that is a genuine failure, not a partial one.
    throw lastIngestError;
  }
  console.log(`[scan] upserted ${newsInserts.length} rows (${ingestFailedChunks} bad chunks) @${since()}`);
  const today = new Date().toISOString().split("T")[0];

  // Step 3: Score with Claude — every SCORABLE item in this feed that has NO
  // score yet. Critically this is NOT limited to the freshly-inserted rows: an
  // article published DURING the day is ingested by a later fetch, and if that
  // scan's scoring was rate-limited/failed (Haiku rate-limits on rapid manual
  // scans), `ignoreDuplicates` turns it into a permanent "duplicate" that no
  // future scan would ever re-score → it stays invisible on the home feed even
  // though it's a whitelisted RE source (מרכז הנדל"ן / מגדילים …). Querying
  // unscored items self-heals that gap. Ingest-only feeds (local/FB) are still
  // never scored (0 tokens).
  const scorableLinks = articles.filter((a) => !a.ingestOnly).map((a) => a.link).filter(Boolean);
  const linkChunks: string[][] = [];
  for (let i = 0; i < scorableLinks.length; i += 50) linkChunks.push(scorableLinks.slice(i, i + 50));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unscored: any[] = [];
  for (const part of linkChunks) {
    const { data } = await supabase
      .from("news_items")
      .select("id, title, summary, source, source_url, published_at, news_scores(score)")
      .in("source_url", part);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of (data || []) as any[]) {
      if (!it.news_scores || it.news_scores.length === 0) unscored.push(it);
    }
  }
  // Relevance first, outlets taking turns, never-real-estate sections skipped.
  // See lib/score-queue for the measurement that made this necessary.
  const { queue, skipped } = orderForScoring(unscored);
  console.log(
    `[scan:${mode}] found ${unscored.length} unscored of ${scorableLinks.length} scorable; ` +
      `${skipped.length} skipped by section, ${queue.length} queued @${since()}`
  );
  // Bound per-run token spend AND per-run WALL TIME; any overflow is caught by
  // the next run (the unscored query above is what makes that safe).
  //
  // The count alone is not enough. `scoreNews` sends 25 items per Claude call
  // and runs 3 calls concurrently, so cost comes in waves of 75 items at ~30s a
  // wave. A flat cap of 100 forces a SECOND wave and the scan then exceeds
  // Vercel's hard 60s limit — which is not a graceful degradation but a
  // FUNCTION_INVOCATION_TIMEOUT that loses the run's scoring entirely. So size
  // the batch to the time actually left after ingest: a slow fetch means fewer
  // items this run, never a blown deadline.
  const SCORE_WAVE = 75;          // 3 concurrent chunks of 25
  const WAVE_MS = 32_000;         // measured ~30s per wave
  const SCAN_BUDGET_MS = 55_000;  // leave headroom under the 60s ceiling
  const leftMs = SCAN_BUDGET_MS - (Date.now() - t0);
  let affordable = leftMs >= WAVE_MS ? SCORE_WAVE : leftMs >= WAVE_MS / 2 ? 25 : 0;
  if (mode === "catchup") {
    // Top the day up to its normal ceiling, no further. 2026-09-14 scored 0 and
    // 09-18 / 09-23 scored 25 because ingest ate the main run's time; this run
    // restores those days to 75 and does nothing on a day that already got 75.
    const { count: scoredToday } = await supabase
      .from("news_scores")
      .select("id", { count: "exact", head: true })
      .eq("scan_date", today);
    const roomToday = Math.max(0, DAILY_SCORE_CAP - (scoredToday || 0));
    affordable = Math.min(affordable, roomToday);
    console.log(`[scan:catchup] ${scoredToday ?? "?"} already scored today, room for ${roomToday}`);
  }
  const toScoreItems = queue.slice(0, affordable);
  if (queue.length > toScoreItems.length) {
    // Say so out loud — a quietly truncated batch reads as "everything scored".
    console.warn(
      `[scan:${mode}] scoring ${toScoreItems.length}/${queue.length} queued (${(leftMs / 1000).toFixed(1)}s left); rest defers to the next run`
    );
  }
  const leftUnscored = queue.length - toScoreItems.length;
  const toScore = toScoreItems.map((n) => ({ title: n.title, summary: n.summary || "", source: n.source }));

  const runStats = { mode, unscoredFound: unscored.length, skipped: skipped.length, leftUnscored };

  if (toScore.length === 0) {
    console.log(
      queue.length === 0
        ? `[scan:${mode}] nothing left to score, skipping Claude API call`
        : `[scan:${mode}] ${queue.length} queued but no room this run, skipping Claude API call`
    );
    const { data: existingTop3 } = await supabase
      .from("news_scores")
      .select("*, news_items(*)")
      .eq("scan_date", today)
      .order("score", { ascending: false })
      .limit(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const top3Mapped: ScoredNews[] = (existingTop3 || []).map((s: any) => ({
      ...s.news_items,
      score: s.score,
      reasoning: s.reasoning,
    }));
    await refreshDailyIndex(today, mode);
    return { scanned: articles.length, scored: 0, top3: top3Mapped, ingestFailedRows, ...runStats };
  }

  let scores;
  try {
    scores = await scoreNews(toScore);
    console.log(`[scan:${mode}] scored ${scores.length} items @${since()}`);
  } catch (err) {
    console.error("Claude scoring failed, storing raw news only:", err);
    return { scanned: articles.length, scored: 0, top3: [], ingestFailedRows, ...runStats };
  }

  // Step 4: Match scores to news items and store
  const scoreInserts = scores
    .map((s) => {
      const newsItem = toScoreItems[s.index];
      if (!newsItem) return null;
      return {
        news_item_id: newsItem.id,
        score: s.score,
        reasoning: s.reasoning,
        scan_date: today,
      };
    })
    .filter(Boolean);

  if (scoreInserts.length > 0) {
    const { error: scoreError } = await supabase
      .from("news_scores")
      .insert(scoreInserts);
    if (scoreError) console.error("Error inserting scores:", scoreError);
  }

  // Step 4b: מד אמון השוק. The tone came back on the same call as the score;
  // keep it only for stories that reach the home feed (same filter), minus our
  // own articles, which are on the feed but do not vote. Never allowed to fail
  // the scan.
  let toned = 0;
  try {
    const toneEntries: ToneEntry[] = [];
    for (const s of scores) {
      const item = toScoreItems[s.index];
      if (!item || s.tone === undefined || s.score < 30) continue;
      if (!isRealEstate(item.title || "", item.summary || "", item.source, s.score)) continue;
      const entry: ToneEntry = { id: item.id, tone: s.tone, score: s.score, title: item.title, url: item.source_url, source: item.source };
      if (isOwnPublication(entry)) continue; // on the feed, but not a vote — see market-tone
      toneEntries.push(entry);
    }
    toned = toneEntries.length;
    if (toned > 0) await recordTone(supabase, today, toneEntries);
    console.log(`[scan:${mode}] toned ${toned} real-estate stories @${since()}`);
  } catch (e) {
    console.error(`[scan:${mode}] market tone step failed (scores are safe):`, e instanceof Error ? e.message : e);
  }
  await refreshDailyIndex(today, mode);

  // Step 5: Return top 3
  const { data: top3 } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .eq("scan_date", today)
    .order("score", { ascending: false })
    .limit(3);

  const top3Mapped: ScoredNews[] = (top3 || []).map((s: any) => ({
    ...s.news_items,
    score: s.score,
    reasoning: s.reasoning,
  }));

  return {
    scanned: articles.length,
    scored: scores.length,
    top3: top3Mapped,
    ingestFailedRows,
    ...runStats,
    // Counted from what actually came back: a failed chunk leaves its items
    // unscored, and this number must say so.
    leftUnscored: queue.length - scores.length,
    toned,
  };
}
