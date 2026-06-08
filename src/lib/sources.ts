import type { RSSFeedConfig } from "./types";

export const RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: "גלובס נדל״ן",
    url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2611",
    category: "general",
  },
  {
    name: "כלכליסט נדל״ן",
    url: "https://www.calcalist.co.il/GeneralRSS/0,16335,L-8,00.xml",
    category: "general",
  },
  {
    name: "TheMarker נדל״ן",
    url: "https://www.themarker.com/cmlink/1.145",
    category: "general",
  },
  {
    name: "ynet נדל״ן",
    url: "https://www.ynet.co.il/Integration/StoryRss1854.xml",
    category: "general",
  },
  {
    name: "מעריב נדל״ן",
    url: "https://www.maariv.co.il/rss/nadlan",
    category: "general",
  },
  {
    name: 'קליקת הנדל"ן',
    url: "https://klikatnadlan.co.il/feed/",
    category: "נדל\"ן",
  },
  {
    name: "קליקת חדשות (מאוחד)",
    url: "https://rss.app/feeds/_EXSHhiSZsny9QX8x.xml",
    category: "נדל\"ן",
  },
  {
    name: "Ynet כסף",
    url: "https://www.ynet.co.il/Integration/StoryRss6740.xml",
    category: "כלכלה",
  },
  {
    name: "Bizportal נדל\"ן",
    url: "https://www.bizportal.co.il/rss/realestate",
    category: "נדל\"ן",
  },
  {
    name: "Walla כלכלה",
    url: "https://rss.walla.co.il/feed/6",
    category: "כלכלה",
  },

  // ─── Broad feeds (ingest-only, NOT scored — zero tokens) ───
  // General national news so cities/areas get civic coverage (employment,
  // education, security, transport, big employers like Nvidia). These enrich
  // search / city research only; they never reach the curated home/headlines.
  { name: "ynet בארץ", url: "https://www.ynet.co.il/Integration/StoryRss2.xml", category: "כללי", ingestOnly: true },
  { name: "וואלה חדשות", url: "https://rss.walla.co.il/feed/1", category: "כללי", ingestOnly: true },
  { name: "מעריב חדשות", url: "https://www.maariv.co.il/Rss/RssChadashot", category: "כללי", ingestOnly: true },
  { name: "גלובס חדשות", url: "https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=1725", category: "כללי", ingestOnly: true },
  { name: "דבר", url: "https://www.davar1.co.il/feed/", category: "כללי", ingestOnly: true },
];
