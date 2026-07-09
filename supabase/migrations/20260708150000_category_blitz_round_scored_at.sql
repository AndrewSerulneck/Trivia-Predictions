-- Category Blitz: record WHEN a round finished scoring, not just that it did.
--
-- The next round's earliest start was previously anchored on the current
-- round's `started_at + interval`. But a round isn't marked `complete` until
-- LLM grading finishes (some seconds after `ends_at`), so grading latency ate
-- directly into the between-rounds intermission — in the worst case the next
-- round became due the instant scoring finished, tearing the graded results
-- reveal off the screen before players could read it.
--
-- `scored_at` lets the engine anchor the next round on
-- `scored_at + intermission`, guaranteeing a full review window regardless of
-- how long grading took. It is set once, when scoreRound marks the round
-- complete, and never rewritten (scoring is idempotent).

alter table public.category_blitz_rounds
  add column if not exists scored_at timestamptz;
