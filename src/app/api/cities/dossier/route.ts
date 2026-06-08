import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { findCity } from "@/lib/cities";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// "תדריך אזור" — a structured, appraiser-style report on how an area is
// communicated externally. CLICK-ONLY, Sonnet, cached. Sources shown to the
// user are the REAL retrieved articles (no invented links).
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

const DEFAULT_TOPICS = ["פרויקט", "דירות", "התחדשות", "מחירים", "תעסוקה", "חינוך", "אלימות", "כביש", "רכבת"];

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const cityName = sp.get("city") || "";
  const from = sp.get("from") || null;
  const refresh = sp.get("refresh") === "1";
  const city = findCity(cityName);
  if (!city) return NextResponse.json({ error: "עיר לא נמצאה" }, { status: 404 });

  const topics = (sp.get("topics") || "").split("|").map((t) => t.trim()).filter(Boolean).slice(0, 14);
  const useTopics = topics.length ? topics : DEFAULT_TOPICS;

  const cacheKey = `city_dossier|${city.name}|${useTopics.join(",")}|${from || ""}`;
  if (!refresh) {
    try {
      const { data: cached } = await supabase.from("narrative_cache").select("narratives, created_at").eq("cache_key", cacheKey).maybeSingle();
      if (cached?.narratives?.report) return NextResponse.json({ ...cached.narratives, cached: true });
    } catch { /* fall through */ }
  }

  // ─── Token-free retrieval: gather + dedupe the city's articles across topics ───
  const seen = new Set<string>();
  const sources: { title: string; source: string; url: string; date: string | null }[] = [];
  await Promise.all(
    useTopics.map(async (topic) => {
      try {
        const { data } = await supabase.rpc("search_news", { p_query: `${city.name} ${topic}`, p_from: from, p_to: null, p_limit: 6, p_offset: 0 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (data || []) as any[]) {
          const key = clean(r.title).slice(0, 90);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          sources.push({ title: clean(r.title), source: detectSourceFromUrl(r.source_url) || r.source || "", url: r.source_url || "", date: (r.published_at || r.fetched_at || "")?.slice?.(0, 10) || null });
        }
      } catch { /* skip topic */ }
    })
  );

  // City facts (from the overview cache — populated when the city was opened).
  let facts: { population: number | null; mayor: string | null } = { population: null, mayor: null };
  try {
    const { data: f } = await supabase.from("narrative_cache").select("narratives").eq("cache_key", `city_facts|${city.name}`).maybeSingle();
    if (f?.narratives) facts = f.narratives;
  } catch { /* ignore */ }

  if (sources.length === 0) {
    return NextResponse.json({
      report: `אין מספיק כתבות על ${city.name} כדי לבנות תדריך. זו עיר עם סיקור ארצי דליל — נוסיף מקורות מקומיים כדי לתפוס יותר.`,
      sources: [], facts, cached: false,
    });
  }

  const capped = sources.slice(0, 40);
  const list = capped.map((s, i) => `[${i + 1}] ${s.title}${s.source ? ` (${s.source})` : ""}`).join("\n");
  const factLine = [
    facts.population ? `אוכלוסייה כ-${facts.population.toLocaleString("he-IL")}` : "",
    facts.mayor ? `ראש העיר ${facts.mayor}` : "",
    `מחוז ${city.district}`,
  ].filter(Boolean).join(" · ");

  const prompt = `אתה שמאי/אנליסט שמכין "תדריך אזור" על ${city.name} (${factLine}). המטרה: שקבלן / יח"צ / עו"ד / משווק יבין במהירות *איך האזור מתוקשר החוצה* ומה קורה שם.

קיבלת ${capped.length} כתבות (ממוספרות):
${list}

כתוב תדריך מובנה בעברית עסקית. כלול רק סעיפים שיש עליהם מידע בכתבות (דלג על השאר):
*איך האזור מתוקשר החוצה* — משפט-שניים על הטון והתדמית.
*נדל"ן ופרויקטים* · *תעסוקה ומעסיקים* · *ביטחון ואלימות* · *חינוך* · *תחבורה ותשתיות* — נקודות עם מספרים/שמות.
*קבלנים ויזמים פעילים* — שמות חברות אם הופיעו.
*יתרונות וחסרונות לשיווק* — 2-3 כל אחד.

כללים מחייבים: התבסס *רק* על הכתבות שקיבלת, בלי להמציא עובדות/שמות/מספרים. אם אין מידע על סעיף — דלג עליו. בלי מקפים ארוכים. עד ~300 מילים.`;

  let report = "";
  try {
    const resp = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 1500, messages: [{ role: "user", content: prompt }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    report = ((resp.content[0] as any)?.text || "").trim();
  } catch (e) {
    console.error("city dossier failed", e);
    return NextResponse.json({ error: "לא הצלחנו לבנות את התדריך כרגע. נסה שוב." }, { status: 500 });
  }

  const payload = {
    report,
    sources: capped,
    facts,
    wikipediaUrl: `https://he.wikipedia.org/wiki/${encodeURIComponent(city.name)}`,
  };
  if (report) {
    try {
      await supabase.from("narrative_cache").upsert({ cache_key: cacheKey, narratives: payload, count: capped.length, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ...payload, cached: false });
}

export const maxDuration = 60;
