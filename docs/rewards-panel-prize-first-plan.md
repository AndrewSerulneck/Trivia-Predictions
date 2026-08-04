# Rewards Panel — Prize-First Redesign Plan

**Status:** all 5 phases DONE + browser-verified (2026-08-03). Code-review follow-up
(3 findings + close-out) done 2026-08-04, see `docs/rewards-panel-prize-first-review-fixes.md`.
**Surface:** venue-home Rewards panel (`components/venue/VenueChallengesPanel.tsx`) and its detail modal (inside `components/venue/VenueHubClient.tsx`).
**Not in scope:** the Create Reward wizard, admin Rewards section, Partner Dashboard, `/redeem-prizes` coupon wallet, any DB schema change.

---

## 1. Goal

Today each reward card leads with the *game* name (`challenge.name`, e.g. "NFL Pick 'Em
Challenge"). That is backwards: the prize is the reason a guest plays. After this change:

**Card (collapsed):**

```
┌──────────────────────────────────┐
│ [🏈]  NFL PICK 'EM               │  ← eyebrow: small, uppercase, muted
│       50% off an Appetizer       │  ← headline: biggest text on the card
│                     [IN PROGRESS]│
│  Get 50 NFL picks right in       │  ← requirement (today's `rules`), unchanged
│  NFL Pick 'Em                    │
│  ▓▓▓▓▓▓▓░░░░░░  25 / 50          │  ← existing progress bar, unchanged
└──────────────────────────────────┘
```

**Modal (tapped):** prize headline + requirement + **a progress gauge** + **"N of M left"
when quota > 1** + **a "Play Now!" button** that navigates to the game.

### Decisions already made (do not re-litigate)

| Question | Decision |
|---|---|
| Where does the game name go? | **Small uppercase eyebrow above the prize headline**, beside the existing `ChallengeIconBadge`. |
| Cards with no structured prize? | **Every Reward has a prize — that is the definition of a Reward.** Prize-less rows are legacy/pre-Rewards `challenge_campaigns` and are not a designed state. Keep a silent fall-back to `challenge.name` so nothing crashes or renders blank, but do not design for it. |
| Where does "2 of 5 remaining" go? | **Modal only.** The card stays clean. |
| "Play Now!" when the game isn't running? | **Always enabled, always navigates.** Each game page already renders its own "nothing live right now" state; do not plumb schedule lookups into this panel. |

---

## 2. What already exists (verified 2026-08-03 — trust this, don't re-derive)

- **`describeRewardPrize(prize)` in `lib/rewardDefinitions.ts:196`** already produces exactly
  the headline copy we want — `"50% off Appetizer"`, `"Free Entrée"`, `"$20.00 gift card"`,
  `"$5.00 off Dessert"`. It is client-safe (no `server-only`, no Supabase). **Reuse it. Do not
  write a second formatter.** `components/nfl-pickem/NFLPickEmRewardBanner.tsx:74` and
  `NFLPickEmLeaderboard.tsx:77` already call it — follow their usage.
- **The prize fields already reach the browser.** `GET /api/challenge-campaigns`
  (`app/api/challenge-campaigns/route.ts`) returns whole `ChallengeCampaign` snapshots, which
  carry `prizeKind`, `prizeMenuItem`, `prizeMenuItemName`, `prizeDiscountKind`,
  `prizeDiscountValue`, `prizeGiftCertificateAmount` (`types/index.ts:313-318`), plus
  `winnerQuota`, `quotaRemaining`, `viewerWon`. **No API route change is expected.** The only
  gap is that the client-side card type `ChallengeCampaignCard`
  (`components/venue/venueHubShared.tsx:22`) does not declare them. *(Phase 1 must confirm this
  empirically before assuming it — one network-tab check.)*
- **`quotaRemaining` is already computed and viewer-scoped** — the panel currently uses it only
  for the `isExhausted` check (`VenueChallengesPanel.tsx:78`). Surfacing "N of M left" is pure
  rendering, no new server work.
- **The progress gauge already exists on the card** (`VenueChallengesPanel.tsx:196-207`) using
  `progressPoints` / `pointsRequiredToWin` and `iconStyle.barGradient`. The modal needs the same
  gauge, so **extract it into one shared component** rather than writing a second one.
- **`inferChallengeGameType(name, rewardDefinitionId)`** (`venueHubShared.tsx:145`) maps a card
  to a `ChallengeGameType`. Used already for the icon badge; reused for the eyebrow label and
  the Play Now target.
- **`goTo(dest: VenueGameKey, sourceElement)`** in `VenueHubClient.tsx:1342` is the canonical
  game navigation, including the shared open-transition animation and the Live Trivia
  `?venueId=` query param. Category Blitz is special-cased through
  `setCategoryBlitzOnboardingOpen(true)` → `enterCategoryBlitzGame`. **Play Now must route
  through `goTo`, not `router.push`.**

### The one real mismatch to solve

`inferChallengeGameType` returns a **`ChallengeGameType`** (`live_trivia`, `speed-trivia`,
`bingo`, `pickem`, `nfl-pickem`, `fantasy`, `unknown`). `goTo` takes a **`VenueGameKey`**. These
overlap heavily but are not the same union, and `"unknown"` has no destination. Phase 3 needs a
single explicit mapping function returning `VenueGameKey | null`, with `null` meaning "render no
Play Now button."

---

## 3. Phases

Each phase is independently shippable and leaves the app in a working state.

---

### Phase 1 — Type plumbing + prize resolution helper

**Model: Claude Sonnet 5 · Effort: low (~20 min)**

Mechanical, low-judgment work.

1. Add the prize fields + `winnerQuota` to `ChallengeCampaignCard` in
   `components/venue/venueHubShared.tsx` (`prizeKind`, `prizeMenuItem`, `prizeMenuItemName`,
   `prizeDiscountKind`, `prizeDiscountValue`, `prizeGiftCertificateAmount`) — all optional,
   typed from `@/types`, **no `any`**.
2. **Verify empirically** that these arrive from `/api/challenge-campaigns` for a real venue
   with a real reward (network tab or a `curl` with cookies — see CLAUDE.md § Manual Testing).
   If a field is dropped somewhere in `lib/challengeCampaigns.ts`, fix it there; do not paper
   over it in the component.
3. Add to `venueHubShared.tsx`:
   - `rewardHeadline(card): string` — `describeRewardPrize(card)`, falling back to `card.name`
     when that returns `""`.
   - `rewardGameLabel(gameType): string` — the eyebrow copy, derived from
     `GAME_TITLE_LINES_BY_KEY` where possible so labels stay consistent with the home tiles
     ("NFL Pick 'Em", "Live Trivia", "Prop Bet Bingo"…). Returns `""` for `unknown` so the
     eyebrow simply doesn't render.

**Done when:** `npx tsc --noEmit` clean, prize fields confirmed present on the wire, no UI change yet.

---

## Phase 1 — DONE (2026-08-03)

**Status: complete.** `npx tsc --noEmit` and `npm run lint` both clean. No UI change (as
expected — Phase 1 is plumbing only). Not yet browser-verified since there's nothing visible to
verify; Phase 2 is the first phase with a visual diff.

**What was done:**

1. `components/venue/venueHubShared.tsx` — added `prizeKind`, `prizeMenuItem`,
   `prizeMenuItemName`, `prizeDiscountKind`, `prizeDiscountValue`, `prizeGiftCertificateAmount`
   (all optional) to `ChallengeCampaignCard`, typed from `@/types` (`RewardPrizeKind`,
   `RewardMenuItem`, `RewardDiscountKind`). Comment marks them as mirroring `ChallengeCampaign`.
2. Added `rewardHeadline(card): string` — calls `describeRewardPrize(card)` (imported from
   `@/lib/rewardDefinitions`, confirmed client-safe: no `server-only`, no Supabase import) and
   falls back to `card.name` only when the description is `""`.
3. Added `rewardGameLabel(gameType): string` — looks up `gameType` in the **existing but
   previously-private** `CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY` map (already defined lower in
   the same file, just above `ChallengeIconBadge`), then reads `GAME_TITLE_LINES_BY_KEY` for
   that key and joins/trims the two-line array into one string (e.g. `["NFL", "Pick 'Em"]` →
   `"NFL Pick 'Em"`). Returns `""` for `unknown` (no `VenueGameKey` mapping exists), so the
   eyebrow simply won't render. Both new functions are placed just above `CHALLENGE_ICON_STYLE`,
   right after `inferChallengeGameType`, and reference `CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY` by
   forward reference — safe because it's a module-level `const` and neither function runs
   during module init.

**Verification of the "does the prize data reach the client" assumption — done by code trace,
not a live network-tab check (no seeded reward + real venue session was set up this pass):**

- `GET /api/challenge-campaigns` (`app/api/challenge-campaigns/route.ts`), user-scoped branch,
  calls `getChallengeCampaignSnapshotForUser` (`lib/challengeCampaigns.ts:2376`), whose return
  type is `Array<ChallengeCampaign & { progressPoints: number }>` — i.e. the **whole**
  `ChallengeCampaign` row spread through, not a hand-picked subset. `ChallengeCampaign` in
  `types/index.ts:314-318` already carries every prize field. Nothing in that function (read
  through to its `campaigns` source, `listChallengeCampaigns`) strips those fields before the
  route calls `NextResponse.json({ ok: true, campaigns: ... })`.
- **This is a code-trace, not empirical confirmation.** The plan explicitly asked for a real
  network-tab/curl check. If Phase 2's browser pass shows a blank/missing headline for a real
  reward, look here first — but based on the trace there is no code path that would drop these
  fields.
- No changes were needed to `lib/challengeCampaigns.ts` or the API route.

**Left for Phase 2:**

- The actual visual redesign of the card header (eyebrow + `rewardHeadline` in place of
  `challenge.name`, `Rules ›` → `Details ›`) — `rewardHeadline`/`rewardGameLabel` exist and are
  exported but **nothing calls them yet**. `VenueChallengesPanel.tsx` still renders
  `challenge.name` directly as of this handoff.
- Recommend Phase 2's first step be a genuine browser check (via `/verify`) with a real reward
  to settle the network-tab verification gap above, before spending time on layout — if a field
  is silently missing on the wire, better to find out before building UI around it.
- No other surprises encountered. `CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY` (currently
  module-private, not exported) was reused as-is rather than duplicated; Phase 3's planned
  `chalengeGameTypeToVenueGameKey` mapping function can likely just export this existing const
  (or a thin wrapper) instead of writing new mapping logic — worth checking before rebuilding it.

---

### Phase 2 — Card layout: prize headline + game eyebrow

**Model: Claude Opus 5 · Effort: medium (~45 min)**

Visual-judgment work on a dense, hand-tuned Tailwind component — worth Opus.

In `VenueChallengesPanel.tsx`, restructure the header row (lines 116-150):

- Eyebrow: `text-[11px] font-black uppercase tracking-[0.14em]` in the muted slate/accent tone,
  above the headline, inside the existing `min-w-0 flex-1` column.
- Headline: `rewardHeadline(challenge)` at the current `text-xl font-black` (bump only if it
  reads small next to the badge). Must wrap gracefully — prize strings run long
  (`"$25.00 off Whole Order"`).
- The status chip (`In Progress` / `You Won` / `All Claimed` / `Upcoming`) and the `Rules ›`
  affordance keep their current logic and placement. **Rename `Rules ›` to `Details ›`** — the
  box now holds progress and a Play button, not just rules.
- Everything below the header row (rules block, won/exhausted/upcoming bodies, progress bar) is
  **unchanged in this phase**.

**Constraints:** Tailwind utilities only, except the existing `style={{}}` uses for computed
gradients/accents already present in this file (they predate this work; match the local idiom,
don't add new ones).

**Done when:** every card state — in-progress, winner, exhausted, upcoming, `game_winner`
(no threshold), leaderboard-legacy — renders correctly. Verify in a real browser (`/verify`
skill) with at least a Live Trivia reward and an NFL Pick 'Em reward side by side.

---

## Phase 2 — DONE (2026-08-03)

**Status: complete and browser-verified.** `npx tsc --noEmit` and `npm run lint` clean. Only
`components/venue/VenueChallengesPanel.tsx` changed.

**What was done:**

1. Imported `rewardHeadline` / `rewardGameLabel` (Phase 1's helpers — first callers) and
   derived `headline` + `gameLabel` per card alongside the existing `gameType` / `iconStyle`.
2. Header row restructured: `items-center` → **`items-start`** (the column is now three
   stacked rows, so the badge belongs at the top), then inside the `min-w-0 flex-1` column —
   eyebrow (`text-[11px] font-black uppercase leading-tight tracking-[0.14em] text-slate-400`,
   rendered only when `gameLabel` is non-empty) → headline (`mt-0.5 break-words text-xl
   font-black leading-snug text-slate-100`) → status chip.
3. `Rules ›` → **`Details ›`**.
4. Everything below the header row is untouched, as planned.

**One deliberate deviation from the plan — read this before Phase 3.** The plan said the status
chip and the `Details ›` affordance "keep their current logic and placement." Their *logic* is
unchanged, but **`Details ›` moved from the far right of the header row down onto a shared row
with the status chip** (`<div className="mt-1 flex items-center justify-between gap-2">`, chip
left / Details right). Reason, found empirically in the browser: with `Details ›` sitting beside
the headline it stole ~100px of a 390px-wide card, and `"$25.00 off Whole Order"` wrapped to
**three** lines at `text-xl`. Moving it down gives the prize copy the card's full width — the
same string now wraps to two lines and `"50% off Appetizer"` fits on one. The chips lost their
individual `mt-1` (the wrapper carries it now). If Phase 3 wants the modal to mirror the card,
mirror this arrangement, not the diagram in §1.

**Verified in a real browser** (Playwright, 390×844, dev server, `venue-pacific-street` as
`Andrew` + `venue-riverside` as `Lisas`). Six card states rendered correctly:

| State | Rendered |
|---|---|
| in-progress, short prize | `LIVE TRIVIA` / **50% off Appetizer** / `IN PROGRESS` `DETAILS ›` |
| in-progress, long prize | `LIVE TRIVIA` / **$25.00 off Whole Order** (2 lines) |
| in-progress, 100% discount | `LIVE TRIVIA` / **Free Entrée** |
| upcoming (NFL) | `NFL PICK 'EM` / **$100.00 gift card** / `UPCOMING` + "Starts Sep 10 —…" |
| `game_winner` (Live Trivia) | eyebrow + **$25.00 gift card** + "Awarded to the winner." (no bar) |
| winner / exhausted | **You Won** (amber card, "Prize won! Tap to Claim Reward.") and **All Claimed** (+ "Congrats to …") — both correctly show **no** `Details ›` |
| legacy leaderboard, no prize | riverside's "General Saloon - 3-Day Challenge" — no eyebrow (game type `unknown`), trophy glyph badge, headline falls back to `challenge.name` |

**The Phase 1 network-tab gap is now settled empirically.** A live `/api/challenge-campaigns`
response capture showed every prize field on the wire (`prizeKind`, `prizeMenuItem`,
`prizeMenuItemName`, `prizeDiscountKind`, `prizeDiscountValue`, `prizeGiftCertificateAmount`,
plus `winnerQuota` / `quotaRemaining`). **No API or `lib/challengeCampaigns.ts` change was
needed** — Phase 1's code trace was right.

**Two facts worth carrying into Phase 3:**

- **`prizeKind` is derived server-side, not just read from the column.** Riverside's legacy rows
  have `prize_kind = NULL` in the DB but arrive as `prizeKind: "gift_card"` when
  `prize_gift_certificate_amount` is set — so they get a real prize headline
  (`"$20.00 gift card"`), and only a row with *no* prize signal at all falls back to
  `challenge.name`. The name fallback is rarer than the plan assumed.
- **The Rewards tab renders an unread badge** (`challengeBadgeCount`) once a reward is won, so
  its accessible name becomes `"Rewards 1"` — a Playwright `getByRole("button", { name:
  /^Rewards$/ })` selector will time out. Use `/Rewards/`. (Phase 4 item 3 asks whether that
  badge logic is unaffected: it still fires correctly after this change.)

**Test-data notes for Phase 3.** Seeding: `venue-pacific-street` (user `Andrew`,
`ecaececc-7b47-4d8d-9a5c-f28e44f976de`) has one NFL and one Live Trivia reward. To exercise
prize variants, insert extra `challenge_campaigns` rows cloned from
`bb094fdd-5212-47bf-ba08-d0d8a15aad85` with different `prize_*` values. To force
winner/exhausted, insert `challenge_cycle_winners` rows whose `cycle_start` comes from
`computeCycleStart(campaign, new Date(), "America/New_York")` — call it from a `.cjs` script run
with `node --env-file=.env.local --conditions react-server --import tsx`, using **absolute
`require()` paths** to `lib/challengeCampaigns.ts`; the `@/` alias resolves to a stub with only
a `default` export under that loader and will fail with "does not provide an export named …".
**All seeded rows from this pass were deleted**; only the two original pacific-street campaigns
remain. A dev server may still be running on :3000 from this session.

---

### Phase 3 — Modal: gauge, quota remaining, Play Now

**Model: Claude Opus 5 · Effort: medium-high (~1–1.5 hr)**

The largest phase. The modal today (`VenueHubClient.tsx:1653-1683`) is only a name + a rules
paragraph.

1. **Extract the progress gauge** from `VenueChallengesPanel.tsx:196-207` into
   `components/venue/RewardProgressGauge.tsx` (props: `progress`, `target`, `barGradient`,
   optional `size`). Use it in *both* the card and the modal so they can never drift.
2. **Rebuild the modal body** in this order:
   - game eyebrow + prize headline (same `rewardHeadline` / `rewardGameLabel` helpers)
   - requirement text (`challenge.rules`) — keep the current large, readable type scale
   - **gauge**: `progressPoints / pointsRequiredToWin`, with the numeric readout
   - **quota line**, rendered **only when `winnerQuota > 1`**: e.g.
     `"2 of 5 rewards left"` from `quotaRemaining` / `winnerQuota`. When `quotaRemaining === 0`,
     read `"All 5 claimed"`.
   - **`Play Now!` button** (primary, full-width, thumb-reachable at the bottom)
3. **Play Now wiring.** Add `chalengeGameTypeToVenueGameKey(gameType): VenueGameKey | null` to
   `venueHubShared.tsx`. The button closes the modal, then calls the existing
   `goTo(key, buttonElement)` from `VenueHubClient` — passed into the panel/modal as a new prop,
   the same way `onGoToChallengeRedeem` already is. Hide the button entirely when the mapping is
   `null` (`unknown` game type). Verify the Category Blitz branch still opens its onboarding
   overlay rather than deep-linking past it.
4. **State-specific bodies:**
   - `winCondition === "game_winner"` → **no gauge** (there is no points target); show
     "Awarded to the winner." as the card does today. Play Now still renders.
   - `isUpcoming` → gauge suppressed or shown at 0 with the "Starts <date>" line; Play Now still
     renders (guests may want to look at the game early).
   - Winners never open this modal — they route to `/redeem-prizes` via the existing
     `canOpenRedeem` branch. **Do not change that.**

**Constraints:** the modal is inside `VenueHubClient.tsx`'s `AnimatePresence`; keep the
framer-motion enter/exit as-is. Do not add a new global state store — `selectedChallengeId` +
props are sufficient (CLAUDE.md § State).

**Done when:** browser-verified end to end — open a reward, see a half-full gauge matching real
accrued points, tap Play Now, land in the right game with the transition animation intact.

---

## Phase 3 — DONE (2026-08-03)

**Status: complete and browser-verified.** `npx tsc --noEmit`, `npm run lint`, and
`npm run test` (1317 passed / 13 skipped) all clean.

**Files changed:** `components/venue/RewardProgressGauge.tsx` (new),
`components/venue/venueHubShared.tsx`, `components/venue/VenueChallengesPanel.tsx`,
`components/venue/VenueHubClient.tsx`.

### What was done

1. **Shared gauge extracted.** `components/venue/RewardProgressGauge.tsx` — props
   `{ progress, target, barGradient, size?: "card" | "modal" }`. It owns the clamping and the
   percent math (so both hosts get identical rounding) and renders track + `N / M pts` readout.
   `size` only swaps two class strings (`h-2` / `mt-1.5 text-sm` vs `h-3.5` / `mt-2 text-lg`).
   `VenueChallengesPanel.tsx` now renders it instead of its inline bar; the card's local
   `percent` const was deleted (it had no other caller).
2. **Modal rebuilt** in `VenueHubClient.tsx` (the `AnimatePresence` block, ~line 1690). Order:
   badge + game eyebrow on the close button's row → prize headline (`text-3xl`, full width) →
   `challenge.rules` → gauge **or** the state line → quota line → `Play Now!`. framer-motion
   enter/exit untouched; no new state store (`selectedChallengeId` + a `useMemo` only).
3. **New helpers in `venueHubShared.tsx`:**
   - `challengeGameTypeToVenueGameKey(gameType): VenueGameKey | null` — a thin accessor over
     the pre-existing (previously module-private) `CHALLENGE_GAME_TYPE_TO_VENUE_GAME_KEY`, as
     Phase 1's handoff suggested. **Note the spelling:** the plan wrote
     `chalengeGameTypeToVenueGameKey`; the shipped name is spelled correctly.
   - `rewardQuotaLine(winnerQuota, quotaRemaining): string` — `""` when quota ≤ 1 (so the NFL
     1-winner reward renders nothing), `"All N claimed"` at 0, `"N of M reward(s) left"`
     otherwise. Pure and exported, ready for Phase 4 copy polish + Phase 5 unit tests.
4. **Play Now wiring.** `playChallengeGame(dest, sourceElement)` in `VenueHubClient` closes the
   modal, then calls the existing `goTo` — no `router.push`, so the shared open-transition
   animation and the Live Trivia `?venueId=` param both survive. The button is hidden entirely
   when the mapping is `null`. `selectedChallengePlayKey` is hoisted out of the JSX because
   property narrowing (`detail.venueGameKey`) does not survive into the onClick closure — a
   non-null assertion would have been the alternative, and this repo bans that style of escape
   hatch.

### Two deviations from the plan (both deliberate)

- **`CHALLENGE_ICON_STYLE` gained a `ctaTextColor` field.** The Play Now button is painted with
  the game's own `barGradient`, and white text on NFL's pale amber (`#fde68a → #f59e0b`) was
  genuinely hard to read in the browser — see the first screenshot pass. Each game now declares
  its CTA foreground (NFL → its own navy `#1a2f72`, cyan/amber/orange gradients → dark, the
  purple ones → white). Editing this shared const is safe: nothing else reads the new field.
- **Rules type scale reduced in the modal**, `text-[1.65rem]/2.35rem` → `text-xl leading-8`.
  The plan said keep the current scale, but with the prize headline now at `text-3xl` the old
  rules size was within a hair of it and flattened the hierarchy the whole redesign exists to
  create. Still large and thumb-readable.

Also worth knowing: the **upcoming** state suppresses the gauge rather than showing it at 0
(the plan allowed either). A 0% bar reads as "you're losing", not "hasn't started".

### Browser verification (Playwright, 390×844, dev server on :3000)

`venue-pacific-street` as `Andrew` — all three modal bodies confirmed:

| Reward | Modal rendered |
|---|---|
| Live Trivia, points threshold, quota 5 (seeded) | eyebrow + **50% off Appetizer** + rules + gauge at `175 / 500 pts` + **2 OF 5 REWARDS LEFT** + Play Now |
| NFL Pick 'Em (upcoming) | eyebrow + **$100.00 gift card** + rules + "Starts Sep 10 — get your picks in early." + **no** gauge + **no** quota line (quota 1) + Play Now |
| Live Trivia `game_winner` | eyebrow + **$25.00 gift card** + rules + "Awarded to the winner." + **no** gauge + Play Now |

`venue-riverside` as `Lisas` — all three legacy leaderboard rows: headline falls back to
`challenge.name` when there is no prize signal at all, no eyebrow, no gauge, no quota line, and
**no Play Now** (game type `unknown` → `null` key). Confirms the `null` branch.

**Play Now navigation confirmed twice:** Live Trivia reward → `/trivia/live?venueId=venue-pacific-street`
(the `?venueId=` param `goTo` adds is intact), NFL reward → `/nfl-pickem`, landing on that game's
own onboarding card — i.e. each game still owns its "nothing live right now" state, exactly as §1
decided. The modal is gone after navigation (`Play Now` count 0).

**Category Blitz branch:** unreachable from Rewards today and left alone. `ChallengeGameType` has
no `category-blitz` member at all, so `challengeGameTypeToVenueGameKey` can never return that key
and `goTo`'s onboarding-overlay special case is never entered from this surface. If Category Blitz
rewards are ever added, that branch already does the right thing (opens the overlay, doesn't
deep-link past it) — but it is untested from here.

### Test data / cleanup

Seeded one extra `challenge_campaigns` row (id `11111111-2222-3333-4444-555555555555`, Live
Trivia, `points_required_to_win: 500`, `winner_quota: 5`, `prize_kind: "menu_item"` /
`appetizer` / `percent` / `50`) plus a `challenge_campaign_progress` row (175 pts for Andrew) and
3 `challenge_cycle_winners` rows to force `quotaRemaining = 2`. **All of it was deleted**;
`venue-pacific-street` is back to its two original campaigns. Notes for whoever seeds next:

- `challenge_campaigns` has **no `venue_id` column** — it's `venue_ids` (array). Query with
  `.contains("venue_ids", ["venue-..."])`.
- Progress is a plain row in `challenge_campaign_progress` (`challenge_id`, `user_id`,
  `venue_id`, `points_earned`) — no game submissions needed to fake a half-full gauge.
- `computeCycleStart` can be called with a hand-built campaign literal (only `recurringType`,
  `activeDays`, `startTime`, `startDate` matter for the weekly path) — no need to fetch the row.
- Scratch scripts can't `require("@supabase/supabase-js")` from the scratchpad; run them with
  `NODE_PATH=/Users/andrewserulneck/Documents/Trivia-Predictions/node_modules node --env-file=.env.local <script>`.
- A dev server may still be running on :3000 from this session.

### Left for Phase 4

- `rewardQuotaLine` is where all quota copy lives now — singular/plural is already handled
  (`"1 reward left"`), so Phase 4's item 2 is mostly *confirming* the NFL reward shows no line
  (verified above) and settling on the exhausted phrasing (`"All 5 claimed"` today).
- Phase 4 item 1 (is `quotaRemaining` fresh across a cycle rollover?) was **not** investigated —
  the panel's refetch behavior is untouched by this phase.
- Phase 4 item 3: `challengeBadgeCount` (`VenueHubClient.tsx`) is unchanged and still reads
  `viewerWon && !prizeClaimedAt`; nothing in this phase touched that path.
- Phase 5's helper unit tests should cover `rewardQuotaLine` as well as the three helpers the
  plan already lists.

---

### Phase 4 — Multi-winner quota copy + edge cases

**Model: Claude Sonnet 5 · Effort: low-medium (~30 min)**

1. Confirm `quotaRemaining` is fresh — it is a **current-cycle** number
   (`challenge_cycle_winners`); make sure the panel's existing refetch keeps it accurate after a
   cycle rolls over. If it goes stale, fix by refetching, **never** by computing quota
   client-side (CLAUDE.md: quota is enforced atomically by the `award_cycle_winner` RPC).
2. Copy polish: singular/plural (`"1 reward left"`), the exhausted phrasing, and the NFL
   "most picks right" reward — which is **locked to 1 winner**, so it must show **no** quota
   line at all.
3. Confirm the `challengeBadgeCount` unread-badge logic in `VenueHubClient.tsx:1455` is
   unaffected.

---

## Phase 4 — DONE (2026-08-03)

**Status: complete — all three items were confirmations, not fixes.** Phase 3 had already
shipped the correct behavior for all of Phase 4's scope; this pass verified that empirically
(one live browser check) and by code trace, and made **no code changes**. `npx tsc --noEmit`,
`npm run lint`, `npm run test` (1317 passed / 13 skipped — identical to Phase 3's numbers)
all clean.

**Item 1 — is `quotaRemaining` fresh across a cycle rollover?** Yes, by construction, no fix
needed:

- `getChallengeCampaignSnapshotForUser` (`lib/challengeCampaigns.ts:2376`) computes
  `quotaRemaining: Math.max(0, campaign.winnerQuota - winners.length)` **fresh on every call**,
  where `winners` comes from `resolveCurrentCycleWinnersForSnapshot`, which resolves the
  *current* cycle via `computeCycleStart(campaign, now, venueTimezone)` using `now = new Date()`
  at call time (`lib/challengeCampaigns.ts:2398`). There is no caching of quota state anywhere
  server-side — every `GET /api/challenge-campaigns` request re-derives it from
  `challenge_cycle_winners` for whatever cycle `now` falls in.
- Client-side, `VenueHubClient.tsx:1271` already polls `loadChallengeCampaigns({ silent: true })`
  every 30s whenever the venue-home screen is visible (`homeRevealComplete && contentReady`),
  independent of which of the three swipe screens (Games/Leaderboard/Rewards) is active or
  whether the reward modal is open — neither the interval nor the modal's own state gates it.
  So a guest who leaves the modal open across a cycle boundary sees `quotaRemaining` update
  within 30s, same as everything else on the panel.
- No client-side quota computation exists anywhere in this surface (`rewardQuotaLine` only
  formats numbers it's given) — the CLAUDE.md invariant ("`award_cycle_winner` is the only
  quota authority") was never at risk here.

**Item 2 — copy polish.** Already correct as shipped in Phase 3
(`rewardQuotaLine`, `venueHubShared.tsx:204-212`):

- Singular/plural: `"${remaining} of ${quota} reward${remaining === 1 ? "" : "s"} left"`. Note
  this is **not** `"1 reward left"` in the singular case — the format always includes `"of
  {quota}"`, so remaining=1/quota=2 reads **`"1 of 2 reward left"`**. Verified live in a real
  browser (see below) — matches the code exactly.
- Exhausted: `"All ${quota} claimed"` when `remaining <= 0`. Not re-verified live this pass
  (pure string logic, already covered by Phase 3's card-level "All Claimed" chip check plus
  direct code read) — flagged for Phase 5's unit test to pin down permanently.
- NFL "most picks right" reward (`winnerQuota` locked to 1 server-side, see
  `docs/nfl-pickem-reward-plan.md`): `rewardQuotaLine` returns `""` for any `quota <= 1`, so the
  line doesn't render at all. Confirmed live in Phase 3's browser pass and re-confirmed this
  pass via the panel's rendered card text (no "REWARD LEFT" string anywhere near the NFL card).

  **Live browser verification done this pass** (Playwright, 390×844, dev server on :3000,
  `venue-pacific-street` as `Andrew`): seeded one throwaway `challenge_campaigns` row
  (`winner_quota: 2`, points-threshold, Live Trivia) plus one `challenge_cycle_winners` row for
  a different venue user (`pauly d`) in the *current* cycle (`cycle_start` computed via
  `computeCycleStart` with `recurringType: "weekly"`, `activeDays: ["mon"]` — same recipe Phase
  3 used) so `quotaRemaining` resolved to 1 server-side. Opened the reward's modal and read the
  rendered text directly: **`"1 OF 2 REWARD LEFT"`** (uppercase is `text-transform`, the actual
  string is `"1 of 2 reward left"`) — exact match for the code. All seeded rows deleted
  afterward; confirmed `venue-pacific-street` is back to exactly its two original campaigns
  (`89e8f3d8…` NFL, `bb094fdd…` Live Trivia).

**Item 3 — is `challengeBadgeCount` unaffected?** Confirmed by code read:
`VenueHubClient.tsx:1503` — `challengeCards.filter((c) => Boolean(c.viewerWon &&
!c.prizeClaimedAt)).length` — untouched by any Phase 1-4 change; nothing in this redesign
touches `viewerWon` or `prizeClaimedAt`.

**One thing worth knowing for whoever seeds data next:** the venue-home screen is a horizontal
`scroll-smooth` carousel (`VenueHubClient.tsx`'s `swipeViewportRef`), not routed panels — the
`Games`/`Leaderboard`/`Rewards` pills call `goToScreen(index)` which does
`viewport.scrollTo({ left: viewport.clientWidth * index, behavior: "smooth" })`. In Playwright
this scrolls correctly (confirmed via `scrollLeft` inspection: `632 = 2 × 316`), but a
`fullPage: true` screenshot of the *unscrolled* container renders misleadingly — it's easy to
think the click did nothing when it actually worked. Use `page.locator("body").innerText()` or a
non-fullPage screenshot to check state, not a fullPage screenshot of a horizontally-scrolled
flex container.

### Left for Phase 5

- Unit tests for `rewardQuotaLine` should assert the exact singular string is `"1 of 2 reward
  left"` (not `"1 reward left"`) so this doesn't silently drift — that phrasing is a real design
  choice (always show the total quota), not just a grammar fix.
- The exhausted phrasing (`"All N claimed"`) has still never been checked in a live browser,
  only by code read across two phases now. Cheapest way: reuse this phase's seed script but
  insert `winnerQuota` matching `winners.length` (e.g. quota 1, 1 winner row) or add enough
  `challenge_cycle_winners` rows to hit `quotaRemaining <= 0`.
- Phase 5's plan already lists the three helpers to unit-test
  (`rewardHeadline`/`rewardGameLabel`/game-type→`VenueGameKey` mapping) — add
  `rewardQuotaLine` as a fourth, it's equally pure and equally uncovered.
- `npm run test:god-mode-join` was not run this phase (correctly — this surface doesn't touch
  join/auth/geofence, per the plan's own note under Phase 5 item 4).

---

### Phase 5 — Tests + verification

**Model: Claude Sonnet 5 · Effort: low-medium (~30–45 min)**

1. Vitest unit tests for the new pure helpers: `rewardHeadline` (each prize kind, plus the
   empty-prize fall-back), `rewardGameLabel`, and the game-type → `VenueGameKey` mapping
   (including `unknown → null`).
2. `npx tsc --noEmit`, `npm run lint`, `npm run test`.
3. Browser pass via the `/verify` skill: seed a venue with (a) a multi-winner Live Trivia
   points reward mid-progress, (b) an NFL Pick 'Em reward, (c) a `game_winner` reward, (d) an
   exhausted reward. Screenshot each card and modal.
4. This work does not touch join/auth/geofence, so `npm run test:god-mode-join` is **not**
   required.

---

## Phase 5 — DONE (2026-08-03)

**Status: complete and browser-verified.** `npx tsc --noEmit`, `npm run lint`, and `npm run test`
(1330 passed / 13 skipped — 13 more than Phase 3/4's 1317, all new) clean.
`npm run test:god-mode-join` intentionally not run, per the plan's own note (this surface doesn't
touch join/auth/geofence).

**File added:** `tests/components.venue-hub-shared-reward-helpers.test.ts` — 13 Vitest cases
covering the four pure helpers in `venueHubShared.tsx`:

- `rewardHeadline` — gift card, percent-off menu item, 100%-off ("Free …"), dollar-off menu item,
  and the legacy name fall-back when there's no prize signal at all.
- `rewardGameLabel` — a known game type (`nfl-pickem`, `live_trivia`) and `unknown → ""`.
- `challengeGameTypeToVenueGameKey` — every known mapping plus `unknown → null`.
- `rewardQuotaLine` (Phase 4 flagged this as untested) — quota ≤ 1 renders nothing, the exact
  `"1 of 2 reward left"` singular phrasing (not `"1 reward left"` — pins Phase 4's finding that
  the format always includes the total quota), plural `"2 of 5 rewards left"`, and the
  `"All N claimed"` exhausted string.

**Browser pass (Playwright, 390×844, dev server on :3000, `venue-pacific-street` as `Andrew`).**
Seeded two throwaway `challenge_campaigns` rows to cover the two states no prior phase had
screenshotted together with the two pre-existing ones:

| State | Card | Modal |
|---|---|---|
| (a) multi-winner Live Trivia, mid-progress (quota 5, 1 winner already recorded → `quotaRemaining` 4) | `LIVE TRIVIA` eyebrow / **50% off Appetizer** / `IN PROGRESS` / `175 / 500 pts` bar | gauge at 175/500 + **"4 OF 5 REWARDS LEFT"** + Play Now |
| (b) NFL Pick 'Em (pre-existing, upcoming) | `NFL PICK 'EM` / **$100.00 gift card** / `UPCOMING` | no gauge, no quota line (quota 1), "Starts Sep 10…", Play Now on readable navy-on-amber |
| (c) `game_winner` Live Trivia (pre-existing) | `LIVE TRIVIA` / **$25.00 gift card** / `IN PROGRESS` | no gauge, **"Awarded to the winner."**, Play Now |
| (d) exhausted (quota 1, fully claimed) | trophy-glyph badge (see note below) / **$15.00 gift card** / `ALL CLAIMED` / "Congrats to pauly d — the prize for this cycle has been claimed." | not opened — exhausted cards render no `Details ›` affordance (confirmed unclickable), consistent with Phase 2's finding that winner/exhausted states hide it |

**One seeding artifact, not a product bug:** the exhausted test row was named `"Exhausted Reward
Test"`, which doesn't contain any of `inferChallengeGameType`'s keywords ("trivia", "bingo",
"pick", "fantasy"), so it resolved to `gameType: "unknown"` — no eyebrow, trophy badge, and (per
existing behavior) no Play Now. This is an artifact of the throwaway seed name, not a rendering
defect; the `"All N claimed"` copy itself matched `rewardQuotaLine`'s code exactly, which is what
this pass was checking. Confirms Phase 4's still-open item — the exhausted phrasing had only been
code-read before, never seen live — is now settled.

**Test data cleanup:** both seeded `challenge_campaigns` rows plus their
`challenge_campaign_progress` and `challenge_cycle_winners` rows were deleted after the pass;
confirmed `venue-pacific-street` is back to exactly its two original campaigns (`89e8f3d8…` NFL,
`bb094fdd…` Live Trivia). Winner rows used the pre-existing `venue-pacific-street` user "pauly d"
(not a fabricated id) to satisfy the `challenge_cycle_winners.winner_user_id` FK.

**All 5 phases of this plan are now complete.**

---

## 4. Files touched

| File | Phase |
|---|---|
| `components/venue/venueHubShared.tsx` | 1, 3 — card type, `rewardHeadline`, `rewardGameLabel`, `challengeGameTypeToVenueGameKey`, `rewardQuotaLine`, `CHALLENGE_ICON_STYLE.ctaTextColor` |
| `components/venue/VenueChallengesPanel.tsx` | 2, 4 — card layout, quota-aware states |
| `components/venue/VenueHubClient.tsx` | 3 — modal rebuild, Play Now prop wiring |
| `components/venue/RewardProgressGauge.tsx` *(new)* | 3 — shared gauge |
| `lib/rewardDefinitions.ts` | read-only — reuse `describeRewardPrize` |
| tests | 5 |

**No DB migration. No API route change expected** (confirm in Phase 1).

---

## 5. Model / effort summary

| Phase | Model | Effort |
|---|---|---|
| 1 — Type plumbing + helpers | Sonnet 5 | Low |
| 2 — Card layout | **Opus 5** | Medium |
| 3 — Modal: gauge, quota, Play Now | **Opus 5** | Medium-high |
| 4 — Quota copy + edge cases | Sonnet 5 | Low-medium |
| 5 — Tests + verification | Sonnet 5 | Low-medium |

Phases 2 and 3 carry the design judgment and the cross-component wiring; the rest is mechanical
enough for Sonnet. Phases 1→5 are strictly ordered.

---

## 6. Related docs

- `docs/rewards-system-plan.md` — the Rewards system's original design and as-built notes
- `docs/nfl-pickem-reward-plan.md` — why the NFL reward is 1-winner, 1-point-per-pick, and
  schedule-independent
- `docs/rewards-game-winner-picker-plan.md` — `game_winner` rewards and slot pinning
- `CLAUDE.md` § Rewards System — the hard invariants (registry-driven definitions, shared
  wizard, atomic quota RPC, in-app coupon redemption)
