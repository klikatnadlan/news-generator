import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { firecrawlSearch, hostLabel, reWebQuery } from "@/lib/websearch";

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


// ─── Hebrew word-boundary relevance gate ───────────────────────────────────
//
// The `search_news` RPC matches SUBSTRINGS, and in Hebrew that is catastrophic
// because "-ים" pluralises almost everything. Measured 2026-08-25 on the live
// corpus:
//   "צים"          → 1,277 hits — מציצים, מתרחצים, לוחצים …
//   "רני"          →   715 hits — ציפורניים
//   "פינוי בינוי"  →   372 hits — "פינוי חוף מציצים", "פינוי המוני" (שריפות
//                                  בנבאדה), "הודעת פינוי לעזתים"
//   "רני צים"      → trade-war news, a dental ad, and sea turtles
// This is the same trap that once emptied the home feed ("ירי" ⊂ "מחירים") and
// was fixed in classify.ts — the archive search never got the same treatment.
//
// The gate: EVERY query word must appear at a Hebrew word boundary, allowing a
// single attached prefix letter (ה/ו/ב/כ/ל/מ/ש/ד) so "אשקלון" still matches
// "באשקלון", but never letting a token continue into more root letters.
// Short words (1-2 chars) are skipped — they are prepositions, not signal.
const HEB = "א-ת";
function hebWordRe(word: string): RegExp {
  // Strip anything that is not a letter or a digit instead of escaping regex
  // metacharacters: the query is user text, and a stray "(" or "*" would other-
  // wise build an invalid pattern and throw mid-request.
  const safe = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return new RegExp(`(?:^|[^${HEB}])[הובכלמשד]?${safe}(?![${HEB}])`, "u");
}
function matchesAllWords(text: string, q: string): boolean {
  const words = q.toLowerCase().split(/[\s,"'׳״]+/).filter((w) => w.length > 2);
  if (words.length === 0) return true; // nothing meaningful to test → keep
  const t = text.toLowerCase();
  return words.every((w) => hebWordRe(w).test(t));
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
  const SCAN_LIMIT = 200;
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
  const relevant = query
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
    const cacheKey = `websearch|archive|v2|${query.slice(0, 120)}`;
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
      web = await firecrawlSearch(reWebQuery(query), 8);
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
  });
}
