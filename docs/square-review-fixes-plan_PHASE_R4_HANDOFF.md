# Square review fixes: Phase R4 handoff (rule decision, re-review, commit)

**Date:** 2026-10-06 · **Plan:** `docs/square-review-fixes-plan.md` · **Phase:** R4, the last one (finding #10 + the re-review gate)

## Summary for Andrew (plain English)

- **What changed in R4:**
  - **#10:** you chose (A), narrowing the rule. A ledger row is now required only for POS actions that move money for a
    coupon. The ready-made Square discount has a name that identifies it, so it needs no row. This changed only
    `CLAUDE.md` and the integration plan; no code.
  - **The re-check found 4 small issues, all fixed:**
    1. If one database read failed while the prize wallet was loading, a guest whose Square card was claimed but never
       loaded could lose the "Show gift card" button. The wallet now falls back to the old rule, so the button stays.
       The tap still re-checks everything.
    2. The admin "need action" count could disagree with the rows listed under it in one odd data case. The two now
       use the same rule.
    3. A refused reconnect after Square had already cut access was left live at Square when it should have been
       handed back. That is fixed. Disconnect and the refused-reconnect path now share one "who else uses this Square
       account" check.
    4. One error message was copied out by hand instead of using the shared message. That is fixed.
  - **Security review:** a full security review of the whole Square track found **no vulnerabilities**. It checked who
    can open whose gift card, the Square sign-in flow, webhook signatures, token storage and card-number exposure.
- **Is it live?** Not yet. R1–R4 are **not committed, pushed or deployed**. The POS switch stays off in production.
- **What's left:**
  1. Your OK to commit, push and deploy (the switch stays off).
  2. Your go-ahead for 2h, the real-money pilot.
  3. One R2 point for you to consider before 2h: a venue whose *reconnect* was refused keeps its old Square
     connection, and that location may no longer qualify. Nothing was built for this.
- **Cost:** no change. No new reads in the normal path. The wallet fallback only applies when a read has already
  failed.

---

## For the next agent

### 1. Goal and scope of what follows
- The fix plan ends here. Next is POS Phase 2g's remaining human steps (Andrew's Square Console + Vercel env work per
  `docs/square-go-live-runbook.md`) → flag on + redeploy → **Phase 2h**, the real-money pilot (`docs/pos-rewards-integration-plan.md`).
- **Out of scope until Andrew says so:** flipping `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`, any `vercel env` write, Phase 2h.

### 2. Starting state
- Branch `main`; last commit is `1130914`, and local `main` is 3 commits ahead of `origin/main`.
- **R1–R4 are uncommitted.** When Andrew approves, make one commit
  (`POS: Square review fixes (R1–R4) before 2h, flag still off`). **Stage by name**: `clover-spike/` is untracked and
  is not part of this set. The files to stage are every modified file in `git status` plus the untracked
  `docs/square-review-fixes-plan*.md`, `lib/pos/{ownerPosGuard,squareClaim,squareCoupon,squareWalletConnection}.ts` and
  `tests/lib.pos-square-shared-helpers.test.ts`.
- Data: nothing changed. No migration, and no production query was run in R4.

### 3. Decisions made
- **#10 = (A), narrow the rule** (Andrew, 2026-10-06). The `CLAUDE.md` POS bullet and `docs/pos-rewards-integration-plan.md` §3
  now say: "Every POS attempt that moves value for a coupon (gift card create/fund, register discount application)
  is a `pos_reward_applications` row … Partner-catalog setup writes (the Phase 2d named discount) are not, because
  their name is their identity." No code changed for #10.
- **Two code-review findings were dismissed:**
  - *"Fold `redeemed_method` into `listChallengeCampaignWinsForUser`, removing the wallet's second coupon read."*
    Dismissed. That select is the shared, hot query behind every wallet (POS or not). The `ChallengeCampaignWin`
    type is returned to the browser. The extra read only runs when a redeemed coupon has an unfinished Square ledger
    row, which is rare. The failure mode it raised (finding 1) is fixed directly by the fallback.
  - *"The typed `const fail = squareFail` aliases in `squareGiftCards.ts` / `squareDiscounts.ts` do nothing."* Dismissed.
    They narrow the return type to each file's own result union, and R3 chose them on purpose.

### 4. Files changed in R4
- `lib/pos/squareGiftCards.ts`:
  - `attachSquareGiftCardStates`: when the coupon-method read fails, the badge uses the pre-R1 ledger-only rule
    (`external_ref` present and status not `failed`).
  - The claim-error branch now uses `NO_PRIZE_MESSAGE`.
- `lib/pos/squareStuckClaims.ts`: need-action read 1 also requires
  `challenge_campaign_redemptions.prize_redeemed_at IS NOT NULL`, the same rule as `isOurSquareClaim`.
- `lib/pos/squareConnection.ts`:
  - `liveConnectionsForMerchant` ignores rows whose token is already wiped (`access_token_enc = 'revoked'`).
  - `disconnectSquare` now uses `liveConnectionsForMerchant(...).others`.
  - `otherActiveVenuesForMerchant` is deleted. Active rows never carry the placeholder, so Disconnect behaves as
    before.
- Tests:
  - `tests/lib.pos-square-gift-cards.test.ts`: a `failingReads` mock switch, plus the new test "falls back to the
    ledger alone when the coupon-method read fails".
  - `tests/lib.pos-square-hardening.test.ts`:
    - The mock's `not()` now resolves embedded `table.col` names.
    - New test: "the need-action count agrees with the badges".
    - New test: "discardSquareGrant revokes when the venue's own row is one Square already revoked".
- Docs: this handoff, and the status lines in `docs/square-review-fixes-plan.md` and `docs/pos-rewards-integration-plan.md`.
  `CLAUDE.md` and plan §3 were changed for #10 in the earlier R4 session.

### 5. Facts and traps
- The R2 test "an own `error` row is still a connection we leave alone" still holds. An `error` row from `markError`
  (an API failure) keeps its real token, so it still blocks the revoke. Only a `markSquareMerchantRevoked` row (token
  wiped) no longer blocks it.
- Static source-grep tests (`tests/lib.pos-redeemed-rewards.test.ts` and others) pin route text. Run `npm run test`
  after moving code between files.
- Don't run `tsc` and `npm run build` at the same time.

### 6. Build, run, test: what was verified (2026-10-06, final code)
- `/code-review high` over the R1–R4 diff gave 7 findings: 5 fixed (above), 2 dismissed (§3).
- `/security-review` covered the whole Square track (`164241d`, `c138376`, `1130914` plus the working tree). **No
  findings at confidence ≥8.** What it checked and why it rejected each candidate:
  - **Gift-card and discount routes (IDOR):** session-bound `userId` plus the `loadOwnedCoupon` winner + venue check.
  - **Double spend:** the create → once-only claim → fund order, and resume needs `pos_square`.
  - **Webhook:** raw body, HMAC over the env URL + body, constant-time compare, 503 when unkeyed.
  - **OAuth:** HMAC state with a nonce cookie, a 10-minute expiry, and owner + venue re-checked on callback.
  - **Owner routes:** `guardOwnerPosVenue`, and the location id is re-validated against Square.
  - **Admin:** `requireAdminAuth`, and the GAN is dropped.
  - **Tokens:** encrypted only, and never logged.
  - **GAN:** never logged or stored.
  - **Injection:** no string-built PostgREST filters, and no `dangerouslySetInnerHTML`.
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note on `lib/sportsBingo.ts`).
- `npm run test`: **305 files passed, 1 skipped; 3,437 tests passed, 13 skipped, 0 failed** (R3 had 3,434; R4 adds 3).
- `npm run build`: succeeded.
- `test:god-mode-join` was not needed (the join flow is untouched). `test:pwa-contract` was not needed (no player
  chrome changed).
- **Unverified:** nothing here has run against a real Square account or in a browser, because the flag is off. Live
  behaviour is the job of the 2h pilot.

### 7. Open questions for Andrew
1. Approval to commit, push and deploy R1–R4 with the flag still off.
2. Go-ahead for 2h, after the runbook's console/env steps and flag-on.
3. The R2 point above: a refused reconnect keeps an old, possibly now-ineligible location. Leave it as is, or plan a
   follow-up?

### 8. Recommended first steps for the next agent
- With Andrew's OK: stage by name, commit, `git push`, and deploy as Andrew directs. Record the commit SHA and deploy
  status in both plans' status lines.
- Then follow `docs/square-go-live-runbook.md` with Andrew (Opus 5.5, high, for anything touching live money).
