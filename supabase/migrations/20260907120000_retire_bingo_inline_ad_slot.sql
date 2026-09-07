-- Retire the Bingo inline ad slot (registry ids 042 / 066).
-- See docs/prop-bingo-page-simplification-plan.md Phase 1.
-- Deactivate, do NOT delete: impression/click history and partner reporting must survive.
-- No CHECK constraint change: 'inline-content' stays valid for other pages.

update advertisements
set active = false
where page_key = 'sports-bingo'
  and (ad_type = 'inline' or slot = 'inline-content' or slot_key = 'sports-bingo-inline');
