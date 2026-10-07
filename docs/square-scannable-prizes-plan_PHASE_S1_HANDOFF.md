# Square scannable prizes — Phase S1 handoff (2026-10-06)

Plan: `docs/square-scannable-prizes-plan.md`. This note closes **S1** (database column, coupon snapshot, save/read
plumbing). Next: **S2** (the money path). Written by the S1 agent (Opus 5.5, high).

## For Andrew (plain English)

- **What changed:** the database now has a place to record, per prize, "staff apply a discount" or "scannable Square gift
  card". When someone wins, their coupon copies that choice, so changing a reward later never changes a coupon already
  won. The server refuses "scannable gift card" on anything except a dollar-off menu prize (for example "$5 off
  Appetizer").
- **Is it live?** The **database change is live** (applied 2026-10-07 03:15 UTC, with your OK). It is invisible: every
  existing reward and coupon reads as "discount", exactly as before. The **code is not committed or deployed**. It ships
  in S4, and it works whether or not the database change is there.
- **Your answers recorded:** (1) apply the migration in S1: done. (3) the wizard choice shows **for everyone** whenever
  the Point of Sale switch is on, not only for Square-connected venues. Venues without Square get the normal coupon.
- **What's left:** S2 (make such a coupon actually become a Square gift card), S3 (the wizard choice and wording, which
  you approve), S4 (review, commit, deploy, your iPhone test).
- **Needs you now:** nothing. You'll be asked to approve the wizard wording in S3.

---

## For the next agent (S2)

### 1. Goal and scope of S2

From the plan, Phase S2 "money path". A coupon whose **own snapshot** says `prize_pos_delivery = 'gift_card'` on a
dollar-off menu prize becomes a real Square gift card for `prize_discount_value` dollars, through the existing
`openSquareGiftCard` order (ledger row → unfunded card → claim `pos_square` → fund → show). The discount path must skip
such coupons, so a coupon never offers both.

- `lib/pos/squareGiftCards.ts`: replace the private `isGiftCardKind` decisions with one predicate that also accepts
  scannable menu prizes. Amount for those = `prizePosValueCents({ prizeKind: "menu_item", prizeDiscountKind: "dollar",
  prizeDiscountValue, … })` (`lib/pos/prizeValue.ts`, the one home). Add `prize_kind, prize_discount_kind,
  prize_discount_value, prize_pos_delivery` to `COUPON_COLUMNS` (it currently has only `prize_kind, prize_type,
  prize_gift_certificate_amount` of the prize fields). `attachSquareGiftCardStates` (line ~454) must use the same predicate.
- `lib/pos/squareDiscounts.ts`: `attachSquareDiscountStates` (line ~151) and `ensureSquarePrizeDiscount` (line ~83) skip
  scannable coupons. `squareDiscountSpec` itself stays unchanged.
- `lib/pos/redeemedRewards.ts`: probably **already correct**. It labels by `redeemed_method` (`pos_square` →
  `"square_gift_card"`, `redeemedHow`, line 57), and a scannable coupon is claimed with `pos_square`. Verify with a test
  rather than change it.
- Tests (plan S2 step 4): delivery `gift_card` creates/claims/funds for the dollar value; null/`discount` still gets the
  named discount and never a card; a percent prize with a forged `gift_card` is never a card.

**Out of scope for S2:** the wizard UI and any wording (S3); `lib/posStaffInstructions.ts` (S3); committing/deploying
(S4); a reward *edit* UI (none exists, see §5); Clover.

### 2. Starting state

- Branch `main`, last commit `e2bf1e6` ("POS: refused Square reconnect retires the old connection (R5); 2h pilot docs").
  **Nothing from S1 is committed or pushed.** `main` auto-deploys to production on push, and Square is live there
  (`NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED=true`), so do not push mid-phase. The plan has S4 do the commit.
- **Production database:** migration `supabase/migrations/20261007030714_square_scannable_prizes.sql` **applied**
  2026-10-07 03:15:16 UTC to linked project `pkmxupsayzshvpirkaav` (Andrew approved it in this session). The first
  `supabase db push` failed before connecting ("Failed to create login role: Connection terminated due to connection
  timeout"). `supabase migration list` confirmed it was still unapplied, and the retry succeeded. Dry run beforehand
  showed it was the only pending migration. No data changed: no backfill, and the column is null on all 8 campaigns and
  all 9 coupons (checked after apply). No undo log is needed. To reverse, a new migration would drop the two columns
  and the constraints and re-create the function from `20261004192844_pos_foundation.sql`. Don't do that without Andrew.
- Working tree also holds **other sessions' uncommitted work that is not S1's**: `docs/pos-rewards-integration-plan.md`
  and `…_PHASE_2h_HANDOFF.md` (2h edits; I changed only the status-paragraph line about Phase 2i), `clover-spike/`,
  `docs/supabase-disk-io-*`, `scripts/supabase-disk-io-*.sql`,
  `supabase/migrations/20261007025200_category_blitz_latest_round_index.sql` (already applied in production by another
  session). Don't commit or revert those as part of this plan without checking with Andrew.

S1's own files:

| File | Status |
|---|---|
| `supabase/migrations/20261007030714_square_scannable_prizes.sql` | new, **applied** |
| `lib/pos/prizeDelivery.ts` | new |
| `scripts/test-square-scannable-prizes.cjs` | new (isolated SQL check) |
| `tests/lib.pos-scannable-prizes.test.ts` | new |
| `types/index.ts` | modified |
| `lib/rewards.ts` | modified |
| `lib/challengeCampaigns.ts` | modified |
| `tests/lib.rewards-definitions.test.ts`, `tests/lib.rewards-cycle-snapshot.test.ts` | modified (tests appended) |
| `docs/square-scannable-prizes-plan.md` | status line + open question 3 answered |
| `docs/pos-rewards-integration-plan.md` | Phase 2i status line only |

### 3. Decisions already made (do not re-ask)

- **Partner picks per prize**; "Apply a discount" is the default (Andrew, 2026-10-06, in the plan).
- **Wizard choice shows for everyone whenever `isPosIntegrationsEnabled()`**, not only Square-connected venues (Andrew,
  2026-10-06, answering plan open question 3). That's S3's concern, recorded here so S3 doesn't ask again.
- **Migration applied in S1** (Andrew, 2026-10-06).
- **Stored values (my S1 decision):** the app writes the column **only** as `'gift_card'`. Absent, null and
  `'discount'` are all normalised to "write nothing" (create) or `null` (update). The check constraint allows
  `'discount'` for completeness, but the app never stores it. Why: deploy-skew safety (an ordinary reward never sends
  an unknown column), and one meaning for "default".
- **Coupon snapshot is authoritative.** `ChallengeCampaignWin.prizePosDelivery` is read only from the coupon row, never
  from the live reward (unlike the other prize fields, which prefer the live reward). The S2 money path must also read
  the coupon's own column and **must not fall back to the live campaign** for delivery. A null coupon means discount,
  including every coupon won before 2026-10-07.
- **Leaderboard coupons don't copy the column, on purpose.** Writers of `challenge_campaign_redemptions`, from the grep
  the plan asked for:
  1. `award_cycle_winner` RPC (progress + game-winner rewards, which is everything the wizard creates): **copies it**.
  2. `finalizeClosedLeaderboardCampaigns` / `finalizeClosedRecurringCycles` in `lib/challengeCampaigns.ts` via
     `redemptionPrizeSnapshot`: **does not**. Leaderboard creation is retired, and both registry definitions in
     `lib/rewardDefinitions.ts` are `challengeMode: "progress"`. The mapped campaign doesn't carry the column either
     (it is not in `CAMPAIGN_SELECT_COLUMNS`). Documented in `redemptionPrizeSnapshot`'s doc comment and pinned by a test.
  3. `scripts/recompute-challenge-cycles.cjs` `awardPrize` (manual ops script, writes no prize snapshot at all):
     untouched.
  4. `scripts/test-reward-redeem-once.cjs`: a test fixture only.
- **DB shape check on `challenge_campaigns` only**:
  `challenge_campaigns_prize_pos_delivery_shape_check`, so 'gift_card' requires `prize_kind = 'menu_item'` and
  `prize_discount_kind = 'dollar'`. Coupons get only the value check, because they are history
  (`20260726120000_rewards_detachable_redemptions.sql` deliberately has no prize constraints). So S2's predicate must
  re-check the shape on the coupon. `isScannableGiftCardPrize` does that.

### 4. What was built and how it fits

- **`lib/pos/prizeDelivery.ts`** (pure, client-safe, no `server-only`). It is the single home of the rule:
  - `normalizePrizePosDelivery(value)` → `"discount" | "gift_card" | null` (unknown → null, never a card).
  - `prizeCanBeScannableGiftCard(prizeKind, discountKind)` → menu_item + dollar only.
  - `isScannableGiftCardPrize({ prizeKind, prizeDiscountKind, prizePosDelivery })` is **THE predicate S2 must use** in
    both `squareGiftCards.ts` and `squareDiscounts.ts` (the plan asks for one exported helper used by both files). It
    accepts strings, so raw coupon columns can be passed directly.
- **`types/index.ts`**: `PrizePosDelivery = "discount" | "gift_card"` (next to `RewardDiscountKind`), plus
  `ChallengeCampaignWin.prizePosDelivery?: PrizePosDelivery | null`. **`ChallengeCampaign` did NOT get the field.** The
  campaign column is kept out of `CAMPAIGN_SELECT_COLUMNS` (plan rule, same as `prize_pos_value_cents`), so a mapped
  campaign can't know it. If S3 wants to show "Scannable" on the partner's reward list, it needs its own read. Raise it
  with Andrew before adding the column to `CAMPAIGN_SELECT_COLUMNS`. That is safe now that the migration is applied,
  but it breaks the plan's stated rule.
- **`lib/rewards.ts`**: `RewardPrizeInput` (menu_item variant) gets `posDelivery?: PrizePosDelivery | null`.
  `normalizeRewardPrize` reads `posDelivery` off the raw body for **any** prize kind and throws
  `REWARD_INVALID_PRIZE_MESSAGE` for an unknown value, or for 'gift_card' on a non-dollar or gift-card prize. Both
  routes (`app/api/owner/rewards/route.ts`, `app/api/admin/route.ts` ~line 1046) already map that message to **400**,
  so **no route change was needed**: they pass `body.prize` through untouched. `NormalizedRewardPrize.prizePosDelivery`
  → `createChallengeCampaign({ prizePosDelivery })`.
- **`lib/challengeCampaigns.ts`**:
  - `PRIZE_POS_DELIVERY_INVALID_MESSAGE` (exported).
  - `createChallengeCampaign`: validates again, and spreads `prize_pos_delivery: "gift_card"` into the insert **only**
    when set.
  - `updateChallengeCampaign`: `prizePosDelivery` is accepted **only together with `prizeKind`** (else it throws
    "prizePosDelivery must be sent together with prizeKind."). It validates, writes `'gift_card'` or `null`, and leaves
    the column untouched when absent. No current caller passes it. The admin PATCH (`app/api/admin/route.ts` ~1597)
    passes no new-model prize fields at all.
  - `listChallengeCampaignWinsForUser`: the redemption select now also asks for `prize_pos_delivery`. On a
    missing-column error it logs `[ChallengeWallet] pos-delivery-column-missing` and retries once without the column.
    The select list moved to the const `WALLET_REDEMPTION_COLUMNS`.
  - The old `isMissingTermsStampColumn` became the generic `isMissingColumn(error, column)`. Behaviour is unchanged
    for `terms_updated_at`.
- **Migration** `20261007030714_square_scannable_prizes.sql`: two columns, the value check on both tables, the shape check on
  campaigns (`is not distinct from`, see §5), and `award_cycle_winner` re-created from the pos_foundation body plus
  `prize_pos_delivery` / `c.prize_pos_delivery`. Same arity, no drop, and the revoke/grant lines are kept.

### 5. Facts and traps

- **SQL NULL trap (caught by the isolated test):** a check written as
  `prize_pos_delivery is distinct from 'gift_card' or (prize_kind = 'menu_item' and …)` **passes** for a legacy row
  with `prize_kind` NULL, because a check that evaluates to NULL passes. The applied version uses `is not distinct from`.
  Don't "simplify" it back.
- **There is no reward-edit UI for the prize.** Rewards are create-only in the wizard. The plan's S3 line "Editing a
  reward can change it" has no screen to live on today. `updateChallengeCampaign` supports it for when one exists.
  Raise it with Andrew in S3 rather than building an edit flow.
- **Wallet field sources differ:** `win.prizeKind` / `prizeDiscountKind` / `prizeDiscountValue` come from the **live**
  reward when it exists (`resolveRewardPrize(campaign ?? snapshot)`), while `win.prizePosDelivery` comes from the
  **coupon**. With no prize-edit path they agree in practice. In S2, have the server money path read **coupon** columns
  for everything (as `openSquareGiftCard` already does via `loadOwnedCoupon`). The wallet-state predicate
  (`attachSquareGiftCardStates`) works from `win.*` fields. If you want them strictly identical, add the coupon's own
  `prize_discount_kind`/`prize_discount_value` reads there too. That is your call; record it.
- The gift-card UI reads its amount from somewhere (`components/prizes/SquareGiftCardPanel.tsx`,
  `PrizeWalletPanel.tsx`; check whether it uses `prizeGiftCertificateAmount`). A scannable menu coupon has that null
  and its dollars in `prizeDiscountValue`. S2/S3 must make the panel show the right amount.
- `supabase db dump` needs Docker, which this machine doesn't have. For read-only production SQL checks, use
  **`supabase db query --linked "<sql>" -o json`** (Management API, works). PostgREST checks: `node --env-file=.env.local`
  with the service-role key (pattern in memory: query production yourself, don't ask Andrew for SQL). Never print
  `.env.local` values. Even `cut -d= -f1 .env.local` was **denied** by the permission layer this session.
- `supabase db push` can fail once with a login-role connection timeout. Check `supabase migration list` before
  retrying.
- The Supabase CLI prints a stray "Skipping migration Warnings..." line. A file literally named `supabase/migrations/Warnings`
  exists (not ours). It is harmless; leave it.
- PGlite is not a project dependency. I installed `@electric-sql/pglite@0.2` in the session scratchpad, which is gone
  for you. To re-run the SQL check, install it anywhere outside the repo and point `REDEEM_PGLITE_MODULE` at it.

### 6. Build / run / test

```bash
npx tsc --noEmit            # never concurrently with build
npm run lint
npm run test                # 306 files / 3,461 pass / 13 skip / 0 fail at end of S1
npm run build               # passed at end of S1
npx vitest run tests/lib.pos-scannable-prizes.test.ts tests/lib.rewards-definitions.test.ts tests/lib.rewards-cycle-snapshot.test.ts
# Isolated SQL (no network; never touches production):
REDEEM_PGLITE_MODULE=/path/to/node_modules/@electric-sql/pglite node scripts/test-square-scannable-prizes.cjs
```

**Verified in S1:**
- All four gates are green.
- The isolated SQL script replays the real coupon/award migration history plus this migration (twice, so it can be
  re-run). It checks the value allowlist, the shape check on insert and on a later edit, that a NULL `prize_kind`
  legacy row is refused, the award snapshot (`gift_card` and null), that the snapshot survives a reward edit, the
  coupon value check, one overload, and service-role-only execution.
- In production (read-only): both columns readable (HTTP 206), zero non-null rows. `award_cycle_winner` has exactly
  1 overload, its definition contains `c.prize_pos_value_cents, c.prize_pos_delivery`, anon/authenticated cannot
  execute it, service_role can. All three constraints exist (`challenge_campaigns_prize_pos_delivery_check`,
  `challenge_campaigns_prize_pos_delivery_shape_check`, `challenge_campaign_redemptions_prize_pos_delivery_check`).

**Not verified:** a real award in production writing `'gift_card'`. No reward can have it yet, because nothing sends it
until S3. Nothing in the browser.

### 7. Open questions for Andrew

- S3: the wizard wording (draft in the plan, S3 step 1). Still open.
- S3 (new, from §5): there is no "edit reward prize" screen, so "editing a reward can change it" can't happen in the UI
  today. Confirm that's fine (recommended), or whether an edit flow is wanted (out of this plan).

### 8. Recommended first steps for S2 (Opus 5.5, high — money)

1. Read `lib/pos/squareGiftCards.ts` top comment (the load-bearing order) and `lib/pos/prizeDelivery.ts`.
2. In `squareGiftCards.ts`, add a coupon-level helper using `isScannableGiftCardPrize` + the existing legacy rule, and
   compute cents from `prize_discount_value` for scannable coupons. Keep `couponGiftCardCents`'s live-reward fallback
   for the **amount/kind of legacy rows only**, never for delivery.
3. In `squareDiscounts.ts`, exclude coupons where `isScannableGiftCardPrize(...)` is true (both the wallet attach and
   `ensureSquarePrizeDiscount`, which should return `not_eligible`).
4. Extend `tests/lib.pos-square-gift-cards.test.ts` and `tests/lib.pos-square-discounts.test.ts` (their fixtures build
   coupon rows; add `prize_pos_delivery`). Then run the full gates and write `…_PHASE_S2_HANDOFF.md`.
