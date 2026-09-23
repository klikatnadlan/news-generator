export interface NewsItem {
  id: string;
  title: string;
  source: string;
  source_url: string;
  published_at: string;
  summary: string | null;
  fetched_at: string;
  scan_batch: string;
}

export interface NewsScore {
  id: string;
  news_item_id: string;
  score: number;
  reasoning: string;
  scored_at: string;
  scan_date: string;
}

export interface ScoredNews extends NewsItem {
  score: number;
  reasoning: string;
}

export interface GeneratedText {
  id: string;
  news_item_id: string;
  style: "short" | "regular" | "commentary";
  whatsapp_text: string;
  edited_text: string | null;
  created_at: string;
}

export interface Commentary {
  id: string;
  news_item_id: string;
  what_happened: string;
  why_important: string;
  common_questions: string[];
  real_understanding: string;
  our_angle: string;
  created_at: string;
}

export interface SendHistory {
  id: string;
  generated_text_id: string;
  sent_at: string;
  sent_by: string | null;
  channel: "whatsapp_copy" | "whatsapp_share";
}

export interface RSSFeedConfig {
  name: string;
  url: string;
  category: string;
  // Broad feeds (general/local): ingested into the corpus for search/city
  // research, but NOT scored by Claude (zero tokens). They never reach the
  // curated home/headlines feeds, which read only scored items.
  ingestOnly?: boolean;
  // Per-feed User-Agent override. The default bot UA is honest and preferred,
  // but a few publishers reject any non-browser UA outright (TheMarker answers
  // 403 to "KlikaVault-NewsBot/1.0" while serving 100 items to a browser UA).
  // Set this ONLY for feeds measured to require it — see feed-health.
  userAgent?: string;
  // Fetch through Firecrawl when the direct fetch fails. For publishers that
  // block our SERVER's IP outright (not the User-Agent), which no header change
  // can work around. Costs ~1 Firecrawl credit per refresh, so it is opt-in per
  // feed and only ever runs after a direct attempt has already failed.
  viaFirecrawlOnBlock?: boolean;
  // Add a one-off query parameter on every fetch. For a site whose page cache
  // serves a frozen copy of its feed: measured 2026-09-23, rmgcity.co.il/feed/
  // answered with items 21 days old while the site had published that morning,
  // and the same URL with any fresh parameter returned the live feed. One
  // request a day either way — this only changes which copy we are handed.
  cacheBust?: boolean;
}
