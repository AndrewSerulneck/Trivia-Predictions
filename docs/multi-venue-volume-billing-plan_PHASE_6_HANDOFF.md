# Multi-Venue Volume Billing — Phase 6 Handoff (written 2026-10-11)

> **Superseded next step (2026-10-11):** a code review of this phase found 10 problems. Do **Phases 6.1–6.5**
> in the plan (§5) before Phase 7. Everything below about Phase 7 still applies once they are done.

Plan: `docs/multi-venue-volume-billing-plan.md`. This note closes **Phase 6 (admin & edge tools)** and opens
**Phase 7 (release)**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_5_HANDOFF.md`) still hold for what they describe.

---

## For Andrew (plain English)

**What happened this session**

1. **Phase 4 and Phase 5 are committed and pushed** to GitHub (`0931f55` is the newest commit on `main`).
2. **The Phase 5 database change is live.** I ran `supabase db push` for `20261011210033_venue_bill_changes.sql` and
   checked it: the new table exists (empty), both new database functions answer, and the public can't read the table.
3. **Phase 6 is built** — the admin tools. It is **not committed yet** (you didn't ask me to commit it). No new
   database change is needed for it.

**What Phase 6 adds (all in Admin → Partner Billing)**

- **The list now explains each bill**: e.g. "3 venues · 1 × $100 · 2 × $75 = $250/mo · 1 leaving". A second venue on
  the same bill says "On Pacific Street's bill" (its buttons live on the first venue's row, because they act on the
  whole bill). A venue given away free shows **Comped (free)**. A check-paying account with several venues shows its
  check amount and what the bands would be ("bands say $175").
- **"Link a venue to a partner"** (new button). Pick an activated venue, pick the partner, then:
  - **Add to their bill** — card customers: shows exactly what Stripe will charge today, then charges their card the
    same way as if they had added it themselves (they get the "Venue added" email). Check-paying customers: the venue
    is added, nothing is charged, and you're told what the bands would come to so you can update their amount.
  - **Free (comped)** — the venue is theirs, on no bill, never charged.
  - Charging a card this way stays **switched off until the release switch is on** (Phase 7), so nothing can charge a
    real card before your live test. Free and check-paying links work now.
- **Grant offline / Extend** now offers "the standard bands come to $X — Use $X" for a check account with 2+ venues.
- **Custom rate = a price per venue** (your choice today). E.g. $70 per venue → 3 venues = $210/mo, a 4th makes it $280,
  and a promo code still applies on top. On a one-venue account it's exactly today's custom rate. A new **"Back to
  standard pricing"** button puts them back on $100/$75/$60/$45. Partners on a custom rate can now add/remove venues
  themselves (once the switch is on) at their rate.
- **A daily safety check** (inside the existing nightly billing job): if Stripe ever bills a different number of venues
  than we think, it writes a warning to the logs. It never charges or refunds anyone.
- I checked (read-only) that **partners can't change their venue count through Stripe's own billing portal** — that
  option is turned off there.

**Is it live?** The admin list, the Link tool (free / check-paying), the custom-rate change and the nightly check go
live **when Phase 6 is deployed**. Card charging for an added venue, and everything partners see, stay behind the switch.

**What needs you:** say when to **commit and push Phase 6**. Then Phase 7 (wording, device checklist, switch on, your
live test).

---

## For the next agent (Phase 7)

### 1. Goal and scope of Phase 7

Plan §5 "Phase 7" (**Sonnet 5.5, medium, + Andrew**): partner-facing copy (Partner Manual and any "$100/mo" text;
`lib/multiVenueBilling.ts` message wording; `lib/email/partnerEmailCopy.ts` is Andrew's), write
`docs/multi-venue-billing-device-checklist.md`, set `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` in Vercel + **redeploy**
(it is `NEXT_PUBLIC_*`, inlined at build), then Andrew adds a real second venue to his own account and removes it,
watching the Stripe invoice and the Billing page. Optional Phase 7 polish (Phase 5 note): a "Not on your bill" hint in
the dashboard dropdown. **Out of scope:** any change to money logic in `lib/venueAddition.ts` / `lib/venueRemoval.ts` /
`lib/billingCustomPrice.ts`.

### 2. Starting state

- Branch `main`. `origin/main` = **`0931f55`** (Phase 5), with `59d7a55` (Phase 4) before it — both pushed 2026-10-11.
- **Phase 6 is entirely uncommitted.** Commit path list (never `git add -A`):
  `CLAUDE.md`, `app/api/admin/billing/route.ts`, `app/api/cron/billing/route.ts`, `app/api/owner/billing/route.ts`,
  `components/admin/billing/LinkVenueToPartner.tsx`, `components/admin/mobile/MobileVenuesSection.tsx`,
  `components/admin/sections/BillingSection.tsx`, `docs/multi-venue-volume-billing-plan.md`,
  `docs/multi-venue-volume-billing-plan_PHASE_6_HANDOFF.md`, `lib/adminBillView.ts`, `lib/adminVenueAttach.ts`,
  `lib/billingCustomPrice.ts`, `lib/billingQuantityDrift.ts`, `lib/multiVenueBilling.ts`, `lib/venueAddition.ts`,
  `lib/venueBilling.ts`, `lib/venuePricing.ts`, `lib/venueRemoval.ts`, `tests/api.owner.venues-add.test.ts`,
  `tests/api.owner.venues-remove.test.ts`, `tests/lib.admin-bill-view.test.ts`, `tests/lib.bill-rate.test.ts`,
  `tests/lib.billing-quantity-drift.test.ts`, `tests/lib.billingCustomPrice.test.ts`,
  `tests/multi-venue-billing-contract.test.ts`.
- **Not mine — never commit or revert:** Andrew's uncommitted edits in `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Database:** `20261011210033_venue_bill_changes.sql` applied to linked project `pkmxupsayzshvpirkaav` on
  2026-10-11 (Andrew approved). Verified with the service role: `billing_venue_changes` exists (0 rows);
  `claim_venue_bill_change` and `finish_venue_bill_change` answer `invalid` to empty args (they write nothing on that
  path); anon read refused (42501). `supabase db push --dry-run` should now show nothing pending. Phase 6 adds **no
  migration**.
- **Stripe:** nothing created or changed. One read-only call: `billingPortal.configurations.list` — the live default
  portal config `bpc_1Ttv4g1djkdMC76XWd5izGBJ` has `subscription_update.enabled = false`, cancel enabled, payment-method
  update enabled; `app/api/owner/billing/portal/route.ts` passes no `configuration`, so the default applies.
- **Production data:** nothing written. Flags: `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` still set nowhere.

### 3. Decisions already made (do not re-ask)

- **Custom rate on a chain = PER-VENUE RATE** (Andrew, 2026-10-11, AskUserQuestion; plan §2 row 6 updated). The admin
  types a per-venue monthly price; the subscription item moves to a flat `custom_monthly_<cents>` Price with its
  quantity KEPT; bill = rate × venues, no bands; partner adds/removes on that bill are priced at the rate; coupons still
  apply on top; "Back to standard pricing" (`setStandardPrice`) returns to the graduated Price. Rejected options: "discount
  only on chains", "% off every band".
- Mine (documented, change only with Andrew):
  - **Admin card "Add to their bill" is gated on the release flag** (`card_add_switched_off`) so no real card is charged
    through it before Phase 7's live test. Comped and check-billed links are not gated (no Stripe).
  - **Billing actions stay on the anchor venue's row.** Non-anchor rows show "On X's bill" and no buttons; the server's
    `not_bill_anchor` refusal is unchanged.
  - **Admin attach refuses** a hidden venue, a (0,0) room, another partner's venue, a venue with its own subscription,
    and any venue with membership history (that's the partner's Add back, or support). A Confirm on a venue already
    billed on that partner's bill answers `already_on_bill` (no second charge).
  - **Offline attach never changes the offline amount** — it returns the graduated suggestion; the grant form offers a
    "Use $X" button.
  - **The old flat $100 list Price (`STRIPE_PRICE_ID`) is NOT a per-venue rate**: a bill still on it is refused for
    add/remove (`billing_state`) — adding at $100 instead of $75 would be wrong. All live subscribers are on the
    graduated Price already (Phase 2).
  - **The custom-rate swap takes no advisory lock**; it refuses if either ledger has an in-flight row or Stripe holds a
    `pending_update`, and writes the quantity explicitly. Tiny residual race (admin swap at the exact moment a partner
    add starts) — the drift check would report it. A new lock RPC would need a migration (not approved this session).

### 4. Files created or changed

**New**
- `lib/billingQuantityDrift.ts` — `checkBillingQuantityDrift()` (cron) and pure `compareBillQuantities()`. Reads live
  card bills (status active/past_due, ≤1000), their memberships (one query), in-flight rows from both ledgers, and
  `stripe.subscriptions.list` (100/page, ≤10 pages, default = non-cancelled). Logs `[MultiVenueBilling] quantity-drift`,
  `subscription-missing-at-stripe`, `unexpected-subscription-items`, and a `drift-check` summary. Writes nothing.
- `lib/adminVenueAttach.ts` — `attachVenueToOwner({ venueId, ownerId, mode, preview, clientKey, prorationDate })`.
- `lib/adminBillView.ts` — pure: `AdminPartnerBill` type, `billSummaryLine`, `breakdownText`, `attachPreviewText`.
- `components/admin/billing/LinkVenueToPartner.tsx` — the modal (venue + partner pickers, Bill / Comped, Preview →
  Confirm, one idempotency key per Confirm re-sent by "Check again", Stripe link only via `isStripeHostedUrl`).
- Tests: `tests/lib.bill-rate.test.ts`, `tests/lib.billing-quantity-drift.test.ts`, `tests/lib.admin-bill-view.test.ts`.

**Changed**
- `lib/venuePricing.ts` — `BillRate`, `GRADUATED_RATE`, `rateMonthlyTotalCents`, `rateVenuePriceCents`,
  `rateBreakdown`, `billRateFromPrice` (live item), `billRateFromMirror` (our columns), `CUSTOM_PER_VENUE_LOOKUP_PREFIX`.
- `lib/venueAddition.ts` — `AddVenueContext.rate`; `billRateOfItem` replaces the graduated-only gate; quote and the
  "Venue added" email price by the rate (email reads `stripe_price_id, amount_cents, quantity` from the bill row);
  `ensureOwnerLink` exported; `StartVenueAdditionArgs.adminAttachVenue` (treated like an Add back: no venue created).
- `lib/venueRemoval.ts` — same rate gate; `loadBillAccount` prices the account view by the rate.
- `lib/billingCustomPrice.ts` — per-venue swap via shared `swapSubscriptionPrice` (in-flight refusal, explicit quantity,
  mirror `amount_cents = rate × quantity` + `quantity`); new `setStandardPrice`; result adds `quantity`,
  `monthlyTotalCents` (`amountCents` stays the per-venue rate, which is what the audit row records).
- `lib/venueBilling.ts` — pure `billedVenueCountFromRows`; `billMembershipsForBills` (one query for many bills).
- `lib/multiVenueBilling.ts` — admin attach types/codes/messages (`AdminAttachMode`, `AdminAttachPreview`,
  `ADMIN_ATTACH_MESSAGES` incl. `card_add_switched_off`).
- `app/api/admin/billing/route.ts` — GET adds `bill` + `comped` per row and `?resource=attach-options`; POST adds
  `attach-venue` and `set-standard-price` (audit row `custom_price` with `custom_price_cents` null).
- `app/api/cron/billing/route.ts` — last job `quantityDrift` (never fails the cron).
- `app/api/owner/billing/route.ts` — selects `stripe_price_id, quantity` and passes them to `loadBillAccount` (response
  shape unchanged; flag-off response still byte-identical).
- `components/admin/sections/BillingSection.tsx` — bill line on rows, non-anchor rows without actions, comped badge,
  Link button + modal, offline "Use $X" suggestion, per-venue custom-rate copy + "Back to standard pricing".
- `components/admin/mobile/MobileVenuesSection.tsx` — activation summary copy points at the Link tool.
- Tests updated: `tests/lib.billingCustomPrice.test.ts` (per-venue, in-flight refusals, `setStandardPrice`),
  `tests/api.owner.venues-add.test.ts` (per-venue quote; the flat list price and foreign tiers refused; 7 admin-attach
  cases incl. the flag gate and "declined card keeps the admin's venue"), `tests/api.owner.venues-remove.test.ts`
  (per-venue remove), `tests/multi-venue-billing-contract.test.ts` (ledger read-only users, drift report-only, admin
  attach only via `startVenueAddition`, custom swap keeps quantity + never prorates).

### 5. Facts and traps

- `deleteUnbilledAddedVenue` only deletes a HIDDEN, self-serve-stamped venue, so a declined admin card attach never
  deletes the admin-activated venue (pinned by a test). Keep that guard if you touch it.
- `billRateFromMirror` treats a bill with no `stripe_price_id` (offline) as graduated, and — when
  `STRIPE_GRADUATED_PRICE_ID` is unset in an environment — decides by whether `amount_cents` matches the bands.
- The admin list's card total is computed (rate × billed venues), not the mirror; `stripeQuantity` is shown only when
  Stripe's quantity mirror disagrees (a drift hint, "⚠ Stripe bills N venues").
- Still open from Phase 5 §5 (not done, by choice): admin venue delete still refuses a bill's anchor while ANY member
  row exists; removed venues show as "lapsed" in the admin Hidden venues panel (not "removed by partner").
- `AdminSelect`'s accessible name is its `ariaLabel` ("Venue", "Partner"), not the selected label — matters for
  Playwright selectors.
- Browser-check recipe (worked again this session): `rsync -a --delete --exclude /node_modules --exclude /.next
  --exclude /.git --exclude '/.env*' --exclude /native --exclude /docs ./ <scratch>/clone/`, `cp -Rc node_modules
  <scratch>/clone/node_modules`, then in the clone `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9
  NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev --webpack -p 3101`; `/admin/partner-billing` renders with
  `/api/admin/session` and `/api/admin/billing` faked via `page.route`. Stop it by `lsof -ti tcp:3101` only. Andrew's
  :3000 was not running and was not touched.
- `npm run build` flips `next-env.d.ts`; restored with the sed in the Phase 5 handoff §5 (done this session).

### 6. How to build, run and test

```
npx tsc --noEmit
npm run lint
npm run test                    # 3,941 pass / 13 skipped / 0 fail (2026-10-11; was 3,904 after Phase 5)
npm run build                   # passes
npx vitest run tests/api.owner.venues-add.test.ts tests/api.owner.venues-remove.test.ts tests/lib.billingCustomPrice.test.ts \
  tests/lib.bill-rate.test.ts tests/lib.billing-quantity-drift.test.ts tests/lib.admin-bill-view.test.ts tests/multi-venue-billing-contract.test.ts
supabase db push --dry-run      # read-only; should list nothing
```

**Verified:** typecheck, lint, full Vitest, build; a headless-Chromium render of `/admin/partner-billing` at 390×844 with
mocked APIs (bill lines, "On X's bill", comped badge, offline suggestion, Link modal Preview showing the quote, "Charge
and add" button, no horizontal overflow, no console errors); the migration on production (above); the portal config.
**Unverified / risky:** a real Stripe per-venue price swap at quantity > 1 (explicit `quantity` + `proration_behavior:
"none"`); a real admin card attach (gated until the flag is on); the drift check on production data (first run is the
next nightly cron after deploy — read its `[MultiVenueBilling] drift-check` line); a real phone.

### 7. Open questions for Andrew

1. Commit and push Phase 6? (Safe: no migration; partner-facing pieces and admin card charging stay behind the flag.)
2. Carried to Phase 7: switch on + redeploy, and his live add/remove test on Pacific Street.

### 8. Recommended first steps for Phase 7 (Sonnet 5.5, medium, + Andrew)

1. `git status`; confirm Phase 6 is committed (ask Andrew; never push unasked). Read plan §5 Phase 7 and this note.
2. After a deploy with Phase 6, read the first `[MultiVenueBilling] drift-check` log line (expect `checked=2 drift=0`).
3. Copy pass, then `docs/multi-venue-billing-device-checklist.md` (add/remove/undo/add back, admin Link with Bill and
   Comped, custom per-venue rate + back to standard), then the flag + redeploy with Andrew, then his live test.
4. Write `…_PHASE_7_HANDOFF.md` and update the plan's status line.
