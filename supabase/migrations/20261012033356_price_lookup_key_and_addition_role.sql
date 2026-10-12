-- Multi-venue volume billing (docs/multi-venue-volume-billing-plan.md) Phase 6.8 — review 6.5 #3, #4.
--
-- #3 THE DISPLAY RATE FROM THE LOOKUP KEY. Charges (lib/venuePricing.ts `billRateFromPrice`) treat a
-- flat Price as a per-venue rate ONLY when its lookup key starts with `custom_monthly_`; displays
-- (`billRateFromMirror`, which reads this table, never Stripe) could not tell, because the mirror held
-- the Price id but not its key — so any non-graduated flat Price was shown as "amount ÷ venues each".
-- `stripe_price_lookup_key` mirrors the key beside `stripe_price_id`. Written by the Stripe webhook
-- (every subscription sync) and lib/billingCustomPrice.ts (the admin price swap); cleared with the
-- price id by admin Grant offline. Nullable: offline bills have no Price, and a Stripe Price may have
-- no lookup key. Existing rows are backfilled by scripts/backfill-price-lookup-keys.cjs (read-only
-- Stripe listing, dry run by default) — not here, because SQL cannot reach Stripe.
--
-- #4 THE ADMIN ROLE ON THE ADD LEDGER. An admin "Add to their bill" on a card bill runs the
-- partner's paid add flow (lib/venueAddition.ts `startVenueAddition` with `adminAttachVenue`), whose
-- completion wrote the membership row with role 'added'. `membership_role` records who started the
-- add, so completion — which may run later from the webhook or the daily cron, with no admin in
-- sight — writes role 'admin'. Every existing row was started by a partner (the admin card path is
-- refused while NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED is off), so the default is right for them.
-- claim_venue_addition (20261011153607) inserts without naming this column → 'added'; the app sets
-- 'admin' in the same ledger update that records the venue id.
--
-- Alters existing tables only — creates no table, view or sequence, so no new grants
-- (tests/supabase-migration-grants-contract.test.ts). Re-runnable.
--
-- DEPLOY ORDER: this migration first, then the app. The new app selects and writes both columns;
-- the old app never names them, so it is unaffected by this file.

-- ── #3 ─────────────────────────────────────────────────────────────────────────────────────
alter table public.billing_subscriptions add column if not exists stripe_price_lookup_key text;

comment on column public.billing_subscriptions.stripe_price_lookup_key is
  'Mirror of the subscription item''s Stripe Price lookup_key (beside stripe_price_id). '
  'custom_monthly_<cents> = negotiated per-venue rate; hightop_venue_graduated_monthly_v1 = bands.';

-- ── #4 ─────────────────────────────────────────────────────────────────────────────────────
alter table public.billing_venue_additions
  add column if not exists membership_role text not null default 'added';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_venue_additions'::regclass
      and conname = 'billing_venue_additions_membership_role_check'
  ) then
    alter table public.billing_venue_additions
      add constraint billing_venue_additions_membership_role_check
      check (membership_role in ('added', 'admin'));
  end if;
end
$$;

comment on column public.billing_venue_additions.membership_role is
  'Role the paid add writes on billing_subscription_venues: added (partner) or admin (admin Add to their bill).';
