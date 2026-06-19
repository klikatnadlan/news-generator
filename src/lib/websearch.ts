// Web search via Firecrawl — the "internal Google" fallback for city research.
// Used ONLY when our own corpus is thin for a city+topic (small towns / civic
// topics we don't yet cover). Not Claude tokens — a cheap, separate search API,
// fired ONLY on an explicit מחקר click and cached 24h per city+topic. Aligned
// with the iron rule: AI/expensive work only on click + cached, never on scans.

export type WebResult = { title: string; url: string; description: string };

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

// Friendly Hebrew source label from a URL host (when we don't recognize the
// outlet) — e.g. "https://moovitapp.com/..." → "moovitapp.com".
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
