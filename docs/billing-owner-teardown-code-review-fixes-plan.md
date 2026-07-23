# Billing / Owner-Teardown — Code-Review Fix Plan

**Status: All 4 phases done (2026-07-23).** Verified: `tsc --noEmit` clean, full
suite 678 passed / 6 skipped / 0 failed, lint clean on every changed file.

Follow-up to two same-day pieces of work: the offline/check-billing fixes
(`docs/offline-billing-review-fixes-plan.md`) and the venue-delete/owner-account
teardown work (orphaned `venue_owner_venues` link repair, see `project_offline_check_billing`
and the venue-deletion admin-auth session for background). A `/code-review` pass
against the combined diff surfaced four issues; this plan sequences the fixes by
severity/blast-radius. All four were independently re-verified against the current
code before writing this plan — see the "Confirmed" note under each.

---

## Phase 1 — Guard `repairOrphanedVenueOwnerLink` against a live venue *(critical)*

**Problem (Finding #2):** `repairOrphanedVenueOwnerLink(venueId)` in `lib/admin.ts`
(exposed via `DELETE /api/admin?resource=orphaned-venue-owner-link&id=...`) deletes
the `venue_owner_venues` link, then — if the owner has no other venue — deletes the
`venue_owners` row **and** the Supabase Auth login. It never checks whether a
`venues` row for that id still exists. Called against any live, fully-registered
venue's id, it destroys that partner's account and login even though the venue is
active and the link is legitimate, not orphaned.

**Confirmed:** read `lib/admin.ts:2608-2638` — no query against the `venues` table
anywhere in the function.

**Fix:** Before doing anything destructive, query `venues` for the id. If a row
exists, refuse unconditionally (this function's entire contract is "the venue is
gone, clean up what it left behind" — if the venue exists, the link is not an
orphan, full stop). Return a distinct result shape, e.g. `{ found: true, blocked:
true, reason: "Venue still exists — this link is not orphaned." }`, and have the
API route surface that as a 409, not a 200.

**Tests:** extend `tests/admin.repair-orphaned-link.test.ts` — mock a `venues`
row present for the id and assert the function refuses (no delete calls fired,
`blocked: true` returned).

- **Model:** Sonnet 5 · **Effort:** Low

---

## Phase 2 — Surface `cancelAtPeriodEnd` in the admin billing UI *(high)*

**Problem (Finding #1):** Admin "Revoke" on a card-billed venue schedules
`cancel_at_period_end: true` at Stripe via `cancelSubscription()` but leaves
`status: 'active'` until the period actually ends (by design — no mid-period
refund exposure). `GET /api/admin/billing` never returns `cancelAtPeriodEnd` in
the partner payload (`app/api/admin/billing/route.ts:97-106`), and
`components/admin/sections/BillingSection.tsx`'s `statusBadge()` and
`hasLiveCard` both key off `status` alone. Result: the admin clicks Revoke, sees
no visible change, the badge still reads "Active — card", and `hasLiveCard`
(`isStripe && status !== 'cancelled'`) stays `true` — so "Grant offline" stays
disabled with no visible path forward. The admin has no way to tell the revoke
worked, and no way to convert to offline before the period ends without already
knowing about the undocumented `force: true` grant-manual parameter.

**Confirmed:** read `app/api/admin/billing/route.ts:97-106` (no `cancelAtPeriodEnd`
in the returned object), `lib/billing.ts:56-59` (confirms `status` is untouched on
a Stripe cancel), and `components/admin/sections/BillingSection.tsx:32-37,209-210`
(badge/`hasLiveCard` only branch on `status`).

**Fix:**
1. Add `cancel_at_period_end` to the `billing_subscriptions` select in the admin
   GET route and thread it through to the `partners[].subscription` payload as
   `cancelAtPeriodEnd`.
2. `statusBadge()`: when `status === 'active' && cancelAtPeriodEnd`, show a
   distinct badge ("Cancels {current_period_end date}") instead of a plain
   "Active".
3. Once `cancelAtPeriodEnd` is true, unlock "Grant offline" and have that click
   call `grant-manual` with `force: true` automatically (the endpoint already
   supports this from Phase 3 of the offline-billing plan) — the admin already
   expressed cancellation intent by clicking Revoke, so converting immediately
   should not require them to separately discover the `force` escape hatch.
   Confirm with a dialog: "This immediately cancels the pending Stripe
   cancellation and switches this venue to offline billing."

**Tests:** extend the admin billing GET test coverage to assert
`cancelAtPeriodEnd` round-trips; add a UI-logic test (or extend existing) for
`hasLiveCard`/badge behavior when `cancelAtPeriodEnd` is true.

- **Model:** Sonnet 5 · **Effort:** Medium (touches API payload + two UI branches
  + a wired-up confirm flow)

---

## Phase 3 — Don't silently drop a webhook event when no row exists yet *(medium)*

**Problem (Finding #3):** The Phase 4 stale-event guard in
`app/api/webhooks/stripe/route.ts` (`upsertSubscription` with
`guardStaleSubscriptionId: true`) skips the event whenever
`!existing || existing.stripe_subscription_id !== sub.id`. The `!existing` branch
was meant to future-proof against a race, but it also silently drops a
legitimate `customer.subscription.updated`/`.deleted` event for a subscription
whose `checkout.session.completed` was missed, delayed past Stripe's retry
window, or otherwise never created a `billing_subscriptions` row. Before this
guard existed, `upsertSubscription` would insert-if-missing for these events too.
Since every subscription created through this app's Checkout flow already carries
`venueId`/`ownerId` metadata (required for the upsert to even run — see the early
`if (!venueId || !ownerId) return` guard a few lines above), there is no reason to
distrust an update/delete event just because no row exists yet; the "stale event"
risk is specifically about an existing row referencing a *different* (newer)
subscription, not about a row being absent.

**Confirmed:** read `app/api/webhooks/stripe/route.ts:124-134` — the exact
condition is `if (!existing || existing.stripe_subscription_id !== sub.id) return;`.

**Fix:** Narrow the guard to only skip on an actual mismatch, not on absence:
```
if (existing && existing.stripe_subscription_id !== sub.id) return;
```
A missing row now falls through to the upsert (insert), matching pre-Phase-4
behavior for the "no row yet" case while still rejecting a stale event against a
row that has since moved on to a different/null subscription id.

**Tests:** extend `tests/api.webhooks.stripe-stale-guard.test.ts` with a case
where no `billing_subscriptions` row exists yet for the venue and a
`customer.subscription.updated` event arrives — assert it inserts the row rather
than silently returning.

- **Model:** Sonnet 5 · **Effort:** Low

---

## Phase 4 — Make partial owner-teardown failures recoverable *(low, hardening)*

**Problem (Finding #4):** In both `deleteAdminVenue`'s owner teardown and
`repairOrphanedVenueOwnerLink`, the Supabase Auth user is deleted *before* the
`venue_owners` row (`lib/admin.ts:2562` then `2573`; and `2655` then `2665`). If
the auth deletion succeeds but the subsequent `venue_owners` delete fails (both
are logged best-effort, not thrown), the result is an orphaned `venue_owners` row
with a dangling `auth_id` — that owner can never authenticate again, yet nothing
currently surfaces or repairs this, because by the time this code runs the
`venue_owner_venues` link is already gone, so `repairOrphanedVenueOwnerLink`
(keyed on a surviving link) can never find it again.

Note: reversing the delete order doesn't eliminate the risk, it only trades it —
if the DB row is deleted first and the auth deletion then fails, you get a
dangling Auth login with no owner row, which permanently blocks that email from
ever being used to register a new owner account (the same class of bug this
whole thread started from). Neither ordering is fully safe without a true
cross-system transaction, which Supabase Auth + Postgres can't provide here.

**Fix:** Add a small diagnostic/repair surface instead of chasing ordering:
- `listOrphanedOwnerAccounts()` in `lib/admin.ts` — `venue_owners` rows with zero
  `venue_owner_venues` links (a plain anti-join), regardless of whether their
  auth login is alive or dead.
- Expose read-only via the admin billing/venues surface (or a simple admin API
  GET) so these rows are visible instead of silently persisting forever.
- A delete action reusing the existing best-effort auth-then-row cleanup
  pattern, so an admin can manually reap one after spotting it.

This turns an invisible, unrecoverable edge case into a visible, one-click fix —
proportionate to how rare the underlying partial failure actually is.

**Tests:** unit test `listOrphanedOwnerAccounts()` against a mock with (a) an
owner with a live link (excluded), (b) an owner with zero links (included).

- **Model:** Haiku 4.5 (mechanical, mirrors existing patterns) · **Effort:** Low

---

## Suggested order & stopping points

1. **Phase 1** is the must-fix-before-anyone-uses-it item — the repair endpoint
   is destructive against live data with no guard rail. Do this first, before the
   endpoint sees any real traffic.
2. **Phase 2** closes the admin-facing "revoke looks like it did nothing" UX gap
   from the offline-billing plan's Phase 2. Do soon after — it's the kind of gap
   that generates confused support asks.
3. **Phase 3** is a narrow-probability but real correctness gap in the Phase 4
   webhook guard from the offline-billing plan. Low effort, worth closing in the
   same pass.
4. **Phase 4** is hardening/observability for an already-rare edge case (best-
   effort logging already prevents silent data corruption, this just makes
   recovery a click instead of a manual DB query). Fine to defer or fold into a
   slower week.

No new migrations are required for any phase.
