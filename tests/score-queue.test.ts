import { describe, it, expect } from "vitest";
import { orderForScoring, isNeverRealEstate, scoringTier, type QueueItem } from "@/lib/score-queue";

let n = 0;
const item = (url: string, title: string, published_at = "2026-09-23T06:00:00Z", source = "x"): QueueItem => ({
  id: `id-${n++}`,
  title,
  summary: "",
  source,
  source_url: url,
  published_at,
});

describe("orderForScoring — the queue that decides what reaches the feed", () => {
  it("reproduces the 2026-09-23 starvation and fixes it: our articles and ynet כלכלה make the first wave", () => {
    // TheMarker's "real-estate" feed is really all sections and sits early in the
    // feed list: in feed order its items used to fill the whole wave.
    const marker = Array.from({ length: 80 }, (_, i) =>
      item(`https://www.themarker.com/wallstreet/2026-09-23/ty-article/${i}`, `אג"ח ארוכות ${i}`));
    const ynetEconomy = Array.from({ length: 5 }, (_, i) =>
      item(`https://www.ynet.co.il/economy/article/e${i}`, `ריבית המשכנתא ${i}`));
    const ours = Array.from({ length: 3 }, (_, i) =>
      item(`https://klikatnadlan.co.il/post-${i}/`, `מדריך ${i}`));
    const { queue } = orderForScoring([...marker, ...ynetEconomy, ...ours]);
    const firstWave = queue.slice(0, 25);
    for (const x of [...ours, ...ynetEconomy]) expect(firstWave).toContain(x);
  });

  it("puts our own site first even without a single real-estate word", () => {
    expect(scoringTier(item("https://klikatnadlan.co.il/webinar/", "הרשמה לוובינר"))).toBe(0);
    expect(scoringTier(item("https://www.nadlancenter.co.il/article/1", "כותרת", undefined, 'מרכז הנדל"ן'))).toBe(0);
  });

  it("lifts a real-estate word or section above the rest, but never drops the rest", () => {
    const plain = item("https://www.ynet.co.il/news/article/a", "הכנסת אישרה את התקציב");
    const re = item("https://www.ynet.co.il/news/article/b", "מחירי הדירות ירדו");
    const section = item("https://www.themarker.com/realestate/2026-09-23/x", "כותרת בלי מילה");
    const { queue } = orderForScoring([plain, re, section]);
    expect(queue.indexOf(re)).toBeLessThan(queue.indexOf(plain));
    expect(queue.indexOf(section)).toBeLessThan(queue.indexOf(plain));
    // The keyword gate once hid the Bank of Israel rate cut — so it only orders.
    expect(queue).toContain(plain);
  });

  it("shares a tier between outlets instead of letting one outlet take it all", () => {
    const a = Array.from({ length: 4 }, (_, i) => item(`https://www.themarker.com/markets/${i}`, `דירות ${i}`, `2026-09-23T0${i}:00:00Z`));
    const b = [item("https://www.globes.co.il/news/article.aspx?did=1", "דירות גלובס", "2026-09-22T10:00:00Z")];
    const { queue } = orderForScoring([...a, ...b]);
    // globes is second, not fifth.
    expect(queue.slice(0, 2)).toContain(b[0]);
    // newest first within an outlet
    expect(queue[0]).toBe(a[3]);
  });

  it("skips only sections that never produced a real-estate story", () => {
    expect(isNeverRealEstate("https://www.themarker.com/technation/2026-09-23/x")).toBe(true);
    expect(isNeverRealEstate("https://www.ice.co.il/tv/news/article/1")).toBe(true);
    expect(isNeverRealEstate("https://www.calcalist.co.il/calcalistech/article/x")).toBe(true);
    // Looked irrelevant, but produced real stories — measured, so NOT skipped:
    // a mortgage podcast scored 92, a Wall Street housing piece 88.
    expect(isNeverRealEstate("https://www.themarker.com/podcasts/2026-09-22/x")).toBe(false);
    expect(isNeverRealEstate("https://www.themarker.com/wallstreet/2026-09-23/x")).toBe(false);
    expect(isNeverRealEstate("https://www.ice.co.il/culture/news/article/1")).toBe(false);
    const { skipped, queue } = orderForScoring([
      item("https://www.themarker.com/technation/x", "סטארט-אפ גייס"),
      item("https://www.themarker.com/podcasts/y", "משכנתא: איך לנהל"),
    ]);
    expect(skipped).toHaveLength(1);
    expect(queue).toHaveLength(1);
  });
});
