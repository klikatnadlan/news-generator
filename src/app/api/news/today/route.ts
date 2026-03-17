import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Detect real source from article URL (mirrors rss.ts logic)
function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("israelhayom.co.il")) return "ישראל היום";
  if (lower.includes("news1.co.il")) return "News1";
  if (lower.includes("ice.co.il")) return "ICE";
  if (lower.includes("kan.org.il")) return "כאן";
  return null;
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .eq("scan_date", today)
    .order("score", { ascending: false })
    .limit(6);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const news = (data || []).map((s: any) => {
    const item = s.news_items;
    const realSource = detectSourceFromUrl(item.source_url) || item.source;
    return {
      ...item,
      source: realSource,
      score: s.score,
      reasoning: s.reasoning,
      score_id: s.id,
    };
  });

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
