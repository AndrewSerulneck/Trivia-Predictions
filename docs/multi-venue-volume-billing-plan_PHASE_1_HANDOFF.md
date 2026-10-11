# Multi-Venue Volume Billing — Phase 1 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md`. This note closes **Phase 1 (Foundation)** and
opens **Phase 2 (the graduated Stripe price, live)**.

---

## For Andrew (plain English)

**What changed.** Behind the scenes, the app can now understand "one bill that covers several
venues", while every bill still covers exactly one venue. Nothing a partner or player sees has
changed, and no money has moved. Concretely:

- The database change (two new tables) is **written but not yet applied** to production. It
  needs your go-ahead to run `supabase db push`. The app is built so it keeps working the same
  whether that change is applied before or after the code goes live.
- Every part of the app that asks "which subscription pays for this venue?" now asks it in one
  place, so a venue added to a chain later can never be mistaken for "never paid" (which would
  have let the cleanup job delete it).
- The Stripe webhook now records the **whole bill's** monthly total, so when Phase 2 switches to
  the new tiered $100 / $75 / $60 / $45 price, bills won't show as $0.
- **Your email wording now lives in one file: `lib/email/partnerEmailCopy.ts`.** It holds every
  word of the new-subscriber welcome email and the new "Venue added" email, as plain text with
  instructions at the top. After editing, run `npm run email:preview` and open
  `tmp/email-previews/welcome.html` and `venue-added.html` in a browser. The welcome email
  currently says exactly what it said before (checked byte-for-byte). The "Venue added" email is
  written and ready, but nothing sends it until Phase 3 builds "Add a venue".

**Is it live?** No. Nothing is committed, pushed, deployed, or applied to the database.

**What needs you:**
1. **Garden State is not currently "active".** You said they pay by check and should stay
   subscribed. Production shows their check-paid access ran to **2026-08-25**, and the nightly
   billing job marked it `cancelled` on 2026-08-26 (that is what it does when an offline
   paid-through date passes). Players can still see and play at Garden State — only their
   billing page shows "cancelled". To fix: **Admin → Billing → Garden State → Grant offline
   access** with the date their latest check covers (pick a far date if you want it to stay
   active for a long time). Note that form also records a "payment received" line for the
   amount you enter. I did not change it myself because the date and amount are yours to pick.
   If you'd rather offline accounts never lapse automatically, say so — that's a small Phase 6
   change.
2. Approve applying the database change (`supabase db push`) and committing/pushing the code —
   in either order.
3. Optional: edit the email wording whenever you like (file above).

**What's left:** Phases 2–7 of the plan (new Stripe price → Add-a-venue backend → Add-a-venue
screens → Remove + Billing page → admin tools → release).

---

## For the next agent (Phase 2)

### 1. Goal and scope of Phase 2

Plan §5 "Phase 2 — The graduated price, live" (Opus 5.5, **high** effort, 1 session + Andrew
approves the live swap):

- `scripts/create-graduated-price.cjs` (dry-run default, `--apply`): find-or-create the Stripe
  Price by lookup key **`hightop_venue_graduated_monthly_v1`** (`GRADUATED_PRICE_LOOKUP_KEY` in
  `lib/venuePricing.ts`), `billing_scheme: "tiered"`, `tiers_mode: "graduated"`, monthly USD,
  tiers built **from `VENUE_PRICE_TIERS`** in `lib/venuePricing.ts` (a `.cjs` script can
  `require("../lib/venuePricing.ts")` when run as `node --import tsx …`; that module is pure, no
  `server-only`). Print the Price id. Also add a check (script flag or test) that the LIVE
  Price's tiers equal `VENUE_PRICE_TIERS` — plan §4.2 asks for it.
- `STRIPE_GRADUATED_PRICE_ID`: env append (`echo 'STRIPE_GRADUATED_PRICE_ID=…' >> .env.local`,
  never `>`) + `vercel env add`, then a redeploy. Checkout
  (`app/api/owner/billing/checkout/route.ts`, `getStripePriceId()` in `lib/stripe.ts`) uses it
  when set, else falls back to `STRIPE_PRICE_ID`. Keep `getStripePriceId()` the single reader
  (add a sibling reader if needed, don't read env inline).
- `scripts/migrate-subscriptions-to-graduated.cjs` (dry-run default): swap each live card
  subscription's item to the graduated Price, **quantity 1**, `proration_behavior: "none"`;
  skip offline rows and custom-rate rows (`stripe_price_id` whose lookup key starts with
  `custom_monthly_`, see `lib/billingCustomPrice.ts`) and report them. Today that is 2
  subscriptions (Pacific Street, Carrabba's), both on `price_1Ttv3n1djkdMC76XC3NZKy45`.
- Verify after the swap that both mirrors still read `amount_cents = 10000`, `quantity = 1`, and
  the partner Billing page is unchanged. **Andrew runs `--apply` or explicitly approves it.**

**Out of scope for Phase 2:** any add/remove flow, any UI, the flag
`NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` (Phase 3 creates it with `isMultiVenueBillingEnabled()`
in `lib/multiVenueBilling.ts` — Phase 1 deliberately did not), email sending, Garden State.

### 2. Starting state

- Branch `main`. Last commit `5edf46d` ("App version: remove Scan QR code button…"). **Phase 1 is
  entirely uncommitted.** Andrew decides when to commit/push (pushing `main` deploys).
- **Not mine — do not commit or revert:** Andrew's own uncommitted edits that pre-date this
  phase: `components/fantasy/FantasyHome.tsx`, `components/nfl-pickem/NFLPickEmLeaderboard.tsx`,
  `components/nfl-pickem/NFLPickEmRewardBanner.tsx`, `components/nfl-pickem/NFLTiebreakerCard.tsx`,
  `components/venue/GameIdentityPanel.tsx`, `tests/components.player-pending.test.ts`,
  `.vscode/settings.json`. Commit Phase 1 by **explicit path list** (see §4), never `git add -A`.
  `docs/multi-venue-volume-billing-plan.md` was untracked before this phase too (it's the plan;
  commit it with Phase 1).
- **Migration `supabase/migrations/20261011134820_multi_venue_billing.sql` is NOT applied** to
  the linked project `pkmxupsayzshvpirkaav`. Applying needs Andrew's approval (`supabase db push`
  asks first). Code and migration can deploy in **either order** (see §5 "deploy skew").
- After it is applied, run `npm run billing:check-venue-billing` (read-only). Expected: no
  `[VenueBilling] membership-table-missing` line, every venue `SAME`, every bill count `1`
  (3 bills: Garden State, Pacific Street, Carrabba's). Output measured 2026-10-11 **before** the
  migration (fallback path): all SAME, counts 1, `venue-hightop-test` and
  `venue-overhill-country-club` on no bill.
- No production data was written. No Stripe call was made. No backups were needed.
- Production billing rows, read 2026-10-11 (read-only):

  | venue | method | status | amount | period end |
  |---|---|---|---|---|
  | venue-pacific-street | stripe | active | 10000 | 2026-10-20 |
  | venue-carrabba-s-italian-grill-east-brunswick | stripe | active | 10000 | 2026-11-06 |
  | venue-garden-state-bar | offline | **cancelled** (cron, 2026-08-26) | 10000 | 2026-08-25 |

  Owner links: Pacific Street's owner also has `venue-hightop-test` (hidden Square test venue —
  never billed, never backfilled); Overhill's owner has no bill.

### 3. Decisions already made (do not re-ask)

All in plan §2 rows 1–10. The five answered 2026-10-11 in this session:

- **Custom rate on a chain:** coupons apply on top of the bands, **and admins must always be able
  to adjust what a subscription costs** (any bill, 1 venue or many). Not "disallow". Phase 6.
- **Admin adds a 2nd venue for an existing partner:** offer **both** "Add to their bill" and
  "Free / comped". Phase 6.
- **Added venue goes live** the moment payment succeeds, no admin check. Phase 3.
- **Emails:** send our own **"Venue added" email** (Resend) as well as Stripe's receipt. Andrew
  wants to write/edit the wording of both the welcome email and the venue-added email himself →
  `lib/email/partnerEmailCopy.ts` (done in Phase 1).
- **Overhill** = Andrew's test location, leave it. **Garden State** = pays by check, an early-
  customer exception, must stay subscribed and active (see §7 — currently it isn't).

Planner defaults Andrew did not overrule (still in force): feature flag
`NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` (Phase 3+), self-serve signup stays one venue per email,
add only on a healthy card bill, the "today" price comes from Stripe's preview.

Decisions made in Phase 1 (my calls, documented so they aren't relitigated):

- `billing_subscriptions.venue_id` stays NOT NULL UNIQUE = **anchor venue**. No constraint change
  on the money table.
- **Resolution rule** (`lib/venueBilling.ts` header): own non-cancelled anchor bill → else the
  bill an active membership row points at, if not cancelled → else whichever exists (anchor
  first). The membership table is only read when it can change the answer.
- `billing_subscription_venues.subscription_id` is **ON DELETE RESTRICT** (plan §4.2). Proven on
  PGlite: deleting a single-venue partner's venue still works; deleting a chain's anchor while any
  other row (even a removed one) is on the bill is refused by the database.
- An `AFTER INSERT` trigger on `billing_subscriptions` inserts the anchor membership row
  (`on conflict (venue_id) do nothing` — a new bill never steals a venue from another bill).
- The ledger `billing_venue_additions` has every FK `ON DELETE SET NULL` (money history survives a
  declined add deleting its venue) plus `venue_name` and `venue_added_email_sent_at`.
- The webhook's reveal/re-hide followers still act on `metadata.venueId` only (see §5 trap list).
- Fail-closed changes (small, deliberate behaviour changes, only on a database read error):
  `POST /api/owner/billing/checkout` now returns **503** if the billing read fails (it used to
  proceed to Checkout — a possible double subscription); admin `grant-manual` returns **500**
  (it used to proceed with no live-subscription guard). Everything else keeps its old 404/behaviour.

### 4. Files created or changed

**New**
- `lib/venuePricing.ts` — the ONE home of prices. `VENUE_PRICE_TIERS`, `ANCHOR_VENUE_PRICE_CENTS`,
  `GRADUATED_PRICE_LOOKUP_KEY`, `monthlyTotalCents(n)`, `venuePriceCents(k)`,
  `nextVenuePriceCents(n)`, `tierBreakdown(n)`, `graduatedTotalCents(tiers, q)`, and the Stripe-
  shape-agnostic `billableItemMonthlyCents(item)` / `subscriptionMonthlyCents(items)` the webhook
  uses (flat: `unit_amount × quantity`; tiered: payload tiers if present else our constant).
  Pure, no `server-only`, integer cents.
- `lib/venueBilling.ts` — the ONE home of "which bill covers this venue?" (`server-only`).
  `loadBillingForVenue(venueId, columns)`, `loadBillingForVenues(ids, columns)` (map keyed by the
  REQUESTED venue; `row.venue_id` is the bill's anchor), `venueIdsEverBilled(ids)` (anchor any
  status OR membership incl. removed — the sweep/pending proof), `venueIdsOnBill(billId,
  {includeRemoved})`, `billedVenueCount(billId)`, `withResolverColumns`,
  `isMissingMembershipTable`. Missing table → warn once
  `[VenueBilling] membership-table-missing`, answer from anchors only.
- `supabase/migrations/20261011134820_multi_venue_billing.sql` — `billing_subscription_venues`,
  `billing_venue_additions`, `billing_subscriptions.quantity`, the anchor trigger
  `billing_subscriptions_add_anchor_venue`, backfill (anchors only), service_role-only grants,
  RLS forced. Re-runnable.
- `lib/email/partnerEmailCopy.ts` — **all partner email wording** (`WELCOME_EMAIL`,
  `VENUE_ADDED_EMAIL`), `{placeholder}` templates, instructions for Andrew at the top.
- `lib/email/emailFormat.ts` — `formatEmailAmount`, `escapeHtml`, `fillTemplate` (unknown
  placeholders are left visible on purpose; a test fails on any left over).
- `lib/email/venueAddedEmail.ts` — `buildVenueAddedEmail(input)`; `lib/email/sendVenueAddedEmail.ts`
  — `sendVenueAddedEmail(input)` (never throws; caller owns send-once via
  `billing_venue_additions.venue_added_email_sent_at`). **Not called anywhere yet** (Phase 3).
- `scripts/check-venue-billing.cjs` → `npm run billing:check-venue-billing` (read-only prod check).
- `scripts/preview-partner-emails.cjs` → `npm run email:preview` (writes `tmp/email-previews/`).
- `scripts/test-multi-venue-billing-sql.cjs` → `npm run test:multi-venue-billing-sql` (PGlite).
- Tests: `tests/lib.venue-pricing.test.ts`, `tests/lib.venue-billing.test.ts`,
  `tests/venue-billing-resolver-contract.test.ts`, `tests/api.webhooks.stripe-multi-venue.test.ts`,
  `tests/lib.email.venueAddedEmail.test.ts`, `tests/helpers/emptyMembershipTable.ts`.

**Changed (readers moved onto the resolver)**
- `app/api/webhooks/stripe/route.ts` — `upsertSubscription` finds a tracked row by
  `stripe_subscription_id` FIRST (then the old `metadata.venueId` lookup), keys the upsert on the
  tracked row's own `venue_id`, mirrors `amount_cents = subscriptionMonthlyCents(items)` and
  `quantity`, retries once without `quantity` on PGRST204/42703
  (`[MultiVenueBilling] quantity-column-missing`). `maybeSendWelcomeEmail` reads/writes its row by
  subscription id / row id.
- `app/api/owner/billing/route.ts` (one entry per bill + new `venueIds` field; `venueId` still the
  anchor), `…/checkout/route.ts` (resolver, mirror corrections by row id, 503 on read error),
  `…/portal/route.ts`, `…/subscription/route.ts` (cancel/resume act on the whole covering bill).
- `app/api/admin/billing/route.ts` — list via `loadBillingForVenues`; revoke / grant-manual /
  apply-discount / remove-discount / set-custom-price via `loadBillingForVenue` and refuse a
  venue that is not its bill's anchor (`409 code: "not_bill_anchor"`, `notAnchorResponse`).
- `lib/admin.ts` — deletion summary + `deleteAdminVenue` (refuses a non-anchor venue, and an
  anchor whose bill has other rows incl. removed — **before** any Stripe call) +
  `listHiddenVenues`.
- `lib/pendingSignup.ts` clause 3 and `lib/signupSweep.ts` venue exclusion → `venueIdsEverBilled`.
  (`classifyOwnerForSweep` is owner-keyed and unchanged — a chain bill's `owner_id` covers it.)
- `lib/venueVisibilitySync.ts` — `loadBillingByVenue` delegates to `loadBillingForVenues`.
- `lib/email/welcomeEmail.ts` — wording moved out; output byte-identical (verified by diffing
  two rendered samples before/after).
- `scripts/purge-pending-signup.cjs` — also refuses if any linked venue has a membership row.
- `package.json` — `email:preview`, `test:multi-venue-billing-sql`, `billing:check-venue-billing`.
- 13 existing test files: their hand-rolled Supabase mocks learned the new table (empty) — no
  assertion was weakened; a few exact-object assertions now include the row's `venue_id`; two
  `from()` call counts went up by one (the membership read). New cases added: admin delete
  refusals, `not_bill_anchor` for three admin actions, checkout 503 on read error.

Commit path list for Phase 1 (if Andrew asks): every "New" and "Changed" path above, the
migration, the two docs (`docs/multi-venue-volume-billing-plan.md`, this file), and `CLAUDE.md`.

### 5. Facts and traps

- **Deploy skew is handled both ways.** Code before migration: the resolver falls back to
  anchors (real PostgREST error verified against production 2026-10-11), the webhook retries
  without `quantity`. Migration before code: old code ignores the new tables; the trigger and
  backfill keep membership complete for when the code lands.
- **Every bill must have its anchor membership row** — guaranteed by the trigger + backfill.
  Phase 3 inserts `added` rows; never insert an `anchor` row by hand.
- **`row.venue_id` from the resolver is the ANCHOR**, not the venue you asked about. Key on the
  map / the venue you passed.
- **The contract test** (`tests/venue-billing-resolver-contract.test.ts`) fails on any new
  venue-keyed `billing_subscriptions` read outside `lib/venueBilling.ts` (one allowed webhook
  lookup), and on any mention of `billing_subscription_venues` outside `lib/venueBilling.ts` —
  **Phase 3 should add its membership writers to `lib/venueBilling.ts`** (or deliberately widen
  the allowlist). It also fails on the literals `7500|6000|4500` in billing/stripe-named files
  outside `lib/venuePricing.ts`.
- **Webhook followers are still single-venue.** `maybeRevealVenue` / `maybeRehideVenue` act on
  `metadata.venueId` (the anchor). Fine while chains don't exist; Phase 3 reveals added venues in
  its own completion path, and **Phase 5 must make lapse re-hide cover every venue on the bill**
  (the daily reconciler already does, via the resolver). `reportLapsedAdminVenues` is also
  anchor-only (log-only report) — Phase 5.
- **Removed membership rows still hold the RESTRICT.** An admin can't delete an anchor venue
  while any removed row remains on its bill; `deleteAdminVenue` refuses with a clear message
  first. Phase 5 decides the cleanup (e.g. delete a bill's removed rows when deleting its anchor).
- **Stripe webhook payloads don't include `price.tiers`** unless expanded, so the mirror prices a
  tiered item with our constant. That's why Phase 2 must verify the live Price's tiers equal
  `VENUE_PRICE_TIERS`. `lib/billingCustomPrice.ts` still mirrors `amount_cents: price.unit_amount`
  for its flat custom prices — correct at quantity 1; Phase 6 revisits it for chains.
- **`amount_cents` now means the whole bill's monthly list total before discounts** (plan §7 trap
  7). Every bill today is 1 venue, so every display is unchanged.
- **Tests mock Supabase per table.** For a new test that reaches the resolver, return
  `emptyMembershipTable()` (from `tests/helpers/emptyMembershipTable.ts`) for
  `billing_subscription_venues`, and give fixture rows a realistic `venue_id`.
- **PGlite is not installed where `npm run test:account-deletion-sql` expects it**
  (`../tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite`, i.e.
  `/Users/andrewserulneck/Documents/tmp/…`). This session installed `@electric-sql/pglite@0.2.17`
  into a throwaway scratch folder. To set it up for good:
  `mkdir -p ../tmp/bingo-phase4-pg && cd ../tmp/bingo-phase4-pg && npm init -y && npm i @electric-sql/pglite@0.2.17`.
  `test:multi-venue-billing-sql` honours a `MULTI_VENUE_PGLITE_MODULE` override.
- iCloud "`name 2`" duplicates exist under `tests/` (e.g. `tests/lib.envNumber.test 2.ts`) — not
  from this work; vitest ignores them (no `.test.ts` suffix match). Leave them.
- `npm run build` flips `next-env.d.ts` to `./.next/types/routes.d.ts`; restore the committed
  `./.next/dev/types/routes.d.ts` line by hand (don't `git checkout --` — see memory note).
- `.env.local` is append-only and never read (CLAUDE.md). Production reads go through
  `node --env-file=.env.local …` scripts.

### 6. How to build, run and test

```
npx tsc --noEmit
npm run lint
npm run test                         # 3,756 pass / 13 skipped / 0 fail (2026-10-11)
npm run build                        # passes
MULTI_VENUE_PGLITE_MODULE=<pglite path> npm run test:multi-venue-billing-sql
PLAYER_DELETE_PGLITE_MODULE=<pglite path> node scripts/test-player-account-deletion.cjs   # passes
npm run billing:check-venue-billing  # read-only, production
npm run email:preview                # writes tmp/email-previews/*.html|txt
```

Don't run `tsc` and `build` concurrently (`.next/types` is regenerated).

Verified: all of the above; `tests/lib.auth-users-fk-guard.test.ts` unchanged and passing (no new
`auth.users` FK); account-deletion SQL unaffected (new FKs touch venues / venue_owners / billing,
never users / accounts); the welcome email renders byte-identically; the venue-added email
rendered and screenshotted in Chromium.

**Unverified / risky:** the migration has only run on PGlite, not on Supabase (Andrew approves the
push). No real Stripe webhook has hit the new code. The tiered-price path is unit-tested only —
Phase 2 is its first real use.

### 7. Open questions for Andrew

1. **Garden State** (see "For Andrew" item 1): re-grant offline access from Admin → Billing with
   the date their check covers. Or: should offline (check) accounts stop auto-expiring? If yes,
   that's a small change in `/api/cron/billing` (Phase 6 is the natural home).
2. **Custom rate on a chain (Phase 6 design, not blocking).** Andrew: "the coupon should apply,
   but admins should always have the ability to adjust the cost of a subscription." Suggested
   mechanism for Phase 6 to confirm with him: keep quantity = venues on the graduated price, and
   express an admin's custom monthly total as a `forever` amount-off coupon (bands total − agreed
   total). Catch: this codebase allows ONE discount per subscription (`lib/billingDiscounts.ts`),
   so "custom rate AND a promo coupon" needs either stacking (Stripe supports multiple discounts)
   or a rule for which wins. The existing Price-swap custom rate (`lib/billingCustomPrice.ts`)
   only makes sense at quantity 1.
3. Approval to `supabase db push` the Phase 1 migration, and to commit/push Phase 1.

### 8. Recommended first steps for Phase 2 (Opus 5.5, high effort)

1. Read the plan §4.1, §5 Phase 2 and §7, then this note. Run `git status` — confirm Phase 1 is
   committed (ask Andrew if not; never commit his unrelated files).
2. Confirm the migration is applied: `npm run billing:check-venue-billing` must NOT print
   `membership-table-missing`. If it does, ask Andrew before `supabase db push`.
3. Write `scripts/create-graduated-price.cjs` (dry run default) reading `VENUE_PRICE_TIERS`; run
   the dry run; get Andrew's OK for `--apply` (it creates a live Stripe object).
4. Add the `STRIPE_GRADUATED_PRICE_ID` reader + checkout fallback with tests; `vercel env add` +
   redeploy (a server-side var, no `NEXT_PUBLIC_`, but still needs a redeploy to apply).
5. Write `scripts/migrate-subscriptions-to-graduated.cjs` (dry run default) — print exactly which
   2 subscriptions it would swap and which it skips; Andrew runs or approves `--apply`.
6. After the swap: run `npm run billing:check-venue-billing`, read both rows' `amount_cents`
   (expect 10000) and `quantity` (expect 1) via a read-only script, and check the partner Billing
   page. Write `docs/multi-venue-volume-billing-plan_PHASE_2_HANDOFF.md` and update the plan's
   status line.
