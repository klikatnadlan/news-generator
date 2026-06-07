import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { calculateMarketConfidence } from "@/lib/anthropic";

export async function GET() {
  try {
    const supabase = getSupabase();
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    // ─── Token-saving cache ───
    // The index is computed via a Claude call. It only needs computing ONCE per
    // day — serve today's cached value for every later load (was: a Claude call
    // on EVERY dashboard load, which also made it slow and occasionally 500).
    const { data: cachedToday } = await supabase
      .from("market_index_history")
      .select("index_value, trend, summary")
      .eq("date", today)
      .maybeSingle();
    if (cachedToday) {
      const { data: history } = await supabase
        .from("market_index_history")
        .select("index_value, date")
        .order("date", { ascending: false })
        .limit(5);
      const values = history?.map((h: { index_value: number }) => h.index_value) || [cachedToday.index_value];
      const movingAvg = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
      return NextResponse.json({
        index: cachedToday.index_value,
        trend: cachedToday.trend,
        summary: cachedToday.summary,
        date: today,
        movingAvg,
        range: { min: Math.min(...values), max: Math.max(...values) },
        historyDays: values.length,
        cached: true,
        disclaimer: "המדד מבוסס על ניתוח כתבות ונתוני ממשלה. אינו מהווה המלצת השקעה.",
      });
    }

    // Get today's news (or yesterday)
    let { data: scores } = await supabase
      .from("news_scores")
      .select("score, news_items(title, summary)")
      .eq("scan_date", today)
      .order("score", { ascending: false })
      .limit(6);

    if (!scores?.length) {
      const res = await supabase
        .from("news_scores")
        .select("score, news_items(title, summary)")
        .eq("scan_date", yesterday)
        .order("score", { ascending: false })
        .limit(6);
      scores = res.data;
    }

    if (!scores?.length) {
      return NextResponse.json({ index: 50, trend: "stable", summary: "אין מספיק חדשות לחישוב מדד", date: today });
    }

    // Try to get Pulse data
    let pulseData;
    try {
      const PULSE_URL = "https://zkirtoefpwugcyybebed.supabase.co";
      const PULSE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpraXJ0b2VmcHd1Z2N5eWJlYmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTMyNTQsImV4cCI6MjA4NTc4OTI1NH0.Fwwi0HNS4HxQNDCUFmK5XwPRWaaVVSeaqVQIuA66Ems";
      const headers = { apikey: PULSE_KEY, Authorization: `Bearer ${PULSE_KEY}` };

      const [priceRes, mortgageRes] = await Promise.all([
        fetch(`${PULSE_URL}/rest/v1/housing_price_index?select=change_pct&order=date.desc&limit=1`, { headers }),
        fetch(`${PULSE_URL}/rest/v1/mortgage_data?select=avg_rate&order=date.desc&limit=1`, { headers }),
      ]);

      const priceData = await priceRes.json();
      const mortgageData = await mortgageRes.json();

      pulseData = {
        priceIndexChange: priceData?.[0]?.change_pct,
        mortgageRate: mortgageData?.[0]?.avg_rate,
      };
    } catch {
      // Pulse data is optional
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const articles = scores.map((s: any) => ({
      title: (s.news_items as { title: string }).title,
      summary: (s.news_items as { summary: string }).summary || "",
      score: s.score,
    }));

    const result = await calculateMarketConfidence(articles, pulseData);

    // Save to history
    await supabase.from("market_index_history").upsert({
      date: today,
      index_value: result.index,
      trend: result.trend,
      summary: result.summary,
      articles_count: articles.length,
    });

    // Get last 5 days for smoothing
    const { data: history } = await supabase
      .from("market_index_history")
      .select("index_value, date")
      .order("date", { ascending: false })
      .limit(5);

    const values = history?.map((h: { index_value: number }) => h.index_value) || [result.index];
    const movingAvg = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);
    const rangeMin = Math.min(...values);
    const rangeMax = Math.max(...values);

    return NextResponse.json({
      ...result,
      date: today,
      movingAvg,
      range: { min: rangeMin, max: rangeMax },
      historyDays: values.length,
      disclaimer: "המדד מבוסס על ניתוח כתבות ונתוני ממשלה. אינו מהווה המלצת השקעה.",
    });
  } catch (error) {
    console.error("Market index error:", error);
    return NextResponse.json({ index: 50, trend: "stable", summary: "שגיאה בחישוב", date: new Date().toISOString().split("T")[0] }, { status: 500 });
  }
}
