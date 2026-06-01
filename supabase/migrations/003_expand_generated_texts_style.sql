-- 003_expand_generated_texts_style.sql
-- Applied live 2026-06-01 via Supabase MCP to project news-generator
-- (uhexangjjtgnlnxinuyj). Saved here to keep the repo in sync.
--
-- The original generated_texts_style_check only allowed
-- 'short' / 'regular' / 'commentary', so digest + article inserts silently
-- failed the constraint and never persisted (history logging broke for them).
-- Expand the allowed set. Additive in spirit: no data dropped, only the
-- allowed-value list grows.

alter table public.generated_texts
  drop constraint if exists generated_texts_style_check;

alter table public.generated_texts
  add constraint generated_texts_style_check
  check (style = any (array[
    'short'::text,
    'regular'::text,
    'commentary'::text,
    'digest'::text,
    'article'::text,
    'article_from_narrative'::text
  ]));
