# Square review fixes — Phase R1 handoff (gift-card stuck-claim recovery)

**Date:** 2026-10-06 · **Plan:** `docs/square-review-fixes-plan.md` · **Phase done:** R1 (findings #1, #3, #8)

## Summary for Andrew (plain English)

- **What changed:** a guest whose coupon was used up while their Square gift card never got its money can now
  always be fixed. The guest's next tap, or the admin's "Retry funding" button, finishes loading the card.
  Before, a network hiccup at exactly the wrong moment could leave that guest stuck for good.
- **The admin "Stuck Square gift cards" list can no longer hide a stuck guest.** Guests who need help are always
  listed first and always counted. Harmless leftovers show for 14 days only (newest 50). Nothing is deleted.
- **Is it live?** No. Nothing is committed, pushed or deployed, and the POS switch stays off in production.
  Phase R4 does the one commit for all four phases.
- **What's left:** R2 (Square connection safety), R3 (shared code tidy-up), R4 (your decision on finding #10,
  the final reviews, then commit/push/deploy with your OK).
- **Needs you:** nothing for R1.
- **Cost:** no change for guests. In one rare case (a redeemed gift-card coupon whose card was never funded),
  the wallet makes one extra small database read. The admin list went from 3 to 4 small reads, and only when an
  admin opens it. No new cron, no migration.

---

## For the next agent

### 1. Next phase goal and scope
- **R2** (findings #2, #5, #4) and **R3** (findings #6, #7, #9) are both unblocked. R3 needed R1 first because
  both edit `lib/pos/squareGiftCards.ts`, and R1 is now done. The plan has the full scope for each.
  **R4** is always last.
- **Out of scope:** committing, pushing, deploying, flipping `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`, any
  `vercel env` write, any migration.
- **For R3:** `squareApplyKey` and the new claim rule now live in `lib/pos/squareClaim.ts`. R3's
  `loadOwnedCoupon` extraction must keep the resume branch's position in `openSquareGiftCard`: it runs
  *before* the expiry check, and that order matters.

### 2. Starting state
- Branch `main`, last commit `1130914` (POS 2g runbook). **Nothing from R1 is committed.**
- Pre-existing uncommitted changes I did not touch: `clover-spike/` (untracked), and a one-line change in
  `docs/pos-rewards-integration-plan.md`. I added only the status-line paragraph to that file.
  `docs/square-review-fixes-plan.md` is untracked, and I changed only its status line.
- Data: none changed. I ran one **read-only** production check (below). Production `pos_reward_applications`
  holds 1 row and has zero stuck rows.

### 3. Decisions made (and why)
- **The claim rule is in one pure module.** `isOurSquareClaim(row, coupon)` lives in `lib/pos/squareClaim.ts`
  (no `server-only`, no I/O). It is true when the coupon was redeemed with method `pos_square` and the ledger row
  has `external_ref`, **whatever the row's status**. Three places use it: the resume branch in
  `openSquareGiftCard`, `classifyStuckSquareClaim`, and the wallet badge. I did **not** put it in
  `squareGiftCards.ts`, because `tests/lib.pos-square-hardening.test.ts` mocks that whole module with only
  `openSquareGiftCard`, so `squareStuckClaims.ts` couldn't have imported it from there. `squareApplyKey` moved
  to the same module, and `squareGiftCards.ts` re-exports it, so existing imports keep working.
- **Why it's safe to ignore status (checked against the code).** There are three writers of terminal
  `failed`, all in `lib/pos/squareGiftCards.ts`:
  (a) the currency refusal: it runs before the claim, when the coupon is still unredeemed;
  (b) `lost_to_guest_confirm`: written only after a fresh read shows a method other than `pos_square`;
  (c) the claim `catch`: after R1 it records `failed` only when a fresh read shows the coupon is not `pos_square`.
  The only other `pos_square` claimer is the webhook backstop (`claimIfUnclaimed` in `lib/pos/squareWebhook.ts`).
  It fires only on a REDEEM activity for one of our cards, which means the card was already funded, and it never
  writes the ledger status. No other code writes `status: "failed"` to this table (I grepped `lib/` and `app/api`).
- **The claim `catch` now reads the coupon again before recording anything.** The RPC wrapper
  (`redeemChallengePrize`) turns any Supabase/PostgREST error, including a timeout after commit, into
  `PrizeRedeemUnavailableError`. That path already left the row `pending`. I still apply the recheck to *every*
  error, so a claim that landed is funded on the same tap. If the re-read fails, the code records nothing and
  returns `unavailable`. If the coupon is still unredeemed or another method won, it records terminal `failed` as
  before. The `!claim.redeemed` branch uses the same helper (`readRedeemedMethod`): a failed re-read there no
  longer writes `lost_to_guest_confirm`, and returns `unavailable` instead.
- **Extra safety, not in the plan:** when resuming a non-`succeeded` row, the currency is checked first, using the
  value saved at prepare time, so normally there's no Square call. A non-USD card is never funded on resume. It
  logs `[PosSquare] resume-currency-not-supported` and returns `square_error`.
- **Wallet badge.** `attachSquareGiftCardStates` used to show "issued" whenever the coupon was redeemed, the row
  had `external_ref`, and the status wasn't `failed`. That was wrong both ways:
  - A `failed` row on our own claim vanished.
  - A `pending` row left behind when "Confirm Redemption" won showed "Show gift card", and that button then
    answered `already_redeemed`.

  Now a `succeeded` row means "ours", because funding only ever follows our claim. For any other row on a
  redeemed coupon, the code makes **one** extra read of `redeemed_method`, only for those rows, and applies
  `isOurSquareClaim`. When there are no such rows, there is no extra read.
- **Stuck list API shape changed** from `StuckSquareClaim[]` to
  `{ claims, needsAction: { count, capped } }`. `GET /api/admin?resource=pos-stuck-claims` now returns
  `{ ok, claims, needsAction }`. The panel shows `N+ need action` when the count is capped. It falls back to
  counting rows if `needsAction` is missing, to cover deploy skew.
- **The 15-minute "stuck" cutoff applies to both reads.** A row younger than that may be a guest still mid-tap.

### 4. Files created or changed
- **New:** `lib/pos/squareClaim.ts` contains `squareApplyKey`, `isOurSquareClaim`.
- `lib/pos/squareGiftCards.ts`:
  - imports and re-exports `squareApplyKey`
  - new `readRedeemedMethod()`
  - resume branch (`if (coupon.prize_redeemed_at)`): uses `isOurSquareClaim`, resets `failed`→`pending`, checks currency
  - claim `try/catch`: recheck before recording
  - `attachSquareGiftCardStates`: conditional coupon read plus the new rule
- `lib/pos/squareStuckClaims.ts`:
  - `listStuckSquareClaims` makes two reads: need-action (`challenge_campaign_redemptions!inner(...)` plus
    `.eq("challenge_campaign_redemptions.redeemed_method","pos_square")`, `.not("external_ref","is",null)`,
    oldest first, limit 100) and rest (newest first, limit 50, `created_at >= now-14d`). It merges them,
    need-action first, deduped by id.
  - `classifyStuckSquareClaim` uses `isOurSquareClaim`.
  - `retrySquareFunding` uses `squareApplyKey` (#8).
- `app/api/admin/route.ts`: the `pos-stuck-claims` GET passes `needsAction` through.
- `components/admin/sections/PosStuckClaimsPanel.tsx`: count from the server, "+" when capped, one line of copy
  about the 14-day window.

### 5. Facts and traps
- **Indexes:** the plan said "each indexed". Only the need-action read is index-backed, through the partial
  index `(provider, external_ref) where external_ref is not null`, plus the FK join on the coupon PK. The
  rest-read filters `provider/action/status/created_at` with no composite index. That's fine: the table has 1 row
  in production and grows only with Square gift-card taps. No migration was added. If it ever grows large,
  `(provider, action, created_at)` would be the index to add.
- **Embedded filter semantics:** with `!inner`, the embedded `.eq` filters the parent rows. I verified this
  against production. Both queries returned `ok` with 0 rows, so the shape of the embedded value (object vs array)
  couldn't be observed. The code accepts both.
- **Test mock:** `tests/lib.pos-square-hardening.test.ts`'s fake PostgREST gained `not(col,"is",null)`, `gte`,
  a real `order`, and `!inner` embed and dotted-column `eq` support. An update on a query with an embed would not
  write back (the embed copies rows), but nothing does that.
- Do not run `tsc` and `npm run build` at the same time (`.next/types` is regenerated).

### 6. Build, run, test — what was verified
All run 2026-10-06 on the final R1 code:
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note on `lib/sportsBingo.ts`).
- `npm run test`: **304 files passed, 1 skipped; 3,416 tests passed, 13 skipped, 0 failed.**
- `npm run build`: succeeded.
- Targeted: `npx vitest run tests/lib.pos-square-gift-cards.test.ts tests/lib.pos-square-hardening.test.ts`:
  49 passed.
- Production read-only check: a scratchpad script ran the two new list queries through `node --env-file=.env.local`
  with the service role, and printed counts only. Both were accepted.

**New tests:**

`tests/lib.pos-square-gift-cards.test.ts`, under "Review fix R1 (#1)":
1. The claim RPC commits, then throws a plain error: the guest gets a funded card, and the ledger ends `succeeded`.
2. Same, with `PrizeRedeemUnavailableError`.
3. A claim error on a still-unredeemed coupon records `failed`, and the coupon stays untouched (`expired`).
4. A `failed` row on a `pos_square` coupon resumes and funds: no prepare, no second claim.
5. A `lost_to_guest_confirm` row is still refused.
6. Resume never funds a non-USD card.

Also in that file, the wallet test gained `stuck` (failed row, our claim → "issued") and `pending-lost` (pending
row, `guest_confirm` → no badge).

`tests/lib.pos-square-hardening.test.ts`:
1. 60 harmless newer rows versus one older `claimed_unfunded` row: it is listed first and counted, with 51 rows
   total and no duplicate.
2. Harmless rows older than 14 days are hidden, and an equally old need-action row is still shown.
3. 101 need-action rows give `{ count: 100, capped: true }`.
4. `retrySquareFunding` succeeds on a wrongly-`failed` claimed row, and still gives 409 on a lost one.

The existing "lists only unfinished rows…" test was updated for the new return shape.

**Unverified:** the real browser and admin panel (no UI run, since the flag is off and there's no production
data); the embedded-row shape from PostgREST with real rows.

### 7. Open questions for Andrew
None from R1. The plan's open questions are still open: #10 (A/B), asked at the start of R4, and commit/push/
deploy approval at the end of R4.

### 8. Recommended first steps for the next phase
- **R2** (Opus 5.5, high): start with `discardSquareGrant` in `lib/pos/squareConnection.ts`, and check Square's
  RevokeToken semantics in the current docs before changing it.
- **R3** (Sonnet 5.5, high): re-read `lib/pos/squareGiftCards.ts` as it is now. The coupon read and ownership
  check at the top of `openSquareGiftCard` are unchanged by R1, so they are what `loadOwnedCoupon` extracts.
  Leave `readRedeemedMethod` where it is.
