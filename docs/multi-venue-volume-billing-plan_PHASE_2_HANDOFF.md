# Multi-Venue Volume Billing — Phase 2 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md`. This note closes **Phase 2 (the graduated Stripe
price, live)** and opens **Phase 3 (Add-a-venue backend)**. Phase 1's note
(`docs/multi-venue-volume-billing-plan_PHASE_1_HANDOFF.md`) still holds for everything it describes;
read both.

---

## For Andrew (plain English)

**What changed, and it's all live:**

- **Phase 1 is committed, pushed and deployed**, and its database change is applied to production.
  A read-only check confirms every venue is still on exactly the bill it was on before.
- **Check-paying accounts never lapse on their own any more.** The nightly billing job used to mark a
  check account "cancelled" the day after its paid-through date (that's what happened to Garden
  State in August). It no longer does. A check account now stays active until you click **Revoke**
  in Admin → Billing. The "Paid through" date you enter when granting is now just a record of what
  their latest check covers. Garden State is active (paid through 2026-11-25).
- **The new tiered price exists in Stripe** ($100 for the 1st venue, $75 for the 2nd–5th, $60 for
  the 6th–15th, $45 after that). It's attached to the same Stripe product as your $100 price, so
  Stripe's reports keep everything together.
- **New subscribers now sign up on the tiered price.** At one venue that's still exactly $100/month.
- **Pacific Street and Carrabba's were moved onto the tiered price** (you approved this). Stripe's own
  preview of each one's next bill says **$100.00** — the same as before — with no extra charge or
  credit. Our records show $100 / 1 venue for both. Garden State (check) was left alone.

**Nothing a partner sees should look different**, with one possible exception worth a glance:
Stripe's checkout page for a *brand-new* subscriber may now describe the price as tiered (e.g.
"Starting at $100.00 / month") rather than a plain "$100.00 / month". I couldn't view that page
myself. If you see it and don't like the wording, tell the next agent.

**What needs you:**
1. **One line to add to your local `.env.local`** (my permission to append to that file was blocked,
   so I didn't work around it). In Terminal, from the project folder:
   `echo 'STRIPE_GRADUATED_PRICE_ID=price_1UPOUD1djkdMC76XYeVsQXKl' >> .env.local`
   (two `>` — one `>` would wipe the file). It only affects your local dev server; the live site
   already has it.
2. Optional: glance at your Billing page on the live site — it should still say $100/month.

**What's left:** Phases 3–7 (Add-a-venue backend → Add-a-venue screens → Remove + Billing page →
admin tools → release).

---

## For the next agent (Phase 3)

### 1. Goal and scope of Phase 3

Plan §4.3 and §5 "Phase 3 — Add-a-venue backend" (**Opus 5.5, xhigh effort**, 2 sessions):
`GET /api/owner/venues/add/quote`, `POST /api/owner/venues/add`, the `claim_venue_addition`
advisory-lock RPC, the `billing_venue_additions` ledger flow (insert before the Stripe call), the
Stripe quantity update (`proration_behavior: "always_invoice"`, `payment_behavior:
"pending_if_incomplete"`), decline / 3-D Secure / `invoice.paid` webhook completion, revealing the
added venue, sending the "Venue added" email once (`lib/email/sendVenueAddedEmail.ts`, stamp
`billing_venue_additions.venue_added_email_sent_at`), and the flag
`NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` with single reader `isMultiVenueBillingEnabled()` in a new
`lib/multiVenueBilling.ts`. The test list in plan §5 Phase 3 is the acceptance list.

**Out of scope:** any UI (Phase 4), remove/re-anchor/cron (Phase 5), admin tools and custom rates on
chains (Phase 6), copy and flag-on (Phase 7).

### 2. Starting state

- Branch `main`, pushed to `origin/main`. Commits this session, oldest first:
  - `3e9be34` — Phase 1 (unchanged from the Phase 1 handoff's file list).
  - `6ce86dd` — billing cron: offline accounts never lapse (see §3).
  - `c1ce489` — Phase 2 code.
  - The handoff/plan/CLAUDE.md commit that adds this file (latest).
- **Deployed:** production deployment `hightop-challenge-nh809mri0-andrewserulnecks-projects.vercel.app`
  (built from `c1ce489`) reached **Ready** on 2026-10-11 before the subscription swap. The docs-only
  commit after it triggers another deploy with no code change.
- **Database:** migration `20261011134820_multi_venue_billing.sql` applied to linked project
  `pkmxupsayzshvpirkaav` on 2026-10-11 via `supabase db push` (Andrew approved). Dry-run showed it was
  the only pending migration. `npm run billing:check-venue-billing` afterwards: no
  `membership-table-missing` warning, all 5 owner-linked venues `SAME`, 3 bills × 1 venue,
  `venue-hightop-test` and `venue-overhill-country-club` on no bill.
- **Stripe (LIVE mode):**
  - Created Price **`price_1UPOUD1djkdMC76XYeVsQXKl`**, lookup key `hightop_venue_graduated_monthly_v1`,
    product `prod_UtiUDp7116za0p` (same as list price `price_1Ttv3n1djkdMC76XC3NZKy45`), tiered /
    graduated / monthly / usd, tiers 1→10000, 5→7500, 15→6000, inf→4500, no flat fees.
    Idempotency key `create-hightop_venue_graduated_monthly_v1`.
  - Swapped (Andrew approved via the session prompt): `sub_1U1So41djkdMC76XePDK9srm` (Carrabba's, item
    `si_V1Vpk9dChRxygx`) and `sub_1TvKnu1djkdMC76X5IZZhXR6` (Pacific Street, item `si_UvBA0yDCpNmOBg`)
    → graduated Price, quantity 1, `proration_behavior: "none"`. Idempotency keys
    `graduated-v1-swap-<sub>-<item>`. To undo one: `stripe.subscriptions.update(sub, { items: [{ id:
    item, price: "price_1Ttv3n1djkdMC76XC3NZKy45", quantity: 1 }], proration_behavior: "none" })`.
- **Vercel env:** `STRIPE_GRADUATED_PRICE_ID` added to **Production only** (not Preview: Preview's
  Stripe key may be a different mode, where a live Price id would 404 Checkout — the fallback only
  covers *unset*, not *wrong*). **NOT in local `.env.local`** — the append was denied by a permission
  rule; Andrew has the one-liner. Until he adds it, the local dev server's Checkout uses the flat
  price, and the two scripts still work (they resolve the Price by lookup key).
- **Production billing rows after the swap** (read 2026-10-11):

  | venue | method | status | price | amount | qty | period end |
  |---|---|---|---|---|---|---|
  | venue-pacific-street | stripe | active | price_1UPOUD… | 10000 | 1 | 2026-10-20 |
  | venue-carrabba-s-italian-grill-east-brunswick | stripe | active | price_1UPOUD… | 10000 | 1 | 2026-11-06 |
  | venue-garden-state-bar | offline | active | — | 10000 | — | 2026-11-25 |

  Stripe `invoices.createPreview` for both subscriptions after the swap: subtotal / total / due =
  10000, one line each.
- **Not mine — never commit or revert:** Andrew's uncommitted edits in
  `components/fantasy/FantasyHome.tsx`, `components/nfl-pickem/NFLPickEmLeaderboard.tsx`,
  `components/nfl-pickem/NFLPickEmRewardBanner.tsx`, `components/nfl-pickem/NFLTiebreakerCard.tsx`,
  `components/venue/GameIdentityPanel.tsx`, `tests/components.player-pending.test.ts`,
  `.vscode/settings.json`. Commit by explicit path list, never `git add -A`.

### 3. Decisions already made (do not re-ask)

Everything in plan §2 and the Phase 1 handoff §3, plus:

- **Check-paying (offline) accounts never lapse automatically** (Andrew, 2026-10-11). The
  offline-expiry sweep in `app/api/cron/billing/route.ts` is deleted; the cron response no longer has
  `offlineExpired`. Only admin Revoke (`cancelSubscription` in `lib/billing.ts`, tokenless → status
  `cancelled`) ends an offline grant. `current_period_end` on an offline row = what the latest check
  covered, not a deadline. Admin grant-form copy updated to say so. Pinned by
  `tests/api.cron.billing-offline-never-lapses.test.ts` (renamed from `…-offline-expiry…`).
- Andrew approved: `supabase db push` of Phase 1, committing/pushing Phase 1, and the live swap of
  both card subscriptions.
- My calls: the graduated Price hangs off the **list price's Product**; `getStripePriceId()` stays the
  flat list price (custom rates in `lib/billingCustomPrice.ts` read its Product); new sibling readers
  `getStripeGraduatedPriceId()` / `getCheckoutPriceId()`; env var Production-only.

### 4. Files created or changed in Phase 2

- `lib/stripe.ts` — `getStripeGraduatedPriceId()` (single reader of `STRIPE_GRADUATED_PRICE_ID`),
  `getCheckoutPriceId()` (graduated, else list). Header documents the env var.
- `app/api/owner/billing/checkout/route.ts` — uses `getCheckoutPriceId()` (line items still
  `quantity: 1`).
- `lib/venuePricing.ts` — `graduatedStripeTiers()` (Stripe `prices.create` tier params from
  `VENUE_PRICE_TIERS`) and `graduatedPriceProblems(price)` (every way a live Price disagrees with our
  tiers; `[]` = match; requires `expand: ["tiers"]`).
- `scripts/create-graduated-price.cjs` → `npm run billing:graduated-price` (dry run) /
  `-- --apply`. Find-or-create by lookup key; exits 1 if the live Price mismatches, or if
  `STRIPE_GRADUATED_PRICE_ID` disagrees with the lookup key. **This is the plan §4.2 live-tier check —
  re-run it any time.**
- `scripts/migrate-subscriptions-to-graduated.cjs` → `npm run billing:migrate-to-graduated` (dry run)
  / `-- --apply`. Skips offline, no-subscription, non-live, scheduled, cancelling, multi-item,
  custom-rate (`custom_monthly_…`), unexpected-price, quantity≠1, and any sub whose next-invoice
  preview would change. Writes nothing to our DB (the webhook mirrors); `--apply` waits 15 s and prints
  the mirror. Re-runnable: now reports both as "already graduated".
- `app/api/cron/billing/route.ts` + `components/admin/sections/BillingSection.tsx` +
  `app/api/admin/billing/route.ts` (comment) — the never-lapse change.
- Tests: `tests/lib.stripe-price-ids.test.ts` (new), `tests/lib.venue-pricing.test.ts` (+5),
  `tests/api.owner.billing-resume-vs-checkout-matrix.test.ts` (mock gains `getCheckoutPriceId`),
  `tests/api.cron.billing-offline-never-lapses.test.ts` (rewritten), `tests/api.cron.billing.reveal.test.ts`
  / `…rehide.test.ts` (dropped the sweep's mock branch and `offlineExpired`).
- `package.json` — `billing:graduated-price`, `billing:migrate-to-graduated`.
- Docs: plan status line + Phase 2 heading + §2 row 10; `CLAUDE.md` multi-venue section; this file.

### 5. Facts and traps

- **The webhook MUST be the Phase 1 code before any subscription is on a tiered price** — the old
  code mirrored `price.unit_amount`, which is `null` for a tiered price. That is why the swap ran only
  after the `c1ce489` deploy was Ready. It mirrored correctly: `amount_cents 10000`, `quantity 1`,
  `stripe_price_id price_1UPOUD…` within 15 s.
- **Stripe API version is `2026-06-24.dahlia` (stripe-node 22.3.1).** `invoices.createPreview({
  subscription, subscription_details: { items, proration_behavior } })` works for "what would this
  change cost" — Phase 3's quote route should use it (plan §2: the "today" figure comes from Stripe).
  `require("stripe")` in a `.cjs` returns the constructor directly.
- **`setCustomPrice` refuses tiered prices** ("no flat per-cycle amount") and a custom rate swaps the
  item OFF the graduated Price onto a flat `custom_monthly_<cents>` Price. Fine at quantity 1; a
  custom-rate bill can't take an add as a quantity change on the graduated Price. Phase 3's "healthy
  bill" check should refuse an add unless the item's price is the graduated Price (or route custom
  rates to Phase 6's design). Admin "set custom price" on a chain is Phase 6.
- **Checkout on a tiered Price**: Stripe's hosted page may describe the price differently from a flat
  one; not visually verified (see Andrew item above).
- The `.env.local` append (`echo '…' >> .env.local`) was **denied** by the permission layer this
  session even though CLAUDE.md allows it; `cut -d= -f1 .env.local` was denied too. Don't work
  around it — ask Andrew.
- `npm run build` re-creates iCloud `… 2.ts` duplicates under `.next/types` sometimes, which break
  `tsc` (`Duplicate identifier 'LayoutProps'`). Fix: `find .next -name "* 2.*" -delete` (generated
  output only). Build also flips `next-env.d.ts`; restore the `./.next/dev/types/routes.d.ts` line
  with `sed`, never `git checkout --`.
- `vercel ls --prod | grep` is unreliable for polling; `vercel inspect <url> | grep status` works.

### 6. How to build, run and test

```
npx tsc --noEmit
npm run lint
npm run test                          # 3,763 pass / 13 skipped / 0 fail (2026-10-11)
npm run build                         # passes (don't run concurrently with tsc)
npm run billing:check-venue-billing   # read-only, production
npm run billing:graduated-price       # read-only unless --apply; checks live tiers
npm run billing:migrate-to-graduated  # read-only unless --apply
```

Verified this session: all of the above; production DB rows and Stripe previews as in §2.
**Unverified:** the Stripe-hosted Checkout page's wording on the tiered price; the partner Billing
page was not opened in a browser (its data — `amount_cents`, status, period end — is byte-identical
to before, so it should render the same). No new signup has gone through the graduated Price yet.

### 7. Open questions for Andrew

1. Add `STRIPE_GRADUATED_PRICE_ID` to local `.env.local` (one-liner above).
2. (Phase 6, not blocking — carried from Phase 1 §7 item 2) custom rate on a chain: coupon vs.
   price-swap mechanism, and "custom rate AND promo coupon" stacking.
3. (Not blocking) Should offline accounts show anything when their "paid through" date passes — e.g.
   an admin-list "check overdue" hint? Today they simply stay active with a past date. Not built.

### 8. Recommended first steps for Phase 3 (Opus 5.5, xhigh)

1. Read plan §4.1, §4.3, §5 Phase 3, §7, then both handoffs. `git status` — confirm nothing of
   Andrew's is staged.
2. `npm run billing:graduated-price` and `npm run billing:check-venue-billing` — confirm the Price
   still matches and every bill is 1 venue.
3. Create `lib/multiVenueBilling.ts` with `isMultiVenueBillingEnabled()` (flag off by default) and
   put the membership writers in `lib/venueBilling.ts` (the contract test forbids
   `billing_subscription_venues` elsewhere).
4. Write the `claim_venue_addition` RPC migration (grants per
   `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`; RPCs need no table grants but check the contract
   test), prove it on PGlite (`npm run test:multi-venue-billing-sql` pattern), and ask Andrew before
   `supabase db push`.
5. Build quote → add → webhook completion with mocked Stripe; every Stripe write keyed on the ledger
   row's `idempotency_key`. Never test against live Stripe from the dev server (shared production DB,
   live keys — plan §7 trap 6).
6. Write `docs/multi-venue-volume-billing-plan_PHASE_3_HANDOFF.md` and update the plan status line.
