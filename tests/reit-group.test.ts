import { describe, it, expect } from "vitest";
import { dealSignature, sameDeal, groupReitDeals } from "@/lib/reit-group";

// Titles copied from the production run of 2026-09-29.
const hadera = [
  { title: 'עסקת ענק בחדרה: "רנט איט" רכשה מאאורה 52 דירות להשכרה תמורת כ-108.5 מלש"ח', source: 'מרכז הנדל"ן' },
  { title: "רנט איט רוכשת 52 דירות בחדרה מאאורה תמורת 108 מיליון שקל", source: "כלכליסט" },
  { title: "החברה שרוכשת 52 דירות בחדרה במכה. כמה היא שילמה?", source: "גלובס" },
  { title: "52 דירות ב-108 מיליון שקל: פחות רוכשים מגיעים ואאורה מצאה פתרון יצירתי", source: "דה מרקר" },
  { title: "רנט איט קונה 52 דירות מאאורה בחדרה: 108.5 מיליון שקל, תשואת שכירות של 3%", source: "ביזפורטל" },
  { title: 'רנט איט רוכשות 52 יחידות דיור בפרויקט מגורים "אאורה סיטי" בחדרה', source: "funder.co.il" },
  { title: "האחרונה שתיכנס לבורסה ב-25'? תורג'מן מניבים גייסה 120 מיליון שקל באג\"ח", source: 'מרכז הנדל"ן' },
];

describe("grouping articles about the same REIT deal", () => {
  it("reads fund, apartments and price from a headline", () => {
    expect(dealSignature(hadera[0].title)).toEqual({ fund: "רנט איט", units: 52, priceM: 108.5 });
    expect(dealSignature("ריט אזורים רוכשת 50 דירות באשדוד בכ-107.5 מיליון שקל")).toEqual({ fund: "אזורים", units: 50, priceM: 107.5 });
    expect(dealSignature("סלע קפיטל רוכשת את קניון כפר סבא הירוקה ב-580 מיליון שקל")).toEqual({ fund: "סלע", units: null, priceM: 580 });
  });

  it("turns the six חדרה copies of one deal into one line with 5 more sources", () => {
    const out = groupReitDeals(hadera);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe(hadera[0].title);
    expect(out[0].alsoCount).toBe(5);
    expect(out[0].alsoSources).toEqual(["כלכליסט", "גלובס", "דה מרקר", "ביזפורטל", "funder.co.il"]);
    expect(out[1].alsoCount).toBeUndefined();
  });

  it("groups the four כפר סבא mall articles, spelled three different ways", () => {
    const out = groupReitDeals([
      { title: "סלע קפיטל רוכשת את קניון כפר סבא הירוקה מקבוצת שבירו ב-580 מיליון שקל", source: "ynet" },
      { title: "סלע קפיטל במו”מ מתקדם לרכישת קניון כפר סבא הירוקה תמורת 580 מיליון שקל", source: "sponser.co.il" },
      { title: 'סלע נדל"ן רוכשת את קניון כפר סבא הירוקה ב-580 מיליון שקל', source: "דה מרקר" },
      { title: 'תמורת 580 מלש"ח: שבירו במו"מ מתקדם למכירת קניון כפ"ס הירוקה לסלע קפיטל', source: 'מרכז הנדל"ן' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].alsoCount).toBe(3);
  });

  it("keeps different deals apart", () => {
    // same apartment count, different funds
    expect(sameDeal(dealSignature("צחי אבו רכש 50 דירות בירושלים ב-156 מיליון"), dealSignature("ריט אזורים רוכשת 50 דירות באשדוד ב-107.5 מיליון"))).toBe(false);
    // same fund, different deals
    expect(sameDeal(dealSignature("רנט איט רוכשת 30 דירות בירושלים ב-63 מיליון"), dealSignature("רנט איט רוכשת 52 דירות בחדרה ב-108 מיליון"))).toBe(false);
    // no fund named anywhere and only the apartment count agrees: could be coincidence
    expect(sameDeal(dealSignature("50 דירות נמכרו בשכונה"), dealSignature("היזם מכר 50 דירות"))).toBe(false);
    // no numbers at all: never grouped
    expect(sameDeal(dealSignature("הקשיים בשוק המשרדים דוחפים את סלע ומניבים"), dealSignature("סלע נדל\"ן: ה-NOI עלה"))).toBe(false);
  });

  it("shows the headline that tells the deal, in the place of the first article (רחובות, 29.9)", () => {
    const out = groupReitDeals([
      { title: 'אלמוגים סותמת חורים ממשבר הנדל"ן; מוכרת דירות במחירי הפסד למגוריט', summary: "54 דירות ברחובות ב-117 מיליון שקל", source: "כלכליסט" },
      { title: "אבו פמילי מגורים השלימה שתי עסקאות", source: "גלובס" },
      { title: "אלמוגים תמכור למגוריט 54 דירות ברחובות ב-117 מיליון שקל", source: "ביזפורטל" },
    ]);
    expect(out.map((x) => x.source)).toEqual(["ביזפורטל", "גלובס"]);
    expect(out[0].alsoCount).toBe(1);
    expect(out[0].alsoSources).toEqual(["כלכליסט"]);
  });

  it("never lets a national article stand for a local deal", () => {
    const out = groupReitDeals([
      { title: "רנט איט רוכשת 30 דירות מבית ירושלמי", summary: "תמורת 63 מיליון שקל", source: "מגדילים" },
      { title: "רנט איט רוכשת 30 דירות ב-63 מיליון שקל בהנחה של 20%", source: "כלכליסט", national: true },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("מגדילים");
    expect(out[0].national).toBeUndefined();
    expect(out[0].alsoSources).toEqual(["כלכליסט"]);
  });

  it("treats a price within 3% as the same deal, and further apart as different", () => {
    expect(sameDeal(dealSignature("מגוריט: 44 דירות ב-143 מיליון"), dealSignature("מגוריט רכשה 44 דירות ב-142.5 מיליון"))).toBe(true);
    expect(sameDeal(dealSignature("מגוריט רכשה בניין ב-75 מיליון"), dealSignature("מגוריט רכשה בניין ב-117 מיליון"))).toBe(false);
  });
});
