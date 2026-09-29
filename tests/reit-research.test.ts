import { describe, it, expect } from "vitest";
import {
  isReitRelated, reitTier, RESEARCH_TOPIC_KEYWORDS, RESEARCH_TOPIC_WEB_QUERIES, REIT_TOPIC, findCity,
} from "@/lib/cities";

describe("REIT research cube — what counts as a REIT story", () => {
  it("keeps the real deals Projektor verified (the positive controls)", () => {
    expect(isReitRelated("אלמוגים תמכור למגוריט 54 דירות ברחובות ב-117 מיליון שקל")).toBe(true);
    expect(isReitRelated("רנט איט רוכשת 52 דירות בחדרה מאאורה תמורת 108 מיליון שקל")).toBe(true);
    expect(isReitRelated("ריט אזורים LIVING רוכשת 26 דירות בשכונת ארנונה")).toBe(true);
    expect(isReitRelated("150 דירות ברחובות וקריית אתא: קרן הריט של צחי אבו מרחיבה")).toBe(true);
    expect(isReitRelated("סלע קפיטל רוכשת את קניון כפר סבא הירוקה ב-580 מיליון שקל")).toBe(true);
    expect(isReitRelated("ריט 1 רכשה 45% ממתחם סיפולוקס בת\"א")).toBe(true);
    expect(isReitRelated("הקשיים בשוק המשרדים דוחפים את סלע ומניבים לחשיפה")).toBe(true);
  });

  it("drops what bare \"ריט\" matched in our own archive (measured 29.9: all junk)", () => {
    expect(isReitRelated("האפיסרי בנתניה משיקה תפריט אוכל מוכן לסוכות")).toBe(false);
    expect(isReitRelated("חומרים, גימורים וחריטה מדויקת")).toBe(false);
    expect(isReitRelated("ירח דבש בתאילנד שמשלב ריטריט בריאות")).toBe(false);
    expect(isReitRelated("ממשלת בריטניה הודיעה")).toBe(false);
    expect(isReitRelated("זה שלב קריטי בפרויקט")).toBe(false);
  });

  it("does not take \"נכסים מניבים\" for the fund מניבים", () => {
    expect(isReitRelated("השקעה בנכסים מניבים בפתח תקווה")).toBe(false);
    expect(isReitRelated("מניבים רכשה עוד 25% ממתחם סנטרו ברחובות")).toBe(true);
  });

  it("ranks the funds that buy apartments first (Ori's correction, 28.9)", () => {
    expect(reitTier("מגוריט רכשה בניין דירות")).toBe(0);
    expect(reitTier("רנט איט קונה 52 דירות")).toBe(0);
    expect(reitTier("אזורים ליווינג רוכשת")).toBe(0);
    // how most headlines shorten it (its Jerusalem deal ranked 7th without this)
    expect(reitTier("ריט אזורים רוכשת 50 דירות באשדוד")).toBe(0);
    expect(reitTier("סלע קפיטל רוכשת קניון")).toBe(1);
    expect(reitTier("ריט 1 רכשה משרדים")).toBe(1);
  });

  it("never searches our archive for the bare word — it matched 1,440 rows", () => {
    const kw = RESEARCH_TOPIC_KEYWORDS[REIT_TOPIC];
    expect(kw.length).toBeGreaterThan(5);
    expect(kw).not.toContain("ריט");
  });

  it("searches the web housing funds first, in their own query", () => {
    const [first, second] = RESEARCH_TOPIC_WEB_QUERIES[REIT_TOPIC];
    for (const fund of ["מגוריט", "רנט איט", "אזורים ליווינג"]) expect(first).toContain(fund);
    expect(second).toContain("ריט 1");
  });

  it("knows כפ\"ס is כפר סבא — the ענב 360 headline used it", () => {
    expect(findCity("כפ\"ס")?.name).toBe("כפר סבא");
    expect(findCity("כפ״ס")?.name).toBe("כפר סבא");
  });
});
