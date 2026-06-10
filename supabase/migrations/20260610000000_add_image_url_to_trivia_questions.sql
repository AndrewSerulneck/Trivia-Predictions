-- Add image_url to trivia_questions so map and photo questions can carry
-- their image through to the live game engine.
alter table trivia_questions
  add column if not exists image_url text;
