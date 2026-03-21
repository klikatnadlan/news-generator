import { NextRequest, NextResponse } from "next/server";
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

  // Try to get Pulse historical data
  let pulseComparison;
  try {
    const PULSE_URL = "https://zkirtoefpwugcyybebed.supabase.co";
    const PULSE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpraXJ0b2VmcHd1Z2N5eWJlYmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTMyNTQsImV4cCI6MjA4NTc4OTI1NH0.Fwwi0HNS4HxQNDCUFmK5XwPRWaaVVSeaqVQIuA66Ems";
    const headers = { apikey: PULSE_KEY, Authorization: `Bearer ${PULSE_KEY}` };

    const [currentPrice, pastPrice] = await Promise.all([
      fetch(`${PULSE_URL}/rest/v1/housing_price_index?select=*&order=date.desc&limit=1`, { headers }).then(r => r.json()),
      fetch(`${PULSE_URL}/rest/v1/housing_price_index?select=*&lte.date=${pastDate}&order=date.desc&limit=1`, { headers }).then(r => r.json()),
    ]);

    if (currentPrice?.[0] && pastPrice?.[0]) {
      pulseComparison = {
        currentPriceIndex: currentPrice[0].index_value,
        pastPriceIndex: pastPrice[0].index_value,
        priceChange: currentPrice[0].index_value && pastPrice[0].index_value
          ? ((currentPrice[0].index_value - pastPrice[0].index_value) / pastPrice[0].index_value * 100).toFixed(1)
          : null,
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
