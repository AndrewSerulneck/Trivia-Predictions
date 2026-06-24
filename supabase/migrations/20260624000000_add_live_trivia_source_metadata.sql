alter table trivia_questions
  add column if not exists source_order integer,
  add column if not exists source_file text;

alter table trivia_questions
  drop constraint if exists trivia_questions_source_order_non_negative;

alter table trivia_questions
  add constraint trivia_questions_source_order_non_negative
  check (source_order is null or source_order >= 0);

create index if not exists idx_trivia_questions_live_source_order
  on trivia_questions (question_pool, source_file, source_order)
  where question_pool = 'live_showdown' and status = 'active';
