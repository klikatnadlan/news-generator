import { RSS_FEEDS } from "./sources";
import { parserFor, mapPool, FEED_CONCURRENCY } from "./rss";

/**
 * Feed health monitor.
 *
 * Why this exists: on 2026-08-16 an audit found SIX of the ten scorable
 * real-estate feeds had died without a single error being raised, because a
 * dead feed does not look like a failure:
 *   - גלובס  → 200 OK, body `<rss version="2.0" />` (61 bytes, no items)
 *   - Ynet כסף → 200 OK, body ZERO bytes
 *   - Walla  → 200 OK, valid RSS envelope, empty channel
 *   - TheMarker → 403, but only for our User-Agent
 *   - כלכליסט / Bizportal → URL gone
 * `rss.ts` catches per-feed errors and returns [], so the scan reported success
 * every single day while the home feed slowly starved to ~3.6 items/day.
 *
 * The rule this encodes: a feed returning ZERO items is a failure, exactly like
 * an exception. Liveness (the scan ran) is not the same signal as data landing.
 */

export interface FeedHealth {
  name: string;
  url: string;
  ok: boolean;
  items: number;
  scorable: boolean;
  error?: string;
}

export interface FeedHealthReport {
  ok: boolean;
  checkedAt: string;
  total: number;
  /** Dead feeds that DO reach the home feed — these starve it. */
  deadScorable: FeedHealth[];
  /** Dead ingest-only feeds — these only thin out city research / deep feed. */
  deadIngestOnly: FeedHealth[];
  feeds: FeedHealth[];
}

const scorableOf = (f: (typeof RSS_FEEDS)[number]) => !f.ingestOnly;

/**
 * One attempt, no interpretation.
 */
async function probe(feed: (typeof RSS_FEEDS)[number]): Promise<FeedHealth> {
  const scorable = !feed.ingestOnly;
  try {
    const parsed = await parserFor(feed.userAgent).parseURL(feed.url);
    const items = (parsed.items || []).length;
    return {
      name: feed.name,
      url: feed.url,
      ok: items > 0,
      items,
      scorable,
      // An empty feed throws no error, so say plainly what happened.
      error: items === 0 ? "פיד ריק — 200 OK אבל אפס פריטים" : undefined,
    };
  } catch (err) {
    return {
      name: feed.name,
      url: feed.url,
      ok: false,
      items: 0,
      scorable,
      error: err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160),
    };
  }
}

/**
 * Check a feed, retrying once before calling it dead.
 *
 * Measured 2026-08-25: מעריב נדל״ן was reported dead by the monitor while the
 * very same feed answered 6/6 times in 0.3-0.6s from another network — a
 * transient blip on Vercel's side, not a dead source. Without this retry the
 * monitor would have emailed Ben a false alarm, and an alert channel that cries
 * wolf gets ignored precisely when it is finally right.
 */
async function checkOne(feed: (typeof RSS_FEEDS)[number]): Promise<FeedHealth> {
  const first = await probe(feed);
  if (first.ok) return first;
  // Only scorable feeds get a retry. They are the only ones that can raise an
  // alert, and retrying the ~21 permanently dead ingest-only feeds doubled the
  // whole sweep (16.9s → 29.1s) to re-confirm what we already know.
  if (!scorableOf(feed)) return first;
  await new Promise((r) => setTimeout(r, 1200));
  const second = await probe(feed);
  if (second.ok) return second;
  // Still failing after a retry — report the second attempt's reason.
  return { ...second, error: second.error ? `${second.error} (גם בניסיון חוזר)` : second.error };
}

/**
 * Fetch every configured feed and report which ones return nothing.
 * Zero AI tokens — plain HTTP.
 */
export async function checkFeeds(): Promise<FeedHealthReport> {
  // Bounded concurrency is not an optimisation here, it is correctness: fetching
  // all 103 feeds at once made 68 healthy feeds report "Request timed out" (they
  // answer in <2s when not competing). An unbounded check would page Ben with
  // false alarms every morning.
  const feeds = await mapPool(RSS_FEEDS, FEED_CONCURRENCY, checkOne);

  const deadScorable = feeds.filter((f) => !f.ok && f.scorable);
  const deadIngestOnly = feeds.filter((f) => !f.ok && !f.scorable);

  return {
    // Only a dead SCORABLE feed is an alarm: those are the ones the home feed
    // reads from. A dead local feed thins city research but breaks nothing.
    ok: deadScorable.length === 0,
    checkedAt: new Date().toISOString(),
    total: feeds.length,
    deadScorable,
    deadIngestOnly,
    feeds,
  };
}
