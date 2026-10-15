# Prize Gift Card Redesign — Plan

**Status (2026-10-15):** All six phases done (uncommitted, not deployed). Phase 6 ran `/code-review` at high and fixed four findings, then wrote the phone checklist `prize-gift-card-redesign-device-checklist.md`. **Left: commit/deploy (Andrew's call), then Andrew's phone pass.** Latest handoff `prize-gift-card-redesign-plan_PHASE_6_HANDOFF.md`.
Handoffs go next to this file as `prize-gift-card-redesign-plan_PHASE_<N>_HANDOFF.md`; update this
line to point at the latest one.

## 0. Summary for Andrew

Prizes on **Redeem Prizes** (`/redeem-prizes`) are drawn today as five colored "coupon" boxes
(amber, rose, emerald, indigo) with double borders, dashed rules and four or five lines of text
each. This plan replaces all of them with **one sleek digital gift card**, shaped like a real card
(the same proportions as a credit card), in the style of a Starbucks or Apple gift card:

- **Midnight navy card with a soft cyan→violet glow** in one corner (your pick).
- **Hightop Challenge logo top-left.** It bounces when tapped.
- **Only three things on the card:** the prize ("$25", or "Free Appetizer"), the venue name, and a
  small "GIFT CARD" / "REWARD" label. What it was won for and when it expires go in one quiet line
  under the card, next to the Redeem button.
- **Every prize uses the same card** (your pick). Dollar gift cards, menu-item prizes and the
  Square gift card all share it.
- **Minimalism and simplicity become a written brand rule** in the brand guidelines, `CLAUDE.md`,
  `AGENTS.md` and `SYSTEM_CONTEXT.md`.
- **Tap the card and it flips over** (added 2026-10-15). The back shows when the prize was won, in
  what competition, its terms and when it expires, and holds the **Redeem** button staff use. Once
  redeemed, the back says so (with the date and time), and the details stay readable so anyone can
  tell if it was redeemed early by mistake.
- The **Welcome Email** and the **Partner Manual** get a short section, "Where guests find their
  prizes", with a picture of the new card.

Nothing about *how* a prize is redeemed on the server changes: same once-only redemption, same live
clock and sparkle that prove to staff it isn't a screenshot, same Square gift card flow. Where the
Redeem button sits moves to the back of the card (Phase 4). No database, money or API change; no
new requests.

**Cost:** effectively zero recurring cost. The card is drawn by the phone (no new requests, no new
data). The email picture is one ~60 KB image served from our site each time a welcome email is
opened. At 100 new partners/month that's ~6 MB/month of bandwidth, which rounds to nothing.

**What needs you:** ~~approve the card's look~~ (approved 2026-10-15); answer the flip questions
Q4–Q6 in §6 if you disagree with the defaults; edit the draft copy in Phase 5 if you want; do the
phone pass in Phase 6.

---

## 1. Decisions already made (do not re-ask)

Andrew, 2026-10-15:

1. **Scope: all prizes, one card family.** Every challenge-prize coupon on `/redeem-prizes` uses the
   new card: `gift_card`, `menu_item` (all menu items, including wine bottle and appetizer), legacy
   `gift_certificate` / `wine_bottle` / `free_appetizer`, and the Square gift card. The per-type
   color themes (rose wine, emerald appetizer, indigo menu item, amber gift card) are retired.
2. **Finish: midnight + brand gradient.** Deep navy base, a soft cyan→violet radial glow in the
   top-right corner, white type. Not black/gold and not solid gold.
3. **Card face: logo, amount, venue.** Logo top-left; the headline ("$25" / "Free Appetizer")
   large; venue name bottom-left; small label ("GIFT CARD" / "REWARD") bottom-right. Nothing else
   on the face.
4. **The logo bounces when tapped** (Andrew's original request).
5. **Minimalism and simplicity is the design direction**, and the brand guidelines, `CLAUDE.md`,
   `AGENTS.md` and `SYSTEM_CONTEXT.md` must say so (Phase 1).
6. **Welcome Email and Partner Manual** each get a section on where guests find gift cards and
   other prizes after winning a Reward, with a picture of the new card (Phase 5).

Andrew, 2026-10-15 (after seeing the Phase 2 specimen):

7. **The card design is approved**, with one change: **the logo is 2× bigger** (done in Phase 3).
8. **Tapping the card (not the logo) flips it over** with an animation. The back shows: when the
   prize was won, in what competition, the terms of the reward, and when it expires.
9. **The back is where staff tap "Redeem"** so the prize can't be used again.
10. **Early-redemption safety:** Andrew is worried guests tap Redeem before showing staff. Once a
    prize is redeemed, **the back says so, and the details stay readable**, so staff can see whether
    it was redeemed early by mistake (Phase 4, §2.8).

Design defaults chosen by the planner (Andrew may veto; not yet asked):

- **"Awarded {date}" is dropped** from the wallet. The expiry is the line that matters to a guest;
  the award date is noise. (The data is untouched; only the display goes.)
- **Staff-facing wording is unchanged.** `lib/posStaffInstructions.ts`, the printable staff sheet
  and `LiveCouponFrame`'s "Staff: tap the coupon…" keep the word "coupon". Renaming it everywhere
  is a separate decision (open question Q1).
- **The legacy "Weekly Prize Wins" list** (the old `PrizeWin` points system at the bottom of the
  wallet) is **out of scope**. It isn't a gift card.

---

## 2. Design specification (the single reference for Phases 2–5)

### 2.1 The minimalism rule (goes into the brand guidelines in Phase 1)

> **Minimal and simple.** Every surface shows the fewest words, colors and elements it needs to do
> its job. One focal point per card, one accent per surface. No decorative borders, double rules,
> dashed dividers or ornament. Secondary details sit below the object in one muted line, or behind a
> tap. If a word doesn't help the player act, cut it. Use whitespace and type hierarchy, not boxes
> and color. Motion is small and earns its place (a tap bounce, a proof-of-life sparkle), never
> ambient decoration. The north star stays dark, electric and high-contrast, but restrained:
> **one glow, not five.**

### 2.2 The card

| Property | Spec |
|---|---|
| Shape | ISO ID-1 card ratio **1.586 : 1** (`aspect-[1.586/1]`), full width up to `max-w-sm`, `rounded-2xl` |
| Base | Navy `#0f172a` → `#020617` diagonal (top-left lighter) |
| Glow | One radial glow anchored top-right: cyan-400 (~35% alpha) fading to violet-500 (~25%), then transparent by ~60% of the card. Exactly one glow |
| Edge | 1 px inner hairline `ring-1 ring-inset ring-white/10`, plus a faint top-edge highlight (white/10 → transparent, top ~30%) so it reads as a physical, printed card |
| Shadow | One soft drop shadow beneath (e.g. `shadow-[0_18px_40px_-12px_rgba(2,6,23,0.9)]`) |
| Padding | `p-5` (list) / `p-6` (large, in the redeem sheet) |
| Logo | Top-left, **2× the Phase 2 size** (Andrew, 2026-10-15): 80 px (list) / 96 px (large) on a full-width card, scaling down with the card on narrow phones (Phase 3 sets the exact rule). `/brand/web/htc-logo-192.webp` for both (sharp at 2×). Never the 1.7 MB PNG |
| Headline | Bottom-right, above the label row. Gift card: **amount** in Nunito 900, `tabular-nums`, white, `text-5xl` (list) / `text-6xl` (large). Whole dollars drop the cents (`$25`); otherwise keep them (`$12.50`). Menu-item prize: the prize phrase in Nunito 800, `text-2xl` / `text-3xl`, max two lines, `text-balance`, one size step down if longer than ~22 characters |
| Bottom row | Left: venue name, `text-caption` uppercase, `tracking-[0.14em]`, white/80, truncated. Right: label, `text-caption` uppercase bold, `tracking-[0.2em]`, white/60 |
| Fonts | Only via `var(--ht-font-body)` (see `tests/fonts-contract.test.ts`). No Bree Serif on the card: one typeface keeps it minimal |
| Text floor | Nothing under 12 px (`text-caption` is the smallest). `/redeem-prizes` is not a `.tp-game-page`, but use `text-caption`/`text-footnote` anyway |

**Headline and label vocabulary** (one pure function, Phase 2):

| Prize | Headline | Label |
|---|---|---|
| `gift_card` / legacy `gift_certificate` | `$25` | `GIFT CARD` |
| `menu_item`, percent ≥ 100 | `Free Appetizer` (item name, title case) | `REWARD` |
| `menu_item`, percent | `50% Off Entrée` | `REWARD` |
| `menu_item`, dollar | `$10 Off Whole Order` | `REWARD` |
| `menu_item` `other` | uses `prizeMenuItemName` | `REWARD` |
| legacy `wine_bottle` | `Bottle of Wine` | `REWARD` |
| legacy `free_appetizer` | `Free Appetizer` | `REWARD` |
| Square gift card (issued) | `$25` (the original amount) | `GIFT CARD` |

Use title case on the card, not today's all-caps ("FREE APPETIZER"). All-caps is reserved for the
small label.

**States** (on the card itself, nothing else):

- **Ready:** as above.
- **Redeemed / Used:** whole card `grayscale opacity-60`, plus one small chip top-right
  ("Redeemed" or "Used"), `text-caption`, white/70 on white/10, `rounded-full`.
- **Square card issued:** looks Ready (the card is still spendable at Square).
- Expiry urgency is **not** on the card; it colors the line under the card (see 2.3).

### 2.3 Wallet list layout (`/redeem-prizes`)

```
 Redeem Prizes                              ← existing page title (ht-h1)

 ╭──────────────────────────────────────╮
 │ [logo]                          ░▒▓  │
 │                                  ░▒  │
 │                                 $25  │
 │ PACIFIC STREET            GIFT CARD  │
 ╰──────────────────────────────────────╯
  Won Live Trivia · Expires in 6 days  [Redeem]
```

- One meta line under each card, `text-footnote text-ht-fg-muted`: the existing `wonForLine(win)`
  text, then ` · `, then the expiry label (keeps today's amber "Expires tomorrow" / red "Expires
  today!" colors on the expiry part only). Truncate to two lines.
- The Square scannable line (`SCANNABLE_COUPON_LINE`) stays, as a second muted line, only where it
  shows today.
- Action on the right of the meta line: a **white pill button** (`bg-white text-slate-950
  font-bold rounded-full`, ≥44 px hit target, `tp-player-pressable`). Labels unchanged: "Redeem",
  "Show gift card". Redeemed/Used cards have no button.
- Delete the list heading `Click "Redeem" on your rewards` (the button says it). Cards stack with
  `space-y-6`.
- Empty state, shorter: "No prizes yet. Win a Reward here and it will show up in this list."

### 2.4 Redeem sheet (`RedeemModal`) and the live frame

- The large card replaces the coupon inside `LiveCouponFrame`. The frame's clock panel, the
  shimmer bands and the tap sparkle stay exactly as they are. The shimmer reads as a holographic
  sheen across the card, which is on-brand.
- The instruction box above stays, trimmed to one line: "Show this to staff, then tap Confirm
  Redemption." Buttons unchanged.
- **Square gift card ready state** (`SquareGiftCardPanel`): Starbucks-app layout. The card first
  (label `GIFT CARD`, headline = balance left, e.g. `$18.50`, with the original amount moved to the
  staff line), then directly under it, on a plain `bg-ht-elevated` panel: the number in mono and the
  `Code128Barcode`. Keep `data-square-gift-card` on the panel that contains the number and barcode
  (tests look for it inside `[data-live-coupon]`). The staff instruction line keeps its wording.

### 2.5 The bouncing logo

- The logo is a `<button type="button" aria-label="Hightop Challenge">` with a ≥44 px hit area
  (pad the 40 px image), `tp-clean-button`, no visible button chrome.
- Tap → a new Tailwind keyframe **`logo-tap-bounce`** in `tailwind.config.ts`, next to
  `logo-hop`: ~600 ms, a quick rise with a small squash-and-stretch landing (e.g. translateY 0 →
  −10 px → 0 → −3 px → 0, scaleY 0.92 on landing), `origin-bottom`, overshoot easing. Transform
  only. Restart on every tap by re-keying the image (the `burstKey` pattern in `LiveCouponFrame`).
- **Reduce Motion:** no travel; a 200 ms opacity dip (1 → 0.6 → 1) so the tap still acknowledges.
- **Haptics:** call `haptic("selection")` from `lib/haptics.ts` **only when the card is NOT inside
  `LiveCouponFrame`** (prop `inLiveFrame`). Inside the frame, the frame's own `onPointerDown`
  already buzzes, and CLAUDE.md forbids two buzzes for one moment.
- **Do not `stopPropagation`.** A staff tap on the logo must still sparkle the live frame; that's
  the proof.

### 2.6 Accessibility

- The card is a `div` with `role="group"` and an `aria-label` that reads the face in one sentence
  ("$25 gift card, Pacific Street"; "Free Appetizer reward, Pacific Street, redeemed").
- Contrast: white on the navy base passes easily; check white/60 label over the glow corner (the
  label sits bottom-right, away from the glow, by design).

### 2.7 Tokens (follow `SYSTEM_CONTEXT.md` §10's order)

Add a prize-card block to
`design-system/hightop-challenge-design-system/project/colors_and_type.css` first
(`--ht-prize-card-base-from`, `--ht-prize-card-base-to`, `--ht-prize-card-glow-cyan`,
`--ht-prize-card-glow-violet`), then mirror them as a `PRIZE_CARD` entry in `lib/themeTokens.ts`
(Tailwind class strings, the way `GAME_THEME` does it). Components read `PRIZE_CARD`; no ad-hoc hex
in `components/prizes/`.

### 2.8 The back of the card (Phase 4; Andrew, 2026-10-15)

**What flips.** Tapping anywhere on a wallet card **except the logo** (it keeps its bounce) and
except a control on the back flips the card over; tapping again flips it back. Cards in the list
and the large card in the redeem sheet both flip. The sample card (Partner Manual, email) has no
back and does not flip.

**Animation.** A Y-axis card flip, ~500 ms, ease-out, transform only: a `[perspective:…]` wrapper,
an inner element with `[transform-style:preserve-3d]` that rotates 180°, two faces with
`[backface-visibility:hidden]` (and the `-webkit-` form, for iOS), the back pre-rotated 180°.
**Reduce Motion:** no rotation; the faces cross-fade (~150 ms opacity).

**Back layout** (same 1.586 : 1 shape, same navy base and edge, **no glow** on the back so the
text has full contrast; one accent at most):

```
 ╭──────────────────────────────────────╮
 │ REDEEMED OCT 15, 9:42 PM             │  ← only once redeemed (one accent chip)
 │ Won       Oct 12, 2026               │
 │ For       You finished 1st in Live … │
 │ Terms     Good for $25 off your bill │
 │ Expires   Oct 30, 2026               │
 │                            [Redeem]  │  ← only while redeemable
 ╰──────────────────────────────────────╯
```

- Rows (pure function `prizeCardBack(win)` in `lib/prizeCardFace.ts`, Phase 4): **Won** =
  `claimedAt` date; **For** = today's `wonForLine(win)` (moves into `lib/prizeCardFace.ts`, one
  home); **Terms** = what the prize is good for, derived from the prize fields ("Good for $25 off
  your bill", "Good for one free Appetizer", "Good for 50% off one Entrée", "Good for $10 off your
  whole order"; a Square card: "Spend it at the register over one or more visits"); **Expires** =
  `prizeExpiresAt` date, with today's amber/red urgency colour, or "No expiry date" when null. A
  row with no data is left out, never shown empty.
- Labels `text-caption` uppercase white/60; values `text-footnote` white; long values clamp to two
  lines. If everything doesn't fit on a 288 px-wide card, the back face scrolls inside itself
  (`overflow-y-auto` on the back face only); it never grows taller than the front.
  As built (Phase 4): only the details scroll, under a 12 px bottom fade; the action is pinned
  below them so it never scrolls out of sight.
- **Redeemed:** a chip at the top of the back, "Redeemed Oct 15, 9:42 PM" (date **and** time,
  local, from `prizeRedeemedAt`), and **the rows stay full contrast** (the front's `grayscale
  opacity-60` must not reach the back). A Square card shows "Turned into a Square gift card Oct 15,
  9:42 PM" instead; a used-up one "Used up" (Phase 4: not "Used", which the front's chip already
  says). This is the early-redemption safety Andrew asked for. A Square card's back has no Expires
  row (the card outlives the coupon's date).
- **Action** (bottom-right of the back, the §2.3 white pill, `data-prize-card-action`): ready →
  **Redeem**, which opens the existing live redeem sheet (`RedeemModal`), where **Confirm
  Redemption stays the one and only once-only action**; Square issued → **Show gift card**;
  redeemed/used → none. In the redeem sheet the back has no action (Confirm Redemption is below the
  card already). Which button shows follows exactly the same decisions as Phase 3's pill.
- **Under the card** (list): the Phase 3 pill moves to the back, so the meta line becomes the
  expiry plus a quiet "Tap the card for details" (`text-footnote text-ht-fg-muted`).

**Accessibility.** The logo is a `<button>`, so the card itself can't be one (nested interactive
controls are invalid). The card surface takes pointer taps (`onClick` on the face wrapper), and a
visually hidden "Show details" / "Show front" `<button>` (visible on keyboard focus) gives keyboard
and screen-reader users the same flip. The hidden face gets `aria-hidden` and `inert`, so its
controls can't be tabbed to while it faces away.

---

## 3. Phases

| Phase | What | Model | Effort |
|---|---|---|---|
| 1 | Brand guidelines + minimalism rule in all four context files; prize-card tokens | Sonnet 5.5 (`claude-sonnet-5-5`) | medium |
| 2 | `PrizeCard` component, face function, bouncing logo, specimen picture for Andrew's sign-off | Opus 5.5 (`claude-opus-5-5`) | high |
| 3 | Put the card into Redeem Prizes (list, redeem sheet, Square card); logo 2×; trim copy; tests | Opus 5.5 (`claude-opus-5-5`) | high |
| 4 | **Flip:** tap the card to see its back (details, redeemed stamp, staff Redeem) | Opus 5.5 (`claude-opus-5-5`) | high |
| 5 | Email picture; Welcome Email + Partner Manual "Where guests find their prizes" | Sonnet 5.5 (`claude-sonnet-5-5`) | medium |
| 6 | Code review, device checklist, final context updates, release notes | Opus 5.5 (`claude-opus-5-5`) | high |

Why these models: Phases 2–4 are exacting visual work inside a money-adjacent flow (once-only
redemption, the live-coupon proof, Square gift cards) where a subtle regression costs real prizes,
so Opus at high effort. Phase 4 also moves where the Redeem button lives and has 3D-transform
traps on iOS Safari. Phases 1 and 5 are documentation and copy with a little layout, which Sonnet
handles well at medium. Phase 6 is a review of a redemption surface, so Opus at high.

**Why the flip is Phase 4 (after the card goes live, before the partner copy):** it builds on the
wired-in card from Phase 3 (it needs real wins, the redeem sheet and the button decisions in
place), and it changes where Redeem sits, which the Welcome Email and Partner Manual copy (Phase
5) must describe correctly. Phase 3 is still shippable on its own (Redeem under the card) if Andrew
wants the new look live before the flip.

Commit, push and deploy remain Andrew's call at every phase. No phase needs a migration, an env
var, a flag or a `vercel.json` change.

### Phase 1 — Brand guidelines and the minimalism rule

**Goal:** write the direction down before any code, so every later agent designs to it.

1. `design-system/hightop-challenge-design-system/project/README.md` (the canonical brand
   README, per `SYSTEM_CONTEXT.md` §10): add a **"Minimal and simple"** section at the top of
   `## VISUAL FOUNDATIONS` using the §2.1 text, and a short `### Prize cards` subsection after
   `### Cards` summarising §2.2–2.5. Mirror the same two additions into the older copy at
   `design-system/project/README.md` so the two don't disagree.
2. `colors_and_type.css` (the canonical one above) then `lib/themeTokens.ts`: the §2.7 tokens.
3. `SYSTEM_CONTEXT.md` §10: a "Design principle: minimal and simple" bullet (one paragraph, from
   §2.1), and under the color list, change "Prizes / redeem: gold (`#d89a4f`)" to say prize
   *cards* use the midnight + cyan→violet finish (`PRIZE_CARD`), gold stays the prize accent
   elsewhere (rewards panel, badges).
4. `CLAUDE.md` **Code Style & Constraints**: a bullet "**Design: minimal and simple**" (three
   sentences max) pointing at the brand README section. Keep it short; CLAUDE.md is already long.
5. `AGENTS.md`: a short "Prize gift card redesign" section pointing at this plan, plus one line
   stating the minimalism rule and where it lives.

**Out of scope:** any component change. **Tests:** `npm run test` (docs-only plus tokens; the
token file must still typecheck: `npx tsc --noEmit`).

### Phase 2 — The `PrizeCard` component (not yet wired in)

**Goal:** build the card and get Andrew's sign-off on how it looks before guests see it.

1. **`lib/prizeCardFace.ts`** (pure, no React): `prizeCardFace(win: ChallengeCampaignWin,
   venueName: string | null): PrizeCardFace` returning `{ headline, label, venueName, status:
   "ready" | "redeemed" | "used", ariaLabel }` per the §2.2 table. Move `MENU_ITEM_LABEL`,
   `menuItemLabel` and `discountLabel` out of `PrizeWalletPanel.tsx` into it (one home), converting
   to title case. Amount formatting: whole dollars → `$25`, else `$12.50`.
2. **`components/prizes/PrizeCard.tsx`**: props `{ face: PrizeCardFace; size?: "list" | "large";
   inLiveFrame?: boolean }`. It takes a **face**, not a win, so the Partner Manual and the email
   renderer can draw a sample without a fake `ChallengeCampaignWin`. Export a `SAMPLE_PRIZE_CARD_FACE`
   (`$25`, `GIFT CARD`, venue `YOUR VENUE`) for those.
3. **`components/prizes/PrizeCardLogo.tsx`** (or inside `PrizeCard`): the §2.5 bouncing logo.
   Add the `logo-tap-bounce` keyframe + animation to `tailwind.config.ts`.
4. **Render script** `scripts/render-prize-card.cjs` (+ `npm run prize-card:render`), used now for
   the specimen and in Phase 5 for the email picture. Approach that needs no dev server and does not
   touch `proxy.ts`:
   - `node --import tsx` → `react-dom/server` `renderToStaticMarkup(<PrizeCard face=… />)`;
   - compile CSS with the Tailwind v3 CLI against `tailwind.config.ts`, content = the rendered HTML
     (`npx tailwindcss -c tailwind.config.ts -i <tmp input with @tailwind directives> --content
     <tmp html> -o <tmp css>`);
   - load Nunito via a Google Fonts `<link>` in the harness page and set `--ht-font-body` on
     `:root` (the next/font variable doesn't exist outside Next); inline the logo as a data URI from
     `public/brand/web/htc-logo-192.webp`;
   - Playwright (already a dependency) `page.setContent()` → element screenshot at
     `deviceScaleFactor: 2`, transparent background where possible.
   - `--specimen` writes a sheet of every state (gift card $25 / $12.50, Free Appetizer, 50% Off
     Entrée, a long "other" name, Redeemed, Used, large size) to
     `tmp/prize-card-specimen.png` (git-ignored; check `tmp/` is ignored).
   - Fallback if the Tailwind CLI route fights you: screenshot the real `/redeem-prizes` from a
     scratchpad clone with test cookies, per CLAUDE.md "Manual Testing & Auth Storage" and the
     memory note about never touching Andrew's `next dev` lock.
5. **Tests:** `tests/lib.prize-card-face.test.ts` (every row of the §2.2 table, whole-dollar
   formatting, title case, status mapping, aria label); `tests/components.prize-card.test.ts`
   (renders the three face elements and nothing else, logo is a labelled button, a tap re-keys the
   animation, no haptic when `inLiveFrame`, `motion-reduce` classes present, no hex literals and no
   `/brand/htc-logo.png` in `components/prizes/PrizeCard*.tsx`).
6. **Stop and get sign-off:** put the specimen PNG path in the handoff and ask Andrew to approve the
   look (or request tweaks) **before Phase 3**. Phase 3 must not start without that approval
   recorded in the handoff.

**Out of scope:** changing `PrizeWalletPanel`'s rendering (beyond moving the label helpers, which
must leave its output identical; existing tests must pass unchanged).

### Phase 3 — Redeem Prizes uses the card

**Goal:** the live page shows the new card; redemption behaves exactly as before.

0. **Logo 2×** (Andrew, 2026-10-15): `PrizeCardLogo` 80 px (list) / 96 px (large) on a full-width
   card, scaling with the card so it still fits a 320 px phone. Re-render the specimen.
   Move `wonForLine` and the expiry thresholds (`getExpiryInfo`) from `PrizeWalletPanel.tsx` into
   `lib/prizeCardFace.ts` (one home; Phase 4's back reuses them), and put the which-button decision
   in one small `PrizeCardAction` so Phase 4 can move it onto the back unchanged.
1. `components/prizes/PrizeWalletPanel.tsx`: delete `WineCoupon`, `AppetizerCoupon`,
   `GiftCertificateCoupon`, `GiftCardCoupon`, `MenuItemCoupon`; `ChallengeCoupon` becomes "face +
   `PrizeCard` + meta line + action" per §2.3 (list) or just the large card (`large`). Keep every
   existing decision about *which* button shows (`squareIssued`, `redeemed`, `scannable`) exactly
   as written; only the drawing changes. Venue name = the `venueName` the wallet already gets from
   `GET /api/challenge-campaigns/redeem` (zero new requests). If it's empty, the card shows no venue
   (don't fall back to an id).
2. `RedeemModal`: large card in `LiveCouponFrame` with `inLiveFrame`; one-line instruction (§2.4).
3. `components/prizes/SquareGiftCardPanel.tsx`: the offer screen shows the large card (it already
   receives `coupon`); the ready screen per §2.4.
4. Copy trims from §2.3 (heading removed, shorter empty state).
5. **Must not change:** the redeem POST, `redeem_challenge_prize`, the Square issue/open order, the
   `already_redeemed` handling, `useNativeBackHandler`, the live clock, wake lock, shimmer and
   sparkle, or any `/api` route. `git diff --stat` should show only `components/prizes/`, tests,
   and the docs.
6. **Tests to update/extend:** `tests/components.square-gift-card-ui.test.ts`,
   `tests/components.prize-wallet-live-coupon.test.ts`,
   `tests/components.prize-wallet-ranked-place.test.ts`,
   `tests/components.reward-descriptions-surfaces.test.ts`, `tests/components.player-pending.test.ts`,
   `tests/native-back-review-fixes.test.ts` (no new popup is added, so its list should not change),
   `tests/text-size-floor-contract.test.ts`. Add assertions: no `border-dashed`/`border-double` and
   no per-type color themes left in `components/prizes/`; the wallet uses `PrizeCard` for every
   prize kind.
7. **Gates:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:pwa-contract`,
   `npm run build` (never typecheck and build at the same time). Then a browser pass at 375 px and
   320 px wide from a scratchpad clone with mocked routes (never Andrew's dev server, never a real
   redemption against the shared database).
8. Re-render the specimen with the final code and attach it to the handoff.

### Phase 4 — Flip the card: details on the back, Redeem on the back

**Goal:** Andrew's 2026-10-15 request (§1 items 8–10), per spec §2.8. Tapping a card (not the
logo) flips it; the back shows Won / For / Terms / Expires, a "Redeemed {date, time}" stamp once
redeemed (details still readable), and the staff **Redeem** button.

**Start by** reading §2.8 and §6 Q4–Q6. Use the defaults unless Andrew has answered otherwise;
record which in the handoff.

1. **`lib/prizeCardFace.ts`:** add `prizeCardBack(win, now?)` (pure) returning `{ rows: { key:
   "won" | "for" | "terms" | "expires"; label: string; value: string; tone?: "urgent" | "soon"
   }[]; stamp: string | null }`. `wonForLine` already moved here in Phase 3; reuse it. Terms
   sentence per §2.8. Dates via `toLocaleDateString(undefined, { month: "short", day: "numeric",
   year: "numeric" })`; the stamp adds `hour: "numeric", minute: "2-digit"`. Expiry urgency uses
   `prizeExpiryInfo` (also moved in Phase 3), returned as a `tone`, not class names. Take `now` as
   an optional argument so tests are deterministic.
2. **`components/prizes/PrizeCard.tsx`:** optional `back?: PrizeCardBack` and `action?: { label:
   string; onPress: () => void }`. No `back` → today's flat card exactly (sample, email, manual).
   With `back`: the 3D flip of §2.8, `data-prize-card-flipped` on the root, the visually hidden
   "Show details" / "Show front" button, `aria-hidden` + `inert` on the face turned away. The tap
   handler ignores taps whose target is inside `[data-prize-card-logo]` or
   `[data-prize-card-action]` (use `closest()`), and **never calls `stopPropagation`** (the live
   frame's sparkle must still fire). Flip haptic: `haptic("selection")` only when `!inLiveFrame`.
   Split the faces into their own files if `PrizeCard.tsx` passes ~150 lines.
3. **`components/prizes/PrizeWalletPanel.tsx`:** list cards pass `back` and, as `action`, the pill
   Phase 3 put under the card (`PrizeCardAction` decides it today: Redeem / Show gift card / none;
   keep those decisions exactly). Remove the pill from under the card; the meta line becomes
   `{expiry} · Tap the card for details` (keep `SCANNABLE_COUPON_LINE` where it shows today). In
   `RedeemModal` and `SquareGiftCardPanel` the large card passes `back` but **no** `action`.
4. **Must not change:** the redeem POST, `redeem_challenge_prize`, Confirm Redemption being the only
   redeem trigger, the Square issue/open order, `already_redeemed` handling, `useNativeBackHandler`
   (a flipped card is not a popup; don't register one), the live clock / wake lock / shimmer /
   sparkle, any `/api` route. No new requests: every back field is already in the wallet response
   (`claimedAt`, `winDescription`/`challengeName`, prize fields, `prizeExpiresAt`,
   `prizeRedeemedAt`).
5. **Traps (3D on phones):**
   - **`overflow: hidden`, `opacity < 1` and `filter` on the rotating element flatten
     `preserve-3d`**: the back then shows mirrored or never appears, notably in iOS Safari. Put
     `overflow-hidden`, the redeemed `grayscale opacity-60` and the glow on the **front face**
     only, never on the rotating element or the perspective wrapper.
   - `backface-visibility` needs `[-webkit-backface-visibility:hidden]` too, for iOS.
   - Both faces are the same box (the back `absolute inset-0` over the in-flow front), so the list
     doesn't jump when a card flips.
   - Tailwind arbitrary properties must be written in full (no template-built class names).
6. **Tests:** extend `tests/lib.prize-card-face.test.ts` (`prizeCardBack` rows for each prize kind;
   rows with no data left out; the stamp has date and time; Square stamp; urgency tones) and
   `tests/components.prize-card.test.ts` (no `back` → no flip affordance; a tap flips and sets
   `data-prize-card-flipped`; a logo tap bounces but doesn't flip; an action tap calls `onPress` and
   doesn't flip; the hidden toggle flips; a redeemed back shows the stamp with no
   `opacity-60`/`grayscale` on the back; the turned-away face is `aria-hidden`; `motion-reduce`
   classes present; inside the live frame one tap = one buzz + sparkle + flip; static check: no
   `overflow-hidden`/`opacity-`/`grayscale` on the `preserve-3d` element). Wallet tests: the back's
   Redeem opens the sheet; Confirm Redemption is still the only redeem call; a redeemed card has no
   action; the `native-back-review-fixes` list is unchanged.
7. **Gates:** as Phase 3 (typecheck, lint, `npm run test`, `npm run test:pwa-contract`, build, a
   browser pass at 375 and 320 px from a scratchpad clone with mocked routes, with screenshots of a
   flipped ready card, a flipped redeemed card and a flipped card in the redeem sheet). Add the
   backs to the specimen (`--specimen`) and attach it to the handoff for Andrew.

**Out of scope:** the Partner Manual / email card (no back), any server change, renaming "coupon"
in staff copy (Q1).

### Phase 5 — Partner-facing: email picture, Welcome Email, Partner Manual

**Goal:** partners know where guests find their prizes, and see what the card looks like.

1. **Email picture:** `npm run prize-card:render -- --email` writes
   `public/brand/email/prize-card-v1.png`: the sample card (`$25`, `GIFT CARD`, `YOUR VENUE`) at
   2× for a 480 px display width (960 px wide), palette PNG via `sharp`, target ≤ 60 KB, on the
   email's surface color `#0f172a` (not transparent; some mail clients render transparency white).
   **New artwork always gets a new file name** (`-v2`, …), never an overwrite: sent emails keep
   pointing at the old one. Add it to the asset list comment in
   `scripts/build-partner-email-assets.cjs` so the next person knows it exists.
2. **Welcome Email** (`lib/email/partnerEmailCopy.ts` + `lib/email/welcomeEmail.ts`): a new
   `prizesSection` in `WELCOME_EMAIL` (`title`, `body`, `imageAlt`), rendered right after the
   feature tour as one card with the image (`width="480"`, `max-width:100%`, `height:auto`,
   `display:block`, centered, `alt` set), and in the plain-text version as title + body. Draft copy
   (Andrew edits it in `partnerEmailCopy.ts`):
   - **Title:** "Where guests find their prizes"
   - **Body:** "When a guest wins one of your Rewards, we let them know right away. Their prize
     appears as a digital gift card in Redeem Prizes, in the Hightop Challenge menu. To use it, they
     tap Redeem and show the card to your staff. Staff tap the card (it sparkles and shows the live
     time, so a screenshot won't work), and the guest taps Confirm Redemption. If you use Square,
     gift cards can be rung up like any other Square gift card."
   - **Image alt:** "A Hightop Challenge digital gift card for $25"
3. **Partner Manual** (`lib/partnerManual.ts` + `components/owner/PartnerManual.tsx`): a new
   section "Where Guests Find Their Prizes" after "Offer Rewards", same draft body (adjusted for
   Phase 4: guests tap the card to flip it, then tap Redeem on the back). Add an optional
   `figure?: "prize-card"` field to `PartnerManualSection`; the component renders the **live**
   `PrizeCard` with `SAMPLE_PRIZE_CARD_FACE` for it (the logo bounces here too), not an image, so the
   manual can never drift from the real card. Keep `PartnerManual.tsx` free of copy (copy stays in
   `lib/partnerManual.ts`).
4. **Tests:** extend `tests/lib.email.welcomeEmail.test.ts` (section present in HTML and text,
   image URL is absolute and versioned, alt set, HTML escaped), `tests/owner-dashboard-contract.test.ts`
   / any Partner Manual test (new section and figure render), and check
   `tests/lib.pos-staff-instructions.test.ts` still passes.
5. `npm run email:preview` and look at `tmp/email-previews/welcome.html` at 375 px and 600 px.

### Phase 6 — Review, phone pass, wrap-up

1. Run `/code-review` at high on the whole plan's diff; fix findings.
2. Write `docs/prize-gift-card-redesign-device-checklist.md` for Andrew: iPhone app, Android app,
   iPhone Safari, Android Chrome. Check the card's look; that the logo bounces (and buzzes in the
   list, once only in the redeem sheet); Reduce Motion; a real redeem at the test venue
   `venue-hightop-test`; a Square gift card at a Square venue (Andrew tests Square on the live site,
   per CLAUDE.md); the welcome email in Gmail (iOS + web), Apple Mail and Outlook; the Partner
   Manual section on a phone; **the flip** (smooth on both phones, back not mirrored on iOS, a
   logo tap doesn't flip, Redeem on the back opens the sheet, a redeemed card's back shows the stamp
   with readable details, Reduce Motion cross-fades). Headless browsers can't sign off on this;
   Andrew does.
3. Final updates: `CLAUDE.md` (a short "Prize cards" bullet: one component `PrizeCard`, faces from
   `lib/prizeCardFace.ts`, tokens `PRIZE_CARD`, render script, email asset versioning rule),
   `SYSTEM_CONTEXT.md` §8 (prize delivery is a digital gift card), `AGENTS.md` status, this plan's
   status line.

---

## 4. Files touched (whole plan)

| File | Phase | Change |
|---|---|---|
| `design-system/hightop-challenge-design-system/project/README.md` | 1 | Minimalism section + Prize cards subsection |
| `design-system/project/README.md` | 1 | Same two additions (older copy) |
| `design-system/hightop-challenge-design-system/project/colors_and_type.css` | 1 | Prize-card tokens |
| `lib/themeTokens.ts` | 1 | `PRIZE_CARD` |
| `SYSTEM_CONTEXT.md`, `CLAUDE.md`, `AGENTS.md` | 1, 6 | Minimalism rule; prize-card pointers |
| `lib/prizeCardFace.ts` | 2 | New, pure |
| `components/prizes/PrizeCard.tsx` (+ `PrizeCardLogo.tsx`) | 2 | New |
| `tailwind.config.ts` | 2 | `logo-tap-bounce` keyframe |
| `scripts/render-prize-card.cjs`, `package.json` | 2, 3, 4, 5 | Render script + npm script (+ `--width`, backs in the specimen) |
| `components/prizes/PrizeCardLogo.tsx` | 3 | Logo 2× |
| `components/prizes/PrizeWalletPanel.tsx` | 3, 4 | Five coupon components → `PrizeCard`; then the back + action |
| `components/prizes/SquareGiftCardPanel.tsx` | 3, 4 | Card + number/barcode layout; then the back |
| `lib/prizeCardFace.ts`, `components/prizes/PrizeCard.tsx` | 4 | `prizeCardBack`; the flip |
| `public/brand/email/prize-card-v1.png` | 5 | New asset |
| `lib/email/partnerEmailCopy.ts`, `lib/email/welcomeEmail.ts` | 5 | Prizes section |
| `lib/partnerManual.ts`, `components/owner/PartnerManual.tsx` | 5 | Prizes section + live card figure |
| `tests/…` | 2–5 | As listed per phase |

## 5. Traps to know about

- **`LiveCouponFrame` buzzes on every pointer-down.** A haptic in the logo too = double buzz
  (forbidden). Hence `inLiveFrame`.
- **Don't stop the logo's tap from reaching the frame.** The sparkle is the anti-screenshot proof.
- **Brand logo files are cached for a year** (`/brand/web/*`, `next.config.ts`). Reference the
  existing webp files; never overwrite one. The same rule applies by convention to
  `/brand/email/*`.
- **`text-xs`/`text-sm` are floored and get inflated inside game pages.** Use `text-caption` /
  `text-footnote` for small text on the card.
- **Fonts:** never write `"Nunito"` literally; use `var(--ht-font-body)`. The render script has to
  supply that variable itself.
- **Light-surface CSS:** the Partner Manual sheet is the *dark* `OwnerSheet` tone, so the global
  dark form CSS applies to the logo `<button>`. It uses `!border-0 bg-transparent`, **not**
  `tp-clean-button` (that class forces a 1 px border with `!important`; Phase 2 handoff §3). (Only
  the white store sheet uses `ht-light-surface`.)
- **3D flip (Phase 4):** `overflow: hidden`, `opacity < 1` or a `filter` on the rotating element
  flattens `preserve-3d` (iOS Safari shows a mirrored or missing back). Keep them on the front face.
- **No new requests.** The venue name is already in the wallet response. Don't add a fetch to the
  card, the manual or the email.
- **Shared database:** never run a real redemption or Square call from a dev server
  (`docs/square-dev-test-venue-plan.md`; memory note on `next dev` lock).
- **Tailwind class strings must be written in full** (no template-built class names), or Tailwind
  won't generate them. See the `SPARKS` comment in `LiveCouponFrame.tsx`.

## 6. Open questions for Andrew (none blocks the next phase; defaults apply)

**Answered 2026-10-15 (Phase 6):** Q1 and Q2 stay on their defaults (Andrew: "Good"). Q3: keep
"YOUR VENUE" (Andrew: "Yes"). Q4–Q6 use their defaults. Still open: **Q7** below.

- **Q1.** The card now looks like a gift card, but staff instructions and the printable staff sheet
  still call it a "coupon". Rename to "card" everywhere (staff sheet, Partner Manual Square
  section, `LiveCouponFrame` hint), or leave it? Default: leave it.
- **Q2.** OK to drop "Awarded {date}" from the wallet (§1)? Default: drop.
- **Q3.** Sample venue name in the email picture and the manual: "YOUR VENUE" (default), or a real
  venue's name?
- **Q4 (flip, added 2026-10-15).** Should Redeem on the back of the card open the live redeem sheet,
  where staff see the ticking clock and tap Confirm Redemption (default: yes, two deliberate taps
  and the anti-screenshot proof stay), or redeem straight away with one tap?
- **Q5 (flip).** "Terms of the reward": the back shows what the prize is good for ("Good for 50%
  off one Entrée"), and the competition sits on its own "For" line. Should it also show the
  reward's full rules text (how it was won)? Default: no, the "For" line covers it.
- **Q6 (flip).** Keep a Redeem button under the card as well as on the back? Default: no, only on
  the back, with "Tap the card for details" under the card so guests find it.
- **Q7 (Phase 6 review, 2026-10-15).** In the redeem sheet, staff tap the big card to see the
  sparkle, and that tap also flips it to its back (as §2.8 says). Keep that, or stop the *big* card
  flipping (list cards would still flip)? Default: keep it; Andrew decides after the phone pass
  (checklist item 2.2).
