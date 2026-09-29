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
    // another company's name, seen under חדרה on 29.9
    expect(isReitRelated("תורג'מן מניבים גייסה 120 מיליון שקל באג\"ח")).toBe(false);
    // ...and the snippet of the same article spelled it תורגמ'ן
    expect(isReitRelated("החברה האחרונה שנכנסת לבורסה: תורגמ'ן מניבים גייסה 120 מיליון")).toBe(false);
    expect(isReitRelated("מניבים רכשה עוד 25% ממתחם סנטרו ברחובות")).toBe(true);
  });

  // Every context of "מניבים" found on 2026-09-29 in our archive and the cached REIT web results
  // (written without "ריט" or another fund's full name, so each line tests the מניבים rule alone).
  it("counts מניבים as the fund only where it is the fund (real contexts, 29.9)", () => {
    const fund = [
      "הקשיים בשוק המשרדים דוחפים את סלע ומניבים לחשיפה לתחומים אחרים",
      "החברה יקדם אותה, ומניבים התמקדה ברכישת מבנים",
      "בכפר סבא, ואצל מניבים באמצעות רכישת זכויות",
      "כאשר מניית מניבים ירדה מתחילת השנה",
      "תחום הנדל\"ן המניב. מניבים, במקביל לה, דיווחה",
      "ב־2025. אצל מניבים מדובר בזכויות",
      "השוכרת הקודמת.\n\nמניבים התייחסה בדו\"ח",
      "בשל חשיפתה של מניבים לתחום המשרדים",
      "הירידה בסלע. אולם, מניבים מחזיקה בחשיפה",
      "[מניבים](https://y) השלימה את הרכישה",
      "הקרן מניבים רכשה תמורת 97 מיליון שקל",
      "באלקטרה סיטי. מניבים: המהלך נועד לחזק",
      "בעלת השליטה במניבים מכרה מניות",
      // the headline ends without a full stop; the snippet opens with the fund (the route joins them with a line break)
      "עסקה חדשה בחולון\nמניבים רכשה בניין משרדים",
    ];
    const notFund = [
      "החברה מחזיקה בנכסים מניבים, מציעה לרכוש",
      "טראמפ אינם מניבים מידע חדש",
      "עלייה בהכנסות מנכסים מניבים, עלייה ברווח",
      "נכסי תעשייה ולוגיסטיקה מניבים. השוק, לפחות",
      "ובתוצאות שהם מניבים עבור שני הצדדים",
      "ערוצי תוכן מניבים וחנויות אונליין",
      "הוועדה תדון בתוכנית שמקדמות גבאי מניבים ופרימה מלונות",
      "נתנאל מניבים קיבלה אישור לתוכנית",
      "טכנולוגיה חדשנית במגדלי מניבים מציגה פתרון",
      "הכנסות מהנכסים המניבים שלה ב-2025",
      "כרמים בגליל העליון המניבים ענבים איכותיים",
      "בצפון הארץ, שמניבים כ-85,000 טונות",
    ];
    for (const t of fund) expect([t, isReitRelated(t)]).toEqual([t, true]);
    for (const t of notFund) expect([t, isReitRelated(t)]).toEqual([t, false]);
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
