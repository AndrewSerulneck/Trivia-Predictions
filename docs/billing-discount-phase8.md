# Phase 8 — Permanent custom price (negotiated rate)

Read `docs/billing-discounts-plan.md` first, specifically "The mechanisms
(they are not all the same thing)" section — this is NOT a discount/coupon,
it's a different Stripe Price swapped onto the subscription. Phases 1–4 should
already be done (this reuses the admin API/UI shape, not the coupon helpers).

## Why this is separate from every other phase in this plan
A partner locked in at $75/mo forever is not "$100 with $25 off" — modeling it
as a `forever` coupon would misreport their real rate on every invoice, in the
admin list, and on their own billing page, and would make a future list-price
change ambiguous (does the coupon still mean "$25 off" or should it track a
percentage?). The correct model is: they are simply on a different Price.

## What to build

1. Create a new Stripe **Price** for the negotiated rate (one-off, via the
   Stripe Dashboard or a small admin action — decide which; a full
   self-service "enter any dollar amount" admin UI is heavier than this
   feature likely needs, so a Dashboard-created price id pasted into a small
   admin form is a reasonable scope call unless told otherwise).
2. Swap it onto the subscription's existing item:
   `stripe.subscriptions.update(id, { items: [{ id: subscriptionItemId, price: newPriceId }], proration_behavior: ... })`.
   **Decide `proration_behavior` deliberately** — `"none"` means the new rate
   takes effect at the next billing cycle with no immediate credit/charge;
   `"create_prorations"` bills/credits the difference immediately. Default to
   `"none"` (take effect next cycle) unless the admin UI explicitly offers a
   choice, since silently prorating a negotiated deal could surprise the
   partner with an unexpected immediate charge or credit.
3. Update `amount_cents` on the `billing_subscriptions` row to the new rate so
   every surface (admin list, partner billing page, invoices display) reports
   the real number — this is the whole point of using a Price instead of a
   coupon.

## Tests
Unit-test the price-swap call includes the chosen `proration_behavior`
explicitly (never rely on Stripe's default, so the choice made above is
enforced in code, not just in a comment); confirm `amount_cents` is updated to
match the new price.
