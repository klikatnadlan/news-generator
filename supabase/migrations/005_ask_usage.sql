-- Daily cap for /api/ask. The route is public and unauthenticated and it calls
-- Claude, so without a ceiling a loop against the URL runs up the bill.
create table if not exists ask_usage (
  day   date primary key,
  count int  not null default 0
);

-- No policies: the server reads and writes with the service_role key, which
-- bypasses RLS. Enabling RLS with zero policies means the anon key (which ships
-- to every browser) can neither read nor write this table.
alter table ask_usage enable row level security;

-- Atomic check-and-increment. Doing this in one statement matters: two requests
-- landing together on read-then-write would both see "under cap" and both spend.
-- Returns the new count, or -1 when the cap is already reached.
create or replace function bump_ask_usage(p_cap int)
returns int
language plpgsql
as $$
declare
  v_count int;
begin
  insert into ask_usage (day, count) values (current_date, 0)
  on conflict (day) do nothing;

  update ask_usage
     set count = count + 1
   where day = current_date
     and count < p_cap
  returning count into v_count;

  return coalesce(v_count, -1);
end;
$$;
