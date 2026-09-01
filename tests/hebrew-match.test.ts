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
