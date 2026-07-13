-- Category Blitz "Blend In!" mode (Mode B): tag each round as 'standard'
-- ("Be Unique!" — score by uniqueness) or 'reverse' ("Blend In!" — score by
-- crowd consensus). These are internal enum values only; they are never
-- rendered to players (see lib/categoryBlitzModes.ts MODE_CONFIG for the
-- player-facing puck labels).
--
-- Every 4th round (roundIndex % 4 === 3) is 'reverse'; startRound computes
-- this from the session's prior-round count and draws the board from the
-- category pool's B-tagged (Blend In!-eligible) letter index instead of the
-- standard one.

alter table public.category_blitz_rounds
  add column if not exists mode text not null default 'standard'
    check (mode in ('standard', 'reverse'));
