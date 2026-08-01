# Phase 5 — Billing page UI: honest states + message precedence

Read `docs/billing-guard-hardening-plan.md` first. Phases 1, 2, 3, 4, and 6
should already be done — this phase makes the UI in `app/owner/billing/page.tsx`
match the server behavior those phases established.

## Part A — gate the Resume button correctly

Today the Resume button renders on `subscription.cancelAtPeriodEnd &&
!subscription.isManual` regardless of status. After Phase 4, the server
accepts resume for `active` and `past_due`, refuses for everything else. The
button's gating condition doesn't need to change (it was already correct for
"is there something to resume" — cancelAtPeriodEnd implies a live
subscription per Phase 1/2's own logic), but double check: a `cancelled` row
should never have `cancelAtPeriodEnd: true` in practice (nothing to schedule
against once truly dead) — if you find a code path that could produce that
combination, that's a bug to flag, not silently paper over.

## Part B — surface past_due honestly

`displayStatus()` currently collapses any `cancelAtPeriodEnd` row to look like
"Cancelled" in the badge, which hides a payment failure from the owner. When
`status === "past_due"`, the badge should say something like "Payment failed"
(there's already a `past_due` entry in `subStatus` styled as "Payment due" —
reuse it) rather than folding into the cancelled-looking display, regardless of
`cancelAtPeriodEnd`. Point the owner at the existing "Update" button
(Stripe Billing Portal) as the way to fix it — the Resume button, if also
present, only stops the cancellation clock and does not fix payment; both
being visible at once for a past_due+cancelAtPeriodEnd row is correct and
should not be hidden from each other.

## Part C — message precedence bug

`actionMessage` (set by `handleCancel`/`handleResume`) only renders when the
URL-derived `banner` (from `?success=`/`?error=` search params) is falsy —
see the `banner ? ... : actionMessage ? ...` ternary. Nothing clears those
search params after they've been shown once. Concretely: an owner lands on
`/owner/billing?error=incomplete` (from a failed Checkout redirect), then
clicks Resume — the resume's own success or failure message is silently
swallowed by the stale `error=incomplete` banner still being present in the
URL.

Fix: prefer a fresh `actionMessage` over the stale URL banner (flip the
ternary order, or explicitly clear the message once one is set), and clear the
search params (`router.replace("/owner/billing", { scroll: false })` or
equivalent) once the banner has been shown/dismissed, so a stale param can't
resurface after a later action.

## Verify at mobile widths
The subscription card just had an overflow bug fixed (oversized badge/button
font sizes causing clipping at 320–375px). Any markup changes in this phase
must be re-checked at 320px — take a screenshot, don't just eyeball the code.
