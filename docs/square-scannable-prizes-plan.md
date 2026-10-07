# Square scannable dollar-off prizes (POS Phase 2i)

**Status:** **S1 DONE 2026-10-06** (migration `20261007030714_square_scannable_prizes.sql` applied to production
03:15 UTC 2026-10-07 and verified). **S2 DONE 2026-10-06** (money path; app code for S1+S2 uncommitted, ships in S4).
**S3 DONE 2026-10-06** (wizard choice, wallet fixes, wording). **S4 IN PROGRESS 2026-10-06**: review + 5 fixes, gates
green, S1–S4 committed locally, **not pushed** (waiting on Andrew: push OK, wording, then the $1 phone test). Latest
handoff: **`docs/square-scannable-prizes-plan_PHASE_S4_HANDOFF.md`**. **Handoffs:** `docs/square-scannable-prizes-plan_PHASE_<N>_HANDOFF.md`;
each phase also updates the status line of `docs/pos-rewards-integration-plan.md`.

## Summary for Andrew (plain English)

**Goal (Andrew, 2026-10-06):** "I want staff with Square devices to be able to scan the Reward and have it applied to
the check." Square's register app can't read our QR codes or apply our discounts by scanning; only outside companies'
gift cards scan. So a **dollar-off** prize (for example "$5 off Appetizer") can now be delivered as a real Square gift
card for that amount. Staff scan its barcode, or type the number, as payment. **Andrew: "I don't think scanning works on an
iPhone. Let's go with Option 1. Can we keep both preset discount and scanning as options?"** Yes. **The partner picks,
per prize** (Andrew's answer, 2026-10-06):

- **"Staff apply a discount"** (today's behaviour, and the default): the coupon shows the ready-made "Hightop prize: $5 off
  Appetizer" discount, then "Confirm Redemption".
- **"Scannable Square gift card"** (new): the guest taps "Get my Square gift card", exactly like a gift-card prize today.
  The card can be spent on **anything**, and any balance left stays on the card. The wizard says so plainly.

Percent-off and free-item prizes have no fixed dollar value, so they stay discount-only. A venue without Square
connected still gets the normal coupon, as today. Nothing changes for any prize that already exists.

| Phase | What | Model / effort | Needs Andrew? |
|---|---|---|---|
| S1 | Database column + coupon snapshot + save/read plumbing | **Opus 5.5, high** (re-creates the winner database function) | **Yes**: OK to apply the migration to production |
| S2 | Money path: such a coupon becomes a Square gift card; the discount path skips it | **Opus 5.5, high** (money) | No |
| S3 | Wizard choice (partner + admin), coupon/staff/partner wording | **Sonnet 5.5, medium** | Wording review |
| S4 | Review, commit, deploy, real test on Andrew's Square | **Opus 5.5, high** | Commit/deploy OK + the phone test |

**Cost:** no new crons, polling or tables. A scannable prize uses the gift-card path: about 3–4 Square calls per
open instead of 1 catalog search (free within Square's limits), and 1 webhook per spend. One extra nullable column on two
tables, so storage is unchanged.

---

## For the agent doing any phase

### Ground rules
- Read `CLAUDE.md` (POS + Rewards sections) and `SYSTEM_CONTEXT.md`. Square is **live** in production
  (`NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED=true` since 2026-10-06, deploy `dpl_5JAih4xzgz7Sw7PRHeJzPm215eyu`), so every
  push to `main` auto-deploys to real partners. Keep each commit safe on its own: an old coupon (column null) must behave
  exactly as today.
- Coupons are redeemed only through `redeem_challenge_prize`; gift cards keep the load-bearing order in
  `openSquareGiftCard` (ledger row → unfunded card → claim `pos_square` → fund → show). Never log or store a GAN.
- `CreateRewardWizard` stays ONE shared component (admin + owner); admin snapshots must stay unchanged unless the change
  is intended and called out.
- New migration only (never edit an old one). It touches no new table, so no new grants; keep the existing
  `revoke`/`grant execute` lines on the re-created function. `supabase db push` asks Andrew first.
- Gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not tsc and build at once). POS suites:
  `tests/lib.pos-square*.test.ts`, `tests/api.square-routes.test.ts`, `tests/lib.pos-redeemed-rewards.test.ts`; wizard:
  the `CreateRewardWizard` tests and admin snapshots.

### Data model (decided)
- New column `prize_pos_delivery text null check (prize_pos_delivery in ('discount','gift_card'))` on **both**
  `challenge_campaigns` and `challenge_campaign_redemptions`. Null = `'discount'` (today). Only meaningful when
  `prize_kind = 'menu_item'` and `prize_discount_kind = 'dollar'`; the server refuses `'gift_card'` on anything else.
- The coupon snapshots it at award time, like every other prize field: re-create `award_cycle_winner` copying
  `c.prize_pos_delivery`. Base it on the **current** definition in `20261004192844_pos_foundation.sql` (same arity, so no
  drop). **Before writing it, grep for every other INSERT into `challenge_campaign_redemptions`** (NFL Pick 'Em reward
  path, leaderboard finishers, admin tools) and copy the column there too, or record why not.
- Gift card amount = `prize_discount_value` dollars → cents through `prizePosValueCents()` (`lib/pos/prizeValue.ts`, the
  one home). The register cap (`prize_pos_value_cents`) does not apply to fixed-dollar prizes.
- Deploy skew: write the column only when set (same rule as `prize_pos_value_cents`), and keep it out of
  `CAMPAIGN_SELECT_COLUMNS` until the migration is applied, so code ahead of the migration can't break reward reads.

### Phase S1: column, snapshot, plumbing
1. `supabase migration new square_scannable_prizes` → the two columns + re-created `award_cycle_winner` (+ any other
   insert path found by the grep). Header comment explains deploy order (migration first is safe; code tolerates
   either order).
2. Types (`types/index.ts`), `lib/challengeCampaigns.ts` create/update (validate: `'gift_card'` only for dollar menu
   prizes, else 400), the owner + admin campaign routes, and `ChallengeCampaignWin` (wallet read) carry
   `prizePosDelivery`.
3. Tests: validation; snapshot copy (static SQL contract test like the existing POS foundation one); null round-trips.
4. Ask Andrew, then `supabase db push`; verify the columns + function through PostgREST (read-only).

### Phase S2: money path
1. `lib/pos/squareGiftCards.ts`: `isGiftCardKind` → a coupon is a gift card when `prize_kind = 'gift_card'` (as now)
   **or** it is a dollar menu prize with `prize_pos_delivery = 'gift_card'`. `couponGiftCardCents` reads
   `prize_discount_value` for the latter (add the columns to `COUPON_COLUMNS` + the legacy fallback read).
   `attachSquareGiftCardStates` uses the same predicate. Put the predicate in ONE exported helper used by both files.
2. `lib/pos/squareDiscounts.ts` (`attachSquareDiscountStates`, `ensureSquarePrizeDiscount`): skip those coupons, so a
   coupon never offers both. `squareDiscountSpec` itself is unchanged.
3. `lib/pos/redeemedRewards.ts` ("Rewards redeemed" list) labels them as gift cards.
4. Tests: the menu prize with delivery `gift_card` creates/claims/funds for the dollar value; with null/`discount` it still
   gets the named discount and never a card; a percent prize with a forged `gift_card` value is never a card.

### Phase S3: wizard + wording
1. `CreateRewardWizard`: when the prize is a dollar-off menu item and POS is enabled (`isPosIntegrationsEnabled()`), show
   a two-option choice. **Draft copy (Andrew approves):** "How should staff take this prize at a Square register?" →
   "Apply a discount" ("Staff tap the ready-made Hightop discount. Works only on this item.") / "Scannable gift card"
   ("Staff scan or type a Square gift card for $5. It can be used on anything, and leftover balance stays on the card.").
   Default "Apply a discount". Hidden for percent/free-item prizes. Editing a reward can change it; coupons already won
   keep their snapshot.
2. Coupon button and copy for these coupons = the existing gift-card copy. Staff + partner copy in
   `lib/posStaffInstructions.ts` (one home) gains one line on scannable prizes.
3. Tests: wizard shows/hides the choice correctly; admin snapshot updated deliberately.

### Phase S4: ship + prove
1. `/code-review high` on S1–S3; fix or record dismissals. Full gates.
2. Commit, push (auto-deploys), smoke the reward create/edit and wallet.
3. Andrew's phone test: a "$1 off" prize set to scannable → gift card → in the Square app, pay with Gift card, typing the
   number. If he has a scanner or a Square Handheld, try scanning too. Check the ledger and webhook as in the 2h handoff.

## Open questions for Andrew
1. S1: OK to apply the migration to production (asked when S1 is ready).
2. S3: the wizard wording above.
3. ~~Should the choice show only for venues with Square connected, or whenever the POS switch is on?~~ **Answered
   2026-10-06 (Andrew): for everyone, whenever the POS switch is on.** Venues without Square still get the normal coupon.
   (Answer 1 also given: migration applied in S1.)
