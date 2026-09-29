import { describe, it, expect } from "vitest";
import { normNewsDate } from "@/lib/news-date";

const NOW = Date.parse("2026-09-29T09:00:00Z");

describe("normNewsDate — a web result's date, never sharper than the source", () => {
  it("reads the relative dates that used to come out null", () => {
    expect(normNewsDate("22 hours ago", NOW)).toBe("2026-09-28");
    expect(normNewsDate("3 days ago", NOW)).toBe("2026-09-26");
    expect(normNewsDate("3 weeks ago", NOW)).toBe("2026-09");
    expect(normNewsDate("4 months ago", NOW)).toBe("2026-05");
    expect(normNewsDate("95 months ago", NOW)).toBe("2018-10");
    expect(normNewsDate("2 years ago", NOW)).toBe("2024");
    expect(normNewsDate("a month ago", NOW)).toBe("2026-08");
    expect(normNewsDate("yesterday", NOW)).toBe("2026-09-28");
  });

  it("keeps absolute dates on their day in any timezone", () => {
    expect(normNewsDate("Apr 9, 2026", NOW)).toBe("2026-04-09");
    expect(normNewsDate("Dec 1, 2025", NOW)).toBe("2025-12-01");
    expect(normNewsDate("2026-08-20T10:00:00+03:00", NOW)).toBe("2026-08-20");
  });

  it("passes month- or year-only dates through, and gives up on nonsense", () => {
    expect(normNewsDate("2026-05", NOW)).toBe("2026-05");
    expect(normNewsDate("2024", NOW)).toBe("2024");
    expect(normNewsDate("", NOW)).toBeNull();
    expect(normNewsDate(null, NOW)).toBeNull();
    expect(normNewsDate("לפני זמן מה", NOW)).toBeNull();
  });
});
