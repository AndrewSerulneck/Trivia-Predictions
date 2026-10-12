-- Multi-venue volume billing (docs/multi-venue-volume-billing-plan.md) Phase 6.1 — review fix #1:
-- the admin price swap (lib/billingCustomPrice.ts: "Set rate" and "Back to standard pricing") takes
-- the bill's lock.
--
-- THE BUG IT FIXES. The swap checked for an in-flight add / remove with plain reads, outside the
-- per-bill advisory lock that claim_venue_addition and claim_venue_bill_change take, and then wrote
-- an ABSOLUTE quantity it had read moments earlier. An admin pressing Set rate while a partner's
-- "Add a venue" claimed in between could send quantity n over the partner's n + 1 — dropping the
-- venue they had just paid for — or void their pending 3-D Secure payment (any `items` update does).
--
-- THE FIX. A price swap is now a claimed change on the SAME ledger as Remove / Undo:
--   1. billing_venue_changes accepts action 'price' (+ price_id, the target Stripe Price; a price
--      row has no venue).
--   2. claim_bill_price_change(...) claims one under the same advisory lock ('billing_venue_addition:'
--      || bill id), busy while an add or any other change is in flight on the bill.
--   3. finish_bill_price_change(...) closes it (done / failed) under the same lock.
--   4. finish_venue_bill_change is REPLACED (same signature, same outcomes) with one extra rule: it
--      refuses ('wrong_action') a row that is not a remove / undo. Before this file its `else`
--      branch treated anything that was not 'remove' as an undo.
--
-- No new busy rule is needed for adds and removes: claim_venue_addition (20261011210033 §4) and
-- claim_venue_bill_change (20261011210033 §2) already treat ANY pending billing_venue_changes row as
-- busy, whatever its action — so a pending price row blocks both, and both block a price claim here.
--
-- Creates no table, view or sequence (tests/supabase-migration-grants-contract.test.ts). The new
-- functions are service_role only, like 20261011210033's: plain (invoker) plpgsql with a pinned
-- search_path — service_role already owns every privilege they need, so `security definer` would
-- only widen what they run as.
--
-- DEPLOY ORDER: this migration first, then the app. The new app code calls these RPCs; with them
-- missing it fails closed (503, `[CustomPrice] claim-rpc-missing`) and never swaps unlocked. The OLD
-- app code is unaffected by this file (it never writes 'price' rows and never calls the new RPCs).

-- ── 1. 'price' rows on the change ledger ───────────────────────────────────────────────────
alter table public.billing_venue_changes add column if not exists price_id text;

-- The action check was declared inline in 20261011210033, so Postgres named it itself
-- (billing_venue_changes_action_check — proven on PGlite by scripts/test-multi-venue-billing-sql.cjs).
-- Drop it by WHAT it is (the CHECK constraint(s) on the action column alone), not by that name, so
-- this file is right whatever the name turned out to be — and re-runnable (a second run drops the
-- named constraint this file adds and adds it again).
do $$
declare
  v_name text;
  v_dropped integer := 0;
begin
  for v_name in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.billing_venue_changes'::regclass
       and c.contype = 'c'
       and c.conkey = array[(
         select a.attnum from pg_attribute a
          where a.attrelid = 'public.billing_venue_changes'::regclass and a.attname = 'action'
       )]::smallint[]
  loop
    execute format('alter table public.billing_venue_changes drop constraint %I', v_name);
    v_dropped := v_dropped + 1;
  end loop;
  if v_dropped = 0 then
    raise exception 'billing_venue_changes has no CHECK constraint on action to replace';
  end if;
end;
$$;

alter table public.billing_venue_changes
  add constraint billing_venue_changes_action_check check (action in ('remove', 'undo', 'price'));

-- A price row names its target Price and no venue; a remove / undo row never carries a price.
alter table public.billing_venue_changes drop constraint if exists billing_venue_changes_price_row_check;
alter table public.billing_venue_changes
  add constraint billing_venue_changes_price_row_check check (
    case when action = 'price' then price_id is not null and venue_id is null
         else price_id is null end
  );

-- ── 2. Claim a price swap ──────────────────────────────────────────────────────────────────
-- Outcomes (column `outcome`):
--   claimed       — a new 'pending' price row; the caller may now call Stripe.
--   existing      — this key already has a price row for the same bill, owner and Price; returned as-is.
--   key_conflict  — the key exists for something else. Nothing of that row is returned.
--   busy_addition — an "Add a venue" is in flight on this bill.
--   busy_change   — a Remove / Undo or another price swap is in flight on this bill; that row is
--                   returned so the caller can see what it is.
--   not_owner     — the bill now belongs to someone else (p_owner_id is the owner the caller read).
--   no_bill       — no such bill.
--   invalid       — a required argument is missing.
create or replace function public.claim_bill_price_change(
  p_idempotency_key text,
  p_owner_id uuid,
  p_subscription_id uuid,
  p_price_id text
)
returns table (
  outcome text,
  change_id uuid,
  change_status text,
  change_action text,
  change_price_id text,
  change_updated_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_price text := btrim(coalesce(p_price_id, ''));
  v_bill billing_subscriptions%rowtype;
  v_row billing_venue_changes%rowtype;
begin
  if length(v_key) = 0 or length(v_price) = 0 or p_subscription_id is null then
    outcome := 'invalid';
    return next;
    return;
  end if;

  -- The SAME lock as claim_venue_addition and claim_venue_bill_change.
  perform pg_advisory_xact_lock(hashtextextended('billing_venue_addition:' || p_subscription_id::text, 0));

  select * into v_bill from billing_subscriptions bs where bs.id = p_subscription_id;
  if not found then
    outcome := 'no_bill';
    return next;
    return;
  end if;
  if v_bill.owner_id is distinct from p_owner_id then
    outcome := 'not_owner';
    return next;
    return;
  end if;

  -- Same key → same row, whatever its status.
  select * into v_row from billing_venue_changes c where c.idempotency_key = v_key;
  if found then
    if v_row.action is distinct from 'price'
       or v_row.subscription_id is distinct from p_subscription_id
       or v_row.owner_id is distinct from p_owner_id
       or v_row.price_id is distinct from v_price then
      outcome := 'key_conflict';
      return next;
      return;
    end if;
    outcome := 'existing';
  else
    if exists (
      select 1 from billing_venue_additions a
      where a.subscription_id = p_subscription_id and a.status in ('pending', 'requires_action')
    ) then
      outcome := 'busy_addition';
      return next;
      return;
    end if;

    select * into v_row from billing_venue_changes c
    where c.subscription_id = p_subscription_id and c.status = 'pending'
    order by c.created_at asc
    limit 1;
    if found then
      outcome := 'busy_change';
    else
      insert into billing_venue_changes (
        idempotency_key, owner_id, subscription_id, venue_id, action, status, price_id
      ) values (
        v_key, p_owner_id, p_subscription_id, null, 'price', 'pending', v_price
      )
      returning * into v_row;
      outcome := 'claimed';
    end if;
  end if;

  change_id := v_row.id;
  change_status := v_row.status;
  change_action := v_row.action;
  change_price_id := v_row.price_id;
  change_updated_at := v_row.updated_at;
  return next;
end;
$$;

comment on function public.claim_bill_price_change(text, uuid, uuid, text) is
  'Multi-venue billing Phase 6.1: atomically claim an admin price swap on one bill, under the same '
  'advisory lock as claim_venue_addition / claim_venue_bill_change. Sole caller: lib/billingCustomPrice.ts.';

revoke all on function public.claim_bill_price_change(text, uuid, uuid, text) from public;
revoke all on function public.claim_bill_price_change(text, uuid, uuid, text) from anon, authenticated;
grant execute on function public.claim_bill_price_change(text, uuid, uuid, text) to service_role;

-- ── 3. Finish a claimed price swap ─────────────────────────────────────────────────────────
-- p_outcome 'done' (Stripe has the new Price) or 'failed' (it definitely does not). Only marks the
-- row: the bill's mirror columns are written by the caller / the Stripe webhook, never here.
-- Idempotent: a row that is no longer pending is returned as it is (outcome 'already').
-- Outcomes: done | failed | already | wrong_action (not a price row — nothing written) | not_found | invalid.
create or replace function public.finish_bill_price_change(
  p_change_id uuid,
  p_outcome text,
  p_failure_reason text
)
returns table (outcome text, change_status text)
language plpgsql
set search_path = public
as $$
declare
  v_row billing_venue_changes%rowtype;
begin
  if p_change_id is null or p_outcome is null or p_outcome not in ('done', 'failed') then
    outcome := 'invalid';
    return next;
    return;
  end if;

  select * into v_row from billing_venue_changes c where c.id = p_change_id;
  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;
  if v_row.action <> 'price' then
    outcome := 'wrong_action';
    change_status := v_row.status;
    return next;
    return;
  end if;
  if v_row.subscription_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('billing_venue_addition:' || v_row.subscription_id::text, 0));
    -- Re-read under the lock.
    select * into v_row from billing_venue_changes c where c.id = p_change_id;
  end if;

  if v_row.status <> 'pending' then
    outcome := 'already';
    change_status := v_row.status;
    return next;
    return;
  end if;

  update billing_venue_changes
     set status = p_outcome,
         failure_reason = case when p_outcome = 'failed'
                               then left(coalesce(p_failure_reason, 'failed'), 500)
                               else null end
   where id = v_row.id;
  outcome := p_outcome;
  change_status := p_outcome;
  return next;
end;
$$;

comment on function public.finish_bill_price_change(uuid, text, text) is
  'Multi-venue billing Phase 6.1: close (done / failed) a claimed admin price swap under the bill''s '
  'lock; refuses any row that is not a price swap. Sole caller: lib/billingCustomPrice.ts.';

revoke all on function public.finish_bill_price_change(uuid, text, text) from public;
revoke all on function public.finish_bill_price_change(uuid, text, text) from anon, authenticated;
grant execute on function public.finish_bill_price_change(uuid, text, text) to service_role;

-- ── 4. finish_venue_bill_change: refuse a row that is not a Remove / Undo ─────────────────
-- Identical to 20261011210033_venue_bill_changes.sql §3 except for the marked block. Without it, a
-- price row handed to this function would fall into its `else` (undo) branch and be marked done as
-- an "undo" of a venue that does not exist.
create or replace function public.finish_venue_bill_change(
  p_change_id uuid,
  p_outcome text,
  p_failure_reason text
)
returns table (outcome text, change_status text)
language plpgsql
set search_path = public
as $$
declare
  v_row billing_venue_changes%rowtype;
  v_updated integer;
  v_drift text := null;
begin
  if p_change_id is null or p_outcome is null or p_outcome not in ('done', 'failed') then
    outcome := 'invalid';
    return next;
    return;
  end if;

  select * into v_row from billing_venue_changes c where c.id = p_change_id;
  if not found then
    outcome := 'not_found';
    return next;
    return;
  end if;
  -- Phase 6.1 (new): only a Remove / Undo is finished here; a price swap has its own function.
  if v_row.action not in ('remove', 'undo') then
    outcome := 'wrong_action';
    change_status := v_row.status;
    return next;
    return;
  end if;
  if v_row.subscription_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('billing_venue_addition:' || v_row.subscription_id::text, 0));
    -- Re-read under the lock.
    select * into v_row from billing_venue_changes c where c.id = p_change_id;
  end if;

  if v_row.status <> 'pending' then
    outcome := 'already';
    change_status := v_row.status;
    return next;
    return;
  end if;

  if p_outcome = 'failed' then
    update billing_venue_changes
       set status = 'failed', failure_reason = left(coalesce(p_failure_reason, 'failed'), 500)
     where id = v_row.id;
    outcome := 'failed';
    change_status := 'failed';
    return next;
    return;
  end if;

  if v_row.subscription_id is null or v_row.venue_id is null then
    v_drift := 'bill-or-venue-deleted';
  elsif v_row.action = 'remove' then
    update billing_subscription_venues
       set remove_at = v_row.remove_at
     where venue_id = v_row.venue_id
       and subscription_id = v_row.subscription_id
       and removed_at is null
       and remove_at is null;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      v_drift := 'membership-not-billed';
    end if;

    if v_row.new_anchor_venue_id is not null then
      begin
        update billing_subscriptions
           set venue_id = v_row.new_anchor_venue_id
         where id = v_row.subscription_id
           and venue_id = v_row.venue_id;
      exception when unique_violation then
        v_drift := coalesce(v_drift || '; ', '') || 're-anchor-failed';
      end;
    end if;
  else
    update billing_subscription_venues
       set remove_at = null
     where venue_id = v_row.venue_id
       and subscription_id = v_row.subscription_id
       and removed_at is null
       and remove_at is not null;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      v_drift := 'membership-not-leaving';
    end if;
  end if;

  update billing_venue_changes
     set status = 'done', failure_reason = v_drift
   where id = v_row.id;
  outcome := case when v_drift is null then 'done' else 'drift' end;
  change_status := 'done';
  return next;
end;
$$;

comment on function public.finish_venue_bill_change(uuid, text, text) is
  'Multi-venue billing Phase 5 (+ Phase 6.1: refuses a non Remove / Undo row): apply (done) or close '
  '(failed) a claimed Remove / Undo; moves the bill anchor in the same transaction when the anchor '
  'leaves. Sole caller: lib/venueRemoval.ts.';

revoke all on function public.finish_venue_bill_change(uuid, text, text) from public;
revoke all on function public.finish_venue_bill_change(uuid, text, text) from anon, authenticated;
grant execute on function public.finish_venue_bill_change(uuid, text, text) to service_role;
