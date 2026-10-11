# Multi-Venue Volume Billing — Phase 5 Handoff (written 2026-10-11)

Plan: `docs/multi-venue-volume-billing-plan.md`. This note closes **Phase 5 (Remove at end of month + Billing
account view)** and opens **Phase 6 (admin & edge tools)**. Earlier handoffs (`…_PHASE_1_` … `…_PHASE_4_HANDOFF.md`)
still hold for what they describe.

---

## For Andrew (plain English)

**What changed.** A partner with several venues can now take one off their bill — and change their mind:

- **Billing page → "Venues on this bill".** It lists every venue on the bill, the price line (e.g. "1 × $100 · 1 ×
  $75") and next month's total. Each venue has one button:
  - **Remove** — asks "Take *Second Bar* off your bill? It stays live for players until Oct 20 (the end of the month
    you've paid for), then leaves… no refund for this month, and you can undo this until then." Nothing is refunded
    or charged; Stripe simply bills one venue fewer from the next renewal. The only venue left can't be removed
    (cancelling is the way to stop paying).
  - **Undo** — while a venue is "Leaving Oct 20". Free, because that month is already paid.
  - **Add back** — once a venue has left. This is a normal paid add: it shows the price and "Charged today", then
    charges the card on file (or Stripe's secure page if the bank asks), and the venue is live again.
- **Every night** the existing billing job takes off any venue whose paid month has ended: it disappears from the
  players' venue list (players already in it are unaffected, like any hidden venue) but stays in the partner's account.
- **Removing the "main" venue** (the one the subscription was opened for) quietly moves the subscription onto another
  of their venues, so nothing breaks later.

**Your answer recorded.** "Claim an existing venue" stays **Option A** — an address we already have still says "email
partnerships@…" (plan §2 row 11). Phase 4 was **committed as `59d7a55`** (not pushed).

**Is it live?** **No.** It's behind the same off switch (`NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED`), **not committed,
not pushed**, and it needs **one database change applied** (`20261011210033_venue_bill_changes.sql`) before the switch
is turned on. The code is safe to deploy before that change (I made it tolerate the change being missing).

**How I checked it.** 3,904 automated tests pass (0 fail), type-check, lint and build are clean, the database change was
run twice on a throwaway Postgres (PGlite) with ~40 checks, and I looked at the Billing page in a real browser at phone
size with every billing call **faked**. Nothing touched Stripe or your database. Not yet seen: a real phone, a real
Stripe remove/undo, a real Add back charge — that's Phase 7 with you.

**What needs you.** (1) Say when to **commit/push** Phase 4 + 5. (2) Approve **`supabase db push`** for
`20261011210033_venue_bill_changes.sql` (only that file is pending — I checked with a dry run). Nothing else blocks Phase 6.

**What's left:** Phase 6 (admin tools), Phase 7 (copy, device pass, switch on, your live test).

---

## For the next agent (Phase 6)

### 1. Goal and scope of Phase 6

Plan §5 "Phase 6" (**Opus 5.5, high**): admin billing list shows venue count / band / monthly total per account;
Activate-a-Venue for an **existing** owner offers "Add to their bill" (runs the Phase 3 server flow, charges their card)
vs "Free / comped" (link only, never on a bill); offline (check) accounts with several venues (suggested graduated
amount; admin attaches venues to the offline bill); custom negotiated rate on a multi-venue bill (Andrew §2 row 6:
**coupons apply on top of the bands, and admins must always be able to adjust what a subscription costs** — design the
mechanism; see Phase 1 handoff §7); a daily **report-only** Stripe-quantity-vs-billed-membership drift check inside
`/api/cron/billing` (`[MultiVenueBilling] quantity-drift`; never charges or credits). **Out of scope:** partner-facing
copy, device checklist, flag on (Phase 7). Don't change the money logic of `lib/venueAddition.ts` / `lib/venueRemoval.ts`
beyond what an admin path strictly needs.

### 2. Starting state

- Branch `main`. Last commit **`59d7a55`** (Phase 4, committed 2026-10-11, **not pushed**; `origin/main` is at `d63d720`).
- **Phase 5 is entirely uncommitted.** Commit path list (never `git add -A`):
  `CLAUDE.md`, `app/api/cron/billing/route.ts`, `app/api/owner/billing/route.ts`, `app/api/owner/venues/add/route.ts`,
  `app/api/owner/venues/add/quote/route.ts`, `app/api/owner/venues/remove/route.ts`, `app/owner/billing/page.tsx`,
  `components/owner/billing/BillVenuesPanel.tsx`, `docs/multi-venue-volume-billing-plan.md`,
  `docs/multi-venue-volume-billing-plan_PHASE_5_HANDOFF.md`, `lib/billAccountView.ts`, `lib/multiVenueBilling.ts`,
  `lib/rateLimit.ts`, `lib/venueAddition.ts`, `lib/venueBilling.ts`, `lib/venueRemoval.ts`,
  `scripts/test-multi-venue-billing-sql.cjs`, `supabase/migrations/20261011210033_venue_bill_changes.sql`,
  `tests/api.owner.venues-add.test.ts`, `tests/api.owner.venues-remove.test.ts`,
  `tests/components.owner-bill-venues-panel.test.ts`, `tests/lib.bill-account-view.test.ts`,
  `tests/multi-venue-billing-contract.test.ts`.
- **Not mine — never commit or revert:** Andrew's uncommitted edits in `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `components/nfl-pickem/NFLPickEmRewardBanner.tsx`,
  `components/nfl-pickem/NFLTiebreakerCard.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `tests/components.player-pending.test.ts`, `.vscode/settings.json`.
- **Migration `20261011210033_venue_bill_changes.sql` is NOT applied** to linked project `pkmxupsayzshvpirkaav`.
  `supabase db push --dry-run` (2026-10-11) lists it as the only pending file. Andrew must approve the push.
- Flags: `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` set nowhere. No env var added, no production data written, no Stripe
  object created or changed in Phase 5.

### 3. Decisions already made (do not re-ask)

Plan §2 (rows 1–11) and earlier handoffs, plus these Phase 5 calls (mine, documented):

- **Mutual exclusion via the SAME advisory lock.** `claim_venue_bill_change` locks `'billing_venue_addition:' || bill id`
  (the add's key). A change refuses while an add is `pending`/`requires_action` (`busy_addition`); `claim_venue_addition`
  was **replaced** (same signature) to answer `busy` with no row while a change is `pending` → the add refuses
  `addition_in_progress`. Reason: every write is an ABSOLUTE quantity, and any `items` update voids an add's pending
  3-D Secure invoice (Phase 3 handoff §5).
- **Order: claim → Stripe → finish.** The membership change and re-anchor are applied by `finish_venue_bill_change`
  only after Stripe accepted the new quantity, in one transaction. An ambiguous Stripe error leaves the row `pending`;
  after the 10-min lease (`VENUE_ADDITION_LEASE_MS`, shared) it is settled from Stripe's quantity: `= after` → done,
  `= before` → failed, else failed as drift (logged). Settled by the next change on the bill, by the add/quote routes
  (`settleStaleVenueChangesForBill`), and by the daily cron.
- **Re-anchor at Remove time**, not at removal time: the oldest other BILLED venue that anchors no `billing_subscriptions`
  row of its own (that column is UNIQUE) becomes the anchor; none → `needs_support` (admin). Stripe `metadata.venueId` is
  updated in the same `subscriptions.update`. The webhook already keys tracked rows on `stripe_subscription_id`, so the
  metadata is only a hint (Phase 1).
- **Undo only before `remove_at`.** After it, Stripe has renewed without the venue, so a free Undo would give a month
  away; it's refused `too_late` and the partner uses the paid **Add back**.
- **Add back = the normal add flow with `readdVenueId`** (no new venue; skips the address scan and venue insert). Only a
  venue of this owner whose membership row is on THIS bill and has left it (`removed_at` set, or `remove_at` passed);
  still leaving → `readd_use_undo`; billed → `venue_already_yours`; other bill / never billed (e.g. `venue-hightop-test`)
  → `venue_unavailable`. `addVenueToBill` now **revives** a same-bill row on a paid add (Phase 3 refused to); it still
  refuses another bill's row. A declined Add back never deletes the venue (`deleteUnbilledAddedVenue` refuses anything
  ever billed; it now logs a `warn`, not an `error`).
- **Hiding a removed venue** uses `hidden = true, rehidden_at = now` ("we hid this") — for admin-made venues too — so the
  Add back completion can un-hide it (`completeAddition` gained a second reveal filtered on `rehidden_at IS NOT NULL`;
  a brand-new venue has no stamp, so it's a no-op for normal adds). Order is hide → stamp `removed_at` (conditional);
  if the stamp no longer matches (an Add back landed in between) the hide is undone.
- **Remove is allowed on a `past_due` bill** (it only lowers the next invoice); Undo and Add back need `active`.
  Offline, cancelling, custom-rate, scheduled and pending-update bills are refused, like adds.
- **"Not on your bill / Add back" lives on the Billing page**, not in the dashboard dropdown (plan §4.4 said dropdown).
  The dropdown still lists a removed venue normally (it's still the partner's venue); Phase 7 may add a hint there.
- **No amounts in the Remove confirm** (the page never prices anything; it says "your bill goes down from the next
  renewal"). The account view's numbers all come from the server (`loadBillAccount`).
- **The account view is flag-gated in `GET /api/owner/billing`** (flag off = byte-identical response, pinned by a test).

### 4. Files created or changed

**New**
- `supabase/migrations/20261011210033_venue_bill_changes.sql` — table `billing_venue_changes` (service_role only, RLS
  forced, `updated_at` trigger), `claim_venue_bill_change(text, uuid, uuid, text, text, timestamptz)`,
  `finish_venue_bill_change(uuid, text, text)`, and the replaced `claim_venue_addition`. Outcomes are documented in the file.
- `lib/venueRemoval.ts` — `loadVenueChangeContext`, `startVenueChange`, `reconcileVenueChange`,
  `settleStaleVenueChangesForBill` (never throws), `reconcileStaleVenueChanges` + `applyDueVenueRemovals` (cron),
  `loadBillAccount` (Billing page), `venueChangeResponse`, `changeRateLimitRefusal`. Missing ledger table = empty (warned once).
- `app/api/owner/venues/remove/route.ts` — flag → `requireOwnerAuth` → `rateLimit("venueChangeOwner")` (30/h) → body
  `{ venueId, idempotencyKey, action? }` → context → change.
- `lib/billAccountView.ts` (pure: `breakdownLabel`, `venueAction`, `removeConfirmText`, `interpretVenueChangeReply`,
  `changeDoneMessage`) and `components/owner/billing/BillVenuesPanel.tsx` (the card + inline Add back with quote, one
  idempotency key per Confirm re-sent on "Check again"/auto re-asks, Stripe link only via `isStripeHostedUrl`).
- Tests: `tests/api.owner.venues-remove.test.ts` (20, end to end on `tests/helpers/inMemorySupabase.ts` with JS ports of
  the three RPCs), `tests/components.owner-bill-venues-panel.test.ts` (5), `tests/lib.bill-account-view.test.ts` (6).

**Changed**
- `lib/venueBilling.ts` — `BillMembership`, `isBilledMembership`, `hasLeftBill`, `billMembershipOf`, `billMemberships`;
  `venueIdsOnBill(…, { billedOnly })`; `billedVenueCount` now = billed only (matches the RPC; was "covered");
  `addVenueToBill` revives a same-bill row.
- `lib/venueAddition.ts` — a few helpers exported (no logic change); `StartVenueAdditionArgs.readdVenueId`;
  `readdableVenue`; steps 5–6 skipped for an Add back; second reveal in `completeAddition`; cleanup log level.
- `app/api/owner/venues/add/route.ts` (accepts `readdVenueId`, skips address validation for it; settles stale changes),
  `…/add/quote/route.ts` (settles stale changes), `app/api/cron/billing/route.ts` (two new jobs, response keys
  `venueChanges`, `venueRemovals`), `app/api/owner/billing/route.ts` (`account` when flag on),
  `app/owner/billing/page.tsx` (renders the panel when `account` is present), `lib/multiVenueBilling.ts` (change codes +
  messages, `BillAccount` types, add code `readd_use_undo`), `lib/rateLimit.ts` (`venueChangeOwner`).
- `scripts/test-multi-venue-billing-sql.cjs` — section 9 (Phase 5 SQL). `tests/multi-venue-billing-contract.test.ts` —
  3 new tripwires (ledger/RPC single user, no proration + one Stripe write, route gate order + cron jobs).
  `tests/api.owner.venues-add.test.ts` — the `addVenueToBill` test now pins the revive rule.

### 5. Facts and traps

- **Admin venue delete still refuses a bill's anchor while ANY member row exists, removed ones included**
  (`lib/admin.ts` ~2559, `venueIdsOnBill(…, { includeRemoved: true })`) — correct, because a removed row still holds
  the `ON DELETE RESTRICT` on the bill. Phase 6 needs an admin path (clear removed rows, or move the bill) if Andrew
  wants such deletes. Deleting a NON-anchor removed venue works (its row cascades).
- **Removed venues carry `rehidden_at`**, so the admin "Hidden venues" panel shows them as **lapsed** with a Restore
  button. `restoreLapsedVenue` is billing-agnostic and only for self-serve-stamped rows: an admin Restore of a removed
  self-serve venue makes it visible while it's on no bill (the lapsed re-hide job would re-hide it only if
  `VENUE_REHIDE_ENABLED`). Phase 6 may want the panel to label these "removed by partner" instead.
- **An admin attach (Phase 6, `addVenueToBill(…, "admin")`) now revives a same-bill removed row** but does NOT un-hide
  the venue — un-hide it explicitly (clear `rehidden_at` in the same write — standing rule).
- **Phase 6 admin tools that write Stripe quantity must take the same lock** (call `claim_venue_bill_change`-style
  claims or refuse while `billing_venue_additions`/`billing_venue_changes` have in-flight rows).
- The drift check should compare Stripe quantity with `billedVenueCount` (billed = `removed_at IS NULL AND remove_at IS
  NULL`), NOT `venueIdsOnBill` (covered). `billing_venue_changes.failure_reason` set on a `done` row = recorded drift.
- **Stripe customer portal:** not checked whether the portal configuration lets a partner change quantity themselves.
  If it does, a partner could bypass the ledger. Check the portal config (read-only) in Phase 6/7.
- `remove_at` = the subscription item's `current_period_end` at Remove time. A billing-cycle anchor change between
  Remove and the period end isn't handled (we never change anchors).
- Dev server = live Stripe + shared DB. Never exercise the real remove/add routes from a dev server. **Browser-testing
  recipe used this session** (worked): `rsync -a --exclude /node_modules --exclude /.next --exclude /.git --exclude
  '/.env*' --exclude /native --exclude /docs ./ <scratch>/clone/`, `cp -Rc node_modules <scratch>/clone/node_modules`,
  then in the clone `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED=true NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=true
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev --webpack -p 3101`; drive
  it with Playwright (`node_modules/playwright` exists in the repo) with every `/api/**` faked via `page.route`. Stop it
  by its own PID tree only (`next-server` was a grandchild here; find it with `lsof -ti tcp:3101`). Never `pkill`.
  Andrew's `next dev` on :3000 was **not running** this session (I never touched it).
- `npm run build` flips `next-env.d.ts`; restore with
  `sed -i '' 's#import "./.next/types/routes.d.ts";#import "./.next/dev/types/routes.d.ts";#' next-env.d.ts` and
  `find .next -name "* 2.*" -delete`. Done after this session's build. Don't run `tsc` and `build` concurrently.
- PGlite: `@electric-sql/pglite@0.2.17` was installed in this session's scratchpad (`<scratch>/pg/node_modules/…`); the
  `npm run test:multi-venue-billing-sql` default path (`../tmp/bingo-phase4-pg/…`) still doesn't exist. Reinstall:
  `mkdir -p <dir> && cd <dir> && npm init -y && npm i @electric-sql/pglite@0.2.17`.
- `.env.local` was not read or touched.

### 6. How to build, run and test

```
npx tsc --noEmit
npm run lint
npm run test                    # 3,904 pass / 13 skipped / 0 fail (2026-10-11; was 3,869 after Phase 4)
npm run build                   # passes; lists ƒ /api/owner/venues/remove
npx vitest run tests/api.owner.venues-remove.test.ts tests/api.owner.venues-add.test.ts \
  tests/components.owner-bill-venues-panel.test.ts tests/lib.bill-account-view.test.ts tests/multi-venue-billing-contract.test.ts
MULTI_VENUE_PGLITE_MODULE=<dir>/node_modules/@electric-sql/pglite node scripts/test-multi-venue-billing-sql.cjs
supabase db push --dry-run      # read-only; lists 20261011210033_venue_bill_changes.sql only
```

**Verified:** all of the above; the SQL file applied twice on PGlite with the Phase 1/3 files (claims, busy rules both
ways, last venue, re-anchor choice incl. a venue that anchors its own old bill, no_new_anchor, undo/too_late/not_on_bill,
drift recording, grants); a real headless-Chromium render of the Billing page at 390×844 with mocked APIs (list, states,
buttons, Add back quote panel; no horizontal overflow; no console errors). **Unverified / risky:** real Stripe
(`proration_behavior: "none"` quantity change + metadata merge, Add back charge, 3-D Secure); a real phone; the cron on
production data; the migration on the real database.

### 7. Open questions for Andrew

1. Commit/push Phase 4 (`59d7a55`) and Phase 5? (Safe to deploy: switch off; code tolerates the missing table.)
2. Approve `supabase db push` for `20261011210033_venue_bill_changes.sql` (must land before the switch is turned on).
3. Carried: the custom-rate mechanism on a chain (Phase 6 designs it; §2 row 6 is the rule).

### 8. Recommended first steps for Phase 6 (Opus 5.5, high)

1. Read plan §2, §5 Phase 6, Phase 1 handoff §7 (custom rate), this note §5. `git status`; confirm Phase 5 is committed
   and the migration applied (`supabase db push --dry-run` shows nothing) — ask Andrew, never push unasked.
2. Start with the report-only drift check (smallest, de-risks the rest): one bounded Stripe list per run inside
   `/api/cron/billing`, compare with `billedVenueCount`, log `[MultiVenueBilling] quantity-drift`.
3. Then the admin billing list (count / band / total from `lib/venuePricing.ts`), then "Add to their bill" vs "Free /
   comped" (reuse `startVenueAddition`; comped = `venue_owner_venues` link only), then offline multi-venue, then the
   custom-rate design (write it up for Andrew before building).
4. Any admin path that changes Stripe quantity must honour the per-bill lock (§5). Write `…_PHASE_6_HANDOFF.md` and
   update the plan's status line.
