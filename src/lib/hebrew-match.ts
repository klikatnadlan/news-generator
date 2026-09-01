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

// Letters that attach to the front of a Hebrew word (ה/ו/ב/כ/ל/מ/ש/ד).
const PREFIX_LETTERS = "הובכלמשד";

/**
 * Drop one attached prefix letter per word.
 *
 * Why this exists: `search_news` matches SUBSTRINGS, so a query carrying a
 * prefix finds almost nothing — no article contains the literal "בשיכון", and
 * `בשיכון ובינוי` returned 1 row where `שיכון ובינוי` returns 6 in the same
 * window (measured 2026-09-01). The gate in this file already tolerates a
 * prefix when FILTERING; the RPC cannot when RETRIEVING.
 *
 * The stripped form is a strict superset for retrieval ("שיכון" ⊂ "בשיכון"), so
 * this never loses a row. It can add noise — "מחירים" strips to "חירים",
 * "בנייה" to "נייה" — which is why callers use it only as a LAST-RESORT retry
 * on an already-thin result, and always re-gate on the stripped terms so the
 * optional-prefix rule in `hebWordRe` accepts both forms.
 *
 * The 4-character floor is load-bearing, not arbitrary: `matchesAllWords` SKIPS
 * words of 2 characters or fewer, so stripping a 3-letter word down to 2 would
 * silently remove it from the gate and let unrelated articles through. Four in
 * means three out, which is still gated. It also keeps "בית" and "של" whole.
 * (Measured 2026-09-01: a floor of 5 left "ברני צים" un-stripped and the query
 * returned 0 internal rows for a company we cover.)
 */
export function stripHebrewPrefixes(q: string): string {
  return q
    .split(/\s+/)
    .map((w) => (w.length >= 4 && PREFIX_LETTERS.includes(w[0]) ? w.slice(1) : w))
    .join(" ");
}

export function trimGenericTerms(q: string): string {
  const parts = q.trim().split(/\s+/);
  const kept = parts.filter((w) => !GENERIC_RE_TERMS.has(w));
  // Never trim down to almost nothing — a 1-word query is a different search.
  return kept.length >= 2 && kept.length < parts.length ? kept.join(" ") : q;
}
