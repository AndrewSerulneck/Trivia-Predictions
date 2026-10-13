-- NFL Pick 'Em rewards — third week-scope shape, "single_week".
--
--   {"kind": "single_week", "season": 2026, "week": 9}
--     One contest for exactly that NFL week (docs/nfl-pickem-single-week-reward-plan.md).
--
-- Widens challenge_campaigns_nfl_week_scope_shape (created in
-- 20260727120000_rewards_nfl_week_scope.sql, which is history and is not edited).
-- Purely additive: every existing row is `weekly`, `season` or NULL and still passes.
-- No new table/view/sequence, so no grants are needed.
--
-- DEPLOY ORDER: apply this BEFORE shipping code that writes `single_week`.

alter table challenge_campaigns
  drop constraint if exists challenge_campaigns_nfl_week_scope_shape;

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
        or (
          (nfl_week_scope ->> 'kind') = 'single_week'
          and nfl_week_scope ? 'week'
          and jsonb_typeof(nfl_week_scope -> 'week') = 'number'
        )
      )
    )
  );

comment on column challenge_campaigns.nfl_week_scope is
  'NFL Pick ''Em rewards: jsonb {kind:"weekly"|"season"|"single_week", season, fromWeek? (season), week? (single_week)} describing which NFL weeks the campaign covers. NULL = not an NFL Pick ''Em reward; only reward_definition_id = ''nfl_pickem_challenge'' campaigns read it.';
