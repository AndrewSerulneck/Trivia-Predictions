-- Category Blitz: enforce at most one non-complete round per session.
--
-- startRound() had no concurrency guard: two callers racing to advance the
-- same lobby (e.g. IdleScreen's un-test-moded poll vs. the main hook's
-- test-moded poll, both landing right as the lobby's startsAt elapses) could
-- both read status='lobby', both pass the check, and both INSERT a round row
-- — producing two simultaneous rounds for one session with inconsistent
-- durations. The same gap exists for every later round transition too (any
-- two concurrent driveVenueCategoryBlitz callers agreeing "the next round is
-- due"), not just the first round.
--
-- This mirrors the existing uq_scategories_sessions_venue_active pattern
-- (one lobby/active/scoring session per venue): a partial unique index lets
-- Postgres itself reject the loser's INSERT with a 23505, which startRound
-- catches and recovers from by returning the winner's round instead of
-- erroring — the same recovery shape createSession already uses for the
-- session-level version of this race.

create unique index if not exists uq_category_blitz_rounds_session_open
  on public.category_blitz_rounds (session_id)
  where status in ('active', 'scoring');
