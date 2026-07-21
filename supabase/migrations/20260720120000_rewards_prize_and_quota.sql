-- Rewards system — Phase 2: winner quota + richer prize model.
--
-- Rewards are the consolidation of Challenges + owner Competitions onto the
-- existing challenge_campaigns engine (see docs/rewards-system-plan.md). This
-- migration is PURELY ADDITIVE and backward-compatible: existing campaigns keep
-- their legacy prize_type / prize_gift_certificate_amount columns untouched, and
-- winner_quota defaults to 1 so single-winner behavior is unchanged.
--
--   winner_quota          — how many winners the reward awards per cycle (one-time
--                           rewards: total). Drives multi-winner + "all claimed".
--   reward_definition_id  — which pre-set reward definition created this (e.g.
--                           'live_trivia_challenge'); NULL for pre-Rewards campaigns.
--   prize_kind            — 'menu_item' | 'gift_card' (the new prize model).
--   prize_menu_item       — which item, when prize_kind = 'menu_item'.
--   prize_menu_item_name  — free-text label when prize_menu_item = 'other'.
--   prize_discount_kind   — 'dollar' | 'percent' (menu-item prizes).
--   prize_discount_value  — the dollar or percent value of the menu-item discount.
--
-- Gift-card dollar amounts continue to live in the existing
-- prize_gift_certificate_amount column (reused, not duplicated).

alter table challenge_campaigns
  add column if not exists winner_quota integer not null default 1
    check (winner_quota >= 1),
  add column if not exists reward_definition_id text,
  add column if not exists prize_kind text
    check (prize_kind in ('menu_item', 'gift_card')),
  add column if not exists prize_menu_item text
    check (prize_menu_item in ('whole_order', 'appetizer', 'entree', 'dessert', 'wine_bottle', 'other')),
  add column if not exists prize_menu_item_name text,
  add column if not exists prize_discount_kind text
    check (prize_discount_kind in ('dollar', 'percent')),
  add column if not exists prize_discount_value numeric(10,2);
