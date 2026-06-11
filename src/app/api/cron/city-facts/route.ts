import { NextRequest, NextResponse } from "next/server";
import { CITIES } from "@/lib/cities";
import { fetchCityFacts } from "@/lib/city-facts";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

// Weekly proactive refresh of city facts (population per למ"ס via he-wiki,
// mayor) for ALL cities — token-free, so the ערים tab stays fresh without
// anyone having to ask. Also runnable manually with x-manual-scan.
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

  const refreshOne = async (name: string): Promise<boolean> => {
    try {
      const facts = await fetchCityFacts(name);
      if (!facts.population && !facts.mayor) return false;
      await supabase.from("narrative_cache").upsert(
        { cache_key: `city_facts|${name}`, narratives: facts, count: 0, created_at: new Date().toISOString() },
        { onConflict: "cache_key" }
      );
      refreshed++;
      if (facts.population) withPopulation++;
      return true;
    } catch { return false; }
  };

  // Low concurrency + pauses — Wikipedia rate-limits rapid parse calls from
  // datacenter IPs (first run: 8-concurrent got throttled after ~10 cities).
  const BATCH = 4;
  for (let i = 0; i < CITIES.length; i += BATCH) {
    const slice = CITIES.slice(i, i + BATCH);
    const ok = await Promise.all(slice.map((c) => refreshOne(c.name)));
    slice.forEach((c, j) => { if (!ok[j]) failures.push(c.name); });
    await sleep(500);
  }

  // One retry pass for throttled cities (sequential, gentle).
  if (failures.length) {
    await sleep(1500);
    const still: string[] = [];
    for (const name of failures) {
      if (!(await refreshOne(name))) still.push(name);
      await sleep(350);
    }
    failures = still;
  }

  return NextResponse.json({ cities: CITIES.length, refreshed, withPopulation, failures });
}
