-- Multi-venue volume billing (docs/multi-venue-volume-billing-plan.md) Phase 5: a partner takes a
-- venue OFF their bill at the end of the month ("Remove"), or changes their mind before then
-- ("Undo"). Plan §4.4 and Andrew's decision #2: self-serve, end of month, no refunds, no credits.
--
-- What this file adds:
--   1. billing_venue_changes — the ledger of Remove / Undo attempts (one row per attempt, written
--      BEFORE the Stripe call, UNIQUE idempotency_key — the same pattern as billing_venue_additions).
--   2. claim_venue_bill_change(...) — the advisory-locked claim that starts one.
--   3. finish_venue_bill_change(...) — applies a claimed change to the membership table (and moves
--      the bill's anchor, when the anchor venue is the one leaving) in ONE transaction, after
--      Stripe has accepted the new quantity.
--   4. claim_venue_addition(...) is REPLACED (same signature, same outcomes) with one extra rule:
--      an add is `busy` while a Remove / Undo is in flight on the same bill.
--
-- WHY THE SAME LOCK AS "ADD A VENUE". Every one of these changes sets the Stripe subscription
-- item's quantity to an ABSOLUTE number. Two changes that read the same n and write n ± 1 lose
-- one of them, and (Stripe docs, "Pending updates") ANY subscription update that sends an `items`
-- list discards an add's pending 3-D Secure update and voids its invoice. So an add, a Remove and
-- an Undo on the same bill are mutually exclusive: all three claim under the advisory lock keyed
-- 'billing_venue_addition:' || bill id, and each refuses while another kind is in flight.
--
-- MONEY SEMANTICS (lib/venueRemoval.ts is the only caller):
--   * Remove: Stripe quantity n → n − 1 with proration_behavior "none" (no credit), and the
--     venue's membership row gets remove_at = the paid period's end. It stays live until then;
--     the daily /api/cron/billing then stamps removed_at and hides it. A venue with remove_at set
--     is no longer BILLED (claim_venue_addition already excludes it from the count).
--   * Undo (before remove_at): quantity n → n + 1, again proration "none" — the month was already
--     paid for, so nothing is charged; the next renewal simply bills the venue again.
--   * After remove_at, Undo is refused: the period has renewed without the venue, so putting it
--     back is a paid "Add back" through the normal add flow.
--
-- Creates one TABLE, so the grants are in this file (supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md;
-- tests/supabase-migration-grants-contract.test.ts). The functions are service_role only.

-- ── 1. Ledger of Remove / Undo attempts ────────────────────────────────────────────────────
create table if not exists public.billing_venue_changes (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  owner_id uuid references public.venue_owners(id) on delete set null,
  -- SET NULL, never cascade: this is money history.
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  venue_id text references public.venues(id) on delete set null,
  action text not null check (action in ('remove', 'undo')),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  quantity_before integer check (quantity_before is null or quantity_before >= 0),
  -- >= 1: the last billed venue can never be removed (Cancel in Billing is that path).
  quantity_after integer check (quantity_after is null or quantity_after >= 1),
  -- remove only: the period end the venue stops being billed (copied to the membership row).
  remove_at timestamptz,
  -- remove only, when the venue leaving is the bill's anchor: the venue that becomes the anchor.
  new_anchor_venue_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_venue_changes_subscription_id
  on public.billing_venue_changes(subscription_id);
create index if not exists idx_billing_venue_changes_pending
  on public.billing_venue_changes(updated_at)
  where status = 'pending';

alter table public.billing_venue_changes enable row level security;
alter table public.billing_venue_changes force row level security;
revoke all on table public.billing_venue_changes from anon, authenticated;
grant select, insert, update, delete on table public.billing_venue_changes to service_role;

drop trigger if exists billing_venue_changes_updated_at on public.billing_venue_changes;
create trigger billing_venue_changes_updated_at
  before update on public.billing_venue_changes
  for each row execute function public.update_billing_subscription_updated_at();

-- ── 2. Claim a Remove / Undo ───────────────────────────────────────────────────────────────
-- Outcomes (column `outcome`):
--   claimed         — a new 'pending' row; the caller may now call Stripe.
--   existing        — this key already has a row (same owner, bill, venue, action); returned as-is.
--   key_conflict    — the key exists for something else. Nothing of that row is returned.
--   busy_addition   — an "Add a venue" is in flight on this bill.
--   busy_change     — another Remove / Undo is in flight on this bill; that row is returned so the
--                     caller can settle it if it is stale.
--   not_owner       — the bill belongs to another owner.
--   no_bill         — no such bill.
--   not_on_bill     — the venue is not (or no longer) on this bill.
--   already_leaving — remove: the venue is already scheduled to leave.
--   not_leaving     — undo: the venue is not scheduled to leave.
--   too_late        — undo: its remove_at has passed (the period renewed without it).
--   last_venue      — remove: it is the only billed venue left.
--   no_new_anchor   — remove of the anchor: no other billed venue can take over the bill (each
--                     already anchors a bill row of its own — billing_subscriptions.venue_id is
--                     UNIQUE). Needs an admin.
--   invalid         — a required argument is missing or out of range.
create or replace function public.claim_venue_bill_change(
  p_idempotency_key text,
  p_owner_id uuid,
  p_subscription_id uuid,
  p_venue_id text,
  p_action text,
  p_remove_at timestamptz
)
returns table (
  outcome text,
  change_id uuid,
  change_status text,
  change_venue_id text,
  change_action text,
  change_quantity_before integer,
  change_quantity_after integer,
  change_remove_at timestamptz,
  change_new_anchor_venue_id text,
  change_updated_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_venue text := btrim(coalesce(p_venue_id, ''));
  v_bill billing_subscriptions%rowtype;
  v_member billing_subscription_venues%rowtype;
  v_row billing_venue_changes%rowtype;
  v_count integer;
  v_new_anchor text;
begin
  if length(v_key) = 0 or length(v_venue) = 0 or p_owner_id is null or p_subscription_id is null
     or p_action is null or p_action not in ('remove', 'undo')
     or (p_action = 'remove' and (p_remove_at is null or p_remove_at <= now())) then
    outcome := 'invalid';
    return next;
    return;
  end if;

  -- The SAME lock as claim_venue_addition: adds, removes and undos on one bill are serialized.
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
    if v_row.subscription_id is distinct from p_subscription_id
       or v_row.owner_id is distinct from p_owner_id
       or v_row.venue_id is distinct from v_venue
       or v_row.action is distinct from p_action then
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
      select * into v_member from billing_subscription_venues m
      where m.venue_id = v_venue and m.subscription_id = p_subscription_id and m.removed_at is null;
      if not found then
        outcome := 'not_on_bill';
        return next;
        return;
      end if;

      select count(*) into v_count
      from billing_subscription_venues m
      where m.subscription_id = p_subscription_id and m.removed_at is null and m.remove_at is null;

      if p_action = 'remove' then
        if v_member.remove_at is not null then
          outcome := 'already_leaving';
          return next;
          return;
        end if;
        if v_count < 2 then
          outcome := 'last_venue';
          return next;
          return;
        end if;
        if v_bill.venue_id = v_venue then
          -- The anchor is leaving: the oldest other billed venue that anchors no bill row of its
          -- own takes over (billing_subscriptions.venue_id is UNIQUE).
          select m.venue_id into v_new_anchor
          from billing_subscription_venues m
          where m.subscription_id = p_subscription_id
            and m.removed_at is null
            and m.remove_at is null
            and m.venue_id <> v_venue
            and not exists (select 1 from billing_subscriptions other where other.venue_id = m.venue_id)
          order by m.added_at asc, m.venue_id asc
          limit 1;
          if v_new_anchor is null then
            outcome := 'no_new_anchor';
            return next;
            return;
          end if;
        end if;

        insert into billing_venue_changes (
          idempotency_key, owner_id, subscription_id, venue_id, action, status,
          quantity_before, quantity_after, remove_at, new_anchor_venue_id
        ) values (
          v_key, p_owner_id, p_subscription_id, v_venue, 'remove', 'pending',
          v_count, v_count - 1, p_remove_at, v_new_anchor
        )
        returning * into v_row;
      else
        if v_member.remove_at is null then
          outcome := 'not_leaving';
          return next;
          return;
        end if;
        if v_member.remove_at <= now() then
          outcome := 'too_late';
          return next;
          return;
        end if;

        insert into billing_venue_changes (
          idempotency_key, owner_id, subscription_id, venue_id, action, status,
          quantity_before, quantity_after
        ) values (
          v_key, p_owner_id, p_subscription_id, v_venue, 'undo', 'pending', v_count, v_count + 1
        )
        returning * into v_row;
      end if;
      outcome := 'claimed';
    end if;
  end if;

  change_id := v_row.id;
  change_status := v_row.status;
  change_venue_id := v_row.venue_id;
  change_action := v_row.action;
  change_quantity_before := v_row.quantity_before;
  change_quantity_after := v_row.quantity_after;
  change_remove_at := v_row.remove_at;
  change_new_anchor_venue_id := v_row.new_anchor_venue_id;
  change_updated_at := v_row.updated_at;
  return next;
end;
$$;

comment on function public.claim_venue_bill_change(text, uuid, uuid, text, text, timestamptz) is
  'Multi-venue billing Phase 5: atomically claim a partner Remove / Undo on one bill, under the same '
  'advisory lock as claim_venue_addition. Sole caller: lib/venueRemoval.ts.';

revoke all on function public.claim_venue_bill_change(text, uuid, uuid, text, text, timestamptz) from public;
revoke all on function public.claim_venue_bill_change(text, uuid, uuid, text, text, timestamptz) from anon, authenticated;
grant execute on function public.claim_venue_bill_change(text, uuid, uuid, text, text, timestamptz) to service_role;

-- ── 3. Finish a claimed change ─────────────────────────────────────────────────────────────
-- p_outcome 'done' (Stripe accepted the new quantity) or 'failed' (it definitely did not).
-- Idempotent: a row that is no longer pending is returned as it is (outcome 'already').
-- On 'done', the membership change and (remove of the anchor) the re-anchor happen in this one
-- transaction. Re-anchoring moves billing_subscriptions.venue_id, which matters because that
-- column is ON DELETE CASCADE: a removed, later-deleted anchor venue would otherwise delete the
-- whole chain's billing row (plan §7 trap 2).
--
-- Outcomes: done | failed | already | drift (Stripe changed but the membership row was not in
-- the expected state — the row is marked done with failure_reason set, and the caller logs it
-- loudly; Phase 6's Stripe-vs-DB drift check is the backstop) | not_found | invalid.
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
  'Multi-venue billing Phase 5: apply (done) or close (failed) a claimed Remove / Undo; moves the '
  'bill anchor in the same transaction when the anchor leaves. Sole caller: lib/venueRemoval.ts.';

revoke all on function public.finish_venue_bill_change(uuid, text, text) from public;
revoke all on function public.finish_venue_bill_change(uuid, text, text) from anon, authenticated;
grant execute on function public.finish_venue_bill_change(uuid, text, text) to service_role;

-- ── 4. claim_venue_addition: also busy while a Remove / Undo is in flight ─────────────────
-- Identical to 20261011153607_venue_addition_claim.sql except for the marked block. Without it, an
-- add could claim off the membership count while a Remove's Stripe call is landing, then send an
-- absolute quantity that silently undoes the Remove (or vice versa). The add answers `busy` with no
-- row (lib/venueAddition.ts then refuses `addition_in_progress`); the change takes a second or two.
create or replace function public.claim_venue_addition(
  p_idempotency_key text,
  p_owner_id uuid,
  p_subscription_id uuid,
  p_venue_name text
)
returns table (
  outcome text,
  addition_id uuid,
  addition_status text,
  addition_venue_id text,
  addition_invoice_id text,
  addition_quantity_before integer,
  addition_quantity_after integer,
  addition_amount_due_cents integer,
  addition_failure_reason text,
  addition_updated_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_bill_owner uuid;
  v_row billing_venue_additions%rowtype;
  v_count integer;
begin
  if length(v_key) = 0 or p_owner_id is null or p_subscription_id is null then
    outcome := 'invalid';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('billing_venue_addition:' || p_subscription_id::text, 0));

  select bs.owner_id into v_bill_owner
  from billing_subscriptions bs
  where bs.id = p_subscription_id;
  if not found then
    outcome := 'no_bill';
    return next;
    return;
  end if;
  if v_bill_owner is distinct from p_owner_id then
    outcome := 'not_owner';
    return next;
    return;
  end if;

  select * into v_row
  from billing_venue_additions a
  where a.idempotency_key = v_key;
  if found then
    if v_row.subscription_id is distinct from p_subscription_id or v_row.owner_id is distinct from p_owner_id then
      outcome := 'key_conflict';
      return next;
      return;
    end if;
    outcome := 'existing';
  else
    -- Phase 5 (new): a Remove / Undo in flight on this bill.
    if exists (
      select 1 from billing_venue_changes c
      where c.subscription_id = p_subscription_id and c.status = 'pending'
    ) then
      outcome := 'busy';
      return next;
      return;
    end if;

    select * into v_row
    from billing_venue_additions a
    where a.subscription_id = p_subscription_id
      and a.status in ('pending', 'requires_action')
    order by a.created_at asc
    limit 1;
    if found then
      outcome := 'busy';
    else
      select count(*) into v_count
      from billing_subscription_venues m
      where m.subscription_id = p_subscription_id
        and m.removed_at is null
        and m.remove_at is null;
      if v_count < 1 then
        outcome := 'no_bill';
        return next;
        return;
      end if;

      insert into billing_venue_additions (
        idempotency_key, owner_id, subscription_id, venue_name, status, quantity_before, quantity_after
      )
      values (
        v_key, p_owner_id, p_subscription_id, nullif(btrim(coalesce(p_venue_name, '')), ''), 'pending',
        v_count, v_count + 1
      )
      returning * into v_row;
      outcome := 'claimed';
    end if;
  end if;

  addition_id := v_row.id;
  addition_status := v_row.status;
  addition_venue_id := v_row.venue_id;
  addition_invoice_id := v_row.stripe_invoice_id;
  addition_quantity_before := v_row.quantity_before;
  addition_quantity_after := v_row.quantity_after;
  addition_amount_due_cents := v_row.amount_due_cents;
  addition_failure_reason := v_row.failure_reason;
  addition_updated_at := v_row.updated_at;
  return next;
end;
$$;

comment on function public.claim_venue_addition(text, uuid, uuid, text) is
  'Multi-venue billing Phase 3 (+ Phase 5: busy while a Remove / Undo is in flight): atomically claim '
  'a partner "Add a venue" on one bill. Advisory-locked per bill; one add in flight per bill; same '
  'idempotency key returns the same billing_venue_additions row. Sole caller: lib/venueAddition.ts.';

revoke all on function public.claim_venue_addition(text, uuid, uuid, text) from public;
revoke all on function public.claim_venue_addition(text, uuid, uuid, text) from anon, authenticated;
grant execute on function public.claim_venue_addition(text, uuid, uuid, text) to service_role;
