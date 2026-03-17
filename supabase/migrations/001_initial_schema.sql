-- news_items: Raw news from RSS
CREATE TABLE news_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL,
  summary TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  scan_batch TEXT NOT NULL
);

CREATE INDEX idx_news_items_published ON news_items(published_at DESC);
CREATE INDEX idx_news_items_url ON news_items(source_url);

-- news_scores: AI scoring
CREATE TABLE news_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_item_id UUID REFERENCES news_items(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score BETWEEN 1 AND 100),
  reasoning TEXT NOT NULL,
  scored_at TIMESTAMPTZ DEFAULT now(),
  scan_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX idx_news_scores_date ON news_scores(scan_date DESC);

-- generated_texts: WhatsApp texts
CREATE TABLE generated_texts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_item_id UUID REFERENCES news_items(id) ON DELETE CASCADE,
  style TEXT NOT NULL CHECK (style IN ('short', 'regular', 'commentary')),
  whatsapp_text TEXT NOT NULL,
  edited_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- commentaries: 5-part professional commentary
CREATE TABLE commentaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_item_id UUID REFERENCES news_items(id) ON DELETE CASCADE,
  what_happened TEXT NOT NULL,
  why_important TEXT NOT NULL,
  common_questions JSONB NOT NULL,
  real_understanding TEXT NOT NULL,
  our_angle TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- send_history: What was sent and when
CREATE TABLE send_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_text_id UUID REFERENCES generated_texts(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT now(),
  sent_by TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp_copy', 'whatsapp_share'))
);

-- RLS: Open access (internal tool, no auth)
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commentaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE send_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on news_items" ON news_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on news_scores" ON news_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on generated_texts" ON generated_texts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on commentaries" ON commentaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on send_history" ON send_history FOR ALL USING (true) WITH CHECK (true);
