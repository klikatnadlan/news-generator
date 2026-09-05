import { describe, it, expect } from "vitest";
import { isRealEstate } from "@/lib/classify";

// The two highest-scored stories of the week of 2026-09-01 were dropped from
// the home feed. A faithful re-run of this function showed why: neither was
// vetoed — both simply lacked a keyword from the include list.
describe("isRealEstate", () => {
  it("keeps the Bank of Israel rate decision (was dropped: no keyword)", () => {
    expect(isRealEstate(
      "בפעם השלישית ברציפות: בנק ישראל הוריד את הריבית ל-3.25%",
      "בנק ישראל הוריד את הריבית ב-0.25% בפעם השלישית ברציפות. ריבית הפריים יורדת ל-4.75%.",
      "כל רגע",
    )).toBe(true);
  });

  it("keeps the Gush HaGadol land-rights story (was dropped: no keyword)", () => {
    expect(isRealEstate(
      'בגלל זיהום הקרקע בשדה דב: ביהמ"ש עצר את הגרלת הזכויות בגוש הגדול בת"א',
      "אי הוודאות סביב זיהום PFAS מעכבת את חלוקת הזכויות בין אלפי בעלי הקרקע הפרטיים במתחם.",
      "ynet",
    )).toBe(true);
  });

  it("trusts a high score even with no keyword at all", () => {
    expect(isRealEstate("כותרת בלי אף מילת מפתח", "", "מקור כלשהו", 88)).toBe(true);
    expect(isRealEstate("כותרת בלי אף מילת מפתח", "", "מקור כלשהו", 79)).toBe(false);
  });

  it("still vetoes a stock-market piece, even with a high score", () => {
    // The veto runs before the score gate on purpose.
    expect(isRealEstate("המסחר נסגר בעליות בבורסה", "מניות הנדל\"ן עלו", "גלובס", 95)).toBe(false);
  });

  it("still refuses general interest-rate chatter without the central bank", () => {
    // "ריבית" alone was kept OUT of the anchors: it leaks general finance.
    expect(isRealEstate("הריבית על הפיקדונות עולה", "הבנקים מעלים ריבית על פיקדונות", "כלכליסט")).toBe(false);
  });
});
