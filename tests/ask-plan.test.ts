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
