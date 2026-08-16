import Parser from "rss-parser";
import { RSS_FEEDS } from "./sources";

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
  return null;
}

export async function fetchAllFeeds(): Promise<FeedArticle[]> {
  const articles: FeedArticle[] = [];
  const cutoff = new Date(Date.now() - INGEST_WINDOW_HOURS * 60 * 60 * 1000);

  const results = await mapPool(RSS_FEEDS, FEED_CONCURRENCY, async (feed) => {
    try {
      const parsed = await parserFor(feed.userAgent).parseURL(feed.url);
      return (parsed.items || [])
        .filter((item) => {
          if (!item.pubDate) return true;
          return new Date(item.pubDate) >= cutoff;
        })
        .map((item) => ({
          title: item.title || "ללא כותרת",
          link: item.link || "",
          pubDate: item.pubDate,
          contentSnippet: item.contentSnippet?.slice(0, 500),
          source: detectSourceFromUrl(item.link || "") || feed.name,
          ingestOnly: !!feed.ingestOnly,
        }));
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
