-- Add subcategory to trivia_questions for Live Trivia spacing logic.
-- Nullable: existing rows and Speed Trivia rows leave it NULL.
ALTER TABLE trivia_questions
  ADD COLUMN IF NOT EXISTS subcategory text;
