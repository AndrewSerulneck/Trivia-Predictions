create table if not exists answer_variants (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references trivia_questions(id) on delete cascade,
  answer_index int not null,
  variant_text text not null,
  variant_type varchar(50) not null,
  confidence_score double precision default 1.0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(question_id, answer_index, variant_text)
);

create index if not exists idx_answer_variants_question_id on answer_variants(question_id);
create index if not exists idx_answer_variants_type on answer_variants(variant_type);

create or replace function update_answer_variants_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists answer_variants_updated_at_trigger on answer_variants;
create trigger answer_variants_updated_at_trigger
before update on answer_variants
for each row
execute function update_answer_variants_updated_at();

