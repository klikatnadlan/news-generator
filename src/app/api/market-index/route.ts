import { NextResponse } from "next/server";
import { getPulseFacts } from "@/lib/pulse";
import { getSupabase } from "@/lib/supabase";
import { calculateMarketConfidence } from "@/lib/anthropic";

const DISCLAIMER = "המדד מבוסס על ניתוח באזים ונתוני ממשלה. אינו מהווה המלצת השקעה.";

/**
 * GET — read only. Serves today's cached index, or the most recent one marked
 * as stale. It NEVER calls Claude.
 *
 * The dashboard fetches this on every load, and the owner's rule is that AI
 * runs only on an explicit click. Before this split the compute lived here:
 * measured 2026-09-03, the first visitor of the day waited 19.7s on a blank
 * screen while a Sonnet call ran on page load, and every day's first load paid
 * for it. Computing is now POST, wired to a button that appears only when
 * today's value is missing. One DB round-trip, no dependency between reads.
 */
export async function GET() {
  try {
    const supabase = getSupabase();
    const today = new Date().toISOString().split("T")[0];
    const { data: history } = await supabase
      .from("market_index_history")
      .select("index_value, trend, summary, date")
      .order("date", { ascending: false })
      .limit(5);
    const rows = (history || []) as { index_value: number; trend: string; summary: string; date: string }[];
    if (rows.length === 0) {
      return NextResponse.json({ index: null, needsCompute: true, date: today, disclaimer: DISCLAIMER });
    }
    const latest = rows[0];
    const values = rows.map((h) => h.index_value);
    const movingAvg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const stale = latest.date !== today;
    return NextResponse.json({
      index: latest.index_value,
      trend: latest.trend,
      summary: latest.summary,
      // The date the number belongs to, not today's — a reader must be able to
      // tell "computed this morning" from "last computed on Tuesday".
      date: latest.date,
      stale,
      needsCompute: stale,
      movingAvg,
      range: { min: Math.min(...values), max: Math.max(...values) },
      historyDays: values.length,
      cached: true,
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    console.error("Market index read error:", error);
    return NextResponse.json({ index: null, needsCompute: true, error: "שגיאה בקריאת המדד" }, { status: 500 });
  }
}

/**
 * POST — compute today's index with Claude and store it. Click-only: the
 * dashboard's "חשב מדד להיום" button is the sole caller. Idempotent: if today's
 * value already exists it is returned without a new model call.
 */
export async function POST() {
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
        disclaimer: "המדד מבוסס על ניתוח באזים ונתוני ממשלה. אינו מהווה המלצת השקעה.",
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

    // Official figures. This used to query `change_pct` and `avg_rate` ordered by
    // a `date` column — none of those three exist, so both calls answered HTTP
    // 400, the catch swallowed it, and the index was computed without any market
    // data for months. lib/pulse.ts owns the real column names now.
    let pulseData;
    try {
      const facts = await getPulseFacts();
      pulseData = {
        priceIndexChange: facts.priceIndex?.annualChange ?? undefined,
        priceIndexAsOf: facts.priceIndex?.period.label,
        mortgageRate: facts.mortgage?.avgRate,
        mortgageAsOf: facts.mortgage?.period.label,
      };
    } catch (e) {
      console.error("[market-index] pulse facts failed:", e instanceof Error ? e.message : e);
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
      disclaimer: "המדד מבוסס על ניתוח באזים ונתוני ממשלה. אינו מהווה המלצת השקעה.",
    });
  } catch (error) {
    console.error("Market index error:", error);
    return NextResponse.json({ index: 50, trend: "stable", summary: "שגיאה בחישוב", date: new Date().toISOString().split("T")[0] }, { status: 500 });
  }
}
