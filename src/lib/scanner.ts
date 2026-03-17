import { fetchAllFeeds } from "./rss";
import { scoreNews } from "./anthropic";
import { supabase } from "./supabase";
import type { ScoredNews } from "./types";

export interface ScanResult {
  scanned: number;
  scored: number;
  topNews: ScoredNews[];
}

export async function runScan(): Promise<ScanResult> {
  const scanBatch = new Date().toISOString();

  // Step 1: Fetch all RSS feeds
  const articles = await fetchAllFeeds();
  if (articles.length === 0) {
    return { scanned: 0, scored: 0, topNews: [] };
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

  // Step 3: Score with Claude
  const toScore = (insertedNews || []).map((n) => ({
    title: n.title,
    summary: n.summary || "",
    source: n.source,
  }));

  let scores;
  try {
    scores = await scoreNews(toScore);
  } catch (err) {
    console.error("Claude scoring failed, storing raw news only:", err);
    return { scanned: articles.length, scored: 0, topNews: [] };
  }

  // Step 4: Match scores to news items and store
  const today = new Date().toISOString().split("T")[0];
  const scoreInserts = scores
    .map((s) => {
      const newsItem = (insertedNews || [])[s.index];
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

  // Step 5: Return top 6
  const { data: top3 } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .eq("scan_date", today)
    .order("score", { ascending: false })
    .limit(6);

  const topMapped: ScoredNews[] = (top3 || []).map((s: any) => ({
    ...s.news_items,
    score: s.score,
    reasoning: s.reasoning,
  }));

  return {
    scanned: articles.length,
    scored: scores.length,
    topNews: topMapped,
  };
}
