-- Live/Speed Trivia refactor — Prompt 1
-- occurrence_date on session questions + answers, venue-level seen-question
-- dedup, and a question review/approval status workflow.

-- 1. Add occurrence_date to trivia_session_questions
alter table trivia_session_questions
  add column if not exists occurrence_date date;

-- Backfill existing rows with a legacy sentinel so NOT NULL can be enforced
update trivia_session_questions set occurrence_date = '1970-01-01' where occurrence_date is null;

alter table trivia_session_questions
  alter column occurrence_date set not null,
  alter column occurrence_date set default current_date;

-- Drop old unique constraint and replace with occurrence-aware one
alter table trivia_session_questions
  drop constraint if exists trivia_session_questions_schedule_round_question_unique;

alter table trivia_session_questions
  add constraint trivia_session_questions_occurrence_unique
  unique (schedule_id, occurrence_date, round_number, question_index);

create index if not exists idx_tsq_occurrence
  on trivia_session_questions (schedule_id, occurrence_date);

-- 2. Add occurrence_date to live_showdown_answers
alter table live_showdown_answers
  add column if not exists occurrence_date date;

update live_showdown_answers set occurrence_date = '1970-01-01' where occurrence_date is null;

alter table live_showdown_answers
  alter column occurrence_date set not null,
  alter column occurrence_date set default current_date;

-- Drop the existing per-user uniqueness (real name from
-- 20260516183000_add_live_showdown_answers.sql) and recreate it occurrence-aware,
-- otherwise the same user could not answer the same slot on different days.
alter table live_showdown_answers
  drop constraint if exists live_showdown_answers_user_schedule_round_question_unique;

alter table live_showdown_answers
  add constraint live_showdown_answers_occurrence_unique
  unique (schedule_id, occurrence_date, round_number, question_index, user_id);

create index if not exists idx_lsa_occurrence
  on live_showdown_answers (schedule_id, occurrence_date);

-- 3. Venue-level question deduplication
create table if not exists venue_seen_questions (
  venue_id    text        not null references venues(id) on delete cascade,
  question_id text        not null references trivia_questions(slug) on delete cascade, -- matches trivia_questions.slug
  seen_at     timestamptz not null default now(),
  primary key (venue_id, question_id)
);

create index if not exists idx_vsq_venue on venue_seen_questions (venue_id);

alter table venue_seen_questions enable row level security;

drop policy if exists "Admins can manage venue seen questions" on venue_seen_questions;
create policy "Admins can manage venue seen questions"
  on venue_seen_questions for all
  using (exists (select 1 from users where auth_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from users where auth_id = auth.uid() and is_admin = true));

-- 4. Question review/approval status
alter table trivia_questions
  add column if not exists status text not null default 'active'
  check (status in ('pending_review', 'active', 'deleted'));

create index if not exists idx_tq_status on trivia_questions (status);
