-- Step 2 foundation: dynamic Live Showdown scheduling + per-session question mapping

create table if not exists trivia_schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_time timestamptz not null,
  timezone text not null default 'America/New_York',
  recurring_type text not null default 'none',
  num_rounds integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trivia_schedules_num_rounds_valid check (num_rounds >= 1 and num_rounds <= 24),
  constraint trivia_schedules_recurring_type_valid check (recurring_type in ('none', 'daily', 'weekly', 'monthly', 'yearly'))
);

create index if not exists idx_trivia_schedules_start_time
  on trivia_schedules(start_time);

create index if not exists idx_trivia_schedules_start_time_desc
  on trivia_schedules(start_time desc);

create table if not exists trivia_session_questions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references trivia_schedules(id) on delete cascade,
  question_id text not null references trivia_questions(slug) on delete restrict,
  round_number integer not null,
  question_index integer not null,
  created_at timestamptz not null default now(),
  constraint trivia_session_questions_round_valid check (round_number >= 1),
  constraint trivia_session_questions_question_index_valid check (question_index between 1 and 15),
  constraint trivia_session_questions_schedule_round_question_unique unique (schedule_id, round_number, question_index)
);

create index if not exists idx_trivia_session_questions_schedule
  on trivia_session_questions(schedule_id);

create index if not exists idx_trivia_session_questions_schedule_round
  on trivia_session_questions(schedule_id, round_number, question_index);

create index if not exists idx_trivia_session_questions_question_id
  on trivia_session_questions(question_id);

-- Keep parity with other mutable tables.
drop trigger if exists trivia_schedules_set_updated_at on trivia_schedules;
create trigger trivia_schedules_set_updated_at
before update on trivia_schedules
for each row execute function set_updated_at();

alter table trivia_schedules enable row level security;
alter table trivia_session_questions enable row level security;

drop policy if exists "Authenticated can view trivia schedules" on trivia_schedules;
create policy "Authenticated can view trivia schedules"
  on trivia_schedules for select
  using (auth.role() = 'authenticated');

drop policy if exists "Authenticated can view trivia session questions" on trivia_session_questions;
create policy "Authenticated can view trivia session questions"
  on trivia_session_questions for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admins can manage trivia schedules" on trivia_schedules;
create policy "Admins can manage trivia schedules"
  on trivia_schedules for all
  using (exists (select 1 from users where auth_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from users where auth_id = auth.uid() and is_admin = true));

drop policy if exists "Admins can manage trivia session questions" on trivia_session_questions;
create policy "Admins can manage trivia session questions"
  on trivia_session_questions for all
  using (exists (select 1 from users where auth_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from users where auth_id = auth.uid() and is_admin = true));
