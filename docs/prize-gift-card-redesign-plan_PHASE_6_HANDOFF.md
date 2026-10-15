# Prize Gift Card Redesign — Phase 6 Handoff (review, phone checklist, wrap-up)

## Summary for Andrew (plain English)

**The build is finished.** A code review of all six phases found four real problems. All four are
fixed:

1. **Square gift card label.** When a guest turned a dollar-off menu prize into a Square gift card,
   the new card said "REWARD" instead of "GIFT CARD". It now says "GIFT CARD".
2. **Extra gap on phones.** On phones, each prize card had an extra 10 px gap on every side, so the
   cards didn't line up with the rest of the page. Fixed.
3. **Logo on small phones.** On small phones (iPhone SE size), the logo was pushed 8 px in from the
   card's edge. Fixed.
4. **Wording for a custom menu item.** A prize with your own wording read badly on the back, for
   example "Good for one 2 Tacos". It now reads "Good for 2 Tacos" or "Good for a Pitcher of Beer".

Also, the Square offer sentence now says "$25", to match the card, instead of "$25.00".

**Your answers are recorded:** Q1 and Q2 stay as they are, and the sample card keeps "YOUR VENUE"
(Q3).

**One new question (Q7):** in the redeem sheet, staff are told to tap the card to see the sparkle,
and that tap also flips the big card over to its details. Decide after you try it on a phone (item
2.2 on the checklist).

**Nothing is committed, pushed or deployed.** No database, money, request or server changes in any
phase. **What needs you:**

1. Say whether to commit and deploy. The email picture only shows in inboxes after the deploy.
2. Then do the phone pass in `docs/prize-gift-card-redesign-device-checklist.md`.

**To look at (in VS Code):** `tmp/p6-wallet-375.png` and `tmp/p6-wallet-320.png` (the list on a
375 px and a 320 px phone), `tmp/p6-wallet-back-375.png` (the flipped back of a "2 Tacos" prize),
and `tmp/p6-manual-375.png` (the Partner Manual section).

---

## For the next agent

You have none of my context. Read `docs/prize-gift-card-redesign-plan.md` (§1 decisions, §2.8 the
flip, §5 traps, §6 questions) first.

### 1. What's next and scope
The plan's six phases are done. Remaining work depends on Andrew:
- **Commit / push / deploy:** only when Andrew says so. Run `/verify`-style checks before
  committing (the global instruction says run `/verify` right before `commit`; for this UI change
  that means the gates in §6 below).
- **Phone-pass fixes:** whatever Andrew reports from `docs/prize-gift-card-redesign-device-checklist.md`.
- **Q7:** if Andrew wants the big card in the redeem sheet to stop flipping, drop the `back` prop
  from `LargePrizeCard` in `components/prizes/PrizeWalletPanel.tsx`. Leave the Square ready card
  (`SquareGiftCardPanel.tsx`) as it is unless he says otherwise. Then update the test "the action
  is a white pill, and Redeem still opens the live sheet with the large card" in
  `tests/components.prize-wallet-card.test.ts`. Also update plan §2.8 ("Cards in the list and the
  large card in the redeem sheet both flip") and the checklist item 2.2.

**Out of scope:** server/API changes, renaming "coupon" in staff copy (Q1, Andrew: leave it), the
legacy "Weekly Prize Wins" list, a new email picture (Q3, Andrew: keep "YOUR VENUE").

### 2. Starting state
- Branch `main`, last commit `5cc151c`. **Phases 1–6 are all uncommitted**; nothing pushed or
  deployed. No migration, env var, flag, data or `vercel.json` change anywhere in the plan.
- Phase 6 changed:
  - `lib/prizeCardFace.ts`: `menuItemPhrase` uses `withIndefiniteArticle` (from
    `lib/rewardDefinitions.ts`, client-safe) for an `other` item with the partner's own name.
    Built-in items keep "one Appetizer" / "your whole order".
  - `components/prizes/SquareGiftCardPanel.tsx`: new `asIssuedCard(win)` shared by
    `giftCardFace` and `giftCardBack`, so a card the sheet just made reads as an issued Square card
    (label GIFT CARD). The offer sentence uses `formatPrizeDollars`. The staff line
    "Started at $25.00" is unchanged on purpose (staff wording stays the same, plan §1).
  - `components/prizes/PrizeWalletPanel.tsx`: the list item wrapper is a `<div>`, not an
    `<article>`. `app/globals.css` pads every `.tp-page-main section, .tp-page-main article` by
    `0.625rem !important` at ≤430 px.
  - `components/prizes/PrizeCardLogo.tsx`: adds `[&:not(:disabled)]:!p-0
    [&:not(:disabled)]:!min-h-0`. The global `button:not(:disabled)` rules (min-height 36 px at
    ≤430 px; side padding 0.5rem at ≤380 px, both `!important`) have specificity 0,1,1, so a plain
    `!p-0` (0,1,0) loses. The arbitrary variant compiles to `.cls:not(:disabled)` (0,2,0).
    I checked this with the Tailwind CLI.
  - Tests: `tests/lib.prize-card-face.test.ts` (custom-item terms),
    `tests/components.square-gift-card-ui.test.ts` (offer "$5", GIFT CARD label after issue),
    `tests/components.prize-card.test.ts` (+1: logo out-ranks the phone button rules).
  - Docs: `CLAUDE.md` (a "one digital gift card" bullet in the Rewards System section, including
    the email-asset versioning rule), `SYSTEM_CONTEXT.md` §8, `AGENTS.md`, the plan (status line,
    §6 answers + Q7), the new `docs/prize-gift-card-redesign-device-checklist.md`, and this file.
  - Screenshots `tmp/p6-*.png` (`tmp/` is git-ignored).

### 3. Decisions (don't re-ask)
- Andrew, 2026-10-15: Q1 default (keep "coupon" in staff copy), Q2 default (drop "Awarded"), Q3
  keep "YOUR VENUE" (so `public/brand/email/prize-card-v1.png` stays). Q4–Q6 on defaults.
- **Review findings I did not change, and why:**
  - *The large card flips on the staff tap.* This is what plan §2.8 asks for; it's now Q7, for
    Andrew.
  - *Redeem is only on the back, with no button on the front.* This is Andrew's decision (§1
    item 9, Q6 default). It's on the checklist.
  - *`prizeActionOf` doesn't use `isSquareGiftCardPrize` (legacy gift_certificate).* The backend
    maps a legacy `gift_certificate` to `prizeKind: "gift_card"`
    (`lib/challengeCampaigns.ts` ~L300), so that row shape never reaches the wallet. The "never
    offers Show gift card" decision is pinned by a test as unchanged behaviour.
  - *`formatDate` / `EXPIRY_CLASS` duplicate `backDate` / `PRIZE_CARD` tones.* `formatDate` serves
    the out-of-scope weekly list. The list's red-400/amber-400 sits on the page background, while
    the back's 300 shades sit on navy, so they aren't meant to be the same.
  - *Function declarations vs arrow functions in `PrizeWalletPanel.tsx`.* This matches the rest of
    that file (pre-existing style). Style only.

### 4. Facts and traps
- **Browser pass from a clone:** the proxy redirects unknown signed-out paths to `/`, and a
  signed-in player gets bounced off non-player paths. So a throwaway page to show an owner
  component goes under `app/info/<name>/` (public) and is opened in a **signed-out** browser
  context. The rest of the recipe is in the Phase 3 handoff §5. I killed only my own PID (port
  3123) and deleted the clone. Andrew's `next dev` on :3000 was not touched.
- Card art didn't change, so the email PNG wasn't re-rendered. The render script doesn't load
  `globals.css`, so the logo fix doesn't affect it.
- All the traps in plan §5 still apply.

### 5. Verified
- `npx tsc --noEmit` (filtering `.next/`): clean. `npm run lint`: clean.
- `npm run test`: **392 files passed, 1 skipped; 4,664 tests passed, 13 skipped, 0 failed.**
  Re-run after the doc edits: same result.
- `npm run test:pwa-contract`: 20/20. `npm run build`: succeeded.
- Browser (clone, all APIs faked, Chromium):

  | Check | 375 px | 320 px |
  |---|---|---|
  | List item is a `DIV` with 0 padding | ✓ | ✓ |
  | Logo padding 0, min-height 0, 16 px from card edge (= card padding at the 13 px root) | ✓ | ✓ |
  | No horizontal overflow | ✓ | ✓ |
  | A flipped "2 Tacos" card's Terms reads "Good for $5 off 2 Tacos" | ✓ | ✓ |

  Partner Manual section at 375 px: card 312 px in a 315 px section, logo border 0, the card does
  not flip, no overflow.
- **Not verified:** everything on the device checklist (real phones, haptics, Reduce Motion, real
  redeem, real Square, real mail clients).

### 6. Gates to run before any commit
`npx tsc --noEmit | grep -v "^.next/"`, `npm run lint`, `npm run test`,
`npm run test:pwa-contract`, `npm run build`. **Never run typecheck and build at the same time.**

### 7. Open questions for Andrew
- Commit / push / deploy: when?
- Q7 (plan §6): should the big card in the redeem sheet flip on the staff tap?

### 8. Recommended first steps
1. Ask Andrew whether to commit. If yes: run the §6 gates, then commit all plan files. Run
   `git status` and check against the file lists in the six handoffs.
2. After the deploy, Andrew does the phone checklist. Fix what he reports. For a quick fix, use
   Sonnet 5.5 (medium effort). If it touches redemption, use Opus 5.5 (high effort).
