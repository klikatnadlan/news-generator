import { fetchAllFeeds } from "./rss";
import { scoreNews } from "./anthropic";
import { supabase } from "./supabase";
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
}

export async function runScan(): Promise<ScanResult> {
  const scanBatch = new Date().toISOString();

  // Step 1: Fetch all RSS feeds
  const articles = await fetchAllFeeds();
  if (articles.length === 0) {
    return { scanned: 0, scored: 0, top3: [] };
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
      .select("id, title, summary, source, source_url, news_scores(score)")
      .in("source_url", part);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of (data || []) as any[]) {
      if (!it.news_scores || it.news_scores.length === 0) unscored.push(it);
    }
  }
  // Bound per-run token spend; any overflow is caught by the next run.
  const toScoreItems = unscored.slice(0, 100);
  const toScore = toScoreItems.map((n) => ({ title: n.title, summary: n.summary || "", source: n.source }));

  if (toScore.length === 0) {
    console.log("No unscored articles to score, skipping Claude API call");
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
    return { scanned: articles.length, scored: 0, top3: top3Mapped, ingestFailedRows };
  }

  let scores;
  try {
    scores = await scoreNews(toScore);
  } catch (err) {
    console.error("Claude scoring failed, storing raw news only:", err);
    return { scanned: articles.length, scored: 0, top3: [], ingestFailedRows };
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
  };
}
