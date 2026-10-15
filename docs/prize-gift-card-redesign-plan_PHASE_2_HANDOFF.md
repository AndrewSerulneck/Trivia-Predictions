# Prize Gift Card Redesign — Phase 2 Handoff

## Summary for Andrew (plain English)

The new gift card is built, but **guests can't see it yet**. Nothing changed on Redeem Prizes,
in the app or on the site. Nothing is committed, pushed or deployed (that's your call), and no
database, money or Square code changed.

**What needs you: approve the look.** Open **`tmp/prize-card-specimen.png`** in VS Code. It is a
picture of the real card in every state: $25, $12.50, Free Appetizer, 50% Off Entrée, a long item
name, $10 Off Whole Order, Redeemed, Used, the larger size used in the redeem sheet, and a card
with no venue name. Reply "approved", or say what to change (for example: a bigger logo, a
brighter or dimmer glow, or a different label). **Phase 3 puts the card on the real page, and it
won't start until you approve.**

Three small questions from the plan are still open. Each has a default, so they don't hold
anything up:
- **Q1.** Keep the word "coupon" in staff wording? Default: keep it.
- **Q2.** Drop the "Awarded {date}" line? Default: drop it.
- **Q3.** Should the sample card say "YOUR VENUE"? Default: yes.

---

## For the next agent (Phase 3)

Read `docs/prize-gift-card-redesign-plan.md` first: §1 lists the final decisions, §2 is the spec, and
Phase 3 is in §3. You have none of my context. Everything you need is in the repo and in this note.

### 1. Phase 3 goal and scope

**Gate first:** check that Andrew has approved the specimen. Look for it in this file's
"Approval" line (§7 below), in the plan's status line, or ask him. **If it isn't approved, don't
start Phase 3.** Record the approval, and any tweaks he asked for, in your handoff.

Phase 3 goal, from the plan: Redeem Prizes (`components/prizes/PrizeWalletPanel.tsx`), the redeem
sheet (`RedeemModal` + `LiveCouponFrame`) and `components/prizes/SquareGiftCardPanel.tsx` render
`PrizeCard` per plan §2.3–2.4. Delete the five coupon components. Add the meta line under each
card, the white pill button, the copy trims and the tests. **Out of scope:** the redeem POST,
`redeem_challenge_prize`, the order of the Square issue/open steps, the `already_redeemed`
handling, `useNativeBackHandler`, the live clock, the wake lock, the shimmer and sparkle, any
`/api` route, the email and the Partner Manual (Phase 4), and the legacy "Weekly Prize Wins" list.

### 2. Starting state

- Branch `main`, last commit `5cc151c`. **Nothing from Phases 1 or 2 is committed.**
- Phase 1 left these uncommitted: both brand READMEs,
  `design-system/hightop-challenge-design-system/project/colors_and_type.css`, `lib/themeTokens.ts`
  (`PRIZE_CARD`), `SYSTEM_CONTEXT.md`, `CLAUDE.md`, `AGENTS.md`, the plan and its Phase 1 handoff.
  `next-env.d.ts` was already modified before Phase 1. Next.js regenerates it; it isn't ours.
- Phase 2 left these uncommitted:
  - new `lib/prizeCardFace.ts`
  - new `components/prizes/PrizeCard.tsx`
  - new `components/prizes/PrizeCardLogo.tsx`
  - new `scripts/render-prize-card.cjs`
  - new `tests/lib.prize-card-face.test.ts`
  - new `tests/components.prize-card.test.ts`
  - this file
  - changed `tailwind.config.ts`: the `logo-tap-bounce` and `logo-tap-dip` keyframes and animations
  - changed `package.json`: the `prize-card:render` script
  - changed `components/prizes/PrizeWalletPanel.tsx`: helpers moved out; output identical
  - changed the plan's status line
- Pictures in `tmp/` (git-ignored): `tmp/prize-card-specimen.png` (the sign-off sheet, 1,672×3,212,
  about 1.9 MB) and `tmp/prize-card.png` (the sample $25 card alone, transparent, 844×580, 270 KB).
- No data, database, env var or deployment changes. No migration.

### 3. Decisions already made (don't re-ask)

- Andrew's six decisions in plan §1 are final. The planner's defaults stand until Andrew vetoes
  them: drop "Awarded {date}", keep "coupon" in staff wording, and leave Weekly Prize Wins out of
  scope.
- Decisions I made in Phase 2:
  - **A partner's "other" item name is shown exactly as typed** (trimmed), not forced into title
    case. Title-casing "Pint of IPA" would give "Pint Of Ipa". The built-in items are already in
    title case.
  - **A gift card with no amount** shows the headline "Gift Card" as a phrase, never an empty
    "$". An unknown prize shows "Reward".
  - **A Square gift card counts as a gift card on the face once it exists.** When
    `isSquareGiftCardPrize(win)` holds and `squareGiftCard` is `"issued"` or `"used"`, the
    headline is `squareGiftCardDollars(win)` and the label is `GIFT CARD`. That covers a
    scannable dollar-off menu prize too, which shows "$15 Off Whole Order / REWARD" before it
    becomes a card and "$15 / GIFT CARD" after. Status: `issued` → `ready`; redeemed + `used` on a
    Square-card prize → `used`; any other redeemed prize → `redeemed`.
  - **`SAMPLE_PRIZE_CARD_FACE` lives in `lib/prizeCardFace.ts`** and is re-exported from
    `PrizeCard.tsx`, so server code (the Phase 4 email) can import it without touching a
    `"use client"` file.
  - **The face carries `headlineKind: "amount" | "phrase"`**, a sixth field the plan didn't list.
    It is what picks the big tabular number or the two-line phrase.
  - **The logo button doesn't use `tp-clean-button`, despite plan §2.5 and §5.** In
    `app/globals.css` that class forces a 1 px white/12% border with `!important` (about line
    1052), and every dark-surface `button` gets that border anyway (about line 1037). The logo
    uses the codebase's existing pattern, `!border-0 bg-transparent` (as in
    `DashboardToast.tsx`, `CategoryBlitzGame.tsx` and others). That's fine on the dark Partner
    Manual sheet in Phase 4 too. Don't add `tp-clean-button` back.

### 4. Files and how they fit

- **`lib/prizeCardFace.ts`** (pure, no React):
  - `prizeCardFace(win, venueName)` → `PrizeCardFace` `{ headline, headlineKind, label, venueName,
    status, ariaLabel }`.
  - Helpers: `formatPrizeDollars` (`$25`, `$12.50`, `$1,000`; rounds to the cent first),
    `menuItemLabel`, `discountLabel(win, formatDollars?)` (title case: "Free", "50% Off", "$10 Off"),
    and `SAMPLE_PRIZE_CARD_FACE` (`$25` / `GIFT CARD` / `YOUR VENUE` / ready).
  - Precedence matches the wallet: Square card first, then `prizeKind`, then the legacy
    `prizeType`.
  - It imports `isSquareGiftCardPrize` and `squareGiftCardDollars` from `lib/pos/prizeDelivery.ts`
    (client-safe).
- **`components/prizes/PrizeCard.tsx`**: props `{ face, size?: "list" | "large", inLiveFrame? }`.
  - Layers: base gradient → glow → top highlight → content → a hairline edge overlay (the ring
    sits on its own overlay so the glow can't paint over it).
  - Colours come only from `PRIZE_CARD`. The font is `[font-family:var(--ht-font-body)]`.
  - Padding is `p-5` (list) or `p-6` (large).
  - Headline sizes: an amount is `text-5xl` / `text-6xl`. A phrase is `text-2xl` / `text-3xl`,
    one step down when longer than 22 characters, with `line-clamp-2`.
  - A redeemed or used card gets `opacity-60 grayscale` plus one chip ("Redeemed" / "Used").
  - The visible text is `aria-hidden`. The `role="group"` element's `aria-label` reads the face.
  - Test hooks: `data-prize-card`, `data-prize-card-status`, `-headline`, `-venue`, `-label`,
    `-chip`, `-logo`.
- **`components/prizes/PrizeCardLogo.tsx`**: a `<button aria-label="Hightop Challenge">` with
  `p-0.5` padding, so the 40 px logo has a 44 px hit area.
  - Images: `/brand/web/htc-logo-96.webp` (list) or `-192.webp` (large).
  - Each tap re-keys the `<img>`, so the animation restarts (`animate-logo-tap-bounce
    motion-reduce:animate-logo-tap-dip`, `origin-bottom`).
  - It calls `haptic("selection")` only when `!inLiveFrame`. It never calls `stopPropagation`:
    the frame's `onPointerDown` must still sparkle.
- **`tailwind.config.ts`**: `logo-tap-bounce` (0.6 s, squash-and-stretch with easing per
  keyframe, transform only) and `logo-tap-dip` (0.2 s opacity dip), both placed after
  `logo-pulse`.
- **`components/prizes/PrizeWalletPanel.tsx`**: `MENU_ITEM_LABEL`, `menuItemLabel` and
  `discountLabel` now come from `lib/prizeCardFace.ts`.
  - A local `couponDiscountLabel` keeps the old coupon text identical ("$10.00 OFF", "FREE").
    **Delete it in Phase 3** along with the coupons.
  - The pre-existing unused `prizeLabel` and `formatDate` can go too: `formatDate` is used only by
    the "Awarded" lines and the Weekly Prize Wins list, so keep it for the latter.
- **`scripts/render-prize-card.cjs`** (`npm run prize-card:render`):
  - How it works: `react-dom/server` renders the real `PrizeCard` → PostCSS + Tailwind v3 with our
    config, using only the rendered HTML as content → Playwright Chromium screenshots it at 2x.
  - Nunito comes from a Google Fonts `<link>` (it warns if offline). Logos are inlined as data
    URIs.
  - Modes:
    - default → `tmp/prize-card.png` (the sample card, transparent)
    - `--specimen` → `tmp/prize-card-specimen.png`
    - `--size large` → the large card
    - `--out <path>` → any output path
  - No dev server, no `proxy.ts`, no network beyond Google Fonts.

### 5. Facts and traps

- **Phase 3 must keep the wallet's button choices exactly as they are.** That covers
  `squareIssued`, `redeemed`, the scannable `SCANNABLE_COUPON_LINE` and "Show gift card".
  `prizeCardFace().status` is for drawing only. In particular, the old `GiftCertificateCoupon`
  (legacy, no `prizeKind`) never showed "Used" or "Show gift card", while the face can say
  "used" for it. In practice the backend always derives `prizeKind`, so that legacy branch is
  effectively unreachable. Don't let the face's status decide which button shows.
- **Square ready state (plan §2.4):** the headline is the *balance left*. Build it as
  `{ ...prizeCardFace(win, venue), headline: formatPrizeDollars(balance), headlineKind: "amount" }`
  (and update `ariaLabel` the same way). Keep `data-square-gift-card` on the panel holding the
  number and barcode, inside `[data-live-coupon]`.
- **Inside `LiveCouponFrame`, pass `inLiveFrame`.** A test proves that one logo tap in the frame
  gives exactly one buzz, a sparkle and a bounce.
- **The email picture is too heavy as rendered.** The single-card PNG is 270 KB, because it is 2x
  with a 32 px transparent margin and a glow gradient. The plan assumed about 60 KB. Phase 4
  should drop the margin (screenshot the card itself, or add a `--tight` option), and either
  compress with `sharp` (already a dependency) or use a palette or JPEG on a navy background.
  Write to a new versioned name, `public/brand/email/prize-card-v1.png`; never overwrite a
  published file.
- **Typecheck noise:** `npx tsc --noEmit` prints stale `TS2307` errors under `.next/types/…`.
  Filter them with `| grep -v "^.next/"`. Never run typecheck and build at the same time.
- **Andrew runs `next dev` on :3000.** Don't kill it. Browser-test from a scratchpad clone with no
  `.env.local` and mocked routes. Never run a real redemption or Square call from dev (one shared
  database).
- **Tests use `createElement`**, not JSX, because the glob is `*.test.ts`. When `LiveCouponFrame`
  gets `children` positionally, cast its props object (see `tests/components.prize-card.test.ts`).
- **Global CSS:** `/redeem-prizes` isn't a `.tp-game-page`, so `text-5xl`/`text-6xl` render
  normally. Phase 3 should still render the real page (scratchpad clone) to catch any global
  `.tp-page-main` overrides on phones. The specimen only shows the card in isolation.

### 6. Build, run, test

- `npx vitest run tests/lib.prize-card-face.test.ts tests/components.prize-card.test.ts`: 25 + 16
  tests, all pass.
- `npm run test`: **390 files passed, 1 skipped; 4,626 tests passed, 13 skipped, 0 failed.**
  Existing wallet and Square tests passed unchanged.
- `npx tsc --noEmit`: clean apart from the `.next/` noise.
- `npx eslint` on every changed or new file: clean.
- `npm run prize-card:render -- --specimen`: works. I looked at the PNG myself. Every state renders,
  the arbitrary-value radial glow compiles, Nunito loads, and a long venue name truncates with an
  ellipsis.
- **Not run:** `npm run build` and full `npm run lint`. The Tailwind change was compiled by the
  render script against the real config, but Phase 3 should run `npm run build` (not at the same
  time as typecheck).
- **Unverified:**
  - the bounce's feel on a real phone (headless can't judge it; it goes on Phase 5's device
    checklist)
  - the haptic on the iOS/Android app
  - white/60 label contrast over a real screen. It sits bottom-right, away from the glow, and
    looked fine in the specimen.

### 7. Open questions for Andrew

- **Approval of `tmp/prize-card-specimen.png`: APPROVED by Andrew, 2026-10-15, with one change: the
  logo 2× bigger (done in Phase 3). He also added the card flip (now plan Phase 4).** Original note: When he answers, update this line and
  the plan's status line. Possible tweaks to expect: logo size (it's 40 px, small next to "$25"),
  glow strength (`PRIZE_CARD.glow` in `lib/themeTokens.ts`; change the token, not the component).
- Q1–Q3 in plan §6. None blocks Phase 3; use the defaults if he doesn't answer.

### 8. Recommended first steps for Phase 3 (Opus 5.5 `claude-opus-5-5`, high effort)

1. Confirm the approval is recorded. Apply any tweaks to `PRIZE_CARD` or `PrizeCard`, re-render
   the specimen and show it to him.
2. Read `PrizeWalletPanel.tsx` (`ChallengeCoupon` and its five coupons, `RedeemModal`),
   `SquareGiftCardPanel.tsx`, `tests/components.square-gift-card-ui.test.ts` and
   `tests/components.prize-wallet-ranked-place.test.ts`.
3. Replace `ChallengeCoupon` with face + `PrizeCard` + meta line + action (plan §2.3), keeping
   every button decision exactly as it is today. Then the large card in `RedeemModal` with
   `inLiveFrame`, then `SquareGiftCardPanel` (§2.4).
4. Update the tests. Run `npm run test`, `npx tsc --noEmit`, `npm run lint`, then
   `npm run build` (after typecheck, not alongside it).
5. Check `git diff --stat`: it should touch only `components/prizes/`, tests and docs. Then write
   the Phase 3 handoff.
