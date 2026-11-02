-- Pick 'Em Phase 3 (docs/pickem-college-football-and-prize-plan.md, decisions D3 + D9):
-- College Football is picked against the spread by default; a venue can switch to "pick the winner".
--
-- 1. venue_game_settings.cfb_pickem_scoring_mode: the venue's choice, default 'spread'. A venue
--    with no settings row reads as 'spread' in code too (lib/venueGameSettings.ts).
-- 2. pickem_picks.scoring_mode already exists (20260802120000, written at settlement for NFL).
--    College picks now get it stamped when the pick is made, and settlement grades by that stamp,
--    so a mid-day settings change never re-grades a pick already made. Old rows stay null.
-- 3. pickem_game_lines: the spread shown to players, one row per game. Written ONLY before kickoff
--    by upsert_pickem_game_lines; locked at kickoff by lock_pickem_game_lines, which never creates
--    a row (the NFL contract in docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md).
--    A locked row, or one whose game has started, is never changed.

alter table public.venue_game_settings
  add column if not exists cfb_pickem_scoring_mode text not null default 'spread';

alter table public.venue_game_settings
  drop constraint if exists venue_game_settings_cfb_pickem_scoring_mode_valid;

alter table public.venue_game_settings
  add constraint venue_game_settings_cfb_pickem_scoring_mode_valid
    check (cfb_pickem_scoring_mode in ('standard', 'spread'));

create table if not exists public.pickem_game_lines (
  sport_key text not null,
  -- The regular Pick 'Em game id (pickem_picks.game_id): provider id + kickoff + teams.
  game_id text not null,
  provider_game_id text not null,
  starts_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  home_spread numeric not null,
  away_spread numeric not null,
  -- The sportsbook the line came from, e.g. 'fanduel' (one vendor rule shared with NFL).
  source_vendor text not null,
  -- The provider's own updated_at for this line.
  fetched_at timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sport_key, game_id)
);

create index if not exists pickem_game_lines_sport_starts_idx
  on public.pickem_game_lines (sport_key, starts_at);

alter table public.pickem_game_lines enable row level security;
alter table public.pickem_game_lines force row level security;

revoke all on table public.pickem_game_lines from anon, authenticated;
grant select, insert, update, delete on table public.pickem_game_lines to service_role;

-- Save the lines the games list just read from the provider. A row is written only while its game
-- has not started (by the database clock), and an existing row is changed only while it is still
-- unlocked and its game has not started, so a line can never move after kickoff, however a slow
-- request races a lock. Returns the rows it wrote.
create or replace function public.upsert_pickem_game_lines(p_rows jsonb)
returns setof public.pickem_game_lines
language sql
set search_path = public
as $$
  insert into pickem_game_lines as l (
    sport_key, game_id, provider_game_id, starts_at, home_team, away_team,
    home_spread, away_spread, source_vendor, fetched_at
  )
  select r.sport_key, r.game_id, r.provider_game_id, r.starts_at, r.home_team, r.away_team,
         r.home_spread, r.away_spread, r.source_vendor, coalesce(r.fetched_at, now())
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
    sport_key text, game_id text, provider_game_id text, starts_at timestamptz,
    home_team text, away_team text, home_spread numeric, away_spread numeric,
    source_vendor text, fetched_at timestamptz
  )
  where r.sport_key is not null
    and r.game_id is not null
    and r.home_spread is not null
    and r.away_spread is not null
    and r.starts_at > now()
  on conflict (sport_key, game_id) do update
    set home_spread = excluded.home_spread,
        away_spread = excluded.away_spread,
        source_vendor = excluded.source_vendor,
        fetched_at = excluded.fetched_at,
        updated_at = now()
    where l.locked_at is null
      and l.starts_at > now()
  returning l.*;
$$;

-- Settlement: lock every listed line whose game has started, then return all listed rows (locked
-- or not). Never creates a row and never changes a spread.
create or replace function public.lock_pickem_game_lines(p_sport_key text, p_game_ids text[])
returns setof public.pickem_game_lines
language plpgsql
set search_path = public
as $$
begin
  update pickem_game_lines
     set locked_at = starts_at,
         updated_at = now()
   where sport_key = p_sport_key
     and game_id = any(coalesce(p_game_ids, '{}'::text[]))
     and locked_at is null
     and starts_at <= now();

  return query
    select *
      from pickem_game_lines
     where sport_key = p_sport_key
       and game_id = any(coalesce(p_game_ids, '{}'::text[]));
end;
$$;

revoke all on function public.upsert_pickem_game_lines(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_pickem_game_lines(jsonb) to service_role;
revoke all on function public.lock_pickem_game_lines(text, text[]) from public, anon, authenticated;
grant execute on function public.lock_pickem_game_lines(text, text[]) to service_role;
