// Web search via Firecrawl — the "internal Google" fallback for city research.
// Used ONLY when our own corpus is thin for a city+topic (small towns / civic
// topics we don't yet cover). Not Claude tokens — a cheap, separate search API,
// fired ONLY on an explicit מחקר click and cached 24h per city+topic. Aligned
// with the iron rule: AI/expensive work only on click + cached, never on scans.

export type WebResult = { title: string; url: string; description: string; date?: string | null };

// Firecrawl /v1/search → top organic results (title/url/description). Returns []
// on any failure (no key, network, non-200) so research degrades to internal-only
// rather than erroring. Verified live: "מעלות תרשיחא תחבורה" → 5 real results.
export async function firecrawlSearch(query: string, limit = 5): Promise<WebResult[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || !query.trim()) return [];
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), limit }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const d = await res.json();
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
  } catch {
    return [];
  }
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
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const d = await res.json();
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
  } catch {
    return [];
  }
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
