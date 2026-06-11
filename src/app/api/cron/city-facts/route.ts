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
  const failures: string[] = [];

  // Small batches to be polite to the Wikipedia API.
  const BATCH = 8;
  for (let i = 0; i < CITIES.length; i += BATCH) {
    const slice = CITIES.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (c) => {
        try {
          const facts = await fetchCityFacts(c.name);
          if (!facts.population && !facts.mayor) { failures.push(c.name); return; }
          await supabase.from("narrative_cache").upsert(
            { cache_key: `city_facts|${c.name}`, narratives: facts, count: 0, created_at: new Date().toISOString() },
            { onConflict: "cache_key" }
          );
          refreshed++;
          if (facts.population) withPopulation++;
        } catch {
          failures.push(c.name);
        }
      })
    );
  }

  return NextResponse.json({ cities: CITIES.length, refreshed, withPopulation, failures });
}
