# Multi-Venue Volume Billing — Phase 6.9 Handoff (written 2026-10-12)

Plan: `docs/multi-venue-volume-billing-plan.md` (§5, "Phases 6.6–6.9"). This note closes **Phase 6.9 (re-review of
6.6–6.8, gates, CLAUDE.md, commit)** and opens **Phase 7 (release)**. Earlier handoffs (`…_PHASE_1_` …
`…_PHASE_6.8_HANDOFF.md`) still hold for what they describe.

---

## For Andrew (plain English)

**What changed.** I ran a careful code review over Phases 6.6–6.8 (the "venue whose bill was cancelled can rejoin" work and
the price-label work). It found 10 things. I fixed the 6 that could show a wrong message, a wrong price or charge in a bad
moment, and listed the other 4 below with reasons.

- **No more dead-end message.** A partner who tries to resubscribe a venue whose old bill ended used to be told "Add it back
  from Billing", even though that button doesn't exist yet (the multi-venue switch is off) or ever (check-paying accounts).
  They are now told to email support. Your admin note says the same thing in admin words.
- **A venue taken off a bill is offered back on that same bill**, not on some other bill of the partner's.
- **Admin "Set rate" box:** a bill on an odd flat Stripe price now says so (instead of "standard bands") and offers "Back to
  standard pricing".
- **Price label safety net:** if a price was changed by the old live app (before this one deploys), the screen shows the
  bill's real amount instead of the standard bands.
- **Two safety guards:** the daily repair job now reads bills in pages (so it keeps working with many partners), and an
  "add a venue" stops before charging if our own record of it didn't save.

**Is it live?** No. Nothing here is committed, pushed or deployed. No database change in this phase. Multi-venue switch still off.

**What needs you:** say **"commit"** and I commit Phases 6.8 + 6.9 together (exact file list in §2 below). Then Phase 7
(release) is next. The 6.8 request still stands: until the new app deploys, avoid admin "Set rate" / "Back to standard
pricing" (or re-run `npm run billing:backfill-lookup-keys -- --apply` afterwards).

---

## For the next agent (Phase 7)

### 1. Goal and scope

**Phase 7 — Release (plan §5: Sonnet 5.5, medium, + Andrew).** Partner Manual + any price copy;
`docs/multi-venue-billing-device-checklist.md` (doesn't exist yet: add the 6.7 screens from `…_PHASE_6.7_HANDOFF.md` §5 and
the 6.9 copy below); the single push of all local commits; set `NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED` in Vercel and
**redeploy** (a `NEXT_PUBLIC_*` value is inlined at build time); Andrew adds a real second venue to his own account and
removes it, watching the Stripe invoice and the Billing page. After the deploy, re-run
`npm run billing:backfill-lookup-keys` (dry run) — expect "2 already right".

**Out of scope:** new features; the 4 listed findings (§3) unless Andrew asks.

### 2. Starting state

- Branch `main`. Local commits ahead of `origin/main`, **not pushed**: `6c5a178` (6), `a83da94` (6.1), `636410c` (6.2),
  `54af6e3` (6.3–6.5), `f867c94` (6.6–6.7).
- **Phases 6.8 and 6.9 are uncommitted, waiting on Andrew's word.** If he has said "commit" and it's not done, commit with this
  explicit list (never `git add -A`):
  ```
  CLAUDE.md
  app/api/admin/billing/route.ts
  app/api/owner/billing/checkout/route.ts
  app/api/owner/billing/route.ts
  app/api/webhooks/stripe/route.ts
  components/admin/sections/BillingSection.tsx
  docs/multi-venue-volume-billing-plan.md
  docs/multi-venue-volume-billing-plan_PHASE_6.8_HANDOFF.md
  docs/multi-venue-volume-billing-plan_PHASE_6.9_HANDOFF.md
  lib/adminBillView.ts
  lib/billAccountView.ts
  lib/billingCustomPrice.ts
  lib/multiVenueBilling.ts
  lib/rateLimit.ts
  lib/supabaseRpcErrors.ts
  lib/venueAddition.ts
  lib/venueBilling.ts
  lib/venuePricing.ts
  lib/venueRemoval.ts
  package.json
  scripts/backfill-price-lookup-keys.cjs
  scripts/test-multi-venue-billing-sql.cjs
  supabase/migrations/20261012033356_price_lookup_key_and_addition_role.sql
  tests/api.billing-unbilled-venue-states.test.ts
  tests/api.owner.venues-add.test.ts
  tests/api.owner.venues-remove.test.ts
  tests/api.webhooks.stripe-multi-venue.test.ts
  tests/lib.admin-bill-view.test.ts
  tests/lib.bill-account-view.test.ts
  tests/lib.bill-rate.test.ts
  tests/lib.billingCustomPrice.test.ts
  tests/lib.rejoin-state.test.ts
  tests/lib.supabase-rpc-errors.test.ts
  tests/multi-venue-billing-contract.test.ts
  ```
- **Never commit or revert Andrew's unrelated edits:** `components/fantasy/FantasyHome.tsx`,
  `components/nfl-pickem/NFLPickEmLeaderboard.tsx`, `NFLPickEmRewardBanner.tsx`, `NFLTiebreakerCard.tsx`,
  `components/venue/GameIdentityPanel.tsx`, `tests/components.player-pending.test.ts`, `.vscode/settings.json`, and the tracked
  stray `supabase/migrations/Warnings`.
- **Data:** no change in 6.9. Production (`pkmxupsayzshvpirkaav`) has 6.8's migration and backfill (see the 6.8 handoff §2).
  Flag off.

### 3. Review findings and what was done (`/code-review high`, `54af6e3` → working tree)

Fixed:
1. **`lapsed` / `removed` copy said "Add it back" where no Add back exists** (flag off, or a check-billed live bill; admin: a
   card bill with the flag off). `onPartnerBillMessageKey(state, audience)` (`lib/multiVenueBilling.ts`) now returns
   `rejoin_unavailable` there — partner "Email support and we'll put this venue back on your bill."; admin "…only once
   multi-venue billing is switched on." Card-vs-check comes from the classifier (`rejoin.byCard`, `billing_method` added to
   its existing bill select).
2. **A `removed` venue's rejoin target was the partner's first live bill**, not the live bill it left. `unbilledVenueStates`
   now gives `removed`/`lapsed` a `rejoin: { billId, byCard }` (removed: the bill it left while live, else the partner's live
   bill). `rejoinBillOf` (`lib/venueBilling.ts`) is the one home used by the owner Billing route and the admin picker
   (was two copies — also review #10's second half).
3. **Admin Set-rate sheet** (`components/admin/sections/BillingSection.tsx`): `unrated` now reads "flat Stripe price, not
   per-venue" and shows "Back to standard pricing" (server `setStandardPrice` already accepts any card bill).
4. **Stale graduated lookup key** (`billRateFromMirror`, `lib/venuePricing.ts`): the configured graduated id now wins first;
   the graduated KEY on another id counts only when `amount_cents` equals the bands for `quantity` (keeps 6.8's
   "another environment" case), else `null` (unrated → shows the real amount).
5. **`bringAnchorHome` recursion** now retries once (`retried` param), then `{ ok: false, error: "anchor-row-unresolved" }`.
   **`repairAnchorMemberships`** is keyset-paged by id, `ANCHOR_REPAIR_PAGE_SIZE = 200` (keeps `.in()` URLs ~8 KB and under
   PostgREST's 1,000-row cap). Today: 1 page = the same 2 reads/day.
6. **Ledger write miss** (`lib/venueAddition.ts`): if recording `venue_id` (+ `membership_role`) matches no `pending` row, the
   add returns `payment_unconfirmed` (503, logs `[VenueAddition] ledger-write-missed`) **before** Stripe (`ledgerMoved`). On
   the new-venue branch the hidden, stamped venue is left to the signup sweep (Tier B, 7 days). A write *error* already threw.

Listed, not changed (with reasons):
7. **`moveFromDeadBill` checks "old bill cancelled" and moves in two statements**, no SQL lock. Reviving a cancelled bill
   needs a new Checkout on its anchor, which Checkout refuses while the partner has a live bill (the 6.6 "why not an RPC"
   argument). Residual race only if a Checkout session opened *before* the rejoin completes *after* it; the daily
   quantity-drift report would flag it. Fixing properly needs an RPC + migration — Andrew's call if he wants it.
8. **Webhook first-sync re-reads the bill it just upserted** (`maybeBringAnchorHome` → `bringAnchorHome`): 2 extra small reads
   per NEW subscription only. Not worth widening `upsertSubscription`'s contract now.
9. **Other hand-rolled missing-function checks** remain in `lib/playerAccountDeletion.ts`, `lib/challengeCampaigns.ts`,
   `lib/admin.ts` (outside this plan; 6.8 scoped the helper to the billing files). `lib/rateLimit.ts` keeps a one-line wrapper
   so its call site is unchanged.
10. (#10's rejoin-predicate duplication — fixed under 2.)

### 4. Files changed in 6.9

`lib/venueBilling.ts` (`RejoinTarget`, `rejoinBillOf`, `rejoin` on states, `bringAnchorHome` bound, paged
`repairAnchorMemberships` + `repairAnchorPage`, `ANCHOR_REPAIR_PAGE_SIZE`, imports `OFFLINE_BILLING_METHOD` from
`lib/stripe.ts`); `lib/multiVenueBilling.ts` (audience-aware key, `rejoin_unavailable` in both maps);
`app/api/owner/billing/checkout/route.ts`, `app/api/owner/billing/route.ts`, `app/api/admin/billing/route.ts` (callers);
`lib/venuePricing.ts`; `lib/venueAddition.ts` (`ledgerMoved`); `components/admin/sections/BillingSection.tsx`; `CLAUDE.md`
(multi-venue section: rejoin, anchor-home, lookup-key mirror, ledger role, shared helper); tests below.

### 5. Facts and traps

- `onPartnerBillMessageKey` now takes a 2nd argument (`"partner"` | `"admin"`) and reads `isMultiVenueBillingEnabled()`;
  contract test pins all three call sites.
- Copy in `ON_PARTNER_BILL_MESSAGES.rejoin_unavailable` / `ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES.rejoin_unavailable` is new —
  Phase 7's checklist should include seeing it (flag off: resubscribe a lapsed venue).
- Older traps still hold: `npm run build` flips `next-env.d.ts` — restore with
  `sed -i '' 's#./.next/types/routes.d.ts#./.next/dev/types/routes.d.ts#' next-env.d.ts` (never `git checkout --`); don't run
  typecheck and build together; never POST a real add from a dev server (live Stripe + shared DB).

### 6. Build, run, test — verified 2026-10-12

- `npx tsc --noEmit` clean; `npm run lint` clean (usual Babel size note); `npm run test`: **344 files passed, 1 skipped;
  4,106 passed, 13 skipped, 0 failed**; `npm run build` OK (202 pages), `next-env.d.ts` restored (no diff);
  `npm run test:multi-venue-billing-sql` passes; `tests/lib.auth-users-fk-guard.test.ts` unchanged since `54af6e3`.
- New tests: copy matrix incl. flag off / check bill (`tests/lib.rejoin-state.test.ts`, `tests/api.billing-unbilled-venue-states.test.ts`
  — Checkout and Grant offline both ways); removed-rejoins-the-bill-it-left and `byCard: false`; stale key
  (`tests/lib.bill-rate.test.ts`); bounded `bringAnchorHome` + paging across a full page (`tests/api.owner.venues-remove.test.ts`);
  ledger moved under the request → no Stripe call (`tests/api.owner.venues-add.test.ts`); contract pins.
- **Mutation checks:** removing the ledger-miss stop → 1 fail; trusting the graduated key unconditionally → 1 fail (restored, green).
- **Unverified:** no browser look at the admin Set-rate sheet or the new copy (Phase 7 device pass).
- **Cost:** no new requests. One extra column (`billing_method`) on an existing classifier read; anchor repair is still 2
  reads/day at today's 3 bills (one more pair per 200 live bills).

### 7. Open questions for Andrew

- **Commit 6.8 + 6.9 now?** (list in §2)
- Finding 7 (two-step dead-bill move): leave as is (my recommendation), or add an RPC + migration?
- Still open from 6.7: keep the admin picker offering `removed` venues, or lapsed only?

### 8. Recommended first steps for Phase 7 (Sonnet 5.5, medium)

1. `git status` / `git log origin/main..main` — confirm 6.8 + 6.9 are committed (if not, ask Andrew, then use §2's list).
2. Write `docs/multi-venue-billing-device-checklist.md` (6.7 screens + `rejoin_unavailable` copy + admin Set-rate unrated).
3. Partner Manual / price copy; then, with Andrew: push, set the flag in Vercel, redeploy, live add-and-remove on his account,
   then the lookup-key backfill dry run.
