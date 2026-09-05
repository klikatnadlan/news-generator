import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Keep-warm ping. ZERO AI.
 *
 * Why: Vercel functions go cold after idle. Measured 2026-09-03: after an
 * idle hour /api/news/today took 66s (the same call is 0.7s warm), and the
 * home page — whose first paint depends on it — rendered its empty state:
 * "השרת ער. רק חדשות עוד לא הגיעו", three "—" stat cards and a mock digest,
 * while 8 items existed. That is exactly the state a client meets when they
 * open a link Ben sent an hour ago.
 *
 * What it touches: only routes that are pure SQL reads. Verified by reading
 * them — /api/news/week, /api/news/today and GET /api/market-index (which is
 * cache-only since the compute moved to POST) contain no Anthropic call. The
 * owner's rule that Claude runs only on a click is untouched.
 *
 * Cost: a few HTTP requests every five minutes. Nothing else.
 */
const TARGETS = ["/api/news/week", "/api/news/today", "/api/market-index"];

export async function GET(request: NextRequest) {
  // No x-manual-scan bypass here, deliberately.
  //
  // The other cron routes accept that header so a human can trigger a scan. On
  // THIS route it would be an open, unauthenticated way to make the server issue
  // three more requests to itself — a 3x invocation amplifier anyone could point
  // at us, on a plan where invocations cost money. The bypass existed only so I
  // could test the route by hand; it was tested (200, three targets warmed,
  // 2026-09-05) and is now closed. Verification from here on is the schedule
  // itself: if the cron fires, the routes stay warm.
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = new URL(request.url).origin;
  const results = await Promise.all(
    TARGETS.map(async (path) => {
      const started = Date.now();
      try {
        const r = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
        // Drain the body so the function actually finishes its work.
        await r.text();
        return { path, ok: r.ok, status: r.status, ms: Date.now() - started };
      } catch (e) {
        return { path, ok: false, status: 0, ms: Date.now() - started, error: e instanceof Error ? e.message.slice(0, 80) : "failed" };
      }
    }),
  );
  return NextResponse.json({ ok: results.every((r) => r.ok), warmed: results });
}
