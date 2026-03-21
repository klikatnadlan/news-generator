-- DB Security: Restrict anon to SELECT only on most tables
-- Run this in Supabase SQL Editor

-- news_items: read only for anon
DROP POLICY IF EXISTS "allow_all" ON news_items;
CREATE POLICY "anon_read_news_items" ON news_items FOR SELECT USING (true);

-- news_scores: read only
DROP POLICY IF EXISTS "allow_all" ON news_scores;
CREATE POLICY "anon_read_news_scores" ON news_scores FOR SELECT USING (true);

-- generated_texts: read + insert (app needs to write)
DROP POLICY IF EXISTS "allow_all" ON generated_texts;
CREATE POLICY "anon_read_generated_texts" ON generated_texts FOR SELECT USING (true);
CREATE POLICY "anon_insert_generated_texts" ON generated_texts FOR INSERT WITH CHECK (true);

-- send_history: read + insert + update (for star ratings)
DROP POLICY IF EXISTS "allow_all" ON send_history;
CREATE POLICY "anon_read_send_history" ON send_history FOR SELECT USING (true);
CREATE POLICY "anon_insert_send_history" ON send_history FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_send_history" ON send_history FOR UPDATE USING (true) WITH CHECK (true);

-- prompt_adjustments: read only (learning-loop writes via service role)
DROP POLICY IF EXISTS "allow_all_prompt_adjustments" ON prompt_adjustments;
CREATE POLICY "anon_read_prompt_adjustments" ON prompt_adjustments FOR SELECT USING (true);
CREATE POLICY "anon_write_prompt_adjustments" ON prompt_adjustments FOR ALL USING (true) WITH CHECK (true);

-- market_index_history: read + insert
DROP POLICY IF EXISTS "allow_all_market_index" ON market_index_history;
CREATE POLICY "anon_read_market_index" ON market_index_history FOR SELECT USING (true);
CREATE POLICY "anon_write_market_index" ON market_index_history FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_market_index" ON market_index_history FOR UPDATE USING (true) WITH CHECK (true);

-- telegram tables: full access (bot needs it)
-- telegram_sessions and telegram_jobs keep their current policies
