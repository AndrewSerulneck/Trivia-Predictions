# Subscription discounts & free months — plan

Give partners discounts, free months, or a negotiated permanent rate.

> **Depends on `docs/billing-guard-hardening-plan.md` Phases 1–4.** Do not start
> this before those land. Discounts sit directly on top of the guards being
> rewritten there, and a discounted subscription makes the existing
> `status === "active"` assumptions worse, not better (see "Interactions").

## Decisions taken (Andrew, 2026-07-31)
- **Both** admin-granted discounts **and** partner-redeemable promo codes.
- All four types: N free months, percent off, fixed dollar off, permanent custom price.
- Must work for **existing** subscribers as well as new signups.

## The mechanisms (they are not all the same thing)

Three of the four are Stripe **Coupons**; the fourth is not a discount at all.

| What you want | Stripe primitive |
|---|---|
| N free months | Coupon `percent_off: 100`, `duration: repeating`, `duration_in_months: N` |
| Percent off | Coupon `percent_off: X`, `duration: once \| repeating \| forever` |
| Fixed dollar off | Coupon `amount_off: X`, `currency: usd`, same duration options |
| **Permanent custom price** | **Not a coupon** — a new Stripe **Price** swapped onto the subscription item |

That last row is the one to keep separate. A partner locked in at $75/mo forever
isn't discounted, they're on a different price — it renews at $75 with no
expiry, shows as $75 (not "$100 less $25") on every invoice, and survives coupon
changes. Modeling it as a `forever` coupon would work but would misreport the
real rate everywhere and make future price changes ambiguous. It gets its own
phase and its own mechanism.

A **Promotion Code** is a customer-facing code (`LAUNCH50`) wrapping a coupon,
with optional `max_redemptions` / `expires_at`. Coupons are the underlying
discount; promo codes are how a partner self-serves one.

### The offline/check-billed carve-out
Offline rows have **no Stripe objects at all**, so they cannot take a coupon —
exactly like the resume carve-out in the previous plan. For those, a discount
means adjusting our own row: free months push `current_period_end` forward;
percent/fixed off adjusts `amount_cents` for the admin's own invoicing. This
must be explicit in the helper, or granting a discount to a check-paying partner
will either crash or silently no-op.

## Interactions with the hardening plan
- A 100%-off coupon produces **$0 invoices**. `invoice.paid` still fires with
  `amount_paid: 0`, so `recordInvoice` records a $0 row — check that the
  Invoices list renders that sensibly rather than looking like a bug.
- Stripe `trialing` already folds into our `active` via
  `mapStripeSubscriptionStatus`, so trial-based free months would be invisible
  in our status. Another reason to prefer coupons over `trial_end`.
- A discounted subscription is still **one live subscription** — it must keep
  hitting the hardened "live at Stripe" guard, never the Checkout path.

---

## Phases

### Phase 1 — Schema: mirror + audit trail
Two pieces, one migration:
1. **Active-discount mirror** on `billing_subscriptions` (`stripe_coupon_id`,
   `discount_label`, `discount_percent_off`, `discount_amount_off_cents`,
   `discount_ends_at`) so the admin list and partner billing page can render the
   current discount without a Stripe call per row. Stripe stays authoritative;
   this is a mirror, same convention as `cancel_at_period_end`.
2. **`billing_discount_grants`** audit table — who granted what to whom, when,
   and why. Discounts are money given away; you will want the paper trail, and
   the mirror alone can't provide it (it only holds the *current* state).

> **Model/effort: Sonnet 5, low-medium.** New migration file (allowed — only
> editing historical ones is forbidden). No behavior yet.

### Phase 2 — `lib/billingDiscounts.ts`: the Stripe helpers
Server-only module beside `lib/billing.ts`, following its `CancelResult`
shape (`{ok:true} | {ok:false, status, error}`) so routes stay uniform:
- `createOrReuseCoupon(spec)` — reuse an equivalent existing coupon rather than
  minting a duplicate per grant.
- `applyDiscountToSubscription(row, spec)` — attach to the live Stripe
  subscription; **offline rows take the local-adjustment path instead**.
- `removeDiscountFromSubscription(row)`.

**SDK shape — resolved by checking the installed package directly:** this repo
pins `"stripe": "^22.3.1"` (`package.json`), and its own type definitions
(`node_modules/stripe/esm/resources/Subscriptions.d.ts`) only define the newer
`discounts: [{ coupon: string }]` array param on subscription create/update —
the older single-field `coupon:` param is gone entirely in this version. So
`applyDiscountToSubscription` should be written as
`stripe.subscriptions.update(id, { discounts: [{ coupon: couponId }] })` with
no ambiguity to resolve at implementation time.

> **Model/effort: Opus 5, medium.** Money-mutating Stripe calls, an SDK-shape
> unknown, and the offline carve-out. Verify against test mode as you go.

### Phase 3 — Admin API actions
Extend the existing `action` dispatch in `app/api/admin/billing/route.ts`
(already handles `revoke` / `grant-manual`) with `apply-discount` and
`remove-discount`. Validate the spec server-side — reject `percent_off > 100`,
negative amounts, `repeating` with no `duration_in_months`. Write the
`billing_discount_grants` row in the same request.

> **Model/effort: Sonnet 5, medium.** Route plumbing over a helper that already
> encapsulates the risk, but input validation here is what stops a fat-fingered
> "1000% off".

### Phase 4 — Admin UI
Add a "Discount" control to each partner row in
`components/admin/sections/BillingSection.tsx`, next to Grant/Revoke. Needs a
small form (type → value → duration → reason) and must show any **active**
discount with a Remove affordance. Reuse the section's existing notice/confirm
patterns rather than inventing new ones.

> **Model/effort: Sonnet 5, medium.** Mostly forms, but four discount types ×
> three durations is a real state matrix — keep the form honest about which
> combinations are legal.

### Phase 5 — Partner-facing display
Show the discount on `/owner/billing`: what it is, what they actually pay, and
when it ends. A partner seeing "$100/mo" while being charged $0 will file a
support ticket. Touches the same card just fixed for mobile overflow — re-check
at 320px.

> **Model/effort: Sonnet 5, low-medium.** Presentational, one new state.

### Phase 6 — Webhook sync
Sync discount state in `app/api/webhooks/stripe/route.ts` on
`customer.subscription.updated` (and `customer.discount.*` if used) so the
mirror self-corrects when a discount expires, is removed in the Stripe
Dashboard, or lapses on its own. **Without this the mirror silently rots** —
a `duration_in_months: 3` coupon expires at Stripe with no action on our side,
and our row would advertise a discount that no longer exists.

> **Model/effort: Opus 5, medium.** Event-shape reasoning and the expiry path is
> easy to miss; this is what keeps the whole feature honest over time.

### Phase 7 — Promotion codes for new signups
- `allow_promotion_codes: true` on the Checkout session in
  `app/api/owner/billing/checkout/route.ts` — this alone unlocks partner-entered
  codes at signup and is nearly free.
- Admin surface to create/list/deactivate promo codes (`max_redemptions`,
  `expires_at`) and see redemptions.

> **Model/effort: Sonnet 5, medium.** The Checkout flag is trivial; the
> management UI is the bulk. Splittable — ship the flag early if you want codes
> working before the admin screen exists.

### Phase 8 — Permanent custom price
Distinct mechanism: create a Stripe Price for the negotiated rate, swap it onto
the subscription item (`items: [{ id, price }]`, with an explicit
`proration_behavior` decision), and update `amount_cents` on our row so every
surface reports the real rate. Decide deliberately whether the change takes
effect immediately with proration or at the next period.

**As of 2026-08-06:** This phase is now superseded by `docs/billing-dollar-rate-plan.md`,
which implements the same feature with a dollars-first UI (admin types a whole
dollar amount rather than pasting a Stripe Price ID). That plan's Phases 1–7 are
complete and verified end-to-end in real Stripe test mode. Use `setCustomPrice`
from `lib/billingCustomPrice.ts` (the helper that originated here) with either
`{ amountDollars }` (new, primary path via dollars-first UI in `BillingSection.tsx`)
or `{ priceId }` (escape hatch for non-round legacy rates). Do not re-implement
this phase; the implementation is already live.

> **Model/effort: Opus 5, medium.** (Historical — implementation complete in
> the newer dollar-rate track.) Proration is real money and the wrong choice
> silently over- or under-charges. Independent of Phases 2–7 — could be deferred
> entirely if negotiated rates are rare.

### Phase 9 — Tests
Extend the existing billing test files rather than starting new ones:
- Unit: each discount type → correct coupon spec; `percent_off > 100` and
  malformed durations rejected; offline rows take the local path and **never**
  call Stripe.
- Route: `apply-discount` / `remove-discount` incl. admin-auth enforcement.
- Regression: a discounted subscription still trips the hardened "live at
  Stripe" guard and cannot reach Checkout.
- Webhook: discount expiry clears the mirror.

> **Model/effort: Sonnet 5, medium.** Mocking patterns already established in
> `tests/lib.billing.*` and `tests/api.admin.billing-*`.

### Phase 10 — Live verification
Same recipe and the same warning as before: **`.env.local`'s
`STRIPE_SECRET_KEY` is LIVE** — override it with the Stripe CLI's test key
(`~/.config/stripe/config.toml` → `test_mode_api_key`). Verify a real test-mode
subscription with a 100%-off 2-month coupon: invoice actually $0, discount shown
to admin and partner, expiry syncs the mirror back. Then a percent-off on an
existing subscription. Clean up all seeded Supabase rows and Stripe test objects.

> **Model/effort: Opus 5, medium.** Browser plus cross-system reconciliation.

---

## Suggested order
**1 → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9 → 10** (2026-07-31: Andrew asked for 7 and
8 included in the automated run — `docs/billing-run-phases.sh` executes all
ten in this order). Phase 6 before 5 so the partner-facing display is never
showing state that can rot; 7 and 8 run after the core discount phases (1-6)
but before the final test/verify pass (9, 10) so those exercise promo codes
and custom pricing too, not just the core discount types. 7 and 8 remain
logically independent of 1-6 if you ever need to drop either back out.

**Minimum useful slice, if run by hand instead of the full script:** Phases
1–4 + 6 gets you admin-granted discounts and free months on existing
subscriptions, correctly synced — which covers retention saves and negotiated
deals, the likeliest real use.

## Open questions for later
- Should a discount be grantable at the moment of a **retention save** — i.e. an
  "offer a free month instead" step in the cancel flow? That is where discounts
  usually earn their keep, and it would touch `handleCancel` on the partner
  billing page.
- Do stacked discounts need to be prevented? Stripe allows only one coupon per
  subscription at a time, so applying a second silently replaces the first —
  confirm the admin UI makes that obvious rather than looking like it stacked.
