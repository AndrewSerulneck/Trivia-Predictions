# Prop Bingo Page Simplification Plan

**Goal:** reduce `/bingo/home` to the two things a player actually does there —
**(1) create a board** and **(2) look at their active and previous boards** — by deleting the
inline ad, replacing the horizontal board switcher with a vertical stack of clearly-labeled
boards, adding a branded calendar for past days, and moving board creation (Steps 1-3) into a
slide-up sheet over the same page instead of three separate routes.

Surface under change: `components/bingo/SportsBingoHome.tsx` (2,902 lines) plus the ad
authoring stack. Landscape fullscreen (`isLandscapeGameView`, lines ~2113–2360) is a separate
render tree and stays as-is except where noted in Phase 3.

---

## Findings that shape the plan

| Fact | Where | Consequence |
|---|---|---|
| The page renders **one** board at a time: a horizontal switcher strip (max 4) picks `selectedActiveCard`, then a "primary zone" renders that single board. | `SportsBingoHome.tsx:2517–2650` | Phase 2 is a structural rewrite of this block, not a CSS change. |
| The inline ad has **two** call sites (first-run and active/scored), both `pageKey="sports-bingo"`, `slot="inline-content"`. | `SportsBingoHome.tsx:2457`, `:2752` | Player-side removal is small; the authoring surface is the bigger half. |
| Bingo inline is registered in **four** places beyond the call sites. | `lib/adSlotRegistry.ts:45` (id 042), `:61` (id 066), `lib/adPlacements.ts:151` (`slots.inline`), `components/admin/AdPlacementBuilder.tsx:88`, `components/admin/sections/adFormShared.tsx:158` | Phase 1 must hit all of them or the admin still offers the slot. |
| `SportsBingoCard` already carries `sportKey`, `homeTeam`, `awayTeam`, `gameLabel`. | `lib/sportsBingo.ts:607–624` | Item 3 needs **no** schema or API change — only display work. |
| `gameLabel` is already `"{away} vs. {home}"` but from **raw** team names (may be `"Atlanta Braves vs. Philadelphia Phillies"`). `toMascotDisplayName()` exists but is module-private. | `lib/sportsBingo.ts:1693`, `:1697` | To get the requested `"Braves vs. Phillies"`, export a mascot formatter or format client-side. |
| Sport→emoji is duplicated in ≥4 places (`🏀/⚾/🏈`). | `app/api/bingo/leagues/route.ts:12–17`, `components/bingo/SportsBingoSelectSport.tsx:18–21`, `SportsBingoSelectBoard.tsx:207–228`, `components/fantasy/FantasyHome.tsx:97` | Phase 3 introduces one shared static catalog. |
| `GET /api/bingo/cards` has **no** date parameter; `listUserSportsBingoCards` returns the user's 100 most recent cards. | `app/api/bingo/cards/route.ts:33`, `lib/sportsBingo.ts:11583`, `listCardRows` `:9005` | Phase 5 needs a real server-side date filter, not just client filtering. |
| Pick 'Em's "date feature" is today just `◀ Sat · Sep 6 ▶` arrows — **there is no calendar anywhere in the codebase.** | `components/pickem/PickEmGameList.tsx:905–945` | "Similar to Pick 'Em" means the *date rail*; the calendar popover is net-new and must be built from scratch (no date library is installed). |
| Board limit is `activeCards.length >= 4`. | `SportsBingoHome.tsx:1940` | The "+ Add a Board" control must render a "Max 4" state, not just a link. |
| Board creation is three routes (`/bingo/select-sport` → `/bingo/select-game` → `/bingo/select-board`), each a `PageShell` wrapping a client component that reads `useSearchParams()` and `router.push`es the next step. | `app/bingo/select-*/page.tsx`, `components/bingo/SportsBingoSelect*.tsx` | Phase 4's sheet must make the step target injectable (props) without deleting the standalone routes. |
| The slide-up sheet animation already exists as global CSS + a working reference implementation. | `app/globals.css:1795–1826` (`tp-popup-sheet-up`/`-down`, `tp-fade-in`/`-out`), `components/owner/PartnerManual.tsx` | Phase 4 reuses those classes and `lib/scrollLock.ts` — no new animation CSS, no motion library. |

### Two scope decisions — DECIDED (Andrew, 2026-09-07)

1. **Retire the Active / Scored `ViewTabs`** (`SportsBingoHome.tsx:2493`) in Phase 5. **Confirmed.**
   Once a date rail exists, "Scored" *is* "a previous day," and keeping both is exactly the
   duplicated navigation we're removing.
   **Hard requirement attached to this decision: a board that scores *today* must stay visible on
   today's view.** Retiring the tabs must not make a finished board disappear the moment it
   settles — with no tab to switch to, that would read as data loss. Today's view is one stack:
   live boards, then upcoming, then **today's finished boards**, then the Add tile. A past date
   shows that day's boards, read-only. Phase 5 is not done until a board settling while the
   player watches visibly moves down the stack instead of vanishing (see 5c and Phase 7).
2. **Landscape stays a swipe carousel. Confirmed.** Stacking 25-square grids vertically is a
   portrait idea; in landscape the board is height-bound and the carousel is correct. Phase 3's
   labels apply to both trees; Phases 2, 4, 5 and 6 are portrait-only and must leave the
   `isLandscapeGameView` render path (`SportsBingoHome.tsx:2113–2360`) structurally untouched.
   The landscape tree keeps its own Active/Scored toggle — that is a carousel filter, not the
   retired portrait tabs, and 5d does not remove it.

### Scope change — DECIDED (Andrew, 2026-09-07, after Phase 3)

3. **The full-size "+ Add" empty-board tile is CANCELLED.** The interim dashed
   **"+ Add a Board"** button Phase 2 left at the end of the stack is the final design — it reads
   clearly, costs one row instead of a whole board's height, and does not compete with the real
   boards above it. Phase 4's original 4a–4d are dropped; 4c's "Max 4" state and 4e's
   hide-on-past-dates rule survive (4c is already implemented on that button; 4e moves into 5c).
4. **Board creation moves into a slide-up sheet.** Instead of navigating away to three routes,
   tapping "+ Add a Board" slides Steps 1 → 2 → 3 up from the bottom of `/bingo/home` (the same
   animation as the Partner Manual). The player picks league → game → board inside the sheet;
   on lock-in the sheet slides back down and reveals the new board in the stack behind it. This
   is the rescoped **Phase 4**, and because Phase 5 was executed first it now runs **after**
   Phase 5 (see Sequencing).

---

## Phase 1 — Delete the Bingo inline ad, end to end

**Model: Sonnet 5 · Effort: medium.** Mechanical, multi-file, high blast radius if a spot is
missed — needs care, not deep reasoning.

1a. **Player surface.** Remove both `<InlineSlotAdClient>` blocks and their preceding
`<FoldLine />` spacers (`SportsBingoHome.tsx:2452–2463`, `2747–2761`) and the now-unused import
(`:20`). Leave the popup and mobile-adhesion Bingo ads alone — you only asked to remove the
inline unit under the boards.

1b. **Admin authoring.** Delete `slots.inline` from `AD_PLACEMENTS["sports-bingo"]`
(`lib/adPlacements.ts:151–176`); delete registry ids **042** and **066**
(`lib/adSlotRegistry.ts:45`, `:61`); delete the `sports-bingo-inline` entry from
`AdPlacementBuilder`'s `PAGES` (`:88`); drop the `case "sports-bingo"` inline hint in
`adFormShared.tsx:158`. `getAdTypesForPage()` derives its list from the registry, so once 042
and 066 are gone the admin's ad-type selector stops offering "Inline" for Bingo on its own —
verify that rather than assuming it.

1c. **Server guard.** Reject `pageKey === "sports-bingo" && adType === "inline"` on write in
`app/api/admin/route.ts` (near the page-key validation at `:216`) and return no ad for that
pair in `app/api/ads/slot/route.ts`. Without this, an already-open admin tab or a scripted POST
can still create the placement.

1d. **Existing data.** New timestamped migration under `supabase/migrations/` that sets
`is_active = false` on `advertisements` rows with `page_key = 'sports-bingo'` and an inline slot
— **deactivate, do not delete**, so impression/click history and any partner reporting survive.
No `CHECK` constraint change: `inline-content` stays valid for other pages. (Existing migration
files stay read-only per CLAUDE.md.)

1e. **Docs.** `VISUAL_GUIDE_AD_SLOTS.md`, `INDEX_AD_SLOT_DOCUMENTATION.md`,
`CODEX_PROMPTS_AD_SLOTS.md` and `FINAL_SUMMARY_AD_SLOT_FIX.md` all name slots 042/066 — mark
them retired.

**Done when:** the Bingo page has no inline ad in either state, the admin's Bingo page offers
only Pop-Up and Banner, a direct API attempt is refused, and `npm run test` passes.

### Phase 1 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean. `npm run test`: 1951
pass; the only 2 failures (`tests/lib.billingDiscounts.test.ts` — a wall-clock/date-dependent
assertion; `tests/lib.sportsBingo.mlb-star-tilt.test.ts` — a flaky statistical threshold) both
reproduce on `main` with the work stashed, i.e. pre-existing and unrelated to this phase.

Changes, file by file:

- **1a — player surface.** `components/bingo/SportsBingoHome.tsx`: removed both
  `<div className="pt-3"><FoldLine /></div>` + `<div className="pt-2.5"><InlineSlotAdClient …/></div>`
  blocks (first-run branch and active/scored branch). Removed the now-unused
  `InlineSlotAdClient` import. `FoldLine` had **only** these two call sites in the file, so it
  was also dropped from the `@/components/venue/GameChrome` import — that import now reads
  `import { ViewTabs, LiveDot } from …` (both still used). Popup + mobile-adhesion Bingo ads
  untouched.
- **1b — admin authoring.**
  - `lib/adPlacements.ts`: deleted the `inline` slot from `AD_PLACEMENTS["sports-bingo"].slots`
    (replaced with a dated retirement comment). `popup` + `banner` remain.
  - `lib/adSlotRegistry.ts`: replaced registry rows **042** ("Bingo Inline Content") and
    **066** ("Bingo Inline (Under Grid)") with retirement comments. Left every other id intact.
  - `components/admin/AdPlacementBuilder.tsx`: removed the `sports-bingo-inline` entry from
    `PAGES` (dated comment left in place).
  - `components/admin/sections/adFormShared.tsx`: removed the `case "sports-bingo":` arm from
    `getSlotHintForPage`'s `inline-content` switch.
  - **Verified** (by reading, not assuming): `getAvailableAdTypesForPage` in `adFormShared.tsx`
    derives its type list from `AD_SLOT_REGISTRY.filter(pageKey===…)`. With 042/066 gone,
    `sports-bingo` now only yields `popup-on-entry` / `popup-on-scroll` / `mobile-adhesion`,
    so the admin's ad-type selector for Bingo now offers only Pop-Up and Banner. No further
    edit needed there.
- **1c — server guards.**
  - `app/api/admin/route.ts`: added an early `return 400 { error: "The Bingo inline ad slot
    has been retired." }` in **both** the POST (`createAdminAdvertisement`) and PUT
    (`updateAdminAdvertisement`) `body.resource === "ads"` branches, guarding
    `body.pageKey === "sports-bingo" && (body.adType === "inline" || body.slot === "inline-content")`.
    (Plan said "near :216" but that line is the GET query-param validator; the actual write
    paths are the two `resource === "ads"` blocks — that's where the guard belongs.)
  - `app/api/ads/slot/route.ts`: returns `{ ok: true, ad: null }` for (i) `slotKey ===
    "sports-bingo-inline"` on the canonical path and (ii) `pageKey === "sports-bingo" &&
    (adType === "inline" || slot === "inline-content")` on the legacy path.
- **1d — data.** New migration `supabase/migrations/20260907120000_retire_bingo_inline_ad_slot.sql`:
  `update advertisements set active = false where page_key = 'sports-bingo' and (ad_type =
  'inline' or slot = 'inline-content' or slot_key = 'sports-bingo-inline')`. **Note:** the
  column is `active` (boolean, from the initial schema), *not* `is_active`. Deactivate-only,
  no `CHECK` change. Not yet applied to any DB — run it as part of deploy.
- **1e — docs.** Marked slots 042/066 retired in `VISUAL_GUIDE_AD_SLOTS.md`,
  `INDEX_AD_SLOT_DOCUMENTATION.md`, `CODEX_PROMPTS_AD_SLOTS.md`, `FINAL_SUMMARY_AD_SLOT_FIX.md`.

**Not committed** — working tree only, left for review.

### Handoff to Phase 2 (Vertical board stack — Opus 5, effort high)

- **Nothing in Phase 1 touched the render block Phase 2 rewrites.** The horizontal switcher
  strip, `selectedActiveCard` / `selectedActiveBoardId` / `selectedBoardProgress` /
  `selectedBoardIsLive` state, the "primary zone", the `ViewTabs`, and the landscape portal
  are all exactly as they were on `main`. Only the two ad blocks *below* the primary zone and
  two import lines changed. Line numbers in the plan's findings table have shifted up by ~15
  (first ad block removed) then a further ~15 — re-grep rather than trusting `:2517` etc.
- `ViewTabs` and `LiveDot` are still imported from `@/components/venue/GameChrome`; `FoldLine`
  is **no longer imported** — if Phase 2/6 wants a separator again, re-add it to that import.
- Phase 6 explicitly calls out "leftover `FoldLine` separators from Phase 1" — there are none
  left in this file; that bullet is already satisfied.
- The `activeTab === "active" ? "bingo-home-active-inline" : "bingo-home-final-inline"`
  placementKey ternary that was the only other reader of `activeTab` near the bottom of the
  file is **gone**, so `activeTab`'s remaining readers are just the `ViewTabs` + the
  scored/active list rendering. Relevant to Phase 5d (tab retirement).
- Migration is written but unapplied. If you spin up a local Supabase for Phase 2 verification,
  apply it so your dev admin matches prod behavior.

---

## Phase 2 — Vertical board stack

**Model: Opus 5 · Effort: high.** The hardest phase: reshaping the core render of a 2,900-line
component that also owns realtime updates, animation glow sets, claim flows and a landscape
portal.

2a. **Extract `components/bingo/BingoBoardCard.tsx`** from the current primary zone: header slot,
`renderCompactGrid`, the live/starts-at + `n/25 marked` status row, "Closest line," and Expand.
Props are one `BingoCard` plus the animation sets (`recentlyUpdatedSquareKeys`,
`recentlySucceededSquareKeys`, `glowSquareKeys`, `recentlyAddedCardIds`) and the claim handler.
Extraction first is what makes 2b, Phase 3 and Phase 4 small.

2c. **Replace the switcher with the stack.** Delete the horizontal strip (`:2517–2576`) and
`selectedActiveBoardId` / `selectedActiveCard` / `selectedBoardProgress` / `selectedBoardIsLive`
state; map `activeCards` (then, per Phase 5, the day's settled cards) to `<BingoBoardCard>` in a
single vertical `flex-col` with generous gaps. Order: live first, then upcoming by start time,
then **finished boards from the same day** (which is what lets Phase 5 retire the Scored tab
without hiding a board that just settled). `BingoBoardCard` therefore needs a settled state from
the start — result, points, and claim affordance — not only a live one.

2d. **Keep the per-board hooks intact.** `data-bingo-card-id` is used by the claim/coin-flight
animation targeting and `selectLandscapeCard(...)` still has to fire on tap so rotating to
landscape lands on the board the player was looking at. Both must survive the move into the
extracted component.

2e. **Perf sanity.** Four live 25-square grids on screen instead of one. Memoize
`BingoBoardCard` on the card's `updatedAt`/status and confirm a square resolving still only
re-renders its own board.

**Risk:** the glow/pop animation sets are keyed by card and square id across the whole component;
a careless extraction silently stops the "square just hit" animation. Verify with a live board,
not a screenshot.

### Phase 2 — AS BUILT (2026-09-07, Opus 5)

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean,
`npm run test:pwa-contract` 20/20. `npm run test`: 1951 pass, 2 fail —
`tests/lib.billingDiscounts.test.ts` (wall-clock/date-dependent, same pre-existing failure Phase 1
recorded) and `tests/lib.sportsBingo.player-props.test.ts` (**flaky**: verified by running it three
times in isolation with the Phase 2 work stashed — pass, pass, fail; it draws a random board and
asserts a specific player appears). Neither is reachable from this phase's files.

`SportsBingoHome.tsx` went 2,873 → 2,428 lines.

#### New files

- **`components/bingo/bingoBoardShared.tsx`** — the extraction seam. Holds what both the page
  shell and the new board tile need, moved **verbatim** out of `SportsBingoHome.tsx` (no behavior
  change): the `BingoCard` / `BingoCardSquare` types, `LINE_PATTERNS`, `BINGO_HEADER_LETTERS`,
  `LANDSCAPE_SQUARE_LABEL_MAX_LENGTH`, `formatLocalDateTime`, `shortenLabel`,
  `getCardSquareStyle`, `renderSquareStatusGlyph`, `toCardSquareKey`, `summarizeCardState`,
  `getClosestLineRemaining`, `getBoardProgress`. This exists to avoid the circular import that
  `BingoBoardCard` importing from `SportsBingoHome` would have created. **`BingoCard` and
  `BingoCardSquare` now live here — import the types from this module, not from the page.**
- **`components/bingo/BingoBoardCard.tsx`** (2a) — one board in the stack. Contains the former
  module-level `renderCompactGrid` (it had exactly one call site), plus header / status row /
  board / footer. Renders **both** an active and a settled board from day one (see 2c below).

#### `components/bingo/SportsBingoHome.tsx`

- **2c — the stack.** Deleted the horizontal switcher strip, the old `+ Add` mini-tab (both the
  `hasReachedBoardLimit` and `Link` branches — 4d is already satisfied, verify rather than repeat),
  the "primary zone", the selected-board live/freshness status row, and the standalone
  "Closest line + Expand" pair. Deleted `selectedActiveBoardId` state, the effect that kept it
  valid, the `selectedActiveCard` memo, and `selectedBoardProgress` / `selectedBoardIsLive`.
  In their place: `portraitStackCards` mapped into `<BingoBoardCard>` inside a single
  `flex flex-col gap-4`.
- **Stack order** is `[...live, ...upcoming, ...todaysSettledCards]`, built in the
  `portraitStackCards` memo. `activeCards` is already sorted earliest-to-latest and every live
  board started before every upcoming one, so the partition is belt-and-braces; it is written
  explicitly so the contract survives a future sort change.
- **`todaysSettledCards`** filters `settledCards` by `isSameLocalDayAsToday(card.startsAt)` (new
  module helpers `toLocalDayKey` / `isSameLocalDayAsToday`). This is the Phase 5 seam — see the
  handoff below.
- **`portraitStackCards` yields `{ card, isLive }`, not bare cards.** `isLive` is computed in the
  memo, not in `BingoBoardCard`: the repo's `react-hooks/purity` lint rule **rejects `Date.now()`
  during render** (this was a real lint error, not a style choice), and hoisting it also keeps the
  memo comparison deterministic.
- **Interim add affordance.** 4d deletes the old `+ Add` tab in this phase but 4a's `AddBoardTile`
  does not arrive until Phase 4, which would have left a shipped intermediate state with no way to
  create a board. A plain dashed full-width "Add a board" button/link now sits at the end of the
  stack, wired to the existing `hasReachedBoardLimit` / `triggerLimitReachedFeedback` / `limitPulse`
  / `showBoardLimitMessage` machinery. It is marked `INTERIM` in a comment — **Phase 4 replaces this
  block, it does not add a second one.**
- **`LiveDot` is no longer imported here** — it moved to `BingoBoardCard` with the status row.
  `ViewTabs` is still imported and is the only remaining user of that import line.
- The **Active tab count** now counts `portraitStackCards.length` (today's finished boards live in
  that stack now), not `activeCards.length`.
- `isRealtimeFresh` is now **write-only** — its only reader was the "live updates / synced" whisper
  that went with the old status row. An inline comment marks it and its 1s interval for Phase 6.

#### 2d — per-board hooks, preserved

- `data-bingo-card-id={card.id}` is on the `<article>` in `BingoBoardCard`, so `findActionAnchor`'s
  `document.querySelector('[data-bingo-card-id="…"]')` still resolves. `data-bingo-square-key`
  likewise stays on every square. Both keys are card-scoped, so the stack does not create
  duplicates (and portrait/landscape never render at the same time).
- Tapping a board still calls `selectLandscapeCard(...)` so rotating lands on the board the player
  was looking at. It now routes on the card: a settled board selects the `"scored"` carousel and
  opens the final-board modal; an active board selects `"active"` and opens the live modal.

#### 2e — memoization

`BingoBoardCard` is `memo`'d with a **custom comparator**, because the default shallow compare
would never hit: the parent re-renders on every glow/pop timer tick and hands down whole `Set`s
that are rebuilt each time, and `cards` objects get new identities on every poll. The comparator
compares (i) a cheap per-card signature (id, status, startsAt, gameLabel, rewardPoints,
rewardClaimedAt, and each square's index/status/isFree/label/propProgress), and (ii) **only this
card's own** membership in each of the three square sets and two card-id sets. A square resolving
on board A therefore re-renders board A alone.

**The comparator compares `onOpen` / `onClaim` by identity, so they must be referentially stable.**
They are: `handleOpenBoard` / `handleClaimBoard` are `useCallback(…, [])` that dispatch through
`boardActionsRef`, whose `.current` is re-pointed on every render. Stable *and* never stale.
**If you add a prop to `BingoBoardCard`, add it to `arePropsEqual` or it will silently not update.**

#### Test contract updated

`tests/pwa-contract.test.ts` → "keeps portrait square labels on the original truncation budget"
now reads `bingoBoardShared.tsx` and `BingoBoardCard.tsx` (added as `bingoSharedSource` /
`bingoBoardCardSource`) instead of asserting `shortenLabel` and the portrait square render live in
`SportsBingoHome.tsx`. It additionally asserts the portrait grid has **not** come back to the page
file and that the landscape cap never leaks into `BingoBoardCard`. Same intent, new file layout.

#### Not done in Phase 2 (by design)

- No landscape diff. `isLandscapeGameView` still owns `renderLandscapeGrid` and its own
  Active/Scored toggle (decision 2). It does **not** use `BingoBoardCard`.
- The portrait `ViewTabs` and the Scored tab are still there (5d). Today's finished boards
  therefore appear **twice** — once at the bottom of the Active stack, once in the Scored list.
  That is the deliberate transitional state 5d's guard (i) describes; Phase 5 removes the tabs and
  the duplication with them.
- No device pass. Per CLAUDE.md a headless browser cannot verify this surface, and the plan puts
  the device pass in Phase 7. **The glow/pop animation on a live board is still unverified on
  hardware** — that is the top item for Phase 7.

**Not committed** — working tree only, left for review alongside Phase 1.

### Handoff to Phase 3 (Sport + game labels — Sonnet 5, effort medium)

- **3c lands in `components/bingo/BingoBoardCard.tsx`, one place.** The header is a single `<p>`
  marked with the comment `Header — the matchup. Phase 3 adds the sport emoji + mascot-only names
  here.` It already renders `card.gameLabel` in the Bree Serif display face at `text-[15px]`; 3c
  asks for the emoji at ~20–24px beside it as the loudest text on the card, so bump this line and
  put the emoji in it. `card.sportKey`, `card.homeTeam` and `card.awayTeam` are all on the prop —
  no new props needed.
- **The old switcher's `gameLabel` chip is gone**, so the board header is now the *only* place a
  portrait board is labeled. Getting 3c right matters more than it did when the plan was written.
- **3e's "scored-board list rows"**: those rows still exist (the Scored tab, `settledCards.slice(0, 12)`
  near the bottom of `SportsBingoHome.tsx`) **and** today's settled boards now also render as
  `BingoBoardCard`s in the stack. Apply the label vocabulary to both, or a board changes name when
  it moves between them. 3e's landscape headline is unchanged from `main`.
- **Line numbers in the plan's Phase 3 bullets are stale.** `SportsBingoHome.tsx` is 2,428 lines
  now (was 2,873 on `main`) — grep, don't trust `:2196`.
- **If 3d exports `toMascotDisplayName` from `lib/sportsBingo.ts`, do the formatting in
  `BingoBoardCard`, not in the card payload** — the plan wants full names kept for the expanded
  modal (`expandedActiveCard.gameLabel`, still rendered in `SportsBingoHome.tsx`), so `gameLabel`
  itself must stay raw.
- 3a/3b (the shared league catalog) touch none of Phase 2's files and can be done first.

### Also relevant to Phase 4 (rescoped — see the decision note below)

- **The INTERIM dashed "+ Add a board" control at the end of the stack is now the KEEPER.**
  Andrew cancelled the full-size empty-board tile on 2026-09-07 (see the decision note in
  Phase 4). Leave that block's markup alone; it already wires `hasReachedBoardLimit`,
  `triggerLimitReachedFeedback`, `limitPulse` and `showBoardLimitMessage`.
- The two small "Get a board" links (first-run panel + the `portraitStackCards.length === 0`
  empty state) also stay as they are.
- Phase 4's remaining job is the slide-up creation sheet: that dashed button (and both "Get a
  board" links) stop being `<Link href="/bingo/select-sport">` and become the sheet's trigger.

### Also relevant to Phase 5

- **5c's "today's stack" already exists** — `portraitStackCards` + `todaysSettledCards` in
  `SportsBingoHome.tsx`. Phase 5's job is to swap the *date source*, not to build the stack:
  replace `isSameLocalDayAsToday(card.startsAt)` with a comparison against `selectedDate`, and
  make the same day filter apply to the live/upcoming partition (today it does not — active boards
  are always shown, which is correct only while "today" is the only possible day).
- `toLocalDayKey(iso)` is already there as a module helper and returns a `YYYY-M-D` **local**
  key — reuse it so the client day filter and the new `date=YYYY-MM-DD` API param agree. Note it
  is not zero-padded; if you need the wire format, format separately.
- **5d guard (i) is satisfied**: `BingoBoardCard` renders settled boards (result badge, points,
  and the Collect button when `status === "won" && !rewardClaimedAt && rewardPoints > 0`) inside
  the stack today. The Scored tab can come out.
- **5d guard (ii) is satisfied**: per-board claim goes through `handleClaimBoard` →
  `boardActionsRef.current.claim` → the existing `claimPoints`, driven entirely by card status.
  The unclaimed-points banner and `collectAllBingoPoints` were not touched.
- **5d guard (iii) is NOT done.** The `initialCardId` effect near the top of the component still
  does `setActiveTab("scored")` to reach a settled board. Rewrite it to select that board's **date**
  and scroll to it, per the plan.
- When `ViewTabs` goes, `import { ViewTabs } from "@/components/venue/GameChrome";` goes with it —
  it is that import's last user.

---

## Phase 3 — Label every board with its sport and game

**Model: Sonnet 5 · Effort: medium.** Small surface, but it touches a file with an explicit
"keep these in sync, intentionally not shared" comment.

3a. **New `lib/sportsBingoLeagues.ts`:** one exported `{ sportKey, label, emoji }` catalog for
`basketball_nba` 🏀, `basketball_wnba` 🏀, `americanfootball_nfl` 🏈, `baseball_mlb` ⚾, plus
`getLeagueDisplay(sportKey)` with a safe fallback for an unknown key.

3b. **Consume it** in `app/api/bingo/leagues/route.ts`, `SportsBingoSelectSport.tsx` and
`SportsBingoSelectBoard.tsx`. Note the comment at `leagues/route.ts:9–11`: the duplication that
is *deliberate* is the **fallback's enabled/status behavior**, not the emoji table. Share only
the static catalog, leave the fallback's status logic duplicated, and update that comment to say
so.

3c. **Board header** in `BingoBoardCard`: emoji at ~20–24px next to the matchup in the existing
Bree Serif display face — `⚾ Braves vs. Phillies` — as the loudest text on the card. Secondary
line keeps tip-off/live state.

3d. **Mascot names.** `gameLabel` is built from raw feed names, so it can read *"Atlanta Braves
vs. Philadelphia Phillies."* Export `toMascotDisplayName` from `lib/sportsBingo.ts` (or add a
tiny client formatter) and render `⚾ Braves vs. Phillies`, keeping full names for the expanded
modal. **Confirm against real MLB/NBA rows before choosing** — if the feed already returns
mascots, skip 3d entirely.

3e. Apply the same emoji + label to the landscape headline (`SportsBingoHome.tsx:2196–2200`) and
the scored-board list rows, so one vocabulary covers the feature.

### Phase 3 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean.
`npm run test:pwa-contract` 20/20. Targeted tests green: `tests/api.bingo.leagues.test.ts` (5),
`tests/components.bingo.SportsBingoSelectSport.test.ts` (3), `tests/api.bingo.cards.test.ts` (10),
`tests/api.bingo.games.test.ts` (2), `tests/navigation-controls-contract.test.ts` (7). Did not
run the full `npm run test` sweep — Phases 1 & 2 already characterized its 2 pre-existing flaky
failures (`lib.billingDiscounts`, an `lib.sportsBingo.*` statistical draw) and this phase touches
none of that surface. `lib/sportsBingo.ts` was **not** modified, so `test:bingo-mlb` /
`test:bingo-nfl` were not required (Phase 7 note: 3d exported nothing from that file).

**3d decision: the client formatter path was taken, not the `lib/sportsBingo.ts` export.**
`lib/sportsBingo.ts` is `import "server-only"` — a client component cannot import from it — so
`toMascotDisplayName` could not be shared out of there. The feed **does** return full names
(`extractTeamName` → `full_name` / `display_name`, e.g. "Denver Nuggets", "Kansas City Royals"),
so 3d was needed, not skippable. `gameLabel` on the card payload stays raw (full names) for the
expanded modals; mascot formatting happens at render time.

#### New file — `lib/sportsBingoLeagues.ts` (3a)

Client-safe (no `server-only`). Exports:
- `SPORTS_BINGO_LEAGUES` — the `{ sportKey, label, emoji }[]` catalog for `basketball_nba` 🏀,
  `basketball_wnba` 🏀, `americanfootball_nfl` 🏈, `baseball_mlb` ⚾.
- `getLeagueDisplay(sportKey)` — lookup with a safe fallback `{ sportKey, label: "Sports",
  emoji: "🏆" }` for an unknown/empty key (case-insensitive, trims).
- `toMascotDisplayName(team)` — **duplicated verbatim** from `lib/sportsBingo.ts:1697` (same
  `keepLastTwo` set: Red Sox / White Sox / Blue Jays / Trail Blazers / Golden Knights /
  Maple Leafs). The file header explains why the copy exists; keep the two in sync if the rules
  change. The server copy was left untouched — it feeds resolver-key normalization
  (`lib/sportsBingo.ts:1549`), not display.
- `toMascotMatchup(awayTeam, homeTeam)` — `"{away mascot} vs. {home mascot}"`, same order and
  `vs.` separator as `toGameLabel`.

#### 3b — consumers

- **`app/api/bingo/leagues/route.ts`**: local `LEAGUES` array is now
  `SPORTS_BINGO_LEAGUES.map(...)` re-keyed to the route's existing `{ key, label, icon }` wire
  shape (unchanged on the wire — `api.bingo.leagues.test.ts` still green). The `:9–11` comment
  was rewritten: the static catalog is shared; the **fail-open `enabled` status** in the client
  fallback is the part that stays deliberately duplicated.
- **`components/bingo/SportsBingoSelectSport.tsx`**: `FALLBACK_SPORT_OPTIONS` is built from
  `SPORTS_BINGO_LEAGUES`; a small local `FALLBACK_STATUS` map keeps the per-league
  `enabled`/`note` (NFL still `enabled: false, note: "Coming soon"`). No behavior change —
  `SportsBingoSelectSport.test.ts` green.
- **`components/bingo/SportsBingoSelectBoard.tsx`**: deleted its private copy of
  `toMascotDisplayName` (was identical to the server one) and now imports it from the shared
  module — call sites at the game-summary line (`{toMascotDisplayName(game.awayTeam)} vs
  {toMascotDisplayName(game.homeTeam)}`) are unchanged. `getGeneratingLoaderVariant` now pulls
  its `emoji` from `getLeagueDisplay(sportKey).emoji` instead of three hardcoded literals (the
  titles/classNames stay league-specific and local).

#### 3c — `components/bingo/BingoBoardCard.tsx` header

The header `<p>` is now `emoji + matchup`: a `text-[22px]` emoji span next to a `text-[17px]`
(up from `text-[15px]`) truncating mascot-matchup span, both in the existing Bree Serif face —
the loudest text on the card. `league`/`matchup` are derived at the top of `BingoBoardCardImpl`
from `card.sportKey` / `card.awayTeam` / `card.homeTeam` (all already on the `BingoCard` type —
no prop change). `matchup` falls back to `card.gameLabel` if the team fields are somehow empty.
The status row below is unchanged and is the "secondary line" 3c asks for (Live / Starts …).

**Memo comparator updated (plan 2e contract):** `cardSignature` in `BingoBoardCard.tsx` now
also folds in `card.sportKey | card.awayTeam | card.homeTeam`. In practice `gameLabel` already
tracked the team names and `sportKey` is immutable per card, so this is belt-and-braces, but
the file's own rule is "if you render it, sign it."

#### 3e — `components/bingo/SportsBingoHome.tsx` (two spots, no line ref — grep, file moved again)

- **Landscape headline** (`<h1>` inside `tp-bingo-landscape-headline`, was `~:1973`): when a
  card is selected it renders `getLeagueDisplay(card.sportKey).emoji` (20px) + `toMascotMatchup`,
  truncating. The no-card branch still shows "No active boards" / "No scored boards" verbatim.
  The landscape render tree is otherwise untouched (decision 2).
- **Scored-board list rows** (`settledCards.slice(0, 12).map` near the file bottom, was `~:2389`):
  the `{card.gameLabel}` line became emoji (15px) + `toMascotMatchup`, truncating, matching the
  in-stack `BingoBoardCard` so a board keeps its name when it moves between the Scored list and
  the day stack (the handoff's explicit worry).
- **Left raw on purpose:** `expandedActiveCard.gameLabel` and `expandedFinalCard.gameLabel` in
  the two expanded modals — 3d says keep full names there.

#### Not touched

- `components/fantasy/FantasyHome.tsx` — the findings table lists it as a 4th emoji-dup site,
  but 3b's scope is the three Bingo files only. Its 🏀/⚾ map is still hand-rolled; fold it into
  `getLeagueDisplay` in a later cleanup if desired (it is a different feature surface).
- No device pass (Phase 7 owns it). The emoji sizes on the portrait card header and the
  landscape headline are unverified on hardware.

**Not committed** — working tree only, alongside Phases 1 & 2.

### Handoff to Phase 4 (originally the full-size "+ Add" tile — CANCELLED 2026-09-07; Phase 4 is now the slide-up creation sheet)

- **Phase 3 did not touch the stack render, the INTERIM add button, or the empty states** — all
  exactly as Phase 2 left them. The dashed "Add a board" block at the end of
  `portraitStackCards` and the two small "Get a board" links (first-run panel + the
  `portraitStackCards.length === 0` empty state) are your Phase 4 targets — but as **triggers to
  rewire**, not markup to replace (the tile is cancelled; the button stays).
- **New shared module available:** `lib/sportsBingoLeagues.ts` is client-safe. If `AddBoardTile`
  wants a felt-consistent look it can ignore this, but `getLeagueDisplay` is there if any
  per-sport affordance is wanted later. Not required for Phase 4.
- **`SportsBingoHome.tsx` grew slightly** (emoji spans in two JSX spots) — still ~2,440 lines.
  Grep, don't trust line numbers in the Phase 4 bullets (`:2506–2515`, `:2554–2576` are all
  stale — the `:2554–2576` mini-tab was already deleted in Phase 2, 4d is satisfied).
- `import { getLeagueDisplay, toMascotMatchup } from "@/lib/sportsBingoLeagues";` is now in
  `SportsBingoHome.tsx` and `BingoBoardCard.tsx`. Both symbols are in use in each — don't drop
  the import when editing near it.

---

## Phase 4 — Create-a-board slide-up sheet (Steps 1–3 in place)

**Model: Opus 5 · Effort: high.** Rescoped 2026-09-07 (decisions 3 and 4 above). The original
"full-size `+ Add` empty board tile" is **cancelled** — the dashed **"+ Add a Board"** button
Phase 2 left at the end of the stack is the final design and needs no further work beyond what
4f asks of it. What replaces the old 4a–4d is this: board creation stops being three route
navigations and becomes one sheet that slides up over `/bingo/home`.

**The animation is not new work.** `app/globals.css` already ships
`.animate-tp-popup-sheet-up` / `.animate-tp-popup-sheet-down` (320ms `cubic-bezier(0.22,1,0.36,1)`
up, 270ms ease-in down) and `.animate-tp-fade-in` / `.animate-tp-fade-out` for the scrim, with a
`prefers-reduced-motion` no-op already wired. `components/owner/PartnerManual.tsx` is the
reference implementation of the whole pattern — scrim + `role="dialog"` + `setScrollLock` +
`isClosing` state so the exit animation finishes before unmount. Copy that skeleton; do **not**
add a motion library or new keyframes.

4a. **Make the three step components host-agnostic.** `SportsBingoSelectSport`,
`SportsBingoSelectGame` and `SportsBingoSelectBoard` today read `useSearchParams()` and call
`router.push(...)`. Give each optional props — e.g. `sportKey?`, `gameId?`, `onSelectSport?`,
`onSelectGame?`, `onCreated?`, `onBack?` — that **default to today's router behavior when
absent**. The standalone `/bingo/select-*` routes keep working unchanged (they are still the
landscape/deep-link/back-button fallback and are still linked from elsewhere); the sheet passes
the callbacks and drives the steps from its own state. Do not fork these components.

4b. **`components/bingo/CreateBoardSheet.tsx`.** Owns `step: "sport" | "game" | "board"`,
`sportKey`, `gameId`, and the `isOpen`/`isClosing` pair. Renders the scrim + sheet exactly as
`PartnerManual` does (`fixed inset-0 z-[5000] flex items-end`, `max-h-[90svh]`, rounded top,
`overflow-y-auto overscroll-contain` body, Escape to close, backdrop tap to close, focus
returned to the trigger on close). Header carries the step indicator (`Step 2 of 3`) and a
**Close**; the in-sheet step Back is `StepBackButton`/`WizardFooter` territory only if a footer
is warranted — a header-level step-back inside the sheet is acceptable and must **not** be
`ExitBackButton` (that primitive means "leave this screen," and the sheet is not a screen).
Per `docs/navigation-unification-plan.md`, whatever is chosen must not introduce a raw `←`.

4c. **Bingo felt palette, not the owner surface palette.** `PartnerManual` uses `bg-ht-surface` /
`ht-cyan`. The sheet renders over Bingo, so wrap its content in `tp-bingo-theme` and use the
sky-300-on-slate-900 vocabulary the three step components already use. Tailwind classes only.

4d. **Success path.** When `SportsBingoSelectBoard` locks a card in it currently
`router.push("/bingo/home")`. Under the sheet it calls `onCreated(card)` instead: the sheet
closes (slide-down), `SportsBingoHome` calls `loadCards({ refreshProgress: false })`, and the
new board lands in the stack — it already gets the `recentlyAddedCardIds` pop animation for
free, so the reveal reads as "the sheet peeled back to show your new board."

4e. **Triggers.** The dashed "+ Add a Board" button at the end of the stack, plus the two small
"Get a board" links (first-run panel and the empty state), all become sheet triggers rather than
`<Link href="/bingo/select-sport">`. Keep the existing 4-board limit behavior on the dashed
button — at 4 active boards it still pulses "Max 4 boards" and does **not** open the sheet.

4f. **Past dates (from the old 4e).** Already handled by Phase 5: `isViewingToday` gates the Add
button off entirely on a past day. Verify it still holds once the button becomes a sheet trigger.

4g. **Scroll and the installed PWA.** The sheet must use `setScrollLock` (as `PartnerManual`
does) so the stack behind it does not scroll, and must sit above `GameAppBar`. It is portrait
work only — in `isLandscapeGameView` the page renders a separate tree and the sheet must not be
mounted there.

**Done when:** tapping "+ Add a Board" slides Steps 1–3 up over the board stack with no route
change, locking a board slides it back down and the new board is visible in the stack behind,
Escape/backdrop/Close all dismiss it, the standalone `/bingo/select-*` routes still work
untouched, and `npm run test` (including `tests/navigation-controls-contract.test.ts`) passes.

### Phase 4 — AS BUILT (2026-09-07, Opus 5)

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` compiles
(`/bingo/home` stays `ƒ` dynamic; `/bingo/select-sport` stays `○` static — no new
`useSearchParams` was introduced there). `npm run test:pwa-contract` 20/20.
`npm run test`: 1973 pass, 2 fail on every run — but **not always the same two**, which is
itself the finding:
- `tests/lib.billingDiscounts.test.ts` ("pushes current_period_end forward for free months") —
  fails every time. The same wall-clock-dependent assertion Phases 1, 2 and 5 all recorded.
- One rotating flake. Across two full runs it was `tests/lib.sportsBingo.player-props.test.ts`
  (the random board draw Phase 2 characterized — passed twice in isolation here) and
  `tests/lib.venue-fk-cascade-guard.test.ts` (**timed out at 5s under full-suite parallelism,
  passes in 13ms alone**). Each was verified by re-running it on its own.

Neither is reachable from this phase's files. **Re-run a full-suite failure in isolation before
believing it** — the default 5s `testTimeout` is tight for this suite under load.

**Sequencing note for whoever reads this next:** the plan's order is 1 → 2 → 3 → 5 → 4 → 6 → 7.
Phases 1, 2, 3, 5 and now 4 are done. **Phase 6 (declutter sweep) is next.**

#### 4a — the three step components are host-agnostic, not forked

Each of `SportsBingoSelectSport` / `SportsBingoSelectGame` / `SportsBingoSelectBoard` gained
optional props that default to today's router behaviour when absent. The `/bingo/select-*` route
pages were **not touched at all** — they still render each component prop-less and behave exactly
as they did on `main`.

| Component | New props |
|---|---|
| `SportsBingoSelectSport` | `onSelectSport?(sportKey)`, `hideStepHeading?` |
| `SportsBingoSelectGame` | `sportKey?`, `onSelectGame?(game)`, `hideStepHeading?` |
| `SportsBingoSelectBoard` | `sportKey?`, `gameId?`, `onCreated?(cardId)`, `hideStepHeading?` |

- **Prop wins, URL is the fallback.** `useSearchParams()` is still called unconditionally (hooks
  rule) in the two components that had it; its value is only consulted when the matching prop is
  `undefined`. On `/bingo/home` the URL carries neither `sportKey` nor `gameId`, so inside the
  sheet the props are the only thing that can resolve them. The old
  `(searchParams.get("sportKey") ?? "basketball_nba")` default moved to the end of the chain so
  the fallback still lands on NBA.
- **`SportsBingoSelectGame` now exports its `BingoGame` type as `SportsBingoGame`** so the sheet
  can type `onSelectGame`. Same shape, renamed only to avoid colliding with
  `bingoBoardShared`'s `BingoCard`-adjacent vocabulary at import sites.
- **`writeSelectedBingoGame(game)` still fires on both paths.** That is deliberate: step 3 reads
  the session cache to skip a second `/api/bingo/games` round trip, and the sheet gets that for
  free without a new prop.
- **`hideStepHeading` exists to stop the sheet saying "Step 2 of 3" twice** — the sheet header
  carries it, so the in-card eyebrow `<p>` is suppressed (the `<h2>` title stays, and drops its
  `mt-1` with the eyebrow). Default `false`, so the routes are visually identical.
- `onCreated` was added to `playBoard`'s `useCallback` deps.
- **The props parameter is required, not `= {}`-defaulted**, on all three. JSX always supplies an
  object, so `<SportsBingoSelectSport />` in the route pages is still valid — but a defaulted
  parameter makes TS resolve `createElement(Comp, { … })` against the wrong overload and reject
  every prop as "does not exist in type 'Attributes'". That was a real `tsc` error while writing
  the test; do not add the default back.

#### 4b/4c/4g — `components/bingo/CreateBoardSheet.tsx` (new, ~238 lines)

- Owns `step: "sport" | "game" | "board"`, `sportKey`, `gameId`, `isClosing`, `hasEntered`.
- **The host mounts it conditionally rather than passing `isOpen`.** This is a deviation from the
  plan's literal `isOpen`/`isClosing` pair and it is load-bearing: this repo enforces
  `react-hooks/set-state-in-effect`, so an "on open, reset the step state" effect is a **lint
  error**, not a style preference (it failed the first time). Mounting fresh means there is no
  state to reset. The exit animation still completes, because the sheet owns `isClosing` and only
  calls `onClose` — which is what unmounts it — after the exit timer fires.
- Scrim `animate-tp-fade-in`/`-out`, panel `animate-tp-popup-sheet-up`/`-down`, 270ms
  `SHEET_EXIT_MS` matching `app/globals.css`, `resolveExitMs()` collapsing to 0 under
  `prefers-reduced-motion`. **No new keyframes, no motion library** — copied from
  `DateCalendarPopover`, per the Phase 5 handoff.
- `role="dialog"` + `aria-modal` + `aria-labelledby`, Escape, backdrop `onMouseDown`, Tab focus
  trap, focus captured at mount and restored to the trigger on close, `data-tp-scroll-lock="active"`
  (the marker `ScrollRescueGuard` / `ScrollRecoverySentinel` / `StandalonePwaRuntime` look for),
  `setScrollLock(…, "popup")` released on unmount.
- **`z-[5000]` clears `GameAppBar`'s sticky `z-30`** (plan 4g).
- **The entrance animation class is dropped once it finishes** (`onAnimationEnd`, guarded on
  `event.target === event.currentTarget`). This is not tidiness: `animation-fill-mode: both` holds
  `transform: translateY(0)` forever, and a transformed ancestor becomes the containing block for
  `position: fixed` descendants — which would have trapped **step 3's expanded board-preview
  modal** (`fixed inset-0 z-[90]` inside `SportsBingoSelectBoard`) inside the 90svh panel and
  clipped it against the panel's `overflow-hidden`. The last keyframe is the element's natural
  position, so removing the class moves nothing. **If you add a transform, filter or
  `will-change` to that panel, you re-break the expanded preview.**
- **4c palette:** the panel is wrapped in `tp-bingo-theme` and uses the sky-300-on-slate
  vocabulary (`border-sky-300/30`, `bg-slate-950`, `text-sky-300`), not `PartnerManual`'s
  `bg-ht-surface`/`ht-cyan`. Tailwind classes only.
- **Header navigation is compliant with `docs/navigation-unification-plan.md`:** a plain button
  with a Lucide `ChevronLeft` for the in-sheet step-back (steps 2–3 only; step 1 renders an
  `h-11 w-11` spacer so the title stays centred), a Lucide `X` for Close. **No `ExitBackButton`**
  (the sheet is not a screen), **no `StepBackButton`/`NextButton`** (those may only be composed by
  `WizardFooter`), **no raw `←`**. `tests/navigation-controls-contract.test.ts` 7/7.
- **No `VenuePresenceBoundary` was added.** `/bingo/home` renders inside
  `GameLandingExperience`, which already wraps its playing child in one, so step 3's
  `useVenuePresence()` resolves to the real context. Nesting a second boundary would have meant a
  duplicate geolocation/heartbeat loop.

#### 4d/4e/4f — `components/bingo/SportsBingoHome.tsx`

- New state `isCreateSheetOpen`; `openCreateBoardSheet` (`useCallback`) and `handleBoardCreated`
  next to `hasReachedBoardLimit`.
- **All three portrait triggers are now `<button onClick={openCreateBoardSheet}>` instead of
  `<Link href="/bingo/select-sport">`**, with their classNames carried over verbatim: the
  first-run "Get your first board", the `visibleStackCards.length === 0` empty-state "Get a
  board", and the dashed "+ Add a board" at the end of the stack.
- **The `hasReachedBoardLimit` sibling branch was not touched** — at 4 active boards the dashed
  control still calls `triggerLimitReachedFeedback`, still pulses "Max 4 boards", and still does
  not open the sheet (plan 4e).
- **4f verified, not assumed:** the whole Add block is still inside `isViewingToday ? (…) : null`,
  so a past day has no Add control at all. The past-day empty state still offers "Back to today".
- **`handleBoardCreated` re-reads the clock rather than reusing `todayKey`:**
  ```
  const freshToday = todayDateKey();
  setTodayKey(freshToday); setSelectedDate(freshToday);
  void loadCards({ background: true });
  ```
  Setting only `selectedDate` would break `isViewingToday` (`selectedDate === todayKey`) inside
  the ≤60s window where the day-rollover sync has not run yet, and the new board would render on
  a day the page did not think was today.
- `onCreated` fires **before** the slide-down completes, so the refetch and the exit animation
  overlap and the board is already in the stack when the sheet clears — the "sheet peels back to
  reveal your board" moment. The `recentlyAddedCardIds` pop comes for free from `loadCards`.
- **The sheet is mounted only in the portrait return** (after the `if (isLandscapeGameView)`
  early return at ~`:2035`), per 4g. Rotating with the sheet open unmounts it and its scroll-lock
  cleanup releases the page.
- **The landscape empty state's "Create Board" `<Link href="/bingo/select-sport">` was left
  alone** (decision 2 — no landscape diff). It is now the only `<Link>` left in the file, so that
  import is still used.
- File is 2,657 lines (was ~2,626).

#### New test — `tests/components.bingo.CreateBoardSheet.test.ts` (7 cases, all green)

jsdom, `createElement` (the repo's vitest config only globs `*.test.ts`). Pins **both halves** of
the one-component-two-hosts arrangement, which is the failure mode nothing else would catch:
- `onSelectSport` supplied → callback fires, `router.push` is **never** called;
- prop-less → still `router.push("/bingo/select-game?sportKey=basketball_nba")`;
- `hideStepHeading` toggles only the eyebrow, never the `<h2>`;
- the sheet advances 1 → 2 in place with no route change, steps back from the header chevron,
  renders no step-back on step 1, and defers `onClose` to the exit timer on Escape.

`matchMedia` is stubbed (jsdom ships none) and `fetch` is routed per endpoint.

#### Not done (Phase 7 owns it)

- **No device pass.** Per CLAUDE.md a headless browser cannot verify this surface. The slide-up
  and slide-down timing, the sheet's height on a small phone, the keyboard-free scroll inside the
  sheet body, step 3's expanded preview now that it is nested in a sheet, and the installed-PWA
  launch are all unverified on hardware.
- Step 3's `<style jsx>` block (the generating-loader keyframes) now renders inside the sheet. It
  is scoped and compiled the same way, but it has not been looked at on a device.

**Not committed** — working tree only, alongside Phases 1, 2, 3 and 5.

### Handoff to Phase 6 (declutter sweep — Opus 5, effort medium)

Phase 6 is judgment work: deciding what the stack + date rail + sheet have made redundant. Here
is what Phase 4 leaves you, and the exact anchors for each item the plan names.

**Phase 4 touched none of the render blocks Phase 6 is about.** The board stack, the board card's
internals, the first-run panel's body and the unclaimed-points banner are all exactly as Phases 2,
3 and 5 left them. The only portrait diffs are three `<Link>` → `<button>` swaps and one mounted
sheet at the bottom of the return.

The plan's Phase 6 list, resolved against the current tree:

1. **The "live updates / synced" freshness whisper — already gone; the STATE behind it is not.**
   `isRealtimeFresh` (`SportsBingoHome.tsx:519`) is **write-only** and carries a comment saying
   Phase 6 owns it. Its three writers are `:1273`, `:1276` and `:1327`, and `:1276` is inside a
   **1-second interval** that exists for nothing else. Deleting the state, its setter, its three
   writes and that interval is the single highest-value cleanup in this phase — it is a per-second
   re-render of a 2,600-line component that no longer paints anything.
2. **The standalone "Closest line" tile** is now inside `BingoBoardCard.tsx:229`
   (`{isSettled ? "Points" : "Closest line"}`), one per board in the stack. The plan asks whether
   it duplicates the board header — it does **not** duplicate it today (the header is the matchup;
   this is the progress figure), so this is a real judgment call and probably a keep. Decide it on
   a device, not from the source.
3. **Leftover `FoldLine` separators from Phase 1 — none exist.** Phase 1's handoff already
   recorded this; the import was dropped in that phase. This bullet is satisfied, do not go
   looking.
4. **The first-run "how it works" three-step strip** is at `SportsBingoHome.tsx:~2362–2377` (the
   `[{n:"1",t:"Pick a game"}, …].map`), immediately followed at `:~2379` by a second explainer
   card ("Hold up to 4 boards at once…"). Both sit under the first-run panel, which **already**
   explains the game in its own body copy ("Click the button below to create a 5×5 board of player
   props…"). That is three explanations stacked before a player has done anything — the strongest
   candidate for deletion after item 1.
5. **Keep the unclaimed-points banner** (`:~2386`, `unclaimedWonBingoCards.length > 0`). It is an
   action, not chrome — the plan says so explicitly.

Phase-4-specific things to know while you cut:

- **Do not touch the `CreateBoardSheet` panel's transform/filter/`will-change`.** See the
  `onAnimationEnd` note above — step 3's expanded board preview depends on that panel not being a
  containing block for `position: fixed`.
- **If you delete the first-run "how it works" strip, the first-run panel's own
  `openCreateBoardSheet` button must survive** — it is one of only three ways into the sheet.
- `Link` has exactly one remaining user in `SportsBingoHome.tsx` (the landscape empty state at
  `:~2097`). If Phase 6 ever removes that, drop the import with it.
- The landscape tree is still untouched by Phases 2/3/4/5 (decision 2). Phase 6 is portrait-only
  too — Phase 7 has an explicit "no landscape diff" check.
- **`npm run test` is the gate**, not a named script: `tests/navigation-controls-contract.test.ts`
  and `tests/components.bingo.CreateBoardSheet.test.ts` both run under it.
  `npm run test:pwa-contract` applies if you go near `.tp-bingo-landscape-*` CSS or the portrait
  square render.
- **The full suite fails 2 of 1,975 on a clean tree.** `lib.billingDiscounts` is wall-clock and
  fails every run; the second one rotates (`lib.sportsBingo.player-props`,
  `lib.venue-fk-cascade-guard` — both pass alone). Re-run any full-suite failure in isolation
  before believing it.

**Housekeeping hazard, pre-existing and NOT introduced by Phase 4 — worth a decision before
Phase 6.** Some file-sync tool is leaving `" 2"` duplicates of every new untracked file in this
branch:

```
components/bingo/BingoBoardCard 2.tsx
components/bingo/bingoBoardShared 2.tsx
components/ui/DateCalendarPopover 2.tsx
lib/sportsBingoLeagues 2.ts
tests/components.ui.DateCalendarPopover.test 2.ts
docs/prop-bingo-page-simplification-plan 2.md
supabase/migrations/20260907120000_retire_bingo_inline_ad_slot 2.sql
```

They are **stale snapshots**, they are untracked, and they are compiled by `tsc`, linted by
`eslint .`, and walked by both contract tests' `readdirSync` scans. They pass today only because
they happen to still be valid. A stale copy of a file Phase 6 edits can fail a contract test with
a path nobody recognises, and a stale `… 2.sql` in `supabase/migrations/` is a genuine deploy
hazard. Ask Andrew before deleting any of them (CLAUDE.md makes existing migration files
read-only history), but do not silently edit them into agreement with their originals either.

---

## Phase 5 — Date rail + branded calendar

**Model: Opus 5 · Effort: high.** New shared UI, a new API contract, timezone correctness, and
the tab-retirement decision all land together.

5a. **API.** Add an optional `date=YYYY-MM-DD` (local day) to `GET /api/bingo/cards`, threaded
into `listUserSportsBingoCards` → `listCardRows` as a `starts_at` range filter. Do it
server-side: client-side filtering of the 100-row window silently loses history for an active
player. Include an `activeDates` payload (days the user actually has boards) so the calendar can
dot those days. Extend `tests/api.bingo.cards.test.ts`.

5b. **`components/ui/DateCalendarPopover.tsx`** — a reusable month grid: sticky header trigger
`◀ ⌄ Sat · Sep 6 (Today) ▶`, tapping the label opens a month sheet with ◀/▶ month paging,
today ringed, selected filled, days with boards dotted, future days disabled, and a "Jump to
today" action. **Tailwind classes only** (no `style={{}}`, no CSS modules — CLAUDE.md), tokens
from `lib/themeTokens.ts`, Bingo's sky-300-on-slate palette, 44px hit targets, `role="dialog"`
+ focus trap + Escape to close. No date library is installed and none should be added — a month
grid is ~40 lines of `Date` math.

5c. **Wire into Bingo:** `selectedDate` state defaults to today; changing it refetches. **Today's
stack must contain both unsettled and settled boards for that day** — live, then upcoming, then
today's finished boards (won and lost), then the Add tile. The day filter is on the board's local
day, so a board keeps its place in today's stack when it settles; only the section it sorts into
changes. Fetch today with `includeSettled=true` and let a settled board render its result state
in place (final score, won/lost, and the claim affordance if points are unclaimed) rather than
being filtered out. A past date is the same stack, read-only, with no Add tile.

5d. **Retire the portrait `ViewTabs`** per decision 1 (`:2493–2502`), along with `activeTab` and the
scored-tab summary tiles — the date rail plus each board's own result state carries that
information. Scope guards on this deletion: (i) `BingoBoardCard` must render a *settled* board
correctly inside the stack before the tabs come out — do 5d after that, or a scored board has
nowhere to live; (ii) the unclaimed-points banner and per-board claim path (`claimPoints`,
`collectAllBingoPoints`) are driven by card status, not by `activeTab`, and must keep working for
a board that settled today; (iii) `initialCardId` deep-links currently set `activeTab` to reach a
scored board (`:835–839`) — rewrite that to select the board's **date** and scroll to it;
(iv) the landscape Active/Scored toggle stays (decision 2).

5e. **Nice-to-have, not required:** the same popover can replace Pick 'Em's `◀ ▶` arrows
(`PickEmGameList.tsx:905–945`). Do it only after Bingo ships, as its own change.

---

### Phase 5 — AS BUILT (2026-09-07, Opus 5)

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` compiles.
`npm run test`: 1967 pass, 1 fail — `tests/lib.billingDiscounts.test.ts` ("pushes
current_period_end forward for free months"), a wall-clock-dependent assertion that reproduces
identically with this work stashed. `npm run test:pwa-contract`: 20/20.

**5a — API.** `GET /api/bingo/cards` takes `date=YYYY-MM-DD` (a LOCAL calendar day) plus
`tzOffsetMinutes` and `includeDates`.
- `resolveLocalDayWindow()` in `app/api/bingo/cards/route.ts` turns the day into a half-open
  `[from, to)` UTC window. `tzOffsetMinutes` follows `Date.getTimezoneOffset()` (minutes to ADD
  to local to reach UTC), the same convention `listSportsBingoGames` already uses — so UTC-4
  sends `240` and local midnight on Sep 6 is `2026-09-06T04:00:00.000Z`.
- A **malformed `date` is a 400**, not an ignored param. Falling back to "every card" would hand
  a past-day view the player's whole history — a data bug wearing a bad request's clothes.
- `listCardRows` gained `startsAtFrom` / `startsAtTo` (`.gte` / `.lt` on `starts_at`), threaded
  through `listUserSportsBingoCards`. Both are spread in conditionally, so a no-date call passes
  the exact same argument object it did before (the existing call-shape assertions still hold).
- New export **`listUserSportsBingoCardDates`** — a single-column (`starts_at`) read over a
  wider 500-row window than the card list, mapped to local day keys. Powers the calendar's
  dots. Returned as `activeDates` **only** when `includeDates=true`, so background polls that
  do not need it do not pay for it.
- `tests/api.bingo.cards.test.ts`: +5 cases (positive offset, negative offset, malformed date,
  no-date call shape, `activeDates` gating). 15/15 pass.

**5b — `components/ui/DateCalendarPopover.tsx`** (new, game-agnostic, ~413 lines).
- Rail: `‹ [📅 Sat, Sep 6 · Today] ›`, then a month sheet with ◀/▶ paging, today ring-inset,
  selected filled sky-300, marked days dotted, future days disabled, "Jump to today" + Close.
- **Every date is a `YYYY-MM-DD` string; no `Date` crosses the prop boundary**, and all
  arithmetic goes through the local-time `Date` constructor. `Date.parse("2026-09-06")` is
  specified as **UTC**, so anything that touched it would land on Sep 5 for every viewer west of
  Greenwich — that is the one bug this component exists to not have. Min/max bounds are plain
  string compares, which is only correct because the format is fixed-width and zero-padded.
- Exports the helpers `formatDateKey`, `toLocalDateKey`, `todayDateKey`, `addDaysToDateKey`;
  `SportsBingoHome` imports the same ones so the client filter and the API window cannot
  disagree about where a day starts.
- No date library added. The sheet reuses the existing global `tp-popup-sheet-up/-down` and
  `tp-fade-in/-out` animations plus `setScrollLock` — the same stack Phase 4's creation sheet
  will use. `role="dialog"`, `aria-modal`, Escape, backdrop-tap, Tab focus trap, focus returned
  to the trigger, 44px (`h-11`) hit targets throughout. Tailwind classes only.
- `tests/components.ui.DateCalendarPopover.test.ts` (new): 10 cases over month/year boundaries,
  a leap day, malformed keys, local-midnight formatting and key ordering.

**5c — wired into Bingo.** `SportsBingoHome` now takes the `initialDate` prop it had always
declared but never destructured (`/bingo/home?date=…` works).
- **A past day is a separate server-side fetch (`historyCards`), not a narrowing of the main
  one.** This is the one structural decision worth knowing: `cards` also feeds the
  unclaimed-points banner, the claim path and the landscape carousel, all of which are
  day-agnostic and must keep seeing everything. Narrowing the primary fetch would have
  quietly broken all three.
- `visibleStackCards = isViewingToday ? portraitStackCards : historyStackCards`. `historyStackCards`
  normalizes a stale `active` row to `lost` the same way `finalizedCards` does, sorts newest
  first, and renders through the same `BingoBoardCard`.
- **DEVIATION from 5c, deliberate and commented in code:** the day filter is applied to settled
  boards but **NOT** to the active partition. Games are only ever offered from today's local
  slate, so an active board *is* today's board — except in the window that matters: a 10pm game
  still live at 12:05am. Filtering active boards by their `startsAt` day would make that live
  board vanish off today's stack at midnight, which is exactly the disappearing-board failure
  decision 1 forbids. Settled boards still sort under the day they were played.
- `todayKey` is state, re-synced on focus, on `visibilitychange` and once a minute, so a page
  left open past midnight stops calling yesterday "Today".
- Claiming mirrors `rewardClaimedAt` into `historyCards` too — a past-day board's Collect button
  is driven by that field and would otherwise stay lit after a successful claim.
- `expandedFinalCard`, `boardActionsRef.open` and `boardActionsRef.claim` all resolve against
  `cards ∪ historyCards`. `open` deliberately does **not** call `selectLandscapeCard` for a
  history board: the landscape carousel only holds cards from the main fetch, and pointing it at
  a card it does not have would silently select index 0.
- `isFirstRun` stays whole-account, not per-day — paging back to an empty day must not
  re-trigger the first-run panel.

**5d — `ViewTabs` retired.** Gone: the `ViewTabs` import (its last user — `GameChrome` still
exports it for other games), `activeTab`/`setActiveTab`, the scored summary tiles
(`scoredWonCount`, `scoredPointsWon`) and the 12-row settled list. All four scope guards:
(i) satisfied before the removal — `BingoBoardCard` already renders settled boards in the stack;
(ii) the unclaimed banner and `claimPoints`/`collectAllBingoPoints` are status-driven and were
not touched; (iii) **now done** — the `initialCardId` deep link selects the board's calendar
*day* (only for a genuinely finished board; a live one stays on today) and scrolls to it via a
`pendingScrollCardId` retry, because selecting another day kicks off the history fetch and the
target does not exist in the DOM on the same tick; (iv) the landscape Active/Scored toggle is
untouched. `formatLocalDateTime` also left the imports with the settled list.

**Also folded in:** the old 4e — the "+ Add a Board" control is hidden entirely when
`!isViewingToday`. A past day's empty state offers "Back to today" instead of "Get a board".

**Not done (Phase 7 owns it):** no device pass. The calendar sheet's height on a small phone,
the rail's fit next to the 44px arrows, and the past-day scroll are all unverified on hardware.
5e (Pick 'Em adopting the popover) was explicitly out of scope and was not started.

### Handoff to Phase 4 (creation sheet — Opus 5, effort high)

- **Phase 4 is now the next phase to build** (sequencing is 1→2→3→5→4→6→7). Its scope was
  rewritten on 2026-09-07: the full-size Add tile is cancelled, and the phase is the slide-up
  Steps 1–3 sheet.
- **`components/ui/DateCalendarPopover.tsx` is a working reference for the exact sheet pattern
  you need**, already in this codebase and already in the Bingo palette: scrim +
  `animate-tp-fade-in`, panel + `animate-tp-popup-sheet-up`, `isClosing` state gated on a
  270ms timer so the exit animation finishes before unmount, `setScrollLock`, Escape, backdrop
  mousedown, Tab trap, focus restored to the trigger. Copy that skeleton rather than
  `PartnerManual`'s — it is closer to the target surface.
- **Three trigger sites to rewire**, all `<Link href="/bingo/select-sport">` today: the first-run
  panel's "Get your first board", the empty-state "Get a board" (now inside the
  `visibleStackCards.length === 0` branch), and the dashed "+ Add a board" at the end of the
  stack. The dashed one has a sibling `hasReachedBoardLimit` branch that must keep pulsing "Max
  4 boards" and must NOT open the sheet.
- **The Add control is already gated on `isViewingToday`** (plan 4f) — keep that gate when it
  becomes a sheet trigger.
- **On success, call `loadCards({ background: true })`**, not a route push. The new board gets
  the `recentlyAddedCardIds` pop for free, which is the "sheet peels back to reveal your board"
  moment the request asked for. If the sheet is open while the player is on a past day, close it
  back onto **today** (`setSelectedDate(todayKey)`) or the new board renders nowhere.
- **Do not mount the sheet in the landscape tree.** `isLandscapeGameView` returns early from a
  separate render path well above the portrait return; the sheet belongs only in the portrait one.
- `SportsBingoHome.tsx` is ~2,626 lines now. Line numbers anywhere in this document are stale —
  grep.

---

## Phase 6 — Declutter sweep

**Model: Opus 5 · Effort: medium.** Judgment work — deciding what to delete is the task.

Against a real device, remove what the stack has made redundant: the standalone "Closest line"
tile if it now duplicates the board header, the `live updates`/`synced` freshness whisper
(`:2596`), leftover `FoldLine` separators from Phase 1, and the three-step "how it works" strip on
first run if the Add tile already explains itself. Target: on a first scroll a player sees a
date, their boards, and one Add tile — nothing else competing. Keep the unclaimed-points banner
(`:2470`); it is an action, not chrome.


---

### Phase 6 — AS BUILT (2026-09-07, Opus 5)

**Status: complete, portrait-only, no landscape diff.** `npx tsc --noEmit` clean, `npm run lint`
clean, `npm run build` compiles. `npm run test`: 1974 pass, 1 fail — `lib.billingDiscounts`
("pushes current_period_end forward for free months"), the same wall-clock assertion that fails
on a clean tree. `npm run test:pwa-contract`: 20/20. Net ~48 lines removed from
`SportsBingoHome.tsx`; no other file touched.

**All four cuts were made from source, not from a device.** CLAUDE.md forbids treating a headless
pass as verification of this surface, and no hardware was available — so every item below is a
*structural* deletion (dead state, duplicate copy) that is correct independent of how it looks.
The one item the plan flagged as needing eyes (item 2) was deliberately **not** cut. Phase 7's
device pass is the first time any of this is seen.

**1 — The realtime-freshness state is gone, along with its 1-second interval.** This was the
highest-value cut and the whole chain turned out to be dead, not just its reader:
- `isRealtimeFresh` / `setIsRealtimeFresh` (the state + its Phase-2 tombstone comment) deleted.
- The `useEffect` that ran `updateFreshness()` on a `window.setInterval(…, 1000)` deleted
  outright. **That interval was re-rendering a ~2,600-line component once per second for a value
  nothing painted.**
- `lastRealtimeMessageAt` / `setLastRealtimeMessageAt` deleted **too** — once the freshness effect
  went, its only reader went with it, and its single writer (the `card_updated` broadcast handler)
  was feeding nothing. The handler still calls `loadCards({ background: true, refreshProgress:
  false })`; only the `setLastRealtimeMessageAt(Date.now())` line was dropped.
- The per-game broadcast channel's `.subscribe((status) => …)` callback existed **only** to set
  `isRealtimeFresh(false)` on `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`, so it is now a bare
  `.subscribe()`. **Realtime behavior is unchanged** — nothing reconnected or retried on those
  statuses before, it only dimmed a label that no longer exists. If a future phase wants
  reconnect-on-error, that is new behavior to design, not something Phase 6 removed.

**2 — The "Closest line" tile is KEPT.** `BingoBoardCard.tsx` (`{isSettled ? "Points" : "Closest
line"}`) does not duplicate the board header: the header is the matchup and status, this is the
progress/result figure (`N to go` / `Every line blocked` / `Bingo!`, or `+points` when settled),
and on a settled board it is also the row the Collect button sits in. The plan said decide it on a
device; without a device the correct call is to leave a functioning element alone. **Phase 7's
device pass should re-examine it and may still delete it** — see the handoff below.

**3 — `FoldLine`: confirmed absent.** `grep` over `components/bingo/` returns nothing. Phase 1's
handoff was right; this bullet needed no work.

**4 — Both first-run explainers deleted.** The three-step `[{n:"1",t:"Pick a game"}, …].map` strip
and the sky "Hold up to 4 boards at once…" card are gone. The first-run panel's own body copy
("Click the button below to create a 5×5 board of player props…, Five in a row wins 100 points")
survives and is now the *only* explanation on the screen, which was the point — three stacked
explanations before the player had done anything.
- **`openCreateBoardSheet` on the first-run panel survives**, as the handoff required. It is
  untouched.
- The 4-board limit is no longer stated up front. That is intentional: it is surfaced at the
  moment it matters, by the Add control's `hasReachedBoardLimit` branch pulsing "Max 4 boards".
- The first-run branch had become a `<>…</>` fragment with one child, so it was collapsed to the
  `<div className="pt-4">` directly and the block re-indented.

**One extra micro-fix, in scope for a declutter sweep:** the first-run eyebrow read
`Sports Bingo · ` — a separator with nothing after it, rendering as "SPORTS BINGO ·". Now just
"Sports Bingo".

**Deliberately NOT cut:**
- The unclaimed-points banner (`unclaimedWonBingoCards.length > 0`) — the plan says keep; it is an
  action.
- "Turn your phone sideways for a better view of your boards." on the first-run panel. It is
  arguably odd advice to someone with no boards yet, but it is the only discoverability hint for
  the landscape view, which is a major surface. **Flagged for the device pass**, not cut blind.
- The expanded-board modal's "How to win" aside. It is behind a tap, not on the first scroll, so it
  is outside the phase's stated target.
- The landscape tree — decision 2 holds, and Phase 7 has an explicit "no landscape diff" check.
  Nothing in this phase's diff is inside `isLandscapeGameView`.

**The portrait first scroll now is, in order:** unclaimed-points banner (only when there are
points), the date rail, the board stack, one Add control. That is the plan's stated target,
reached.

### Handoff to Phase 7 (verification + docs — Sonnet 5, effort medium)

**Phase 7 is the last phase, and its core deliverable — the device pass — is the only thing in
this entire plan that no phase has been able to do.** Phases 1–6 are all "source-clean,
device-unverified". Do not let the green automated gates read as done.

Automated gates, all already run at the end of Phase 6 and all passing (re-run them, they are
cheap):
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean.
- `npm run test` — 1974/1975 excluding skips. **The one failure, `lib.billingDiscounts`, is
  wall-clock and pre-existing**; it reproduces with this whole branch stashed. The plan's earlier
  note about a *second*, rotating failure did not reproduce in Phase 6's run. Re-run any full-suite
  failure in isolation before believing it.
- `npm run test:pwa-contract` — 20/20.
- `npm run test:bingo-mlb` / `test:bingo-nfl` — Phase 3 touched `lib/sportsBingo.ts`, so these
  still apply to the branch even though Phase 6 did not go near it.
- `npm run test:god-mode-join` is **not** implicated by Phase 6 (no join/auth/geofence diff).

Device-pass items, in priority order, with what specifically to look for:
1. **The first-run panel, now that both explainer blocks are gone.** This is Phase 6's only
   *visual* change. On a real phone with an account that has zero boards ever: does the panel
   still fill the screen sensibly, or does it now float in a short page? If it looks thin, the fix
   is to grow the panel, **not** to restore the strips.
2. **"Closest line" (item 2 above) — the one open judgment call.** Look at a stack of 2–4 live
   boards. If the header + `N/25 marked` chip already tell the story and the tile reads as noise,
   delete it in `BingoBoardCard.tsx`; keep the settled-board `Points` branch either way, since the
   Collect button shares that row. Record whichever way you decide here.
3. **"Turn your phone sideways…"** on first run — keep or cut, on sight.
4. Everything the plan's Phase 7 list already names: portrait stack scroll; the Add button at 0/1/4
   boards (the 4-board case must pulse "Max 4 boards" and must not open the sheet — this is now the
   *only* place the limit is communicated); calendar open/select/past-day; the creation sheet's
   slide-up/slide-down and the new board revealed behind it; rotate to landscape mid-stack;
   installed-PWA launch.
5. **Decision 1 check** (a board settling today stays on today's stack with its result and claim
   button, and a deep link still lands on it) and **decision 2 check** (landscape swipe,
   Active/Scored toggle, fullscreen identical to `main`).

Then: record as-built notes here, and add the device items to
`docs/bingo-fullscreen-pwa-device-checklist.md`.

**Two housekeeping items Phase 7 inherits, both needing Andrew, neither safe to do silently:**
- **The `" 2"` duplicate files are still there** and still untracked: `BingoBoardCard 2.tsx`,
  `bingoBoardShared 2.tsx`, `DateCalendarPopover 2.tsx`, `sportsBingoLeagues 2.ts`,
  `DateCalendarPopover.test 2.ts`, `prop-bingo-page-simplification-plan 2.md`, and
  `20260907120000_retire_bingo_inline_ad_slot 2.sql`. They are compiled by `tsc`, linted, and
  walked by the contract tests' `readdirSync` scans. Phase 6 did not edit any file that has a
  `" 2"` twin, so nothing drifted further — but **note that `prop-bingo-page-simplification-plan
  2.md` is now a stale copy of this document**, missing Phases 4, 5 and 6's notes. The `… 2.sql`
  in `supabase/migrations/` is the real hazard. Ask before deleting (CLAUDE.md: existing migration
  files are read-only history).
- **The whole branch is still uncommitted** — Phases 1, 2, 3, 5, 4 and 6 all live in one working
  tree. Phase 1 is independently shippable and could be split out if Andrew wants it landed early.

---

## Phase 7 — Verification and docs

**Model: Sonnet 5 · Effort: medium.**

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- `npm run test` (includes `tests/navigation-controls-contract.test.ts` — Phase 4's creation
  sheet must not introduce a raw `←` or a second Back-like control; its in-sheet step-back is
  not an `ExitBackButton`).
- `npm run test:pwa-contract` — Phase 2 and 6 sit next to `.tp-bingo-landscape-*` CSS, which that
  test guards against leaking into portrait.
- `npm run test:bingo-mlb` / `test:bingo-nfl` if Phase 3d touches `lib/sportsBingo.ts`.
- **Device pass is mandatory and cannot be automated** (CLAUDE.md: headless browsers report
  success on bugs that are still there). On a real phone: portrait stack scroll, the Add button at
  0/1/4 boards, calendar open/select/past-day, the creation sheet's slide-up/slide-down and the
  new board revealed behind it, rotate to landscape mid-stack, installed-PWA launch.
- **Explicit check for decision 1:** with a board settling today, confirm it stays on today's
  stack with its result and claim button — before *and* after the Phase 5d tab removal — and that
  a deep-link to that board still lands on it.
- **Explicit check for decision 2:** landscape swipe, its Active/Scored toggle, and fullscreen
  behave exactly as they do on `main` — Phases 2/4/5/6 should produce no landscape diff.
- Record as-built notes here and add the device items to
  `docs/bingo-fullscreen-pwa-device-checklist.md`.

### Phase 7 — AS BUILT (2026-09-07, Sonnet 5)

**Status: automated gates re-run and green; device pass authored but NOT executed (no hardware
in this environment — CLAUDE.md forbids treating a headless run as verification of this
surface); one hydration bug found and fixed.**

#### Hydration fix — `components/bingo/SportsBingoHome.tsx`

The reported "Hydration failed … server rendered HTML didn't match the client" pointed at the
`actionPopsPortal` (`~:1948`). It was gated on `typeof document !== "undefined"` **alone**, so
the client's first (hydration) render produced an extra `<div class="pointer-events-none fixed
inset-0 z-[2400]">` in `document.body` that the server render (where `document` is undefined)
did not — a textbook server/client branch. `actionPops` starts empty and is only ever filled by
user interaction (`:969`), well after hydration, so the portal's content was empty on that first
render anyway.

**Fix:** added `&& actionPops.length > 0` to the guard, exactly mirroring the
`limitFeedbackPortal` guard immediately below it (`typeof document !== "undefined" &&
(limitPopAnim || limitEchoAnim)`). Server and first client render now both produce `null`; the
portal mounts the first time a pop is queued. No behaviour change — a pop still appears on the
next claim/mark. The landscape portal (`:2276`) was left alone: it lives inside the
`if (isLandscapeGameView)` branch, which is `false` on first render for every viewer, so it
never participates in hydration.

#### Automated gates (all re-run at the end of Phase 7)

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — compiles; `/bingo/home` stays `ƒ` (dynamic), `/bingo/select-sport` stays
  `○` (static).
- `npm run test` — **1974 pass, 1 fail**. The single failure is
  `tests/lib.billingDiscounts.test.ts > "pushes current_period_end forward for free months"`,
  the wall-clock-dependent assertion every prior phase recorded (this run: expected
  `2026-11-30`, received `2026-12-07T16:41:14.949Z` — i.e. the machine clock). Unrelated to
  Bingo; not introduced here. The "rotating second failure" prior phases saw did not reproduce
  this run.
- `npm run test:pwa-contract` — 20/20.
- `npm run test:bingo-mlb` — 142/142. `npm run test:bingo-nfl` — 289/289.
- `npm run test:god-mode-join` — not implicated (no join/auth/geofence diff in Phases 1–7).
- `tests/navigation-controls-contract.test.ts` and `tests/components.bingo.CreateBoardSheet.test.ts`
  both run under `npm run test` and passed — the creation sheet introduces no raw `←` and no
  second Back-like control.

#### Device pass — authored, not run

Added **§8 "Prop Bingo `/bingo/home` simplification"** (19 rows) to
`docs/bingo-fullscreen-pwa-device-checklist.md`, covering: the first-scroll layout (8.1), board
header labels (8.2), the per-board glow/pop isolation that is the top Phase 2 risk (8.3), a
board settling on today's stack and a deep link still landing on it — **decision 1** (8.4–8.5),
the date rail + month calendar (8.6–8.8), the slide-up creation sheet incl. step-3's expanded
preview not being clipped by the sheet panel (8.9–8.12), the 4-board limit as the only place
the cap is now stated (8.13), the two open Phase 6 judgment calls — "Closest line" and the
"turn sideways" hint (8.15–8.16), a standalone-PWA cross-check (8.17), the **decision 2**
landscape no-diff check (8.18), and a console hydration-warning check for this phase's fix
(8.19). **Andrew runs this on a phone; it is the only outstanding work in the plan.**

#### Housekeeping — needs Andrew, not done here

1. **The `" 2"` duplicate files are still present and untracked** — `BingoBoardCard 2.tsx`,
   `bingoBoardShared 2.tsx`, `DateCalendarPopover 2.tsx`, `sportsBingoLeagues 2.ts`,
   `components.ui.DateCalendarPopover.test 2.ts`, `prop-bingo-page-simplification-plan 2.md`,
   and `supabase/migrations/20260907120000_retire_bingo_inline_ad_slot 2.sql`. They compile,
   lint and are walked by the contract tests' `readdirSync` scans — passing today only by
   coincidence. The `… 2.sql` in `supabase/migrations/` is a genuine deploy hazard, and
   CLAUDE.md makes migration files read-only history, so this was **not** touched. Recommend
   deleting all seven (they are stale snapshots, none are referenced) — awaiting Andrew's go.
2. **The whole branch is still uncommitted** — Phases 1–7 live in one working tree. Phase 1
   (inline-ad removal + its migration) is independently shippable and could be split out.

**Not committed** — working tree only, alongside Phases 1–6.

---

## Phase 8 — Swipe transitions between creation steps (Steps 1 → 2 → 3)

**Model: Sonnet 5 · Effort: medium.** Added 2026-09-07 (Andrew). A contained enhancement to
Phase 4's `CreateBoardSheet` with a known reference implementation — not a rewrite. Everything
Phases 1–7 built is untouched.

**Goal:** inside the creation sheet, moving league → game → board (and back) should feel like
progressing through a process — the new step slides in from the right, the old one slides out to
the left; the header Back button reverses it. This is the **same swipe** the sign-in flow uses
between the username step and the PIN step.

### Findings that shape this phase

| Fact | Where | Consequence |
|---|---|---|
| The swipe already exists as house machinery. `framer-motion` `AnimatePresence mode="wait"` + `motion.div`, `ONBOARDING_PANEL_VARIANTS` (`enter`/`center`/`exit` keyed on `direction: 1 \| -1`), `SWIPE_SPRING_TRANSITION` (tween, **220ms**, ease `[0.4, 0, 0.2, 1]`), a `panelDirection` state set to `1` before every forward move and `-1` before a back move, passed as `custom` to both `AnimatePresence` and each panel, and `useReducedMotion()` collapsing the transition to `{ duration: 0 }`. | `components/join/JoinFlow.tsx:305` (variants), `:320` (transition), `:799` (`panelDirection`), `:1568`/`:1591` (`setPanelDirection` around `transitionToPinStep`) | Phase 8 reuses this verbatim. No new keyframes, no new library — `framer-motion` is already a dependency (JoinFlow imports it). |
| Phase 4's "no motion library / no new keyframes" note is about the sheet's **vertical** slide-up (`tp-popup-sheet-up`), which stays CSS. | `CreateBoardSheet.tsx:19–24` | The step-to-step **horizontal** swipe is a different animation; using `framer-motion` for it does not contradict that note. Say so in the code comment so a future reader doesn't "fix" a non-conflict. |
| `CreateBoardSheet` already owns the step state the swipe needs. | `CreateBoardSheet.tsx:70` (`step`), `:134`/`:139`/`:145` (forward handlers), `:153` (`handleStepBack`) | Only a `direction` value is missing. |
| The step body is a bare ternary inside the scroll region. | `CreateBoardSheet.tsx:226–234` | That is the node to wrap in `AnimatePresence` + a keyed `motion.div`. |

### Sub-steps

8a. **Share the swipe vocabulary, don't fork it.** Lift `ONBOARDING_PANEL_VARIANTS` and
`SWIPE_SPRING_TRANSITION` out of `JoinFlow.tsx` into a client-safe `lib/swipeTransition.ts`
(plain objects, **no** `server-only`), renamed host-neutral (`SWIPE_PANEL_VARIANTS`,
`SWIPE_TWEEN`), and import them in both `JoinFlow` and `CreateBoardSheet` so the two swipes stay
byte-identical. Lighter fallback if touching `JoinFlow` is unwanted: copy the two constants into
`CreateBoardSheet` with a `// keep in sync with JoinFlow.tsx` pointer (the same call made for
`toMascotDisplayName` in Phase 3) — but extraction is preferred here since it is literally the
same effect in two places.

8b. **Add `stepDirection` to `CreateBoardSheet`.** `useState<1 | -1>(1)`. Set `1` at the top of
`handleSelectSport`, `handleSelectGame` and `handleCreated`; set `-1` at the top of
`handleStepBack`. Event-handler writes only — no effect (the `react-hooks/set-state-in-effect`
rule that bit Phase 4 does not apply to handlers).

8c. **Wrap the step body.** In the `:226` scroll container, replace the bare ternary with
`<AnimatePresence mode="wait" custom={stepDirection} initial={false}>` whose single child is a
`motion.div` keyed on `step`, `custom={stepDirection}`, `variants={SWIPE_PANEL_VARIANTS}`,
`initial="enter" animate="center" exit="exit"`,
`transition={reducedMotion ? { duration: 0 } : SWIPE_TWEEN}`.
- `mode="wait"` (as `JoinFlow` uses) — the outgoing step fully leaves before the next mounts, so
  no absolute positioning and no height animation. This matters: the three steps' heights differ
  a lot (league list vs. board preview) and `mode="wait"` sidesteps the whole problem.
- `initial={false}` is **required** — step 1 must not swipe in horizontally while the whole sheet
  is still sliding up vertically on first open. `JoinFlow`'s inner welcome-slide `AnimatePresence`
  uses `initial={false}` for exactly this.
- Add `overflow-x-clip` to the animating wrapper (verify it does not regress the existing
  `overflow-y-auto overscroll-contain` scroll) so the off-screen panel at `x: ±100%` cannot
  widen the sheet during the 220ms.

8d. **`useReducedMotion()`** from `framer-motion`, mirroring `JoinFlow`. This is a second
reduced-motion path alongside the sheet's existing `resolveExitMs()` — both must stay.

8e. **Focus after a swipe.** Leave focus management as-is. Focus lives on the dialog wrapper
(`dialogRef.current?.focus()` at mount) and the Tab trap re-queries `dialogRef` each keystroke,
so a mid-swipe moment with the panel briefly unmounted is harmless (`JoinFlow` has the same).
Do **not** auto-focus the first control of the new step — Phase 4 already established a screen
reader would announce it as pre-selected. Just confirm the header Back/Close buttons stay
reachable throughout the transition.

8f. **Landscape / PWA — no new exposure.** The sheet is already portrait-only (mounted after the
`isLandscapeGameView` return) and `framer-motion` adds no route or manifest surface. Nothing in
the PWA contract or `proxy.ts` is touched.

8g. **Tests.** `tests/components.bingo.CreateBoardSheet.test.ts` asserts "advances 1 → 2 in
place." `AnimatePresence mode="wait"` defers the next panel's mount until the exit animation
resolves, so the test must make that resolve instantly: it already stubs `matchMedia` — have the
stub return `matches: true` for `prefers-reduced-motion: reduce` so `SWIPE_TWEEN` collapses to
`{ duration: 0 }` and the swap is effectively synchronous (this also matches how the `JoinFlow`
tests handle the same component). Fallback: `await` a tick / use `findBy*` for step-2 content.
`tests/navigation-controls-contract.test.ts` is unaffected — no raw `←` is introduced and the
chevron button is unchanged.

**Done when:** moving sport → game → board slides the new step in from the right and the old one
out to the left; the header Back button slides them the other way; opening the sheet shows step 1
with only the sheet's vertical slide-up (no horizontal slide); `prefers-reduced-motion` swaps
instantly; and `npm run test` (incl. the two contract tests above) passes. Device check folds
into Phase 7 §8.9–8.12 on `docs/bingo-fullscreen-pwa-device-checklist.md`.

### Phase 8 — AS BUILT (2026-09-07, Sonnet 5)

**Status: complete.** `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` compiles
(`✓ Compiled successfully`; `/bingo/home` stays `ƒ`). Targeted tests green:
`tests/components.bingo.CreateBoardSheet.test.ts` 7/7,
`tests/navigation-controls-contract.test.ts` 7/7, `tests/pwa-contract.test.ts` 20/20,
`tests/god-mode-join-contract.test.ts` 6/6. Full `npm run test` not swept — prior phases already
characterized its wall-clock/statistical flakes and this phase touches none of that surface.

#### New file — `lib/swipeTransition.ts` (8a)

Client-safe (no `server-only`), plain objects. Exports `SWIPE_PANEL_VARIANTS` (`framer-motion`
`Variants`: `enter`/`center`/`exit` keyed on `direction: 1 | -1`) and `SWIPE_TWEEN`
(`Transition`: tween, 220ms, ease `[0.4, 0, 0.2, 1]` — the 4-tuple cast is kept, a bare
`number[]` does not narrow to `BezierDefinition`). Lifted **verbatim** out of `JoinFlow.tsx`.

#### `components/join/JoinFlow.tsx` (8a)

The two module-level consts are gone; `import { SWIPE_PANEL_VARIANTS, SWIPE_TWEEN } from
"@/lib/swipeTransition";` added, then `const ONBOARDING_PANEL_VARIANTS = SWIPE_PANEL_VARIANTS;` /
`const SWIPE_SPRING_TRANSITION = SWIPE_TWEEN;` kept as local aliases so the ~10 call sites and
the welcome-carousel machinery are untouched. Zero behaviour change — the sign-in swipe is the
same object it always was.

#### `components/bingo/CreateBoardSheet.tsx` (8b–8f)

- **8b.** New `stepDirection` state (`useState<1 | -1>(1)`). `setStepDirection(1)` at the top of
  `handleSelectSport` / `handleSelectGame`; `setStepDirection(-1)` at the top of `handleStepBack`.
  Not added to `handleCreated` — it changes no step (the sheet just closes), so a swipe there
  would be dead code. Handler writes only, no effect.
- **8c.** The step ternary in the `:226` scroll region is now wrapped in
  `<AnimatePresence mode="wait" custom={stepDirection} initial={false}>` → a single
  `motion.div key={step}` with `custom={stepDirection}`, `variants={SWIPE_PANEL_VARIANTS}`,
  `initial="enter" animate="center" exit="exit"`,
  `transition={reducedMotion ? { duration: 0 } : SWIPE_TWEEN}`, `className="w-full"`. The scroll
  container gained `overflow-x-clip` alongside its existing `overflow-y-auto overscroll-contain`.
- **8d.** `const reducedMotion = useReducedMotion();` from `framer-motion`. Second reduced-motion
  path alongside the sheet's existing `resolveExitMs()` — both stay.
- **8e.** Focus management untouched (dialog wrapper holds focus, Tab trap re-queries each
  keystroke). No auto-focus of the new step's first control.
- **8f.** Sheet is still mounted only in `SportsBingoHome`'s portrait return; `framer-motion`
  adds no route/manifest surface. `proxy.ts` and the PWA contract untouched.
- The header comment block was extended to say the horizontal step swipe deliberately uses
  `framer-motion` and why that does not contradict the "no motion library" note above it (that
  note is about the CSS `tp-popup-sheet-up` slide-up).

#### 8g — tests

**No test change needed.** `tests/components.bingo.CreateBoardSheet.test.ts` already stubs
`matchMedia` to return `{ matches: true }`, so `useReducedMotion()` reads `true`, `SWIPE_TWEEN`
collapses to `{ duration: 0 }`, and `AnimatePresence mode="wait"` resolves the step swap on the
next tick — the existing `findByText("Step 2 of 3")` / `findByText("Step 1 of 3")` retries cover
it. `framer-motion` logs one `Reduced Motion enabled` notice to stderr under the stub; harmless.

#### Not done (Phase 7 owns it)

- **No device pass.** The swipe direction (forward vs. back), its feel against the sheet's
  vertical slide-up on first open, and no horizontal-scroll bleed during the 220ms are all
  unverified on hardware — folded into `docs/bingo-fullscreen-pwa-device-checklist.md` §8.9–8.12.

**Not committed** — working tree only, alongside Phases 1–7.

---

## Sequencing

**1 → 2 → 3 → 5 → 4 → 6 → 7.** Phase 4 and Phase 5 swapped: Phase 4's original scope (the
full-size Add tile) was cancelled on 2026-09-07 and its replacement (the slide-up creation
sheet) was written after Phase 5 had already been executed.

**Status as of 2026-09-07: Phases 1–7 are all built (working tree, uncommitted).** Phase 7's
automated gates are re-run and green, and it fixed one hydration bug (the `actionPops` portal —
see Phase 7 AS BUILT). The **only** outstanding work is the on-device pass — authored as §8 of
`docs/bingo-fullscreen-pwa-device-checklist.md`, to be run by Andrew on a phone — plus two
housekeeping decisions that need Andrew (the `" 2"` duplicate files, and committing the branch).

Phase 1 is independent and shippable on its own. Phase 3a–3b (the shared league catalog) is also
independent and can run in parallel with Phase 2. Phases 2, 5, 4 and 6 all rewrite the same
render block and must stay in that order.

**Phase 8 (swipe transitions between creation steps) — built 2026-09-07 (working tree,
uncommitted).** Self-contained on top of Phase 4's `CreateBoardSheet`; shares the sign-in swipe
via the new `lib/swipeTransition.ts`. Automated gates green; its device check is folded into
Phase 7 §8.9–8.12 on `docs/bingo-fullscreen-pwa-device-checklist.md`.
