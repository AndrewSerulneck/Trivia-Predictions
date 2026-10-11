-- Multi-venue volume billing (docs/multi-venue-volume-billing-plan.md) Phase 1: the database
-- learns "many venues on one bill" while every bill still has exactly one venue.
--
-- Additive only. No existing row changes meaning:
--   * billing_subscriptions.venue_id stays NOT NULL UNIQUE and now means "the ANCHOR venue"
--     (the venue the bill was opened for). No constraint on the money table is touched.
--   * Every existing billing_subscriptions row gets exactly one 'anchor' membership row.
--   * A trigger gives every FUTURE billing_subscriptions row its anchor membership row too, so
--     no code path (Stripe webhook, admin offline grant, a script) can create a bill that the
--     membership table does not know about.
--
-- Readers go through lib/venueBilling.ts, which ALSO falls back to the anchor column when this
-- table is missing — so deploying the code before this migration is applied is safe.
--
-- Nothing here is behind a flag: the add / remove flows that write 'added' rows are Phase 3+
-- and are flag-gated there (NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED).

-- ── 1. Venues on a bill ────────────────────────────────────────────────────────────────────
-- subscription_id is ON DELETE RESTRICT on purpose (plan §4.2 / §7 trap 2). billing_subscriptions
-- .venue_id is ON DELETE CASCADE, so deleting a chain's ANCHOR venue would otherwise silently
-- delete the whole chain's billing row. With RESTRICT that delete fails while any OTHER venue is
-- still on the bill. Deleting a single-venue partner's venue still works: its own membership row
-- cascades away (venue_id ON DELETE CASCADE) in the same statement — verified on PGlite by
-- scripts/test-multi-venue-billing-sql.cjs.
--
-- A removed venue keeps its row (remove_at / removed_at set) as history, and that row still
-- holds the RESTRICT. Phase 5 (removal) must therefore clear a bill's removed rows before an
-- admin deletes its anchor venue — see the Phase 1 handoff.

create table if not exists public.billing_subscription_venues (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete restrict,
  -- UNIQUE: a venue is on at most one bill.
  venue_id text not null unique references public.venues(id) on delete cascade,
  -- anchor = the venue the bill was opened for; added = partner self-serve add (Phase 3);
  -- admin = attached by an admin (Phase 6).
  role text not null default 'anchor' check (role in ('anchor', 'added', 'admin')),
  added_at timestamptz not null default now(),
  -- Set by Remove (Phase 5): the period end the venue stops being billed.
  remove_at timestamptz,
  -- Set when the daily cron actually takes the venue off (Phase 5).
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_subscription_venues_subscription_id
  on public.billing_subscription_venues(subscription_id);

-- Phase 5's cron reads "venues whose remove_at has passed and are not yet removed" — one
-- bounded read per run.
create index if not exists idx_billing_subscription_venues_pending_removal
  on public.billing_subscription_venues(remove_at)
  where remove_at is not null and removed_at is null;

alter table public.billing_subscription_venues enable row level security;
alter table public.billing_subscription_venues force row level security;
revoke all on table public.billing_subscription_venues from anon, authenticated;
-- Server-only (lib/supabaseAdmin.ts). Partners read their bill through /api/owner/billing.
grant select, insert, update, delete on table public.billing_subscription_venues to service_role;

-- ── 2. Ledger of add-a-venue attempts (written from Phase 3) ──────────────────────────────
-- One row per attempt, inserted BEFORE the Stripe call with a UNIQUE idempotency_key (same
-- pattern as pos_reward_applications), so a retry, a double-tap and a webhook that arrives first
-- all converge on one outcome. Every FK is ON DELETE SET NULL: this is money history, and a
-- declined add deletes the venue it created (venue_name keeps the record readable).

create table if not exists public.billing_venue_additions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  owner_id uuid references public.venue_owners(id) on delete set null,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  venue_id text references public.venues(id) on delete set null,
  venue_name text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'requires_action')),
  stripe_invoice_id text,
  quantity_before integer check (quantity_before is null or quantity_before >= 0),
  quantity_after integer check (quantity_after is null or quantity_after >= 1),
  -- What Stripe charged (or asked for) today, in cents. Display / audit only.
  amount_due_cents integer,
  failure_reason text,
  -- Set once the "Venue added" email (lib/email/sendVenueAddedEmail.ts) has gone out, so the
  -- route and the invoice.paid webhook — both of which can complete an add — send it once.
  venue_added_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_venue_additions_subscription_id
  on public.billing_venue_additions(subscription_id);
create index if not exists idx_billing_venue_additions_venue_id
  on public.billing_venue_additions(venue_id);
create index if not exists idx_billing_venue_additions_stripe_invoice_id
  on public.billing_venue_additions(stripe_invoice_id)
  where stripe_invoice_id is not null;

alter table public.billing_venue_additions enable row level security;
alter table public.billing_venue_additions force row level security;
revoke all on table public.billing_venue_additions from anon, authenticated;
grant select, insert, update, delete on table public.billing_venue_additions to service_role;

-- Reuses the existing updated_at trigger function from 20260627100000_venue_owner_billing.sql.
drop trigger if exists billing_venue_additions_updated_at on public.billing_venue_additions;
create trigger billing_venue_additions_updated_at
  before update on public.billing_venue_additions
  for each row execute function public.update_billing_subscription_updated_at();

-- ── 3. Stripe quantity mirror ──────────────────────────────────────────────────────────────
-- The Stripe subscription item's quantity (= venues billed, once the graduated price is live in
-- Phase 2). Written by the Stripe webhook only; NULL on offline rows and on rows the webhook has
-- not re-synced since this migration. lib/venueBilling.ts counts venues from the membership
-- table, never from this column — it exists for the Phase 6 Stripe-vs-DB drift check.
alter table public.billing_subscriptions
  add column if not exists quantity integer check (quantity is null or quantity >= 0);

-- ── 4. Every bill knows its anchor ─────────────────────────────────────────────────────────
-- AFTER INSERT only: an upsert that UPDATES an existing row (a resubscribe re-pointing the row at
-- a new Stripe subscription) does not fire it, and needs nothing — the row's id, and so its
-- membership row, is unchanged.
-- ON CONFLICT DO NOTHING: if the venue is already on another bill, a new bill never steals it.
-- lib/venueBilling.ts resolves that (rare, drift) case explicitly and logs it.

create or replace function public.billing_subscriptions_add_anchor_venue()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.billing_subscription_venues (subscription_id, venue_id, role, added_at)
  values (new.id, new.venue_id, 'anchor', coalesce(new.created_at, now()))
  on conflict (venue_id) do nothing;
  return new;
end;
$$;

revoke all on function public.billing_subscriptions_add_anchor_venue() from public, anon, authenticated;

drop trigger if exists billing_subscriptions_add_anchor_venue on public.billing_subscriptions;
create trigger billing_subscriptions_add_anchor_venue
  after insert on public.billing_subscriptions
  for each row execute function public.billing_subscriptions_add_anchor_venue();

-- ── 5. Backfill: one anchor row per existing bill ─────────────────────────────────────────
-- Anchors ONLY. A partner's other linked venues (e.g. the hidden Square test venue
-- `venue-hightop-test` on Pacific Street's owner) are NOT on the bill and must never be billed —
-- which is exactly why membership is explicit rather than "every venue the owner has".
insert into public.billing_subscription_venues (subscription_id, venue_id, role, added_at)
select bs.id, bs.venue_id, 'anchor', coalesce(bs.created_at, now())
from public.billing_subscriptions bs
on conflict (venue_id) do nothing;
