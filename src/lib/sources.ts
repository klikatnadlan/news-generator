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
];
