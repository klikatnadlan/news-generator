import { NextRequest, NextResponse } from "next/server";
import { FB_MUNICIPALITY_PAGES } from "@/lib/fb-pages";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

// Apify ACTOR.RUN.SUCCEEDED webhook target. Fetches the run's dataset and
// inserts the municipality FB posts into news_items as INGEST-ONLY (never
// scored → 0 Claude tokens; searchable in city research / dossier / search).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeDate(v: any): string {
  if (!v) return new Date().toISOString();
  const d = new Date(typeof v === "number" ? v * (v < 1e12 ? 1000 : 1) : v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function POST(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get("secret");
  const cron = process.env.CRON_SECRET;
  if (cron && secret !== cron && secret !== "manual") {
    return NextResponse.json({ error: "bad secret" }, { status: 401 });
  }
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "no token" }, { status: 503 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any = {};
  try { payload = await request.json(); } catch { /* may be empty on test ping */ }
  const datasetId = payload?.resource?.defaultDatasetId || new URL(request.url).searchParams.get("datasetId");
  if (!datasetId) return NextResponse.json({ error: "no datasetId" }, { status: 400 });

  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&token=${token}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = await res.json().catch(() => []);
  if (!Array.isArray(items)) return NextResponse.json({ error: "bad dataset" }, { status: 502 });

  // page url → city
  const pageByUrl = new Map<string, string>();
  for (const p of FB_MUNICIPALITY_PAGES) pageByUrl.set(p.url.replace(/\/+$/, "").toLowerCase(), p.city);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cityFor = (it: any): string => {
    const cands = [it.facebookUrl, it.pageUrl, it.inputUrl, it.pageAdUrl, it.user?.url, it.pageName, it.user?.name].filter(Boolean);
    for (const c of cands) {
      const norm = String(c).replace(/\/+$/, "").toLowerCase();
      for (const [u, city] of pageByUrl) if (norm.includes(u) || u.includes(norm)) return city;
    }
    return it.pageName || it.user?.name || "עירייה";
  };

  const rows = [];
  for (const it of items) {
    const text = String(it.text || it.message || it.postText || it.content || "").trim();
    const url = it.url || it.postUrl || it.permalink || it.link || it.topLevelUrl;
    if (!text || !url) continue;
    const city = cityFor(it);
    const title = (text.split("\n")[0] || text).slice(0, 140);
    rows.push({
      title,
      source: `פייסבוק · ${city}`,
      source_url: String(url),
      summary: text.slice(0, 1500),
      published_at: safeDate(it.time || it.timestamp || it.date || it.publishedTime),
      scan_batch: `fb-${new Date().toISOString().slice(0, 10)}`,
    });
  }
  if (rows.length === 0) return NextResponse.json({ inserted: 0, received: items.length });

  const { data, error } = await supabase
    .from("news_items")
    .upsert(rows, { onConflict: "source_url", ignoreDuplicates: true })
    .select("id");
  if (error) return NextResponse.json({ error: error.message, received: items.length }, { status: 500 });
  return NextResponse.json({ inserted: (data || []).length, received: items.length });
}

// Apify pings the webhook URL with a GET test on creation — answer 200.
export async function GET() {
  return NextResponse.json({ ok: true });
}
