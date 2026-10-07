# Square scannable prizes — Phase S4 handoff (2026-10-06)

Plan: `docs/square-scannable-prizes-plan.md`. Earlier: `…_PHASE_S1_HANDOFF.md`, `…_PHASE_S2_HANDOFF.md`,
`…_PHASE_S3_HANDOFF.md`. Written by the S4 agent (Opus 5.5, high).

**Where S4 stopped:** review done, five fixes applied, all gates green, browser check of the wallet done, S1–S4
**committed locally on `main`**. **NOT pushed** (a push auto-deploys to production, where Square is live). Waiting on
Andrew for: (1) OK to push, (2) the wording, (3) the $1 phone test after the deploy.

## For Andrew (plain English)

- **What changed in S4:** a code review of the whole feature found five small problems, now fixed:
  1. A coupon said "Paid as a Square gift card" even at a venue without Square. Now that line only appears where the
     coupon really can become a Square gift card.
  2. If a reward's prize were ever changed after someone won it, the coupon could have shown one amount while the
     card was funded with another. The coupon now always shows what was actually won.
  3. The dollar amount on the gift-card offer now comes from the same place that decides how much goes on the card.
  4. Changing a saved reward from "$ off" to "% off" would have failed with a database error. It now quietly
     switches the prize back to "apply a discount".
  5. An unrelated database error could have been logged as this feature's error. Fixed.
- **Is it live?** Not yet. Everything is saved (committed) on this computer. Pushing it puts it live for every
  partner, so I'm asking you first.
- **Needs you:**
  1. **OK to push?** (live for all partners. A prize behaves differently only if the partner picks "Scannable gift card".)
  2. **Wording**, all of it in `lib/posStaffInstructions.ts`:
     - Question: "How should staff take this prize at a Square register?"
     - "Apply a discount" — "Staff tap the ready-made Hightop discount. Works only on this item."
     - "Scannable gift card" — "Staff scan or type a Square gift card for the dollar amount. It can be used on
       anything, and leftover balance stays on the card."
     - On the coupon: "Paid as a Square gift card. Use it on anything."
     - Partner Manual: "A dollar off prize can instead be set to "Scannable gift card", which staff scan or type like
       any Square gift card."
  3. **After the deploy, the phone test** (steps in §8 below).

## For the next agent

### 1. Goal and scope
Finish S4: push (only with Andrew's OK), smoke-test production, then walk Andrew through the $1 phone test and check
the ledger and webhook. Out of scope: an edit-reward UI, showing the delivery choice on the partner's reward list
(dismissed finding 10 below, a candidate follow-up), Clover.

### 2. Starting state
- Branch `main`. The S1–S4 commit sits on top of `e2bf1e6` (run `git log -1` for its hash). **Not pushed, not deployed.**
- Production database: the S1 migration `20261007030714_square_scannable_prizes.sql` was applied 2026-10-07 03:15 UTC.
  S4 wrote no data and ran no scripts against production. The browser check used fake API responses only.
- Left uncommitted on purpose (other sessions' work, not this plan's): `clover-spike/`, `docs/supabase-disk-io-*`,
  `scripts/supabase-disk-io-*.sql`, `supabase/migrations/20261007025200_category_blitz_latest_round_index.sql`,
  and the 2h "UPDATE 2026-10-06 ~20:21 ET" edit in `docs/pos-rewards-integration-plan_PHASE_2h_HANDOFF.md`.
  Don't commit them with this plan.

### 3. Decisions (don't re-ask)
Partner picks per prize (default discount). The choice shows for everyone whenever `isPosIntegrationsEnabled()`.
Only `'gift_card'` is stored (null = discount). The coupon's own snapshot decides on the server (S2), and since S4
also in the wallet.

### 4. `/code-review high` findings and what was done
| # | Finding | Outcome |
|---|---|---|
| 1 | "Paid as a Square gift card" line shown on coupons that can't become a card (no Square, flag off, no location, redeemed normally) | **Fixed**: `PrizeWalletPanel.tsx` `MenuItemCoupon` shows it only when `win.squareGiftCard` is set |
| 2 | Scannable coupon at a Square venue that can't issue gift cards gets no Square discount either | **Dismissed**: new prizes only (nothing loses an existing path); no location → the discount needs one too; the normal coupon + Confirm Redemption still works. A gift-card-incapable seller is rare (country/account type) |
| 3 | Wallet took kind/amount from the live reward but delivery from the snapshot; the money path uses the snapshot | **Fixed**: `listChallengeCampaignWinsForUser` uses the coupon snapshot for prize fields when the snapshot is scannable |
| 4 | `squareGiftCardDollars` priced outside `prizePosValueCents()` (the one home) | **Fixed**: `lib/pos/prizeDelivery.ts` now calls `prizePosValueCents` (same $10,000 cap as funding) |
| 5 | Server accepts `posDelivery: "gift_card"` with the POS flag off | **Dismissed**: only the partner's own reward is affected, it's what they'd pick, flag-off coupons behave as ordinary coupons (fix 1), and a 400 would break a stale browser mid-rollout |
| 6 | `updateChallengeCampaign`: a prize-shape change without `prizePosDelivery` hits the DB shape check (500) | **Fixed**: clears `prize_pos_delivery` when the new shape can't be scannable. (No current caller passes `prizeKind`; the admin route sends only `prizeType`.) The pre-migration half of the finding is moot: the migration is applied |
| 7 | `isMissingColumn` true for any 42703 | **Fixed**: requires the column name in the message (PostgREST's 42703 text names it) |
| 8 | "Show gift card"/"Used" JSX duplicated between `GiftCardCoupon` and `MenuItemCoupon` | Dismissed (cleanup only; ~10 lines) |
| 9 | `isGiftCardKind` indirection / redundant `menu_item` checks | Dismissed (style) |
| 10 | Partner can't see a reward's delivery choice after creating it | **Follow-up**, not a bug. Needs an Andrew decision (where to show it). Not built |

New tests: `tests/lib.pos-scannable-prizes.test.ts` (`squareGiftCardDollars`, update clears delivery),
`tests/lib.rewards-cycle-snapshot.test.ts` (scannable coupon shows its own prize; unrelated missing column),
`tests/components.square-gift-card-ui.test.ts` (line hidden without Square state).

### 5. Traps
- `.env.local` points at the **production** Supabase. The browser check intercepted every `/api/**` call and aborted
  `supabase.co`. Do the same, or seed nothing without asking.
- Playwright isn't a repo dependency. A copy exists at a previous session's scratchpad
  (`/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/f1fed1da-…/scratchpad/node_modules/playwright`).
  Scratchpads are temporary, so install a fresh copy if it's gone.
- The coupon badge is CSS-uppercased: `innerText` reads "USED", not "Used".
- The wizard needs a real partner login to drive in a browser. It was covered by the jsdom tests only.

### 6. Commands and results (S4, after the fixes)
`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test` 306 files, **3,488 pass / 13 skip / 0 fail** ·
`npm run build` passed (run in sequence). Browser (Chromium, 390×844, `/redeem-prizes`, fake data): no Square state →
no line + Redeem; `available` → line + "$5.00 Square gift card" offer; `issued` → "Show gift card"; `used` → "USED".
Not verified: real Square, production deploy, the wizard in a browser.

### 7. Open questions for Andrew
Push OK; wording (above); finding 10 (show "Square gift card" on the partner's reward card?).

### 8. Next steps (Opus 5.5, high)
1. With Andrew's OK: `git push origin main`. Watch the Vercel production deploy reach Ready. Smoke: `/info` 200,
   `/api/owner/pos` signed out → 401, unsigned `POST /api/webhooks/square` → 401.
2. Andrew's phone test: Partner Dashboard → Rewards → new reward, prize "$1 off" an item, choose **Scannable gift card**.
   Win it with a test player (or seed one coupon **only with his OK**, as in the 2h handoff). Then: wallet → Redeem →
   "Get my Square gift card" → number + barcode. In the Square app, charge an item → Gift card → type the number.
   Scan it too if he has a scanner or a Square Handheld.
3. Check: a `pos_reward_applications` row for the redemption with `status = succeeded`, amount 100 cents; the coupon
   `redeemed_method = 'pos_square'`; after the spend a `[PosSquare] webhook-…` log line and the ledger balance
   updated; the wallet shows "Used" once the balance is $0. Never print or log the GAN.
4. Update this file, the plan status line and `docs/pos-rewards-integration-plan.md`, then mark the plan done.
