create or replace function normalize_trivia_question_key(question_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(question_text, '')), '[^a-z0-9]+', '', 'g')
$$;

alter table trivia_questions
  add column if not exists normalized_question_key text;

update trivia_questions
set normalized_question_key = normalize_trivia_question_key(question)
where normalized_question_key is distinct from normalize_trivia_question_key(question);

with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by question_pool, normalized_question_key
      order by
        case
          when status = 'active' then 0
          when status = 'pending_review' then 1
          else 2
        end,
        created_at asc,
        id asc
    ) as duplicate_rank
  from trivia_questions
  where status <> 'deleted'
)
update trivia_questions as tq
set status = 'deleted'
from ranked_duplicates
where tq.id = ranked_duplicates.id
  and ranked_duplicates.duplicate_rank > 1
  and tq.status <> 'deleted';

alter table trivia_questions
  alter column normalized_question_key set not null;

create or replace function set_trivia_question_normalized_key()
returns trigger
language plpgsql
as $$
begin
  new.normalized_question_key := normalize_trivia_question_key(new.question);
  return new;
end;
$$;

drop trigger if exists trivia_questions_set_normalized_question_key on trivia_questions;
create trigger trivia_questions_set_normalized_question_key
before insert or update of question
on trivia_questions
for each row
execute function set_trivia_question_normalized_key();

create index if not exists idx_trivia_questions_normalized_question_key
  on trivia_questions (normalized_question_key);

create unique index if not exists idx_trivia_questions_pool_question_key_active
  on trivia_questions (question_pool, normalized_question_key)
  where status <> 'deleted';
