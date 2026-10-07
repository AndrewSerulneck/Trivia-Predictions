# Square scannable prizes — Phase S3 handoff (2026-10-06)

Plan: `docs/square-scannable-prizes-plan.md`. Closes **S3** (wizard choice + wording + wallet fixes). Next: **S4**
(review, commit, deploy, Andrew's phone test). Earlier: `…_PHASE_S1_HANDOFF.md`, `…_PHASE_S2_HANDOFF.md`.

## For Andrew (plain English)

- **What changed:** when you create a reward whose prize is "$ off" an item, the form now asks "How should staff take
  this prize at a Square register?" with two choices: **Apply a discount** (default, same as today) or **Scannable
  gift card**. The guest's coupon for a scannable prize now says the dollar amount in the gift-card offer, shows
  "Show gift card" after it is issued (so they can reopen the number), and says "Used" once spent. The Partner Manual
  has one new sentence.
- **Live?** No. S1–S3 app code is uncommitted. The database part (S1) is live but invisible.
- **Needs you:** approve the wording below (it's in `lib/posStaffInstructions.ts`, one place to edit), then S4 commits,
  deploys and asks you to do the $1 phone test.
  - Question: "How should staff take this prize at a Square register?"
  - "Apply a discount" — "Staff tap the ready-made Hightop discount. Works only on this item."
  - "Scannable gift card" — "Staff scan or type a Square gift card for the dollar amount. It can be used on anything, and leftover balance stays on the card."
  - Line on the big coupon of a scannable prize: "Paid as a Square gift card. Use it on anything." (my choice for gap (c); say if you want it different)
  - Manual: "A dollar off prize can instead be set to "Scannable gift card", which staff scan or type like any Square gift card."
- No edit-reward screen exists, so "editing can change it" can't happen in the UI; coupons already won keep their snapshot anyway.

## For the next agent (S4)

### 1. Goal / scope
S4 per the plan: `/code-review high` on S1–S3, fix or record dismissals, full gates, commit **only this plan's files**,
push (auto-deploys; Square is live), smoke reward create + wallet, then Andrew's $1 phone test (set a "$1 off" prize
to Scannable gift card → win → "Get my Square gift card" → pay with Gift card in Square by typing the number; scan too
if he has a scanner; check ledger + webhook as in the 2h handoff). Out of scope: edit-reward UI, Clover.

### 2. Starting state
Branch `main`, last commit `e2bf1e6`; nothing from S1–S3 committed/pushed/deployed. Migration
`20261007030714_square_scannable_prizes.sql` applied to production (S1). No data written in S3. Working tree also holds
other sessions' files (not this plan's — do NOT commit): `clover-spike/`, `docs/supabase-disk-io-*`,
`scripts/supabase-disk-io-*.sql`, `supabase/migrations/20261007025200_category_blitz_latest_round_index.sql`, and
`docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md` edits. Stage this plan's files by explicit path.

### 3. Decisions (don't re-ask)
Partner picks per prize, default discount; choice shows for everyone whenever `isPosIntegrationsEnabled()`
(Andrew 2026-10-06); only `'gift_card'` is stored; the coupon snapshot decides on the server (S2).

### 4. Files changed in S3
- `components/rewards/CreateRewardWizard.tsx` — state `scannableGiftCard`; `asksPosDelivery` = POS flag + menu_item +
  dollar; radiogroup of two buttons above the register-limit field; `prize` adds `posDelivery: "gift_card"` only when
  chosen (otherwise the submission is byte-identical to before — admin snapshots unchanged, flag off in tests);
  summary suffix " (Square gift card)". Switching to percent hides the choice and drops it from the payload.
- `lib/pos/prizeDelivery.ts` — new `squareGiftCardDollars(win)`; helper param fields made optional so a
  `ChallengeCampaignWin` type-checks.
- `components/prizes/SquareGiftCardPanel.tsx` — offer text uses `squareGiftCardDollars` (gap b).
- `components/prizes/PrizeWalletPanel.tsx` — `MenuItemCoupon` gets "Show gift card" / "Used" branches for scannable
  coupons (gap a) and the `SCANNABLE_COUPON_LINE` (gap c). Non-scannable menu coupons unchanged.
- `lib/posStaffInstructions.ts` — `SCANNABLE_COUPON_LINE`, `SCANNABLE_CHOICE_*`, manual sentence.
- Tests appended: `tests/components.create-reward-wizard.test.ts` (hidden w/o flag; hidden for percent; shown for dollar
  with no Square; payload only when chosen; percent switch drops it), `tests/components.square-gift-card-ui.test.ts`
  (offer shows $5.00, issued → Show gift card, used → Used), `tests/lib.pos-staff-instructions.test.ts`.

### 5. Traps
- The wizard reads the flag via `process.env` at render (`NEXT_PUBLIC_*`, inlined at build); tests use `vi.stubEnv`.
- `.chip` buttons are reused for the radio options; they are left-aligned with `w-full text-left`.
- One earlier full-suite run showed a single failure in an NFL bingo settlement test; it did not reproduce on the
  next two runs (unrelated, likely load-sensitive). Worth a glance if it recurs.
- Not verified in a browser or against real Square (S4).

### 6. Commands / results at end of S3
`npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 3,483 pass / 13 skip / 0 fail; `npm run build` passed
(run sequentially, never tsc during build).

### 7. Open questions
Wording approval (above); whether the big-coupon line (gap c) is right.

### 8. First steps for S4 (Opus 5.5, high)
Run `/code-review high` on the S1–S3 diff; fix; re-run gates; commit this plan's files only (migration, lib/pos/prizeDelivery.ts,
squareGiftCards/squareDiscounts, types, rewards, challengeCampaigns, wizard, wallet components, posStaffInstructions,
tests, scripts/test-square-scannable-prizes.cjs, docs); confirm with Andrew before push.
