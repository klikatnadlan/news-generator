import Parser from "rss-parser";
import { RSS_FEEDS } from "./sources";
import { firecrawlFetchRaw } from "./websearch";

export const DEFAULT_FEED_UA = "KlikaVault-NewsBot/1.0";

// Per-request timeout.
//
// This is almost entirely a DEAD-feed budget, not a healthy-feed one: measured
// on production, every healthy feed answers in 0.2-7.1s, while ~22 permanently
// dead ingest-only feeds each burn the full timeout every single scan. At 15s
// they alone accounted for ~20s of the scan's 60s ceiling. 10s still clears the
// slowest healthy feed (7.1s) with margin while cutting that tax by a third.
const FEED_TIMEOUT_MS = 10000;

/**
 * How many feeds we fetch at once.
 *
 * Was unbounded: `Promise.allSettled(RSS_FEEDS.map(...))` fired all 103 feeds
 * simultaneously. Measured 2026-08-16 — that saturates the connection pool and
 * the 10s timer expires while requests are still queued, so feeds "fail" that
 * are in fact perfectly healthy: 68 of 103 reported `Request timed out after
 * 10000ms` in one parallel run, yet fetched serially the very same feeds
 * answered in under 2s (TheMarker 1.3s/100 items, כל רגע 0.9s/100, NWS
 * 1.9s/100). Because `fetchAllFeeds` swallows per-feed errors and returns [],
 * every one of those losses was invisible — the scan reported success while
 * silently ingesting a random subset of the sources each run.
 *
 * 16 was chosen by measurement, not taste: at 8 the full 103-feed sweep took
 * 25-30s, which is too much of the scan's 60s `maxDuration` to leave for
 * scoring. 16 halves that while still reporting every healthy feed as healthy.
 */
export const FEED_CONCURRENCY = 16;

/** Bounded-concurrency map. Keeps ordering; never rejects if `fn` doesn't. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: {
    "User-Agent": DEFAULT_FEED_UA,
  },
});

// Feeds that reject our honest bot UA get their own parser instance (rss-parser
// fixes headers at construction time). Cached per UA so we build at most one
// extra parser, not one per feed per scan.
const parserCache = new Map<string, Parser>();
export function parserFor(userAgent?: string): Parser {
  if (!userAgent || userAgent === DEFAULT_FEED_UA) return parser;
  let p = parserCache.get(userAgent);
  if (!p) {
    p = new Parser({ timeout: FEED_TIMEOUT_MS, headers: { "User-Agent": userAgent } });
    parserCache.set(userAgent, p);
  }
  return p;
}

// How far back a feed item may be published and still be ingested.
//
// This was 24h, which silently coupled freshness to cron reliability: the scan
// runs once a day, so any day the cron did not fire (measured: 2026-08-11 and
// 2026-08-14 both had ZERO ingestion) took that day's news with it permanently —
// the next run only looked back 24h, so nothing could ever recover it. 72h lets
// a missed day self-heal on the next successful run. It costs nothing: the
// upsert is `onConflict: source_url, ignoreDuplicates`, and scoring only ever
// touches items with no score, so re-seen items are neither re-stored nor
// re-scored (zero extra tokens).
const INGEST_WINDOW_HOURS = 72;

export interface FeedArticle {
  title: string;
  link: string;
  pubDate: string | undefined;
  contentSnippet: string | undefined;
  source: string;
  ingestOnly: boolean;
}

// Detect real source from article URL (for aggregated feeds like rss.app)
function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("israelhayom.co.il")) return "ישראל היום";
  if (lower.includes("news1.co.il")) return "News1";
  if (lower.includes("ice.co.il")) return "ICE";
  if (lower.includes("kan.org.il")) return "כאן";
  if (lower.includes("nadlancenter.co.il")) return "מרכז הנדל\"ן";
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  if (lower.includes("madlan.co.il")) return "מדלן";
  if (lower.includes("homeless.co.il")) return "הומלס";
  if (lower.includes("dira.co.il")) return "דירה";
  // Our own site. Without this, an article of ours that arrived through the
  // rss.app aggregate was stored under the aggregate's name, "קליקת חדשות
  // (מאוחד)", and missed the real-estate whitelist.
  if (lower.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
  return null;
}

/**
 * The URL to actually request. Normally the feed URL itself; for a feed marked
 * `cacheBust` (a site whose page cache hands out a frozen copy of its feed) a
 * one-off parameter is added so we get the live one. Shared by the scan and by
 * feed-health, so the monitor judges exactly what the scan receives.
 */
export function fetchUrlFor(feed: { url: string; cacheBust?: boolean }): string {
  if (!feed.cacheBust) return feed.url;
  return `${feed.url}${feed.url.includes("?") ? "&" : "?"}lf=${Date.now()}`;
}

/**
 * Which feeds a run fetches. The main scan never touches a `serviceOnly` feed:
 * those only answer through the paid service, and they have their own run so
 * their paid fetches cannot eat the seconds the scan needs for scoring.
 */
export function feedsForRun(run: "full" | "catchup" | "service"): (typeof RSS_FEEDS)[number][] {
  if (run === "service") return RSS_FEEDS.filter((f) => f.serviceOnly);
  const direct = RSS_FEEDS.filter((f) => !f.serviceOnly);
  return run === "catchup" ? direct.filter((f) => !f.ingestOnly) : direct;
}

/** Below this many credits left, the service run stands down (see fetchServiceFeeds). */
export const SERVICE_CREDIT_FLOOR = 300;

export interface ServiceFeedResult {
  name: string;
  ok: boolean;
  items: number;
  newestAgeDays: number | null;
  error?: string;
  /** When this feed was last attempted, and last collected successfully. */
  at?: string | null;
  okAt?: string | null;
}

/** A feed collected this recently is not fetched again: one credit per feed per day. */
const SERVICE_FRESH_MS = 20 * 60 * 60 * 1000;

/**
 * The daily paid collection of the feeds that block our server.
 *
 * One service credit per feed. Two guards, both measured before they were set:
 * - Credit floor. The service account is shared with other projects, and on
 *   2026-09-28 it had spent ~880 credits in five days, none of it here. These
 *   local papers are the least important use of a credit, so when fewer than
 *   SERVICE_CREDIT_FLOOR remain they are skipped, keeping what is left for מעריב
 *   נדל״ן (a scored feed) and the ask box's web search.
 * - Time. Measured on the first run, 2026-09-28: ~10s per fetch with two in
 *   flight, so 13 feeds do not fit one 60-second function (8 did, 5 were cut).
 *   The run therefore fetches only feeds NOT collected in the last 20 hours,
 *   oldest first, inside a 40s budget, and it runs twice each morning (05:10 and
 *   05:25): the second pass takes whatever the first had no time for. Still one
 *   credit per feed per day.
 *
 * `previous` is the last stored result; `previousAt` its timestamp, used for
 * records written before per-feed times existed.
 */
export async function fetchServiceFeeds(
  creditsLeft: number | null,
  previous: ServiceFeedResult[] = [],
  previousAt: string | null = null
): Promise<{ articles: FeedArticle[]; perFeed: ServiceFeedResult[]; skippedForCredits: boolean; fetched: number }> {
  const feeds = feedsForRun("service");
  const now = Date.now();
  const prevBy = new Map(previous.map((p) => [p.name, p]));
  const okAtOf = (name: string): string | null => {
    const p = prevBy.get(name);
    return p?.okAt ?? (p?.ok && previousAt ? previousAt : null);
  };
  const fresh = (name: string) => {
    const t = Date.parse(okAtOf(name) || "");
    return Number.isFinite(t) && now - t < SERVICE_FRESH_MS;
  };
  const due = feeds
    .filter((f) => !fresh(f.name))
    .sort((a, b) => (Date.parse(okAtOf(a.name) || "") || 0) - (Date.parse(okAtOf(b.name) || "") || 0));

  const results = new Map<string, ServiceFeedResult>();
  const carry = (name: string, error?: string): ServiceFeedResult => {
    const p = prevBy.get(name);
    return { name, ok: !error && !!p?.ok, items: p?.items ?? 0, newestAgeDays: p?.newestAgeDays ?? null, at: p?.at ?? previousAt, okAt: okAtOf(name), ...(error ? { error } : {}) };
  };

  let articles: FeedArticle[] = [];
  let skippedForCredits = false;
  let fetched = 0;
  if (due.length && creditsLeft !== null && creditsLeft < SERVICE_CREDIT_FLOOR) {
    skippedForCredits = true;
    for (const f of due) results.set(f.name, carry(f.name, `דולג: נשארו ${creditsLeft} יחידות, מתחת לרצפה ${SERVICE_CREDIT_FLOOR}`));
  } else if (due.length) {
    const t0 = Date.now();
    const cutoff = new Date(Date.now() - INGEST_WINDOW_HOURS * 60 * 60 * 1000);
    const lists = await mapPool(due, 2, async (feed) => {
      if (Date.now() - t0 > 40_000) {
        results.set(feed.name, carry(feed.name, "דולג: נגמר זמן הריצה, ייאסף בריצה הבאה"));
        return [];
      }
      const at = new Date().toISOString();
      fetched++;
      try {
        const raw = await firecrawlFetchRaw(fetchUrlFor(feed));
        if (!raw) throw new Error("השירות החזיר תשובה ריקה");
        const parsed = await parserFor(feed.userAgent).parseString(raw);
        const all = parsed.items || [];
        let newest = -Infinity;
        for (const it of all) {
          const t = Date.parse(it.isoDate || it.pubDate || "");
          if (Number.isFinite(t) && t > newest) newest = t;
        }
        results.set(feed.name, {
          name: feed.name,
          ok: all.length > 0,
          items: all.length,
          newestAgeDays: Number.isFinite(newest) ? Math.round(((Date.now() - newest) / 86_400_000) * 10) / 10 : null,
          at,
          okAt: all.length > 0 ? at : okAtOf(feed.name),
        });
        return toArticles(feed, all, cutoff);
      } catch (err) {
        results.set(feed.name, { ...carry(feed.name, (err instanceof Error ? err.message : String(err)).slice(0, 120)), at });
        return [];
      }
    });
    articles = lists.flat();
  }
  // Every service feed appears in the record, collected now or carried over.
  const perFeed = feeds.map((f) => results.get(f.name) ?? carry(f.name));
  return { articles, perFeed, skippedForCredits, fetched };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArticles(feed: (typeof RSS_FEEDS)[number], items: any[], cutoff: Date): FeedArticle[] {
  return items
    .filter((item) => !item.pubDate || new Date(item.pubDate) >= cutoff)
    .map((item) => ({
      title: item.title || "ללא כותרת",
      link: item.link || "",
      pubDate: item.pubDate,
      contentSnippet: item.contentSnippet?.slice(0, 500),
      source: detectSourceFromUrl(item.link || "") || feed.name,
      ingestOnly: !!feed.ingestOnly,
    }));
}

/**
 * @param opts.scorableOnly fetch only the feeds that get scored. The morning
 *   catch-up run uses this: it needs the scored feeds' current links to find
 *   what the main run had no time to score, not another pass over the ~95
 *   ingest-only local feeds that ate that time in the first place.
 */
export async function fetchAllFeeds(opts: { scorableOnly?: boolean } = {}): Promise<FeedArticle[]> {
  const articles: FeedArticle[] = [];
  const cutoff = new Date(Date.now() - INGEST_WINDOW_HOURS * 60 * 60 * 1000);
  const feeds = feedsForRun(opts.scorableOnly ? "catchup" : "full");

  const results = await mapPool(feeds, FEED_CONCURRENCY, async (feed) => {
    try {
      let parsed;
      try {
        parsed = await parserFor(feed.userAgent).parseURL(fetchUrlFor(feed));
      } catch (directErr) {
        // Some publishers block our SERVER's IP, which no header can fix —
        // מעריב נדל״ן went from 20 items/day to a flat 403 on 2026-08-25 while
        // still serving any User-Agent from a normal connection. For feeds
        // explicitly opted in, fetch the same URL through Firecrawl's network
        // and parse the body ourselves. Only runs after a direct failure, so a
        // healthy feed never costs a credit.
        if (!feed.viaFirecrawlOnBlock) throw directErr;
        const raw = await firecrawlFetchRaw(feed.url);
        if (!raw) throw directErr;
        parsed = await parserFor(feed.userAgent).parseString(raw);
        console.log(`[rss] ${feed.name}: direct fetch blocked, recovered ${parsed.items?.length ?? 0} items via Firecrawl`);
      }
      return toArticles(feed, parsed.items || [], cutoff);
    } catch (err) {
      console.error(`Failed to fetch ${feed.name}:`, err);
      return [];
    }
  });

  for (const result of results) {
    articles.push(...result);
  }

  return articles;
}
