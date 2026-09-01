import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { firecrawlSearch, firecrawlSearchV2, hostLabel, reWebQuery } from "@/lib/websearch";
// The Hebrew word-boundary gate moved to lib — the ask layer needs the same one,
// and a second copy would drift back into the "צים" ⊂ "מציצים" bug.
import { matchesAllWords, trimGenericTerms } from "@/lib/hebrew-match";

// Below this many internal hits a query is "thin" → top it up from the web.
const THIN = 3;
const WEB_CACHE_HOURS = 24;

// Map a source URL to a clean Hebrew source name (incl. קליקת הנדל"ן).
function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
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
  if (lower.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (lower.includes("magdilim.co.il")) return "מגדילים";
  if (lower.includes("madlan.co.il")) return "מדלן";
  if (lower.includes("homeless.co.il")) return "הומלס";
  if (lower.includes("dira.co.il")) return "דירה";
  return null;
}


// Sized like the other Firecrawl-touching routes (research is 45s). A cold
// web fallback measured 31.9s before its 24h cache warmed; without this the
// platform default could cut the request off mid-search.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 20;
  const offset = (page - 1) * limit;

  // Full-corpus search via the search_news RPC: searches ALL news_items (not
  // just scored ones — that hid ~75% of the archive) with light Hebrew stemming
  // so "פרויקטים בחולון" finds "פרויקט … חולון". Empty query = browse by date.
  //
  // With a query we deliberately over-fetch and paginate AFTER the relevance
  // gate below. Filtering a single 20-row page would make both the result count
  // and the pager lie, since most of what the RPC returns for a Hebrew query is
  // substring noise. SCAN_LIMIT bounds the cost; a query with more raw hits than
  // this is reported as "at least", never silently truncated.
  // 60, measured. A broad Hebrew query over the full corpus times out above
  // this: `שיכון ובינוי נדל"ן` all-time answered 57014 at both 200 and 120 rows
  // and came back in 2.3s at 60 — which is why searching WITHOUT a date filter
  // returned a bare 500 while the same search with one worked.
  const SCAN_LIMIT = 60;
  const { data, error } = await supabase.rpc("search_news", {
    p_query: query,
    p_from: from || null,
    p_to: to || null,
    p_limit: query ? SCAN_LIMIT : limit,
    p_offset: query ? 0 : offset,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRows = (data || []) as any[];
  const rawTotal = rawRows.length > 0 ? Number(rawRows[0].total) || 0 : 0;

  // Drop substring coincidences before anything downstream counts them. Doing
  // this here matters twice over: the reader stops seeing nonsense, AND the
  // web-fallback threshold below now sees the TRUE internal depth, so a query
  // we genuinely do not cover goes out to the web instead of being "answered"
  // with junk that happened to clear the count.
  let relevant = query
    ? rawRows
        .filter((r) => matchesAllWords(`${r.title || ""} ${r.summary || ""}`, query))
        // Title hits first. Local outlets paste a city menu ("אופקים אור יהודה
        // … אשקלון …") into every summary, so a search for a city name matched
        // a fire in בית דגן before it matched anything actually about the city.
        // A match in the headline is about the story; a match in the summary may
        // only be boilerplate.
        .sort((a, b) => {
          const at = matchesAllWords(a.title || "", query) ? 1 : 0;
          const bt = matchesAllWords(b.title || "", query) ? 1 : 0;
          return bt - at;
        })
    : rawRows;
  // If requiring EVERY word leaves almost nothing, retry the gate without the
  // generic real-estate filler.
  //
  // This is the actual answer to "it doesn't find the recent ones". Searching
  // `שיכון ובינוי נדל"ן` returned a single item from June, while `שיכון ובינוי`
  // returned 16 — including 30.8 and four from 20.8 (the extortion probe, the
  // A+ upgrade, the energy-arm sale). Our own coverage was there the whole time;
  // the word "נדל״ן" excluded it, because those articles simply never say it
  // next to the company name. The user's exact query still wins whenever it
  // finds enough — this only rescues the thin case.
  let widened: string | null = null;
  // Threshold is 5, not THIN(3): three results for a company name is still a
  // thin, unrepresentative answer, and the same search minus one generic word
  // returned 16. The swap only happens if widening at least DOUBLES the result
  // set, so a query that genuinely has 4 good exact matches keeps them.
  const WIDEN_BELOW = 5;
  if (query && relevant.length < WIDEN_BELOW) {
    const trimmed = trimGenericTerms(query);
    if (trimmed !== query) {
      // Re-ask the DATABASE, not just the filter. The RPC receives the full
      // query, so the rows we want were never in `rawRows` to begin with —
      // re-filtering what came back cannot recover them. Measured: the exact
      // query returned 1 row from June, the trimmed one returns 16 including
      // 30.8 and four from 20.8.
      const { data: widerData } = await supabase.rpc("search_news", {
        p_query: trimmed,
        p_from: from || null,
        p_to: to || null,
        p_limit: SCAN_LIMIT,
        p_offset: 0,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wider = ((widerData || []) as any[])
        .filter((r) => matchesAllWords(`${r.title || ""} ${r.summary || ""}`, trimmed))
        .sort((a, b) => {
          const at = matchesAllWords(a.title || "", trimmed) ? 1 : 0;
          const bt = matchesAllWords(b.title || "", trimmed) ? 1 : 0;
          return bt - at;
        });
      if (wider.length >= Math.max(relevant.length * 2, THIN)) {
        relevant = wider;
        widened = trimmed;
      }
    }
  }
  const droppedIrrelevant = rawRows.length - relevant.length;
  const total = query ? relevant.length : rawTotal;
  // Paginate the FILTERED set (the RPC already gave us the whole scan window).
  const rows = query ? relevant.slice(offset, offset + limit) : relevant;
  const scanTruncated = query && rawRows.length >= SCAN_LIMIT;

  // "גוגל פנימי": a search that finds nothing is a coverage gap — log it so we
  // can close it (new source / keywords). Fire-and-forget, never blocks.
  if (query && total === 0 && page === 1) {
    supabase.from("search_gaps").insert({ query: query.slice(0, 200), results: 0, page: "archive" }).then(() => {}, () => {});
  }

  type ArchiveItem = {
    id: string; title: string; summary: string; source: string; url: string;
    created_at: string; score: number | null; scan_date: string | null; web?: boolean;
  };
  const items: ArchiveItem[] = rows.map((r) => {
    const dateIso = (r.published_at || r.fetched_at || "") as string;
    return {
      id: r.id,
      title: (r.title || "").replace(/<[^>]*>/g, ""),
      summary: (r.summary || "").replace(/<[^>]*>/g, ""),
      source: detectSourceFromUrl(r.source_url) || r.source || "",
      url: r.source_url || "",
      created_at: r.fetched_at || r.published_at || "",
      score: r.score ?? null,
      scan_date: dateIso ? dateIso.slice(0, 10) : null,
      web: false,
    };
  });

  // 🌐 "גוגל פנימי" for the deep-feed: when our own corpus is thin for this
  // query (a specific project/developer we simply haven't covered — e.g.
  // "ברוך שפינוזה פתח תקווה שפיר"), go out and search the WEB, so the search
  // answers instead of returning nothing. Not Claude tokens; fires only on a
  // real user query, only on page 1, only when thin, and cached 24h per query.
  const webItems: ArchiveItem[] = [];
  if (query && total < THIN && page === 1) {
    // v2 = real-estate-scoped queries; bumping the key retires caches built with
    // the old bare query (which could hold off-topic results).
    // v3 — the web fallback switched from organic to news-first. Without the bump,
    // every query already cached would keep serving yesterday's corporate
    // homepages for 24h and the fix would look like it did nothing.
    const cacheKey = `websearch|archive|v3|${query.slice(0, 120)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let web: any[] = [];
    try {
      const { data: cached } = await supabase
        .from("narrative_cache")
        .select("narratives, created_at")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (cached?.created_at) {
        const ageH = (Date.now() - new Date(cached.created_at).getTime()) / 3_600_000;
        if (ageH < WEB_CACHE_HOURS && Array.isArray(cached.narratives)) web = cached.narratives;
      }
    } catch { /* cache miss → fetch fresh */ }

    if (web.length === 0) {
      // Scope the web query to real estate so an ambiguous name doesn't land in
      // another world (see reWebQuery: "שפיר ברוך שפינוזה" → the philosopher).
      // News first, then a trimmed retry, then plain organic.
      //
      // Organic search answers a company name with its own homepage, Wikipedia
      // and Facebook — measured on `שיכון ובינוי נדל"ן`: 6 results, 0 dated, all
      // corporate pages, while real coverage from 6 HOURS earlier existed and
      // was never surfaced. News mode returns it, dated.
      //
      // The catch is that news mode is brittle about extra words: the query as
      // typed returned ZERO, and dropping the generic "נדל״ן" returned 6 recent
      // dated stories (an immediate disclosure 6h old, a bond upgrade, an
      // acquisition). Same lesson as the city-research queries — one redundant
      // term empties a news search. So if the full query finds nothing, retry
      // once without the generic real-estate filler, which carries no signal
      // when the query already names a specific entity.
      web = await firecrawlSearchV2(query, { limit: 8, news: true });
      if (web.length === 0) {
        const trimmed = trimGenericTerms(query);
        if (trimmed !== query) {
          web = await firecrawlSearchV2(trimmed, { limit: 8, news: true });
        }
      }
      // Last resort: organic, still domain-scoped by reWebQuery.
      if (web.length === 0) web = await firecrawlSearch(reWebQuery(query), 8);
      if (web.length) {
        try {
          await supabase.from("narrative_cache").upsert(
            { cache_key: cacheKey, narratives: web, count: web.length, created_at: new Date().toISOString() },
            { onConflict: "cache_key" }
          );
        } catch { /* best-effort */ }
      }
    }

    const seen = new Set(items.map((it) => (it.url || "").toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "")));
    for (const w of web) {
      const key = String(w.url || "").toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      webItems.push({
        id: `web:${w.url}`,
        title: String(w.title || "").replace(/<[^>]*>/g, ""),
        summary: String(w.description || "").replace(/<[^>]*>/g, ""),
        source: detectSourceFromUrl(String(w.url)) || hostLabel(String(w.url)),
        url: String(w.url),
        created_at: "",
        score: null,
        scan_date: null,
        web: true,
      });
    }
  }

  // Web results come after ours (ours are dated + scored), but they're what turns
  // a dead end into an answer.
  const merged = [...items, ...webItems];

  return NextResponse.json({
    items: merged,
    total: total + webItems.length,
    webCount: webItems.length,
    internalTotal: total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    // How many substring coincidences the relevance gate removed, and whether
    // the scan window was full. Reported rather than hidden so a thin result is
    // readable as "we filtered noise" instead of "the search is broken".
    filteredOut: droppedIrrelevant,
    scanTruncated,
    // Set when the exact query was too narrow and we widened it, so the UI can
    // say so instead of quietly answering a different question.
    widenedTo: widened,
  });
}
