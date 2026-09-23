import { REALESTATE_SOURCES, hasRealEstateSignal } from "./classify";

/**
 * Which unscored items get scored first, and which never need scoring.
 *
 * Why this exists. Measured 2026-09-23 over the two weeks since 2026-09-09:
 *   - ynet כלכלה: 175 items ingested, 0 scored.
 *   - klikatnadlan.co.il (our own site): 58 ingested, 17 scored.
 *   - 2026-09-14: nothing scored at all; 09-18 and 09-23 only 25 of the usual 75.
 * An item with no score never reaches the home feed, so all of that was
 * invisible — silently, with no error anywhere.
 *
 * The cause was the queue, not the scorer. Each run scores one wave (75, or 25
 * when ingest ran slow) and it used to take the unscored items in FEED ORDER.
 * TheMarker's "נדל״ן" feed is really its all-sections feed (100 items; measured:
 * 27 Wall Street, 24 markets, 10 tech, 4 real estate), and it sits second in the
 * list, so it and the ynet news flashes spent the whole wave before the queue
 * ever reached our own articles or ynet כלכלה.
 *
 * The fix orders by likely relevance and shares the wave between outlets:
 *   tier 0 — our own site and the dedicated real-estate outlets
 *   tier 1 — a real-estate word in the URL, title or summary
 *   tier 2 — everything else (still scored, only later — the keyword gate is
 *            what once hid the Bank of Israel rate cut, so it must never DROP)
 * and within a tier it takes one item per outlet in turn, newest first.
 */

/**
 * URL sections that never produced a real-estate story in our own history, so
 * they are skipped before scoring (zero tokens).
 *
 * Built from data, and deliberately short. Checked 2026-09-23 against every
 * past score: TheMarker podcasts gave "משכנתא היא אחת משתי ההשקעות הגדולות"
 * (92) and Wall Street gave "המדינה שבה צריך לעבוד אלף שנה כדי לקנות בית" (88),
 * so neither is here even though both look irrelevant — they are ordered last
 * instead. Everything below had no real-estate item among its scored ≥30 rows:
 * ICE tv 0/110, ICE sport 6/108 (club finances), ICE media 7/269, TheMarker tech
 * 12/55, TheMarker security 1/7, Calcalist tech 28/100 (startups).
 */
export const NEVER_REAL_ESTATE_SECTIONS: RegExp[] = [
  /themarker\.com\/technation\//i,
  /themarker\.com\/news\/security\//i,
  /ice\.co\.il\/(tv|sport_news|media)\//i,
  /calcalist\.co\.il\/calcalistech\//i,
];

const OWN_HOSTS = ["klikatnadlan.co.il"];
// Only sections whose name says real estate. Calcalist "local_news" was left out
// on purpose: it is general Israeli economy, and the keyword check below already
// lifts its real-estate items.
const RE_URL_SECTION = /\/(realestate|real-estate|nadlan)\//i;

export interface QueueItem {
  id: string;
  title: string;
  summary?: string | null;
  source: string;
  source_url: string;
  published_at?: string | null;
}

export function isNeverRealEstate(url: string): boolean {
  return NEVER_REAL_ESTATE_SECTIONS.some((re) => re.test(url || ""));
}

function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url || "");
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}

export function scoringTier(item: QueueItem): 0 | 1 | 2 {
  const host = hostOf(item.source_url);
  if (OWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || REALESTATE_SOURCES.has(item.source)) return 0;
  if (RE_URL_SECTION.test(item.source_url || "") || hasRealEstateSignal(item.title || "", item.summary)) return 1;
  return 2;
}

function timeOf(item: QueueItem): number {
  const t = item.published_at ? Date.parse(item.published_at) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

/** Newest first per outlet, then one item per outlet in turn. */
function interleaveByHost<T extends QueueItem>(items: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const it of items) {
    const h = hostOf(it.source_url);
    if (!buckets.has(h)) buckets.set(h, []);
    buckets.get(h)!.push(it);
  }
  const lists = [...buckets.values()].map((l) => l.sort((a, b) => timeOf(b) - timeOf(a)));
  // Outlet with the freshest item goes first; ties broken by name so the order
  // is deterministic run to run.
  lists.sort((a, b) => timeOf(b[0]) - timeOf(a[0]) || hostOf(a[0].source_url).localeCompare(hostOf(b[0].source_url)));
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

export function orderForScoring<T extends QueueItem>(items: T[]): { queue: T[]; skipped: T[] } {
  const skipped: T[] = [];
  const tiers: [T[], T[], T[]] = [[], [], []];
  for (const it of items) {
    if (isNeverRealEstate(it.source_url)) {
      skipped.push(it);
      continue;
    }
    tiers[scoringTier(it)].push(it);
  }
  return { queue: tiers.flatMap((t) => interleaveByHost(t)), skipped };
}
