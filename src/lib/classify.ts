/**
 * Centralised classification + real-estate filter, shared by /api/news/today,
 * /api/news/week, and any other endpoint that wants a "real-estate only" cut.
 *
 * Design notes
 * - REALESTATE_KEYWORDS is intentionally broad — we want to catch anything
 *   about housing, mortgages, urban renewal, planning, tenancy, contractors,
 *   interest rates IN-THE-CONTEXT-OF housing.
 * - STRONG_FINANCE / STRONG_POLITICS / STRONG_SECURITY act as veto lists:
 *   even if a real-estate keyword is present, an item gets rejected if it
 *   contains a strong signal from one of these categories. Without them,
 *   "ריבית" leaks finance stories about general interest rates onto the home
 *   feed (this is the bug surfaced by the live-verify pass).
 * - Source whitelist short-circuits everything: a dedicated real-estate
 *   outlet (מגדילים, מדלן, …) is always allowed.
 */

export const REALESTATE_KEYWORDS = [
  "נדל\"ן", "נדלן", "דירה", "דירות", "משכנתא", "משכנתאות",
  "בנייה", "בניה", "קבלן", "קבלנים", "יזם", "יזמים", "יזמית",
  "מחיר למשתכן", "פינוי בינוי", "פינוי-בינוי", "התחדשות עירונית", "תמ\"א",
  "מס רכישה", "מס שבח", "שכירות", "שכ\"ד", "היטל השבחה",
  "מגורים", "רוכשים", "רוכשי", "קונים", "רכישת דירה", "שוק הדיור",
  "ריבית משכנתא", "בית מגורים", "מחירי דיור", "דיור", "דייר", "דיירים",
  "תב\"ע", "בניין", "בניינים", "קומות", "פרויקט מגורים", "מגדל",
  "עסקאות נדל", "מכירות דירות", "התחלות בנייה", "היצע דירות",
  "השכרה", "שוכרים", "בעלי דירות", "משקיע נדל",
  "התחדשות", "תכנון ובניה", "ועדת תכנון",
  "מגרש", "מגרשים", "מכרז קרקעות", "רמ\"י",
  "פנטהאוז", "וילה", "וילות", "קוטג", "דופלקס",
  "אבן יהודה", "חריש", "ראש העין", // common city contexts when paired with real-estate verbs
];

export const REALESTATE_SOURCES = new Set([
  'מרכז הנדל"ן',
  "מגדילים",
  "מדלן",
  "הומלס",
  "דירה",
]);

// Strong signals that the item is NOT a real-estate story even if it touches
// a RE keyword. These are checked AFTER the RE-keyword scan.
export const STRONG_FINANCE_NOT_RE = [
  "בורסה", "מניות", "מנייה", "ת\"א 35", "ת\"א 125", "סנופי",
  "נאסדק", "דאו ג'ונס", "S&P", "סנדפי", "המסחר נסגר",
  "ני\"ע", "מכפיל", "תשואת דיבידנד", "אג\"ח קונצרני", "אופציות",
];

export const STRONG_POLITICS_NOT_RE = [
  "פיזור הכנסת", "פיזור כנסת", "ועדת הכנסת", "הצעת חוק",
  "ראש הממשלה", "ממשלה", "קואליציה", "אופוזיציה",
  "בחירות", "מפלגות", "מצביעים",
];

export const STRONG_SECURITY_NOT_RE = [
  // NOTE: "מבצע" was removed — it substring-matched "מבצעים" (sales promotions)
  // and standalone vetoed legit RE marketing ("מבצע מכירות", "מבצע השקה"). The
  // remaining tokens are unambiguous military.
  "מלחמה", "צה\"ל", "חיזבאללה", "חמאס", "ירי",
  "פיגוע", "טילים", "מילואים", "תרחיש",
  "בדאחייה", "בביירות",
];

const ALL_VETO = [
  ...STRONG_FINANCE_NOT_RE,
  ...STRONG_POLITICS_NOT_RE,
  ...STRONG_SECURITY_NOT_RE,
];

// Hebrew-aware veto match. The token must sit at a WORD boundary (optionally
// after a one-letter Hebrew prefix ה/ו/ב/כ/ל/מ/ש/ד) and must NOT continue into
// more Hebrew root letters. Plain substring matching wrongly vetoed real-estate
// items: "ירי" (gunfire) is a substring of "מחירים"/"שמחירי" (prices), so any
// price headline was rejected as a security story and the home feed emptied.
// This keeps real vetoes ("הממשלה", "בירי") while ending the false positives.
const HEB_RANGE = "\\u05D0-\\u05EA";
function vetoMatch(text: string, kw: string): boolean {
  const esc = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^${HEB_RANGE}])[הובכלמשד]?${esc}(?![${HEB_RANGE}])`, "u").test(text);
}

/**
 * Returns true iff the article should appear on the real-estate-only feed.
 *
 * Logic:
 *   1. Dedicated RE source → always true.
 *   2. Contains a strong veto signal → false (politics / finance / security).
 *   3. Contains a RE keyword → true.
 *   4. Otherwise → false.
 */
/**
 * Collapse the same story arriving from two feeds.
 *
 * Reviving the dead outlet feeds (2026-08-16) made this visible: an article now
 * reaches us BOTH from its own outlet feed and from the rss.app aggregate, under
 * two different URLs — so the `onConflict: source_url` dedupe at ingest cannot
 * see them as one. Measured right after the fix: 2 duplicate rows out of 38 on
 * the home feed, e.g. "רווח של יותר ממיליון שקל על דירת מחיר למשתכן בלוד" twice
 * from גלובס.
 *
 * Two shapes are collapsed: identical titles, and one feed's truncated headline
 * being a prefix of the other's full one ("…להיפטר מהדירה שקנו" vs "…שקנו על
 * הנייר"). The prefix rule only applies to titles long enough that a shared
 * opening cannot be coincidence.
 *
 * Expects the input already ordered best-first (the feeds sort by score), so the
 * survivor is the higher-scoring, fuller-headline copy.
 */
const PREFIX_MIN_LEN = 30;
export function dedupeStories<T extends { title?: string | null }>(items: T[]): T[] {
  const kept: { norm: string; item: T }[] = [];
  for (const item of items) {
    const norm = (item.title || "").replace(/\s+/g, " ").trim();
    if (!norm) {
      kept.push({ norm, item });
      continue;
    }
    const dup = kept.some(
      (k) =>
        k.norm === norm ||
        (norm.length >= PREFIX_MIN_LEN && k.norm.startsWith(norm)) ||
        (k.norm.length >= PREFIX_MIN_LEN && norm.startsWith(k.norm))
    );
    if (!dup) kept.push({ norm, item });
  }
  return kept.map((k) => k.item);
}

// A scored item this confident is real-estate news by the scorer's own judgment.
// The scorer (Haiku, over the full item) already asked "is this housing news";
// requiring a keyword on top of that was double-gating, and it dropped the two
// highest-scored stories of the week of 2026-09-01.
const TRUST_SCORE_FROM = 80;

// Anchors the keyword list lacked. Measured 2026-09-03 with a faithful port of
// this function: "בנק ישראל הוריד את הריבית ל-3.25%" (score 88) and "ביהמ"ש
// עצר את הגרלת הזכויות בגוש הגדול" (score 91) were BOTH dropped at the include
// step — not vetoed — because neither "ריבית" alone, "קרקע" nor "מתחם" is a
// keyword. "ריבית" stays out on purpose (it leaks general finance); the central
// bank by name does not.
const RE_ANCHORS_ADDED = [
  "בנק ישראל", "ריבית בנק ישראל", "ריבית הפריים",
  "קרקע", "קרקעות", "מתחם", "מתחמים", "הגרלת", "בעלי הזכויות",
];

export function isRealEstate(title: string, summary: string, source: string, score?: number): boolean {
  if (REALESTATE_SOURCES.has(source)) return true;

  const text = `${title} ${summary || ""}`.toLowerCase();

  // Veto: if it screams finance/politics/security, reject even if a RE word slips
  // in. Word-boundary aware (see vetoMatch) so "ירי" no longer matches "מחירים".
  for (const kw of ALL_VETO) {
    if (vetoMatch(text, kw)) return false;
  }

  // A high score from the real-estate scorer is itself the signal. Applied
  // AFTER the veto, so a stock-market piece the scorer liked is still refused.
  if (typeof score === "number" && score >= TRUST_SCORE_FROM) return true;

  // Include: at least one real-estate signal must be present
  for (const kw of REALESTATE_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) return true;
  }
  for (const kw of RE_ANCHORS_ADDED) {
    if (text.includes(kw.toLowerCase())) return true;
  }

  return false;
}
