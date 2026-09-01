import { NextRequest, NextResponse } from "next/server";
import { SUGGESTED_QUESTIONS } from "@/lib/ask-questions";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Pre-warm the slow, cached, AI-backed views before a live demo.
 *
 * Why this is a manual endpoint and not a cron: the standing rule here is that
 * Claude runs only on an explicit click. These calls each cost roughly 9-11
 * agorot and their results are cached, so the first person to open the page pays
 * the full latency — measured 2026-08-25: /api/narratives 37.9s cold, 1.3s warm;
 * the city briefing ~40s cold, ~1.5s warm. Hitting this once before Ben walks in
 * moves that wait off the demo and costs nothing on the days nobody calls it.
 *
 *   /api/warm            → narratives only
 *   /api/warm?city=אשקלון → narratives + that city's briefing and research
 *
 * Everything it calls is already cached downstream, so calling it twice in a row
 * costs nothing the second time.
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const city = sp.get("city") || "";
  const topics = sp.get("topics") || "אלימות|חינוך|מחירים|תעסוקה";
  const base = new URL(request.url).origin;

  const targets: { label: string; url: string }[] = [
    { label: "narratives", url: `${base}/api/narratives` },
  ];
  if (city) {
    targets.push({ label: `dossier:${city}`, url: `${base}/api/cities/dossier?city=${encodeURIComponent(city)}` });
    targets.push({ label: `research:${city}`, url: `${base}/api/cities/research?city=${encodeURIComponent(city)}&topics=${encodeURIComponent(topics)}` });
  }

  // The ask box's demo script. Each of these costs 5-10 agorot once and is then
  // cached for six hours, so the chips answer instantly in front of a client.
  // Opt-in via ?ask=1 — the standing rule is that Claude runs on a click, and
  // this endpoint IS the click.
  if (sp.get("ask") === "1") {
    for (const q of SUGGESTED_QUESTIONS) {
      targets.push({ label: `ask:${q.slice(0, 24)}`, url: `${base}/api/ask?q=${encodeURIComponent(q)}` });
    }
  }

  // Sequential on purpose: these are the heavy endpoints, and firing them at
  // once is the exact pattern that has already made Postgres cancel queries here
  // more than once today.
  //
  // And BOUNDED by the clock. This route's own ceiling is 60s, while a cold ask
  // question takes 25-35s — so `?ask=1` over six questions needs ~3 minutes and
  // would simply be killed, silently warming two of them and reporting nothing.
  // Instead it warms what it can and SAYS what it skipped, so "run it again"
  // is a visible instruction rather than something you discover mid-demo.
  const WARM_BUDGET_MS = 50_000;
  const t0 = Date.now();
  const results: { label: string; ok: boolean; seconds: number; detail?: string }[] = [];
  const skipped: string[] = [];
  for (const t of targets) {
    // A target needs real headroom; starting one with 8s left just gets it cut.
    if (Date.now() - t0 > WARM_BUDGET_MS) { skipped.push(t.label); continue; }
    const started = Date.now();
    try {
      const r = await fetch(t.url, { cache: "no-store" });
      // DRAIN THE BODY. fetch() resolves the moment the response headers land,
      // and /api/ask is a stream — so without this a warm "succeeded" in 0.7s
      // while the answer was still being written, and whether it reached the
      // cache came down to whether the function survived long enough. Measured
      // 2026-09-01 in production: of six questions reported warm, one was
      // cached and the next took 40s. Reading the body makes the reported
      // duration the real one and "warmed" mean warmed.
      await r.text();
      results.push({
        label: t.label,
        ok: r.ok,
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        detail: r.ok ? undefined : `HTTP ${r.status}`,
      });
    } catch (e) {
      results.push({
        label: t.label,
        ok: false,
        seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
        detail: e instanceof Error ? e.message.slice(0, 120) : "failed",
      });
    }
  }

  const allOk = results.every((r) => r.ok) && skipped.length === 0;
  return NextResponse.json(
    {
      ok: allOk,
      warmed: results,
      skipped,
      hint: skipped.length
        ? `נגמר הזמן אחרי ${results.length} — הרץ שוב את אותה כתובת כדי לחמם את ה-${skipped.length} שנותרו (מה שכבר חומם לא יעלה שוב).`
        : city
          ? "מוכן. פתח את העמוד — התשובות כבר בקאש."
          : "מוכן. להוסיף עיר: /api/warm?city=אשקלון · לחמם את תיבת השאלה: /api/warm?ask=1",
    },
    { status: allOk ? 200 : 207 }
  );
}
