-- Rewards system — NFL Pick 'Em week scope.
--
-- NFL Pick 'Em rewards gate on the NFL season calendar (nfl_pickem_weeks), not on
-- a venue schedule like every other reward. This column records which weeks a
-- given campaign covers, in one of exactly two shapes (see
-- docs/nfl-pickem-reward-plan.md):
--
--   {"kind": "weekly", "season": 2026}
--     Repeats every NFL week the reward is active — one contest + one winner
--     per week. No week list; the cadence engine derives the current week.
--
--   {"kind": "season", "season": 2026, "fromWeek": 7}
--     A single cumulative contest covering fromWeek through the season's last
--     week (mid-season creation covers only the remainder of the season).
--
-- NULL MEANS "NOT AN NFL PICK 'EM REWARD" — the column is purely additive.
-- Only campaigns with reward_definition_id = 'nfl_pickem_challenge' ever read
-- it; every other reward leaves it null. Phase 3 (lib/nflPickEmRewardWeeks.ts)
-- owns validation of the values inside the shape; this constraint only guards
-- against a malformed jsonb value reaching the column at all.

alter table challenge_campaigns
  add column if not exists nfl_week_scope jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'challenge_campaigns_nfl_week_scope_shape'
  ) then
    alter table challenge_campaigns
      add constraint challenge_campaigns_nfl_week_scope_shape
      check (
        nfl_week_scope is null
        or (
          jsonb_typeof(nfl_week_scope) = 'object'
          and nfl_week_scope ? 'kind'
          and nfl_week_scope ? 'season'
          and jsonb_typeof(nfl_week_scope -> 'season') = 'number'
          and (
            (nfl_week_scope ->> 'kind') = 'weekly'
            or (
              (nfl_week_scope ->> 'kind') = 'season'
              and nfl_week_scope ? 'fromWeek'
              and jsonb_typeof(nfl_week_scope -> 'fromWeek') = 'number'
            )
          )
        )
      );
  end if;
end $$;

comment on column challenge_campaigns.nfl_week_scope is
  'NFL Pick ''Em rewards: jsonb {kind:"weekly"|"season", season, fromWeek?} describing which NFL weeks the campaign covers. NULL = not an NFL Pick ''Em reward; only reward_definition_id = ''nfl_pickem_challenge'' campaigns read it.';
