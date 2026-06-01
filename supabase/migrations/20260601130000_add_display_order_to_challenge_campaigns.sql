-- Allow admins to control the display order of challenge campaigns.
-- Null means "unset" — those rows sort after any explicitly ordered rows,
-- falling back to created_at DESC within the unset group.

alter table challenge_campaigns
  add column if not exists display_order integer;

create index if not exists idx_challenge_campaigns_display_order
  on challenge_campaigns(display_order asc nulls last, created_at desc);
