import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// "🆕 חדש במעקבים" — fresh articles per watch, last N days. Token-free.

function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("israelhayom.co.il")) return "ישראל היום";
  if (lower.includes("ice.co.il")) return "ICE";
  if (lower.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  if (lower.includes("madlan.co.il")) return "מדלן";
  return null;
}

const clean = (s: string) => (s || "").replace(/<[^>]*>/g, "").trim();

export async function GET(request: NextRequest) {
  const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("days") || "3", 10) || 3, 1), 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase.rpc("new_alert_hits", { p_since: since });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[];
  const map = new Map<string, { alertName: string; emoji: string; total: number; seen: Set<string>; items: { title: string; summary: string; source: string; url: string; date: string | null }[] }>();

  for (const r of rows) {
    if (!map.has(r.alert_id)) {
      map.set(r.alert_id, { alertName: r.alert_name, emoji: r.emoji, total: 0, seen: new Set(), items: [] });
    }
    const g = map.get(r.alert_id)!;
    const key = clean(r.title).slice(0, 90);
    if (g.seen.has(key)) continue; // de-dup same article within a watch
    g.seen.add(key);
    g.total += 1;
    if (g.items.length < 5) {
      g.items.push({
        title: clean(r.title),
        summary: clean(r.summary),
        source: detectSourceFromUrl(r.source_url) || r.source || "",
        url: r.source_url || "",
        date: r.published_at,
      });
    }
  }

  const groups = Array.from(map.values())
    .map((g) => ({ alertName: g.alertName, emoji: g.emoji, total: g.total, items: g.items }))
    .sort((a, b) => b.total - a.total);

  const totalNew = groups.reduce((s, g) => s + g.total, 0);

  return NextResponse.json({ groups, totalNew, days });
}
