# Ask Layer — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Hebrew free-text question box inside LeaderFeed that returns a written, source-cited answer streamed from the app's own 39K-article corpus.

**Architecture:** Three pure-ish stages in `src/lib/ask.ts` — `planQuery` (Haiku turns a Hebrew question into `{mode, terms, from, to}`), `retrieveForPlan` (the existing `search_news` RPC plus the Hebrew word-boundary gate, with a Firecrawl web fallback), and an answer prompt streamed through the existing `aiStream`. A thin SSE route (`/api/ask`) wires them together and emits status events; a client component renders the stream. The three stage functions are exported separately so the Phase-B MCP server imports them rather than duplicating logic.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase Postgres (PostgREST + RPC) · Anthropic SDK 0.39.0 · Firecrawl · Tailwind · vitest (added by this plan)

**Spec:** `docs/superpowers/specs/2026-09-01-ask-layer-design.md`

## Global Constraints

- **Repo:** `C:\Users\ori19\Documents\news-generator-deploy`. This is the deploying repo. `klikavault/news-generator` is NOT.
- **`git pull` before starting.** Commit after every task.
- **Never rewrite a whole file.** Targeted edits only. Read before you edit.
- **Never change existing design, layout, or behaviour.** The only additions to existing screens are one nav item and one home-page button.
- **AI runs only on an explicit user click.** No cron, no background call, no automatic warm-up.
- **Every Anthropic call that returns JSON or bounded output MUST pass `output_config: { effort: "low" }`** via a cast (SDK 0.39.0 types don't know the field). Without it Sonnet/Haiku adaptive thinking eats the entire `max_tokens` and returns HTTP 200 with an empty string.
- **Never index `content[0]`.** Use `firstText(response)` from `@/lib/anthropic`.
- **Every `JSON.parse` of model output MUST run through `repairHebrewQuotes()` first.** Hebrew gershayim (`נדל"ן`) break JSON.
- **Never write the string `גוגל לעסקים`** anywhere user-visible. The internal term is `גוגל פנימי`.
- **Hebrew through Windows `curl` breaks.** Use Python (`urllib` + `json.dumps`) for live probes.
- **The terminal is cp1255.** Never `print()` an emoji or arrow from a probe script — write to a file and read it back.
- Commit messages: Hebrew subject, and end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `src/lib/hebrew-match.ts` | Hebrew word-boundary matching. Moved verbatim out of `api/archive/route.ts` so the archive and the ask layer share one gate. |
| **Create** `src/lib/ask.ts` | The engine: `planQueryByRules`, `planQuery`, `retrieveForPlan`, `buildAnswerPrompt`, `SUGGESTED_QUESTIONS`. No HTTP, no React — importable by the route today and by the MCP server later. |
| **Create** `src/lib/ask-questions.ts` | The six demo questions. Dependency-free on purpose: imported by both a server route and a client component. |
| **Create** `src/lib/ask-quota.ts` | Daily cap. One function, one RPC call. |
| **Create** `src/app/api/ask/route.ts` | SSE route. Wires the three stages, emits status events, reads/writes the cache. |
| **Create** `src/components/ask-panel.tsx` | The UI. Chips, input, streamed answer, source list. Separate from the page so it can be embedded elsewhere later. |
| **Create** `src/app/ask/page.tsx` | Thin page shell: `SiteNav` + `AskPanel`. |
| **Create** `supabase/migrations/005_ask_usage.sql` | `ask_usage` table + `bump_ask_usage` RPC. |
| **Create** `tests/hebrew-match.test.ts`, `tests/ask-plan.test.ts` | The three guard tests. |
| **Modify** `src/app/api/archive/route.ts` | Delete the local `HEB`/`hebWordRe`/`matchesAllWords`/`GENERIC_RE_TERMS`/`trimGenericTerms` and import them. No behaviour change. |
| **Modify** `src/components/site-nav.tsx` | One entry in `LINKS`. |
| **Modify** `src/app/page.tsx` | One button linking to `/ask`. |
| **Modify** `src/app/api/warm/route.ts` | Optional `?ask=1` that pre-runs the suggested questions. |
| **Modify** `package.json` | `vitest` devDependency + `test` script. |

---

### Task 1: Extract the Hebrew gate + stand up tests

The archive's word-boundary gate is the single most valuable 20 lines in this codebase — it is what stops `"צים"` returning 1,277 articles about `מציצים`. The ask layer needs exactly the same gate. A copy would drift, so it moves to a shared module first, with tests, before anything depends on it.

**Files:**
- Create: `src/lib/hebrew-match.ts`
- Create: `tests/hebrew-match.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`
- Modify: `src/app/api/archive/route.ts` (delete lines defining `GENERIC_RE_TERMS`, `trimGenericTerms`, `HEB`, `hebWordRe`, `matchesAllWords`; add one import)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `hebWordRe(word: string): RegExp`
  - `matchesAllWords(text: string, q: string): boolean`
  - `trimGenericTerms(q: string): string`
  - `GENERIC_RE_TERMS: Set<string>`

- [ ] **Step 1: Add vitest**

```bash
npm install -D vitest@^2.1.0
```

Then add to `package.json` `"scripts"` (keep the existing four):

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Add the vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests only — pure functions, no DB and no network. The `@/` alias has to
// be repeated here because vitest does not read tsconfig paths on its own.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `tests/hebrew-match.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchesAllWords, trimGenericTerms } from "@/lib/hebrew-match";

describe("matchesAllWords", () => {
  it('rejects a substring coincidence: "צים" must not match "מציצים"', () => {
    expect(matchesAllWords("חוף מציצים נסגר לרחצה", "צים")).toBe(false);
  });

  it('rejects "רני" inside "ציפורניים"', () => {
    expect(matchesAllWords("מדריך טיפוח ציפורניים", "רני")).toBe(false);
  });

  it('accepts a single attached prefix letter: "אשקלון" matches "באשקלון"', () => {
    expect(matchesAllWords("פרויקט מגורים חדש באשקלון", "אשקלון")).toBe(true);
  });

  it("requires EVERY query word to hit", () => {
    expect(matchesAllWords("רני צים רכש קרקע", "רני צים")).toBe(true);
    expect(matchesAllWords("רני רכש קרקע", "רני צים")).toBe(false);
  });

  it("matches a real headline for a multi-word company name", () => {
    expect(matchesAllWords("שיכון ובינוי מכרה את זרוע האנרגיה", "שיכון ובינוי")).toBe(true);
  });

  it("a punctuation-only query matches nothing", () => {
    // Guard added during extraction. The original stripped punctuation to an
    // empty pattern, which then matched every string — so a user typing "???"
    // in the new ask box would have retrieved the entire corpus as "relevant".
    expect(matchesAllWords("כל טקסט שהוא", "???")).toBe(false);
  });
});

describe("trimGenericTerms", () => {
  it("drops the generic filler that empties a company search", () => {
    expect(trimGenericTerms('שיכון ובינוי נדל"ן')).toBe("שיכון ובינוי");
  });

  it("never trims down to a single word", () => {
    expect(trimGenericTerms('דירות נדל"ן')).toBe('דירות נדל"ן');
  });

  it("leaves a query with no generic words alone", () => {
    expect(trimGenericTerms("רני צים")).toBe("רני צים");
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module '@/lib/hebrew-match'`.

- [ ] **Step 5: Create the shared module**

Create `src/lib/hebrew-match.ts`. The regex and the comment move **verbatim** from `src/app/api/archive/route.ts`; the only change is the empty-pattern guard, which is called out inline.

```ts
// ─── Hebrew word-boundary relevance gate ───────────────────────────────────
//
// Extracted from api/archive/route.ts so the deep-feed search and the ask layer
// share ONE gate. A second copy would drift, and the bug it prevents is the
// most expensive one this codebase has had.
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
// was fixed in classify.ts.
//
// The gate: EVERY query word must appear at a Hebrew word boundary, allowing a
// single attached prefix letter (ה/ו/ב/כ/ל/מ/ש/ד) so "אשקלון" still matches
// "באשקלון", but never letting a token continue into more root letters.
// Short words (1-2 chars) are skipped — they are prepositions, not signal.

const HEB = "א-ת";

// A pattern that can never match anything — used when a "word" strips down to
// nothing at all.
const NEVER = /(?!)/;

export function hebWordRe(word: string): RegExp {
  // Strip anything that is not a letter or a digit instead of escaping regex
  // metacharacters: the query is user text, and a stray "(" or "*" would other-
  // wise build an invalid pattern and throw mid-request.
  const safe = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  // GUARD (new in the extraction): a token made only of punctuation strips to
  // "" and used to build `(?:^|[^א-ת])[הובכלמשד]?(?![א-ת])`, which matches
  // essentially every string. Harmless in the archive UI, where the user types
  // real search terms; not harmless in a free-text question box, where "???"
  // would have made the whole corpus "relevant".
  if (!safe) return NEVER;
  return new RegExp(`(?:^|[^${HEB}])[הובכלמשד]?${safe}(?![${HEB}])`, "u");
}

export function matchesAllWords(text: string, q: string): boolean {
  const words = q.toLowerCase().split(/[\s,"'׳״]+/).filter((w) => w.length > 2);
  if (words.length === 0) return true; // nothing meaningful to test → keep
  const t = text.toLowerCase();
  return words.every((w) => hebWordRe(w).test(t));
}

// Generic real-estate words that add nothing once the query names a specific
// company, project or street — and that are enough to empty a news search.
// Only ever applied as a RETRY, never to the user's first attempt.
export const GENERIC_RE_TERMS = new Set([
  'נדל"ן', "נדל”ן", "נדלן", "דירות", "דירה", "פרויקט", "פרויקטים", "נכס", "נכסים",
]);

export function trimGenericTerms(q: string): string {
  const parts = q.trim().split(/\s+/);
  const kept = parts.filter((w) => !GENERIC_RE_TERMS.has(w));
  // Never trim down to almost nothing — a 1-word query is a different search.
  return kept.length >= 2 && kept.length < parts.length ? kept.join(" ") : q;
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
npm test
```

Expected: PASS, 9 tests.

- [ ] **Step 7: Point the archive at the shared module**

In `src/app/api/archive/route.ts`:

1. Delete the `GENERIC_RE_TERMS` const and the `trimGenericTerms` function (the block starting `// Generic real-estate words that add nothing…`).
2. Delete the whole `// ─── Hebrew word-boundary relevance gate ───` comment block through the end of `matchesAllWords`, including `const HEB = "א-ת";`.
3. Add to the imports at the top:

```ts
import { matchesAllWords, trimGenericTerms } from "@/lib/hebrew-match";
```

Change nothing else in the file. `detectSourceFromUrl`, `THIN`, `WEB_CACHE_HOURS`, `SCAN_LIMIT` and every call site stay exactly as they are.

- [ ] **Step 8: Confirm the archive still builds and behaves**

```bash
npm run build
```

Expected: build succeeds with no type errors. If `.next` is locked, stop the dev server first — a running `next dev` holding `.next` produces a spurious build error on `/api/archive`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/hebrew-match.test.ts src/lib/hebrew-match.ts src/app/api/archive/route.ts
git commit -m "$(cat <<'EOF'
refactor(חיפוש): שער גבול-המילה העברי עובר למודול משותף + בדיקות ראשונות

הארכיון ושכבת השאילה חייבים אותו שער. עותק שני היה נסחף וחוזר
לבאג של "צים" שהחזיר 1,277 תוצאות של "מציצים".

תיקון אחד בהעברה: שאילתה של סימני פיסוק בלבד הצטמצמה לתבנית ריקה
שהתאימה לכל מחרוזת. בארכיון זה לא הזיק, בתיבת שאלה חופשית "???"
היה הופך את כל המאגר ל"רלוונטי".

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The query planner

Turns a Hebrew question into a search plan. The rules-based path is a pure function and is fully tested; the Haiku path is tested by its fallback contract — whatever the model returns, a usable plan comes out.

**Files:**
- Create: `src/lib/ask.ts`
- Create: `tests/ask-plan.test.ts`

**Interfaces:**
- Consumes: `repairHebrewQuotes`, `firstText`, `aiCreate` from `@/lib/anthropic`.
- Produces:
  - `type AskMode = "what_happened" | "analysis" | "compare"`
  - `interface AskPlan { mode: AskMode; terms: string; compareWith: string[]; from: string | null; to: string | null }`
  - `planQueryByRules(question: string, today: Date): AskPlan`
  - `planQuery(question: string, today: Date): Promise<AskPlan>`

- [ ] **Step 1: Write the failing test**

Create `tests/ask-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planQueryByRules } from "@/lib/ask";

const TODAY = new Date("2026-09-01T09:00:00Z");

describe("planQueryByRules", () => {
  it("strips question words and keeps the entity", () => {
    const p = planQueryByRules("מה קרה בשיכון ובינוי החודש?", TODAY);
    expect(p.terms).toBe("בשיכון ובינוי");
    expect(p.mode).toBe("what_happened");
  });

  it('maps "החודש" to a 30-day window', () => {
    const p = planQueryByRules("מה קרה בשיכון ובינוי החודש?", TODAY);
    expect(p.from).toBe("2026-08-02");
    expect(p.to).toBe(null);
  });

  it('maps "השבוע" to a 7-day window', () => {
    expect(planQueryByRules("מה קרה בחדרה השבוע", TODAY).from).toBe("2026-08-25");
  });

  it('matches "החודשיים" before "החודש" (one is a substring of the other)', () => {
    expect(planQueryByRules("מה קרה בחיפה בחודשיים האחרונים", TODAY).from).toBe("2026-07-03");
  });

  it("defaults to a 90-day window when no time phrase is present", () => {
    expect(planQueryByRules("מה קרה ברני צים", TODAY).from).toBe("2026-06-03");
  });

  it("never leaves a time word in the search terms", () => {
    const p = planQueryByRules("מה קרה בפינוי בינוי החודש האחרון", TODAY);
    expect(p.terms).not.toContain("החודש");
    expect(p.terms).not.toContain("האחרון");
  });

  it("survives a question that is only stopwords", () => {
    const p = planQueryByRules("מה קרה?", TODAY);
    expect(p.terms).toBe("");
    expect(p.mode).toBe("what_happened");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test tests/ask-plan.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/ask'`.

- [ ] **Step 3: Write the planner**

Create `src/lib/ask.ts`:

```ts
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
  "החודשיים", "חודשיים", "הרבעון", "רבעון", "השנה", "שנה",
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
    .replace(/[?!.,;:()\[\]]/g, " ")
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test
```

Expected: PASS, 16 tests total (9 from Task 1, 7 here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ask.ts tests/ask-plan.test.ts
git commit -m "$(cat <<'EOF'
feat(שאילה): מתכנן השאילתה - שאלה בעברית למבנה חיפוש

Haiku עם effort:low, ונפילה לכללים בכל כשל. ביטויי זמן ממופים לחלון
תאריכים, ו"החודשיים" נבדק לפני "החודש" כי אחד מכיל את השני.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Retrieval

Reuses the `search_news` RPC and the gate from Task 1, with the archive's proven web fallback. Bounded everywhere: this codebase has produced `57014 statement timeout` six separate times from unbounded fan-out.

**Files:**
- Modify: `src/lib/ask.ts` (append)

**Interfaces:**
- Consumes: `matchesAllWords`, `trimGenericTerms` (Task 1); `AskPlan` (Task 2); `getSupabase` from `@/lib/supabase`; `firecrawlSearch`, `firecrawlSearchV2`, `hostLabel`, `reWebQuery` from `@/lib/websearch`.
- Produces:
  - `interface AskSource { title: string; source: string; url: string; date: string | null; web: boolean }`
  - `interface AskRetrieval { sources: AskSource[]; internalCount: number; webCount: number; widenedTo: string | null }`
  - `retrieveForPlan(plan: AskPlan): Promise<AskRetrieval>`

- [ ] **Step 1: Append the retrieval stage to `src/lib/ask.ts`**

Add these imports at the top of the file, next to the existing ones:

```ts
import { getSupabase } from "@/lib/supabase";
import { matchesAllWords, trimGenericTerms } from "@/lib/hebrew-match";
import { firecrawlSearch, firecrawlSearchV2, hostLabel, reWebQuery } from "@/lib/websearch";
import { mapPool } from "@/lib/rss";
```

Append to the end of the file:

```ts
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

/** One `search_news` call + the Hebrew gate. Returns rows, newest-relevant first. */
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
  // archive: `שיכון ובינוי נדל"ן` returned 1 row from June; `שיכון ובינוי`
  // returned 16, including four from 20.8 and one from 30.8.
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
```

- [ ] **Step 2: Confirm it compiles**

```bash
npm run build
```

Expected: build succeeds. (Stop `next dev` first if `.next` is locked.)

- [ ] **Step 3: Run the existing tests to confirm nothing regressed**

```bash
npm test
```

Expected: PASS, 16 tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ask.ts
git commit -m "$(cat <<'EOF'
feat(שאילה): שליפה חסומה - search_news, שער עברי, ונפילה לוובּ

גבולות נמדדים לכל מצב: 60 ל"מה קרה", 200 לניתוח (בטוח רק עם פילטר
תאריך אחרי האינדקסים), 80 להשוואה. mapPool ולא Promise.all.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Daily cap

`/api/ask` will be a public, unauthenticated endpoint that calls Claude. The app has no rate limiting of any kind today — `CRON_SECRET` guards only the cron and admin routes. Without a cap, anyone who finds the URL can run up the Anthropic bill in a loop.

**Files:**
- Create: `supabase/migrations/005_ask_usage.sql`
- Create: `src/lib/ask-quota.ts`

**Interfaces:**
- Consumes: `getSupabase` from `@/lib/supabase`.
- Produces: `consumeAskQuota(): Promise<{ allowed: boolean; used: number; cap: number }>`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/005_ask_usage.sql`:

```sql
-- Daily cap for /api/ask. The route is public and unauthenticated and it calls
-- Claude, so without a ceiling a loop against the URL runs up the bill.
create table if not exists ask_usage (
  day   date primary key,
  count int  not null default 0
);

-- No policies: the server reads and writes with the service_role key, which
-- bypasses RLS. Enabling RLS with zero policies means the anon key (which ships
-- to every browser) can neither read nor write this table.
alter table ask_usage enable row level security;

-- Atomic check-and-increment. Doing this in one statement matters: two requests
-- landing together on read-then-write would both see "under cap" and both spend.
-- Returns the new count, or -1 when the cap is already reached.
create or replace function bump_ask_usage(p_cap int)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  insert into ask_usage (day, count) values (current_date, 0)
  on conflict (day) do nothing;

  update ask_usage
     set count = count + 1
   where day = current_date
     and count < p_cap
  returning count into v_count;

  return coalesce(v_count, -1);
end;
$$;
```

- [ ] **Step 2: Run the migration**

Paste the file's contents into the Supabase SQL editor and run it. Then verify:

```sql
select count(*) from ask_usage;              -- expect 0
select bump_ask_usage(150);                  -- expect 1
select bump_ask_usage(150);                  -- expect 2
select * from ask_usage;                     -- expect today's date, count = 2
delete from ask_usage where day = current_date;  -- reset after the check
```

- [ ] **Step 3: Write the client**

Create `src/lib/ask-quota.ts`:

```ts
import { getSupabase } from "@/lib/supabase";

// ~10 agorot per uncached question at the analysis tier, so 150 is a hard
// ceiling of roughly 15 shekels a day. Realistic use is 5-20 questions.
const DEFAULT_CAP = 150;

function cap(): number {
  const raw = parseInt(process.env.ASK_DAILY_CAP || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CAP;
}

/**
 * Consume one unit of today's ask budget.
 *
 * Fails OPEN on a DB error: a Supabase blip should not take the feature down in
 * front of a client. The cap exists to stop a runaway loop, not to be a gate we
 * trust for correctness.
 */
export async function consumeAskQuota(): Promise<{ allowed: boolean; used: number; cap: number }> {
  const limit = cap();
  try {
    const { data, error } = await getSupabase().rpc("bump_ask_usage", { p_cap: limit });
    if (error) {
      console.error("[ask] quota check failed, allowing through:", error.message);
      return { allowed: true, used: -1, cap: limit };
    }
    const used = Number(data);
    return { allowed: used >= 0, used, cap: limit };
  } catch (e) {
    console.error("[ask] quota check threw, allowing through:", e instanceof Error ? e.message : e);
    return { allowed: true, used: -1, cap: limit };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_ask_usage.sql src/lib/ask-quota.ts
git commit -m "$(cat <<'EOF'
feat(שאילה): תקרה יומית - הנתיב ציבורי ואין באפליקציה שום הגנת קצב

בדיקה והגדלה בפעולה אטומית אחת: קריאה ואז כתיבה היו נותנות לשתי
בקשות מקבילות לעבור את התקרה. נופל פתוח בשגיאת מסד - תקלה בסופאבייס
לא אמורה להפיל את הפיצ'ר מול לקוח.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The SSE route

**Files:**
- Create: `src/lib/ask-questions.ts`
- Modify: `src/lib/ask.ts` (append the answer prompt)
- Create: `src/app/api/ask/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-4; `aiStream` from `@/lib/anthropic`.
- Produces:
  - `SUGGESTED_QUESTIONS: string[]` (from `@/lib/ask-questions` — a dependency-free module both the server and the client import)
  - `buildAnswerPrompt(question: string, plan: AskPlan, r: AskRetrieval): string`
  - `GET /api/ask?q=...` → `text/event-stream`

- [ ] **Step 1: Put the suggested questions in their own module**

They are needed by the server (`/api/warm`) *and* by a client component (the chips). `ask.ts` imports Supabase, Anthropic and Firecrawl, so importing it from a `"use client"` component would drag all of that into the browser bundle. A standalone constants module is the only place both sides can safely read from — and it keeps one list, not two that drift.

Create `src/lib/ask-questions.ts`:

```ts
/**
 * The demo script. These are what the chips show, what /api/warm?ask=1 pre-runs,
 * and therefore the ones guaranteed to be instant and good in front of a client.
 * Deliberately spread across the three modes so a demo can show all of them.
 *
 * Deliberately dependency-free: imported by both a server route and a client
 * component, so it must never pull in Supabase, Anthropic or Firecrawl.
 */
export const SUGGESTED_QUESTIONS: string[] = [
  "מה קרה בשיכון ובינוי החודש?",
  "מה קורה בפינוי בינוי בחיפה?",
  "מי היזמים שהופיעו הכי הרבה בחדשות החודש?",
  "מה חדש במחיר למשתכן?",
  "תשווה את הכיסוי של אשקלון מול נתניה",
  "מה קרה בשוק המשכנתאות בחודש האחרון?",
];
```

- [ ] **Step 2: Append the prompt builder to `src/lib/ask.ts`**

```ts
export function buildAnswerPrompt(question: string, plan: AskPlan, r: AskRetrieval): string {
  const list = r.sources
    .map((s, i) => {
      const bits = [s.source, s.date].filter(Boolean).join(" · ");
      return `[${i + 1}] ${s.title}${bits ? ` (${bits})` : ""}`;
    })
    .join("\n");

  const windowLine = plan.from ? `החלון: מ-${plan.from} עד היום.` : "החלון: כל המאגר.";
  const basisLine =
    plan.mode === "analysis"
      ? `\nזו שאלת ספירה. פתח את התשובה במשפט שמצהיר על הבסיס: "על בסיס ${r.sources.length} כותרות ${plan.from ? `מ-${plan.from}` : ""}". אל תציג את הספירה כמדידה מדויקת.`
      : "";
  const webLine = r.webCount
    ? `\n${r.internalCount} מהמקורות הם מהמאגר שלנו ו-${r.webCount} מחיפוש חי ברשת. אם המאגר שלנו דל בנושא, אמור זאת במשפט אחד.`
    : "";

  return `אתה אנליסט נדל"ן שעונה על שאלה מתוך מאגר כתבות. ${windowLine}

השאלה: "${question}"

המקורות (${r.sources.length}, ממוספרים):
${list}

כתוב תשובה בעברית עסקית, עד 250 מילים.

כללים מחייבים:
1. התבסס אך ורק על המקורות שקיבלת. אל תמציא שם, מספר, תאריך או עובדה שלא מופיעים בהם.
2. אחרי כל טענה ציין את מספר המקור בסוגריים מרובעים, לדוגמה [3]. טענה בלי מקור אסורה.
3. אם המקורות לא מספיקים כדי לענות, אמור זאת במפורש ותאר מה כן ידוע. אל תמלא בניחושים.
4. בלי מקפים ארוכים.
5. בלי פתיחה מנומסת ובלי סיכום שחוזר על עצמו. תתחיל מהתשובה.${basisLine}${webLine}`;
}
```

- [ ] **Step 3: Write the route**

Create `src/app/api/ask/route.ts`:

```ts
import { NextRequest } from "next/server";
import { aiStream } from "@/lib/anthropic";
import { getSupabase } from "@/lib/supabase";
import { consumeAskQuota } from "@/lib/ask-quota";
import { planQuery, retrieveForPlan, buildAnswerPrompt, type AskSource } from "@/lib/ask";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Streaming answer endpoint for the in-app ask box.
 *
 * Protocol (extends the one in /api/digest with a `status` event):
 *   event: status  data: {"phase":"planning"|"searching"|"found","text":"…","count":n}
 *   data: {"text":"<chunk>"}                      … while Claude writes
 *   event: done    data: {"sources":[…],"mode":"…","basis":"…","cached":false}
 *   event: error   data: {"error":"…"}
 *
 * CLICK-ONLY. Nothing calls this on a schedule; the standing rule here is that
 * Claude runs on an explicit user action and nowhere else.
 */

// Answers about "this month" go stale. Six hours keeps a demo instant without
// serving yesterday's news as today's.
const CACHE_HOURS = 6;

const normalize = (q: string) =>
  q.toLowerCase().replace(/[?!.,;:"'׳״()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);

function sse(encoder: TextEncoder, event: string | null, payload: unknown): Uint8Array {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  return encoder.encode(event ? `event: ${event}\n${data}` : data);
}

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const question = (sp.get("q") || "").trim().slice(0, 300);
  const refresh = sp.get("refresh") === "1";

  if (!question) {
    return new Response(JSON.stringify({ error: "חסרה שאלה" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const supabase = getSupabase();
  const cacheKey = `ask|v1|${normalize(question)}`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ─── Cache: a repeat question costs nothing and returns instantly ───
        if (!refresh) {
          try {
            const { data: cached } = await supabase
              .from("narrative_cache")
              .select("narratives, created_at")
              .eq("cache_key", cacheKey)
              .maybeSingle();
            const ageH = cached?.created_at
              ? (Date.now() - new Date(cached.created_at).getTime()) / 3_600_000
              : Infinity;
            if (cached?.narratives?.answer && ageH < CACHE_HOURS) {
              const c = cached.narratives;
              controller.enqueue(sse(encoder, "status", { phase: "found", text: `${c.sources?.length || 0} מקורות (מהזיכרון)`, count: c.sources?.length || 0 }));
              controller.enqueue(sse(encoder, null, { text: c.answer }));
              controller.enqueue(sse(encoder, "done", { ...c, cached: true }));
              controller.close();
              return;
            }
          } catch { /* cache miss → answer fresh */ }
        }

        // ─── Quota: only for answers that will actually cost money ───
        const quota = await consumeAskQuota();
        if (!quota.allowed) {
          controller.enqueue(sse(encoder, "error", {
            error: `נגמרה מכסת השאלות להיום (${quota.cap}). שאלות שכבר נשאלו עדיין עונות מיד.`,
          }));
          controller.close();
          return;
        }

        // ─── 1. Plan ───
        controller.enqueue(sse(encoder, "status", { phase: "planning", text: "מנתח את השאלה…" }));
        const plan = await planQuery(question, new Date());

        // ─── 2. Retrieve ───
        controller.enqueue(sse(encoder, "status", { phase: "searching", text: "מחפש במאגר…" }));
        const r = await retrieveForPlan(plan);

        if (r.sources.length === 0) {
          controller.enqueue(sse(encoder, "status", { phase: "found", text: "לא נמצאו מקורות", count: 0 }));
          controller.enqueue(sse(encoder, null, {
            text: `לא מצאתי כתבות על "${question}" — לא במאגר שלנו ולא בחיפוש חי. נסה לנסח אחרת, או לשאול על שם חברה, פרויקט או עיר.`,
          }));
          controller.enqueue(sse(encoder, "done", { sources: [], mode: plan.mode, basis: "", cached: false }));
          controller.close();
          return;
        }

        const outlets = new Set(r.sources.map((s) => s.source).filter(Boolean)).size;
        controller.enqueue(sse(encoder, "status", {
          phase: "found",
          text: `${r.sources.length} כתבות מ-${outlets} מקורות`,
          count: r.sources.length,
          webCount: r.webCount,
        }));

        // ─── 3. Answer ───
        let answer = "";
        for await (const chunk of aiStream({
          model: "claude-sonnet-5",
          max_tokens: 2000,
          messages: [{ role: "user", content: buildAnswerPrompt(question, plan, r) }],
        })) {
          answer += chunk;
          controller.enqueue(sse(encoder, null, { text: chunk }));
        }

        const payload = {
          answer,
          sources: r.sources as AskSource[],
          mode: plan.mode,
          basis: `${r.sources.length} כתבות${plan.from ? ` · מ-${plan.from}` : ""}`,
          widenedTo: r.widenedTo,
          webCount: r.webCount,
        };

        // Persist only a real answer — caching an empty string would serve the
        // failure back for six hours. An empty answer is the signature of the
        // thinking budget eating max_tokens, so log it loudly if it happens.
        if (answer.trim()) {
          try {
            await supabase.from("narrative_cache").upsert(
              { cache_key: cacheKey, narratives: payload, count: r.sources.length, created_at: new Date().toISOString() },
              { onConflict: "cache_key" },
            );
          } catch (e) {
            console.error("[ask] failed to cache answer:", e instanceof Error ? e.message : e);
          }
        } else {
          console.error(`[ask] EMPTY answer for "${question}" with ${r.sources.length} sources`);
        }

        controller.enqueue(sse(encoder, "done", { ...payload, cached: false }));
      } catch (err) {
        console.error("[ask] failed:", err);
        controller.enqueue(sse(encoder, "error", {
          error: err instanceof Error ? err.message : "שגיאה לא צפויה",
        }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 5: Probe it locally**

Start the dev server, then run this from the scratchpad (Python, because Hebrew through Windows `curl` breaks, and writing to a file because the terminal is cp1255):

```python
import urllib.parse, urllib.request, io, sys
q = urllib.parse.quote("מה קרה בשיכון ובינוי החודש?")
out = io.open("ask-probe.txt", "w", encoding="utf-8")
with urllib.request.urlopen(f"http://localhost:3000/api/ask?q={q}", timeout=90) as r:
    for line in r:
        out.write(line.decode("utf-8"))
out.close()
```

Then read `ask-probe.txt`. Expected: `status` events, then `data:` text chunks, then a `done` event with a non-empty `sources` array.

**If the answer is empty** — that is the thinking-budget failure. Add `...({ output_config: { effort: "low" } } as any)` to the `aiStream` call and re-probe.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ask-questions.ts src/lib/ask.ts src/app/api/ask/route.ts
git commit -m "$(cat <<'EOF'
feat(שאילה): נתיב SSE - תשובה מוזרמת עם מקורות ממוספרים

שורת סטטוס בזמן אמת במקום שש שניות של שקט. מטמון 6 שעות (תשובה על
"החודש" מתיישנת), ומכסה נצרכת רק כשבאמת הולכים לשלם.
תשובה ריקה לא נכנסת למטמון - זו החתימה של החשיבה שבולעת max_tokens.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The UI

Matches the existing dark shell exactly — `#0f1419` surfaces, `rgba(255,255,255,…)` text, `#dc2626` accent, `dir="rtl"`, DM Sans. No existing style is touched.

**Files:**
- Create: `src/components/ask-panel.tsx`
- Create: `src/app/ask/page.tsx`

**Interfaces:**
- Consumes: `GET /api/ask` (Task 5).
- Produces: `<AskPanel />`

- [ ] **Step 1: Write the panel**

Create `src/components/ask-panel.tsx`:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { SUGGESTED_QUESTIONS } from "@/lib/ask-questions";

interface Source {
  title: string;
  source: string;
  url: string;
  date: string | null;
  web: boolean;
}

// One list, shared with /api/warm?ask=1 — the chips and the pre-warm MUST be the
// same strings or the cache never hits and the "instant" demo path is a lie.
const CHIPS = SUGGESTED_QUESTIONS;

export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [basis, setBasis] = useState("");
  const [cached, setCached] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lastAsked = useRef("");

  const ask = useCallback(async (q: string, refresh = false) => {
    const text = q.trim();
    if (!text || busy) return;
    lastAsked.current = text;
    setBusy(true);
    setAnswer(""); setSources([]); setError(""); setBasis(""); setCached(false);
    setStatus("שולח…");

    try {
      const url = `/api/ask?q=${encodeURIComponent(text)}${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(url);
      if (!res.body) throw new Error("אין תשובה מהשרת");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          let event: string | null = null;
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (!data) continue;
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(data); } catch { continue; }

          if (event === "status") setStatus(String(parsed.text || ""));
          else if (event === "error") setError(String(parsed.error || "שגיאה"));
          else if (event === "done") {
            setSources((parsed.sources as Source[]) || []);
            setBasis(String(parsed.basis || ""));
            setCached(Boolean(parsed.cached));
            setStatus("");
          } else if (typeof parsed.text === "string") {
            setAnswer((prev) => prev + parsed.text);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "משהו השתבש. נסה שוב.");
    } finally {
      setBusy(false);
      setStatus("");
    }
  }, [busy]);

  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-[20px] font-extrabold text-white mb-1" style={{ fontFamily: "DM Sans, system-ui" }}>
        שאל את לידרפיד
      </h1>
      <p className="text-[12px] mb-5" style={{ color: "rgba(255,255,255,0.45)" }}>
        שאלה בעברית חופשית. התשובה נכתבת מהכתבות שבמאגר, עם קישור לכל מקור.
      </p>

      {/* input */}
      <div className="flex items-center gap-2 rounded-xl px-3 h-12 mb-3"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(question)}
          placeholder="מה קרה בשיכון ובינוי החודש?"
          dir="rtl"
          disabled={busy}
          className="flex-1 bg-transparent text-[14px] text-white placeholder-white/35 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={() => ask(question)}
          disabled={busy || !question.trim()}
          className="text-[12px] font-bold px-4 py-1.5 rounded-lg text-white disabled:opacity-40"
          style={{ background: "#dc2626" }}
        >
          {busy ? "…" : "שאל"}
        </button>
      </div>

      {/* chips */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {CHIPS.map((c) => (
          <button
            key={c}
            onClick={() => { setQuestion(c); ask(c); }}
            disabled={busy}
            className="text-[11px] px-2.5 py-1.5 rounded-full transition-colors hover:bg-white/10 disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* status */}
      {status && (
        <div className="flex items-center gap-2 text-[12px] mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {status}
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3 mb-4 text-[12.5px]"
          style={{ background: "rgba(220,38,38,0.12)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.25)" }}>
          {error}
        </div>
      )}

      {/* answer */}
      {answer && (
        <div className="rounded-xl p-4 mb-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[14px] leading-[1.85] whitespace-pre-wrap" style={{ color: "rgba(255,255,255,0.9)" }}>
            {answer}
          </p>
          {!busy && (basis || cached) && (
            <div className="flex items-center gap-2 mt-3 pt-3 text-[10.5px]"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}>
              {basis && <span>{basis}</span>}
              {cached && <span>· מהזיכרון</span>}
              <button onClick={() => ask(lastAsked.current, true)} className="mr-auto hover:text-white/70">
                רענן
              </button>
            </div>
          )}
        </div>
      )}

      {/* sources */}
      {sources.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            המקורות ({sources.length})
          </h2>
          <ol className="space-y-1.5">
            {sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="flex gap-2 text-[12px]">
                <span className="tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>[{i + 1}]</span>
                <a href={s.url} target="_blank" rel="noopener noreferrer"
                  className="hover:underline" style={{ color: "rgba(255,255,255,0.72)" }}>
                  {s.title}
                  <span className="mr-1.5 text-[10.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {[s.source, s.date, s.web ? "רשת" : ""].filter(Boolean).join(" · ")}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/ask/page.tsx`:

```tsx
import { SiteNav } from "@/components/site-nav";
import { AskPanel } from "@/components/ask-panel";

export const metadata = { title: "שאל את לידרפיד" };

export default function AskPage() {
  return (
    <>
      <SiteNav />
      <AskPanel />
    </>
  );
}
```

- [ ] **Step 3: Build and view**

```bash
npm run build
```

Then start the dev server and open `http://localhost:3000/ask`. Click the first chip. Expected: the status line ticks through `מנתח את השאלה…` → `מחפש במאגר…` → `N כתבות מ-M מקורות`, then text appears progressively, then a numbered source list.

- [ ] **Step 4: Commit**

```bash
git add src/components/ask-panel.tsx src/app/ask/page.tsx
git commit -m "$(cat <<'EOF'
feat(שאילה): מסך השאלה - צ'יפים, סטטוס חי, ותשובה מוזרמת עם מקורות

תואם לקליפה הקיימת: אותם צבעים, אותו RTL, אותה טיפוגרפיה.
שום סגנון קיים לא נגעתי בו.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Entry points and pre-warm

**Files:**
- Modify: `src/components/site-nav.tsx` (the `LINKS` array)
- Modify: `src/app/page.tsx` (one button)
- Modify: `src/app/api/warm/route.ts` (the `targets` array)

**Interfaces:**
- Consumes: `SUGGESTED_QUESTIONS` from `@/lib/ask` (Task 5); `/ask` (Task 6).
- Produces: nothing new.

- [ ] **Step 1: Add the nav item**

In `src/components/site-nav.tsx`, insert into `LINKS` directly after the `/alerts` entry (so it sits with the other "thinking" surfaces, before the city/portal group). Change nothing else in the array:

```ts
  { href: "/ask", label: "שאל את לידרפיד", emoji: "💬" },
```

- [ ] **Step 2: Add the home-page entry**

In `src/app/page.tsx`, add a link immediately after the existing `<SiteNav />`. Do not move, restyle, or remove anything already on the page:

```tsx
      <div dir="rtl" className="max-w-3xl mx-auto px-4 pt-4">
        <a href="/ask"
          className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/10"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <span className="text-[15px]">💬</span>
          <span className="text-[13px] font-semibold text-white">שאל את לידרפיד</span>
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            שאלה בעברית, תשובה עם מקורות
          </span>
        </a>
      </div>
```

- [ ] **Step 3: Pre-warm the suggested questions**

In `src/app/api/warm/route.ts`, add the import:

```ts
import { SUGGESTED_QUESTIONS } from "@/lib/ask-questions";
```

Then, immediately after the existing `if (city) { … }` block and before the `// Sequential on purpose` comment, add:

```ts
  // The ask box's demo script. Each of these costs 5-10 agorot once and is then
  // cached for six hours, so the chips answer instantly in front of a client.
  // Opt-in via ?ask=1 — the standing rule is that Claude runs on a click, and
  // this endpoint IS the click.
  if (sp.get("ask") === "1") {
    for (const q of SUGGESTED_QUESTIONS) {
      targets.push({ label: `ask:${q.slice(0, 24)}`, url: `${base}/api/ask?q=${encodeURIComponent(q)}` });
    }
  }
```

And update the `hint` string at the bottom so the new switch is discoverable. Replace the existing `hint` value with:

```ts
      hint: city
        ? "מוכן. פתח את העמוד — התשובות כבר בקאש."
        : "מוכן. להוסיף עיר: /api/warm?city=אשקלון · לחמם את תיבת השאלה: /api/warm?ask=1",
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/site-nav.tsx src/app/page.tsx src/app/api/warm/route.ts
git commit -m "$(cat <<'EOF'
feat(שאילה): כניסות + חימום מראש של שאלות ההדגמה

/api/warm?ask=1 מריץ את שש השאלות המוכנות לפני פרזנטציה, כך שהצ'יפים
עונים מיד. שתי כניסות בלבד למסכים קיימים - שום אלמנט קיים לא זז.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Live verification

Nothing here is "done" until it has been seen working on the deployed site, on both a desktop and a mobile viewport. A passing build is not evidence.

**Files:** none.

- [ ] **Step 1: Deploy**

```bash
git push
```

Wait for the Vercel deployment to report ready before probing.

- [ ] **Step 2: Confirm the quota table is reachable in production**

Run the suggested questions through the warm endpoint against the live host:

Get the production URL first (do not guess it):

```bash
npx vercel ls --scope=$(npx vercel whoami) 2>/dev/null | head -20
```

Then, substituting that host:

```bash
curl -s "https://PRODUCTION-HOST/api/warm?ask=1"
```

Expected: `"ok": true` and one `warmed` entry per suggested question, each with `ok: true`. A `500` here means the `bump_ask_usage` migration did not run against the production database — go back to Task 4 Step 2.

- [ ] **Step 3: Three real questions through the live UI**

Open `/ask` on the deployed site and ask, by typing (not by clicking a chip — chips are now cached):

1. `מה קרה ברני צים` — a specific company
2. `מה קורה בהתחדשות עירונית בבת ים` — a topic plus a city
3. `מה קרה בעיריית מצפה רמון` — deliberately thin coverage, to exercise the web fallback and the honest empty state

For each, confirm: the status line advances, text streams in progressively, every claim carries a `[n]`, and the source count matches the list length.

- [ ] **Step 4: Open every source link from question 1**

Click through each numbered source. Every link must open a real article that exists. A dead or wrong link is a blocking failure — the citation is the whole value of the feature.

- [ ] **Step 5: Mobile**

Load `/ask` at a 375px viewport. Confirm: the chips wrap instead of overflowing, the input row does not scroll horizontally, the answer text is readable, and the source list does not clip. Take a screenshot.

- [ ] **Step 6: Confirm the cache**

Ask question 1 again. Expected: the answer appears effectively instantly, and the footer reads `מהזיכרון`. Then press `רענן` and confirm it re-answers from scratch.

- [ ] **Step 7: Report**

Write up what was measured: response times for each of the three questions (cold and cached), source counts, and the mobile screenshot. Report any question that produced a weak answer verbatim rather than summarising it as "works".

---

## Out of scope for this plan

- **Stage 2 — `analysis` and `compare`.** These ship *structurally* in Stage 1: the planner prompt describes all three modes, `retrieveForPlan` branches on `mode` with its own scan budget, and `buildAnswerPrompt` emits the basis line for `analysis`. What Stage 1 does **not** do is verify them. Task 8 tests only `what_happened` questions. Stage 2 is therefore a *tuning and verification* plan — measure real counting questions, check whether the basis statement reads honestly, tune the planner prompt — not a build. Do not claim analysis or comparison works until that plan runs.
- **Stage 3** — the 📱 / 📝 / 📋 output buttons.
- **Phase B** — the MCP server importing `planQuery` / `retrieveForPlan` from `src/lib/ask.ts`.
