-- 004_topic_alerts.sql
-- Applied live 2026-06-04 via Supabase MCP to project news-generator
-- (uhexangjjtgnlnxinuyj). Saved here to keep the repo in sync.
-- (Reflects the final, fast version — matching uses an escaped-regex ~* over a
--  concatenated title+summary GIN-trgm expression index: Bitmap Index Scan,
--  ~1.3ms/alert vs 442ms with the naive per-keyword ILIKE. Comfortably under
--  the anon 3s statement_timeout; scales to 100k+ rows.)
--
-- "מעקבים" (topic watches): user-defined keyword groups. Matching is done at
-- QUERY TIME against the existing news_items archive (retroactive) and every
-- future scan (automatic) — pure SQL, zero AI tokens. Generation stays
-- on-click (the existing /api/generate + /api/article SSE flow).

create extension if not exists pg_trgm;

-- Single expression index that the regex matcher below actually uses.
create index if not exists news_items_titlesum_trgm
  on public.news_items using gin ((coalesce(title,'') || ' ' || coalesce(summary,'')) gin_trgm_ops);

create table if not exists public.topic_alerts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  keywords text[] not null default '{}',
  emoji text default '🔔',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.topic_alerts enable row level security;
drop policy if exists topic_alerts_anon_select on public.topic_alerts;
create policy topic_alerts_anon_select on public.topic_alerts for select to anon using (true);
drop policy if exists topic_alerts_anon_insert on public.topic_alerts;
create policy topic_alerts_anon_insert on public.topic_alerts for insert to anon with check (true);
drop policy if exists topic_alerts_anon_update on public.topic_alerts;
create policy topic_alerts_anon_update on public.topic_alerts for update to anon using (true) with check (true);
drop policy if exists topic_alerts_anon_delete on public.topic_alerts;
create policy topic_alerts_anon_delete on public.topic_alerts for delete to anon using (true);

-- Build a safe case-insensitive regex from keywords (regex metachars escaped),
-- so user-entered keywords can never break or inject into the match.
create or replace function public.keywords_to_regex(p_keywords text[])
returns text language sql immutable as $$
  select '(' || string_agg(
    regexp_replace(kw, '([\.^$|?*+(){}\[\]\\\\])', '\\\&', 'g'), '|'
  ) || ')'
  from unnest(p_keywords) kw
  where coalesce(kw, '') <> '';
$$;

-- One call: every active alert + match count + latest article date.
create or replace function public.alert_overview()
returns table(id uuid, name text, emoji text, keywords text[], match_count bigint, latest_published timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.emoji, a.keywords, m.cnt, m.latest
  from public.topic_alerts a
  cross join lateral (select public.keywords_to_regex(a.keywords) as pat) p
  cross join lateral (
    select count(*) as cnt, max(ni.published_at) as latest
    from public.news_items ni
    where p.pat is not null
      and (coalesce(ni.title, '') || ' ' || coalesce(ni.summary, '')) ~* p.pat
  ) m
  where a.active
  order by a.created_at;
$$;

-- Articles matching a keyword set, newest first, with latest score if any.
-- Optional date-range bounds (p_from / p_to) for the per-alert date filter.
create or replace function public.match_alert_articles(
  p_keywords text[],
  p_limit int default 300,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table(id uuid, title text, source text, source_url text, summary text, published_at timestamptz, score int)
language sql stable security definer set search_path = public as $$
  select ni.id, ni.title, ni.source, ni.source_url, ni.summary, ni.published_at,
    (select s.score from public.news_scores s where s.news_item_id = ni.id order by s.scored_at desc nulls last limit 1) as score
  from public.news_items ni, (select public.keywords_to_regex(p_keywords) as pat) p
  where p.pat is not null
    and (coalesce(ni.title, '') || ' ' || coalesce(ni.summary, '')) ~* p.pat
    and (p_from is null or ni.published_at >= p_from)
    and (p_to   is null or ni.published_at <  (p_to + interval '1 day'))
  order by ni.published_at desc nulls last
  limit p_limit;
$$;

grant execute on function public.keywords_to_regex(text[]) to anon;
grant execute on function public.alert_overview() to anon;
grant execute on function public.match_alert_articles(text[], int, timestamptz, timestamptz) to anon;

-- Seed Ben's core topics (editable/deletable from the UI)
insert into public.topic_alerts (name, keywords, emoji) values
  ('חוק התיווך ומתווכים', array['חוק התיווך','חוק המתווכים','תביעת מתווך','תבע מתווך','תבעו מתווך','דמי תיווך','רישיון תיווך'], '⚖️'),
  ('דירה בהנחה ומחיר למשתכן', array['דירה בהנחה','מחיר למשתכן','מחיר מטרה','הגרלת דירה','דיור מוזל'], '🏷️'),
  ('פיטורי הייטק', array['פיטורי הייטק','פיטורים','פוטרו','צמצומים','קיצוצים'], '💼'),
  ('גיוסים ואקזיטים', array['גיוס הון','אקזיט','נרכשה','נמכרה','הנפקה','סבב גיוס'], '🚀'),
  ('התחדשות עירונית', array['התחדשות עירונית','פינוי בינוי','פינוי-בינוי','תמ"א 38','תמ"א'], '🏗️'),
  ('תביעות קבלן ויזם', array['תביעת קבלן','תבעו יזם','תביעה ייצוגית','ליקויי בנייה','קבלן פושט רגל'], '📑');
