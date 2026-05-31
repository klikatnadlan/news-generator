import { NextRequest, NextResponse } from "next/server";
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
  if (lower.includes("ice.co.il")) return "ICE";
  if (lower.includes("nadlancenter.co.il")) return "מרכז הנדל\"ן";
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  if (lower.includes("madlan.co.il")) return "מדלן";
  if (lower.includes("homeless.co.il")) return "הומלס";
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get("timeRange") || "week";
  const sourceFilter = searchParams.get("source") || null;
  const customStart = searchParams.get("startDate") || null;
  const customEnd = searchParams.get("endDate") || null;

  const today = new Date();
  const startDate = new Date(today);

  if (timeRange === "week") {
    startDate.setDate(today.getDate() - 7);
  } else if (timeRange === "month") {
    startDate.setDate(today.getDate() - 30);
  } else if (timeRange === "custom" && customStart) {
    const parsed = new Date(customStart);
    if (!isNaN(parsed.getTime())) {
      startDate.setTime(parsed.getTime());
    }
  }

  const startStr = customStart && timeRange === "custom" ? customStart : startDate.toISOString().split("T")[0];
  const endStr = customEnd && timeRange === "custom" ? customEnd : today.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("news_scores")
    .select("*, news_items(*)")
    .gte("scan_date", startStr)
    .lte("scan_date", endStr)
    .order("score", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const news = (data || []).map((s: any) => {
    const item = s.news_items;
    if (!item) return null;
    const realSource = detectSourceFromUrl(item.source_url) || item.source;
    return {
      ...item,
      source: realSource,
      score: s.score,
      reasoning: s.reasoning,
    };
  }).filter(Boolean);

  // Deduplicate by news item id (same item may appear on multiple scan days)
  const seen = new Set<string>();
  const deduped = news.filter((n: any) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });

  // Filter by source if specified
  const filtered = sourceFilter
    ? deduped.filter((n: any) => n.source === sourceFilter)
    : deduped;

  return NextResponse.json({ news: filtered });
}
