import { describe, it, expect } from "vitest";
import { summarizeTone, normalizeTone, trendOf, dayList, toneSentence, MIN_STORIES, type ToneEntry, type Tone } from "@/lib/market-tone";

const stories = (tones: Tone[], startScore = 90): ToneEntry[] =>
  tones.map((tone, i) => ({ id: `s${i}`, tone, score: startScore - i, title: `ידיעה מספר ${i} על שוק הדיור`, url: `https://x/${i}` }));

describe("מד אמון השוק — arithmetic over story tone", () => {
  it("is plain arithmetic: all positive 100, all negative 0, all neutral 50", () => {
    expect(summarizeTone(stories(Array(20).fill(1))).index).toBe(100);
    expect(summarizeTone(stories(Array(20).fill(-1))).index).toBe(0);
    expect(summarizeTone(stories(Array(20).fill(0))).index).toBe(50);
  });

  it("counts a neutral story as half-way", () => {
    // 5 positive, 10 negative, 5 neutral → (5 + 2.5) / 20 = 37.5 → 38
    const s = summarizeTone(stories([...Array(5).fill(1), ...Array(10).fill(-1), ...Array(5).fill(0)]));
    expect(s.index).toBe(38);
    expect([s.pos, s.neg, s.neu, s.total]).toEqual([5, 10, 5, 20]);
  });

  it("refuses to print a number built on too few stories", () => {
    const s = summarizeTone(stories(Array(MIN_STORIES - 1).fill(-1)));
    expect(s.index).toBeNull();
    expect(s.total).toBe(MIN_STORIES - 1);
  });

  it("gives one vote per story: same id twice, or the same headline from two outlets", () => {
    const base = stories(Array(MIN_STORIES).fill(1));
    const dupId = { ...base[0] };
    const dupTitle = { ...base[1], id: "other-url" };
    const s = summarizeTone([...base, dupId, dupTitle]);
    expect(s.total).toBe(MIN_STORIES);
  });

  it("names the strongest story each way, so the number can be explained", () => {
    const s = summarizeTone([
      ...stories(Array(14).fill(0), 50),
      { id: "p", tone: 1, score: 70, title: "שיא מכירות" },
      { id: "q", tone: 1, score: 95, title: "הריבית ירדה" },
      { id: "n", tone: -1, score: 88, title: "קבלן בקשיים" },
    ]);
    expect(s.topPositive?.title).toBe("הריבית ירדה");
    expect(s.topNegative?.title).toBe("קבלן בקשיים");
  });

  it("keeps our own articles on the feed but out of the vote", () => {
    // First live run: 12 of 27 votes were our own explainers.
    const market = stories(Array(MIN_STORIES).fill(-1));
    const ours: ToneEntry[] = Array.from({ length: 12 }, (_, i) => ({
      id: `own${i}`, tone: 1, score: 80, title: `מדריך ${i} לקונים`, url: `https://klikatnadlan.co.il/guide-${i}/`,
    }));
    const bySource: ToneEntry = { id: "own-src", tone: 1, score: 80, title: "ניתוח", source: 'קליקת הנדל"ן' };
    const s = summarizeTone([...market, ...ours, bySource]);
    expect(s.total).toBe(MIN_STORIES);
    expect(s.index).toBe(0);
  });

  it("accepts only 1, 0 and -1 as tone", () => {
    expect(normalizeTone(1)).toBe(1);
    expect(normalizeTone("-1")).toBe(-1);
    expect(normalizeTone(0)).toBe(0);
    expect(normalizeTone(2)).toBeUndefined();
    expect(normalizeTone("חיובי")).toBeUndefined();
    expect(normalizeTone(undefined)).toBeUndefined();
  });

  it("calls a move of 5 points or more a trend, and nothing without a previous week", () => {
    expect(trendOf(46, 40)).toBe("עולה");
    expect(trendOf(40, 46)).toBe("יורד");
    expect(trendOf(42, 40)).toBe("יציב");
    expect(trendOf(42, null)).toBeNull();
  });

  it("walks calendar days back across a month boundary", () => {
    expect(dayList("2026-10-01", 3)).toEqual(["2026-10-01", "2026-09-30", "2026-09-29"]);
  });

  it("explains itself in one sentence", () => {
    const s = summarizeTone(stories([...Array(12).fill(1), ...Array(25).fill(-1), ...Array(30).fill(0)]));
    expect(toneSentence(s)).toBe("השבוע: 12 ידיעות חיוביות, 25 שליליות ו-30 ניטרליות.");
  });
});
