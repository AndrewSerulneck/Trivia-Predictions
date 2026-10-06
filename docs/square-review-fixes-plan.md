# Square review fixes — before Phase 2h

**Status:** **R1–R4 done 2026-10-06 (uncommitted; awaiting Andrew's commit/push/deploy OK)** — #10 = (A) narrow the rule;
`/code-review high` 5 fixed / 2 dismissed; `/security-review` clean. Handoffs `docs/square-review-fixes-plan_PHASE_R1_HANDOFF.md`,
`…_PHASE_R2_HANDOFF.md`, `…_PHASE_R3_HANDOFF.md`, `docs/square-review-fixes-plan_PHASE_R4_HANDOFF.md` (latest). Fixes the 10 findings from the `/code-review` run on
2026-10-06 over the Square track (everything since `27f5eea`, HEAD `1130914`). **This plan is the "one
code/security review" step of POS Phase 2g** (`docs/pos-rewards-integration-plan.md`). Do these fixes before the
production flag turns on and before Phase 2h, the real-money pilot. Andrew's Square Console and Vercel env steps
in `docs/square-go-live-runbook.md` can happen in parallel, because they don't touch code. Only the final flag
flip and redeploy wait for R4.
**Handoffs:** `docs/square-review-fixes-plan_PHASE_<N>_HANDOFF.md` (R1…R4). Each phase also updates the status
line of `docs/pos-rewards-integration-plan.md`.

## Summary for Andrew (plain English)

The review found two real money problems, one hidden-problem risk, and seven smaller issues:

- **A guest can get stuck with nothing.** If the network hiccups at exactly the wrong moment, a coupon can be
  used up while its Square gift card was never loaded. The admin's "Retry funding" button can't fix that case
  today. → **R1**
- **The admin list can hide that stuck guest.** It shows only the newest 50 unfinished attempts, and harmless
  ones (guests who started a card and walked away) pile up and push the stuck one out of view. → **R1**
- **Reconnecting Square can break a working connection.** If a partner reconnects and their Square account now
  fails our checks, we hand the new permission back to Square. That also kills the connection the venue already
  had, so its gift cards stop working until Square tells us. → **R2**
- The rest: a wrong reason shown next to a greyed-out location, a dashboard warning that will say "Square" for
  Clover problems, one wasted database read per wallet load, and copy-pasted code that should be shared.
  → **R2/R3**
- **One question for you (R4):** our rule says every POS action is logged in our records *before* we call the
  POS. Creating the ready-made Square discount for a menu prize (Phase 2d) doesn't do that. That's because
  you decided in 2d that nothing is stored. The rule needs narrowing, or the code needs a log row.
  **Recommended: narrow the rule** (details in R4).

No database migration is needed. No new cron or polling. All costs stay the same or go down slightly.

| Phase | Findings | Model / effort | Needs Andrew? |
|---|---|---|---|
| R1 — Gift-card stuck-claim recovery | #1, #3, #8 | **Opus 5.5, high** (money path) | No |
| R2 — Square connection safety | #2, #5, #4 | **Opus 5.5, high** (#2 revokes real tokens) | No |
| R3 — Shared helpers and one read | #6, #7, #9 | **Sonnet 5.5, high** (#7 moves the coupon ownership check; medium would do for #6/#9 alone) | No |
| R4 — Rule decision, re-review, commit | #10 + gate | **Opus 5.5, high** (runs `/code-review high` + `/security-review`) | **Yes**: the #10 decision, and approval to commit/push/deploy |

R1 and R2 are independent and can run in either order. R3 touches `lib/pos/squareGiftCards.ts`, so run it **after
R1**, or the two will conflict. R4 is always last.

---

## For the agent doing any phase

### Ground rules (apply to every phase)
- Read `CLAUDE.md` (the POS section) and `SYSTEM_CONTEXT.md` first. The flag `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`
  stays **off** in production. Don't flip it, and don't run `vercel env` writes.
- Never log or store a Square GAN (gift card number) (`tests/lib.pos-square.test.ts` is the tripwire).
- Coupons are redeemed **only** through `redeem_challenge_prize` (`redeemChallengePrize()`). Never write
  `prize_redeemed_at` directly.
- Don't edit existing migrations. None of these fixes should need a new one. If you think one does, stop and
  write down why in the handoff.
- Gates for every phase: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (don't run tsc and the
  build at the same time). Targeted suites: `tests/lib.pos-square*.test.ts`, `tests/lib.pos-square-hardening.test.ts`,
  `tests/api.square-routes.test.ts`, `tests/api.owner.pos.test.ts`, `tests/components.pos-connections-sheet.test.ts`,
  `tests/app.owner-dashboard-one-round-trip.test.ts`.
- Don't commit unless Andrew asks. R4 does the single commit for the whole fix set.

### Phase R1 — Gift-card stuck-claim recovery (findings #1, #3, #8)
**Model / effort:** Opus 5.5, **high**.

**#1: a claimed coupon whose ledger row says `failed` can never be funded.**
- Where: `lib/pos/squareGiftCards.ts` ~L324–329 (the resume branch refuses `row.status === "failed"`) and ~L393–399
  (the `catch` around `redeemChallengePrize` marks the row terminal `failed` on *any* non-`PrizeRedeemUnavailableError`,
  even when the RPC may have committed, e.g. a timeout after commit). `classifyStuckSquareClaim`
  (`lib/pos/squareStuckClaims.ts` L59) then labels it `claimed_unfunded`, while `retrySquareFunding` → `openSquareGiftCard`
  returns `already_redeemed`, so the admin gets a 409 forever.
- Fix, in two parts:
  1. **In the `catch`:** before recording a failure, re-read the coupon's `redeemed_method` (the same read the
     `!claim.redeemed` branch already does). If it is `pos_square`, the claim landed: carry on to `fundAndShow`.
     Only record a failure when the coupon is still unredeemed or went to another method.
  2. **In the resume branch:** a coupon redeemed with `pos_square` plus a ledger row holding `external_ref` means
     our claim won. Every terminal-`failed` writer either runs *before* the claim (currency check, ~L368) or only
     when another method won (`lost_to_guest_confirm`, ~L389). So resume even when `status === "failed"`: reset it
     to `pending` and fund. Verify that reasoning against the code before relying on it. Also check
     `lib/pos/squareWebhook.ts` ~L133, which also claims with `pos_square`.
  3. Align the wallet badge logic (`attachSquareGiftCardStates`, ~L465 `ledger.status !== "failed"`) so such a
     coupon shows the "Show gift card" (resume) state rather than vanishing.
- Make `classifyStuckSquareClaim` and the resume rule share one predicate, so they can't drift apart again.
- Tests (extend `tests/lib.pos-square-gift-cards.test.ts` / `tests/lib.pos-square-hardening.test.ts`): claim RPC
  throws after commit, so the guest still gets a funded card; a failed row with a `pos_square` coupon resumes and
  funds; `retrySquareFunding` succeeds on that row; a `lost_to_guest_confirm` row is still refused; a currency
  failure on an unredeemed coupon still leaves the coupon untouched.

**#3: the newest-50 window hides `claimed_unfunded` rows.**
- Where: `listStuckSquareClaims` in `lib/pos/squareStuckClaims.ts` ~L67–80.
- Fix: run **two bounded reads** instead of one:
  1. **Need action:** non-`succeeded` Square `apply` rows with `external_ref IS NOT NULL`, inner-joined to the
     coupon with `redeemed_method = 'pos_square'`. The FK `pos_reward_applications.redemption_id →
     challenge_campaign_redemptions(id)` exists, so PostgREST `challenge_campaign_redemptions!inner(...)` with an
     embedded filter works. Oldest first, limit 100. These rows should stay near zero, so they are never crowded out.
  2. **Harmless:** the rest, newest first, limit 50, **last 14 days only**, so abandoned rows age out of view.
     Don't delete them: the ledger is the audit record.
  Merge the two lists, need-action first. The panel's "need action" count must come from read 1, and should read
  "100+" if it hits the limit.
- Cost: still on demand only (admin opens Venues). It goes from 3 queries to 4, each indexed and bounded.
  Effectively zero.
- Test: 60 harmless rows newer than one `claimed_unfunded` row, and the claimed row is still listed and counted.

**#8:** in `retrySquareFunding` (~L140), replace the hand-built `` `${redemptionId}:square:apply` `` with
`squareApplyKey(redemptionId)`.

**R1 exit:** the gates pass, and the handoff lists each new test.

### Phase R2 — Square connection safety (findings #2, #5, #4)
**Model / effort:** Opus 5.5, **high**.

**#2: `discardSquareGrant` can revoke the venue's own live connection.**
- Where: `lib/pos/squareConnection.ts` ~L378–391. `otherActiveVenuesForMerchant(merchantId, env, venueId)` excludes
  the current venue. But Square's RevokeToken ends **every** token our app holds for that merchant, including the
  venue's existing `active` row from an earlier connect.
- Fix: before revoking, also check whether *this* venue has a non-revoked row for the same `merchant_id` +
  environment. If so, don't revoke: leave the new grant unused (Square tokens expire on their own) and log
  `[PosSquare] discard-skipped-own-connection`. Simplest implementation: count active rows for the merchant
  **without** the venue exclusion. Keep the existing "another venue shares it" behaviour.
- Confirm the revoke semantics against current Square docs (OAuth RevokeToken with `merchant_id` vs
  `access_token`). Write what you found in the handoff.
- Open point for the handoff, not this phase: a venue whose reconnect was refused keeps its old connection,
  whose location may now also be ineligible. Note it, and don't build anything for it.
- Tests: reconnect refused as `not_eligible` while the same venue has an active row for that merchant → no revoke
  call. Same refusal with no existing row → revoke still happens. Shared-with-another-venue → no revoke (existing
  test stays green).

**#5: the dashboard nudge counts any provider's `error` row as "Square needs reconnecting".**
- Where: `venuesNeedingPosAttention` in `lib/pos/connections.ts` ~L155–169. The copy is in
  `app/owner/dashboard/page.tsx`.
- Fix: add `.eq("provider", "square")` to the query, and add a comment that Clover (Phase 3) must add its own
  provider-specific nudge. That's the smallest correct change. Don't build per-provider copy now.
- Test: a Clover `error` row does not flag the venue.

**#4: an ineligible location always says "(not US dollars)".**
- Where: `components/owner/pos/PosConnectionsSheet.tsx` ~L127. Eligibility (`isSquareGiftCardLocation`) needs
  `country === "US"` **and** `currency === "USD"`.
- Fix: change the label to " (must be a US location using US dollars)", the same wording as the server's
  refusal. No API change. Update `tests/components.pos-connections-sheet.test.ts`.

**R2 exit:** the gates pass, and the Square revoke semantics are recorded in the handoff.

### Phase R3 — Shared helpers and one read (findings #6, #7, #9)
**Model / effort:** Sonnet 5.5, **high**. Run after R1 (both edit `lib/pos/squareGiftCards.ts`). **Behaviour must not
change**: the existing tests are the contract. Add tests only for the new helpers.

**#7: one coupon loader for both Square paths.**
- `openSquareGiftCard` (`lib/pos/squareGiftCards.ts`) and `ensureSquarePrizeDiscount` (`lib/pos/squareDiscounts.ts`
  ~L95+) each repeat the same steps: the redemption read, `22P02` → not_found, the winner + venue ownership check,
  the expiry check, `fail()`, and `SQUARE_ERROR_MESSAGE`.
- Extract `loadOwnedCoupon({ userId, venueId, redemptionId, columns })` into a new `lib/pos/squareCoupon.ts`
  (`import "server-only"`). It returns `{ ok: true, coupon } | { ok: false, code: "not_found" | "unavailable" }`.
  Expiry stays at each call site: the gift-card path checks expiry only *after* the already-redeemed resume
  branch, and that order matters (a redeemed, expired card must still show). Share `SQUARE_ERROR_MESSAGE` and the
  `fail` helper from the same file.

**#6: the wallet reads `pos_connections` twice.**
- Where: `app/api/challenge-campaigns/redeem/route.ts` ~L37–41 chains `attachSquareGiftCardStates` →
  `attachSquareDiscountStates`, and each runs its own `pos_connections` read for the venue.
- Fix: add `readSquareWalletConnection(venueId)` (one select:
  `id, status, location_id, scopes, environment`) that returns `null` when the flag is off. Call it at most
  once, and **only if** the wins include a coupon either attach function would act on (keep today's "zero
  queries when there is nothing to attach" property). Pass the result into both attach functions as an optional
  parameter.
- Cost: saves 1 query plus 1 serial round trip per wallet load at a Square venue holding both coupon kinds.
  Never adds a query.

**#9: two-tier limiter helper and shared owner POS guard.**
- `lib/rateLimit.ts`: add `rateLimitUserThenIp(request, userId, userBucket, ipBucket)`, and turn
  `rateLimitSquareGiftCard` / `rateLimitSquareDiscount` into one-line wrappers. Keep both exported names, because
  the route tests and contract tests import them. Keep the user-first order.
- Owner POS routes: move the `guard` from `app/api/owner/pos/square/locations/route.ts` (~L24) into
  `lib/pos/ownerPosGuard.ts`, and use it there and in `app/api/owner/pos/redeemed/route.ts`. Check every other
  `app/api/owner/pos/**/route.ts` for the same flag + `requireOwnerAuth` + venue-ownership pattern and use the
  guard where it matches **exactly**. Don't change any status code or error body.

**R3 exit:** the gates pass with no existing test changed except import paths.

### Phase R4 — #10 decision, re-review, commit (gate before 2h)
**Model / effort:** Opus 5.5, **high**.

**#10: Square discount creation doesn't write a ledger row** (`createSquareDiscount`, `lib/pos/squareDiscounts.ts`
~L140). `CLAUDE.md` says "Every POS attempt is a `pos_reward_applications` row … inserted BEFORE the provider
call". The 2d design, on Andrew's decision, stores nothing: the discount's **name** is its identity, and
duplicates from two simultaneous first opens are harmless.
- **Ask Andrew at the start** (AskUserQuestion):
  - **(A) Narrow the rule (recommended).** Change the CLAUDE.md bullet to: "Every POS attempt that moves value
    for a coupon (gift card create/fund, register discount application) is a `pos_reward_applications` row …
    Partner-catalog setup writes (the Phase 2d named discount) are not, because their name is their identity."
    Mirror the wording in `docs/pos-rewards-integration-plan.md` §3. No code change. Why: the discount carries no
    money until staff apply it, the coupon is still redeemed only via "Confirm Redemption", and a ledger row
    would add a DB write per first open with nothing to reconcile it against.
  - **(B) Add a ledger row** (`action: "catalog_discount"`, key `square:discount:<merchant>:<spec-hash>`,
    deterministic idempotency key). That reverses the 2d "nothing is stored" decision, adds about 1 write per new
    prize per merchant, and needs care when a partner deletes the discount in Square (a replayed key returns the
    deleted object, which is why 2d uses a random key).
- Apply the chosen option.

**Re-review gate:**
1. Run `/code-review high` on the R1–R4 diff, plus `/security-review`. Square has had no security review yet,
   and 2g requires one before the flag turns on. Fix anything confirmed. Record anything dismissed, with the
   reason.
2. Run the full gates. You don't need `npm run test:god-mode-join` (the join flow is untouched), and you need
   `npm run test:pwa-contract` only if R3 touched player chrome.
3. With Andrew's OK: one commit (`POS: Square review fixes (R1–R4) before 2h, flag still off`), push, and a deploy
   that Andrew approves. The flag stays off.
4. Update `docs/pos-rewards-integration-plan.md`: the status line, plus a note under Phase 2g that the review is
   done and points to this plan's R4 handoff. Then 2g continues with Andrew's console/env steps → flag on → 2h.

**Plan exit:** both reviews are clean or have their dismissals recorded, everything is committed, and Andrew has
said 2h may start.

## Open questions for Andrew
1. **#10:** narrow the rule (A, recommended) or add a ledger row (B)? Asked at the start of R4.
2. Commit, push and deploy approval at the end of R4.
