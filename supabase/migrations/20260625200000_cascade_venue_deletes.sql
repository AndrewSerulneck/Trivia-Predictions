-- Allow venues to be deleted by cascading all venue_id foreign keys.
-- Previously these were ON DELETE RESTRICT, which blocked any venue deletion.

alter table public.users
  drop constraint if exists users_venue_id_fkey,
  add constraint users_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.sports_bingo_cards
  drop constraint if exists sports_bingo_cards_venue_id_fkey,
  add constraint sports_bingo_cards_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.pickem_picks
  drop constraint if exists pickem_picks_venue_id_fkey,
  add constraint pickem_picks_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.challenge_invites
  drop constraint if exists challenge_invites_venue_id_fkey,
  add constraint challenge_invites_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.prize_wins
  drop constraint if exists prize_wins_venue_id_fkey,
  add constraint prize_wins_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.fantasy_entries
  drop constraint if exists fantasy_entries_venue_id_fkey,
  add constraint fantasy_entries_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.pickem_daily_snapshots
  drop constraint if exists pickem_daily_snapshots_venue_id_fkey,
  add constraint pickem_daily_snapshots_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.trivia_schedules
  drop constraint if exists trivia_schedules_venue_id_fkey,
  add constraint trivia_schedules_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.user_sessions
  drop constraint if exists user_sessions_venue_id_fkey,
  add constraint user_sessions_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.game_sessions
  drop constraint if exists game_sessions_venue_id_fkey,
  add constraint game_sessions_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

alter table public.ad_interactions
  drop constraint if exists ad_interactions_venue_id_fkey,
  add constraint ad_interactions_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;

-- venue_category_resets has no FK on venue_id (it is an audit log with no
-- referential integrity from creation). Add the cascade constraint directly.
alter table public.venue_category_resets
  add constraint venue_category_resets_venue_id_fkey
    foreign key (venue_id) references public.venues(id) on delete cascade;
