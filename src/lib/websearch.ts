// Web search via Firecrawl — the "internal Google" fallback for city research.
// Used ONLY when our own corpus is thin for a city+topic (small towns / civic
// topics we don't yet cover). Not Claude tokens — a cheap, separate search API,
// fired ONLY on an explicit מחקר click and cached 24h per city+topic. Aligned
// with the iron rule: AI/expensive work only on click + cached, never on scans.

export type WebResult = { title: string; url: string; description: string; date?: string | null };

// The Firecrawl FREE tier allows only 2 concurrent requests and 5/min. When a
// research selects several thin topics, all their web calls would fire at once
// and trip a 429 → that topic silently degraded to internal-only. So we gate ALL
// Firecrawl calls through a process-local semaphore (max 2 in flight) and retry
// once on 429 (honoring Retry-After, capped). This keeps multi-topic research
// reliable on the free tier without losing web results. Per Vercel request the
// isolate is fresh, so the gate scopes to a single research/maturation call.
const MAX_CONCURRENT = 2;
let inFlight = 0;
const waiters: Array<() => void> = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function acquire() {
  if (inFlight >= MAX_CONCURRENT) await new Promise<void>((res) => waiters.push(res));
  inFlight++;
}
function release() {
  inFlight--;
  waiters.shift()?.();
}

// Shared POST to Firecrawl with concurrency gate + one 429 retry. Returns the
// parsed JSON, or null on any failure (so callers degrade to internal-only).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fcPost(url: string, body: any, key: string, timeoutMs = 20000): Promise<any | null> {
  await acquire();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 && attempt === 0) {
        const ra = Number(res.headers.get("retry-after")) || 2;
        await sleep(Math.min(ra, 5) * 1000);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    }
    return null;
  } catch {
    return null;
  } finally {
    release();
  }
}

// Firecrawl /v1/search → top organic results (title/url/description). Returns []
// on any failure (no key, network, non-200) so research degrades to internal-only
// rather than erroring. Verified live: "מעלות תרשיחא תחבורה" → 5 real results.
export async function firecrawlSearch(query: string, limit = 5): Promise<WebResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || !query.trim()) return [];
  const d = await fcPost("https://api.firecrawl.dev/v1/search", { query: query.trim(), limit }, key, 20000);
  if (!d) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(d?.data) ? d.data : Array.isArray(d?.results) ? d.results : [];
  return rows
    .map((x) => ({
      title: String(x?.title || "").trim(),
      url: String(x?.url || "").trim(),
      description: String(x?.description || x?.snippet || "").trim(),
    }))
    .filter((x) => x.url && x.title && /^https?:\/\//i.test(x.url))
    .slice(0, limit);
}

// v2 /search — supports `sources` (news → results carry a `date`) and `tbs`
// (Google-style time filter: qdr:y, or custom `cdr:1,cd_min:MM/DD/YYYY,cd_max:
// MM/DD/YYYY`). Used by the maturation-timeline feature to pull DATED results
// across years. Verified live: v2 honors cdr date-ranges (v1 ignores them) and
// news results return a real `date`. Returns [] on any failure. Costs 2 credits
// per call (search-only, no scrapeOptions). Not Claude tokens.
export async function firecrawlSearchV2(
  query: string,
  opts: { limit?: number; tbs?: string; news?: boolean } = {}
): Promise<WebResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || !query.trim()) return [];
  const limit = opts.limit ?? 6;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = { query: query.trim(), limit };
  if (opts.tbs) body.tbs = opts.tbs;
  if (opts.news) body.sources = [{ type: "news" }];
  const d = await fcPost("https://api.firecrawl.dev/v2/search", body, key, 25000);
  if (!d) return [];
  const data = d?.data || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = opts.news
    ? (Array.isArray(data?.news) ? data.news : [])
    : (Array.isArray(data?.web) ? data.web : Array.isArray(data) ? data : []);
  return rows
    .map((x) => ({
      title: String(x?.title || "").trim(),
      url: String(x?.url || "").trim(),
      description: String(x?.description || x?.snippet || "").trim(),
      date: x?.date ? String(x.date) : null,
    }))
    .filter((x) => x.url && x.title && /^https?:\/\//i.test(x.url))
    .slice(0, limit);
}

// Friendly Hebrew source label from a URL host (when we don't recognize the
// outlet) — e.g. "https://moovitapp.com/..." → "moovitapp.com".
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
