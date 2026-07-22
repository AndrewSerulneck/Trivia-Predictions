# Venue delete — code review fixes plan

Context: partner venues can now be deleted from the admin "Venue Profiles" page
(see `lib/admin.ts` `deleteAdminVenue` / `getAdminVenueDeletionSummary`,
`app/api/admin/route.ts` `resource=venues` / `resource=venue-deletion-summary`,
`components/admin/sections/VenuesSection.tsx` delete-confirmation modal). A
`/code-review` pass (high effort, no verify) on that work surfaced 7 findings.
This doc tracks fixing them, phased by risk/blast-radius so each phase can be
picked up independently (including in a fresh chat — paste this file's path).

None of these block the feature from working today; they're edge cases and
hardening. Phase 1 is the one worth doing before this reaches real partner
venues, since it can silently bypass the safety gate the feature exists to
provide.

## Phase 1 — Confirmation-modal safety bugs ✅ DONE
**Model: Sonnet · Effort: Medium**

Two bugs in `components/admin/sections/VenuesSection.tsx` let a partner venue
get deleted without the "type the venue name" safety gate ever being enforced
— which defeats the point of the feature. One bug leaves the operator stuck
staring at a dead modal on failure.

1. **Stale summary-fetch race** (`VenuesSection.tsx` ~line 1203-1218,
   `openDeleteModal`). If the operator opens the delete modal for venue A then
   quickly opens it for venue B before A's summary request resolves, A's
   response can land after B's and overwrite `deleteSummary` — showing B's
   name with A's (possibly non-partner) summary, skipping the type-to-confirm
   gate for a venue that needed it.
   - Fix: track a request id / use an `AbortController` keyed to
     `deleteTarget.id`; discard the response if it doesn't match the
     venue currently open in the modal.

2. **Delete-failure is invisible** (`VenuesSection.tsx` ~line 1226-1252,
   `confirmDelete`). On failure the error is written via `setError(...)`,
   which renders in the page-level banner — but that banner sits **behind**
   the modal overlay (`fixed inset-0 z-50`). The modal stays open with the
   spinner stopped and no visible error.
   - Fix: render the error inside the modal itself (reuse the existing
     `deleteSummaryError`-style block, or add a `deleteError` state), not
     just the page-level banner.

3. **Empty/null venue name trivially bypasses the gate** (`VenuesSection.tsx`
   line ~1469). The confirm check is
   `deleteConfirmText.trim() !== (deleteTarget.name ?? "").trim()`. If
   `deleteTarget.name` is falsy, an empty input satisfies `'' !== ''` →
   `false`, so the button enables with nothing typed.
   - Fix: when `deleteTarget.name` is empty, either disable deletion entirely
     for that venue (data problem — a venue should always have a name) or
     require a fixed literal like `DELETE` instead of the venue name.

Fix all three together — they're in the same component and small.

## Phase 2 — Stripe cancellation recovery is too narrow ✅ DONE (unit-test verified; manual Stripe test-mode round trip still recommended before this reaches prod)
**Model: Sonnet · Effort: Medium**

`lib/admin.ts` `deleteAdminVenue` (~line 2440) only treats a Stripe cancel
failure as "already gone, proceed" when the error message matches
`/No such subscription|resource_missing/i`. If `billing_subscriptions.status`
is stale `'active'` (webhook lag) but Stripe has already moved the
subscription to a terminal `canceled` state, Stripe's cancel call fails with a
*different* error (not "no such subscription" — the object exists, it's just
already canceled), and that error doesn't match the regex → the venue becomes
permanently undeletable until someone manually fixes the local row.

- Fix: before calling `stripe.subscriptions.cancel()`, fetch the subscription
  (`stripe.subscriptions.retrieve()`) and check its `status`. If already
  `canceled`, skip the cancel call and treat it as already-cancelled. Keep the
  regex fallback for the true not-found case, but don't rely on it as the only
  signal for "already terminal."
- This needs an extra Stripe test-mode round trip to verify (create a sub,
  cancel it directly in Stripe, then run `deleteAdminVenue` and confirm it
  doesn't throw) — worth doing manually in Stripe test mode, not just unit
  tests with mocks, since the exact error shape matters.

## Phase 3 — Data-integrity / correctness polish ✅ DONE
**Model: Sonnet · Effort: Low**

Two independent small fixes, `lib/admin.ts` and `app/api/admin/route.ts`:

4. **Unchecked user-count error** (`lib/admin.ts` ~line 2408,
   `getAdminVenueDeletionSummary`). `userCountResult.error` is never checked;
   on failure `userCountResult.count` is `null` → reported as `0`, understating
   impact right before an irreversible delete.
   - Fix: check `userCountResult.error` alongside the other awaited results
     and throw (or surface a distinct "count unavailable" state in the
     summary) rather than silently showing 0.

5. **404 reported as 500** (`app/api/admin/route.ts` line ~288). When the
   venue was already deleted by someone else, `getAdminVenueDeletionSummary`
   throws `"Venue not found."`, which the route's outer catch turns into a
   generic 500.
   - Fix: either have `getAdminVenueDeletionSummary` return `null` for a
     missing venue and have the route respond 404, or special-case the error
     message in the route to map to a 404 status.

## Phase 4 — Optional perf cleanup ✅ DONE
**Model: Sonnet (or Haiku, it's mechanical) · Effort: Low**

6. **Sequential owner lookup** (`lib/admin.ts` ~line 2383,
   `getAdminVenueDeletionSummary`). The owner name/email lookup runs as a
   separate `await` after the initial `Promise.all`, adding a full extra
   round-trip for every partner-venue summary fetch.
   - Fix: fold it into the initial parallel batch via a Supabase embedded
     select on `venue_owner_venues` (`select("owner_id, venue_owners(name,
     email)")`) instead of a second query.

Skip this phase if you'd rather not touch working code for a minor latency
win — it's not a correctness issue.

## Suggested execution order
Phase 1 → Phase 2 → Phase 3 → Phase 4 (each phase leaves the code in a
working, testable state; run `npm run test`, `npx tsc --noEmit`, and
`npx eslint` on changed files after each phase). Update or add unit tests
alongside each fix, mirroring the existing `tests/admin.delete-venue.test.ts`
mock pattern for `lib/admin.ts` changes.

**Status: all 4 phases done in the working tree** (unit-test verified — 643
tests passing, `tsc`/`eslint` clean). One thing unit tests can't cover: the
exact error shape Stripe returns for an already-canceled subscription. That
needs the manual round trip below before this reaches real partner venues.

## Manual verification — Stripe test-mode round trip (Phase 2)

Why: Phase 2's fix (`lib/admin.ts` `deleteAdminVenue`) now calls
`stripe.subscriptions.retrieve()` before `.cancel()` and checks
`retrieved.status === "canceled"` to catch the webhook-lag case (local row
says `active`, Stripe already moved to `canceled`). The mocked unit tests
prove the *logic* is right, but they can't prove Stripe's real API actually
returns a `canceled` status object from `retrieve()` in this situation
instead of throwing — that assumption is what needs a live check.

Steps:

1. **Confirm you're in Stripe test mode.** In the Stripe Dashboard, the
   toggle in the top-right must say "Test mode" — never do this against
   live data. Locally, `.env.local` should already point `STRIPE_SECRET_KEY`
   at a `sk_test_...` key (do not open or edit `.env.local` yourself — ask
   if you're unsure which env it's pointed at).

2. **Create a throwaway test-mode subscription:**
   - Dashboard → Customers → Add customer (any test email).
   - Add a subscription to that customer using any test-mode price (create
     a throwaway product/price first if none exist yet — mark it OK to
     delete afterward).
   - Copy the resulting subscription id (`sub_...`).

3. **Wire it to a throwaway venue row** so `deleteAdminVenue` finds it:
   - In Supabase (test/staging project, not prod), insert a row into
     `billing_subscriptions` for a scratch venue id with
     `stripe_subscription_id` set to the `sub_...` id from step 2 and
     `status = 'active'`.
   - This reproduces the exact bug scenario: local DB says `active`, and in
     the next step Stripe will say otherwise.

4. **Cancel the subscription directly in Stripe** (Dashboard → the
   subscription → Cancel subscription — immediately, not at period end).
   This simulates the webhook-lag gap: Stripe is now `canceled` but the
   local `billing_subscriptions.status` row still says `active`.

5. **Run `deleteAdminVenue` against that venue id** and confirm it does
   *not* throw. Easiest from a local Node/tsx REPL against the same env:
   ```
   npx tsx -e "import('./lib/admin').then(m => m.deleteAdminVenue('YOUR_SCRATCH_VENUE_ID').then(r => console.log('OK', r)).catch(e => console.error('FAILED', e)))"
   ```
   Expect `OK { subscriptionCancelled: false }` — `false` because Stripe
   already had it canceled, so the code skips the redundant `.cancel()`
   call. If this throws instead, `retrieve()`'s real response shape doesn't
   match what the code checks for, and the Phase 2 fix needs adjusting
   before shipping.

6. **Clean up:** delete the scratch venue/billing rows you created (if the
   venue delete in step 5 didn't already cascade them), and delete the
   test-mode customer/subscription/product in Stripe. None of this touches
   live data since everything happened in test mode.
