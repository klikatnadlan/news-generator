import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/scanner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Morning scoring catch-up, 20 minutes after the main scan.
 *
 * Why: the main scan fetches ~103 feeds and only then scores, all inside one
 * 60-second function. On a slow-ingest morning the scoring got the leftovers:
 * measured 2026-09-23, the 14th scored nothing and the 18th and 23rd scored 25
 * instead of 75 — and whatever is not scored never reaches the home feed.
 *
 * This run re-reads only the 8 scored feeds (seconds, not most of a minute) and
 * spends the time on scoring, in relevance order (lib/score-queue). It stops at
 * the day's normal ceiling of 75, so a short day is topped up and a full day
 * costs nothing extra.
 *
 * CRON_SECRET only, and it fails closed: no manual bypass header, because this
 * route spends tokens.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runScan({ mode: "catchup" });
    // The top-3 payload is for the manual scan button; nobody reads it here.
    const { top3: _top3, ...rest } = result;
    void _top3;
    return NextResponse.json(rest);
  } catch (error) {
    console.error("[scan:catchup] failed:", error);
    return NextResponse.json({ error: "Catch-up scan failed" }, { status: 500 });
  }
}
