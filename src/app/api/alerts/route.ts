import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── "מעקבים" (topic watches) ───
// GET    → list all active alerts + match count + latest date (one RPC call)
// POST   → create an alert { name, keywords[], emoji }
// DELETE → ?id=<uuid>
// Matching is pure SQL (see migration 004) — zero AI tokens.

// Trend radar (token-free): cur = articles in last 7d, prev = the 7d before.
// 🔥 surging, 📈 rising, 📉 cooling — so you catch a story while it heats up.
function trendOf(cur: number, prev: number): "surge" | "rising" | "cooling" | "" {
  if (cur >= 4 && cur >= 2 * Math.max(prev, 1)) return "surge";
  if (cur > prev && cur >= 2) return "rising";
  if (cur < prev && prev >= 2) return "cooling";
  return "";
}

export async function GET() {
  // alert_radar() = alert_overview + this-week / prior-week counts, one scan
  // per alert. Pure SQL, zero AI tokens.
  //
  // It no longer always fits: with 64 saved watches it runs 128 extra windowed
  // scans over a news_items table that grows ~400 rows/day, and Postgres now
  // answers `57014 canceling statement due to statement timeout` (measured
  // 2026-08-25, ~4s). That 500 took the whole מעקבים page down — no list, no
  // counts, nothing — because a trend BADGE could not be computed.
  //
  // So: degrade instead of collapse. alert_overview() is the same list without
  // the two window counts, is backed by the trigram index, and answers in ~2.3s.
  // Losing the 🔥/📈/📉 arrow is survivable; losing the page is not.
  // Proper fix is DB-side (bound the window inside alert_radar, or precompute)
  // and needs SQL access this app does not have with the anon key.
  let { data, error } = await supabase.rpc("alert_radar");
  let degraded = false;
  if (error) {
    console.error("alert_radar failed, falling back to alert_overview:", error.message);
    const fb = await supabase.rpc("alert_overview");
    if (fb.error) {
      return NextResponse.json({ error: fb.error.message }, { status: 500 });
    }
    data = fb.data;
    degraded = true;
  }
  const alerts = (data || []).map((a: { id: string; name: string; emoji: string; keywords: string[]; match_count: number; latest_published: string | null; cur_7d: number; prev_7d: number }) => {
    const cur = Number(a.cur_7d) || 0;
    const prev = Number(a.prev_7d) || 0;
    return {
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      keywords: a.keywords,
      matchCount: Number(a.match_count) || 0,
      latestDate: a.latest_published,
      cur7d: cur,
      prev7d: prev,
      trend: trendOf(cur, prev),
    };
  });
  // `degraded` lets the UI (and a human reading the JSON) see that the trend
  // arrows are absent by design right now, rather than reading "no trend" as
  // "nothing is moving".
  return NextResponse.json({ alerts, trendUnavailable: degraded });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = (body.name || "").trim();
  const emoji = (body.emoji || "🔔").trim() || "🔔";
  const keywords = Array.isArray(body.keywords)
    ? body.keywords.map((k: string) => String(k).trim()).filter(Boolean)
    : [];

  if (!name || keywords.length === 0) {
    return NextResponse.json({ error: "צריך שם ולפחות מילת מפתח אחת" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("topic_alerts")
    .insert({ name, keywords, emoji })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ alert: data });
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const { error } = await supabase.from("topic_alerts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
