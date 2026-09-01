import { aiCreate, firstText, repairHebrewQuotes } from "@/lib/anthropic";
import { getSupabase } from "@/lib/supabase";
import { matchesAllWords, trimGenericTerms } from "@/lib/hebrew-match";
import { firecrawlSearch, firecrawlSearchV2, hostLabel, reWebQuery } from "@/lib/websearch";
import { mapPool } from "@/lib/rss";

export type AskMode = "what_happened" | "analysis" | "compare";

export interface AskPlan {
  mode: AskMode;
  /** Space-joined search terms, fed straight to the `search_news` RPC. */
  terms: string;
  /** Extra entities for `compare` mode — one extra search per entry. */
  compareWith: string[];
  /** ISO date (YYYY-MM-DD) or null for "no lower bound". */
  from: string | null;
  to: string | null;
}

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (today: Date, days: number) => iso(new Date(today.getTime() - days * DAY_MS));

// Question words and connectives that carry no search signal.
const STOPWORDS = new Set([
  "מה", "מי", "למה", "איך", "איזה", "איזו", "אילו", "כמה", "האם", "יש", "קרה", "קורה",
  "של", "עם", "על", "את", "זה", "זו", "לי", "לנו", "אני", "היה", "היו", "הוא", "היא",
  "לגבי", "בנוגע", "תגיד", "ספר", "תספר", "בבקשה", "או", "גם", "כל", "עוד", "רק",
  "תן", "תראה", "יכול", "אפשר", "צריך", "בערך", "בדיוק", "וגם", "אבל",
]);

// Time expressions. ORDER MATTERS: "החודשיים" contains "החודש" as a substring,
// so the longer phrase must be tested first or a two-month question silently
// becomes a one-month one.
const TIME_PHRASES: Array<[RegExp, number]> = [
  [/חודשיים/, 60],
  [/השבועיים/, 14],
  [/הרבעון|רבעון/, 90],
  [/החודש|חודש אחרון/, 30],
  [/השבוע|שבוע אחרון/, 7],
  [/אתמול/, 2],
  [/היום/, 1],
  [/השנה|שנה אחרונה/, 365],
];

// Removed from the search terms so a time phrase never becomes a search word.
const TIME_WORDS = new Set([
  "היום", "אתמול", "השבוע", "שבוע", "השבועיים", "שבועיים", "החודש", "חודש",
  "החודשיים", "חודשיים", "בחודשיים", "הרבעון", "רבעון", "השנה", "שנה",
  "האחרון", "האחרונה", "האחרונים", "האחרונות", "אחרון", "אחרונים", "לאחרונה",
]);

/**
 * Rules-only plan. Used directly as the fallback whenever the model planner
 * fails, and on its own it is good enough for the common "מה קרה ב־X" shape.
 * Pure and synchronous, so it is the part that carries the tests.
 */
export function planQueryByRules(question: string, today: Date): AskPlan {
  const q = (question || "").trim();

  let days = 90;
  for (const [re, d] of TIME_PHRASES) {
    if (re.test(q)) { days = d; break; }
  }

  const terms = q
    .replace(/[?!.,;:()[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w))
    .filter((w) => !TIME_WORDS.has(w))
    .filter((w) => w.length > 1)
    .join(" ");

  return { mode: "what_happened", terms, compareWith: [], from: daysAgo(today, days), to: null };
}

const PLAN_SYSTEM = `אתה ממיר שאלות בעברית למבנה חיפוש. אתה מחזיר JSON בלבד, בלי טקסט לפניו או אחריו ובלי גדרות קוד.`;

function planPrompt(question: string, todayIso: string): string {
  return `היום ${todayIso}.

השאלה: "${question}"

החזר בדיוק את המבנה הזה:
{"mode":"what_happened","terms":"","compareWith":[],"from":"YYYY-MM-DD","to":null}

כללי mode:
- "what_happened" — שאלה על מה קרה בנושא, בחברה או בעיר.
- "analysis" — שאלה שדורשת ספירה או דירוג ("מי הכי", "כמה", "אילו הופיעו").
- "compare" — שאלה שמשווה שתי ישויות. terms = הראשונה, compareWith = [השנייה].

כללי terms:
- רק שם הישות או הנושא, כפי שהוא מופיע בכתבות.
- בלי מילות שאלה, בלי ביטויי זמן, בלי מילות קישור.
- דוגמה: "מה קרה בשיכון ובינוי החודש?" → terms = "שיכון ובינוי"

כללי תאריך:
- ביטוי זמן בשאלה → תרגם אותו ל-from.
- אין ביטוי זמן → from = 90 יום לפני היום.
- to = null אלא אם השאלה מגבילה במפורש עד תאריך.`;
}

/** Strip ```json fences a model sometimes adds despite being told not to. */
function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/**
 * Plan a question with Haiku, falling back to rules on ANY failure.
 *
 * `effort: "low"` is mandatory. Without it the adaptive thinking budget expands
 * to fill max_tokens and the call returns HTTP 200 with an empty string — the
 * exact failure that silently killed /api/narratives on 31.8.2026.
 */
export async function planQuery(question: string, today: Date): Promise<AskPlan> {
  const fallback = planQueryByRules(question, today);
  try {
    const resp = await aiCreate({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: PLAN_SYSTEM,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ output_config: { effort: "low" } } as any),
      messages: [{ role: "user", content: planPrompt(question, iso(today)) }],
    });

    const raw = stripFences(firstText(resp));
    if (!raw) {
      console.error("[ask] planner returned empty text → rules fallback");
      return fallback;
    }

    // Hebrew gershayim inside a JSON string value break JSON.parse. This has
    // already broken the narratives route and the news mode.
    const parsed = JSON.parse(repairHebrewQuotes(raw));

    const mode: AskMode =
      parsed.mode === "analysis" || parsed.mode === "compare" ? parsed.mode : "what_happened";
    const terms = typeof parsed.terms === "string" ? parsed.terms.trim() : "";
    if (!terms) {
      console.error("[ask] planner returned no terms → rules fallback");
      return fallback;
    }

    const dateOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

    return {
      mode,
      terms,
      compareWith: Array.isArray(parsed.compareWith)
        ? parsed.compareWith.filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 2)
        : [],
      from: dateOk(parsed.from) ? parsed.from : fallback.from,
      to: dateOk(parsed.to) ? parsed.to : null,
    };
  } catch (e) {
    console.error("[ask] planner failed → rules fallback:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

// ─── Retrieval ─────────────────────────────────────────────────────────────

export interface AskSource {
  title: string;
  source: string;
  url: string;
  date: string | null;
  web: boolean;
}

export interface AskRetrieval {
  sources: AskSource[];
  internalCount: number;
  webCount: number;
  /** Set when the exact terms were too narrow and we dropped generic filler. */
  widenedTo: string | null;
}

// Per-mode scan budgets. Every number here is measured, not guessed:
//   60  — a broad Hebrew query over the full corpus answered 57014 at both 200
//         and 120 rows without a date filter, and came back in 2.3s at 60.
//   200 — safe WITH a date filter after the 2026-09-01 indexes: 3.21s / 200 rows.
const SCAN: Record<AskMode, number> = { what_happened: 60, analysis: 200, compare: 80 };
// Below this many internal hits, top up from the web instead of answering thin.
const THIN = 4;
const WEB_CACHE_HOURS = 24;
// Analysis counts over a 30-day window by default — a year of headlines is both
// slower and less useful for "what is happening now".
const ANALYSIS_MAX_DAYS = 30;

function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const l = url.toLowerCase();
  if (l.includes("klikatnadlan.co.il")) return 'קליקת הנדל"ן';
  if (l.includes("globes.co.il")) return "גלובס";
  if (l.includes("calcalist.co.il")) return "כלכליסט";
  if (l.includes("themarker.com")) return "דה מרקר";
  if (l.includes("ynet.co.il")) return "ynet";
  if (l.includes("maariv.co.il")) return "מעריב";
  if (l.includes("bizportal.co.il")) return "ביזפורטל";
  if (l.includes("walla.co.il")) return "וואלה";
  if (l.includes("israelhayom.co.il")) return "ישראל היום";
  if (l.includes("ice.co.il")) return "ICE";
  if (l.includes("kan.org.il")) return "כאן";
  if (l.includes("nadlancenter.co.il")) return 'מרכז הנדל"ן';
  if (l.includes("magdilim.co.il")) return "מגדילים";
  if (l.includes("madlan.co.il")) return "מדלן";
  return null;
}

const stripTags = (s: string) => (s || "").replace(/<[^>]*>/g, "").trim();
const urlKey = (u: string) => String(u || "").toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "");

/** One `search_news` call + the Hebrew gate. Returns rows, title-hits first. */
async function searchGated(
  terms: string,
  from: string | null,
  to: string | null,
  limit: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("search_news", {
    p_query: terms,
    p_from: from,
    p_to: to,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) {
    // A swallowed RPC error here would read as "this topic has no coverage",
    // which is exactly how the city briefing reported "אין מספיק באזים" for
    // every city for weeks while the data sat right there.
    console.error(`[ask] search_news failed for "${terms}":`, error.message);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[])
    .filter((r) => matchesAllWords(`${r.title || ""} ${r.summary || ""}`, terms))
    // Title hits first. Local outlets paste a city menu into every summary, so a
    // summary match may be boilerplate while a headline match is the story.
    .sort((a, b) => {
      const at = matchesAllWords(a.title || "", terms) ? 1 : 0;
      const bt = matchesAllWords(b.title || "", terms) ? 1 : 0;
      return bt - at;
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSource(r: any): AskSource {
  const dateIso = (r.published_at || r.fetched_at || "") as string;
  return {
    title: stripTags(r.title),
    source: detectSourceFromUrl(r.source_url) || r.source || "",
    url: r.source_url || "",
    date: dateIso ? dateIso.slice(0, 10) : null,
    web: false,
  };
}

/** Web top-up, cached 24h per query. Mirrors the archive: news mode, then a
 *  trimmed retry, then plain organic. */
async function webTopUp(terms: string): Promise<AskSource[]> {
  const supabase = getSupabase();
  const cacheKey = `websearch|ask|v1|${terms.slice(0, 120)}`;
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
    // News mode returns dated, recent coverage; organic answers a company name
    // with its homepage and Wikipedia. But news mode is brittle about extra
    // words, so one trimmed retry before falling back to organic.
    web = await firecrawlSearchV2(terms, { limit: 8, news: true });
    if (web.length === 0) {
      const trimmed = trimGenericTerms(terms);
      if (trimmed !== terms) web = await firecrawlSearchV2(trimmed, { limit: 8, news: true });
    }
    if (web.length === 0) web = await firecrawlSearch(reWebQuery(terms), 8);
    if (web.length) {
      try {
        await supabase.from("narrative_cache").upsert(
          { cache_key: cacheKey, narratives: web, count: web.length, created_at: new Date().toISOString() },
          { onConflict: "cache_key" },
        );
      } catch { /* best-effort */ }
    }
  }

  return web.map((w) => ({
    title: stripTags(String(w.title || "")),
    source: detectSourceFromUrl(String(w.url)) || hostLabel(String(w.url)),
    url: String(w.url || ""),
    date: typeof w.date === "string" && w.date ? w.date.slice(0, 10) : null,
    web: true,
  }));
}

/**
 * Retrieve the sources a plan asks for. Zero AI tokens — SQL and (only when the
 * corpus is thin) one cached Firecrawl call.
 */
export async function retrieveForPlan(plan: AskPlan): Promise<AskRetrieval> {
  const limit = SCAN[plan.mode];
  let widenedTo: string | null = null;

  // Analysis counts headlines, so cap its window even if the planner asked for
  // more — 200 rows over a year is a slower query and a mushier answer.
  let from = plan.from;
  if (plan.mode === "analysis" && from) {
    const floor = daysAgo(new Date(), ANALYSIS_MAX_DAYS);
    if (from < floor) from = floor;
  }

  const queries = [plan.terms, ...(plan.mode === "compare" ? plan.compareWith : [])].filter(Boolean);
  if (queries.length === 0) return { sources: [], internalCount: 0, webCount: 0, widenedTo: null };

  // Bounded, NOT Promise.all. Firing every query at once is the exact pattern
  // that made Postgres cancel all nine dossier topics with 57014.
  const perQuery = await mapPool(queries, 2, (q) => searchGated(q, from, plan.to, limit));
  let rows = perQuery.flat();

  // If requiring EVERY word leaves almost nothing, retry once without the
  // generic real-estate filler — and re-ask the DATABASE, not the filter, since
  // the rows we want were never returned in the first place. Measured on the
  // archive: the query WITH the generic word returned 1 row from June; without
  // it, 16 rows including four from 20.8 and one from 30.8.
  if (rows.length < 5 && queries.length === 1) {
    const trimmed = trimGenericTerms(plan.terms);
    if (trimmed !== plan.terms) {
      const wider = await searchGated(trimmed, from, plan.to, limit);
      // Only swap if widening at least doubles the set, so a query with a few
      // genuinely good exact matches keeps them.
      if (wider.length >= Math.max(rows.length * 2, THIN)) {
        rows = wider;
        widenedTo = trimmed;
      }
    }
  }

  // Dedupe by URL, then by title — the same story syndicated to two outlets
  // would otherwise be counted twice in an analysis answer.
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const sources: AskSource[] = [];
  for (const r of rows) {
    const s = toSource(r);
    const uk = urlKey(s.url);
    const tk = s.title.slice(0, 80);
    if (!s.title || (uk && seenUrl.has(uk)) || seenTitle.has(tk)) continue;
    if (uk) seenUrl.add(uk);
    seenTitle.add(tk);
    sources.push(s);
  }

  const internalCount = sources.length;
  let webCount = 0;
  if (internalCount < THIN) {
    const web = await webTopUp(plan.terms);
    for (const w of web) {
      const uk = urlKey(w.url);
      if (!w.title || !uk || seenUrl.has(uk)) continue;
      seenUrl.add(uk);
      sources.push(w);
      webCount++;
    }
  }

  return { sources, internalCount, webCount, widenedTo };
}
