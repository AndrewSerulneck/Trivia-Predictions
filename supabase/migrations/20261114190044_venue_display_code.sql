-- Short display link (docs/live-trivia-pregame-and-display-cleanup-plan.md, Phase 4).
--
-- Every venue gets a permanent 4-character code; hightopchallenge.com/tv/<code>
-- (app/tv/[code]/route.ts) redirects to that venue's display. Alphabet: Crockford
-- base32, 0-9 A-Z minus I L O U (32^4 ≈ 1M codes). Stored uppercase; the route
-- uppercases what is typed. App copy of the alphabet: lib/displayCode.ts
-- (tests/display-code-contract.test.ts pins that they match).
--
-- The code reveals only the display, which is already public, so it is not a
-- secret and has no rate limit. Never put anything private on the display.
--
-- Filling: a BEFORE INSERT OR UPDATE OF display_code trigger sets a fresh code
-- whenever the row's code is NULL. So new venues get one with no app change, a
-- code can never be cleared, and the backfill below is just "set it to NULL".
-- The functions are SECURITY INVOKER (venues are written only by service_role).
--
-- No new table, view or sequence, so no table grants. The generator is
-- server-only: EXECUTE revoked from public, anon, authenticated.
--
-- Backfill log (16 venues before the push):
-- docs/live-trivia-pregame-and-display-cleanup-plan_PHASE_4_BACKFILL_LOG_2026-11-14.json
-- Undo (nothing else reads the column):
--   drop trigger if exists venues_fill_display_code on public.venues;
--   drop function if exists public.venues_fill_display_code();
--   drop function if exists public.generate_venue_display_code();
--   alter table public.venues drop column if exists display_code;

alter table public.venues
  add column if not exists display_code text;

alter table public.venues
  drop constraint if exists venues_display_code_format;

alter table public.venues
  add constraint venues_display_code_format
  check (display_code ~ '^[0-9A-HJKMNP-TV-Z]{4}$');

create unique index if not exists venues_display_code_key
  on public.venues (display_code);

comment on column public.venues.display_code is
  'Short display link code: hightopchallenge.com/tv/<code> → /venue/<id>/screen. 4 chars, Crockford base32, uppercase. Filled by trigger venues_fill_display_code.';

create or replace function public.generate_venue_display_code()
returns text
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  attempt integer := 0;
begin
  loop
    attempt := attempt + 1;
    candidate := '';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::integer, 1);
    end loop;
    -- A row-level BEFORE trigger sees rows the same statement already changed,
    -- so this also avoids collisions inside the backfill below.
    if not exists (select 1 from public.venues where display_code = candidate) then
      return candidate;
    end if;
    if attempt >= 50 then
      raise exception 'Could not find a free venue display code after % attempts', attempt;
    end if;
  end loop;
end;
$$;

revoke all on function public.generate_venue_display_code() from public, anon, authenticated;
grant execute on function public.generate_venue_display_code() to service_role;

create or replace function public.venues_fill_display_code()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.display_code is null then
    new.display_code := public.generate_venue_display_code();
  end if;
  return new;
end;
$$;

drop trigger if exists venues_fill_display_code on public.venues;
create trigger venues_fill_display_code
  before insert or update of display_code on public.venues
  for each row
  execute function public.venues_fill_display_code();

-- Backfill: the trigger fills each NULL code.
update public.venues
  set display_code = null
  where display_code is null;

alter table public.venues
  alter column display_code set not null;
