-- Match getLatestRound's session filter and created_at ordering.
-- This avoids walking/sorting the session's entire continuous-round history.
-- CLI deploy only: concurrent DDL is intentionally outside a transaction.
-- No game records, grants, policies, existing indexes or timing rules change.
create index concurrently if not exists idx_category_blitz_rounds_session_created_at
  on public.category_blitz_rounds (session_id, created_at desc);
