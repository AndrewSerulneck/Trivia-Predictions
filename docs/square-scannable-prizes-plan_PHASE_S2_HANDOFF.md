# Square scannable prizes — Phase S2 handoff (2026-10-06)

Plan: `docs/square-scannable-prizes-plan.md`. This note closes **S2** (the money path). Next: **S3** (wizard choice +
wording + the coupon UI). Written by the S2 agent (Opus 5.5, high).

## For Andrew (plain English)

- **What changed:** the server now knows how to turn a "$5 off Appetizer" coupon into a real $5 Square gift card when
  that prize was set to "scannable gift card". It uses exactly the same safe steps as today's gift-card prizes, so a
  guest can never get both the gift card and the staff discount. Prizes left on "staff apply a discount" (every prize
  today) behave exactly as before.
- **Is it live?** No. Nothing from S1 or S2 is committed or deployed. The database change from S1 is live but
  invisible. And no reward can be set to "scannable" yet, because the wizard choice comes in S3.
- **What's left:** S3 (the wizard choice, which you approve the wording for, plus making the coupon screen show the
  gift card properly), then S4 (review, commit, deploy, your iPhone test).
- **Needs you now:** nothing. S3 will ask you to approve the wording, and one small question about editing (§7).

---

## For the next agent (S3)

### 1. Goal and scope of S3

From the plan, Phase S3 "wizard + wording":
1. `components/rewards/CreateRewardWizard.tsx` (ONE shared component; admin + owner): when the prize is a dollar-off
   menu item and `isPosIntegrationsEnabled()`, show the two-option choice (draft copy in the plan, S3 step 1). Default
   "Apply a discount". Hidden for percent/free-item prizes. Send `prize.posDelivery: "gift_card"` only when chosen
   (the server already accepts and validates it: `normalizeRewardPrize` in `lib/rewards.ts`; 400 otherwise).
2. Coupon button and copy for these coupons = the existing gift-card copy; one line for staff/partner in
   `lib/posStaffInstructions.ts` (the one home of that copy).
3. Tests: wizard shows/hides the choice; admin snapshot updated deliberately and called out.

**S3 must ALSO fix three player-wallet gaps that S2 found (UI, so deliberately left out of S2).** Without them a
scannable coupon works the first time but is broken afterwards, so they must land before S4 ships:

- **(a) No way back to an issued card.** `MenuItemCoupon` in `components/prizes/PrizeWalletPanel.tsx` (~line 330)
  shows a plain "Redeemed" badge once redeemed. For a gift-card prize, `GiftCardCoupon` (~line 238) instead shows a
  **"Show gift card"** button when `win.squareGiftCard === "issued"`, and "Used" when `"used"`. A scannable menu coupon
  is redeemed (method `pos_square`) the moment it becomes a card, so without the same branch in `MenuItemCoupon` the
  guest cannot reopen their card number after closing the sheet. Simplest: give `MenuItemCoupon` the same
  `squareIssued` / "Used" branches as `GiftCardCoupon` (they are keyed on `win.squareGiftCard`, which S2 already sets
  for scannable coupons). The wallet list already keeps an issued coupon past its expiry (`activeChallengeWins`).
- **(b) The amount is missing from the offer text.** `components/prizes/SquareGiftCardPanel.tsx` line ~117 reads
  `win.prizeGiftCertificateAmount`, which is null for a menu prize, so the offer reads "We'll turn this prize into a
  Square gift card" with no "$5". For a scannable coupon the dollars are `win.prizeDiscountValue`. Put the rule in
  `lib/pos/prizeDelivery.ts` (client-safe) rather than inline, e.g. a `squareGiftCardDollars(win)` helper.
- **(c) Wording on the big coupon.** In the gift-card sheet the large coupon is still `MenuItemCoupon` ("$5 off
  APPETIZER"), while the card can be spent on anything. Decide with Andrew whether the coupon should say so (part of
  the S3 wording review).

**Out of scope for S3:** money-path changes (S2 is done; touch `lib/pos/squareGiftCards.ts` /
`squareDiscounts.ts` only for a bug, and re-run their tests), committing/deploying (S4), a reward-edit UI, Clover.

### 2. Starting state

- Branch `main`, last commit still `e2bf1e6`. **Nothing from S1 or S2 is committed or pushed.** `main` auto-deploys to
  production and Square is live there (`NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED=true`), so do not push mid-plan. S4
  commits.
- Production database: unchanged in S2. The S1 migration `20261007030714_square_scannable_prizes.sql` is applied
  (2026-10-07 03:15 UTC). No data written, no scripts run, no backups needed in S2.
- Working tree also holds **other sessions' uncommitted work that is not this plan's**: `clover-spike/`,
  `docs/supabase-disk-io-*`, `scripts/supabase-disk-io-*.sql`,
  `supabase/migrations/20261007025200_category_blitz_latest_round_index.sql`, and the 2h edits in
  `docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md`. Leave them alone; S4 should commit only this plan's files.

This plan's files so far (S1 + S2):

| File | Phase | Status |
|---|---|---|
| `supabase/migrations/20261007030714_square_scannable_prizes.sql` | S1 | new, **applied** |
| `lib/pos/prizeDelivery.ts` | S1, S2 added `isSquareGiftCardPrize` | new |
| `lib/pos/squareGiftCards.ts` | S2 | modified |
| `lib/pos/squareDiscounts.ts` | S2 | modified |
| `scripts/test-square-scannable-prizes.cjs` | S1 | new |
| `tests/lib.pos-scannable-prizes.test.ts` | S1, S2 added the never-both tests | new |
| `tests/lib.pos-square-gift-cards.test.ts`, `tests/lib.pos-square-discounts.test.ts`, `tests/lib.pos-redeemed-rewards.test.ts` | S2 | tests appended |
| `types/index.ts`, `lib/rewards.ts`, `lib/challengeCampaigns.ts` | S1 | modified |
| `tests/lib.rewards-definitions.test.ts`, `tests/lib.rewards-cycle-snapshot.test.ts` | S1 | tests appended |
| `docs/square-scannable-prizes-plan.md` + `_PHASE_S1_HANDOFF.md` + this file | S1/S2 | docs |
| `docs/pos-rewards-integration-plan.md` | S1/S2 | Phase 2i status line only |

### 3. Decisions already made (do not re-ask)

- Partner picks per prize; "Apply a discount" is the default (Andrew, 2026-10-06).
- The wizard choice shows for everyone whenever `isPosIntegrationsEnabled()` (Andrew, 2026-10-06).
- The app stores only `'gift_card'`; absent/null/`'discount'` all mean discount (S1).
- **The coupon's own snapshot decides, on the server, for everything (S2).** Both server paths read the coupon row's
  `prize_kind`, `prize_discount_kind`, `prize_discount_value` and `prize_pos_delivery`, never the live reward:
  - `openSquareGiftCard` prices a scannable card from the coupon's `prize_discount_value` (what was won), through
    `prizePosValueCents()`. It does **not** do the legacy live-reward fallback read for these coupons.
  - `ensureSquarePrizeDiscount` refuses a scannable coupon (`not_eligible`, "This prize is a Square gift card, not a
    discount.") before any Square call, using the same coupon columns.
  - So on the server the two paths are mutually exclusive by construction.
- **The wallet tags from `win.*` fields (S2, my call).** `attachSquareGiftCardStates` and
  `attachSquareDiscountStates` use `win.prizeKind`/`prizeDiscountKind` (live reward when it exists) plus
  `win.prizePosDelivery` (always the coupon). They can only disagree with the server if a reward's prize is edited
  after a win, and no UI can do that (the API `updateChallengeCampaign` can). Worst case is a button the server then
  refuses with a clear message; money is still decided only by the coupon. Not worth an extra read per wallet open.
- The discount path's existing rule ("use the LIVE reward's terms for the discount name") is unchanged for
  discount-delivered coupons.
- `lib/pos/redeemedRewards.ts` needed **no change**: it labels by `redeemed_method`, and a scannable coupon is claimed
  with `pos_square`, so it reads e.g. "$5 off Appetizer" / Square gift card / amount + balance from the ledger.
  Pinned by a test.

### 4. What S2 built

- **`lib/pos/prizeDelivery.ts`**: new `isSquareGiftCardPrize({ prizeKind, prizeType, prizeDiscountKind,
  prizePosDelivery })`, the one rule for "this coupon becomes a Square gift card": `prize_kind = 'gift_card'`, OR a
  legacy row (`prize_kind` null) with `prize_type = 'gift_certificate'`, OR `isScannableGiftCardPrize(...)`. A
  snapshotted `menu_item` kind beats a legacy `prize_type`.
- **`lib/pos/squareGiftCards.ts`**:
  - `COUPON_COLUMNS` + `CouponRow` gained `prize_discount_kind, prize_discount_value, prize_pos_delivery`.
  - `couponGiftCardCents`: scannable → cents from the coupon's dollar value (null/0/negative → `null` →
    `not_eligible`). Any other coupon with a snapshotted non-gift-card kind now returns `null` **without** the old
    pointless live-reward read (behaviour unchanged, one read saved for menu coupons). Legacy gift-card rows keep the
    fallback exactly as before.
  - The private `isGiftCardKind` now delegates to `isSquareGiftCardPrize` with no delivery.
  - `attachSquareGiftCardStates` candidates use `isSquareGiftCardPrize(win.*)`.
  - The load-bearing order (ledger row → unfunded card → claim `pos_square` → fund → show) is untouched.
- **`lib/pos/squareDiscounts.ts`**: `COUPON_COLUMNS` + `CouponRow` gained `prize_pos_delivery`;
  `ensureSquarePrizeDiscount` refuses scannable coupons first; `attachSquareDiscountStates` skips them (so a wallet
  holding only scannable coupons makes zero reads there).

### 5. Facts and traps

- **Both coupon reads now select `prize_pos_delivery`.** That is safe only because the S1 migration is already applied
  in production (and previews share that database). There is no missing-column fallback in these two reads, unlike the
  wallet read in `listChallengeCampaignWinsForUser`. Do not run this code against a database without the migration.
- A test's mocked Square "fund" reply hard-codes its own `amountCents`, and the ledger stores the **reply's** amount.
  When testing a different amount, make the mock echo `input.value.amountCents` (see the "prices from the coupon"
  test).
- The never-both rule is pinned over every prize shape by a property test in `tests/lib.pos-scannable-prizes.test.ts`
  ("over every prize shape, the wallet's two offers never overlap"). If S3 changes either predicate, that test must
  still pass.
- From S1, still true: there is no reward-edit UI for the prize; `supabase db query --linked "<sql>" -o json` works
  for read-only production SQL (no Docker here); never print `.env.local` values.

### 6. Build / run / test

```bash
npx tsc --noEmit            # never concurrently with build
npm run lint
npm run test                # end of S2: 306 files passed / 1 skipped; 3,477 tests pass / 13 skip / 0 fail
npm run build               # passed at end of S2
npx vitest run tests/lib.pos-scannable-prizes.test.ts tests/lib.pos-square-gift-cards.test.ts \
  tests/lib.pos-square-discounts.test.ts tests/lib.pos-redeemed-rewards.test.ts
```

**Verified in S2 (unit tests with an in-memory database and mocked Square):**
- A scannable `$5` coupon: ledger row → prepare → claim (`pos_square`) → fund 500 cents → show, in that order.
- Priced from the coupon even when the live reward says $50 (`$7.50` coupon funds 750).
- A failed fund resumes at the same amount, with one card and one claim.
- Null / `'discount'` delivery: never a card (no credentials read, no Square call, no ledger row), even if the live
  reward says scannable; the discount path gives them "Hightop prize: $5 off Appetizer".
- A forged `'gift_card'` on percent / free-item prizes: never a card; a percent one still gets its discount.
- A scannable coupon with null/0/negative value: refused before any Square call.
- Discount path refuses a scannable coupon with zero Square calls, even if the live reward says discount.
- Wallet: scannable → `available` / `issued`; others untouched; never both tags.
- "Rewards redeemed" list: scannable coupon shows its terms, `square_gift_card`, amount and balance.

**Not verified:** anything in a browser or against real Square. That is S4 (Andrew's $1 phone test).

### 7. Open questions for Andrew (asked in S3)

- The wizard wording (draft in the plan, S3 step 1).
- From S1: there is no "edit reward prize" screen, so "editing a reward can change it" can't happen in the UI today.
  Confirm that's fine (recommended) or whether an edit flow is wanted (outside this plan).
- New from S2, gap (c): should the big coupon on the gift-card screen say the card works on anything, rather than
  only "$5 off Appetizer"?

### 8. Recommended first steps for S3 (Sonnet 5.5, medium per the plan)

1. Read `components/rewards/CreateRewardWizard.tsx` around the prize step and the existing POS "value at the
   register" question (`prizeNeedsPosValue` in `lib/pos/prizeValue.ts` is the precedent for a POS-only wizard field).
   Use `prizeCanBeScannableGiftCard` from `lib/pos/prizeDelivery.ts` to decide when to show the choice.
2. Fix wallet gaps (a) and (b) in §1, with a test in `tests/components.square-gift-card-ui.test.ts`.
3. Add the staff/partner line in `lib/posStaffInstructions.ts` (+ `tests/lib.pos-staff-instructions.test.ts`).
4. Get Andrew's wording approval, run the four gates, write `…_PHASE_S3_HANDOFF.md`, update both status lines.
