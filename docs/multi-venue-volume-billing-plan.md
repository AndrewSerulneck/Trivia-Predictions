# Multi-Venue Volume Billing Plan — "Add a venue" + Graduated Volume Discount

**Status:** Phase 1 (foundation) **built and tested locally on 2026-10-11 — not committed, not
pushed, migration not applied** (Andrew approves `supabase db push`). Handoff for Phase 2:
**`docs/multi-venue-volume-billing-plan_PHASE_1_HANDOFF.md`**. Andrew's answers to all nine
questions are in §2 (do not re-ask). **Next: Phase 2.** Each phase ends with a handoff note
`docs/multi-venue-volume-billing-plan_PHASE_<N>_HANDOFF.md`; update this status line to point at
the latest one.

---

## 1. What we're building (plain English)

A partner who owns several bars can tap the venue name at the top of the Partner Dashboard,
choose **"+ Add a venue"**, enter the new location's name, address and map area, see what it
will cost, and confirm. The card they already pay with is charged for the rest of the current
month, and the venue goes live for players straight away. Every venue sits on **one monthly
bill**, and each extra venue costs less as the chain grows:

| Venue number | Price per venue / month | Discount vs $100 |
|---|---|---|
| 1st (anchor) | $100 | — |
| 2nd – 5th | $75 | 25% |
| 6th – 15th | $60 | 40% |
| 16th and up | $45 | 55% (Enterprise) |

It is **graduated**: each band is priced on its own, so a partner never pays more in total for
adding a venue. Monthly totals:

| Venues | 1 | 2 | 3 | 5 | 6 | 10 | 15 | 16 | 20 | 30 |
|---|---|---|---|---|---|---|---|---|---|---|
| Monthly total | $100 | $175 | $250 | $400 | $460 | $700 | $1,000 | $1,045 | $1,225 | $1,675 |

Stripe supports this natively ("graduated tiered price" + a quantity = number of venues), so
Stripe does the math on every invoice and we never hand-compute a bill.

---

## 2. Andrew's decisions (do not re-ask)

| # | Question | Answer (2026-10-11) |
|---|---|---|
| 1 | When does an added venue get paid for? | **Charge now, prorated.** The card on file is charged immediately for the rest of the current month; the venue goes live **only after that charge succeeds**. |
| 2 | Removing a venue | **Self-serve, end of month.** Partner taps Remove; the venue stays live until the paid month ends, then drops off and the bill shrinks. No refunds, no credits. |
| 3 | Promo codes / admin discounts on a multi-venue bill | **Whole bill.** A coupon discounts the total for every venue (Stripe's default). |
| 4 | Enterprise (16+) | **Self-serve, no cap.** |
| 5 | Prices | The four bands above, monthly, USD. |
| 6 | Negotiated custom rate on a chain (was §9 Q1) | **Coupons apply on top of the bands, and admins must always be able to adjust what a subscription costs** — on a 1-venue or a multi-venue bill. Not "(c) not allowed". Phase 6 designs the mechanism (see the Phase 1 handoff §7). |
| 7 | Admin adding a 2nd venue for an existing partner (was §9 Q2) | **Offer both** "Add to their bill" and "Free / comped". |
| 8 | Added venue goes live to players (was §9 Q3) | **Yes — the moment payment succeeds.** No admin check. |
| 9 | Confirmation email (was §9 Q4) | **Send our own "Venue added" email via Resend** as well as Stripe's receipt. Andrew also wants to perfect the new-subscriber welcome email and the venue-added email himself: **all wording now lives in `lib/email/partnerEmailCopy.ts`** (Phase 1), previewed with `npm run email:preview`. |
| 10 | Overhill and Garden State (was §9 Q5) | **Overhill is a test location** — leave it. **Garden State pays by check and must stay subscribed and active** — a rare exception granted to an early customer. NB: production shows its offline grant **expired on 2026-08-25** (the daily cron set it `cancelled` on 2026-08-26) — see the Phase 1 handoff §7; needs Andrew's re-grant. |

Defaults chosen by the planner (Andrew may overrule any of these — see §9):

- **Feature flag** `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED`, off by default, single reader
  `isMultiVenueBillingEnabled()` in `lib/multiVenueBilling.ts` — same reversible convention as
  `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`. Off = no "Add a venue" row, the add/remove routes
  404. The behaviour-preserving groundwork (Phases 1–2) is **not** flag-gated.
- **Self-serve signup stays one venue per email.** A partner's 2nd+ venue is added from the
  dashboard, never by running signup again.
- **A partner can add a venue only while their bill is healthy**: an active card subscription,
  not `past_due`, not scheduled to cancel, not offline/check-billed. Otherwise the menu row
  explains why and links to Billing.
- **Price shown before confirming**: "This venue: $75/mo · New monthly total: $175 · Charged
  today: $37.50 (rest of this month)". The "today" figure comes from Stripe's own preview, not
  our math.

---

## 3. How billing works today (facts the phases rely on)

Measured / read 2026-10-11.

- **One Stripe subscription per venue.** `billing_subscriptions.venue_id` is `UNIQUE NOT NULL`
  (`supabase/migrations/20260627100000_venue_owner_billing.sql`). Checkout
  (`app/api/owner/billing/checkout/route.ts`) creates `line_items: [{ price, quantity: 1 }]` and
  puts `venueId`/`ownerId` in subscription metadata. The webhook
  (`app/api/webhooks/stripe/route.ts`, `upsertSubscription`) finds the row by
  `metadata.venueId`.
- **Flat price:** `STRIPE_PRICE_ID` (one $100/mo price), read only by `getStripePriceId()` in
  `lib/stripe.ts`.
- **`amount_cents` is copied from `price.unit_amount`** in the webhook. **A tiered price has
  `unit_amount = null`**, so without a fix every subscriber would show $0. (Trap — Phase 1.)
- **Venue ↔ owner** is `venue_owner_venues` (many venues per owner already supported).
  `requireOwnerAuth` returns `auth.venueIds`; the dashboard switcher
  (`app/owner/dashboard/page.tsx`, `venueSwitcher`) uses the shared
  `components/ui/Dropdown.tsx` and **only renders a dropdown when there are 2+ venues** — a
  1-venue partner sees plain text today, so "Add a venue" needs the dropdown always on.
- **Billing does not gate the dashboard or gameplay.** It only drives venue **visibility**
  (`venues.hidden` reveal / re-hide via `lib/venueVisibility.ts`, `maybeRevealVenue` /
  `maybeRehideVenue` in the webhook, and the daily repair in `lib/venueVisibilitySync.ts`).
- **Existing money tools that must keep working:**
  - Coupons / promo codes / admin discounts — `lib/billingDiscounts.ts` (subscription-level, so
    "whole bill" is automatic).
  - Negotiated custom rate — `lib/billingCustomPrice.ts` swaps the subscription item's Price
    (lookup key `custom_monthly_<cents>`, `proration_behavior: "none"`).
  - Offline / check billing — `billing_method = 'offline'`, no Stripe objects, admin-granted.
- **Everything that reads `billing_subscriptions` by venue** (21 files, 77 references):
  `app/api/admin/billing`, `app/api/cron/billing`, `app/api/owner/billing/{,checkout,portal,subscription}`,
  the Stripe webhook, `lib/admin.ts`, `lib/billing*.ts`, `lib/email/sendWelcomeEmail.ts`,
  `lib/pendingSignup.ts`, `lib/signupSweep.ts`, `lib/stripeIncomplete.ts`,
  `lib/venueVisibility.ts`, `lib/venueVisibilitySync.ts`, `scripts/phase1-audit.mjs`,
  `scripts/purge-pending-signup.cjs`.
- **Production today:** 4 partner accounts; 2 live card subscriptions (Pacific Street, Carrabba's,
  both $100, no discount, no custom price); 1 offline row (Garden State — pays by check, Andrew
  wants it active; the row reads `cancelled` because its paid-through date 2026-08-25 lapsed); 1
  venue with no subscription (Overhill — Andrew's test location). One owner has 2 venues: Pacific Street + `venue-hightop-test`
  (the hidden Square test venue — **must never be billed**, which is why venues join a bill
  explicitly rather than "every venue the owner has").

---

## 4. Design

### 4.1 Stripe: one graduated price, quantity = venues on the bill

One recurring monthly Price, `billing_scheme: "tiered"`, `tiers_mode: "graduated"`:

```
up_to 1   → 10000
up_to 5   →  7500
up_to 15  →  6000
up_to inf →  4500
```

Created once by a script with `lookup_key: "hightop_venue_graduated_monthly_v1"` (idempotent:
re-running finds it). A future price change = a **new** lookup key (`_v2`) and a deliberate
migration — never edit tiers in place (Stripe doesn't allow it anyway).

- **Add a venue** → `subscriptions.update(id, { items: [{ id: itemId, quantity: n + 1 }],
  proration_behavior: "always_invoice", payment_behavior: "pending_if_incomplete" })`.
  `pending_if_incomplete` means Stripe applies the new quantity **only if the prorated invoice
  is paid** — exactly decision #1. Stripe prorates the *difference in total*, i.e. the marginal
  band price for the rest of the month.
- **Remove a venue** → `quantity: n − 1` with `proration_behavior: "none"`: no credit, and the
  next renewal bills the smaller number — exactly decision #2. Our side keeps the venue live
  until `current_period_end`, then hides it.
- **Coupons** stay subscription-level → whole bill (decision #3). Nothing to build.

### 4.2 Data model: explicit "venues on this bill"

New table **`billing_subscription_venues`** (Phase 1 migration; grants per
`supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` — `service_role` only):

| column | notes |
|---|---|
| `id uuid pk` | |
| `subscription_id uuid` → `billing_subscriptions(id)` **ON DELETE RESTRICT** | never cascade-delete billing history |
| `venue_id text` → `venues(id)` ON DELETE CASCADE, **UNIQUE** | a venue is on at most one bill |
| `role text` `'anchor' \| 'added' \| 'admin'` | provenance |
| `added_at timestamptz` | |
| `remove_at timestamptz null` | set by Remove = the period end it stops |
| `removed_at timestamptz null` | set when the cron actually takes it off |

Backfilled with one `anchor` row per existing `billing_subscriptions` row.
`billing_subscriptions.venue_id` **stays** (NOT NULL UNIQUE, unchanged) and means "the anchor
venue". No risky constraint change on a money table.

A second table, **`billing_venue_additions`**, is the ledger for each add attempt — inserted
**before** the Stripe call with a UNIQUE `idempotency_key` (same pattern as
`pos_reward_applications`): `status 'pending' | 'paid' | 'failed' | 'requires_action'`,
`stripe_invoice_id`, `venue_id`, `subscription_id`, `quantity_before/after`. This is what
lets a retry, a double-tap, or a webhook arriving first all converge on one outcome.

**One home for "which bill covers this venue?"** — `lib/venueBilling.ts`:
`loadBillingForVenues(venueIds)` → `Map<venueId, subscriptionRow>` via the new table, and
`billedVenueCount(subscriptionId)`. Every reader listed in §3 moves to it; a contract test
fails on any new `.from("billing_subscriptions")…eq("venue_id", …)` outside that file and the
webhook's anchor write.

**One home for prices** — `lib/venuePricing.ts`: the tier constant, `monthlyTotalCents(n)`,
`nextVenuePriceCents(n)`, `tierBreakdown(n)`. Integer cents. The Stripe-price script reads the
same constant, and a test asserts the live Price's tiers equal it.

### 4.3 Add-a-venue flow (server)

`POST /api/owner/venues/add` (flag, `requireOwnerAuth`, `rateLimit()`):

1. Load the owner's bill; refuse unless healthy (§2).
2. Validate name / address / geofence with the **same** validators and `lib/venueClaim.ts`
   predicates signup uses (duplicate-address check via `findNearbyVenue`, `(0,0)` refusal,
   admin-hidden refusal). No re-derived predicates.
3. Claim the add under a Postgres advisory lock per subscription (RPC
   `claim_venue_addition`, count-guarded like `award_cycle_winner`) → ledger row `pending`,
   so two simultaneous adds can't both read quantity n and both set n + 1.
4. Create the venue **hidden** + `venue_owner_venues` link.
5. Stripe quantity update (§4.1), Stripe idempotency key = ledger key.
6. **Paid** → membership row (`role 'added'`), unhide the venue (clear `rehidden_at` in the
   same write — standing rule), ledger `paid`, return the new venue id.
   **Declined** → delete the venue + link we just created, ledger `failed`, show "Your card was
   declined — update it in Billing".
   **Needs 3-D Secure** → ledger `requires_action`, return Stripe's hosted invoice link; the
   `invoice.paid` webhook finishes step 6. The hidden venue is stamped so the existing signup
   sweep clears it if never paid.

`GET /api/owner/venues/add/quote` → `{ venueNumber, thisVenueCents, newMonthlyTotalCents,
dueTodayCents }` using `stripe.invoices.createPreview` with the proposed quantity.

### 4.4 Removal (end of month)

`POST /api/owner/venues/remove` → Stripe quantity − 1 (`proration_behavior: "none"`), set
`remove_at = current_period_end`. "Undo" before then = quantity + 1, also no proration.
The existing daily `/api/cron/billing` hides venues whose `remove_at` has passed (one bounded
read) and stamps `removed_at`. The venue stays in the partner's dropdown marked "Not on your
bill" with "Add back" (which runs the normal add flow).

- **Last venue on the bill** → no Remove; the Billing page's existing Cancel is the path.
- **Removing the anchor venue** → re-anchor: point `billing_subscriptions.venue_id` and the
  Stripe metadata at another covered venue in the same transaction. Otherwise a later delete of
  that venue would cascade-delete the whole chain's subscription row (see §7, trap 2).

### 4.5 Partner UI

- Venue name is **always** a dropdown (even with one venue). `Dropdown` gets one optional
  `footerAction` prop (it has 8 call sites; the others are unaffected).
- Footer row "+ Add a venue" opens an `OwnerSheet` at `?sheet=add-venue&step=…` (URL-mirrored,
  `DiscardGuard`, `scrollKey`), steps: **Name → Address → Map area → Review & pay**, reusing
  `components/signup/steps/AddressStep.tsx` and `GeofenceStep.tsx`.
- Review shows the quote (§2). Confirm → loader → success switches the dashboard to the new
  venue and shows a `DashboardToast`.
- **Billing page** (`app/owner/billing/page.tsx`) becomes an account view: venues on the bill,
  the band breakdown ("1 × $100 · 3 × $75 = $325/mo"), discount, next bill date, per-venue
  Remove / Undo.
- Partner-facing copy (Partner Manual, any "$100/mo" text) updated in the release phase.

---

## 5. Phases

Model rule (Andrew): **never more capable than Opus 5.5.** "Effort" = Claude Code reasoning level.

| Phase | What | Model | Effort | Size |
|---|---|---|---|---|
| 1 | Foundation: pricing module, new tables, one billing resolver, every reader moved, webhook computes `amount_cents` from quantity × tiers. **No visible change.** | **Opus 5.5** | **high** | 2 sessions |
| 2 | Graduated Stripe price created; new signups and the 2 live subscribers moved onto it (still $100 at 1 venue) | **Opus 5.5** | **high** | 1 session + Andrew approves the live swap |
| 3 | Add-a-venue backend: quote + add routes, ledger, advisory-lock RPC, Stripe prorated charge, decline / 3-D Secure / webhook completion | **Opus 5.5** | **xhigh** | 2 sessions |
| 4 | Add-a-venue UI: always-on dropdown, "+ Add a venue", the sheet, review & pay, success | Sonnet 5.5 | high | 1–2 sessions |
| 5 | Remove at end of month + Billing page as an account view + re-anchoring + cron | **Opus 5.5** | high | 1–2 sessions |
| 6 | Admin & edge tools: admin sees venue count/band, admin "add to existing owner's bill", offline multi-venue amounts, custom-rate semantics, daily Stripe-vs-DB quantity check | **Opus 5.5** | high | 1–2 sessions |
| 7 | Release: copy, device checklist, flag on, Andrew's live test on Pacific Street + a real second venue | Sonnet 5.5 (+ Andrew) | medium | 1 session + Andrew's test |

Order is strict: 1 → 2 → 3 → 4 → 5 → 6 → 7. Phases 4 and 5 could swap if Andrew wants removal
before the UI polish, but 3 must precede both.

### Phase 1 — Foundation (Opus 5.5, high) — ✅ built 2026-10-11 (handoff: `…_PHASE_1_HANDOFF.md`)

As built, beyond the bullets below: the resolver is `lib/venueBilling.ts`
(`loadBillingForVenue(s)`, `venueIdsEverBilled`, `venueIdsOnBill`, `billedVenueCount`); an
`AFTER INSERT` trigger gives every new bill its anchor row; reads fall back to anchor-only while
the table is missing (deploy-skew safe); admin per-venue billing actions and the admin venue
delete refuse a venue that is not its bill's anchor; partner email wording moved to
`lib/email/partnerEmailCopy.ts` and the "Venue added" email is built (not yet sent — Phase 3).

Goal: the database and code understand "many venues on one bill" while every bill still has
exactly one venue. Zero behaviour change, zero Stripe change.

- `lib/venuePricing.ts` + tests (every row of §1's tables, band edges 1/2/5/6/15/16, n = 0
  refused, large n).
- Migration (`supabase migration new multi_venue_billing`): `billing_subscription_venues`,
  `billing_venue_additions`, backfill anchors, grants, RLS on, `ON DELETE RESTRICT` on the
  subscription FK. **Do not `supabase db push`** — Andrew approves the push.
- `lib/venueBilling.ts` resolver; move all 21 readers (§3) to it. Pay special attention to the
  four places where a wrong answer deletes or exposes something: `lib/pendingSignup.ts`
  clause (3), `sweepAbandonedSignupVenues`, `classifyOwnerForSweep`, and the venue-visibility
  reveal/rehide/restore jobs. Each must treat "covered by a bill via the new table" as "has
  billing".
- Webhook: find the row by `stripe_subscription_id` first (unique index exists), fall back to
  `metadata.venueId`; compute `amount_cents` = `monthlyTotalCents(quantity)` for a tiered
  price, `unit_amount × quantity` for a flat one; write a `quantity` mirror column.
- Contract test: no stray venue-keyed `billing_subscriptions` reads.
- Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`, plus
  `tests/lib.auth-users-fk-guard.test.ts` unchanged and `npm run test:account-deletion-sql`
  (a new `users`/`venues` FK must not break account deletion).

### Phase 2 — The graduated price, live (Opus 5.5, high)

- `scripts/create-graduated-price.cjs` (dry-run default, `--apply`): finds-or-creates the
  Price by lookup key; prints its id.
- Add `STRIPE_GRADUATED_PRICE_ID` (env append + `vercel env add`; redeploy). Checkout uses it
  when set, else falls back to `STRIPE_PRICE_ID` — so the deploy order can't break signup.
- `scripts/migrate-subscriptions-to-graduated.cjs` (dry-run default): swaps each live card
  subscription's item to the graduated Price, quantity 1, `proration_behavior: "none"`; skips
  offline rows and any custom-rate row (reports them). Today that is 2 subscriptions.
- Verify on the next webhook that both mirrors still read $100 and the Billing page is
  unchanged. Andrew runs `--apply` or approves it explicitly.

### Phase 3 — Add-a-venue backend (Opus 5.5, xhigh)

Everything in §4.3. Tests with a mocked Stripe for: paid, declined, 3-D Secure → webhook
completes, webhook arrives before the route returns, double-tap (same idempotency key),
two different adds at once (lock), unhealthy bill refused, offline bill refused, duplicate
address refused, `(0,0)` refused, flag off → 404. Ledger rows must never leave a hidden venue
both unpaid and un-sweepable.

### Phase 4 — Add-a-venue UI (Sonnet 5.5, high)

Everything in §4.5 except the Billing page. Follow the `/owner/*` rules in `CLAUDE.md`
(OwnerSheet, `pushSheet` not `router.push`, DiscardGuard, light-surface rules if the sheet is
white, 12px text floor, `HightopLoader`). Add `useNativeBackHandler` only if the sheet becomes
reachable in the app — it should not be (`/owner` is web-only).

### Phase 5 — Removal + Billing account view (Opus 5.5, high)

Everything in §4.4 + the Billing page part of §4.5. The cron change lives in the existing
`/api/cron/billing` — **no new `vercel.json` entry**.

### Phase 6 — Admin and edge cases (Opus 5.5, high)

- Admin billing list: venue count, band, monthly total per account.
- Activate-a-Venue for an **existing** owner: option "Add to their bill" (runs the Phase 3
  server function, charges their card) vs "Free / comped" (link only, not on any bill).
- Offline (check-billed) accounts with several venues: the admin grant form shows the
  graduated total as the suggested amount; admin attaches venues to the offline bill.
- Custom negotiated rate (`lib/billingCustomPrice.ts`) on a multi-venue bill — implement
  whatever Andrew picks in §9 Q1.
- Daily check inside `/api/cron/billing`: Stripe quantity vs. count of active membership rows
  (one bounded Stripe list call per run). **Report-only** (`[MultiVenueBilling] quantity-drift`);
  an admin fixes drift, the cron never charges or credits anyone.

### Phase 7 — Release (Sonnet 5.5 medium, + Andrew)

Partner Manual + any price copy; `docs/multi-venue-billing-device-checklist.md`; set the flag in
Vercel + redeploy; Andrew adds a real second venue to his own account and removes it, watching
the Stripe invoice and the Billing page.

---

## 6. Cost estimate (per the cost-conscious rule)

- Stripe calls happen only when a partner adds or removes a venue (≈ 2–4 calls each) — rare
  events, not per player or per game.
- Daily cron adds one bounded DB read (venues past `remove_at`) and one Stripe list call for the
  drift check. At 10× today's partners that is still one call per day.
- No new cron job, no polling, no per-request Stripe call on the dashboard (the quote is
  fetched only when the Review step opens).
- Net recurring cost: effectively zero. Stripe's own fees scale with revenue as today.

---

## 7. Traps already found (read before Phase 1)

1. **`price.unit_amount` is null on a tiered price** → webhook would mirror `$0`. Fixed in Phase 1.
2. **`billing_subscriptions.venue_id` is `ON DELETE CASCADE`.** Deleting the anchor venue would
   delete the whole chain's billing row. Mitigation: re-anchor on removal (Phase 5) and make the
   admin venue-delete path refuse to delete a venue that is the anchor of a bill with other
   venues (Phase 5/6). **Never delete a `billing_subscriptions` row** (standing rule).
3. **The signup sweep and pending-signup predicate read billing by venue.** An added venue that
   is not yet in the new table looks "unpaid hidden self-serve" and could be swept. Phase 1 moves
   them to the resolver before any add path exists.
4. **`venue-hightop-test`** is linked to Pacific Street's owner but must never count. Explicit
   membership (not "all the owner's venues") handles it; the backfill must add anchors only.
5. **Webhook stale-event guard** compares `stripe_subscription_id` per venue — keep it, but key the
   lookup on the subscription id so it works for every venue on the bill.
6. **Dev and production share one database** (CLAUDE.md, Square note). Testing add/remove from the
   dev server with live Stripe keys charges a real card. Use mocked Stripe in tests; Andrew's live
   test is Phase 7.
7. `amount_cents` is rendered everywhere as "the monthly rate". After Phase 1 it means "the whole
   bill's monthly total before discounts". Check every display (`lib/billingDisplay.ts`, admin,
   welcome email).

---

## 8. Out of scope

- Annual billing, different prices per venue type, per-venue invoices, splitting one chain across
  several cards, transferring a venue between owners, POS (Square/Clover) changes, the native app
  (partners never use it).

---

## 9. Open questions for Andrew

All nine planning questions are answered — see §2 rows 1–10 (2026-10-11). New questions raised
while building go in the latest phase handoff, not here.
