# Phase 5 — Mobile Game Settings + Partner Billing

The other two allowlisted mobile sections. Follow the conventions Phase 3
established and Phase 4 exercised (read the run log first).

## A. Kill the horizontal-scroll tables

`VenuesSection.tsx:461` and `:1346` are `overflow-x-auto` `<table>`s whose
action buttons sit in the rightmost column — off-screen on a phone, which is
the single worst pattern on this surface.

At mobile widths render a **card list**; keep the existing table at `md:` and
up. Each card: venue name, city, status badge, and a tap target opening a
detail sheet containing the actions currently stranded in the right-hand
column. Apply the same treatment to Game Settings and Partner Billing wherever
they use the same pattern.

## B. Partner Billing grant modal → bottom sheet

`BillingSection.tsx:619` is a centered modal. Convert to a bottom sheet on
mobile.

**This is a layout change, not a logic change.** The billing state machine is
subtle and expensive to get wrong. Preserve exactly:
- manual/offline vs Stripe vs force-cancel branching, including the guard that
  disables "Grant offline" for a live Stripe subscription
- the `billing_subscriptions` invariant: **a row means a partner who PAID**;
  unfinished signups leave no trace, so `past_due` means only "a subscriber's
  card failed"
- all existing confirmation steps. Do not make a destructive or financial
  action easier to trigger by accident on a touch screen than it is today.

Do not touch Stripe config or `vercel.json`.

## Verify
`npm run build`, `npx tsc --noEmit`, `npm test`. Confirm at phone width that no
action is reachable on desktop but unreachable on mobile. Confirm the billing
guards still behave identically.
