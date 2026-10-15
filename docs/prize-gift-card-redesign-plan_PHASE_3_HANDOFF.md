# Prize Gift Card Redesign — Phase 3 Handoff

## Summary for Andrew (plain English)

**Redeem Prizes now shows the new gift card** for every prize, in this copy of the code on your
computer. Nothing is committed, pushed or deployed (that's your call), so guests don't see it yet.

What changed:
- Every prize is the navy gift card you approved, with the **logo twice as big**. On very small
  phones (320 px wide, like the first iPhone SE) the logo shrinks a little so everything still fits.
- Under each card: one quiet line (what it was won for · when it expires) and a **white Redeem
  button**. Already-turned-into-Square cards say **Show gift card**. Redeemed cards are greyed with a
  "Redeemed" (or "Used") tag and have no button.
- In the redeem sheet staff see the big card, with the live clock and sparkle exactly as before.
  The instruction is now one line: "Show this to staff, then tap Confirm Redemption."
- The Square gift card screen shows the card with **the balance left** as the big number, then the
  card number and barcode underneath.
- Removed: the old coloured coupons, the "Click Redeem on your rewards" heading and "Awarded
  {date}". The empty message is now "No prizes yet. Win a Reward here and it will show up in this list."

**How redeeming works hasn't changed**: same buttons, same once-only redemption, same Square steps.
No database, money or server change, and no new requests.

**Your flip request is written into the plan as Phase 4** (tap the card → it flips; the back shows
when it was won, for what, its terms, when it expires, a "Redeemed {date and time}" stamp, and the
staff Redeem button). Three questions with defaults are in the plan, §6:
- **Q4.** Should Redeem on the back open the live sheet, where staff tap Confirm Redemption?
  Default: **yes**. That keeps two deliberate taps and the anti-screenshot clock.
- **Q5.** Should the back also show the reward's full rules text? Default: **no**.
- **Q6.** Should a Redeem button stay under the card as well? Default: **no**, only on the back,
  with "Tap the card for details" under the card.

**Pictures to look at (in VS Code):**
- `tmp/prize-wallet-375.png` and `tmp/prize-wallet-320.png`: the page on a normal phone and a
  small one.
- `tmp/prize-sheet-375.png` and `tmp/prize-sheet-320.png`: the redeem sheet.
- `tmp/prize-square-375.png`: the Square gift card screen. The top half of this one looks odd; that's
  a screenshot quirk, not the page.
- `tmp/prize-card-specimen.png` and `tmp/prize-card-specimen-320.png`: every card state.

---

## For the next agent (Phase 4)

Read `docs/prize-gift-card-redesign-plan.md` first: §1 items 7–10 (Andrew's 2026-10-15 decisions),
**§2.8 (the back of the card, your spec)**, **Phase 4 in §3**, §5 traps, and §6 Q4–Q6. You have none
of my context; everything you need is in the repo and this note.

### 1. Phase 4 goal and scope

Tapping a prize card (anywhere except the logo, and except a control on the back) flips it with a
3D animation to a back showing **Won / For / Terms / Expires**. Once redeemed, the back carries a
**"Redeemed {date, time}"** stamp and the rows stay full contrast, so staff can tell an early
redemption by mistake. The list's action button (today under the card) moves onto the back.
Cards in the list and the large card in the redeem sheet both flip; the sample card (Partner
Manual, email) does not.

**Out of scope:** any server or `/api` change; the redeem POST and `redeem_challenge_prize`; Confirm
Redemption stays the ONLY redeem trigger (unless Andrew answers Q4 "one tap", which would be a
separate, careful change); the Square issue/open order; `already_redeemed` handling;
`useNativeBackHandler` (a flipped card is not a popup); `LiveCouponFrame`; the Partner Manual and
the email (Phase 5); renaming "coupon" in staff copy (Q1); the legacy "Weekly Prize Wins" list.

**Q4–Q6:** if Andrew hasn't answered, use the defaults and say so in your handoff.

### 2. Starting state

- Branch `main`, last commit `5cc151c`. **Nothing from Phases 1–3 is committed.** Not pushed, not
  deployed. No data, migration, env var or flag changes in any phase.
- Uncommitted from Phases 1–2: see `docs/prize-gift-card-redesign-plan_PHASE_2_HANDOFF.md` §2
  (brand READMEs, `colors_and_type.css`, `lib/themeTokens.ts` `PRIZE_CARD`, `SYSTEM_CONTEXT.md`,
  `CLAUDE.md`, `AGENTS.md`, `lib/prizeCardFace.ts`, `components/prizes/PrizeCard.tsx`,
  `PrizeCardLogo.tsx`, `tailwind.config.ts` keyframes, `scripts/render-prize-card.cjs`,
  `package.json` script, tests).
- Changed in Phase 3:
  - `components/prizes/PrizeCardLogo.tsx`: logo 2×.
  - `components/prizes/PrizeCard.tsx`: layout so the logo fills the spare height; the amount is one
    size smaller under 360 px.
  - `lib/prizeCardFace.ts`: added `wonForLine` and `prizeExpiryInfo` (moved from the wallet).
  - `components/prizes/PrizeWalletPanel.tsx`: the five coupons deleted; new
    `WalletPrizeCard`, `LargePrizeCard`, `PrizeCardAction`, `prizeActionOf`, `walletPrizeOf`,
    `walletFaceOf`; sheet copy and backdrop.
  - `components/prizes/SquareGiftCardPanel.tsx`: new `venueName` prop; the ready screen is the
    card plus a number/barcode panel.
  - `scripts/render-prize-card.cjs`: a `--width` option.
  - Tests: new `tests/components.prize-wallet-card.test.ts`; updated
    `tests/components.prize-card.test.ts`, `tests/lib.prize-card-face.test.ts`,
    `tests/components.square-gift-card-ui.test.ts` and
    `tests/components.reward-descriptions-surfaces.test.ts`.
  - Docs: the plan (new §2.8, new Phase 4, the later phases renumbered to 5 and 6, Q4–Q6,
    status line), `AGENTS.md`, and the Phase 2 handoff's approval line.
- `next-env.d.ts` is no longer shown as modified: `npm run build` regenerated it. It isn't ours.
- Pictures are in `tmp/` (git-ignored); see the list above.

### 3. Decisions already made (don't re-ask)

- Andrew, 2026-10-15: the card design is approved; the logo is 2×; the flip and its back as in plan
  §1 items 8–10. Q1–Q3 defaults stand (keep "coupon" in staff copy, "Awarded" dropped, sample
  venue "YOUR VENUE").
- Mine, Phase 3:
  - **Logo size rule.** It fills the height the headline leaves (`flex-1 min-h-0` row, `h-full`
    image), capped at 80 px (list) / 96 px (large). The amount steps down to `text-4xl` below a
    360 px viewport (`max-[359px]:text-4xl`), so a 320 px phone keeps a large logo.
    - At a 358 px card (390 px phone): list 80 px; large about 90 px, because the large card's
      `text-6xl` limits it. Large reaches 96 px at a 384 px card (phones 416 px wide and up).
    - The image is always `/brand/web/htc-logo-192.webp`; the 96 px file is no longer used here.
  - **The which-button decision is `prizeActionOf(win)`** in `PrizeWalletPanel.tsx`. It returns
    `"Show gift card"`, `"Redeem"` or `null`, exactly the old coupons' logic:
    - Show gift card: `squareGiftCard === "issued"`, and the prize is `gift_card`, or a
      `menu_item` with `isScannableGiftCardPrize`.
    - Otherwise null if `prizeRedeemedAt` is set, otherwise Redeem.
    - Legacy prizes never get "Show gift card".
    - Phase 4 must reuse it for the back's action. Don't re-derive it.
  - **`walletFaceOf`** forces a redeemed face when a prize is redeemed, has no action, and the face
    would say "ready". The only case is a legacy `gift_certificate` (no `prizeKind`) that became a
    Square card: `prizeCardFace` calls it spendable, but the list never offered to show it, and the
    old coupon said "Redeemed". This branch is effectively unreachable, because the backend
    derives `prizeKind`.
  - **The redeem sheet keeps "what it was won for" under the large card** (`LargePrizeCard`, inside
    `LiveCouponFrame`). `tests/components.prize-wallet-live-coupon.test.ts` pins that line inside
    the live coupon (it comes from the reward-descriptions plan). When Phase 4 puts "For" on the
    back, you may drop this line, but update that test deliberately and say why.
  - **The sheet backdrop went from `bg-black/75` to `bg-black/90`.** The old coupon had its own solid
    box; the card's line sits on the backdrop, and at 75% the list behind showed through it.
  - **White pill classes:** `tp-player-hit-target tp-player-pressable !rounded-full !border-0
    bg-white … !font-bold text-slate-950`. The `!` is needed because the global
    `button:not(:disabled):where(...)` rule in `app/globals.css` (around line 1037; specificity
    0,1,1) sets the border, a 12 px radius and weight 600, and it beats plain Tailwind utilities.
    That's the dark surface, so `!` is the codebase pattern (CLAUDE.md forbids `!` only on
    `ht-light-surface`).
  - **Square ready face:**
    - Built by `giftCardFace()` in `SquareGiftCardPanel.tsx`: headline = balance left via
      `formatPrizeDollars` ("$6.50"), or "Not active" as a phrase.
    - `ariaLabel` "Gift card, $9 left, The Tap Room".
    - Starting amount on the staff line.
    - `data-square-gift-card` is now on the number/barcode panel, still inside `[data-live-coupon]`.

### 4. Files and how they fit

- `lib/prizeCardFace.ts` (pure):
  - `prizeCardFace(win, venueName)` → face.
  - `wonForLine(win)`: the "won for" text.
  - `prizeExpiryInfo(expiresAt, now?)` → `{ label, tone: "urgent" | "soon" | "normal" }`.
  - `formatPrizeDollars`, `menuItemLabel`, `discountLabel`, `SAMPLE_PRIZE_CARD_FACE`.
  - **Put `prizeCardBack(win, now?)` here.**
- `components/prizes/PrizeCard.tsx`: `{ face, size?, inLiveFrame? }`. The root is
  `div[role=group][data-prize-card][data-prize-card-status]` and carries `relative isolate
  overflow-hidden`, `PRIZE_CARD.shape/base/shadow` and, when redeemed, `opacity-60 grayscale`.
  - **Those classes are exactly what flatten a 3D flip** (plan §5 / Phase 4 step 5). Phase 4 has to
    restructure: an outer perspective root, a rotating inner element with only `preserve-3d` +
    transform, and the faces under it. `overflow-hidden`, the gradient, the glow and the redeemed
    filter go on the front face only.
  - Tests and the wallet query `[data-prize-card]`, `[data-prize-card] [data-prize-card-headline]`
    and `data-prize-card-status`. Keep `data-prize-card` and `data-prize-card-status` on the outer
    root, and the face hooks inside the front face, so the existing tests keep passing.
- `components/prizes/PrizeCardLogo.tsx`: the logo button (`data-prize-card-logo`). Haptic only when
  `!inLiveFrame`. Never calls `stopPropagation`. Your card tap handler must ignore taps from inside
  `[data-prize-card-logo]` with `closest()`.
- `components/prizes/PrizeWalletPanel.tsx`:
  - `walletPrizeOf`: the precedence `gift_card` → `menu_item` → legacy, else null (render nothing).
  - `prizeActionOf` + `PrizeCardAction`: the white pill.
  - `walletFaceOf`.
  - `WalletPrizeCard`: an `article[data-prize-wallet-item]` holding the card, then the meta line
    (`wonForLine` · expiry with `EXPIRY_CLASS[tone]`, plus `SCANNABLE_COUPON_LINE` for a scannable
    menu prize with a `squareGiftCard` state), then the action.
  - `LargePrizeCard`: the sheet card + the won-for line, `inLiveFrame`.
  - `RedeemModal` and the redeem/Square handlers are unchanged apart from the copy, the backdrop and
    passing `venueName` to the Square panel.
- `components/prizes/SquareGiftCardPanel.tsx`: the offer screen shows `coupon` (= `LargePrizeCard`).
  The ready screen is `PrizeCard` (large, `inLiveFrame`) plus the `bg-ht-elevated` panel.
- `scripts/render-prize-card.cjs`:
  - `npm run prize-card:render -- --specimen [--width 288] [--out path]`.
  - Below 360 px it lays out one column in a viewport of card width + 32, so `max-[359px]:` rules
    apply.
  - Phase 4: render the backs in the specimen too (the plan asks for it). It renders static
    markup, so give `PrizeCard` a way to draw the back face-up, e.g. an `initialFlipped` prop used
    only by the script.

### 5. Facts and traps

- **The global button CSS** (see §3) also hits any `<button>` you add to the back (the "Show
  details" toggle, the action). Use `!border-0 bg-transparent` for chrome-less buttons, as the logo
  does. **Never `tp-clean-button`**: it forces a border with `!important`.
- **Nested interactive controls:** the logo is a `<button>`, so the card can't be a `<button>` or
  `role="button"`. Use plan §2.8's pattern: `onClick` on the card surface for pointers, plus a
  visually hidden toggle button for keyboard and screen readers.
- **`LiveCouponFrame`** buzzes on every pointer-down and its root is `overflow-hidden rounded-2xl`.
  That's fine as an ancestor of the perspective root. Inside the frame, don't buzz on flip.
- **`text-xs`/`text-sm` are floored**, and inflated inside game pages. Use `text-caption` /
  `text-footnote` on the back. `tests/text-size-floor-contract.test.ts` checks this.
- **Tailwind needs full class strings.** Write `[transform:rotateY(180deg)]`,
  `[backface-visibility:hidden]` and `[-webkit-backface-visibility:hidden]` literally; never build
  them from template pieces.
- **React 19.2** supports the boolean `inert` prop. jsdom ignores it for focus, so test the
  attribute itself.
- **Fake time in tests** with the `now` argument, not `vi.useFakeTimers` (the wallet tests use real
  timers and a fake `fetch`).
- **Never run a real redemption or Square call from a dev server.** Dev and production share one
  database. **Andrew runs `next dev` on :3000.** Never kill it and never `pkill next`.
- **Browser pass recipe (used in Phase 3; it works):**
  1. Copy the repo with anchored excludes:
     `rsync -a --exclude /node_modules --exclude /.next --exclude /.git --exclude '/.env*'
     --exclude /native --exclude /docs --exclude /tmp ./ <scratchpad>/clone/`. Unanchored
     `native` would also drop `components/native`.
  2. `cp -Rc node_modules <clone>/node_modules`.
  3. In the clone, start the server and note its PID:
     `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev
     --webpack -p 3123`.
  4. Drive it with Playwright, all from Node:
     - Set cookies `tp_user_id` and `tp_venue_id`.
     - Seed localStorage `tp:user-id`, `tp:venue-id` and `tp:username` with an init script.
     - Fake `**/api/**` with `page.route`: `/api/challenge-campaigns/redeem` returns
       `{ ok, wins, serverNowMs, venueName }`, `/api/prizes` returns `{ ok: true, wins: [] }`, and
       everything else returns `{ ok: true }`.
  5. Afterwards, kill only your own PID and delete the clone.
  - My script is gone with the scratchpad. It took about 60 lines; rebuild it from this recipe.
- **Typecheck noise:** `npx tsc --noEmit` prints stale errors under `.next/types/…`. Filter with
  `| grep -v "^.next/"`. Never run typecheck and build at the same time.

### 6. Build, run, test: what was verified

- Full `npm run test`: **391 files passed, 1 skipped; 4,638 tests passed, 13 skipped, 0 failed.**
- `npm run test:pwa-contract`: 20/20.
- `npm run lint` and `npx tsc --noEmit`: clean (apart from the `.next/` noise).
- `npm run build`: succeeded.
- After those runs I made two class-only changes: the sheet backdrop went from 75% to 90%, and
  the sheet's won-for line from `text-ht-fg-muted` to `text-ht-fg-secondary`. After them I re-ran
  the seven wallet, Square and back-handler test files (76 passed), `tsc` and eslint on
  `components/prizes`. I didn't re-run the full suite or the build after them.
- Browser pass: at 375 px and 320 px, from the scratchpad clone with every API faked. The list, the
  redeem sheet and the Square ready screen all render, with no horizontal overflow. Screenshots
  are in `tmp/prize-*.png`.
- **Unverified:**
  - real phones (the bounce, the haptic, the sheet on iOS with the safe area)
  - a real redeem at `venue-hightop-test`
  - a real Square card

  All of these are on Phase 6's device checklist.

### 7. Open questions for Andrew

- Q4–Q6 (the flip) in plan §6. Defaults: Redeem on the back opens the live sheet; no rules text;
  no second Redeem under the card.
- Q1–Q3 still open with defaults. None blocks Phase 4.

### 8. Recommended first steps for Phase 4 (Opus 5.5 `claude-opus-5-5`, high effort)

1. Check whether Andrew answered Q4–Q6. Record the answers or the defaults.
2. Write `prizeCardBack` + its tests first (pure, quick).
3. Restructure `PrizeCard` into perspective root → rotating element → front/back faces. Keep
   today's DOM hooks, and run `tests/components.prize-card.test.ts` before adding the flip, to
   prove nothing moved.
4. Add the flip, the hidden toggle, `inert`/`aria-hidden`, Reduce Motion, and the
   `closest()`-based tap filter. Then wire the wallet: `back` + `action` from `prizeActionOf`;
   "Tap the card for details" under the card; the large cards get `back` but no action.
5. Specimen with the backs → browser pass (recipe above) → the gates in plan Phase 4 step 7 → the
   Phase 4 handoff, with pictures for Andrew.
