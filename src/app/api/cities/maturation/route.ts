import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { findCity } from "@/lib/cities";
import { firecrawlSearchV2, hostLabel, type WebResult } from "@/lib/websearch";

export const maxDuration = 60;

// "תהליך הבשלה" (maturation timeline). For a city + optional project / developer
// / neighborhood, pull DATED items across many years and lay them on a
// chronological arc — so a salesperson can show a client "this asset has been
// maturing for X years; the value-unlock moment is now." Token-free (NO Claude):
// Firecrawl v2 search (news = dated results, web + cdr = year-bucketed history)
// merged with our own corpus (exact published_at dates). Fires only on the
// explicit click; cached 24h per (city, entity). Example that drove this:
// מעלות → "רני צים" → 2016 (22 דונם, מלון 300 חדרים) → 2018 (170-200M) → 2026
// (זכה במכרז רמ"י, מלון 250 חדרים) — a real decade-long arc.

const CACHE_HOURS = 24;
const NOW_YEAR = new Date().getFullYear();
const MIN_YEAR = 2008; // ignore stray older/garbage year matches

// Coarse history buckets (representative year → cdr window). Recent years are
// covered by the plain news/web passes; these dredge the older arc.
const BUCKETS: { rep: number; lo: number; hi: number }[] = [
  { rep: 2013, lo: 2009, hi: 2015 },
  { rep: 2017, lo: 2016, hi: 2019 },
  { rep: 2021, lo: 2020, hi: 2023 },
];

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
function normUrl(u: string): string {
  return (u || "").toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "");
}

type Conf = "exact" | "parsed" | "approx";
// Resolve a year. Priority: explicit date field → ISO date in URL/text →
// standalone year → fallback (bucket rep / current year).
function resolveYear(it: WebResult, fallback: number): { year: number; conf: Conf } {
  if (it.date) {
    const m = it.date.match(/\b(20[0-2]\d)\b/);
    if (m) return { year: Number(m[1]), conf: "exact" };
    if (/יום|אתמול|שעות|hours?|today|yesterday/i.test(it.date)) return { year: NOW_YEAR, conf: "exact" };
    const mo = it.date.match(/חודש|months?|שבוע|weeks?/i);
    if (mo) return { year: NOW_YEAR, conf: "exact" };
  }
  const blob = `${it.url} ${it.title} ${it.description}`;
  const iso = blob.match(/(20[0-2]\d)[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])/);
  if (iso) return { year: Number(iso[1]), conf: "parsed" };
  const y = blob.match(/\b(20[0-2]\d)\b/);
  if (y) {
    const yr = Number(y[1]);
    if (yr >= MIN_YEAR && yr <= NOW_YEAR) return { year: yr, conf: "parsed" };
  }
  return { year: fallback, conf: "approx" };
}

type TItem = { id: string; title: string; summary: string; source: string; url: string; date: string | null; web: boolean; year: number; conf: Conf };

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const cityName = sp.get("city") || "";
  const entity = (sp.get("entity") || "").trim().slice(0, 80);
  const city = findCity(cityName);
  if (!city) return NextResponse.json({ error: "עיר לא נמצאה" }, { status: 404 });

  const cacheKey = `maturation|${city.name}|${entity}`;
  // 24h cache (the whole assembled timeline) — repeat clicks cost nothing.
  try {
    const { data: cached } = await supabase
      .from("narrative_cache")
      .select("narratives, created_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached?.created_at) {
      const ageH = (Date.now() - new Date(cached.created_at).getTime()) / 3_600_000;
      if (ageH < CACHE_HOURS && cached.narratives && !Array.isArray(cached.narratives)) {
        return NextResponse.json(cached.narratives);
      }
    }
  } catch { /* cache miss → build fresh */ }

  // Disambiguate a developer/project with the city; a bare city studies its RE arc.
  const subject = entity ? `${entity} ${city.name}` : `${city.name} פרויקט נדל"ן שכונה התחדשות`;

  const passes = await Promise.all([
    firecrawlSearchV2(subject, { news: true, limit: 10 }).then((r) => ({ rows: r, fb: NOW_YEAR })),
    firecrawlSearchV2(subject, { limit: 10 }).then((r) => ({ rows: r, fb: NOW_YEAR })),
    ...BUCKETS.map((b) =>
      firecrawlSearchV2(subject, { tbs: `cdr:1,cd_min:01/01/${b.lo},cd_max:12/31/${b.hi}`, limit: 4 }).then((r) => ({ rows: r, fb: b.rep }))
    ),
  ]);

  // Our own corpus (exact published_at). Filter by entity when given.
  let corpus: TItem[] = [];
  try {
    const { data } = await supabase.rpc("city_news", {
      p_city: city.name, p_aliases: city.aliases || [], p_strict: !!city.commonWord,
      p_chip: entity || "", p_chip_any: [], p_from: null, p_to: null, p_limit: 40, p_offset: 0,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    corpus = ((data || []) as any[]).map((r) => {
      const iso = (r.published_at || r.fetched_at || "")?.slice?.(0, 10) || null;
      const yr = iso ? Number(iso.slice(0, 4)) : NOW_YEAR;
      return {
        id: r.id, title: clean(r.title), summary: clean(r.summary),
        source: detectSourceFromUrl(r.source_url) || r.source || "", url: r.source_url || "",
        date: iso, web: false, year: yr, conf: "exact" as Conf,
      };
    });
  } catch { /* corpus optional */ }

  // Merge everything, dedup by URL keeping the EARLIEST (first-appearance) year.
  const byUrl = new Map<string, TItem>();
  const add = (it: TItem) => {
    const key = normUrl(it.url);
    if (!key) return;
    const prev = byUrl.get(key);
    if (!prev || it.year < prev.year || (it.year === prev.year && it.conf === "exact" && prev.conf !== "exact")) {
      byUrl.set(key, prev ? { ...it, year: Math.min(it.year, prev.year) } : it);
    }
  };
  for (const it of corpus) add(it);
  for (const p of passes) {
    for (const w of p.rows) {
      const { year, conf } = resolveYear(w, p.fb);
      if (year < MIN_YEAR || year > NOW_YEAR) continue;
      add({
        id: `web:${w.url}`, title: clean(w.title), summary: clean(w.description),
        source: detectSourceFromUrl(w.url) || hostLabel(w.url), url: w.url,
        date: null, web: true, year, conf,
      });
    }
  }

  const items = [...byUrl.values()];
  // Group by year ascending (the maturation arc reads oldest → newest).
  const years = [...new Set(items.map((i) => i.year))].sort((a, b) => a - b);
  const timeline = years.map((year) => ({
    year,
    items: items.filter((i) => i.year === year).sort((a, b) => (a.conf === "exact" ? -1 : 1) - (b.conf === "exact" ? -1 : 1)).slice(0, 5),
  }));

  const firstYear = years.length ? years[0] : null;
  const lastYear = years.length ? years[years.length - 1] : null;
  const payload = {
    city: city.name,
    entity,
    subject,
    firstYear,
    lastYear,
    yearsMaturing: firstYear && lastYear ? lastYear - firstYear : null,
    timeline,
    totalItems: items.length,
    sources: {
      web: items.filter((i) => i.web).length,
      internal: items.filter((i) => !i.web).length,
    },
  };

  if (items.length) {
    try {
      await supabase.from("narrative_cache").upsert(
        { cache_key: cacheKey, narratives: payload, count: items.length, created_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      );
    } catch { /* best-effort */ }
  }

  return NextResponse.json(payload);
}
