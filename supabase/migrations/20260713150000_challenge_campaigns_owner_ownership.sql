-- Phase 9a — Venue Competitions ownership.
--
-- Partners can now create competitions (Pick'em races, Prop Bingo nights, etc.)
-- over the async games, powered by the existing challenge_campaigns engine. This
-- column records which owner created a campaign so the owner-scoped API can list
-- and delete only their own, while admin-created campaigns (created_by_owner_id
-- NULL) stay admin-managed and invisible to owners.
--
-- ON DELETE SET NULL (not CASCADE): a partner closing their account must NOT
-- vaporize a live competition players are mid-way through — it falls back to
-- admin-managed instead.

alter table challenge_campaigns
  add column if not exists created_by_owner_id uuid
    references venue_owners(id) on delete set null;

-- Owner-scoped list queries filter on this column.
create index if not exists idx_challenge_campaigns_created_by_owner
  on challenge_campaigns(created_by_owner_id)
  where created_by_owner_id is not null;
