# Multi-Venue Volume Billing — Phase 6.7 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phases 6.6–6.9"). This note closes **Phase 6.7 (Rejoin UI)** and opens
**Phase 6.8 (display rate from the lookup key; admin role on the ledger; shared helper)**. Earlier handoffs
(`…_PHASE_1_` … `…_PHASE_6.6_HANDOFF.md`) still hold for what they describe.

---

## For Andrew (plain English)

**What changed.** The screens for Phase 6.6 now exist, so a stranded venue has a visible way back:

- **Partner's Billing page:** a venue whose old bill ended (or that was taken off a bill that has since ended) now appears in
  the "Venues on this bill" card with the line "Not on your bill — its old bill ended" and an **Add back** button — the same
  paid "Add back" a removed venue already had (quote, confirm, charged the prorated price first). On a check-billed account
  there is no button; the line says to email partnerships@hightopchallenge.com.
- **No more dead "Resubscribe" at the top.** If a partner's old cancelled bill used to lead the Billing page with a
  Resubscribe button (which the server refuses anyway), it is now hidden whenever their live bill is shown with Add back.
- **Admin → Partner Billing:** such a venue shows an amber **Lapsed** badge and "Bill cancelled — can rejoin their bill"; its
  greyed "Grant offline" button explains why in plain words; and **Link a venue to a partner** now lists these venues (and
  venues removed from a bill), already tied to their partner and locked to "Add to their bill".

**Is it live?** No. Built and tested, **not committed**, no database change, and the multi-venue flag is still off (the
partner card only appears with the flag on). Admin screens work today. In production nobody is in this situation (3 live
bills, none cancelled), so there is nothing to see until someone is.

**One decision I made for you:** the plan said the admin picker should offer *lapsed* venues. I also made it offer venues
*removed from a bill*, because Phase 6.6's server already accepts them and it is the only way back for a check-billed account.
Easy to take out (one condition in the admin route) if you'd rather not.

**What needs you:** say whether to commit 6.6 + 6.7 (path list in §2). Nothing else is waiting on you for 6.8.

---

## For the next agent (Phase 6.8)

### 1. Goal and scope

**Phase 6.8** (plan §5, **Opus 5.5, high**), review 6.5 findings #3, #4, #5:
- **#3** add `billing_subscriptions.stripe_price_lookup_key text` (nullable); webhook, `lib/billingCustomPrice.ts` and Checkout
  mirror it beside `stripe_price_id`; `billRateFromMirror` applies the same `CUSTOM_PER_VENUE_LOOKUP_PREFIX` rule. Backfill via a
  read-only Stripe listing script with a dry run.
- **#4** add `billing_venue_additions.membership_role text not null default 'added'` (check `added`/`admin`); admin card attach
  sets `'admin'` in the same `updateAddition` that records `venue_id`; `completeAddition` passes it on.
- **#5** one `isMissingFunction(error, name?)` in e.g. `lib/supabaseRpcErrors.ts`, used by `lib/venueAddition.ts`,
  `lib/venueRemoval.ts`, `lib/billingCustomPrice.ts`.
- One migration (`supabase migration new …`; existing tables → no new grants, still run the grants contract test). **`supabase
  db push` only on Andrew's go-ahead; migration before app.** Prove the SQL on PGlite as 6.1 did.

**Out of scope:** 6.9 (re-review, CLAUDE.md multi-venue section, commit), Phase 7, any push.

### 2. Starting state

- Branch `main`. Local commits ahead of `origin/main`, **not pushed**: `6c5a178` (6), `a83da94` (6.1), `636410c` (6.2),
  `54af6e3` (6.3–6.5).
- **Phases 6.6 and 6.7 are uncommitted** (no migration). Commit with an explicit path list, never `git add -A`, and only on
  Andrew's say-so. 6.6's list is in `…_PHASE_6.6_HANDOFF.md` §2; 6.7 adds these (all modified, none new):
  ```
  app/api/owner/billing/route.ts
  components/admin/billing/LinkVenueToPartner.tsx
  components/admin/sections/BillingSection.tsx
  components/owner/billing/BillVenuesPanel.tsx
  docs/multi-venue-volume-billing-plan_PHASE_6.7_HANDOFF.md
  lib/adminBillView.ts
  lib/billAccountView.ts
  lib/venueRemoval.ts
  tests/components.owner-bill-venues-panel.test.ts
  tests/lib.admin-bill-view.test.ts
  tests/lib.bill-account-view.test.ts
  ```
  plus 6.7 edits inside files 6.6 already touched: `app/api/admin/billing/route.ts`, `lib/multiVenueBilling.ts`,
  `docs/multi-venue-volume-billing-plan.md`, `tests/api.billing-unbilled-venue-states.test.ts`,
  `tests/multi-venue-billing-contract.test.ts`.
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `NFLPickEmRewardBanner.tsx`, `NFLTiebreakerCard.tsx`,
  `components/venue/GameIdentityPanel.tsx`, `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Data:** no writes, no Stripe calls, no production query this phase. (6.6's read-only check: 3 live bills, 0 cancelled.)
  Flag `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` still off.

### 3. Decisions already made

- 6.6's decisions all stand (rejoin = re-point the membership row inside the paid add flow; never a transfer between partners).
- **Owner account view lists a rejoinable venue as a new `BillAccountVenue` state `"lapsed"`** (not `removed`), so the label can
  differ and a venue removed from a LIVE bill keeps `removed`. `venueAction` needed no change: any non-billed/leaving state on an
  active card bill is `add_back`.
- **A venue removed from a dead bill also reads `lapsed` on the owner card** (the classifier says `removed`; the route lists both
  kinds that carry an `ownerBillId`, deduped against the bill's own membership rows).
- **Dead bill hidden from `subscriptions`** only with the flag on, only when cancelled, and only if EVERY venue it covers can
  rejoin a live bill that is itself in the list. A partner whose only bill is cancelled still sees it (Resubscribe is right).
- **Admin picker also offers `removed` venues** (see Andrew's note above) and hidden venues only with `rehidden_at` (mirrors the
  server rule in `lib/adminVenueAttach.ts`); unlinked and comped venues stay visible-only as before.

### 4. Files and how they fit

- `lib/multiVenueBilling.ts` — `BillAccountVenue.state` gains `"lapsed"`.
- `lib/venueRemoval.ts` `loadBillAccount(bill, ownerVenueIds, nowMs, rejoinVenueIds = [])` — appends `lapsed` rows for ids not
  already among the bill's membership rows; names come from the SAME venues read (no extra query); `billedVenueCount` unchanged.
- `app/api/owner/billing/route.ts` — `rejoinBillOf(state)` (lapsed/removed with `ownerBillId`); fills `rejoinByBill` from the
  existing `unbilledVenueStates` call (no extra read); with the flag on, drops covered-only-by-rejoinable cancelled bills and
  passes each live bill its `rejoinByBill` ids.
- `lib/billAccountView.ts` — `venueStateLabel(venue, bill)` (moved out of the panel; adds the lapsed wording and the
  check-billed "email" wording). `components/owner/billing/BillVenuesPanel.tsx` uses it; muted name for `removed`/`lapsed`.
- `app/api/admin/billing/route.ts` — list rows gain `lapsed` and `grantOfflineBlockedMessage` (`grantOfflineBlocked` literal
  unchanged — a contract test pins it); `attach-options` selects `rehidden_at`, returns `state: "unlinked"|"comped"|"lapsed"|"removed"`.
- `lib/adminBillView.ts` — `LAPSED_LINE`, `AttachVenueOption`, `attachVenueOptionLabel`. `BillingSection.tsx` — Lapsed badge,
  line, blocked note. `LinkVenueToPartner.tsx` — labels and the locked-partner sentence by state.

### 5. Facts, traps, and what to add to the Phase 7 device checklist

- The resolver returns a lapsed venue's DEAD bill (rule 3) — that is why `uncovered` contains it and why the dead bill reached
  `subscriptions`. A venue the partner's live bill already covers never enters `uncovered`.
- `docs/multi-venue-billing-device-checklist.md` does **not exist yet** (Phase 7 creates it). Screens to put on it: partner
  Billing with a lapsed venue (card bill: line + Add back → quote → pay; check bill: line + email, no button; no Resubscribe at
  the top); admin Partner Billing row (Lapsed badge, line, greyed Grant offline with the lapsed sentence); Link a venue picker
  (lapsed/removed entries locked to their partner, Add to their bill only). Phone widths for the owner card; 12px text floor.
- Tests that mock the in-memory DB (`tests/api.billing-unbilled-venue-states.test.ts`) need `afterEach` cleanup of the flag env
  var when they turn it on (done in the new describe).
- Older traps still hold: `npm run build` flips `next-env.d.ts` — restore with
  `sed -i '' 's#./.next/types/routes.d.ts#./.next/dev/types/routes.d.ts#' next-env.d.ts` (never `git checkout --`); don't run
  typecheck and build together; scratch scripts need `NODE_PATH="$PWD/node_modules" node --env-file=.env.local …`; never POST a
  real add from a dev server.

### 6. Build, run, test — verified 2026-10-11

- `npx tsc --noEmit` clean; `npm run lint` clean (usual Babel size note); `npm run test`: **343 files passed, 1 skipped; 4,079
  tests passed, 13 skipped, 0 failed**; `npm run build` succeeded, `next-env.d.ts` restored (no diff).
- New tests: owner billing GET (lapsed listed + dead bill dropped, removed-from-dead-bill, removed-from-live listed once, flag
  off unchanged, only-cancelled-bill kept); admin list `lapsed` + blocked message; attach-options lapsed / removed / hidden rules;
  `venueAction` / `venueStateLabel`; panel Add back for a lapsed venue (posts `readdVenueId` + `quotedVenueCents` through the
  anchor) and no button on a check bill; label helpers; two contract pins.
- **Mutation checks** (restored from scratchpad copies, 41/41 green after): never dropping the dead bill → 1 fail; rejoin only for
  `lapsed` → 1 fail; no `rehidden_at` allowance in the picker → 1 fail.
- **Unverified:** no browser pass (partner card is flag-gated; admin screens not viewed on a device); the 12px floor is by the
  existing `text-caption`/`text-xs` classes, covered by `tests/text-size-floor-contract.test.ts` passing.
- **Cost:** no new queries on any path (names merged into the existing venues read; states reuse the existing classifier read;
  attach-options adds one column to an existing read). Nothing recurring.

### 7. Open questions for Andrew

- Commit 6.6 + 6.7 now? (Explicit path lists above and in the 6.6 handoff.)
- Keep the admin picker offering `removed` venues, or lapsed only as the plan literally said?
- 6.8 will need `supabase db push` approval (two columns on existing tables).

### 8. Recommended first steps for Phase 6.8 (Opus 5.5, high)

1. `git status` / `git log origin/main..main` — see whether 6.6/6.7 were committed; build on the working tree either way.
2. Read plan §5 "Phase 6.8", `lib/venuePricing.ts` (`billRateFromMirror`, `billRateFromPrice`, `CUSTOM_PER_VENUE_LOOKUP_PREFIX`),
   the webhook's subscription mirror, `lib/billingCustomPrice.ts`, `app/api/owner/billing/checkout/route.ts`,
   `lib/venueAddition.ts` (`updateAddition`, `completeAddition`) and the three `isMissingFunction` copies.
3. `supabase migration new …` (never edit existing migrations), prove on PGlite, run the grants contract test; do NOT
   `supabase db push` without Andrew's go-ahead. Write `…_PHASE_6.8_HANDOFF.md` and update the plan's status line.
