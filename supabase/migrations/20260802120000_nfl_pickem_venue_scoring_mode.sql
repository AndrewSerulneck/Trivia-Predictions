-- NFL Pick 'Em venue scoring mode foundation.
--
-- Phase 1 adds:
-- 1. venue_game_settings: per-venue game configuration, starting with NFL Pick 'Em scoring mode.
-- 2. nfl_pickem_game_lines: locked spreads used to grade spread-mode picks deterministically.
-- 3. pickem_picks audit columns so settled rows preserve the exact grading inputs used.

create table if not exists public.venue_game_settings (
  venue_id text primary key references public.venues(id) on delete cascade,
  nfl_pickem_scoring_mode text not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_game_settings_nfl_pickem_scoring_mode_valid
    check (nfl_pickem_scoring_mode in ('standard', 'spread'))
);

drop trigger if exists venue_game_settings_set_updated_at on public.venue_game_settings;
create trigger venue_game_settings_set_updated_at
before update on public.venue_game_settings
for each row execute function public.set_updated_at();

alter table public.venue_game_settings enable row level security;

create table if not exists public.nfl_pickem_game_lines (
  game_id text primary key,
  starts_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  home_spread numeric not null,
  away_spread numeric not null,
  provider text not null,
  fetched_at timestamptz not null default now(),
  locked_at timestamptz
);

alter table public.nfl_pickem_game_lines enable row level security;

alter table if exists public.pickem_picks
  add column if not exists scoring_mode text,
  add column if not exists home_spread numeric,
  add column if not exists away_spread numeric;

alter table if exists public.pickem_picks
  drop constraint if exists pickem_picks_scoring_mode_valid;

alter table if exists public.pickem_picks
  add constraint pickem_picks_scoring_mode_valid
    check (scoring_mode is null or scoring_mode in ('standard', 'spread'));
