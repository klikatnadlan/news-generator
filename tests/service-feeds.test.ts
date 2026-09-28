import { describe, it, expect } from "vitest";
import { feedsForRun } from "@/lib/rss";
import { RSS_FEEDS } from "@/lib/sources";

// The paid feeds cost a credit each time they are fetched. These tests pin down
// that they are fetched in exactly one place — their own daily run — and that
// adding one by mistake to the scan would fail loudly here, not on the bill.
describe("which run fetches which feeds", () => {
  const service = feedsForRun("service");

  it("the paid run fetches exactly the 13 papers Ori approved on 2026-09-28", () => {
    expect(service).toHaveLength(13);
  });

  it("the main scan and the catch-up never fetch a paid feed", () => {
    for (const run of ["full", "catchup"] as const) {
      expect(feedsForRun(run).some((f) => f.serviceOnly)).toBe(false);
    }
  });

  it("every paid feed is ingest-only — none is ever scored", () => {
    expect(service.every((f) => f.ingestOnly)).toBe(true);
  });

  it("together the runs still cover every configured feed", () => {
    expect(feedsForRun("full").length + service.length).toBe(RSS_FEEDS.length);
  });
});
