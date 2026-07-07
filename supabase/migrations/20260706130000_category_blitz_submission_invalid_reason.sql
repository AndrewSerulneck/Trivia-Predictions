-- Haiku's short (≤8-word) explanation of WHY a unique, letter-correct answer
-- was judged invalid for its category. Persisted (not ephemeral) because
-- round results are re-read from this table on every intermission poll and
-- for every player who fetches results after the scorer — the live grading
-- reveal needs the explanation to survive those re-reads. Null for answers
-- that scored, weren't graded by the LLM, or predate this column.
alter table category_blitz_submissions
  add column if not exists invalid_reason text;
