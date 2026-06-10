alter table trivia_questions
  add column if not exists duplicate_review_status text not null default 'clear'
  check (duplicate_review_status in ('clear', 'suspected', 'confirmed_unique'));

alter table trivia_questions
  add column if not exists duplicate_review_matches jsonb not null default '[]'::jsonb;

create index if not exists idx_trivia_questions_duplicate_review_status
  on trivia_questions (duplicate_review_status);
