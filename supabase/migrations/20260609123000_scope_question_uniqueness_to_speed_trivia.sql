drop index if exists idx_trivia_questions_pool_question_key_active;

create unique index if not exists idx_trivia_questions_speed_question_key_active
  on trivia_questions (normalized_question_key)
  where question_pool = 'anytime_blitz'
    and status <> 'deleted';

update trivia_questions as tq
set status = 'active'
where tq.question_pool = 'live_showdown'
  and tq.status = 'deleted'
  and exists (
    select 1
    from trivia_questions as active_match
    where active_match.question_pool = 'live_showdown'
      and active_match.status = 'active'
      and active_match.normalized_question_key = tq.normalized_question_key
  );
