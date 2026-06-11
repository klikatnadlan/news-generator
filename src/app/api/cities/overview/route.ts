import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { findCity } from "@/lib/cities";

export const maxDuration = 30;

// City overview — ALL token-free (no LLM):
//  • population  → rendered he-wiki infobox (למ"ס monthly estimate, freshest)
//                  with Wikidata P1082 (best claim by point-in-time) as fallback
//  • mayor       → Hebrew Wikipedia infobox (ראש העיר/הרשות)
//  • district    → embedded in cities.ts
//  • metrics     → Pulse rental_by_city (major cities)
//  • articleCount→ our own corpus (search_news)
// Facts are cached 7 days AND proactively refreshed weekly by /api/cron/city-facts.

const PULSE_URL = "https://zkirtoefpwugcyybebed.supabase.co";
const PULSE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpraXJ0b2VmcHd1Z2N5eWJlYmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTMyNTQsImV4cCI6MjA4NTc4OTI1NH0.Fwwi0HNS4HxQNDCUFmK5XwPRWaaVVSeaqVQIuA66Ems";

import { fetchCityFacts, type CityFacts } from "@/lib/city-facts";

export async function GET(request: NextRequest) {
  const cityName = new URL(request.url).searchParams.get("city") || "";
  const city = findCity(cityName);
  if (!city) {
    return NextResponse.json({ error: "עיר לא נמצאה ברשימה" }, { status: 404 });
  }

  // ─── Facts (cached 7d, refreshed weekly by /api/cron/city-facts) ───
  const cacheKey = `city_facts|${city.name}`;
  let facts: CityFacts | null = null;
  try {
    const { data: cached } = await supabase.from("narrative_cache").select("narratives, created_at").eq("cache_key", cacheKey).maybeSingle();
    if (cached?.narratives && Date.now() - new Date(cached.created_at).getTime() < 7 * 24 * 3600 * 1000) {
      facts = cached.narratives;
    }
  } catch { /* ignore */ }
  if (!facts) {
    facts = await fetchCityFacts(city.name, city.wikiPage);
    if (facts.population || facts.mayor) {
      try {
        await supabase.from("narrative_cache").upsert({ cache_key: cacheKey, narratives: facts, count: 0, created_at: new Date().toISOString() }, { onConflict: "cache_key" });
      } catch { /* ignore */ }
    }
  }

  // ─── Article count in our corpus (token-free) ───
  let articleCount = 0;
  try {
    const { data } = await supabase.rpc("search_news", { p_query: city.name, p_limit: 1, p_offset: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(data) && data.length) articleCount = Number((data[0] as any).total) || 0;
  } catch { /* ignore */ }

  // ─── Pulse rental metric (major cities only) ───
  let metric: { avgRent: number; annualChange: number | null } | null = null;
  try {
    const r = await fetch(`${PULSE_URL}/rest/v1/rental_by_city?city=eq.${encodeURIComponent(city.name)}&select=avg_rent,annual_change&order=year.desc,month.desc&limit=1`, { headers: { apikey: PULSE_KEY, Authorization: `Bearer ${PULSE_KEY}` } });
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length && rows[0].avg_rent) {
      metric = { avgRent: Math.round(rows[0].avg_rent), annualChange: rows[0].annual_change ?? null };
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    city: { name: city.name, district: city.district },
    population: facts.population,
    populationAsOf: facts.populationAsOf || null,
    mayor: facts.mayor,
    metric,
    articleCount,
    projectorUrl: `https://tenders-app-nu.vercel.app/city/${encodeURIComponent(city.name)}`,
  });
}
