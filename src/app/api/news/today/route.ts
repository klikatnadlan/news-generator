import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .eq("scan_date", today)
    .order("score", { ascending: false })
    .limit(3);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const news = (data || []).map((s: any) => ({
    ...s.news_items,
    score: s.score,
    reasoning: s.reasoning,
    score_id: s.id,
  }));

  // Get last scan time
  const { data: lastScan } = await supabase
    .from("news_items")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    news,
    lastScan: lastScan?.[0]?.fetched_at || null,
  });
}
