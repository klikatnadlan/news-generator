import { NextRequest, NextResponse } from "next/server";
import { FB_MUNICIPALITY_PAGES } from "@/lib/fb-pages";
import { supabase } from "@/lib/supabase";

export const maxDuration = 30;

// Triggers the Apify "Facebook Posts Scraper" (async) for all Galilee
// municipality pages, INCREMENTALLY (only posts newer than the last run, to stay
// inside Apify's free $5/mo credit). Apify pushes the result to /api/fb-ingest
// via a webhook, which inserts the posts as INGEST-ONLY (0 Claude tokens).
const ACTOR = "apify~facebook-posts-scraper";

export async function GET(request: NextRequest) {
  const isManual = request.headers.get("x-manual-scan") === "true";
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && !isManual && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "missing APIFY_TOKEN", hint: "צור חשבון Apify חינמי (ללא כרטיס אשראי) → Settings → Integrations → API token, והוסף APIFY_TOKEN ל-env." },
      { status: 503 }
    );
  }

  // Incremental window: only posts newer than the last successful run (default 3d).
  let since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  try {
    const { data } = await supabase.from("narrative_cache").select("narratives").eq("cache_key", "fb_last_scan").maybeSingle();
    if (data?.narratives?.date) since = data.narratives.date;
  } catch { /* default window */ }

  // Cost ≈ pages × resultsLimit × $2/1000 (the actor pulls resultsLimit posts
  // per page every run, regardless of how many are new). 49 × 8 ≈ $0.78/run;
  // run WEEKLY (see vercel.json) → ~$3.4/mo, inside the free $5 credit. 8/page
  // so a busy week isn't truncated between weekly runs.
  const input = {
    startUrls: FB_MUNICIPALITY_PAGES.map((p) => ({ url: p.url })),
    resultsLimit: 8,
    onlyPostsNewerThan: since,
  };

  const origin = new URL(request.url).origin;
  const webhook = [{
    eventTypes: ["ACTOR.RUN.SUCCEEDED"],
    requestUrl: `${origin}/api/fb-ingest?secret=${encodeURIComponent(secret || "manual")}`,
  }];
  const webhooksParam = Buffer.from(JSON.stringify(webhook)).toString("base64");
  const runUrl = `https://api.apify.com/v2/acts/${ACTOR}/runs?token=${token}&webhooks=${webhooksParam}`;

  try {
    const res = await fetch(runUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await res.json();
    if (!res.ok) return NextResponse.json({ error: "apify run failed", detail: body }, { status: 502 });
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("narrative_cache").upsert(
      { cache_key: "fb_last_scan", narratives: { date: today }, count: FB_MUNICIPALITY_PAGES.length, created_at: new Date().toISOString() },
      { onConflict: "cache_key" }
    );
    return NextResponse.json({ triggered: true, runId: body?.data?.id || null, pages: FB_MUNICIPALITY_PAGES.length, since });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
