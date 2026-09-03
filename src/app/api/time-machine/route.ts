import { NextRequest, NextResponse } from "next/server";
import { getPriceIndexAt } from "@/lib/pulse";
import { getSupabase } from "@/lib/supabase";

// Compare market state now vs X days ago
export async function GET(request: NextRequest) {
  const daysBack = parseInt(request.nextUrl.searchParams.get("days") || "90", 10);
  const supabase = getSupabase();

  const today = new Date().toISOString().split("T")[0];
  const pastDate = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];

  // Get current market index
  const { data: currentIndex } = await supabase
    .from("market_index_history")
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  // Get past market index (closest to target date)
  const { data: pastIndex } = await supabase
    .from("market_index_history")
    .select("*")
    .lte("date", pastDate)
    .order("date", { ascending: false })
    .limit(1)
    .single();

  // Get news count comparison
  const { count: currentNewsCount } = await supabase
    .from("news_items")
    .select("*", { count: "exact", head: true })
    .gte("fetched_at", new Date(Date.now() - 7 * 86400000).toISOString());

  const { count: pastNewsCount } = await supabase
    .from("news_items")
    .select("*", { count: "exact", head: true })
    .gte("fetched_at", new Date(Date.now() - (daysBack + 7) * 86400000).toISOString())
    .lte("fetched_at", new Date(Date.now() - daysBack * 86400000).toISOString());

  // Official price index, then and now.
  //
  // Was two queries against a `date` column that does not exist (the table keys
  // on year+month integers), plus a malformed `lte.date=` filter. Both answered
  // 400, the catch swallowed it, and this comparison never once appeared.
  let pulseComparison;
  try {
    const past = new Date(pastDate);
    const [now, then] = await Promise.all([
      getPriceIndexAt(),
      getPriceIndexAt(past.getFullYear(), past.getMonth() + 1),
    ]);
    if (now && then && then.value) {
      pulseComparison = {
        currentPriceIndex: now.value,
        currentAsOf: now.label,
        pastPriceIndex: then.value,
        pastAsOf: then.label,
        priceChange: (((now.value - then.value) / then.value) * 100).toFixed(1),
      };
    }
  } catch { /* optional */ }

  const hasEnoughData = !!currentIndex && !!pastIndex;

  return NextResponse.json({
    daysBack,
    today,
    pastDate,
    hasEnoughData,
    current: currentIndex ? {
      index: currentIndex.index_value,
      trend: currentIndex.trend,
      summary: currentIndex.summary,
      date: currentIndex.date,
    } : null,
    past: pastIndex ? {
      index: pastIndex.index_value,
      trend: pastIndex.trend,
      summary: pastIndex.summary,
      date: pastIndex.date,
    } : null,
    indexChange: currentIndex && pastIndex ? currentIndex.index_value - pastIndex.index_value : null,
    newsCount: { current: currentNewsCount || 0, past: pastNewsCount || 0 },
    pulse: pulseComparison || null,
    message: !hasEnoughData
      ? `צריך ${daysBack} ימי נתונים. המערכת אוספת נתונים כל יום — חזור בעוד ${daysBack - (currentIndex ? 1 : 0)} ימים.`
      : `לפני ${daysBack} יום המדד היה ${pastIndex!.index_value}. היום הוא ${currentIndex!.index_value}. ${currentIndex!.index_value > pastIndex!.index_value ? "עלייה" : currentIndex!.index_value < pastIndex!.index_value ? "ירידה" : "יציב"}.`,
  });
}
