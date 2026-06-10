-- Step 1: Move live_showdown questions that were imported as multiple_choice into
-- the correct pool. These are standard MC questions — not rigid-identifier write-in
-- questions — so they belong in anytime_blitz (Speed Trivia).
UPDATE trivia_questions
SET question_pool = 'anytime_blitz'
WHERE question_pool = 'live_showdown'
  AND answer_format = 'multiple_choice';

-- Step 2: Enforce the pool/format relationship at the database level so this
-- mismatch cannot be introduced again by a future import or manual edit.
ALTER TABLE trivia_questions
  DROP CONSTRAINT IF EXISTS trivia_questions_pool_format_valid;

ALTER TABLE trivia_questions
  ADD CONSTRAINT trivia_questions_pool_format_valid
  CHECK (
    (question_pool = 'anytime_blitz' AND answer_format = 'multiple_choice')
    OR
    (question_pool = 'live_showdown' AND answer_format IN ('write_in', 'numeric', 'true_false'))
  );
