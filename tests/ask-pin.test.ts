import { describe, it, expect } from "vitest";
import { pinStory } from "@/lib/ask";

// pinStory only touches the database for a well-formed id. Anything else must
// come back untouched — a malformed or missing id cannot cost a query or change
// the answer.
describe("pinStory — the story you asked about is source [1]", () => {
  const base = { sources: [], internalCount: 0, webCount: 0, widenedTo: null } as unknown as Parameters<typeof pinStory>[0];

  it("leaves the retrieval alone without a story id", async () => {
    expect(await pinStory(base, null)).toBe(base);
    expect(await pinStory(base, "")).toBe(base);
  });

  it("refuses anything that is not a uuid, without a query", async () => {
    expect(await pinStory(base, "1; drop table news_items")).toBe(base);
    expect(await pinStory(base, "web-12345")).toBe(base);
  });
});
