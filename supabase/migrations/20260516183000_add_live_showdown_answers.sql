-- Step 3 foundation: persist Live Showdown write-in submissions and scoring

create table if not exists live_showdown_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  schedule_id uuid not null references trivia_schedules(id) on delete cascade,
  question_id text not null references trivia_questions(slug) on delete restrict,
  round_number integer not null,
  question_index integer not null,
  submitted_answer text not null,
  normalized_answer text not null,
  is_correct boolean not null,
  points_awarded integer not null default 0,
  answered_at timestamptz not null default now(),
  constraint live_showdown_answers_round_valid check (round_number >= 1),
  constraint live_showdown_answers_question_index_valid check (question_index between 1 and 15),
  constraint live_showdown_answers_points_non_negative check (points_awarded >= 0),
  constraint live_showdown_answers_user_schedule_round_question_unique
    unique (user_id, schedule_id, round_number, question_index)
);

create index if not exists idx_live_showdown_answers_user
  on live_showdown_answers(user_id, answered_at desc);

create index if not exists idx_live_showdown_answers_schedule
  on live_showdown_answers(schedule_id, round_number, question_index);

alter table live_showdown_answers enable row level security;

drop policy if exists "Users can read own live showdown answers" on live_showdown_answers;
create policy "Users can read own live showdown answers"
  on live_showdown_answers for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can insert own live showdown answers" on live_showdown_answers;
create policy "Users can insert own live showdown answers"
  on live_showdown_answers for insert
  with check (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Admins can manage live showdown answers" on live_showdown_answers;
create policy "Admins can manage live showdown answers"
  on live_showdown_answers for all
  using (exists (select 1 from users where auth_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from users where auth_id = auth.uid() and is_admin = true));
