# Multi-Venue Volume Billing — Phase 3 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md`. This note closes **Phase 3 (Add-a-venue backend)** and
opens **Phase 4 (Add-a-venue UI)**. The Phase 1 and Phase 2 handoffs
(`docs/multi-venue-volume-billing-plan_PHASE_1_HANDOFF.md`, `…_PHASE_2_HANDOFF.md`) still hold for what they
describe; read all three.

---

## For Andrew (plain English)

**What changed.** The "behind the scenes" half of **Add a venue** is built and tested:

- A partner's app can now ask "what would one more venue cost me?" and get back: this venue's monthly
  price ($75 for the 2nd–5th), the new monthly total (with their discount, if any), and **what Stripe
  would charge today** for the rest of the month — Stripe's own number, not ours. I checked this against
  your live Stripe account without changing anything: adding a second venue to Pacific Street today
  would charge **$22.68** for the 9 days left in its month.
- When the partner confirms, we charge their card on file for the rest of the month. **The venue goes
  live for players only if that charge succeeds.**
  - **Card declined:** nothing is kept — no venue, no charge — and they're told to update their card.
  - **Bank asks for extra verification (3-D Secure):** they get Stripe's secure payment page; the venue
    goes live the moment that payment completes. If they never finish, Stripe cancels it after 23 hours
    and we clean up.
  - Pressing the button twice, or two people adding at once, can never charge twice or create two venues.
- Once paid, the venue sits on their one monthly bill, appears in their account, and they get your
  **"Venue added" email** (wording still in `lib/email/partnerEmailCopy.ts`) as well as Stripe's receipt.
- A partner can't add a venue if their bill is past due, set to cancel, paid by check, or on a custom
  negotiated rate — they're told to fix Billing or email partnerships@hightopchallenge.com.

**Is it live?** **No.** It's all behind a switch that is **off**
(`NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED`), there are no screens yet (that's Phase 4), and **nothing is
committed, pushed or deployed**. One small database change (a "lock" so two adds can't collide) is
**written but not applied**.

**What needs you:**
1. **Approve applying the database change** (`supabase db push` — it adds one function and nothing else;
   a dry run confirms it is the only pending change).
2. **Approve committing and pushing** the Phase 3 code. It's safe to deploy before or after the database
   change, and with the switch off partners see nothing new.
3. One small product decision for later (not blocking) — see "Open questions" §7 item 2: what should happen
   when a partner tries to add a location we *already* have in the system (today: "email us").

**What's left:** Phases 4–7 (Add-a-venue screens → Remove + Billing page → admin tools → release).

---

## For the next agent (Phase 4)

### 1. Goal and scope of Phase 4

Plan §4.5 and §5 "Phase 4 — Add-a-venue UI" (**Sonnet 5.5, high effort**, 1–2 sessions): the venue name at
the top of the Partner Dashboard is **always** a dropdown (even with one venue); its footer row
**"+ Add a venue"** opens an `OwnerSheet` at `?sheet=add-venue&step=…` (URL-mirrored via `pushSheet`,
`DiscardGuard`, `scrollKey`), steps **Name → Address → Map area → Review & pay**, reusing
`components/signup/steps/AddressStep.tsx` and `GeofenceStep.tsx`. Review shows the quote; Confirm →
`HightopLoader` → success switches the dashboard to the new venue and shows a `DashboardToast`.

**Out of scope for Phase 4:** the Billing page account view, Remove, re-anchoring, the cron removal job
(Phase 5); admin tools, custom rates on chains, drift checks (Phase 6); copy polish, device checklist,
turning the flag on (Phase 7). Do **not** change `lib/venueAddition.ts`'s money logic in Phase 4 — if the UI
needs something new from the server, add it narrowly and add tests in `tests/api.owner.venues-add.test.ts`.

### 2. Starting state

- Branch `main`. Last commit `fefc9a0` (Phase 2 docs). **Phase 3 is entirely uncommitted.** Andrew decides
  when to commit/push (pushing `main` deploys).
- **Not mine — never commit or revert:** Andrew's own uncommitted edits that pre-date Phases 1–3:
  `components/fantasy/FantasyHome.tsx`, `components/nfl-pickem/NFLPickEmLeaderboard.tsx`,
  `components/nfl-pickem/NFLPickEmRewardBanner.tsx`, `components/nfl-pickem/NFLTiebreakerCard.tsx`,
  `components/venue/GameIdentityPanel.tsx`, `tests/components.player-pending.test.ts`,
  `.vscode/settings.json`. Commit Phase 3 by **explicit path list** (§4), never `git add -A`.
- **Migration `supabase/migrations/20261011153607_venue_addition_claim.sql` is NOT applied** to linked
  project `pkmxupsayzshvpirkaav`. `supabase db push --dry-run` (run 2026-10-11) lists it as the ONLY pending
  migration. Applying needs Andrew's approval. Deploy order doesn't matter: without the function the add
  route answers 503 (`[VenueAddition] claim_venue_addition-missing`) — and the route is 404 anyway while
  the flag is off; the webhook/cron paths only read the Phase 1 ledger table, which exists.
- **Flag:** `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` is set **nowhere** (not `.env.local`, not Vercel).
  Phase 4 needs it on locally to see the UI — append `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED=true` to
  `.env.local` (CLAUDE.md: append-only with `>>`; ask Andrew if the permission layer blocks it, as it did
  in Phase 2). Do **not** add it to Vercel (Phase 7).
- **No production data was written. No live Stripe object was created or changed.** Two read-only live
  Stripe reads were made (see §5): an `invoices.createPreview` on Pacific Street's subscription and an
  `invoices.list` / `invoices.retrieve` of its paid invoices.
- `npm run billing:graduated-price` and `npm run billing:check-venue-billing` re-run at the start of this
  session: Price matches, 3 bills × 1 venue, all `SAME`.

### 3. Decisions already made (do not re-ask)

Everything in plan §2, and the Phase 1/2 handoffs' §3. Made in Phase 3 (my calls, documented):

- **One module owns the flow:** `lib/venueAddition.ts`. Routes, webhook and cron decide nothing.
- **Order of the add** (`startVenueAddition`): (1) same idempotency key already in the ledger → answer
  with that row (reconciled from Stripe if needed) → (2) settle this bill's stale in-flight adds →
  (3) **claim** (RPC) → (4) Stripe sanity: no foreign `pending_update`, Stripe quantity == billed count →
  (5) duplicate-address check → (6) create the hidden venue → (7) the one `subscriptions.update` →
  (8) classify paid / requires_action / declined. **Claim before the duplicate check** on purpose: a
  double-tap whose twin already created the venue must get "same add", not "you already have a venue
  there". A refusal after the claim is recorded on the ledger as `failure_reason = "refused:<code>"`.
- **The venue is linked to the partner (`venue_owner_venues`) only once paid** (in `completeAddition`),
  not at creation as plan §4.3 step 4 said. Reason: a partner should never see or configure a venue they
  haven't paid for (it would vanish again on a decline), and a declined add then has no link to undo.
  Consequence for Phase 4: `requireOwnerAuth().venueIds` never contains an unpaid venue.
- **Venue stamps:** created with `hidden: true`, `self_serve_created_at` AND `checkout_started_at` in ONE
  insert (`createAdminVenue` gained an optional `checkoutStartedAt`). That puts an orphaned venue in the
  signup sweep's **7-day** tier (never the 1-hour tier) — longer than Stripe's 23-hour pending-update
  expiry, so the sweep can never delete a venue whose payment can still land.
- **Decline:** void the invoice FIRST (Stripe's documented way to cancel a pending update), then delete
  the venue, then ledger `failed`. If the void fails and the invoice is still open, the venue is KEPT
  (hidden, sweepable) and the reason gets `; void-failed` — if that invoice is later paid, the webhook
  completes the add anyway (tested).
- **3-D Secure:** ledger `requires_action`, answer `202 { status: "requires_action", hostedInvoiceUrl }`.
  A `requires_action` row whose payment was declined on the hosted page is NOT failed early — the partner
  may still be trying another card; Stripe voids at expiry, then we clean up.
- **Ambiguous Stripe error** (5xx / connection): leave `pending`, answer `503 payment_unconfirmed`.
  `VENUE_ADDITION_LEASE_MS` = 10 min; after it, `reconcileAddition` reads Stripe's real state (quantity +
  `pending_update` + latest invoice) and completes or fails. Definitive 4xx → fail now (`StripeCardError` →
  `card_declined`).
- **Healthy bill** (`loadAddVenueContext`): our row `billing_method != offline`, `status == active`, not
  `cancel_at_period_end`, has a Stripe id; Stripe `status == active`, no `cancel_at(_period_end)`,
  `collection_method == charge_automatically`, no schedule, exactly one item, item price is the graduated
  Price (lookup key or `STRIPE_GRADUATED_PRICE_ID`; a `custom_monthly_*` price → `custom_rate`, anything
  else → `billing_state`), and the bill's `owner_id` is the caller. Stricter than `classifyBillingRow`'s
  "live" on purpose (past_due can't take on venues).
- **Which bill:** the bill covering `venueId` (the dashboard's selected venue) if given; else the owner's
  only non-cancelled own bill; several → `409 multiple_bills`.
- **Quote:** `invoices.createPreview` with `proration_behavior: "always_invoice"` and a `proration_date`
  (returned to the client as `prorationDate`; the add honours it only if ≤ 15 min old, in-period, not
  future). "New monthly total" = graduated list total with the bill's mirrored discount, via
  `effectiveAmountCents` from `lib/billingDisplay.ts` (the Billing page's own math, zero Stripe calls). The
  quote refuses `addition_in_progress` (with the hosted URL) while another add awaits payment.
- **Webhook:** `invoice.paid` → `completeVenueAdditionForInvoice` skips only `subscription_cycle` /
  `subscription_create` invoices (verified live as the renewal/first-invoice labels), so a mislabelled add
  invoice still completes. Not flag-gated. Throws on a DB error → 500 → Stripe retries.
- **Cron:** `/api/cron/billing` runs `reconcileStaleVenueAdditions` (≤ 20 rows/run, rows past the lease)
  BEFORE the reveal repair. Not flag-gated; never fails the cron. No `vercel.json` change.
- **Email:** claim-then-send on `billing_venue_additions.venue_added_email_sent_at` (released if the send
  fails). Inputs: `venueCount = quantity_after`, `thisVenueCents = venuePriceCents(quantity_after)`,
  `newMonthlyTotalCents` = after-discount total, `chargedTodayCents = amount_due_cents`.
- **Rate limits** (`lib/rateLimit.ts`, owner-keyed, no IP): `venueAddOwner` 30/hour, `venueQuoteOwner`
  60/hour. Re-POSTing the same key to poll costs a slot — Phase 4 must poll sparingly (see §8).
- **Billed count** in the RPC = membership rows with `removed_at IS NULL AND remove_at IS NULL` (Phase 5's
  Remove lowers Stripe's quantity at once and sets `remove_at`). `venueIdsOnBill` in TS still counts
  `removed_at IS NULL` only — identical today (no row has `remove_at`); Phase 5 must align them.

### 4. Files created or changed

**New**
- `lib/multiVenueBilling.ts` — pure (no `server-only`): `isMultiVenueBillingEnabled()` (single reader of
  the flag), client types `AddVenueQuote` / `AddVenueStatus` / `AddVenueFailureCode`
  (`ADD_VENUE_FAILURE_CODES`), `ADD_VENUE_MESSAGES` (the ONE home of refusal copy — Phase 4 can show
  these), `PARTNER_SUPPORT_EMAIL`.
- `lib/venueAddition.ts` — server-only. Exports: `loadAddVenueContext`, `quoteVenueAddition`,
  `startVenueAddition`, `reconcileAddition`, `completeVenueAdditionForInvoice` (webhook),
  `reconcileStaleVenueAdditions` (cron), `addVenueInputFromBody`, `addVenueInputIssue`,
  `addVenueResponse`, `rateLimitRefusal`, `classifyInvoice`, `prorationDueCents`,
  `acceptableProrationDate`, `isValidClientKey`, `additionIdempotencyKey`, `VENUE_ADDITION_LEASE_MS`,
  `VENUE_ADDITION_RECONCILE_LIMIT`. Internal: `completeAddition`, `ensureOwnerLink`,
  `sendVenueAddedEmailOnce`, `failAddition`, `deleteUnbilledAddedVenue`, `settleStaleAdditionsForBill`,
  `claimAddition`, `inspectInvoice`.
- `lib/nearbyVenue.ts` — `findNearbyVenue`, `venueHasOwner`, `venueAddressLabel`, moved **verbatim** from
  `app/api/owner/signup/route.ts` (a route file may only export handlers).
- `app/api/owner/venues/add/route.ts` — `POST`. Body `{ idempotencyKey, venueId?, venueName, street, city,
  state, zipCode, placeId, latitude, longitude, radius, prorationDate? }`. Answers: 200 `{ ok, status:
  "paid", additionId, venueId, chargedTodayCents }`; 202 `{ ok, status: "requires_action", additionId,
  hostedInvoiceUrl }`; 202 `{ ok, status: "processing", additionId }`; else `{ ok: false, code, error,
  additionId?, hostedInvoiceUrl?, venue? }` (400/402/403/409/413/429/500/502/503).
- `app/api/owner/venues/add/quote/route.ts` — `GET ?venueId=`. 200 `{ ok, quote: AddVenueQuote }` or the
  same refusal shape.
- `supabase/migrations/20261011153607_venue_addition_claim.sql` — `claim_venue_addition(p_idempotency_key,
  p_owner_id, p_subscription_id, p_venue_name)` → `(outcome, addition_id, addition_status,
  addition_venue_id, addition_invoice_id, addition_quantity_before, addition_quantity_after,
  addition_amount_due_cents, addition_failure_reason, addition_updated_at)`; outcomes `claimed | existing
  | busy | key_conflict | not_owner | no_bill | invalid`. Advisory lock on
  `hashtextextended('billing_venue_addition:' || bill id, 0)`. Execute: service_role only. Function only —
  no relation, so no table grants.
- `tests/api.owner.venues-add.test.ts` (45 tests) — routes + webhook + reconciler against one in-memory DB
  and a simulated Stripe (modes: succeed / decline / requires_action / connection_error / card_error /
  applied_then_connection_error). Contains a JS port of the RPC.
- `tests/helpers/inMemorySupabase.ts` — reusable in-memory `supabaseAdmin` double (unique → 23505, FK
  cascade / set null, `rpc` handlers, `failNext`, `fromCalls`).
- `tests/multi-venue-billing-contract.test.ts` (8 tripwires) — flag single reader + route gate order;
  completion not flag-gated; ledger + RPC only in the flow module; `pending_if_incomplete` +
  `always_invoice` + idempotency key, exactly one `subscriptions.update`; hidden + both stamps in one
  insert; void before delete; shared `findNearbyVenue`; no price literals.

**Changed**
- `lib/venueBilling.ts` — `addVenueToBill(subscriptionId, venueId, "added" | "admin")`: the only writer of
  non-anchor membership rows (upsert ignore-duplicates on `venue_id`; refuses a venue on another bill or
  removed from this one).
- `lib/admin.ts` — `createAdminVenue` gains optional `checkoutStartedAt` (omitted when undefined, so every
  existing caller is byte-identical).
- `lib/rateLimit.ts` — buckets `venueAddOwner`, `venueQuoteOwner`.
- `app/api/webhooks/stripe/route.ts` — `invoice.paid` also calls `completeVenueAdditionForInvoice`.
- `app/api/cron/billing/route.ts` — fourth job `reconcileStaleVenueAdditions({ dryRun })`; response gains
  `venueAdditions`.
- `app/api/owner/signup/route.ts` — imports `findNearbyVenue` / `venueHasOwner` / `venueAddressLabel` from
  `lib/nearbyVenue.ts`; behaviour unchanged (its 44 tests pass untouched).
- `scripts/test-multi-venue-billing-sql.cjs` — section 8 applies the new migration twice and proves the RPC
  (claim, same key, busy incl. `requires_action`, re-count after paid, `remove_at` not billed, failed key
  stays failed, not_owner, key_conflict leaks nothing, no_bill, invalid, bills independent, EXECUTE grants).
- Tests adjusted (no assertion weakened): `tests/api.owner.signup.claim-guard.test.ts` (its "one predicate"
  tripwire now reads the route + `lib/nearbyVenue.ts` together, and asserts the route imports the shared
  scan); `tests/api.webhooks.stripe-invoice-subscription-id.test.ts`,
  `tests/api.webhooks.stripe-recovery-path.test.ts` (stub `completeVenueAdditionForInvoice` — they test
  invoice recording); the three `tests/api.cron.billing*.test.ts` (stub `reconcileStaleVenueAdditions`).
- Docs: `CLAUDE.md` (multi-venue section), plan status line + Phase 3 heading, this file.

**Commit path list for Phase 3** (when Andrew says so): `CLAUDE.md`, `docs/multi-venue-volume-billing-plan.md`,
`docs/multi-venue-volume-billing-plan_PHASE_3_HANDOFF.md`, `app/api/cron/billing/route.ts`,
`app/api/owner/signup/route.ts`, `app/api/owner/venues/add/route.ts`, `app/api/owner/venues/add/quote/route.ts`,
`app/api/webhooks/stripe/route.ts`, `lib/admin.ts`, `lib/multiVenueBilling.ts`, `lib/nearbyVenue.ts`,
`lib/rateLimit.ts`, `lib/venueAddition.ts`, `lib/venueBilling.ts`, `scripts/test-multi-venue-billing-sql.cjs`,
`supabase/migrations/20261011153607_venue_addition_claim.sql`, `tests/api.cron.billing-offline-never-lapses.test.ts`,
`tests/api.cron.billing.rehide.test.ts`, `tests/api.cron.billing.reveal.test.ts`,
`tests/api.owner.signup.claim-guard.test.ts`, `tests/api.owner.venues-add.test.ts`,
`tests/api.webhooks.stripe-invoice-subscription-id.test.ts`, `tests/api.webhooks.stripe-recovery-path.test.ts`,
`tests/helpers/inMemorySupabase.ts`, `tests/multi-venue-billing-contract.test.ts`.

### 5. Facts and traps

- **Stripe pending updates** (docs.stripe.com/billing/subscriptions/pending-updates, read 2026-10-11): with
  `payment_behavior: "pending_if_incomplete"` the API returns **200** even on a decline — the subscription
  comes back with `pending_update` set and the old quantity; only a paid invoice applies the change. The
  pending update expires at **23 h** (or the period end, if sooner) and Stripe **voids the invoice**.
  **Any later subscription update that sends a non-empty `items` list discards a pending update and voids
  its invoice** — that is why the flow refuses a foreign `pending_update` and allows one add in flight per
  bill. **Phase 5's Remove/Undo and Phase 6's admin tools must also refuse (or take the same lock) while an
  add is in flight on the bill**, or they will silently cancel a partner's in-progress 3-D Secure payment.
- **Verified live, read-only (2026-10-11):** Pacific Street (`sub_1TvKnu1djkdMC76X5IZZhXR6`, period ends
  2026-10-20) is `billing_mode: flexible`, single item on the graduated Price, quantity 1, no pending update
  or schedule. `createPreview` with `always_invoice` + quantity 2 returned ONLY two proration lines
  (−$30.24 / +$52.92) and `amount_due` **2268**; with `create_prorations` it adds the next period
  (19768). `invoices.retrieve(…, { expand: ["payments.data.payment.payment_intent"] })` works on this API
  version (2026-06-24.dahlia) and returns the PaymentIntent object. Renewal invoices are
  `billing_reason: subscription_cycle`, the first one `subscription_create`. **Unverified:** the real
  `billing_reason` of a pending-update invoice, and a real decline / 3-D Secure — only Phase 7's live test
  can show them (the code does not depend on the billing_reason value).
- **Dev and production share one database and dev uses LIVE Stripe keys** (plan §7 trap 6). Exercising
  `POST /api/owner/venues/add` from a local dev server with the flag on **charges a real card and creates a
  real venue**. Phase 4 must test the UI against mocked responses (or stop before the final POST); Andrew's
  live test is Phase 7.
- `invoice.payments` is an *includable* field — it is absent unless expanded. Without it every open invoice
  would classify as "declined, no payment attempt" — and be voided. Keep the expand in `inspectInvoice`.
- The add answers `202 processing` in three cases: a twin request holds the lease; completion's
  membership/link write failed after payment (the webhook or reconciler retries); or Stripe returned
  something unexpected. Re-POSTing the **same** `idempotencyKey` is the status check — never mint a new key
  for a poll (a new key is a new add attempt, refused as `addition_in_progress` while the first is open).
- A ledger row stuck `pending` / `requires_action` blocks new adds on that bill until settled. Settling
  happens on the next add/quote and in the daily cron. If Stripe were unreachable for days a row could
  stay "unknown" — visible as `[VenueAddition]` errors in the cron response; an admin can mark it failed.
- **Tests mock Supabase per file.** A file that reaches the Stripe webhook's `invoice.paid` or the billing
  cron now also reaches `lib/venueAddition.ts`; either stub it (as the five adjusted files do) or give the
  mock the ledger table. For new end-to-end tests, reuse `tests/helpers/inMemorySupabase.ts`.
- **PGlite** is still not installed at the path `npm run test:multi-venue-billing-sql` defaults to
  (`../tmp/bingo-phase4-pg/…`). This session installed `@electric-sql/pglite@0.2.17` in the scratchpad;
  run with `MULTI_VENUE_PGLITE_MODULE=<dir>/node_modules/@electric-sql/pglite npm run test:multi-venue-billing-sql`
  (setup command in the Phase 1 handoff §5).
- `npm run build` flips `next-env.d.ts` to `./.next/types/routes.d.ts` and can leave iCloud `… 2.*` files
  under `.next/`. Restore with
  `sed -i '' 's#import "./.next/types/routes.d.ts";#import "./.next/dev/types/routes.d.ts";#' next-env.d.ts`
  and `find .next -name "* 2.*" -delete` (never `git checkout --`). Done after this session's build.
- `lib/venueClaim.ts`'s header still describes `findNearbyVenue` as the proximity scan — it now lives in
  `lib/nearbyVenue.ts`; the predicate it calls is unchanged.

### 6. How to build, run and test

```
npx tsc --noEmit
npm run lint
npm run test                          # 3,817 pass / 13 skipped / 0 fail (2026-10-11; was 3,763)
npm run build                         # passes; lists ƒ /api/owner/venues/add and …/add/quote
npx vitest run tests/api.owner.venues-add.test.ts tests/multi-venue-billing-contract.test.ts   # 45 + 8 tests
MULTI_VENUE_PGLITE_MODULE=<pglite path> npm run test:multi-venue-billing-sql                    # passes
supabase db push --dry-run            # read-only: lists 20261011153607_venue_addition_claim.sql only
npm run billing:check-venue-billing   # read-only, production
npm run billing:graduated-price       # read-only unless --apply
```

Verified this session: all of the above. **Unverified / risky:** the migration has run only on PGlite; no
real Stripe pending update has been created (decline, 3-D Secure and the webhook completion are simulated);
the "Venue added" email has not been sent for real.

### 7. Open questions for Andrew

1. **Approve `supabase db push`** of `20261011153607_venue_addition_claim.sql` and the Phase 3 commit/push
   (either order is safe).
2. **(Product, not blocking) A partner adds a location we already have** — e.g. their second bar was set
   up earlier by an admin, or as someone else's abandoned signup. Today the add refuses with "We already
   have a venue at this address — email partnerships@…". Should a partner be able to *claim* an unowned
   venue at that address onto their bill (as signup does), or is "email us" right? Claiming touches venue
   provenance (an admin-created venue has no self-serve stamp, so the reveal rules don't apply), so it
   would be its own small design.
3. Carried from Phase 2 (Phase 6, not blocking): custom rate on a chain — coupon vs. price swap, and
   stacking with a promo coupon. Today an add on a custom-rate bill is refused (`custom_rate`).

### 8. Recommended first steps for Phase 4 (Sonnet 5.5, high)

1. Read plan §4.5 and §5 Phase 4, this note, and CLAUDE.md's `/owner/*` rules (`OwnerSheet`, `pushSheet`
   never `router.push`, `DiscardGuard`, `scrollKey`, `ht-light-surface` if the sheet is white, the 12 px
   text floor, `HightopLoader` + `useLoaderVisible`). `git status` — confirm Phase 3 is committed (ask
   Andrew if not; never commit his unrelated files).
2. Confirm the migration is applied (`supabase db push --dry-run` shows nothing pending). If not, the add
   answers 503 — ask Andrew.
3. Generate the `idempotencyKey` with `crypto.randomUUID()` **once per Confirm press** and keep it for that
   attempt; re-POST the same key (≤ every 5 s, a few times) to poll after `processing`, and after the partner
   returns from Stripe's hosted page for `requires_action` (open `hostedInvoiceUrl` in a new tab). A new key
   only after a definitive failure (`card_declined`, `refused:*` codes, `addition_failed`).
4. Send `venueId` = the dashboard's selected venue and `prorationDate` from the quote. Show
   `ADD_VENUE_MESSAGES[code]` (or the server's `error`) for refusals; `card_declined` / `bill_not_active` /
   `cancel_scheduled` should link to Billing; `addition_in_progress` should offer `hostedInvoiceUrl` when
   present.
5. Format money with integer cents only; never compute a price in a component — the quote has every number
   (`thisVenueCents`, `newMonthlyTotalCents`, `dueTodayCents`, `currentPeriodEnd`, `discountLabel`).
6. Test the UI with mocked fetches. **Never** let a dev-server test reach the real `POST` with the flag on
   (live Stripe + shared DB). Then write `docs/multi-venue-volume-billing-plan_PHASE_4_HANDOFF.md` and update
   the plan's status line.
