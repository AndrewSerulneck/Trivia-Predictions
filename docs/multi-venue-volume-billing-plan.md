# Multi-Venue Volume Billing Plan — "Add a venue" + Graduated Volume Discount

**Status:** Phases 1–5 **committed and pushed** (Phase 4: `59d7a55`, Phase 5: `0931f55`, pushed 2026-10-11;
Phase 5's migration `20261011210033_venue_bill_changes.sql` applied to production the same day and verified).
Phases 1–2 are live (both card subscribers are on the graduated Price `price_1UPOUD1djkdMC76XYeVsQXKl`, still
$100/month; check-paying accounts never lapse automatically). **Phase 6 (admin & edge tools) committed
locally as `6c5a178`, NOT pushed** — flag still off. **Phase 6.1 committed locally 2026-10-11, NOT pushed**; its migration
`20261011224839_bill_price_change_lock.sql` was **applied to production 2026-10-11** on Andrew's go-ahead and verified
(migration before app, so the app may now deploy). Latest handoff: **`docs/multi-venue-volume-billing-plan_PHASE_6.1_HANDOFF.md`**. Andrew's answers are
in §2 (do not re-ask). **Next: Phase 6.2** — a code review of Phase 6 found 10 problems, planned as Phases 6.1–6.5
(§5); Phase 7 (release) waits until they are done. Each phase ends with a handoff note
`docs/multi-venue-volume-billing-plan_PHASE_<N>_HANDOFF.md`; update this status line to point at the latest one.

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
| 6 | Negotiated custom rate on a chain (was §9 Q1) | **Coupons apply on top of the bands, and admins must always be able to adjust what a subscription costs** — on a 1-venue or a multi-venue bill. Not "(c) not allowed". **Mechanism chosen 2026-10-11 (Phase 6): a PER-VENUE rate** — the admin types a per-venue monthly price; the bill = rate × venues (no bands); venues added/removed later use the same rate; a promo code still applies on top; "Back to standard pricing" returns to the bands. |
| 7 | Admin adding a 2nd venue for an existing partner (was §9 Q2) | **Offer both** "Add to their bill" and "Free / comped". |
| 8 | Added venue goes live to players (was §9 Q3) | **Yes — the moment payment succeeds.** No admin check. |
| 9 | Confirmation email (was §9 Q4) | **Send our own "Venue added" email via Resend** as well as Stripe's receipt. Andrew also wants to perfect the new-subscriber welcome email and the venue-added email himself: **all wording now lives in `lib/email/partnerEmailCopy.ts`** (Phase 1), previewed with `npm run email:preview`. |
| 10 | Overhill and Garden State (was §9 Q5) | **Overhill is a test location** — leave it. **Garden State pays by check and must stay subscribed and active** — a rare exception granted to an early customer. NB: production shows its offline grant **expired on 2026-08-25** (the daily cron set it `cancelled` on 2026-08-26) — see the Phase 1 handoff §7; needs Andrew's re-grant. **Resolved 2026-10-11:** Andrew re-granted it (active through 2026-11-25) and ruled that check-paying accounts **never lapse automatically** — the cron's offline-expiry sweep was removed (`6ce86dd`); only an admin Revoke ends one. |
| 11 | Partner adds an address we already have (admin-made venue, someone's abandoned signup, another subscriber's bar) (Phase 4 Q2) | **Option A — keep refusing with "email partnerships@…"** (2026-10-11). A person checks ownership; the add flow never claims an existing venue. |

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
| 6.1 | Review fix: the admin price swap takes the bill's lock (claim + finish on the venue-change ledger) | **Opus 5.5** | **xhigh** | 1 session + Andrew approves `db push` |
| 6.2 | Review fix: only `custom_monthly_` Prices count as a per-venue rate; dead-code cleanup; drift reads in parallel | **Opus 5.5** | high | ½ session |
| 6.3 | Review fix: tell a removed or comped venue apart from "no bill" (admin badge), and Checkout refuses a second subscription for a partner who already has a bill | **Opus 5.5** | high | 1 session |
| 6.4 | Review fix: admin Link tool — keep the idempotency key unless refused, unfiltered partner list, comped → bill upgrade, band copy from `lib/venuePricing.ts` | Sonnet 5.5 | high | 1 session |
| 6.5 | Re-review the whole Phase 6 + 6.x diff, all gates, commit (when Andrew says) | **Opus 5.5** | high | ½ session |
| 7 | Release: copy, device checklist, flag on, Andrew's live test on Pacific Street + a real second venue | Sonnet 5.5 (+ Andrew) | medium | 1 session + Andrew's test |

Order is strict: 1 → 2 → 3 → 4 → 5 → 6 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 7. Phases 4 and 5 could swap if Andrew wants removal
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

### Phase 2 — The graduated price, live (Opus 5.5, high) — ✅ live 2026-10-11 (handoff: `…_PHASE_2_HANDOFF.md`)

- `scripts/create-graduated-price.cjs` (dry-run default, `--apply`): finds-or-creates the
  Price by lookup key; prints its id.
- Add `STRIPE_GRADUATED_PRICE_ID` (env append + `vercel env add`; redeploy). Checkout uses it
  when set, else falls back to `STRIPE_PRICE_ID` — so the deploy order can't break signup.
- `scripts/migrate-subscriptions-to-graduated.cjs` (dry-run default): swaps each live card
  subscription's item to the graduated Price, quantity 1, `proration_behavior: "none"`; skips
  offline rows and any custom-rate row (reports them). Today that is 2 subscriptions.
- Verify on the next webhook that both mirrors still read $100 and the Billing page is
  unchanged. Andrew runs `--apply` or approves it explicitly.

### Phase 3 — Add-a-venue backend (Opus 5.5, xhigh) — ✅ built 2026-10-11, flag off (handoff: `…_PHASE_3_HANDOFF.md`)

As built, beyond §4.3: the flow is ONE module, `lib/venueAddition.ts`; the claim happens BEFORE the
duplicate-address check (so a double-tap never sees its own new venue as a duplicate) and a refusal after
the claim is recorded on the ledger as `refused:<code>`; the venue is linked to the partner
(`venue_owner_venues`) only once paid — a deliberate change from step 4, so nobody sees or configures an
unpaid venue; an ambiguous Stripe error (5xx / connection) leaves the row `pending` for a 10-minute lease and
the daily `/api/cron/billing` reconciler (`reconcileStaleVenueAdditions`) settles it from Stripe's real
state; the quote also refuses while another add is awaiting payment. `findNearbyVenue` moved verbatim to
`lib/nearbyVenue.ts`.

Everything in §4.3. Tests with a mocked Stripe for: paid, declined, 3-D Secure → webhook
completes, webhook arrives before the route returns, double-tap (same idempotency key),
two different adds at once (lock), unhealthy bill refused, offline bill refused, duplicate
address refused, `(0,0)` refused, flag off → 404. Ledger rows must never leave a hidden venue
both unpaid and un-sweepable.

### Phase 4 — Add-a-venue UI (Sonnet 5.5, high) — ✅ built 2026-10-11, flag off (handoff: `…_PHASE_4_HANDOFF.md`)

As built: three screens, not four — **Address (with the venue name) → Map area → Review & pay** (signup's
`AddressStep` already asks the name). The dropdown is always a dropdown when "Add a venue" is available
(`isAddVenueAvailable()` = billing flag AND self-serve signup flag, because the sheet reuses signup's address
search and map routes). Components: `components/owner/add-venue/`; pure logic: `lib/addVenueFlow.ts`.

Everything in §4.5 except the Billing page. Follow the `/owner/*` rules in `CLAUDE.md`
(OwnerSheet, `pushSheet` not `router.push`, DiscardGuard, light-surface rules if the sheet is
white, 12px text floor, `HightopLoader`). Add `useNativeBackHandler` only if the sheet becomes
reachable in the app — it should not be (`/owner` is web-only).

### Phase 5 — Removal + Billing account view (Opus 5.5, high) — ✅ built 2026-10-11, flag off (handoff: `…_PHASE_5_HANDOFF.md`)

As built: one module, `lib/venueRemoval.ts`; route `POST /api/owner/venues/remove` (`action: "remove" | "undo"`);
migration `20261011210033_venue_bill_changes.sql` = a `billing_venue_changes` ledger + `claim_venue_bill_change` /
`finish_venue_bill_change` RPCs under the SAME advisory lock as adds, and `claim_venue_addition` replaced to be
`busy` while a change is in flight. The membership change (and the re-anchor, when the anchor leaves) is applied by
`finish_venue_bill_change` only AFTER Stripe accepted the new quantity; Stripe's `metadata.venueId` follows the
anchor in the same Stripe call. Undo is refused once `remove_at` has passed (the period renewed without it); putting
it back then is a paid **Add back** = the normal add flow with `readdVenueId` (no new venue; membership revived;
un-hidden via the `rehidden_at` stamp the removal job sets). The daily cron hides a removed venue with
`hidden = true, rehidden_at = now` and stamps `removed_at`. "Not on your bill / Add back" lives on the **Billing
page**, not in the dashboard dropdown (deviation; Phase 7 may add a dropdown hint). `venueIdsOnBill` gained
`billedOnly`; `billedVenueCount` now matches the RPC count (excludes leaving venues).

Everything in §4.4 + the Billing page part of §4.5. The cron change lives in the existing
`/api/cron/billing` — **no new `vercel.json` entry**.

### Phase 6 — Admin and edge cases (Opus 5.5, high) — ✅ built 2026-10-11, not committed (handoff: `…_PHASE_6_HANDOFF.md`)

As built: admin list shows each bill's venue count, band (or per-venue) line and monthly total, "On X's bill" for
non-anchor venues (actions stay on the anchor's row) and a "Comped (free)" badge; **Link a venue to a partner**
(`lib/adminVenueAttach.ts`, Preview → Confirm) — "Add to their bill" (card: the partner's own add flow; check: a
`role 'admin'` membership + a suggested graduated amount) or "Free (comped)"; the offline grant form offers the
graduated total; the custom rate is **per venue** (§2 row 6) with "Back to standard pricing", and partner Add / Remove now
work on a per-venue-rate bill; the daily report-only drift check (`lib/billingQuantityDrift.ts`). The Stripe customer
portal has subscription updates **disabled** (checked live, read-only), so partners can't change quantity there.

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

### Phases 6.1–6.5 — Fixes from the Phase 6 code review (2026-10-11)

A `/code-review` of the uncommitted Phase 6 working tree returned 10 findings. Each is restated below
with its failure scenario, because the review output was not saved anywhere else. All ten must be
fixed (or explicitly waived by Andrew) before Phase 7 turns the flag on.

**Before 6.1:** Phase 6 is still uncommitted. Ask Andrew whether to commit Phase 6 as-is first
(the commit path list is in `…_PHASE_6_HANDOFF.md` §2), so each fix is its own reviewable diff. If
he says no, build on the working tree and commit nothing. Never `git add -A`. Andrew's own unrelated
edits (`components/fantasy/`, `components/nfl-pickem/`, `GameIdentityPanel.tsx`,
`tests/components.player-pending.test.ts`, `.vscode/settings.json`) are never committed or reverted.

Each sub-phase ends with `docs/multi-venue-volume-billing-plan_PHASE_6.<N>_HANDOFF.md`.

#### Phase 6.1 — The admin price swap takes the bill's lock (Opus 5.5, xhigh) — review #1 — ✅ built and committed 2026-10-11, migration applied to production 2026-10-11 (handoff: `…_PHASE_6.1_HANDOFF.md`)

As built: everything below; the new RPCs are invoker plpgsql with a pinned `search_path` (matching
`20261011210033`), not `security definer`. The add and Remove / Undo flows now re-read Stripe after their claim
(`postClaimCheck` in each module). The add also refuses if the Price changed since its context read. New finding for
6.5: Add a venue's Confirm doesn't carry the quoted rate (handoff §7.3).

**Finding.** `swapSubscriptionPrice` in `lib/billingCustomPrice.ts` (used by `setCustomPrice` and
`setStandardPrice`) checks for an in-flight add/remove with plain reads (`venueChangeInFlight`), not
under the per-bill advisory lock (`'billing_venue_addition:' || bill id`) that `claim_venue_addition`
and `claim_venue_bill_change` take. It then writes an absolute `quantity` read moments earlier.
*Failure:* the admin presses Set rate. The check sees nothing, and Stripe returns quantity N. The
partner's Add a venue then claims and moves Stripe to N+1 (or leaves a pending 3-D Secure update).
The admin's `subscriptions.update({ quantity: N })` lands and drops the venue the partner just paid
for, or voids their pending payment.

**Fix.** Make the swap a claimed change on the existing ledger, so it is mutually exclusive with adds
and removes inside Postgres. Do not use a TypeScript read-then-write.

1. New migration (`supabase migration new bill_price_change_lock`; existing migrations are
   read-only):
   - Allow `action = 'price'` on `billing_venue_changes`. Drop the auto-named action check
     constraint and re-add it as `('remove','undo','price')`, after confirming the real constraint
     name in `pg_constraint`. Add `price_id text` (the target Price). A price row has
     `venue_id` null.
   - New RPC `claim_bill_price_change(p_idempotency_key, p_owner_id, p_subscription_id, p_price_id)`.
     It takes the **same** advisory lock, returns `busy_addition` / `busy_change` exactly as
     `claim_venue_bill_change` does, otherwise inserts a `pending` `'price'` row. The same key
     returns the same row.
   - New RPC `finish_bill_price_change(p_change_id, p_success, p_failure_reason)`. It marks the row
     `done` or `failed` under the same lock.
   - `create or replace` **`finish_venue_bill_change`** so it refuses (no-op, `outcome 'wrong_action'`)
     a row whose action is not `remove`/`undo`. **Trap:** today its `else` branch treats anything
     that isn't `remove` as `undo`.
   - `security definer`, `search_path` pinned, `revoke all … from public, anon, authenticated`,
     `grant execute … to service_role`, matching `20261011210033`. No new table, so no grant
     contract change, but run `tests/supabase-migration-grants-contract.test.ts` anyway.
   - Nothing else needs to change for the busy check: both existing claim RPCs already treat **any**
     pending `billing_venue_changes` row as busy, whatever its action. Verify that in the SQL.
2. `swapSubscriptionPrice`: claim (409 on busy) → `subscriptions.retrieve` → keep the
   `pending_update` and single-item checks → `update` → finish(`done`). Any Stripe error → finish(`failed`).
   An *ambiguous* Stripe error (5xx/connection) leaves the row `pending` for the lease, like adds.
   Delete `venueChangeInFlight`.
3. **Trap: the existing stale-change reconcilers would mis-handle a price row.**
   `reconcileStaleVenueChanges` and `settleStaleVenueChangesForBill` (`lib/venueRemoval.ts`)
   select every stale `pending` change and settle it as a remove/undo. Filter both to
   `.in("action", ["remove","undo"])`, and add a price-row settler to the same daily
   `/api/cron/billing` pass. After `VENUE_ADDITION_LEASE_MS`, it reads the subscription item's
   price: equal to `price_id` → `done`, otherwise `failed`. Without it, a crash mid-swap would lock
   the bill out of adds and removes forever.
4. Confirm that `lib/venueAddition.ts` and `lib/venueRemoval.ts` re-read the subscription
   **after** their own claim and price from that read, not from the pre-claim context (otherwise a
   swap that finished just before their claim still mis-prices the add). If either doesn't, fix it
   and add a test.
5. Tests: the interleaving above (claim held → partner add gets `busy`; add pending → swap gets 409);
   the stale price row settled both ways; `finish_venue_bill_change` refuses a price row. Prove the
   SQL on PGlite, the way `npm run test:account-deletion-sql` does, or document why not.
6. `supabase db push` only with Andrew's explicit go-ahead. Deploy the app **after** the migration:
   the new code calls an RPC that must exist. Missing RPC → the swap fails closed with 503
   `[CustomPrice] claim-rpc-missing`, never falls back to the unlocked path.

Cost: one extra RPC pair per admin price change (rare, admin-only). The cron gains one bounded read
of stale price rows (normally zero).

#### Phase 6.2 — Only `custom_monthly_` Prices are a per-venue rate; cleanup (Opus 5.5, high) — review #3, #9, #10

**Finding #3.** `billRateFromPrice` (`lib/venuePricing.ts`) treats **any** flat, monthly, USD Price
that isn't the graduated or list Price as a negotiated per-venue rate. *Failure:* a bill on an older
$100 list Price, a hand-pasted price id, or the list Price while `STRIPE_PRICE_ID` is unset (the
`listPriceId` guard is skipped when it is `""`) is classified `{ per_venue, 10000 }`. The partner's
Add a venue then charges $100 for venue #2 instead of $75.

**Fix #3.** `per_venue` requires `price.lookup_key` to start with `CUSTOM_PER_VENUE_LOOKUP_PREFIX`.
Every other flat Price → `null`. `customPriceLookupKey` (`lib/billingCustomPrice.ts`) builds its key
from that constant, so the literal lives in exactly one place. Add `bill-rate` tests for: an old list
Price with no lookup key, an empty `listPriceId`, a hand-made flat monthly Price, and a
`custom_monthly_7000` Price.
- **Revive the `custom_rate` refusal instead of deleting it (#9).** When the item is a flat Price
  that is not `custom_monthly_`, `loadAddVenueContext` and the removal context return `custom_rate`
  (409), not `billing_state`. The partner then gets "Your account has a custom rate. Email …", which
  is the true reason. Partner copy stays in `lib/multiVenueBilling.ts`.
- Admin side: when `setCustomPrice` is given a pasted Price id without the prefix, the swap still
  works. The success message adds "Partner self-serve add/remove is off for this bill (not a
  standard custom rate)." That way the admin knows.
- Before shipping, list (read-only) every live subscription's item Price and lookup key, to confirm
  no live bill is on a flat non-prefixed Price. Today's expectation: both card subscribers are on
  the graduated Price, per the Status line. If one is, tell Andrew before merging, because their
  self-serve add/remove switches off.

**Finding #9 (dead code).** Delete `isGraduatedPrice` (`lib/venueAddition.ts`, no callers). The
`custom_rate` codes become live again via the bullet above. If they somehow don't, delete them from
both code lists and message maps.

**Finding #10.** In `lib/billingQuantityDrift.ts`, the membership read, `inFlightBillIds()` and
`listStripeSubscriptions()` are awaited one after another. Run them in one `Promise.all`. This is
latency only: the reads and their count are unchanged. Any of them failing still throws, as today.

#### Phase 6.3 — Removed and comped venues are not "no bill" (Opus 5.5, high) — review #2, #4

**Finding #2.** `app/api/admin/billing/route.ts` derives `comped = !sub && ownersWithLiveBill.has(owner)`.
`loadBillingForVenues` reads only *active* memberships, and the owner→venue link is kept for Add
back, so a venue **removed** from a multi-venue bill shows as "Comped (free)". The
`venueState: "removed"` branch is never reached.

**Finding #4.** A comped venue (`lib/adminVenueAttach.ts`, comped mode = link only) is on no bill,
and `POST /api/owner/billing/checkout` only checks `loadBillingForVenue(venueId)`. *Failure:* the
partner opens Billing for comped venue B, sees Subscribe, and Checkout creates a **second**
$100/month subscription anchored on B. That breaks one-subscription-per-partner (§2) and charges
for a venue the admin meant to be free. A removed venue has the same hole.

**Fix.** One shared classifier, in `lib/venueBilling.ts` (the single home of "which bill covers
this venue"). No migration; comped stays derived, not stored.
- `unbilledVenueStates(venueIds, ownerIdByVenue)` makes one membership read that **includes**
  removed rows, plus one read of the owners' live bills. It returns, per venue with no active
  bill, one of:
  - `{ kind: "removed", subscriptionId, removedAt }`: it has a membership row with
    `removed_at`/`remove_at` set.
  - `{ kind: "comped", ownerBillId }`: never on any bill, and the linked owner has a non-cancelled
    bill.
  - `{ kind: "unbilled" }`.
- Admin list: build `comped` and `venueState: "removed"` from it. A removed row shows
  "Removed from X's bill (date)", never "Comped". Delete the inline `ownersWithLiveBill`
  derivation.
- Checkout (`app/api/owner/billing/checkout/route.ts`): refuse 409 `{ code: "on_partner_bill" }`
  when the venue is `comped` or `removed`, or more generally when the owner already has a
  non-cancelled bill on another venue. This is **not** flag-gated, because comped links work while
  the flag is off. Message: removed → "Add it back from Billing"; comped → "This venue is included
  free on your account"; otherwise → "Your venues share one bill — email support." It runs before
  `sweepAbandonedIncompleteSubscriptions` and before any Stripe call.
- Owner Billing page (`GET /api/owner/billing` + its page): a comped venue shows "Included on your
  account at no charge" instead of Subscribe. Removed venues already show Add back (Phase 5);
  confirm they don't also show Subscribe.
- **Before shipping, query production (read-only):** are there owners who today have more than one
  linked venue where one is billed and another isn't, or more than one separate bill? For each,
  what is it (`venue-hightop-test` is one expected case)? The new refusal must not strand a real
  partner. Report the list to Andrew in the handoff.
- Tests: removed ≠ comped in the admin list; Checkout refuses comped, removed, and a second venue
  of a billed owner; Checkout still allows an owner whose only bill is `cancelled`; signup and
  first venue unchanged. Add the Checkout refusal to `tests/multi-venue-billing-contract.test.ts`
  so it can't be dropped.

Cost: Checkout and the owner Billing GET each gain one bounded membership read (per click / page
view, not per player).

#### Phase 6.4 — Admin "Link a venue" fixes (Sonnet 5.5, high) — review #5, #6, #7, #8

- **#5 Idempotency key.** `confirm()` in `components/admin/billing/LinkVenueToPartner.tsx` clears
  `attemptKey` on **any** non-ok reply, including a 500/503 and `addition_in_progress`, where the
  outcome is unknown. *Failure:* the card is charged, completion throws (500), and the next "Charge
  and add" sends a fresh key, starting a new ledger claim instead of reconciling the first. Fix:
  classify the reply with the partner flow's rule (`interpretAddVenueReply` in `lib/addVenueFlow.ts`,
  or a shared helper extracted from it; don't fork a second copy). Clear the key **only** on a
  definitive refusal with a known code. On `unconfirmed`/5xx/`addition_in_progress`, keep the key
  and show "Check again". Test it, and confirm the server answers a retried key with the original
  row's state.
- **#6 Filtered partner list.** The Link dropdown (`linkOwners` in
  `components/admin/sections/BillingSection.tsx`) and the bill line's anchor name are both built
  from `partners`, which the server already filtered by the search box. Fix: `GET
  ?resource=attach-options` also returns every owner (`id, email, name`, one bounded read), and the
  list route returns `anchorVenueName` on each bill (looked up before the search filter). The
  component never derives either from the filtered list.
- **#7 Comped → bill upgrade unreachable.** `attachOptions()` lists only unlinked venues, but
  `lib/adminVenueAttach.ts` supports moving an already-linked **comped** venue onto the same
  partner's bill. Fix: also return linked venues whose state (from 6.3's classifier) is `comped`,
  tagged with their owner. In the UI, choosing one locks the partner to that owner and offers only
  "Add to their bill". The server re-checks everything, as today.
- **#8 Hard-coded bands.** The "Back to standard pricing ($100 / $75 / $60 / $45)" label must be
  built from `VENUE_PRICE_TIERS` (`lib/venuePricing.ts`), via a small formatter exported from there.
  Also fix the doc comment in `lib/billingCustomPrice.ts` that repeats the numbers (point it at
  `VENUE_PRICE_TIERS`). Add `components/admin/` to whatever contract test pins price literals, or
  add one.
- Light admin surface: plain Tailwind, `tone="light"` rules, 12px text floor.

#### Phase 6.5 — Re-review and close out (Opus 5.5, high)

Run `/code-review` on the whole Phase 6 + 6.1–6.4 diff. Fix or list every new finding, including the
quote-vs-Confirm rate gap recorded in `…_PHASE_6.1_HANDOFF.md` §7.3 (fix it, or Andrew waives it). Gates:
`npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not typecheck and build at the
same time), plus `tests/lib.auth-users-fk-guard.test.ts` unchanged. Update `CLAUDE.md`'s
multi-venue section: the price swap is claimed under the bill lock, only `custom_monthly_` is
per-venue, and Checkout refuses a billed partner's second venue. Commit with an explicit path list
once Andrew says. Then the handoff opens Phase 7.

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
