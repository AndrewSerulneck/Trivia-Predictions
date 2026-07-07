-- When set, the moment an auto-created lobby session's round should begin —
-- lets the lobby dwell for a fixed window with a real, known countdown
-- instead of transitioning to 'active' the instant the session is created.
alter table category_blitz_sessions
  add column if not exists starts_at timestamptz;
