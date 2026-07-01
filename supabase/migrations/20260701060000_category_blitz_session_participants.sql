-- Category Blitz "join anytime" spectator support: tracks the first time a
-- player's client observes any live state for a session. Compared against a
-- round's started_at (see lib/categoryBlitz.ts resolveViewerRole) to decide
-- whether a player was present for a round (can play) or joined mid-round
-- (spectates that round only, then plays starting the next one).

create table if not exists public.category_blitz_session_participants (
  session_id    uuid not null references public.category_blitz_sessions(id) on delete cascade,
  venue_id      text not null references public.venues(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  auth_id       uuid references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists idx_category_blitz_session_participants_venue
  on public.category_blitz_session_participants(venue_id);

alter table public.category_blitz_session_participants enable row level security;
alter table public.category_blitz_session_participants force row level security;

revoke all on table public.category_blitz_session_participants from anon, authenticated;
grant select, insert on table public.category_blitz_session_participants to authenticated;

-- Players can view participant rows at their venue (needed to know who else is playing vs spectating).
drop policy if exists "players can view participants at their venue" on public.category_blitz_session_participants;
create policy "players can view participants at their venue"
  on public.category_blitz_session_participants
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.venue_id = category_blitz_session_participants.venue_id
        and u.auth_id = (select auth.uid())
    )
  );

-- Players can register only their own presence.
drop policy if exists "players can insert own presence" on public.category_blitz_session_participants;
create policy "players can insert own presence"
  on public.category_blitz_session_participants
  for insert
  to authenticated
  with check (auth_id = (select auth.uid()));
