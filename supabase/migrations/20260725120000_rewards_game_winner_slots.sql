-- Rewards system — game-winner slot pinning.
--
-- A "winner of the game" reward used to be described by a period ("every week"),
-- which locked its quantity to however many games happened to fall in that week.
-- Partners now pick the exact scheduled games the reward applies to — down to the
-- individual slot, so a venue running 6pm and 9pm Tuesday trivia can offer the
-- reward at one and not the other. See docs/rewards-game-winner-picker-plan.md.
--
--   game_winner_slots — jsonb array of { "scheduleId": uuid-text, "weekday": "tue" }
--                       pairs. The pair (not just the weekday) is the identity:
--                       two schedules landing on the same weekday must stay
--                       independently selectable.
--
-- NULL MEANS "AWARD AT EVERY GAME" — today's behavior. That is what makes this
-- migration purely additive and the feature reversible by construction: every
-- in-flight game-winner reward keeps resolving exactly as it does now with zero
-- backfill, and the picker is inert until a reward is created with a selection.
-- An empty array is deliberately NOT the legacy value; see the check constraint.
--
-- Only game_winner campaigns ever read this column; points-threshold rewards
-- leave it null.

alter table challenge_campaigns
  add column if not exists game_winner_slots jsonb;

-- Guard the two ways this column could quietly mean the wrong thing: a non-array
-- json value (unreadable) and an empty array (reads as "no games", but null
-- already means "every game" — a reward pinned to nothing must be deactivated,
-- not stored). lib/rewardGameSlots.ts enforces the same rules in application code.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'challenge_campaigns_game_winner_slots_shape'
  ) then
    alter table challenge_campaigns
      add constraint challenge_campaigns_game_winner_slots_shape
      check (
        game_winner_slots is null
        or (jsonb_typeof(game_winner_slots) = 'array' and jsonb_array_length(game_winner_slots) > 0)
      );
  end if;
end $$;

comment on column challenge_campaigns.game_winner_slots is
  'Game-winner rewards: jsonb array of {scheduleId, weekday} slots the reward is pinned to. NULL = award at every game (legacy).';
