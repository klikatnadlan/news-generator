import { NextRequest, NextResponse } from "next/server";
import { CITIES } from "@/lib/cities";
import { fetchCityFacts } from "@/lib/city-facts";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

// DAILY rotating refresh of city facts (population per למ"ס via he-wiki,
// mayor) — token-free, so the ערים tab stays fresh without anyone asking.
// Wikipedia hard-throttles ~10+ rapid parse calls from datacenter IPs, so we
// refresh only the STALEST ~12 cities per run, gently paced → every city is
// refreshed at least weekly (77 cities / 12 per day), plus the on-demand 7d
// TTL refresh when a city is opened. Runnable manually with x-manual-scan.
export async function GET(request: NextRequest) {
  const isManual = request.headers.get("x-manual-scan") === "true";
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && !isManual && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let refreshed = 0;
  let withPopulation = 0;
  let failures: string[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const refreshOne = async (city: { name: string; wikiPage?: string }): Promise<boolean> => {
    try {
      const facts = await fetchCityFacts(city.name, city.wikiPage);
      if (!facts.population && !facts.mayor) return false;
      await supabase.from("narrative_cache").upsert(
        { cache_key: `city_facts|${city.name}`, narratives: facts, count: 0, created_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      );
      refreshed++;
      if (facts.population) withPopulation++;
      return true;
    } catch { return false; }
  };

  // Pick the ~12 stalest cities (no cache first, then oldest created_at).
  const staleness = new Map<string, number>(); // name → cache age ms (Infinity = none)
  for (const c of CITIES) staleness.set(c.name, Infinity);
  try {
    const { data: rows } = await supabase
      .from("narrative_cache")
      .select("cache_key, created_at")
      .like("cache_key", "city_facts|%");
    for (const r of rows || []) {
      const name = String(r.cache_key).slice("city_facts|".length);
      if (staleness.has(name)) staleness.set(name, Date.now() - new Date(r.created_at).getTime());
    }
  } catch { /* no cache info → all equally stale */ }

  const PER_RUN = 12;
  const todo = [...CITIES]
    .sort((a, b) => (staleness.get(b.name) || 0) - (staleness.get(a.name) || 0))
    .slice(0, PER_RUN);

  // Sequential + gentle pacing — Wikipedia hard-throttles bursts from
  // datacenter IPs (8-concurrent died after ~10 cities).
  for (const c of todo) {
    if (!(await refreshOne(c))) failures.push(c.name);
    await sleep(800);
  }

  return NextResponse.json({ cities: CITIES.length, attempted: todo.map((c) => c.name), refreshed, withPopulation, failures });
}
