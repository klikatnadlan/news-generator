import { fetchAllFeeds } from "./rss";
import { scoreNews } from "./anthropic";
import { supabase } from "./supabase";
import type { ScoredNews } from "./types";

export interface ScanResult {
  scanned: number;
  scored: number;
  top3: ScoredNews[];
}

export async function runScan(): Promise<ScanResult> {
  const scanBatch = new Date().toISOString();

  // Step 1: Fetch all RSS feeds
  const articles = await fetchAllFeeds();
  if (articles.length === 0) {
    return { scanned: 0, scored: 0, top3: [] };
  }

  // Step 2: Store raw news items (upsert to handle dedup)
  const newsInserts = articles.map((a) => ({
    title: a.title,
    source: a.source,
    source_url: a.link,
    published_at: a.pubDate ? new Date(a.pubDate).toISOString() : new Date().toISOString(),
    summary: a.contentSnippet || null,
    scan_batch: scanBatch,
  }));

  const { data: insertedNews, error: insertError } = await supabase
    .from("news_items")
    .upsert(newsInserts, { onConflict: "source_url", ignoreDuplicates: true })
    .select();

  if (insertError) {
    console.error("Error inserting news:", insertError);
    throw insertError;
  }

  void insertedNews; // ingest is committed above; scoring below works off the DB
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
    return { scanned: articles.length, scored: 0, top3: top3Mapped };
  }

  let scores;
  try {
    scores = await scoreNews(toScore);
  } catch (err) {
    console.error("Claude scoring failed, storing raw news only:", err);
    return { scanned: articles.length, scored: 0, top3: [] };
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
  };
}
