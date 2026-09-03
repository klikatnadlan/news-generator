import { aiCreate, firstText, repairHebrewQuotes } from "@/lib/anthropic";
import { getSupabase } from "@/lib/supabase";
import { matchesAllWords, trimGenericTerms, stripHebrewPrefixes } from "@/lib/hebrew-match";
import { firecrawlSearch, firecrawlSearchV2, hostLabel, reWebQuery } from "@/lib/websearch";
import { mapPool } from "@/lib/rss";
import { isRealEstate, dedupeStories } from "@/lib/classify";
import { getPulseFacts, pulseFactLines, questionWantsMarketFacts } from "@/lib/pulse";

export type AskMode = "what_happened" | "analysis" | "compare";

export interface AskPlan {
  mode: AskMode;
  /** Space-joined search terms, fed straight to the `search_news` RPC. */
  terms: string;
  /** Extra entities for `compare` mode — one extra search per entry. */
  compareWith: string[];
  /**
   * Analysis mode only: the question ranks or counts entities WITHOUT naming a
   * subject to search for ("מי היזמים שהופיעו הכי הרבה").
   *
   * This distinction decides the whole retrieval. Measured 2026-09-01 in
   * production: that question planned `terms = "יזמים"`, which matched 21
   * articles out of the 11,661 in the window — the ones that happen to use the
   * literal word. An article about רני צים never says "יזמים", so the answer
   * correctly reported finding no repeated developer. The sample was an
   * artifact of the keyword, not a picture of the month.
   *
   * A census retrieves the window's HIGHEST-SCORING articles instead and lets
   * the model count names across them.
   */
  census: boolean;
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
/**
 * Days implied by an explicit time phrase, or null when the question has none.
 *
 * Separate from `planQueryByRules` because the model planner is NOT trusted with
 * dates: measured 2026-09-01, Haiku answered `from = today-90` for every one of
 * four probe questions, including "מה קרה בשיכון ובינוי החודש?". The answer then
 * opened with "בחודש האחרון" and cited events from June — a real accuracy fault
 * in a tool people quote. Rules are deterministic and tested; they win on dates.
 */
export function timePhraseDays(question: string): number | null {
  const q = (question || "").trim();
  for (const [re, d] of TIME_PHRASES) {
    if (re.test(q)) return d;
  }
  return null;
}

export function planQueryByRules(question: string, today: Date): AskPlan {
  const q = (question || "").trim();

  // No time phrase means NO LOWER BOUND — search the whole archive.
  //
  // This used to default to 90 days, which quietly made LeaderFeed a
  // three-month tool. The archive is the point: a question with no stated
  // period should reach everything we hold, the way a search engine does.
  // All-time queries measured 1.8-4.0s after the 2026-09-01 indexes.
  const days = timePhraseDays(q);

  const terms = q
    .replace(/[?!.,;:()[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w))
    .filter((w) => !TIME_WORDS.has(w))
    .filter((w) => w.length > 1)
    .join(" ");

  return {
    mode: "what_happened",
    terms,
    compareWith: [],
    census: false,
    from: days === null ? null : daysAgo(today, days),
    to: null,
  };
}

// Category words that name a CLASS rather than a subject. A question whose
// remaining terms are only these is asking "who, among everyone" — there is
// nothing to search for, so searching for the class word itself samples the
// corpus by vocabulary instead of by substance.
const CENSUS_WORDS = new Set([
  "יזמים", "יזם", "יזמיות", "קבלנים", "קבלן", "חברות", "חברה", "שחקנים",
  "ערים", "עיר", "אזורים", "נושאים", "מגמות", "אנשים", "בנקים", "משקיעים",
]);

const PLAN_SYSTEM = `אתה ממיר שאלות בעברית למבנה חיפוש. אתה מחזיר JSON בלבד, בלי טקסט לפניו או אחריו ובלי גדרות קוד.`;

function planPrompt(question: string, todayIso: string): string {
  return `היום ${todayIso}.

השאלה: "${question}"

החזר בדיוק את המבנה הזה:
{"mode":"what_happened","terms":"","compareWith":[],"census":false,"from":"YYYY-MM-DD","to":null}

כללי mode:
- "what_happened" — שאלה על מה קרה בנושא, בחברה או בעיר.
- "analysis" — שאלה שדורשת ספירה או דירוג ("מי הכי", "כמה", "אילו הופיעו").
- "compare" — שאלה שמשווה שתי ישויות. terms = הראשונה, compareWith = [השנייה].

כלל census (רלוונטי רק ל-analysis):
- census=true כשהשאלה מדרגת או סופרת ישויות **בלי לנקוב בישות מסוימת** —
  "מי היזמים שהופיעו הכי הרבה", "אילו ערים בלטו", "מי החברות הפעילות".
  במקרה כזה terms יכול להישאר ריק, כי אין מה לחפש.
- census=false כשהספירה נוגעת לנושא ספציფי — "כמה כתבות היו על פינוי בינוי",
  "כמה פעמים הוזכרה חיפה". אז terms = הנושא.

כללי terms:
- רק שם הישות או הנושא, כפי שהוא מופיע בכתבות.
- בלי מילות שאלה, בלי ביטויי זמן, בלי מילות קישור.
- **הסר אותיות שימוש מחוברות (ב/ל/מ/ה/ו/כ/ש)**. החיפוש מדויק ואינו מוצא "בשיכון".
  "בשיכון ובינוי" → "שיכון ובינוי" · "ברני צים" → "רני צים" · "בבת ים" → "בת ים" · "בחיפה" → "חיפה"
- דוגמאות מלאות:
  "מה קרה בשיכון ובינוי החודש?" → terms = "שיכון ובינוי"
  "מה קורה בהתחדשות עירונית בבת ים" → terms = "התחדשות עירונית בת ים"

כללי תאריך:
- ביטוי זמן בשאלה ("החודש", "השבוע", "השנה") → תרגם אותו ל-from.
- שנה מפורשת בשאלה ("ב-2016") → from = תחילת אותה שנה, to = סופה, **והשאר את השנה גם בתוך terms**. היא חלק ממה שמחפשים, לא רק פילטר.
- **אין ביטוי זמן → from = null.** חיפוש בכל הארכיון, בלי גבול תחתון. אל תמציא חלון.
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
    // NO `output_config: { effort }` here. Haiku 4.5 rejects it outright:
    //   400 invalid_request_error "This model does not support the effort parameter"
    // The effort knob exists for the Sonnet-5 generation, whose ADAPTIVE thinking
    // expands to fill max_tokens and returns an empty string. Haiku 4.5 has no
    // adaptive thinking, so there is no budget to starve and nothing to cap.
    // Measured 2026-09-01: with the parameter, every planner call 400'd and
    // silently fell back to rules — which is how "בשיכון" reached the RPC.
    const resp = await aiCreate({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: PLAN_SYSTEM,
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

    // A census legitimately has no terms — there is no subject to search for.
    // Trust the model's flag, but also catch the case it misses: analysis whose
    // only remaining words name a class ("יזמים") rather than a subject.
    const termWords = terms.split(/\s+/).filter(Boolean);
    const census =
      mode === "analysis" &&
      (parsed.census === true ||
        termWords.length === 0 ||
        termWords.every((w: string) => CENSUS_WORDS.has(w)));

    if (!terms && !census) {
      console.error("[ask] planner returned no terms → rules fallback");
      return fallback;
    }

    const dateOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

    // Date resolution, in priority order:
    //  1. An explicit time phrase ("החודש") — the rules resolve it exactly, and
    //     trusting the model here produced a 90-day window for EVERY question.
    //  2. An explicit year ("ב-2016") — the model's from/to are right for that.
    //  3. Neither — NO lower bound. The model likes to invent a window, and an
    //     invented window silently turns the whole archive into three months.
    const hasPhrase = timePhraseDays(question) !== null;
    const hasYear = explicitYear(question) !== null;
    const from = hasPhrase
      ? fallback.from
      : hasYear && dateOk(parsed.from)
        ? parsed.from
        : null;

    return {
      mode,
      terms,
      compareWith: Array.isArray(parsed.compareWith)
        ? parsed.compareWith.filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 2)
        : [],
      census,
      from,
      to: hasYear && dateOk(parsed.to) ? parsed.to : null,
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
  /** Set when the question asked about a period older than the corpus, so the
   *  answer came from the live web instead. Drives the honesty note. */
  historical?: { year: string | null; corpusStart: string; webQuery: string };
  /** Official CBS / Bank of Israel / Chief Economist figures, when the question
   *  is one they answer. Free, no tokens, each carrying its own period. */
  marketFacts?: string[];
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

/**
 * Dates arrive in two shapes and only one of them is sliceable.
 *
 * DB rows carry ISO timestamps. Firecrawl news results carry RELATIVE strings
 * ("17 hours ago", "3 weeks ago"), and slicing those to 10 chars silently
 * produced "17 hours a" / "3 weeks ag" in the source list — measured on the
 * first live probe.
 */
const normDate = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
};
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
    date: normDate(dateIso),
    web: false,
  };
}

/**
 * How long retrieval may spend before the answer must start streaming.
 *
 * Vercel's ceiling for this plan is 60s for the WHOLE request, and the answer
 * itself streams for 15-25s. Measured 2026-09-01: a question with no internal
 * coverage ("מה קרה בעיריית מצפה רמון") walked the full Firecrawl chain — news,
 * trimmed news, then organic — and the request took 61.9s. On Vercel that is a
 * truncated answer in front of a client, not a slow one.
 *
 * So the chain is a BUDGET, not a sequence: each further web attempt only runs
 * if there is time left for it. Fewer web sources beats a severed stream.
 */
const RETRIEVE_BUDGET_MS = 20_000;

/**
 * The oldest article this corpus holds. Measured 2026-09-01 by browsing the
 * archive by date with no query: 2015-2019 → 0 rows, 2020-2023 → 0, 2024-2025 →
 * 0, Jan-Apr 2026 → 5,075, May 2026 onward → 34,694. The RSS scan only ever
 * collected forward from when it was switched on.
 *
 * This is why "why can Google find it and we can't" has a real answer: Google
 * crawled the web since 2015, our archive started this year. What closes the
 * gap is the live web search below — as long as the QUESTION'S YEAR survives
 * long enough to reach it.
 */
export const CORPUS_START = "2026-01-01";

/** An explicit year named in the question ("מה קרה במחיר למשתכן ב-2016"). */
export function explicitYear(question: string): string | null {
  const m = /(?:^|[^\d])((?:19|20)\d{2})(?![\d])/.exec(question || "");
  return m ? m[1] : null;
}

/** Web top-up, cached 24h per query. Mirrors the archive: news mode, then a
 *  trimmed retry, then plain organic — each gated on the remaining budget. */
async function webTopUp(terms: string, deadline: number): Promise<AskSource[]> {
  const timeLeft = () => deadline - Date.now();
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
    // Each attempt needs roughly 8s of headroom; without the guard the three of
    // them together pushed a single request to 61.9s against a 60s ceiling.
    if (timeLeft() > 8_000) {
      web = await firecrawlSearchV2(terms, { limit: 8, news: true });
    }
    if (web.length === 0 && timeLeft() > 8_000) {
      const trimmed = trimGenericTerms(terms);
      if (trimmed !== terms) web = await firecrawlSearchV2(trimmed, { limit: 8, news: true });
    }
    if (web.length === 0 && timeLeft() > 8_000) {
      web = await firecrawlSearch(reWebQuery(terms), 8);
    }
    if (web.length === 0) {
      console.error(`[ask] web fallback produced nothing for "${terms}" (${Math.round(timeLeft() / 1000)}s of budget left)`);
    }
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
    date: normDate(w.date),
    web: true,
  }));
}

/**
 * Retrieve the sources a plan asks for. Zero AI tokens — SQL and (only when the
 * corpus is thin) one cached Firecrawl call.
 */
/** How many of the window's top-scoring articles a census counts across. */
const CENSUS_LIMIT = 200;

/**
 * Retrieval for a census question ("מי הופיע הכי הרבה"): the window's
 * HIGHEST-SCORING articles, not the ones matching a keyword.
 *
 * Mirrors /api/news/week — `score >= 30`, ordered desc — because that is
 * already this app's definition of "the stories that mattered". The
 * real-estate filter and story dedupe come along for the same reason the home
 * feed uses them: a ranking built on syndicated duplicates counts one story
 * three times.
 */
async function retrieveCensus(from: string | null): Promise<AskSource[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("news_scores")
    .select("scan_date, score, news_items(title, summary, source, source_url, published_at, fetched_at)")
    .gte("score", 30)
    .order("score", { ascending: false })
    .limit(CENSUS_LIMIT * 2); // over-fetch: the filters below remove a lot
  if (from) q = q.gte("scan_date", from);

  const { data, error } = await q;
  if (error) {
    console.error("[ask] census query failed:", error.message);
    return [];
  }

  const seenTitle = new Set<string>();
  const out: AskSource[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data || []) as any[]) {
    const item = row.news_items;
    if (!item?.title) continue;
    if (!isRealEstate(item.title || "", item.summary || "", item.source || "")) continue;
    const key = String(item.title).slice(0, 80);
    if (seenTitle.has(key)) continue;
    seenTitle.add(key);
    out.push(toSource(item));
    if (out.length >= CENSUS_LIMIT) break;
  }
  return dedupeStories(out);
}

/**
 * The official figures, fetched only when the question is about them.
 *
 * Free and fast (one parallel HTTP round trip, no tokens), so it runs alongside
 * retrieval rather than after it. Failure is never fatal: an answer built from
 * articles alone is the old behaviour, not a regression.
 */
async function marketFactsFor(question: string): Promise<string[] | undefined> {
  if (!questionWantsMarketFacts(question)) return undefined;
  try {
    const lines = pulseFactLines(await getPulseFacts());
    return lines.length ? lines : undefined;
  } catch (e) {
    console.error("[ask] market facts failed:", e instanceof Error ? e.message : e);
    return undefined;
  }
}

export async function retrieveForPlan(plan: AskPlan, question = ""): Promise<AskRetrieval> {
  const deadline = Date.now() + RETRIEVE_BUDGET_MS;
  const limit = SCAN[plan.mode];
  let widenedTo: string | null = null;
  const factsPromise = marketFactsFor(question);

  // ─── Historical question: the archive cannot help, so go straight to the web ───
  //
  // Measured 2026-09-01: "מה קרה במחיר למשתכן ב-2016" planned terms="משתכן" and
  // from="2016-01-01". The year became a DATE FILTER on a corpus that starts in
  // 2026 (so: zero rows), and was STRIPPED from the search terms — so the web
  // search that ran to rescue it searched for "משתכן" with no year and returned
  // eight articles from 2026. The answer then correctly reported that none of
  // its sources were about 2016.
  //
  // Google finds 2016 because the year is part of what you type. Here the year
  // has to survive into the web query, and the corpus lookup has to be skipped
  // rather than searched and found empty.
  const year = explicitYear(question);
  const asksBeforeCorpus = (year !== null && `${year}-12-31` < CORPUS_START)
    || (!!plan.from && plan.from < CORPUS_START);

  if (asksBeforeCorpus) {
    const webQuery = [plan.terms, year].filter(Boolean).join(" ").trim();
    const web = await webTopUp(webQuery || plan.terms, deadline);
    return {
      sources: web,
      internalCount: 0,
      webCount: web.length,
      widenedTo: null,
      historical: { year, corpusStart: CORPUS_START, webQuery },
      marketFacts: await factsPromise,
    };
  }

  // A census has no subject to search for. Answering it from a keyword match
  // samples the corpus by vocabulary: "יזמים" hit 21 of the window's 11,661
  // articles, so the month's actual developers were invisible.
  if (plan.mode === "analysis" && plan.census) {
    const sources = await retrieveCensus(plan.from);
    return { sources, internalCount: sources.length, webCount: 0, widenedTo: null, marketFacts: await factsPromise };
  }

  // A census ranks "who stood out lately", so it stays bounded — spreading 200
  // top headlines across the whole archive answers a different question. Every
  // other mode now searches as far back as the archive goes.
  let from = plan.from;
  if (plan.mode === "analysis" && plan.census) {
    const floor = daysAgo(new Date(), ANALYSIS_MAX_DAYS);
    if (!from || from < floor) from = floor;
  }

  const queries = [plan.terms, ...(plan.mode === "compare" ? plan.compareWith : [])].filter(Boolean);
  if (queries.length === 0) return { sources: [], internalCount: 0, webCount: 0, widenedTo: null, marketFacts: await factsPromise };

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

  // Last resort: drop attached Hebrew prefixes. The RPC matches substrings, so
  // "בשיכון" finds nothing while "שיכון" finds the coverage — and when the model
  // planner is unavailable the rules fallback DOES emit prefixed terms (it takes
  // the question's words as typed). Without this the feature degrades to "our
  // corpus is empty" the moment the planner has a bad day, which is precisely
  // what the first live probe looked like.
  if (rows.length < 5 && queries.length === 1) {
    const stripped = stripHebrewPrefixes(plan.terms);
    if (stripped !== plan.terms) {
      const wider = await searchGated(stripped, from, plan.to, limit);
      if (wider.length >= Math.max(rows.length * 2, THIN)) {
        rows = wider;
        widenedTo = stripped;
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
    const web = await webTopUp(plan.terms, deadline);
    for (const w of web) {
      const uk = urlKey(w.url);
      if (!w.title || !uk || seenUrl.has(uk)) continue;
      seenUrl.add(uk);
      sources.push(w);
      webCount++;
    }
  }

  return { sources, internalCount, webCount, widenedTo, marketFacts: await factsPromise };
}

// ─── The answer prompt ─────────────────────────────────────────────────────

export function buildAnswerPrompt(question: string, plan: AskPlan, r: AskRetrieval): string {
  const list = r.sources
    .map((s, i) => {
      const bits = [s.source, s.date].filter(Boolean).join(" · ");
      return `[${i + 1}] ${s.title}${bits ? ` (${bits})` : ""}`;
    })
    .join("\n");

  const windowLine = plan.from ? `החלון: מ-${plan.from} עד היום.` : "החלון: כל המאגר.";
  const window = plan.from ? ` מ-${plan.from}` : "";
  const basisLine = plan.census
    ? `
זו שאלת דירוג. קיבלת את ${r.sources.length} הכתבות **המדורגות הגבוה ביותר** בתקופה, לא את כל הכתבות.
פתח במשפט שמצהיר על הבסיס בדיוק כך: "על בסיס ${r.sources.length} הכתבות הבולטות${window}".
עבור על הכותרות, זהה שמות של חברות ואנשים, וספור בכמה כותרות שונות כל שם מופיע.
דרג לפי מספר האזכורים וציין את המספר ליד כל שם. אל תמנה שם שמופיע פעם אחת בלבד כ"בולט".
זו ספירה מהכותרות ולכן היא קירוב. אמור זאת במשפט אחד בסוף, בלי להתנצל.`
    : plan.mode === "analysis"
      ? `\nזו שאלת ספירה. פתח את התשובה במשפט שמצהיר על הבסיס: "על בסיס ${r.sources.length} כותרות${window}". אל תציג את הספירה כמדידה מדויקת.`
      : "";
  const webLine = r.historical
    ? `
השאלה נוגעת לתקופה שקודמת לארכיון שלנו (הארכיון מתחיל ב-${r.historical.corpusStart}), ולכן כל ${r.sources.length} המקורות מגיעים מחיפוש חי ברשת.
**בדוק את התאריך של כל מקור לפני שאתה מסתמך עליו.** אם המקורות אינם מהתקופה שנשאלה, אמור זאת במשפט הראשון בבירור, ואל תציג מידע מתקופה אחרת כאילו הוא עונה על השאלה.
אם חלק מהמקורות כן עוסקים בתקופה שנשאלה, בנה עליהם את התשובה וציין שהיא מבוססת על מקורות מהרשת ולא על הארכיון שלנו.`
    : r.webCount
      ? `\n${r.internalCount} מהמקורות הם מהמאגר שלנו ו-${r.webCount} מחיפוש חי ברשת. אם המאגר שלנו דל בנושא, אמור זאת במשפט אחד.`
      : "";

  // Official figures go ABOVE the articles and are marked as a different kind of
  // evidence: they are measurements, not reporting, and each carries the month
  // it belongs to. Without the period a July mortgage rate reads as "today" in
  // December, which is exactly how a valuation tool loses trust.
  const factsBlock = r.marketFacts?.length
    ? `

נתונים רשמיים (הלמ"ס / בנק ישראל / הכלכלן הראשי) — לא כתבות, אלא מדידות:
${r.marketFacts.map((l) => `• ${l}`).join("\n")}

כללים לנתונים האלה:
- מותר להסתמך עליהם גם אם אף כתבה לא מזכירה אותם. הם מהמאגר שלנו.
- **חובה לציין את התקופה** ליד כל מספר ("נכון למאי 2026"). אל תציג מספר מחודש קודם כאילו הוא של היום.
- אין להם מספר מקור בסוגריים. יש לייחס אותם בשם ("לפי הלמ\"ס", "נתוני בנק ישראל").
- אם הם סותרים כתבה, הצג את שניהם וציין מה מהם מדידה רשמית ומה דיווח.`
    : "";

  return `אתה אנליסט נדל"ן שעונה על שאלה מתוך מאגר כתבות. ${windowLine}

השאלה: "${question}"

המקורות (${r.sources.length}, ממוספרים):
${list}${factsBlock}

כתוב תשובה בעברית עסקית, עד 250 מילים.

כללים מחייבים:
1. התבסס אך ורק על המקורות שקיבלת. אל תמציא שם, מספר, תאריך או עובדה שלא מופיעים בהם.
2. אחרי כל טענה ציין את מספר המקור בסוגריים מרובעים, לדוגמה [3]. טענה בלי מקור אסורה.
3. אם המקורות לא מספיקים כדי לענות, אמור זאת במפורש ותאר מה כן ידוע. אל תמלא בניחושים.
4. בלי מקפים ארוכים.
5. בלי פתיחה מנומסת ובלי סיכום שחוזר על עצמו. תתחיל מהתשובה.${basisLine}${webLine}`;
}
