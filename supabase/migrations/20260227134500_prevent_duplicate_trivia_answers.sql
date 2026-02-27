-- Prevent duplicate answers for the same user/question pair.
-- Keep the earliest answer when duplicates already exist.

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, question_id
      order by answered_at asc, id asc
    ) as rn
  from trivia_answers
)
delete from trivia_answers ta
using ranked r
where ta.id = r.id
  and r.rn > 1;

create unique index if not exists idx_trivia_answers_user_question_unique
  on trivia_answers(user_id, question_id);
