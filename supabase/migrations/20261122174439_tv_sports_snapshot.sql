-- Venue TV sports screens (docs/fire-tv-app-plan.md Phase 9, D27).
--
-- One shared copy of today's games for every venue's TV. It is refreshed from the sports feed (BallDontLie) at most
-- once per league per interval, and only while some TV is showing the idle carousel: the state request claims the
-- leagues that are due (claim_tv_sports_refresh) and refreshes them after its response is sent. No new cron.
-- Server-only: the browser never reads these tables (the TV gets the games inside /api/venue-screen/state).

create table if not exists public.tv_sports_games (
  -- `${feed}#${providerEventId}`: the feed path (e.g. /nfl/v1/games) plus the provider's event id. Pick 'Em picks
  -- join on the same key (their game_id formats differ between NFL Pick 'Em and the other leagues).
  feed_game_key text primary key,
  sport_key text not null,
  league text not null,
  home_team text not null,
  away_team text not null,
  home_abbr text,
  away_abbr text,
  starts_at timestamptz not null,
  is_final boolean not null default false,
  -- The feed's own state ('scheduled' | 'live' | 'final'); null when it doesn't say (the TV goes by the clock).
  feed_state text check (feed_state in ('scheduled', 'live', 'final')),
  -- When a refresh first saw the game final: finals leave the TV an hour later.
  final_seen_at timestamptz,
  -- Null = unknown (not yet started, or the feed had no score). Never read as 0.
  home_score integer,
  away_score integer,
  period_label text,
  -- Null when the feed doesn't say.
  is_postseason boolean,
  refreshed_at timestamptz not null default now()
);

create index if not exists tv_sports_games_starts_at_idx on public.tv_sports_games (starts_at);
create index if not exists tv_sports_games_sport_key_refreshed_idx on public.tv_sports_games (sport_key, refreshed_at);

alter table public.tv_sports_games enable row level security;
alter table public.tv_sports_games force row level security;
revoke all on table public.tv_sports_games from public, anon, authenticated;
grant select, insert, update, delete on table public.tv_sports_games to service_role;

-- When each league is next due for a refresh. The claim moves due_at forward first, so two TVs never refresh the
-- same league at once; the refresh then sets the real next time (sooner while games are live, hours when a league
-- has no games).
create table if not exists public.tv_sports_refresh (
  sport_key text primary key,
  due_at timestamptz not null default now()
);

alter table public.tv_sports_refresh enable row level security;
alter table public.tv_sports_refresh force row level security;
revoke all on table public.tv_sports_refresh from public, anon, authenticated;
grant select, insert, update, delete on table public.tv_sports_refresh to service_role;

-- Claims every listed league that is due, for p_lease_seconds. Returns the claimed sport keys. A league with no row
-- yet is added as due. Row locks make the claim atomic: a second caller re-checks due_at after the first commits.
create or replace function public.claim_tv_sports_refresh(p_sport_keys text[], p_lease_seconds integer)
returns setof text
language plpgsql
set search_path = public
as $$
begin
  insert into public.tv_sports_refresh (sport_key, due_at)
  select key, now() from unnest(p_sport_keys) as key
  on conflict (sport_key) do nothing;

  return query
    update public.tv_sports_refresh
       set due_at = now() + make_interval(secs => greatest(p_lease_seconds, 30))
     where sport_key = any(p_sport_keys)
       and due_at <= now()
    returning sport_key;
end;
$$;

revoke all on function public.claim_tv_sports_refresh(text[], integer) from public, anon, authenticated;
grant execute on function public.claim_tv_sports_refresh(text[], integer) to service_role;

-- Today's picks at one venue (the TV's pick counts and Pick 'Em top 5): one bounded range read.
create index if not exists pickem_picks_venue_starts_at_idx on public.pickem_picks (venue_id, starts_at);
