// Token-free city facts from Hebrew Wikipedia (+Wikidata fallback).
// Shared by /api/cities/overview (on-demand) and /api/cron/city-facts (weekly
// proactive refresh), so the data stays as fresh as Wikipedia's למ"ס updates
// without anyone having to ask.

export interface CityFacts {
  population: number | null;
  mayor: string | null;
  populationAsOf: string | null; // e.g. "אפריל 2026" — the למ"ס estimate date
}

export function parseMayor(wt: string): string | null {
  const m = wt.match(/\|\s*ראש (?:העיר|הרשות|המועצה)\s*=\s*([^\n|]+)/);
  if (!m) return null;
  let v = m[1].trim();
  v = v.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1"); // [[A|B]] / [[A]] → A
  v = v.replace(/<ref[\s\S]*?<\/ref>/gi, "").replace(/\{\{[^{}]*\}\}/g, "").replace(/[[\]']/g, "").trim();
  return v || null;
}

export async function fetchCityFacts(cityName: string): Promise<CityFacts> {
  try {
    const wpUrl = `https://he.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(cityName)}&prop=text|wikitext|properties&format=json&redirects=1`;
    const wpRes = await fetch(wpUrl, { headers: { "User-Agent": "leaderfeed/1.0 (klikatnadlan)" } });
    const wp = await wpRes.json();
    const wt: string = wp?.parse?.wikitext?.["*"] || "";
    const html: string = wp?.parse?.text?.["*"] || "";
    const mayor = parseMayor(wt);

    // 1) Population from the RENDERED infobox — he-wiki resolves the central
    // למ"ס data module here, so this matches what Wikipedia displays:
    // 'אוכלוסייה לפי נתוני הלמ"ס לסוף אפריל 2026 (אומדן) — 23,169 תושבים'.
    // Wikidata P1082 lags (נהריה's latest there is 2019!) → fallback only.
    let population: number | null = null;
    let populationAsOf: string | null = null;
    const idx = html.indexOf("אוכלוסייה");
    if (idx >= 0) {
      const seg = html.slice(idx, idx + 900).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const num = seg.match(/\d{1,3}(?:,\d{3})+/);
      if (num) {
        population = parseInt(num[0].replace(/,/g, ""), 10) || null;
        const head = seg.slice(0, seg.indexOf(num[0]));
        const asOf = head.match(/([א-ת]{3,12} \d{4})/); // "אפריל 2026"
        populationAsOf = asOf ? asOf[1] : null;
      }
    }

    // 2) Fallback: Wikidata P1082 — pick the BEST claim (preferred rank, else
    // the latest point-in-time P585), never "last in array" (that was a bug:
    // it returned 37,100 for נהריה instead of 60,000).
    if (!population) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props: any[] = wp?.parse?.properties || [];
      const qid = props.find((p) => p?.name === "wikibase_item")?.["*"];
      if (qid) {
        const wdRes = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: { "User-Agent": "leaderfeed/1.0" } });
        const wd = await wdRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const claims: any[] = wd?.entities?.[qid]?.claims?.P1082 || [];
        let best: { amount: number; time: string; preferred: boolean } | null = null;
        for (const c of claims) {
          const amount = Math.abs(parseInt(String(c?.mainsnak?.datavalue?.value?.amount || "").replace("+", ""), 10));
          if (!amount) continue;
          const time: string = c?.qualifiers?.P585?.[0]?.datavalue?.value?.time || "";
          const preferred = c?.rank === "preferred";
          if (!best || (preferred && !best.preferred) || (preferred === best.preferred && time > best.time)) {
            best = { amount, time, preferred };
          }
        }
        if (best) {
          population = best.amount;
          const y = best.time.match(/\+(\d{4})/);
          populationAsOf = y ? y[1] : null;
        }
      }
    }

    return { population, mayor, populationAsOf };
  } catch {
    return { population: null, mayor: null, populationAsOf: null };
  }
}
