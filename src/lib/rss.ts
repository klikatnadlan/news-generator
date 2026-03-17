import Parser from "rss-parser";
import { RSS_FEEDS } from "./sources";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "KlikaVault-NewsBot/1.0",
  },
});

export interface FeedArticle {
  title: string;
  link: string;
  pubDate: string | undefined;
  contentSnippet: string | undefined;
  source: string;
}

// Detect real source from article URL (for aggregated feeds like rss.app)
function detectSourceFromUrl(url: string): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes("globes.co.il")) return "גלובס";
  if (lower.includes("calcalist.co.il")) return "כלכליסט";
  if (lower.includes("themarker.com")) return "דה מרקר";
  if (lower.includes("ynet.co.il")) return "ynet";
  if (lower.includes("maariv.co.il")) return "מעריב";
  if (lower.includes("bizportal.co.il")) return "ביזפורטל";
  if (lower.includes("walla.co.il")) return "וואלה";
  if (lower.includes("israelhayom.co.il")) return "ישראל היום";
  if (lower.includes("news1.co.il")) return "News1";
  if (lower.includes("ice.co.il")) return "ICE";
  if (lower.includes("kan.org.il")) return "כאן";
  return null;
}

export async function fetchAllFeeds(): Promise<FeedArticle[]> {
  const articles: FeedArticle[] = [];
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      try {
        const parsed = await parser.parseURL(feed.url);
        return (parsed.items || [])
          .filter((item) => {
            if (!item.pubDate) return true;
            return new Date(item.pubDate) >= oneDayAgo;
          })
          .map((item) => ({
            title: item.title || "ללא כותרת",
            link: item.link || "",
            pubDate: item.pubDate,
            contentSnippet: item.contentSnippet?.slice(0, 500),
            source: detectSourceFromUrl(item.link || "") || feed.name,
          }));
      } catch (err) {
        console.error(`Failed to fetch ${feed.name}:`, err);
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    }
  }

  return articles;
}
