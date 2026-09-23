import { describe, it, expect } from "vitest";
import { cleanTranscript, stripSoundTags, hasWords } from "@/lib/transcript";

describe("telling a question from noise", () => {
  it("drops the tag that was once answered with eight sources", () => {
    const t = cleanTranscript("[קולות של פעולות]");
    expect(t).toBe("");
    expect(hasWords(t)).toBe(false);
  });

  it("keeps the words around a sound tag", () => {
    expect(cleanTranscript("מה קורה [רעש רקע] בשוק הדיור (צחוק)")).toBe("מה קורה בשוק הדיור");
  });

  it("keeps round brackets in a typed question — they are punctuation there", () => {
    expect(stripSoundTags('מה קורה עם תמ"א 38 (חיזוק)?')).toBe('מה קורה עם תמ"א 38 (חיזוק)?');
    expect(stripSoundTags("[קולות] מה הריבית")).toBe("מה הריבית");
  });

  it("does not call digits or punctuation a question", () => {
    expect(hasWords("?? 38 !!")).toBe(false);
    expect(hasWords("ריבית")).toBe(true);
    expect(hasWords("BOI rate")).toBe(true);
  });
});
