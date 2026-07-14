-- Phase 5b — TV pairing codes ("Link a TV").
--
-- A short-lived, single-use code a TV browser mints at /tv and an owner claims
-- from the Partner Dashboard, so the TV can redirect itself to the venue screen
-- without anyone typing a long URL on a remote.
--
-- Service-role-only table: every access goes through supabaseAdmin in server API
-- routes (which bypasses RLS). RLS is enabled with NO policies + grants revoked,
-- so anon/authenticated get deny-all — same secure default as
-- venue_presence_events. Expiry is lazy (checked on read/claim in lib/tvPairing.ts
-- and swept opportunistically), so this needs no cron and vercel.json is untouched.

create table if not exists tv_pairing_codes (
  -- Short unambiguous code (Crockford base32, no I/L/O/U). Primary key so mint
  -- collisions surface as a 23505 the mint helper retries on.
  code text primary key,
  -- Set when an owner claims the code; null while pending. Cascade so a deleted
  -- venue can't leave a danging claim.
  venue_id text references venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Hard TTL; a code past this is treated as expired regardless of claim state.
  expires_at timestamptz not null,
  -- When an owner claimed the code (venue_id set at the same time).
  claimed_at timestamptz,
  -- When the TV picked up the claim and redirected — single-use marker; a
  -- consumed code can never be re-polled or re-claimed.
  consumed_at timestamptz,
  constraint tv_pairing_codes_expires_after_created check (expires_at > created_at)
);

-- Sweep helper: lazy expiry deletes rows past their TTL by this index.
create index if not exists idx_tv_pairing_codes_expires_at
  on tv_pairing_codes(expires_at);

alter table tv_pairing_codes enable row level security;
alter table tv_pairing_codes force row level security;
revoke all on table tv_pairing_codes from anon, authenticated;
-- No policies and no grants: only the service-role client may read/write this
-- table, which is exactly how the pairing API routes access it.
