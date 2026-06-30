-- Add is_valid column to scategories_submissions for LLM correctness validation.
-- null = not yet validated, true = correct answer, false = incorrect answer.
-- An answer must be both is_valid = true AND is_unique = true to earn points.

alter table public.scategories_submissions
  add column if not exists is_valid boolean;
