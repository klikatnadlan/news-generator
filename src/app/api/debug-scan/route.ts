import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scoreNews } from "@/lib/anthropic";

export const maxDuration = 60;

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const todayStart = `${today}T00:00:00`;
  const log: string[] = [];

  // 1. Count all today items
  const { data: allItems } = await supabase
    .from("news_items")
    .select("id, title, source")
    .gte("fetched_at", todayStart);
  log.push(`Total items today: ${allItems?.length || 0}`);

  // 2. Count scored
  const { data: scored } = await supabase
    .from("news_scores")
    .select("news_item_id")
    .eq("scan_date", today);
  const scoredIds = new Set((scored || []).map((s: any) => s.news_item_id));
  log.push(`Already scored: ${scoredIds.size}`);

  // 3. Find unscored
  const unscored = (allItems || []).filter((n: any) => !scoredIds.has(n.id));
  log.push(`Unscored: ${unscored.length}`);

  // 4. Try scoring 5 items
  const testBatch = unscored.slice(0, 5);
  log.push(`Test batch: ${testBatch.length} items`);
  log.push(`Titles: ${testBatch.map((n: any) => n.title?.slice(0, 40)).join(' | ')}`);

  if (testBatch.length > 0) {
    try {
      const toScore = testBatch.map((n: any) => ({
        title: n.title,
        summary: "",
        source: n.source,
      }));
      const scores = await scoreNews(toScore);
      log.push(`Claude returned: ${scores.length} scores`);
      log.push(`Scores: ${JSON.stringify(scores)}`);

      // Try inserting
      for (const s of scores) {
        const item = testBatch[s.index];
        if (item) {
          const { error } = await supabase.from("news_scores").insert({
            news_item_id: item.id,
            score: s.score,
            reasoning: s.reasoning,
            scan_date: today,
          });
          log.push(`Insert ${item.id}: ${error ? `ERROR: ${error.message}` : 'OK'}`);
        }
      }
    } catch (err: any) {
      log.push(`SCORING ERROR: ${err.message}`);
    }
  }

  return NextResponse.json({ log });
}
