-- Step 1: Live Showdown dedup + split-pool support

create table if not exists user_seen_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  question_id text not null,
  "timestamp" timestamptz not null default now(),
  constraint user_seen_questions_user_question_unique unique (user_id, question_id)
);

create index if not exists idx_user_seen_questions_user_timestamp
  on user_seen_questions(user_id, "timestamp" desc);

create index if not exists idx_user_seen_questions_question
  on user_seen_questions(question_id);

alter table user_seen_questions enable row level security;

drop policy if exists "Users can read own seen questions" on user_seen_questions;
create policy "Users can read own seen questions"
  on user_seen_questions for select
  using (user_id in (select id from users where auth_id = auth.uid()));

drop policy if exists "Users can insert own seen questions" on user_seen_questions;
create policy "Users can insert own seen questions"
  on user_seen_questions for insert
  with check (user_id in (select id from users where auth_id = auth.uid()));

alter table trivia_questions
  add column if not exists question_pool text;

update trivia_questions
set question_pool = coalesce(nullif(btrim(question_pool), ''), 'anytime_blitz');

alter table trivia_questions
  alter column question_pool set default 'anytime_blitz';

alter table trivia_questions
  alter column question_pool set not null;

alter table trivia_questions
  drop constraint if exists trivia_questions_question_pool_valid;

alter table trivia_questions
  add constraint trivia_questions_question_pool_valid
  check (question_pool in ('anytime_blitz', 'live_showdown'));

create index if not exists idx_trivia_questions_pool
  on trivia_questions(question_pool);
