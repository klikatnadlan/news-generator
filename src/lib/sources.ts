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
];
