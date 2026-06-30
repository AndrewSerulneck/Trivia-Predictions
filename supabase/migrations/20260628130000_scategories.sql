-- Scategories: live venue-synchronized word game
-- Three tables: sessions (one per venue at a time), rounds (one per session),
-- and submissions (one per player per category per round).

-- ── scategories_sessions ─────────────────────────────────────────────────────

create table if not exists public.scategories_sessions (
  id           uuid primary key default gen_random_uuid(),
  venue_id     text not null references public.venues(id) on delete cascade,
  status       text not null default 'lobby'
                 check (status in ('lobby', 'active', 'scoring', 'complete')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

-- Only one active/lobby session per venue at a time.
create unique index if not exists uq_scategories_sessions_venue_active
  on public.scategories_sessions (venue_id)
  where status in ('lobby', 'active', 'scoring');

alter table public.scategories_sessions enable row level security;
alter table public.scategories_sessions force row level security;

revoke all on table public.scategories_sessions from anon, authenticated;
grant select on table public.scategories_sessions to authenticated;

drop policy if exists "players can view sessions at their venue" on public.scategories_sessions;
create policy "players can view sessions at their venue"
  on public.scategories_sessions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.venue_id = scategories_sessions.venue_id
        and u.auth_id = (select auth.uid())
    )
  );

-- ── scategories_rounds ────────────────────────────────────────────────────────

create table if not exists public.scategories_rounds (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.scategories_sessions(id) on delete cascade,
  venue_id           text not null references public.venues(id) on delete cascade,
  letter             char(1) not null,
  category_set_index int not null,
  categories         jsonb not null,  -- snapshot of the 12 category strings at round start
  started_at         timestamptz not null default now(),
  ends_at            timestamptz not null,
  status             text not null default 'active'
                       check (status in ('active', 'scoring', 'complete')),
  created_at         timestamptz not null default now()
);

create index if not exists idx_scategories_rounds_session on public.scategories_rounds(session_id);
create index if not exists idx_scategories_rounds_venue   on public.scategories_rounds(venue_id);

alter table public.scategories_rounds enable row level security;
alter table public.scategories_rounds force row level security;

revoke all on table public.scategories_rounds from anon, authenticated;
grant select on table public.scategories_rounds to authenticated;

drop policy if exists "players can view rounds at their venue" on public.scategories_rounds;
create policy "players can view rounds at their venue"
  on public.scategories_rounds
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.venue_id = scategories_rounds.venue_id
        and u.auth_id = (select auth.uid())
    )
  );

-- ── scategories_submissions ───────────────────────────────────────────────────

create table if not exists public.scategories_submissions (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references public.scategories_rounds(id) on delete cascade,
  venue_id          text not null references public.venues(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  auth_id           uuid not null references auth.users(id) on delete cascade,
  category_index    int not null check (category_index >= 0 and category_index <= 11),
  answer            text not null,
  normalized_answer text not null,          -- lowercased, stripped for uniqueness comparison
  is_unique         boolean,                -- null until scoring runs
  points_awarded    int not null default 0,
  submitted_at      timestamptz not null default now()
);

-- One answer per player per category per round.
create unique index if not exists uq_scategories_submissions_player_category
  on public.scategories_submissions (round_id, auth_id, category_index);

create index if not exists idx_scategories_submissions_round on public.scategories_submissions(round_id);
create index if not exists idx_scategories_submissions_venue on public.scategories_submissions(venue_id);
create index if not exists idx_scategories_submissions_user  on public.scategories_submissions(user_id);

alter table public.scategories_submissions enable row level security;
alter table public.scategories_submissions force row level security;

revoke all on table public.scategories_submissions from anon, authenticated;
grant select, insert on table public.scategories_submissions to authenticated;

-- Players can view all submissions in their venue (needed for results reveal).
drop policy if exists "players can view submissions at their venue" on public.scategories_submissions;
create policy "players can view submissions at their venue"
  on public.scategories_submissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.venue_id = scategories_submissions.venue_id
        and u.auth_id = (select auth.uid())
    )
  );

-- Players can insert only their own submissions.
drop policy if exists "players can insert own submissions" on public.scategories_submissions;
create policy "players can insert own submissions"
  on public.scategories_submissions
  for insert
  to authenticated
  with check (auth_id = (select auth.uid()));
