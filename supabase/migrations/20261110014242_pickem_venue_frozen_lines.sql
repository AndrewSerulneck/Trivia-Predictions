-- Pick 'Em frozen spread lines per bar (docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase B3, D3, Q1).
--
-- A bar with a pick window and spreads on shows every player the SAME line for a game, and grades every
-- pick against it. The line freezes for that bar the first time the game is shown inside its open window
-- (Q1 default, 2026-11-09): the games list copies the global line (pickem_game_lines for College Football,
-- nfl_pickem_game_lines for NFL Pick 'Em) into this table once. A line posted late freezes when first
-- shown. A pick at a windowed bar freezes it first if the list didn't, so every such pick has a row here
-- from before it was saved, and the row never changes afterwards. The pick records that line in its own
-- pickem_picks.home_spread / away_spread (until now written only at grading, so no pending pick had them:
-- checked 2026-11-09), and settlement grades a pending spread pick by its recorded line, else by the
-- global line locked at kickoff (lib/pickemFrozenLines.ts). No change to pickem_picks.
--
-- Insert once, never update: written ONLY by freeze_pickem_venue_lines (SECURITY DEFINER, service_role
-- only), which inserts before kickoff (database clock) and does nothing on conflict. service_role can
-- read but not write the table directly, and an update trigger refuses any change.
--
-- Cost: one RPC per (bar, game) the first time it is frozen (≈45 college + ≈16 NFL games a week per
-- windowed spread bar); one indexed range read per games-list view there; settlement reads nothing new.
-- DEPLOY ORDER: before the code. Without it a windowed bar's list shows the global line, and a pick at a
-- windowed spread bar is refused until it exists; bars without a window are untouched. Applying it is
-- Andrew's call. Proof: npm run test:pickem-frozen-lines-sql.

create table if not exists public.pickem_venue_frozen_lines (
  venue_id text not null references public.venues(id) on delete cascade,
  sport_key text not null,
  -- The Pick 'Em game id (pickem_picks.game_id): provider id + kickoff + teams.
  game_id text not null,
  starts_at timestamptz not null,
  home_spread numeric not null,
  away_spread numeric not null,
  -- The sportsbook the copied line came from, e.g. 'fanduel'.
  source_vendor text not null,
  frozen_at timestamptz not null default now(),
  primary key (venue_id, sport_key, game_id)
);

create index if not exists pickem_venue_frozen_lines_venue_starts_idx
  on public.pickem_venue_frozen_lines (venue_id, starts_at);

alter table public.pickem_venue_frozen_lines enable row level security;
alter table public.pickem_venue_frozen_lines force row level security;
-- Revoked from service_role too (a default privilege may have granted it everything), then read-only.
revoke all on table public.pickem_venue_frozen_lines from public, anon, authenticated, service_role;
grant select on table public.pickem_venue_frozen_lines to service_role;

-- A frozen line never changes (venue deletion still cascades).
create or replace function public.pickem_venue_frozen_lines_refuse_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'pickem_venue_frozen_lines: a frozen line never changes';
end;
$$;

drop trigger if exists pickem_venue_frozen_lines_no_update on public.pickem_venue_frozen_lines;
create trigger pickem_venue_frozen_lines_no_update
  before update on public.pickem_venue_frozen_lines
  for each row execute function public.pickem_venue_frozen_lines_refuse_update();

-- Freeze the listed lines for one bar: a row is created only while its game has not started (by the
-- database clock); an existing row is kept as it is. Returns this bar's frozen row for every listed
-- game that has one (new or earlier), so the caller always gets the number that counts.
create or replace function public.freeze_pickem_venue_lines(p_venue_id text, p_rows jsonb)
returns setof public.pickem_venue_frozen_lines
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_venue_id is null or btrim(p_venue_id) = '' then
    raise exception 'freeze_pickem_venue_lines: venue is required';
  end if;

  insert into pickem_venue_frozen_lines (venue_id, sport_key, game_id, starts_at, home_spread, away_spread, source_vendor)
  select p_venue_id, r.sport_key, r.game_id, r.starts_at, r.home_spread, r.away_spread, coalesce(nullif(btrim(r.source_vendor), ''), 'unknown')
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
    sport_key text, game_id text, starts_at timestamptz, home_spread numeric, away_spread numeric, source_vendor text
  )
  where r.sport_key is not null
    and r.game_id is not null
    and r.starts_at is not null
    and r.home_spread is not null
    and r.away_spread is not null
    and r.starts_at > now()
  on conflict (venue_id, sport_key, game_id) do nothing;

  return query
    select f.*
      from pickem_venue_frozen_lines f
      join jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(sport_key text, game_id text)
        on f.sport_key = r.sport_key and f.game_id = r.game_id
     where f.venue_id = p_venue_id;
end;
$$;

revoke all on function public.freeze_pickem_venue_lines(text, jsonb) from public, anon, authenticated;
grant execute on function public.freeze_pickem_venue_lines(text, jsonb) to service_role;
