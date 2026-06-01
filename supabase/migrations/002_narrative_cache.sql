-- 002_narrative_cache.sql
-- Applied live 2026-06-01 via Supabase MCP to project news-generator
-- (uhexangjjtgnlnxinuyj). Saved here to keep the repo in sync.
--
-- Memoizes /api/narratives results per (category|range|topic) with a 15-minute
-- TTL (enforced in app code). First viewer absorbs the ~30-40s Claude call;
-- every viewer after gets a ~300ms cache hit. Verified 128x speedup.

create table if not exists public.narrative_cache (
  cache_key   text primary key,            -- "<category>|<range>|<topic>"
  narratives  jsonb not null default '[]'::jsonb,
  count       integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists narrative_cache_created_at_idx
  on public.narrative_cache (created_at);

alter table public.narrative_cache enable row level security;

-- The app uses the anon key. Allow anon read + write (public, derived data).
drop policy if exists narrative_cache_anon_select on public.narrative_cache;
create policy narrative_cache_anon_select on public.narrative_cache
  for select to anon using (true);

drop policy if exists narrative_cache_anon_insert on public.narrative_cache;
create policy narrative_cache_anon_insert on public.narrative_cache
  for insert to anon with check (true);

drop policy if exists narrative_cache_anon_update on public.narrative_cache;
create policy narrative_cache_anon_update on public.narrative_cache
  for update to anon using (true) with check (true);
