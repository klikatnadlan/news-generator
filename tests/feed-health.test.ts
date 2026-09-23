import { describe, it, expect } from "vitest";
import { newestItemAgeDays, STALE_AFTER_DAYS } from "@/lib/feed-health";

const NOW = Date.parse("2026-09-23T12:00:00Z");

describe("feed freshness — a full feed can still be dead", () => {
  it("catches the Walla case: 30 items, newest 113 days old", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      pubDate: new Date(NOW - (113 + i) * 86_400_000).toUTCString(),
    }));
    const age = newestItemAgeDays(items, NOW)!;
    expect(Math.round(age)).toBe(113);
    expect(age > STALE_AFTER_DAYS).toBe(true);
  });

  it("reads the NEWEST item, whatever the order", () => {
    const items = [
      { pubDate: "Mon, 21 Sep 2026 12:00:00 GMT" },
      { pubDate: "Wed, 23 Sep 2026 06:00:00 GMT" },
      { pubDate: "Tue, 22 Sep 2026 12:00:00 GMT" },
    ];
    expect(newestItemAgeDays(items, NOW)).toBeCloseTo(0.25, 2);
  });

  it("prefers isoDate and says null when there are no dates at all", () => {
    expect(newestItemAgeDays([{ isoDate: "2026-09-22T12:00:00.000Z", pubDate: "garbage" }], NOW)).toBeCloseTo(1, 5);
    expect(newestItemAgeDays([{}, { pubDate: "" }], NOW)).toBeNull();
  });

  it("does not page anyone over a holiday weekend", () => {
    expect(STALE_AFTER_DAYS).toBeGreaterThanOrEqual(3);
  });
});
