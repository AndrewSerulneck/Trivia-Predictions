-- Scope trivia quota to individual (user_id, venue) pairs.
--
-- Previously getTriviaQuota() aggregated trivia_answers across all users sharing
-- the same username (across all venues), causing cross-venue progress contamination.
-- That logic has been removed; quota is now strictly per user_id.
--
-- Each users row is already unique on (username, venue_id), so user_id is already
-- venue-scoped. No schema change to trivia_answers is required.
--
-- Add a composite covering index so the quota query
-- (WHERE user_id = $1 AND answered_at >= $2 ORDER BY answered_at) stays fast
-- at scale.

create index if not exists idx_trivia_answers_user_time
  on trivia_answers (user_id, answered_at asc);
