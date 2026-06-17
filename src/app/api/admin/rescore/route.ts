import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scoreNews } from "@/lib/anthropic";

/**
 * Backfill: score every news_item from the last N days that doesn't yet
 * have a row in news_scores. Useful when:
 *   • Previous scans silently failed (e.g. the pre-batching scoring bug)
 *     so news_items exists but news_scores is empty.
 *   • Schema changed and you want to re-rank old items.
 *
 * GET /api/admin/rescore?days=7
 * Auth: Bearer ${CRON_SECRET} OR same-origin header x-manual-scan: true
 * (mirrors /api/cron/scan auth so the existing scan button can call it).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const isManualScan = request.headers.get("x-manual-scan") === "true";
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isManualScan && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(30, parseInt(url.searchParams.get("days") || "7", 10)));

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();
  const today = new Date().toISOString().split("T")[0];

  try {
    // 1) Pull every news_item from the window
    const { data: items, error: itemsErr } = await supabase
      .from("news_items")
      .select("id, title, summary, source, fetched_at")
      .gte("fetched_at", sinceISO)
      .order("fetched_at", { ascending: false })
      .limit(1000);

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ unscored: 0, scored: 0, message: "No items in window" });
    }

    // 2) Keep only RE/economy items — NEVER the ingest-only local מקומונים or
    // Facebook (those stay 0-token and off the home page, like the live
    // scanner's `scorable` filter). Filtering FIRST also keeps the next query's
    // .in() list small (a ~900-id .in() blew the PostgREST URL length → 400).
    const RE_SOURCES = ["גלובס", "כלכליסט", "דה מרקר", "ynet", "מעריב", "וואלה", "ביזפורטל", "קליקת", "ICE", "מגדיל", "מרכז הנדל", "מדלן", "הומלס", "דירה"];
    const isScorable = (s: string) => {
      const src = s || "";
      if (src.startsWith("פייסבוק")) return false;
      return RE_SOURCES.some((r) => src.includes(r));
    };
    const scorable = items.filter((i) => isScorable(i.source));
    if (scorable.length === 0) {
      return NextResponse.json({ unscored: 0, scored: 0, message: "No scorable RE items in window" });
    }

    // 3) Find which of those have NO score yet (any scan_date)
    const itemIds = scorable.map((i) => i.id);
    const { data: existingScores, error: scoresErr } = await supabase
      .from("news_scores")
      .select("news_item_id")
      .in("news_item_id", itemIds);

    if (scoresErr) {
      return NextResponse.json({ error: scoresErr.message }, { status: 500 });
    }

    const scoredIds = new Set((existingScores || []).map((s) => s.news_item_id));
    const unscored = scorable.filter((i) => !scoredIds.has(i.id));

    if (unscored.length === 0) {
      return NextResponse.json({ unscored: 0, scored: 0, message: "All items already scored" });
    }

    // 3) Score them through the (now batched) scoreNews
    const toScore = unscored.map((n) => ({
      title: n.title,
      summary: n.summary || "",
      source: n.source,
    }));

    const scores = await scoreNews(toScore);

    if (scores.length === 0) {
      return NextResponse.json({
        unscored: unscored.length,
        scored: 0,
        warning: "scoreNews returned no results — check Anthropic API logs",
      });
    }

    // 4) Insert into news_scores (use today's scan_date since we don't know
    //    when the items were originally scanned)
    const scoreInserts = scores
      .map((s) => {
        const item = unscored[s.index];
        if (!item) return null;
        return {
          news_item_id: item.id,
          score: s.score,
          reasoning: s.reasoning,
          scan_date: today,
        };
      })
      .filter(Boolean);

    if (scoreInserts.length > 0) {
      const { error: insertErr } = await supabase
        .from("news_scores")
        .insert(scoreInserts);
      if (insertErr) {
        return NextResponse.json({
          unscored: unscored.length,
          scored: scoreInserts.length,
          warning: `Insert failed: ${insertErr.message}`,
        });
      }
    }

    return NextResponse.json({
      unscored: unscored.length,
      scored: scoreInserts.length,
      windowDays: days,
      message: `Backfilled ${scoreInserts.length}/${unscored.length} items`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const maxDuration = 120;
