import { describe, it, expect } from "vitest";
import { planQueryByRules, explicitYear } from "@/lib/ask";

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

  it("puts NO lower bound on a question with no time phrase", () => {
    // The old default was 90 days, which quietly made LeaderFeed a three-month
    // tool: a question that names no period should reach the whole archive, the
    // way a search engine does.
    expect(planQueryByRules("מה קרה ברני צים", TODAY).from).toBe(null);
  });

  it("still bounds a question that DOES name a period", () => {
    expect(planQueryByRules("מה קרה ברני צים החודש", TODAY).from).toBe("2026-08-02");
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

describe("explicitYear", () => {
  it("finds a year the planner would otherwise strip out of the terms", () => {
    // Measured 2026-09-01: the planner moved "2016" into a date filter on a
    // corpus that starts in 2026 and dropped it from the search terms, so the
    // web search that ran to rescue the question searched without the year and
    // returned 2026 articles.
    expect(explicitYear("מה קרה במחיר למשתכן ב-2016")).toBe("2016");
    expect(explicitYear("מה היה מצב שוק הדיור ב-2015")).toBe("2015");
  });

  it("ignores numbers that are not years", () => {
    expect(explicitYear("דירה של 120 מטר")).toBe(null);
    expect(explicitYear("עסקה ב-800 מיליון שקל")).toBe(null);
    expect(explicitYear("מה קרה בשיכון ובינוי")).toBe(null);
  });
});
