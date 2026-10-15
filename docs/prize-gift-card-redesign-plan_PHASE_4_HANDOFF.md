# Prize Gift Card Redesign — Phase 4 Handoff

## Summary for Andrew (plain English)

**The prize cards now flip.** On Redeem Prizes, tap a card (anywhere except the logo) and it turns
over. The back shows:
- **Won**: the date.
- **For**: what it was won for.
- **Terms**: what it's good for, e.g. "Good for $25 off your bill" or "Good for one free Appetizer".
- **Expires**: the date, in red or amber when it's close.
- The **Redeem** button. Tap the card again to flip back.

Like before, Redeem opens the sheet with the live clock, and the prize is only used when someone
taps **Confirm Redemption** there.

**Early-redemption safety (your worry):** once a prize is redeemed, its back shows a stamp like
**"Redeemed Oct 15, 2026, 9:42 PM"**. All the details stay bright and readable (only the front goes
grey). So staff can see straight away if a guest redeemed it before they arrived. A prize that
became a Square gift card says **"Turned into a Square gift card {date, time}"**, and a spent one
says **"Used up"**.

The big card in the redeem sheet flips too, so staff can check the details. It has no button on
its back, because Confirm Redemption is right below it. Under each card in the list there's now
one quiet line: **"Expires in 6 days · Tap the card for details"**.

I used your three default answers (you hadn't answered otherwise):
- **Q4:** Redeem opens the live sheet. Two deliberate taps, and the anti-screenshot clock stays.
- **Q5:** the back doesn't show the reward's full rules.
- **Q6:** there's no second Redeem button under the card.

**Nothing is committed, pushed or deployed.** There are no server, database, money or request
changes.

**One thing to know:** on the smallest phones (320 px wide, like the first iPhone SE), some backs
have more text than fits. The bottom details then scroll inside the card under a soft fade, and the
button always stays visible. On a normal phone everything fits.

**Pictures to look at (in VS Code):**
- `tmp/p4-list-back-375.png` and `tmp/p4-list-back-320.png`: the list with both cards flipped. The
  top one is ready, with Redeem; the bottom one is redeemed, with the stamp.
- `tmp/p4-list-front-375.png` and `tmp/p4-list-front-320.png`: the same list, face up.
- `tmp/p4-sheet-back-375.png` and `tmp/p4-sheet-back-320.png`: the redeem sheet with its card
  flipped.
- `tmp/prize-card-specimen.png` and `tmp/prize-card-specimen-320.png`: every front, then every
  back.

**What needs you:** nothing blocks Phase 5. If you disagree with Q4–Q6, say so. Your phone check
of the flip is on the Phase 6 checklist.

---

## For the next agent (Phase 5)

Read `docs/prize-gift-card-redesign-plan.md` first: §1 (decisions), §2.8 (the back, as built), Phase
5 in §3, §5 traps and §6. You have none of my context; it is all here and in the repo.

### 1. Phase 5 goal and scope

The email picture (`public/brand/email/prize-card-v1.png`), plus a "Where guests find their prizes"
section in the Welcome Email (`lib/email/partnerEmailCopy.ts` + `lib/email/welcomeEmail.ts`) and in
the Partner Manual (`lib/partnerManual.ts` + `components/owner/PartnerManual.tsx`, with a live
`PrizeCard` figure). Exact steps are in plan Phase 5.

**The copy must describe the flip.** The guest opens Redeem Prizes, **taps the card to flip it**,
and taps **Redeem** on the back. That opens the live sheet. Staff tap the card (it sparkles; the
clock is live), and the guest taps **Confirm Redemption**. The plan's draft email body says "they
tap Redeem"; adjust it so it matches.

**The sample card has no back.** Render `PrizeCard` with `SAMPLE_PRIZE_CARD_FACE` and **no `back`
prop**. It is then the flat card, exactly as before Phase 4, and it never flips. Don't pass `back`
in the manual or the email.

**Out of scope:**
- any server or `/api` change;
- the redeem flow;
- renaming "coupon" in staff copy (Q1);
- the legacy "Weekly Prize Wins" list.

### 2. Starting state

- Branch `main`, last commit `5cc151c`.
- **Nothing from Phases 1–4 is committed.** Nothing is pushed or deployed.
- No data, migration, env var, flag or `vercel.json` change in any phase.
- Phase 1–3 files: see the Phase 3 handoff §2.
- Phase 4 changed or added:
  - `lib/prizeCardFace.ts`: added `prizeCardBack(win, now?)` and the types `PrizeCardBack` and
    `PrizeCardBackRow`.
  - `lib/themeTokens.ts`: `PRIZE_CARD` gained `stamp`, `urgentText` and `soonText`. These are
    Tailwind classes only; there is no new CSS variable.
  - `components/prizes/PrizeCard.tsx`: new props `back`, `action` and `initialFlipped`, and the
    flip.
  - `components/prizes/PrizeCardBackFace.tsx` (new): the back's layout and the action pill.
  - `components/prizes/PrizeWalletPanel.tsx`:
    - list cards pass `back` and `action`;
    - `PrizeCardAction` was deleted (the pill now lives in `PrizeCardBackFace`);
    - the meta line is `{expiry} · Tap the card for details`;
    - `LargePrizeCard` is now only the card with a `back` (the won-for line under it is gone; it's
      the For row now).
  - `components/prizes/SquareGiftCardPanel.tsx`: the ready card has a back (`giftCardBack`).
  - `scripts/render-prize-card.cjs`: the specimen now includes six backs, drawn face-down.
  - Tests:
    - new `tests/helpers/prizeCardBack.ts`;
    - extended `tests/lib.prize-card-face.test.ts` and `tests/components.prize-card.test.ts`;
    - updated `tests/components.prize-wallet-card.test.ts`,
      `tests/components.prize-wallet-live-coupon.test.ts` (comment only),
      `tests/components.square-gift-card-ui.test.ts`, `tests/components.player-pending.test.ts`
      and `tests/components.reward-descriptions-surfaces.test.ts`.
  - Docs:
    - the plan's status line and §2.8 (as-built notes: "Used up", no expiry on a Square card,
      pinned action);
    - `AGENTS.md`;
    - this file.
- Pictures are in `tmp/` (git-ignored).

### 3. Decisions made (don't re-ask)

- **Q4–Q6 use the defaults.** Andrew hadn't answered:
  - Q4: Redeem on the back opens `RedeemModal`, and Confirm Redemption is the only redeem.
  - Q5: no rules text on the back.
  - Q6: no Redeem under the card.
- **Q1–Q3 also stay on their defaults:**
  - Q1: staff copy keeps "coupon".
  - Q2: "Awarded" is dropped.
  - Q3: the sample venue is "YOUR VENUE".
- **My choices in Phase 4:**
  - **Terms wording** (`termsOf` in `lib/prizeCardFace.ts`):
    - Gift card: "Good for $25 off your bill". A gift card with no amount gets no Terms row.
    - Menu item, percent ≥ 100: "Good for one free Appetizer". On a whole order: "Good for your
      whole order, free".
    - Menu item, percent: "Good for 50% off one Entrée".
    - Menu item, dollar: "Good for $10 off your whole order" or "… off one Appetizer".
    - Menu item, no discount: "Good for one Dessert".
    - Legacy prizes: "Good for one Bottle of Wine" and "Good for one free Appetizer".
    - A Square card that exists: "Spend it at the register over one or more visits".
  - **Square card back:**
    - The stamp is "Turned into a Square gift card {date, time}", or "Used up" once spent.
    - **No Expires row**, because the card outlives the coupon's date (the wallet already keeps
      issued cards past expiry).
    - In the Square ready screen, the back is built with `squareGiftCard` forced to
      `"issued"`/`"used"`. That's because the win the sheet opened with may still say
      `"available"` (the card was made in this sheet). Then there's no time on the stamp, since
      `prizeRedeemedAt` isn't on that win yet.
  - **Expiry tone only while redeemable.** A redeemed prize's expiry date shows with no colour.
  - **Won row = `claimedAt`** (the redemption row's `claimed_at`, the award time). It's left out
    when that is missing or invalid.
  - **"Used up", not "Used", on the back.** The front's chip says "Used"; the back says what
    happened. (It also kept `findByText("Used")` unique in the existing tests.)
  - **The won-for line under the large card in the sheet is gone.** It's the For row on the back.
    `tests/components.prize-wallet-live-coupon.test.ts` still finds it inside `[data-live-coupon]`
    (it's in the DOM on the back). Only that test's comment changed.
  - **The action is pinned; only the details scroll.** `PrizeCardBackFace` is a flex column:
    - a details area (`min-h-0 flex-1 overflow-y-auto`, `pb-3`, and a 12 px bottom
      `mask-image` fade);
    - then the pill (`shrink-0 self-end`).

    The back face element itself is `overflow-hidden`. Below a 360 px viewport the padding, row
    gaps and label tracking are tighter.
  - **Hiding the turned-away face uses `visibility` as well as `backface-visibility`**, with
    `transition-[opacity,visibility] duration-500`, so a face goes invisible only at the end of the
    flip. This is a second guard against the iOS backface bugs, and it stops the hidden face
    taking taps. `inert` and `aria-hidden` are on the turned-away face too.
  - **Reduce Motion:** the rotation is written only as `motion-safe:[transform:rotateY(180deg)]`
    (on the rotating element when flipped, and always on the back). Under `motion-reduce` the faces
    cross-fade over 150 ms (`motion-reduce:opacity-0` on the hidden one).

### 4. Files and how they fit

- **`lib/prizeCardFace.ts`**: `prizeCardBack(win, now = Date.now())` → `{ rows, stamp }`.
  - Rows come in the order won → for → terms → expires, with missing data left out.
  - Dates use `toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"})`.
  - The stamp uses `toLocaleString` with `hour:"numeric", minute:"2-digit"` added.
  - Square detection uses `isSquareGiftCardPrize` + `squareGiftCard` issued/used, the same as
    `prizeCardFace`'s headline.
- **`components/prizes/PrizeCard.tsx`:**
  - **No `back`:** it returns the flat card, the same DOM as Phase 3 plus a `data-prize-card-front`
    attribute.
  - **With `back`:** the structure is
    `div[role=group][data-prize-card][data-prize-card-status][data-prize-card-flipped="true|false"]`
    (perspective root, `[perspective:1200px]`), containing:
    - the hidden toggle `button[data-prize-card-toggle]`, `sr-only focus-visible:not-sr-only`,
      labelled "Show details" / "Show front";
    - `div[data-prize-card-flipper]` (`preserve-3d`, rotates, `onClick`). It holds the front face
      `div[data-prize-card-front]` (glow, `overflow-hidden`, redeemed `opacity-60 grayscale`) and
      the back face `div[data-prize-card-back]` (`absolute inset-0`, pre-rotated, no glow).
  - The tap handler ignores targets inside `[data-prize-card-logo], [data-prize-card-action]` via
    `closest()`. It never stops propagation.
  - Flip haptic: `haptic("selection")` only when `!inLiveFrame`.
  - `initialFlipped` exists only for the render script.
- **`components/prizes/PrizeCardBackFace.tsx`:**
  - `[data-prize-card-stamp]`;
  - a `dl` of `div[data-prize-card-back-row=<key>].contents > dt + dd`;
  - `button[data-prize-card-action]`, the white pill (same classes as Phase 3's).
  - It also exports the `PrizeCardBackAction` type `{ label, onPress }`.
- **`PrizeWalletPanel.tsx`:** `prizeActionOf(win)` is still THE which-button rule. `WalletPrizeCard`
  maps its label to `action` with `onPress: () => onRedeem(win)`, so "Show gift card" opens the
  same sheet it always did.
- **`tests/helpers/prizeCardBack.ts`:** `flipPrizeCards()`, `findPrizeCardAction(name)` and
  `findAllPrizeCardActions(name)`. These click every "Show details" toggle, then look up the
  button by role. Use them in any new wallet test; `findByRole("button", {name:"Redeem"})` alone
  no longer finds a face-up card's button, because it is `aria-hidden`.

### 5. Facts and traps

- **3D on iOS:** never put `overflow-*`, `opacity-*`, `filter`/`grayscale` or the glow on the
  perspective root or `[data-prize-card-flipper]`. A static test in
  `tests/components.prize-card.test.ts` slices those two elements' class strings and fails if any
  of these appear. Both faces need `[backface-visibility:hidden] [-webkit-backface-visibility:hidden]`;
  the test counts exactly two.
- **Tap targets at 320 px:** on a flipped list card the Redeem pill sits in the lower right. An
  automated "tap the card" at the card's centre-bottom hits the pill and opens the sheet. That's
  correct behaviour, and it tripped my first browser script. Tap near the top to flip.
- **At 320 px the real page's card is about 259 px wide** (page padding), narrower than the
  specimen's 288 px. There, a ready card's Expires row scrolls under the fade, and a stamped Square
  card's back scrolls more. The meta line under the card repeats the expiry, so nothing is lost.
  This is accepted per plan §2.8 ("the back face scrolls inside itself"), but check it on Andrew's
  device pass.
- **`LiveCouponFrame` (`overflow-hidden`)** clips the card's near edge slightly mid-rotation in the
  sheet. That's cosmetic, and it's an ancestor of the perspective root, so it doesn't flatten
  anything.
- **The global button CSS:**
  - Chrome-less buttons need `!border-0`. The toggle and the pill have it.
  - Never use `tp-clean-button` (it forces a border with `!important`).
  - On the Partner Manual's dark sheet the same rule applies (plan §5).
- **jsdom ignores `inert`.** Tests check the attribute, and the wallet tests flip through the
  toggle before they look for a button by role.
- **Never run a real redemption or Square call from a dev server** (shared database). Never touch
  Andrew's `next dev` on :3000. Browser-pass recipe: Phase 3 handoff §5. I used it unchanged
  (port 3123, clone with no `.env*`, every `/api/**` faked) and then stopped my server and deleted
  the clone.
- **Typecheck** prints stale `.next/types` errors. Filter them with `| grep -v "^.next/"`. Never run
  typecheck and build at the same time.

### 6. Build, run, test: what was verified

- Full `npm run test`: **391 files passed, 1 skipped; 4,660 tests passed, 13 skipped, 0 failed.**
- `npm run test:pwa-contract`: 20/20.
- `npm run lint` and `npx tsc --noEmit`: clean.
- `npm run build`: succeeded.
- I made some class-only changes to `PrizeCardBackFace.tsx` after the first runs: the bottom fade,
  `pb-3`, and the sub-360 px tracking and gap. **I then re-ran the full `npm run test`** (same
  result: 4,660 passed, 0 failed) **and `npm run build`** (succeeded) on the final code.
- **Browser pass** (scratchpad clone, all APIs faked) at 375 px and 320 px:
  - both list cards flip;
  - a logo tap bounces and doesn't flip;
  - Redeem on the back opens the sheet;
  - the sheet's card flips and has no action;
  - **no redeem POST was sent** (the only POST was the venue-presence heartbeat);
  - no horizontal overflow and no page errors.

  Screenshots are in `tmp/p4-*.png`.
- **Specimen** re-rendered with the backs: `npm run prize-card:render -- --specimen` and
  `-- --specimen --width 288 --out tmp/prize-card-specimen-320.png`.
- **Unverified (Phase 6 device checklist):**
  - the real flip on iPhone and Android (smoothness, back not mirrored on iOS Safari and in the
    iOS app);
  - Reduce Motion on a device;
  - the haptic on flip;
  - a real redeem at `venue-hightop-test`;
  - a real Square card;
  - keyboard focus showing the "Show details" pill.

### 7. Open questions for Andrew

- Q4–Q6 are answered by their defaults. Q1–Q3 are still open on their defaults. None blocks
  Phase 5.

### 8. Recommended first steps for Phase 5 (Sonnet 5.5 `claude-sonnet-5-5`, medium effort, per the plan)

1. Render the email picture: `npm run prize-card:render -- --email`. The plan's `--email` mode
   doesn't exist yet; add it to `scripts/render-prize-card.cjs` as plan Phase 5 step 1 describes
   (palette PNG via `sharp`, `#0f172a` background, ≤ 60 KB, new versioned file name).
2. Write the Welcome Email and Partner Manual sections, with copy that describes the flip (§1
   above). The manual's figure is `<PrizeCard face={SAMPLE_PRIZE_CARD_FACE} />` with no `back`.
3. Run the tests listed in plan Phase 5 step 4, then `npm run email:preview`. Write the Phase 5
   handoff.
