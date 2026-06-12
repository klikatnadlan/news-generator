import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { findCity, RESEARCH_TOPIC_KEYWORDS } from "@/lib/cities";

export const maxDuration = 30;

// "בצע מחקר" — compose a multi-dimensional study of a city/area. Runs one
// search per chosen topic (city + topic), grouped. ALL token-free (pure SQL).

function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const l = url.toLowerCase();
  if (l.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
  if (l.includes("globes.co.il")) return "גלובס";
  if (l.includes("calcalist.co.il")) return "כלכליסט";
  if (l.includes("themarker.com")) return "דה מרקר";
  if (l.includes("ynet.co.il")) return "ynet";
  if (l.includes("maariv.co.il")) return "מעריב";
  if (l.includes("bizportal.co.il")) return "ביזפורטל";
  if (l.includes("walla.co.il")) return "וואלה";
  if (l.includes("ice.co.il")) return "ICE";
  if (l.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (l.includes("magdilim.co.il")) return "מגדילים";
  return null;
}
const clean = (s: string) => (s || "").replace(/<[^>]*>/g, "").trim();

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const cityName = sp.get("city") || "";
  const topicsRaw = sp.get("topics") || "";
  const city = findCity(cityName);
  if (!city) return NextResponse.json({ error: "עיר לא נמצאה" }, { status: 404 });

  const from = sp.get("from") || null;
  const to = sp.get("to") || null;
  const topics = topicsRaw.split("|").map((t) => t.trim()).filter(Boolean).slice(0, 14);
  if (topics.length === 0) return NextResponse.json({ results: [], totalHits: 0 });

  const results = await Promise.all(
    topics.map(async (topic) => {
      try {
        // Curated keywords (OR) when we know the cube; custom cubes fall back
        // to the literal term. Title-hits rank first (relevance).
        const keywords = RESEARCH_TOPIC_KEYWORDS[topic] || [topic];
        // p_limit 30 — the header count must match the visible list (Ben: "11
        // באזים" showed only 5). Numbered 1..N in the UI.
        const { data } = await supabase.rpc("city_news", { p_city: city.name, p_aliases: city.aliases || [], p_strict: !!city.commonWord, p_chip: "", p_chip_any: keywords, p_from: from, p_to: to, p_limit: 30, p_offset: 0 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows = (data || []) as any[];
        const count = rows.length ? Number(rows[0].total) || 0 : 0;
        const items = rows.map((r) => ({
          id: r.id,
          title: clean(r.title),
          summary: clean(r.summary),
          source: detectSourceFromUrl(r.source_url) || r.source || "",
          url: r.source_url || "",
          date: (r.published_at || r.fetched_at || "")?.slice?.(0, 10) || null,
        }));
        return { topic, count, items };
      } catch {
        return { topic, count: 0, items: [] };
      }
    })
  );

  const totalHits = results.reduce((s, r) => s + r.count, 0);
  // Found dimensions first, then the empty ones (gaps are still informative).
  results.sort((a, b) => b.count - a.count);
  return NextResponse.json({ city: city.name, results, totalHits });
}
