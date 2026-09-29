/**
 * One line per REIT deal, not one line per article.
 *
 * Why. A REIT purchase is reported by five or six outlets at once. Measured
 * 2026-09-29 in production: in חדרה 6 of the 8 lines were the same רנט איט deal
 * (52 דירות מאאורה), in ירושלים 4 of 9 were the same אבו פמילי deal. The cube
 * exists so that no DEAL is missed ("שלא נפספס שום עסקה"), and six copies of one
 * deal push the others off the screen. Ori approved grouping on 2026-09-29.
 *
 * Two articles are the same deal when the numbers agree — the same number of
 * apartments, or a price within 3% (108 vs 108.5 מיליון) — no number disagrees,
 * and no two different funds are named. Numbers alone are not enough when
 * neither article names a fund: two unrelated "50 דירות" stories must stay apart
 * unless the price agrees too. The first item of a group (the list arrives
 * already ranked) stays the visible line; the rest become "עוד N מקורות".
 */

export interface DealSignature {
  fund: string | null;
  units: number | null;
  priceM: number | null;
}

// Canonical fund → how headlines write it. The FIRST fund named in a text wins.
const FUND_ALIASES: [string, string[]][] = [
  ["מגוריט", ["מגוריט"]],
  ["רנט איט", ["רנט איט", "רנט-איט", "רנטאיט"]],
  ["אזורים", ["אזורים ליווינג", "אזורים LIVING", "ריט אזורים"]],
  ["אבו פמילי", ["אבו פמילי", "צחי אבו"]],
  ["ריט 1", ["ריט 1", "ריט1"]],
  ["סלע", ["סלע קפיטל", 'סלע נדל"ן']],
  ["מניבים", ["מניבים"]],
];

const num = (s: string) => Number(s.replace(/,/g, ""));

export function dealSignature(text: string): DealSignature {
  const t = (text || "").replace(/״/g, '"').replace(/׳/g, "'");
  let fund: string | null = null;
  let at = Infinity;
  for (const [canon, aliases] of FUND_ALIASES) {
    for (const a of aliases) {
      const i = t.indexOf(a);
      if (i >= 0 && i < at) {
        at = i;
        fund = canon;
      }
    }
  }
  const u = /(\d{1,3}(?:,\d{3})+|\d{1,5})\s*(?:דירות|יח"ד|יחידות)/.exec(t);
  const p = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(מיליארד|מיליון|מיליוני|מלש"ח|מ' ש"ח)/.exec(t);
  const priceM = p ? num(p[1]) * (p[2] === "מיליארד" ? 1000 : 1) : null;
  return { fund, units: u ? num(u[1]) : null, priceM };
}

export function sameDeal(a: DealSignature, b: DealSignature): boolean {
  if (a.fund && b.fund && a.fund !== b.fund) return false;
  const unitsKnown = a.units != null && b.units != null;
  const priceKnown = a.priceM != null && b.priceM != null;
  const unitsMatch = unitsKnown && a.units === b.units;
  const priceMatch = priceKnown && Math.abs(a.priceM! - b.priceM!) / Math.max(a.priceM!, b.priceM!) <= 0.03;
  if ((unitsKnown && !unitsMatch) || (priceKnown && !priceMatch)) return false;
  if (!unitsMatch && !priceMatch) return false;
  // Without a fund on either side, one matching number could be coincidence.
  return !!(a.fund || b.fund) || (unitsMatch && priceMatch);
}

export interface GroupedFields {
  /** How many more articles report this same deal. */
  alsoCount?: number;
  /** Their outlets, for the tooltip. */
  alsoSources?: string[];
}

/**
 * Collapse articles about the same deal. Keeps the incoming order (the first
 * member of each group is its visible line). An item flagged `national` that
 * joins a group led by a local item simply disappears into it.
 */
export function groupReitDeals<T extends { title: string; summary?: string; source?: string }>(
  items: T[]
): (T & GroupedFields)[] {
  const groups: { lead: T & GroupedFields; sig: DealSignature; sources: string[] }[] = [];
  for (const it of items) {
    const sig = dealSignature(`${it.title} ${it.summary || ""}`);
    const g = groups.find((x) => sameDeal(x.sig, sig));
    if (!g) {
      groups.push({ lead: { ...it }, sig, sources: [] });
      continue;
    }
    // Fill what the group's signature was missing, so a later article can
    // still be matched by the number this one carried.
    g.sig = {
      fund: g.sig.fund ?? sig.fund,
      units: g.sig.units ?? sig.units,
      priceM: g.sig.priceM ?? sig.priceM,
    };
    if (it.source && !g.sources.includes(it.source) && it.source !== g.lead.source) g.sources.push(it.source);
    g.lead.alsoCount = (g.lead.alsoCount || 0) + 1;
  }
  return groups.map((g) => (g.sources.length ? { ...g.lead, alsoSources: g.sources } : g.lead));
}
