import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── "מעקבים" (topic watches) ───
// GET    → list all active alerts + match count + latest date (one RPC call)
// POST   → create an alert { name, keywords[], emoji }
// DELETE → ?id=<uuid>
// Matching is pure SQL (see migration 004) — zero AI tokens.

// Trend radar (token-free): cur = articles in last 7d, prev = the 7d before.
// 🔥 surging, 📈 rising, 📉 cooling — so you catch a story while it heats up.
// One cached watch as the nightly precompute writes it. The bare cur7d/prev7d
// pair is the older shape and is still read, so a cache row written before
// 2026-09-05 keeps feeding the arrows.
type SnapshotRow = {
  id: string;
  name?: string;
  emoji?: string;
  keywords?: string[];
  match_count?: number;
  latest_published?: string | null;
  cur_7d?: number;
  prev_7d?: number;
  cur7d?: number;
  prev7d?: number;
};

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
  //
  // And the arrows no longer have to be lost either: the daily model-health cron
  // precomputes alert_radar off the user's path and caches it under
  // "alert_trends", so on a day the live call times out we still show yesterday's
  // arrows instead of none. Live first (always current when it works), cache
  // second, no arrows only if both are unavailable.
  //
  // Third rung, added 2026-09-05: alert_overview can time out too — it reads the
  // same table under the same pressure — and then the page showed a bare error.
  // The nightly precompute now stores the FULL row, not just the two counts, so
  // the last resort is the whole list as of last night, stamped with its age.
  // A day-old list beats an empty screen; an unlabelled day-old list does not,
  // hence snapshotAt travels with it.
  let { data, error } = await supabase.rpc("alert_radar");
  let degraded = false;
  let trendSource: "live" | "cache" | "none" = "live";
  let listSource: "live" | "overview" | "snapshot" = "live";
  let snapshotAt: string | null = null;
  const cachedTrends: Record<string, { cur7d: number; prev7d: number }> = {};
  if (error) {
    console.error("alert_radar failed, falling back to alert_overview:", error.message);
    // Read the snapshot once, up front: it serves both as the trend source on
    // the degraded path and as the whole list if alert_overview dies as well.
    let snapRows: SnapshotRow[] = [];
    try {
      const { data: cached } = await supabase
        .from("narrative_cache")
        .select("narratives, created_at")
        .eq("cache_key", "alert_trends")
        .maybeSingle();
      const rows = cached?.narratives as unknown;
      if (Array.isArray(rows)) {
        snapRows = rows as SnapshotRow[];
        snapshotAt = (cached?.created_at as string) ?? null;
        for (const r of snapRows) {
          cachedTrends[r.id] = { cur7d: Number(r.cur7d ?? r.cur_7d) || 0, prev7d: Number(r.prev7d ?? r.prev_7d) || 0 };
        }
      }
    } catch { /* no cache yet — arrows simply stay hidden */ }

    const fb = await supabase.rpc("alert_overview");
    if (fb.error) {
      // Both RPCs are down. Serve last night's snapshot if it has names in it —
      // a trends-only row from before this change has no `name`, and a list of
      // nameless watches is worse than an honest error.
      const usable = snapRows.filter((r) => r && r.name);
      if (usable.length === 0) {
        console.error("alert_overview failed too and no usable snapshot:", fb.error.message);
        return NextResponse.json({ error: fb.error.message }, { status: 500 });
      }
      console.error(`alert_overview failed too — serving snapshot of ${usable.length} watches from ${snapshotAt}`);
      data = usable;
      degraded = true;
      listSource = "snapshot";
      trendSource = "cache";
    } else {
      data = fb.data;
      degraded = true;
      listSource = "overview";
      trendSource = Object.keys(cachedTrends).length ? "cache" : "none";
    }
  }
  const alerts = (data || []).map((a: { id: string; name: string; emoji: string; keywords: string[]; match_count: number; latest_published: string | null; cur_7d: number; prev_7d: number }) => {
    // alert_overview carries no window counts, so on the degraded path fall
    // back to the nightly precomputed pair for this alert.
    const fallbackTrend = cachedTrends[a.id];
    const cur = Number(a.cur_7d ?? fallbackTrend?.cur7d) || 0;
    const prev = Number(a.prev_7d ?? fallbackTrend?.prev7d) || 0;
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
  // Says plainly where the arrows came from, so "no trend" is never mistaken for
  // "nothing is moving": live = computed now, cache = last night's precompute,
  // none = genuinely unavailable.
  return NextResponse.json({
    alerts,
    trendUnavailable: degraded && trendSource === "none",
    trendSource,
    listSource,
    snapshotAt: listSource === "snapshot" ? snapshotAt : null,
  });
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
