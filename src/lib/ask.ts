import { aiCreate, firstText, repairHebrewQuotes } from "@/lib/anthropic";

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
