-- Tracks seeder warnings when a venue ran low on unseen Live Trivia questions
-- during occurrence seeding. Used for admin observability (Phase 1 of question
-- rotation improvement).

create table if not exists public.venue_question_warnings (
  id            uuid primary key default gen_random_uuid(),
  venue_id      text not null,
  schedule_id   uuid not null references public.trivia_schedules(id) on delete cascade,
  occurrence_date date not null,
  used_seen     boolean not null default false,
  repeated_questions boolean not null default false,
  used_recent_category boolean not null default false,
  used_overflow boolean not null default false,
  seeded_count  integer not null default 0,
  needed_count  integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists venue_question_warnings_venue_id_idx
  on public.venue_question_warnings (venue_id, created_at desc);

create index if not exists venue_question_warnings_occurrence_idx
  on public.venue_question_warnings (schedule_id, occurrence_date);

-- RLS
alter table public.venue_question_warnings enable row level security;
alter table public.venue_question_warnings force row level security;

-- Only service role writes; anon/authenticated have no access (admin UI uses service role)
revoke all on table public.venue_question_warnings from anon, authenticated;
