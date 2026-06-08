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
}
