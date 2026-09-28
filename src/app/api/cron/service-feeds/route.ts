import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/scanner";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily collection of the local papers that block our server (05:10 UTC).
 *
 * Measured 2026-09-23: 13 local papers answer 403 (or time out) to our server
 * while serving an Israeli connection normally — Haifa, Kfar Saba, Herzliya,
 * Raanana, Rehovot, Hadera and more, gone from the city pages. The paid
 * collection service reaches them (tested on two, 2026-09-24: fresh items from
 * both). Ori approved it on 2026-09-28 at one credit per paper per day.
 *
 * Its own run, not part of the 04:00 scan, so 13 paid fetches can never eat the
 * seconds the scan needs for scoring. Ingest-only: nothing here is scored.
 * Stands down by itself when the shared service account runs low (see
 * SERVICE_CREDIT_FLOOR in lib/rss).
 *
 * CRON_SECRET only, fails closed: this route spends credits.
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
    const { top3: _top3, ...rest } = await runScan({ mode: "service" });
    void _top3;
    return NextResponse.json(rest);
  } catch (error) {
    console.error("[scan:service] failed:", error);
    return NextResponse.json({ error: "Service feeds run failed" }, { status: 500 });
  }
}
