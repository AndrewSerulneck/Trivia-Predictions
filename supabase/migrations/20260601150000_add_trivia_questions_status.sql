-- Ensure trivia_questions.status exists. This column was originally introduced
-- in 20260530120000 but that migration can silently roll back on databases with
-- duplicate session-question rows, leaving the column absent.

alter table trivia_questions
  add column if not exists status text not null default 'active'
  check (status in ('pending_review', 'active', 'deleted'));

create index if not exists idx_tq_status on trivia_questions (status);
