# Phase 6 — Setup page redirect guard

Read `docs/billing-guard-hardening-plan.md` first. Phase 1
(`classifyBillingRow`) must already exist. (Numbered 6 to match the master
plan's phase numbering; run this before Phase 5 per the plan's suggested
order — it is independent of Phase 5's UI work.)

## The problem

`app/owner/billing/setup/page.tsx` around line 35 redirects to the dashboard
on `status === "active" && !cancelAtPeriodEnd` — the same blind spot as the
checkout route had before Phase 2. A `past_due` owner (still technically not
redirected today, since `past_due !== "active"`) instead reaches the Subscribe
button and gets a 409 from the checkout route they have no way to act on,
since this page has no path to the billing portal.

## What to build

The `GET /api/owner/billing` response's `subscriptions[]` entries already
include `status` and `cancelAtPeriodEnd` (see `app/api/owner/billing/route.ts`
if you need to confirm the exact shape) — no API change needed. Update the
redirect/routing logic in `app/owner/billing/setup/page.tsx`:

- Genuinely not live (`cancelled` or no subscription row) → show the existing
  Subscribe UI, unchanged.
- Live and not scheduled to cancel (`active`, not `cancelAtPeriodEnd`) → redirect
  to the dashboard, unchanged (this is the existing correct case).
- Live and scheduled to cancel (`active` or `past_due` + `cancelAtPeriodEnd`) →
  redirect to `/owner/billing` instead of the dashboard — that's the resume
  path, and it now works for both statuses (Phase 4).
- Live and past_due, NOT scheduled to cancel → redirect to `/owner/billing`
  as well (their card is failing on their existing subscription; sending them
  through Checkout would duplicate it — Phase 2/3 will refuse it anyway, but
  the redirect here should route them somewhere actionable rather than let
  them hit that dead end).

You do not need to duplicate `classifyBillingRow` client-side — this is a
simple, small conditional on the two fields already in the response; keep it
readable rather than importing server-only code into a client component.

## Tests
No dedicated test file exists for this page today. A lightweight test is
optional; prioritize correctness of the four-way branch above over adding new
test infrastructure for a client component.
