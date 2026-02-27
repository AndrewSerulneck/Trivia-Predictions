-- Adds a stable external identifier for trivia content imports.
-- This supports safe upserts from versioned JSON files.

alter table trivia_questions
  add column if not exists slug text;

update trivia_questions
set slug = 'q-' || replace(id::text, '-', '')
where slug is null or btrim(slug) = '';

alter table trivia_questions
  alter column slug set default ('q-' || replace(gen_random_uuid()::text, '-', ''));

alter table trivia_questions
  alter column slug set not null;

create unique index if not exists idx_trivia_questions_slug
  on trivia_questions(slug);
