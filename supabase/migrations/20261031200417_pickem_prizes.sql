-- Pick 'Em plan (docs/pickem-college-football-and-prize-plan.md) Phase 4a: the Pick 'Em Prize's data.
--
-- A partner offers a prize on regular Pick 'Em picks (never NFL Pick 'Em, which has its own prize):
-- which games count (scope), when (window), and how it is won (most right / get N right / X out of N
-- with 1–3 tiers). The rules live in lib/pickemPrizes.ts (scope, window, periods, the cycle key,
-- validation, the overlap rule); the award sweep is Phase 4b. Nothing here changes how any existing
-- prize is awarded or redeemed.
--
-- Parts:
--   1. challenge_campaigns: five columns, all NULL for every existing row (purely additive), and
--      deliberately NOT in lib/challengeCampaigns.ts's CAMPAIGN_SELECT_COLUMNS: only Pick 'Em Prize
--      code reads them (listActivePickEmPrizeCampaigns, loadPickEmPrizeTerms), so a deploy that runs
--      ahead of this migration leaves every other prize untouched.
--        pickem_scope      jsonb    { "sports": [...], "leagues": [...] } — a sport means every league in
--                                   it (including later ones); a league is a provider sport key.
--        pickem_window     jsonb    { "kind": "day"|"weekday"|"week"|"range", "date"?, "weekday"?,
--                                   "from"?, "to"? } — venue-local dates, inclusive.
--        pickem_pick_limit smallint "X out of N": N picks per player per period in the scope (D5).
--        pickem_tiers      jsonb    "X out of N": 1–3 tiers, lowest first, each
--                                   { place (tier 1–3), correct, quantity, prize_kind, … } — the prize
--                                   fields in the same shape as place_prizes, so the Phase 4b award
--                                   copies them the way award_ranked_cycle_places copies a place's.
--        pickem_min_picks  smallint "Most picks right": picks a player must make to be ranked.
--   2. One check for the shapes the database can see. The full rules (known sports, real dates,
--      tiers ascending and within N) are lib/pickemPrizes.ts's, run by createReward.
--   3. Two indexes: the active Pick 'Em Prizes (the pick limit and the overlap check read them), and
--      pickem_picks by venue + kickoff (the pick limit's count and the Phase 4b sweep's period read).
--
-- No new table, view or sequence, so no grants. No users FK, so delete_player_account is unchanged.
-- DEPLOY ORDER: apply this BEFORE the code that creates a Pick 'Em Prize ships (until then nothing
-- writes these columns, and the pick limit's read fails open — see lib/pickemPrizeLimit.ts).

-- ── 1. The columns ─────────────────────────────────────────────────────────────────────────

alter table public.challenge_campaigns
  add column if not exists pickem_scope jsonb,
  add column if not exists pickem_window jsonb,
  add column if not exists pickem_pick_limit smallint,
  add column if not exists pickem_tiers jsonb,
  add column if not exists pickem_min_picks smallint;

-- ── 2. Shapes ──────────────────────────────────────────────────────────────────────────────

alter table public.challenge_campaigns
  drop constraint if exists challenge_campaigns_pickem_prize_check;

alter table public.challenge_campaigns
  add constraint challenge_campaigns_pickem_prize_check
  check (
    -- A Pick 'Em Prize always has a scope and a window; nothing else ever has either.
    -- (coalesce everywhere: a check that evaluates to NULL passes, so no clause may.)
    (coalesce(reward_definition_id, '') = 'pickem_challenge') = (pickem_scope is not null and pickem_window is not null)
    and (
      pickem_scope is null
      or (
        jsonb_typeof(pickem_scope) = 'object'
        and jsonb_typeof(coalesce(pickem_scope->'sports', '[]'::jsonb)) = 'array'
        and jsonb_typeof(coalesce(pickem_scope->'leagues', '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(pickem_scope->'sports', '[]'::jsonb))
          + jsonb_array_length(coalesce(pickem_scope->'leagues', '[]'::jsonb)) > 0
      )
    )
    and (
      pickem_window is null
      or (jsonb_typeof(pickem_window) = 'object' and coalesce(pickem_window->>'kind', '') in ('day', 'weekday', 'week', 'range'))
    )
    and (pickem_pick_limit is null or pickem_pick_limit between 1 and 100)
    and (pickem_min_picks is null or (pickem_min_picks between 1 and 100 and win_condition = 'game_winner'))
    -- "X out of N": a limit exactly when there are tiers, 1–3 of them, on a points_threshold prize.
    and ((pickem_pick_limit is null) = (pickem_tiers is null))
    and (
      pickem_tiers is null
      or (
        jsonb_typeof(pickem_tiers) = 'array'
        and jsonb_array_length(pickem_tiers) between 1 and 3
        and win_condition = 'points_threshold'
      )
    )
  );

comment on column public.challenge_campaigns.pickem_scope is
  'Pick ''Em Prizes: which regular Pick ''Em games count — {"sports": [slug…], "leagues": [sport_key…]}. NULL = not a Pick ''Em Prize. Read only by the Pick ''Em Prize paths (never CAMPAIGN_SELECT_COLUMNS).';
comment on column public.challenge_campaigns.pickem_window is
  'Pick ''Em Prizes: when it runs, in the venue''s time zone — {"kind": "day"|"weekday"|"week"|"range", …}. Cut into periods by lib/pickemPrizes.ts.';
comment on column public.challenge_campaigns.pickem_pick_limit is
  'Pick ''Em Prizes, "X out of N": N picks per player per period in the scope (submitPickEmPick refuses more). NULL = no limit.';
comment on column public.challenge_campaigns.pickem_tiers is
  'Pick ''Em Prizes, "X out of N": 1–3 tiers, lowest first — {place, correct, quantity, prize_kind, …} (prize fields as in place_prizes). A player wins only the top tier reached.';
comment on column public.challenge_campaigns.pickem_min_picks is
  'Pick ''Em Prizes, "most picks right": picks a player must make in the period to be ranked.';

-- ── 3. Indexes ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_challenge_campaigns_pickem_prizes
  on public.challenge_campaigns (is_active)
  where reward_definition_id = 'pickem_challenge';

create index if not exists idx_pickem_picks_venue_starts_at
  on public.pickem_picks (venue_id, starts_at);
