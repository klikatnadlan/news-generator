import { describe, it, expect } from "vitest";
import { matchesAllWords, trimGenericTerms, stripHebrewPrefixes } from "@/lib/hebrew-match";

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

describe("stripHebrewPrefixes", () => {
  it("drops the attached prefix that made the RPC return nothing", () => {
    // Measured 2026-09-01: `בשיכון ובינוי` → 1 row, `שיכון ובינוי` → 6, same window.
    expect(stripHebrewPrefixes("בשיכון ובינוי")).toBe("שיכון בינוי");
  });

  it("rescues a prefixed city name", () => {
    expect(stripHebrewPrefixes("בחיפה פרויקט")).toBe("חיפה פרויקט");
  });

  it("over-strips roots that begin with a prefix letter — and that is safe", () => {
    // "התחדשות" is a word whose ה belongs to the root, but this function has no
    // lexicon and strips it anyway. Documented rather than fixed, because the
    // result is still a SUPERSET for a substring search and the gate re-filters:
    // "תחדשות" retrieves every article containing "התחדשות", and the gate's
    // optional-prefix rule then accepts them. Proper Hebrew morphology would
    // need a dictionary; the failure mode here costs a little noise, never a
    // missed article.
    expect(stripHebrewPrefixes("התחדשות עירונית")).toBe("תחדשות עירונית");
    expect(matchesAllWords("התחדשות עירונית בחיפה", "תחדשות עירונית")).toBe(true);
  });

  it("leaves short words whole — they are words, not prefixed roots", () => {
    expect(stripHebrewPrefixes("בית של")).toBe("בית של");
  });

  it("leaves words that do not start with a prefix letter alone", () => {
    expect(stripHebrewPrefixes("רני צים")).toBe("רני צים");
  });

  it("the stripped form still passes the gate against the prefixed original", () => {
    // This is the property that makes stripping safe: the gate's own optional
    // prefix rule accepts both forms, so re-gating on the stripped terms keeps
    // the very articles the prefixed query could never retrieve.
    const stripped = stripHebrewPrefixes("בשיכון ובינוי");
    expect(matchesAllWords("שיכון ובינוי מכרה את זרוע האנרגיה", stripped)).toBe(true);
    expect(matchesAllWords("חשד בשיכון ובינוי: סמנכל נסחט", stripped)).toBe(true);
  });
});
