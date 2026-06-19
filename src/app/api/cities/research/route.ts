import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { findCity, RESEARCH_TOPIC_KEYWORDS, RESEARCH_TOPIC_WEB_QUERY } from "@/lib/cities";
import { firecrawlSearch, hostLabel, type WebResult } from "@/lib/websearch";

export const maxDuration = 45;

// "בצע מחקר" — compose a multi-dimensional study of a city/area. Runs one
// search per chosen topic (city + topic), grouped. Internal matching is
// token-free (pure SQL). When our own corpus is THIN for a topic (small towns /
// civic topics we don't yet cover), we fall back to a real web search
// (Firecrawl) — the "internal Google" Ben asked for — so the research actually
// finds things instead of "אין עדיין". Web search is NOT Claude tokens, fires
// only on this explicit click, only for thin topics, and is cached 24h.

// Below this many internal hits, a topic is "thin" → top it up from the web.
const THIN = 4;
const WEB_CACHE_HOURS = 24;

// Our corpus is real-estate-focused, so we're strong on these → only web-augment
// when internal is thin (saves cost). Civic topics (crime/transport/education/…)
// and custom free-text cubes are where our corpus is structurally weak — there
// we ALWAYS go to the web (still cached 24h), because that's the "internal
// Google" value: pick אלימות on מעלות and it actually researches the web.
const RE_TOPICS = new Set(["פרויקט", "דירות", "התחדשות", "מחירים", "מחיר למשתכן", "מכרז"]);

function normUrl(u: string): string {
  return (u || "").toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "");
}

// Web results for a city+topic, cached 24h in narrative_cache so a repeated
// מחקר on the same city+topic costs nothing. Returns [] on any failure.
async function getWebResults(cityName: string, topic: string): Promise<WebResult[]> {
  const cacheKey = `webresearch|${cityName}|${topic}`;
  try {
    const { data: cached } = await supabase
      .from("narrative_cache")
      .select("narratives, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached?.created_at) {
      const ageH = (Date.now() - new Date(cached.created_at).getTime()) / 3_600_000;
      if (ageH < WEB_CACHE_HOURS && Array.isArray(cached.narratives)) {
        return cached.narratives as WebResult[];
      }
    }
  } catch { /* cache miss → fetch fresh */ }

  const query = `${cityName} ${RESEARCH_TOPIC_WEB_QUERY[topic] || topic}`;
  const web = await firecrawlSearch(query, 6);
  if (web.length) {
    try {
      await supabase.from("narrative_cache").upsert(
        { cache_key: cacheKey, narratives: web, count: web.length, created_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      );
    } catch { /* caching is best-effort */ }
  }
  return web;
}

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
        const internalCount = rows.length ? Number(rows[0].total) || 0 : 0;
        const internalItems = rows.map((r) => ({
          id: r.id,
          title: clean(r.title),
          summary: clean(r.summary),
          source: detectSourceFromUrl(r.source_url) || r.source || "",
          url: r.source_url || "",
          date: (r.published_at || r.fetched_at || "")?.slice?.(0, 10) || null,
          web: false,
        }));

        // Go research the web ("גוגל פנימי") for civic/custom topics (always —
        // our corpus is weak there) or when an RE topic is thin. Web results
        // are deduped against internal, marked web:true.
        const doWeb = !RE_TOPICS.has(topic) || internalCount < THIN;
        const webItems: typeof internalItems = [];
        if (doWeb) {
          const seen = new Set(internalItems.map((it) => normUrl(it.url)));
          const web = await getWebResults(city.name, topic);
          for (const w of web) {
            const key = normUrl(w.url);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            webItems.push({
              id: `web:${w.url}`,
              title: clean(w.title),
              summary: clean(w.description),
              source: detectSourceFromUrl(w.url) || hostLabel(w.url),
              url: w.url,
              date: null,
              web: true,
            });
          }
        }

        // Civic/custom topics: web is the targeted research → show it first
        // (internal civic matches are often loose). RE topics: internal first.
        const webFirst = !RE_TOPICS.has(topic);
        const items = webFirst ? [...webItems, ...internalItems] : [...internalItems, ...webItems];
        // Badge count = everything visible when web was added; else internal total.
        const count = webItems.length > 0 ? items.length : internalCount;
        return { topic, count, items, webCount: webItems.length };
      } catch {
        return { topic, count: 0, items: [], webCount: 0 };
      }
    })
  );

  const totalHits = results.reduce((s, r) => s + r.count, 0);
  // Found dimensions first, then the empty ones (gaps are still informative).
  results.sort((a, b) => b.count - a.count);
  return NextResponse.json({ city: city.name, results, totalHits });
}
