-- Multi-venue volume billing (docs/multi-venue-volume-billing-plan.md) Phase 3: the atomic claim
-- that starts a partner's "Add a venue".
--
-- Creates ONE function and nothing else — no table, view or sequence, so no new grants on a
-- relation are needed (the ledger table billing_venue_additions and the membership table
-- billing_subscription_venues came with 20261011134820_multi_venue_billing.sql, service_role only).
--
-- WHY A LOCKED RPC (plan §4.3 step 3). Adding a venue sets the Stripe subscription item's
-- quantity to an ABSOLUTE number: n + 1. Two adds that both read n and both send n + 1 would
-- give the partner two venues for the price of one. So every add on a bill is claimed here,
-- under a transaction-scoped advisory lock keyed on the bill — the same count-guarded pattern as
-- award_cycle_winner and claim_signup_attempt — and the rule is:
--
--   * at most ONE add in flight per bill (a ledger row in 'pending' or 'requires_action');
--   * the same idempotency key always returns the SAME ledger row (a double-tap, a retry, or a
--     second request racing the first can never start a second charge or a second venue);
--   * quantity_before = venues currently billed on the bill (membership rows that are neither
--     removed nor scheduled for removal — Phase 5's "Remove" lowers the Stripe quantity at once
--     and sets remove_at, so a scheduled removal is no longer billed), quantity_after = + 1.
--
-- The caller (lib/venueAddition.ts, its only caller) compares quantity_before with Stripe's live
-- quantity before charging, and refuses on any difference rather than "fixing" either side.
--
-- Outcomes (column `outcome`):
--   claimed      — a new 'pending' ledger row was inserted; the caller may create the venue and
--                  charge.
--   existing     — this idempotency key already has a row on this bill for this owner; returned
--                  as-is. The caller decides from its status (paid / failed / still in flight).
--   busy         — ANOTHER add is in flight on this bill; that row is returned so the caller can
--                  reconcile it if it is stale, or tell the partner to finish it first.
--   key_conflict — the key exists for a different bill or owner. Nothing of that row is returned.
--   not_owner    — the bill belongs to another owner.
--   no_bill      — no such bill, or (drift) the bill has no billed venue at all.
--   invalid      — a required argument is missing.

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

  -- Serialize every add on this bill. Auto-released at transaction end.
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

  -- Same key → same row, whatever its status.
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
    -- One add in flight per bill.
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
        -- Every bill has its anchor row (trigger + backfill). None means drift; refuse.
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
  'Multi-venue billing Phase 3: atomically claim a partner "Add a venue" on one bill. '
  'Advisory-locked per bill (same pattern as award_cycle_winner); one add in flight per bill; '
  'same idempotency key returns the same billing_venue_additions row. Sole caller: lib/venueAddition.ts.';

revoke all on function public.claim_venue_addition(text, uuid, uuid, text) from public;
revoke all on function public.claim_venue_addition(text, uuid, uuid, text) from anon, authenticated;
grant execute on function public.claim_venue_addition(text, uuid, uuid, text) to service_role;
