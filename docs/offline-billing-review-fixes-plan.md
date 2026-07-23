# Offline/Check Billing — Code-Review Fix Plan

Follow-up to the four-phase offline/check-payment feature (see
`project_offline_check_billing` memory). A code review surfaced five issues; this
plan sequences the fixes by severity. Phases 1–4 are correctness/safety; Phase 5
is cleanup.

## Background: what actually gates access

Entitlement is gated **purely on `billing_subscriptions.status === 'active'`** —
never on `current_period_end`. Confirmed at every gate site:
`app/owner/billing/setup/page.tsx:35`, `app/api/owner/billing/checkout/route.ts:52`,
`app/owner/dashboard/page.tsx:109`. Nothing flips an offline row's status when its
paid-through date passes, because the renewal cron excludes `billing_method='offline'`
and the Stripe webhook never fires for tokenless rows. This is the root of Finding #2.

---

## Phase 1 — Expire offline grants at their paid-through date *(critical)*

**Problem (Finding #2):** An offline grant stays `status='active'` forever. After
`current_period_end` passes, the owner still sees "Active — billed offline / Paid
through {past date}" and retains access, contradicting the admin UI copy "then
reverts to no access." Access only ends if an admin manually revokes.

**Fix:** Add an expiry sweep to the billing cron (`app/api/cron/billing/route.ts`).
After the existing rebilling loop, run a second query:

```
billing_method = 'offline' AND status = 'active' AND current_period_end <= now()
  → update status = 'cancelled'
```

`'cancelled'` is already in the status check constraint and is already handled by
the owner UI (shows "Access ends {date}", offers Resubscribe) and the dashboard
tile. No schema change, no new gate logic. Re-granting from the admin panel
reactivates the row (the upsert already sets `status='active'`).

**Also:** confirm `vercel.json` actually schedules `/api/cron/billing`. If the
SlimCD-era cron was descheduled during the Stripe migration, the offline expiry
sweep won't run — in that case schedule it (daily is sufficient; expiry lag of up
to a day is acceptable for a monthly offline plan).

**Tests:** extend `tests/api.cron.billing-manual-guard.test.ts` (or add a sibling)
to assert an active offline row past `current_period_end` is set to `cancelled`,
and one still within its period is left untouched.

- **Model:** Opus 4.8 · **Effort:** Medium

---

## Phase 2 — Admin revoke must cancel the Stripe subscription *(critical)*

**Problem (Finding #1):** `app/api/admin/billing/route.ts` revoke only sets
`status='cancelled'` in the DB. For a card-billed (Stripe) venue — for which
`BillingSection.tsx` still renders a "Revoke" button — the live Stripe
subscription keeps charging the customer monthly while the dashboard shows no
access. DB/Stripe desync + ongoing charges.

**Fix:**
1. Extract the Stripe-cancel logic already living in
   `app/api/owner/billing/subscription/route.ts` (schedule
   `cancel_at_period_end`, mirror the flag locally) into a shared helper, e.g.
   `lib/billing.ts` → `cancelSubscription(subscriptionRow)`.
2. Admin revoke calls it: if the row has a `stripe_subscription_id`, cancel via
   Stripe; if it's offline/tokenless, just set `status='cancelled'` (today's
   behavior).
3. Owner DELETE route switches to the same helper (no behavior change; removes
   the duplication).

**Decision to confirm:** admin revoke should use **`cancel_at_period_end`** (parity
with the owner flow, no mid-period refund exposure) rather than an immediate Stripe
cancel. Immediate cancel is harsher and can strand a partial period — flag if you
want "revoke = access ends now" instead.

**Tests:** unit-test the helper (Stripe row → Stripe API called; offline row →
DB-only). Assert admin revoke on a Stripe-backed row invokes the cancel path.

- **Model:** Opus 4.8 · **Effort:** Medium

---

## Phase 3 — Guard grant-manual against orphaning a live Stripe subscription *(high)*

**Problem (Finding #3):** The "Grant offline" button is disabled client-side only
for `status==='active'` cards (`hasActiveCard`). For a **past_due** card sub the
button is enabled and the POST endpoint enforces no check. Granting offline nulls
`stripe_subscription_id`/`stripe_customer_id`/`stripe_price_id`, orphaning a Stripe
subscription that's still in dunning — the app can no longer cancel or reconcile
it, and Stripe may keep collecting.

**Fix (server-side, in `grant-manual`):** before the upsert, load the existing row.
If it has a `stripe_subscription_id` and `status IN ('active','past_due')`, refuse
with a clear 409: "This venue has a live Stripe subscription. Cancel it first
(Revoke), then grant offline access." Reuse the Phase 2 cancel helper so the admin
can do it in two clicks.

- Optional nicety: accept a `force: true` that cancels the Stripe subscription via
  the Phase 2 helper and *then* converts to offline in one call.
- Tighten the client too: disable/relabel "Grant offline" whenever `isStripe &&
  status !== 'cancelled'`, not just active — but the server guard is the real fix.

**Tests:** POST grant-manual against a past_due Stripe row → 409, no DB mutation.

- **Model:** Sonnet 5 · **Effort:** Low–Medium

---

## Phase 4 — Stop stale Stripe webhooks from clobbering an offline grant *(high)*

**Problem (Finding #4):** `upsertSubscription` in
`app/api/webhooks/stripe/route.ts` upserts `onConflict: venue_id` and now reasserts
`billing_method='stripe'` + full Stripe fields. A late/retried webhook (Stripe
retries ~3 days) for an **old, already-cancelled** subscription can overwrite a
newer admin offline grant, silently revoking it and flipping status to the stale
event's value.

**Fix — make the overwrite event-type-aware:**
- `checkout.session.completed` = an intentional *new* subscription → always apply
  (a card takeover of a previously-offline venue is legitimate).
- `customer.subscription.updated` / `.deleted` = only apply if the incoming
  `sub.id` matches the row's **current** `stripe_subscription_id`. If the venue's
  row is offline (or references a different subscription id), the event is stale →
  ignore it (return 200 so Stripe stops retrying).

Implement by fetching the existing row by `venue_id` inside `upsertSubscription`
(or a guard before it) and comparing ids for update/delete events.

**Tests:** simulate a `customer.subscription.deleted` for a subscription id that no
longer matches an offline row → row unchanged.

- **Model:** Opus 4.8 · **Effort:** Medium (subtle event-ordering logic)

---

## Phase 5 — De-duplicate the "Payment method" card *(low, cleanup)*

**Problem (Finding #5):** In `app/owner/billing/page.tsx` the `isManual` and
non-manual branches (~lines 248–284) repeat the identical outer
`Payment method` card scaffolding; only the inner content differs. Two-place
maintenance hazard.

**Fix:** single wrapper (`<p>Payment method</p>` + card `div`) with only the inner
`span`/button conditional on `isManual`. Pure refactor, no behavior change.

- **Model:** Sonnet 5 (or Haiku 4.5) · **Effort:** Low

---

## Suggested order & stopping points

1. **Phase 1 + Phase 2** are the must-fix correctness/billing-integrity issues
   (access that never ends; a revoke that keeps charging). Do these first.
2. **Phase 3 + Phase 4** close the two data-integrity edge cases (orphaned Stripe
   sub; stale-webhook clobber). Ship soon after.
3. **Phase 5** is cosmetic — fold into any of the above PRs.

No new migrations are required for any phase.
