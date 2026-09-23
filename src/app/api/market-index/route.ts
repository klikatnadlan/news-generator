import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { computeMarketTone, toneSentence, trendOf, MIN_STORIES, WINDOW_DAYS } from "@/lib/market-tone";

const DISCLAIMER = "המדד מחושב מהטון של ידיעות הנדל״ן בפיד בשבעת הימים האחרונים. אינו מהווה המלצת השקעה.";

/**
 * GET — מד אמון השוק. Plain arithmetic over stored data; never calls Claude.
 *
 * The number used to be a daily Claude judgement computed on a click, and it
 * was both jumpy (21 → 75 overnight, 2026-06-03/04) and stale (not refreshed
 * 2026-09-05 → 09-23: nobody clicked). Now the morning scoring pass marks each
 * story's tone and this route adds them up — see lib/market-tone for the why.
 *
 * `collecting` is true until the seven-day window holds MIN_STORIES stories; the
 * dashboard then says how many it has instead of inventing a number.
 * `date` is the newest day with data, so "נכון ל-" never claims today when the
 * morning scan has not run yet.
 */
export async function GET() {
  try {
    const supabase = getSupabase();
    const today = new Date().toISOString().split("T")[0];
    const mt = await computeMarketTone(supabase, today);
    const cur = mt.current;
    const brief = (e: typeof cur.topPositive) => (e ? { title: e.title, url: e.url || null, source: e.source || null } : null);
    return NextResponse.json({
      index: cur.index,
      collecting: cur.index === null,
      collected: cur.total,
      minStories: MIN_STORIES,
      counts: { positive: cur.pos, negative: cur.neg, neutral: cur.neu, total: cur.total },
      summary: toneSentence(cur),
      previous: mt.previous.index,
      trend: trendOf(cur.index, mt.previous.index),
      topPositive: brief(cur.topPositive),
      topNegative: brief(cur.topNegative),
      date: mt.latestDay,
      windowStart: mt.windowStart,
      windowDays: WINDOW_DAYS,
      stale: mt.latestDay !== null && mt.latestDay !== today,
      method: "tone",
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    console.error("Market index read error:", error);
    return NextResponse.json({ index: null, collecting: true, error: "שגיאה בקריאת המדד" }, { status: 500 });
  }
}

/**
 * POST — kept only so a dashboard bundle still cached in someone's browser,
 * which calls POST behind the old "חשב מדד להיום" button, gets an answer. It is
 * the same read as GET: the Claude compute that used to live here is gone, the
 * index now refreshes itself every morning.
 */
export async function POST() {
  return GET();
}
