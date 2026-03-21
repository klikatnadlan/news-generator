import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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
  if (lower.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  if (lower.includes("madlan.co.il")) return "מדלן";
  if (lower.includes("homeless.co.il")) return "הומלס";
  if (lower.includes("dira.co.il")) return "דירה";
  return null;
}

/** Get the start of the current Hebrew week (Sunday) */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sunday
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  return start.toISOString().split("T")[0];
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = getWeekStart();

  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .gte("scan_date", weekStart)
    .lte("scan_date", today)
    .gte("score", 30)
    .order("score", { ascending: false })
    .limit(200);

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
      scan_date: s.scan_date,
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
    weekStart,
    today,
  });
}
