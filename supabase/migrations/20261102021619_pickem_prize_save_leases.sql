-- Pick 'Em plan (docs/pickem-college-football-and-prize-plan.md) Phase 7.5.3, finding F17:
-- one Pick 'Em Prize save at a time per bar, so the overlap rule (D6) holds.
--
-- The overlap rule itself stays in TypeScript (findPickEmPrizeConflict in lib/pickemPrizes.ts, run by
-- createPickEmReward in lib/rewards.ts). What was missing: it is read-then-insert across separate
-- PostgREST calls, so two saves at the same bar (two tabs, or admin + owner) could both read "no
-- clash" before either inserted, and create two overlapping prizes. An advisory lock can't span
-- PostgREST calls, so the save holds a short per-venue LEASE instead:
--   claim (this file) → read the bar's active Pick 'Em Prizes → overlap check → insert → release.
--
-- Parts:
--   1. pickem_prize_save_leases — at most one row per venue: the token of the save holding it and when
--      the lease runs out. A save that crashes before releasing blocks the bar only until expires_at.
--   2. claim_pickem_prize_save(venue, token, ttl) — true when this token now holds the lease (no row,
--      an expired row, or its own row: renewed); false while another token's lease is live. Serialised
--      per venue by pg_advisory_xact_lock, so two claims can never both win.
--   3. release_pickem_prize_save(venue, token) — deletes the row only if it still carries this token;
--      a stranger's token (or a lease already taken over after expiry) deletes nothing.
--
-- Callers: lib/pickemPrizeSaveLease.ts only, as service_role through lib/supabaseAdmin.ts. Any future
-- path that changes a Pick 'Em Prize's scope, window or pick limit must take the same lease.
--
-- Grants: one new table (service_role only, RLS on, no policies, no browser access) and two new
-- functions (service_role only; tests/security-definer-execute-contract.test.ts).
--
-- DEPLOY ORDER: before the code that calls it. The code fails CLOSED without it (no Pick 'Em Prize
-- can be created: "[PickEmPrize] save-lease-missing"), so apply this first. Applying it is Andrew's
-- call. Proof: npm run test:pickem-prize-lease-sql.

-- ── 1. Leases ───────────────────────────────────────────────────────────────────────────────

create table if not exists public.pickem_prize_save_leases (
  venue_id text primary key references public.venues(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null
);

alter table public.pickem_prize_save_leases enable row level security;
alter table public.pickem_prize_save_leases force row level security;
revoke all on table public.pickem_prize_save_leases from anon, authenticated;
grant select, insert, update, delete on table public.pickem_prize_save_leases to service_role;

-- ── 2. Claim ────────────────────────────────────────────────────────────────────────────────

create or replace function public.claim_pickem_prize_save(
  p_venue_id text,
  p_token uuid,
  p_ttl_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_venue_id is null or btrim(p_venue_id) = '' or p_token is null then
    raise exception 'claim_pickem_prize_save: venue and token are required';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 1 or p_ttl_seconds > 300 then
    raise exception 'claim_pickem_prize_save: ttl must be 1 to 300 seconds';
  end if;

  perform pg_advisory_xact_lock(hashtext('pickem_prize_save:' || p_venue_id));

  insert into pickem_prize_save_leases as lease (venue_id, token, expires_at)
  values (p_venue_id, p_token, now() + make_interval(secs => p_ttl_seconds))
  on conflict (venue_id) do update
    set token = excluded.token,
        expires_at = excluded.expires_at
    where lease.expires_at <= now() or lease.token = excluded.token;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.claim_pickem_prize_save(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_pickem_prize_save(text, uuid, integer) to service_role;

-- ── 3. Release ──────────────────────────────────────────────────────────────────────────────

create or replace function public.release_pickem_prize_save(
  p_venue_id text,
  p_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from pickem_prize_save_leases
  where venue_id = p_venue_id and token = p_token;
  return found;
end;
$$;

revoke all on function public.release_pickem_prize_save(text, uuid) from public, anon, authenticated;
grant execute on function public.release_pickem_prize_save(text, uuid) to service_role;
