# Rewards Panel Prize-First — Code Review Fixes

Follow-up to `docs/rewards-panel-prize-first-plan.md`. Three findings from the
working-tree code review of the prize-first redesign (`VenueChallengesPanel.tsx`,
`VenueHubClient.tsx`, `venueHubShared.tsx`, `RewardProgressGauge.tsx`).

Baseline at time of review: `npx tsc --noEmit`, `npm run lint`, and
`tests/components.venue-hub-shared-reward-helpers.test.ts` all pass.

Explicitly **not** in scope (deliberate non-findings): "Play Now!" being enabled
for an upcoming NFL reward (plan §1 decision), and the gauge's "pts" unit being
wrong for NFL, which counts picks (pre-existing on the card, merely propagated).

---

## Phase 1 — Play Now must not clobber the shared-element snapshot

**Finding:** `components/venue/VenueHubClient.tsx:1492` — `playChallengeGame`
passes the modal's Play Now button as `sourceElement`. `runVenueGameOpenTransition`
(`lib/venueGameTransition.ts:483`) calls `saveCardViewportSnapshot(gameKey, sourceElement)`,
overwriting the snapshot that the venue-home game card wrote. The *back* transition
out of that game then shrinks into the button's old mid-screen rect instead of the
game card on venue home.

**Fix:** launch the transition from the modal button (so the open animation still
originates where the user tapped) without letting it become the persisted
card-viewport snapshot for the back transition. Two viable approaches — pick after
reading `lib/venueGameTransition.ts:221-260` and `:464-500`:

- **(a) Preferred** — add an opt-out to `runVenueGameOpenTransition`
  (e.g. `persistCardSnapshot?: boolean`, default `true`); `playChallengeGame` passes
  `false`. Smallest blast radius, keeps the existing snapshot semantics intact for
  the home tiles.
- **(b)** Have `playChallengeGame` resolve the real home card element for `dest`
  (the tiles already exist in the DOM behind the modal) and pass *that* — the open
  animation then also reads as "zoom out of the game card," which may look worse
  since it starts off-screen.

Go with (a) unless reading the transition code shows the snapshot is also the
open-animation source in a way that makes (b) strictly simpler.

**Verify:** browser — open a reward modal → Play Now → back out of the game;
the exit should land on the venue-home card for that game, not mid-screen.
Then re-check a normal home-tile open/close still animates unchanged.

**Model / effort:** Opus 5, **medium**. Requires reading and reasoning about the
transition module's snapshot lifecycle; the edit itself is small but the failure
mode is only visible in a real browser.

### As-built (2026-08-03) — DONE, browser verification still owed

Took approach **(a)**. Reading `lib/venueGameTransition.ts` confirmed the snapshot
is *not* the open-animation source: the open path measures `sourceElement` live
(`getBoundingClientRect()` at `:495`) and `saveCardViewportSnapshot` only feeds
`runVenueGameReturnTransition` (`readCardViewportSnapshot` at `:592`). So the two
concerns separate cleanly and (b) was unnecessary.

Changes:
- `lib/venueGameTransition.ts` — `OpenTransitionArgs` gains
  `persistCardSnapshot?: boolean` (documented, default `true`);
  `runVenueGameOpenTransition` destructures it with that default and wraps the
  `saveCardViewportSnapshot(gameKey, sourceElement)` call in the guard. Nothing
  else in the module changed; the open animation is byte-identical either way.
- `components/venue/VenueHubClient.tsx` —
  - `goTo(dest, sourceElement, options?: { persistCardSnapshot?: boolean })`
    forwards `options?.persistCardSnapshot ?? true`. All existing callers
    (`handleGoTo` for the home tiles) pass nothing → unchanged behavior.
  - The `category-blitz` branch of `goTo` defers through the onboarding overlay,
    so the flag rides along in a new `categoryBlitzPersistSnapshotRef` (reset to
    `true` in both `closeCategoryBlitzOnboarding` and
    `joinCategoryBlitzFromOnboarding`) and is passed to
    `enterCategoryBlitzGame(sourceElement, persistCardSnapshot = true)`. This is
    dead defensive code today — `ChallengeGameType` has no `category-blitz`
    member, so Play Now can't reach that branch — but it keeps the option honest
    if a Category Blitz reward definition is ever added.
  - `playChallengeGame` now calls `goTo(dest, sourceElement, { persistCardSnapshot: false })`,
    with a comment explaining why.
- `tests/lib.venue-game-transition-snapshot.test.ts` (**new**) — two regression
  tests. Trick that makes them possible under Vitest's `environment: "node"`: a
  zero-sized `getBoundingClientRect` makes the function bail to a plain
  `navigate()` *after* the snapshot decision but *before* any DOM/Web-Animations
  work, so only a tiny `window` stub (`sessionStorage`, `getComputedStyle`,
  `innerWidth/Height`) is needed. If someone ever moves the zero-rect guard above
  the snapshot write, these tests will fail — that ordering is load-bearing for
  the tests, not for the product.

Gates: `npx tsc --noEmit` clean, `npm run lint` clean, the new test file plus
`tests/components.venue-hub-shared-reward-helpers.test.ts` pass (15 tests).

**Browser-verified 2026-08-04.** Rather than eyeballing the animation, verified the
actual mechanism directly: opened Live Trivia from the venue-home tile (captured a
`tp:venue:card-viewport:v1` sessionStorage snapshot), went back, then opened the
Live Trivia Challenge reward modal and tapped "PLAY NOW!" (button at a different
on-screen position, mid-panel). The snapshot in sessionStorage after the modal
Play Now was byte-identical (same `capturedAt`, same rect ratios) to the one
captured from the tile — the modal button's position was never written, confirming
`persistCardSnapshot: false` does what it's supposed to. Live venue: pacific-street,
reward: "Live Trivia Challenge" (`bb094fdd-5212-47bf-ba08-d0d8a15aad85`).

**Adjacent bug, deliberately NOT fixed (out of this plan's scope):**
`goToChallengeRedeem` (`VenueHubClient.tsx:~1406`) passes the tapped reward card
as `sourceElement` under `gameKey: "fantasy"` while navigating to
`/redeem-prizes`. That clobbers the *fantasy* home tile's snapshot the same way.
It probably wants `persistCardSnapshot: false` too (the option now exists), but it
predates this redesign and wasn't a review finding. Raise it with the user before
changing it.

---

## Phase 2 — `rewardHeadline` must fall back on a *complete* prize, not a non-empty string

**Finding:** `components/venue/venueHubShared.tsx:175` — the `card.name` fallback
only fires when `describeRewardPrize` returns `""`. A legacy `gift_card` row with a
NULL amount returns the non-empty `"Gift card"`, and a `menu_item` row with a NULL
item returns `"Menu Item"` — both silently drop the detail the campaign *name* used
to carry (e.g. "$25 Gift Card Giveaway" degrades to "Gift card").

**Fix:** in `venueHubShared.tsx`, treat a prize as headline-worthy only when it is
fully specified, and fall back to `card.name` otherwise. Do **not** change
`describeRewardPrize` in `lib/rewardDefinitions.ts` — it has three other callers
(`NFLPickEmLeaderboard`, `NFLPickEmRewardBanner`, and this file) that legitimately
want the degraded label for already-won coupons.

Suggested shape: a local `isCompletePrize(card)` predicate —
- `gift_card` → `Number(prizeGiftCertificateAmount) > 0`
- `menu_item` → `prizeMenuItem` present, and if `"other"` then a non-empty
  `prizeMenuItemName`
- anything else → `false`

then `rewardHeadline = isCompletePrize(card) ? describeRewardPrize(card) : card.name`
(keeping the existing `|| card.name` belt-and-braces).

**Verify:** extend `tests/components.venue-hub-shared-reward-helpers.test.ts` with
cases for gift_card/NULL amount, menu_item/NULL item, and menu_item `"other"` with
a blank name — each should return `card.name`. Confirm the happy paths still return
prize copy.

**Model / effort:** Sonnet 5, **low**. Self-contained pure function plus unit tests;
the rule is fully specified above.

### As-built (2026-08-03) — DONE

Implemented exactly the suggested shape. `components/venue/venueHubShared.tsx`:
- New local `isCompletePrize(card)` predicate, placed just above `rewardHeadline`.
  Switches on `card.prizeKind`: `"gift_card"` → `Number(prizeGiftCertificateAmount) > 0`;
  `"menu_item"` → `prizeMenuItem` present, and if it's `"other"` a non-empty
  (trimmed) `prizeMenuItemName`; anything else (including `null`/`undefined`
  `prizeKind`, i.e. legacy rows with no prize fields at all) → `false`. `RewardPrizeKind`
  (`types/index.ts:196`) only has these two members, so the `default: false` arm
  also correctly covers "no prizeKind set."
- `rewardHeadline` now short-circuits to `card.name` when `!isCompletePrize(card)`,
  before ever calling `describeRewardPrize`. `describeRewardPrize` itself
  (`lib/rewardDefinitions.ts`) is untouched, per the fix note — its other callers
  (NFLPickEmLeaderboard, NFLPickEmRewardBanner) still get the degraded label for
  already-won coupons.

Tests added to `tests/components.venue-hub-shared-reward-helpers.test.ts` (now 16
tests, up from 11): gift_card/NULL amount, menu_item/NULL item, and menu_item
`"other"`/blank name — all assert fallback to `card.name`. Existing happy-path
cases (gift card, percent/dollar-off menu item, no-prize-signal fallback) still
pass unchanged.

Gates: `npx tsc --noEmit` clean, `npm run lint` clean, full test file passes
(16/16). No browser verification needed — this is a pure function change with
full unit coverage of the new branch logic; nothing here depends on DOM/timing.

**Not touched / left as-is:** `describeRewardPrize` and its three other call
sites, exactly as the fix note instructed.

---

## Phase 3 — `inferChallengeGameType` must not route Play Now off a name substring

**Finding:** `components/venue/venueHubShared.tsx:193` (root cause at `:156-167`) —
the name-substring guess now selects the *navigation target*, not just an icon. A
legacy free-form campaign named e.g. "Trivia Champion" that actually tracked Live
Trivia matches the `trivia` branch and sends Play Now to `/trivia` (Speed Trivia),
where points don't accrue toward that reward. Wizard-created rewards are safe —
their name is always `definition.name` and they carry `rewardDefinitionId`.

**Fix:** make `rewardDefinitionId` fully authoritative and stop letting a *guess*
drive navigation:

1. Map every known definition id up front, not just NFL:
   `live_trivia_challenge → "live_trivia"`, `nfl_pickem_challenge → "nfl-pickem"`
   (ids per `lib/rewardDefinitions.ts:69,84`). Prefer a lookup keyed off the
   registry so a new definition can't be forgotten here.
2. Keep the substring heuristic **only** for its original job — icon/badge/eyebrow
   on legacy rows. Split the concern: `inferChallengeGameType` (display) stays as
   is, and add a separate confidence signal so navigation can refuse to guess.

Concretely: have the inference return (or expose alongside) whether the result came
from `rewardDefinitionId` or from the name. `challengeGameTypeToVenueGameKey` — or
its caller in `VenueHubClient.tsx:1471` — returns `null` for name-derived results,
so Play Now simply doesn't render on legacy free-form campaigns. That reuses the
already-correct `unknown` → no-button guard rather than adding a second code path.

Confirm before implementing: whether any *live* legacy campaign rows lack
`reward_definition_id` (`challenge_campaigns.reward_definition_id IS NULL`). If
none do, this is purely defensive and the button never disappears in practice.

**Verify:** unit tests in the same helper test file — a `live_trivia_challenge` id
routes to Live Trivia regardless of name; a NULL-definition "Trivia Champion" gets
the Speed Trivia *icon* but a `null` play key. Then browser-check a wizard-created
Live Trivia reward still shows and routes Play Now correctly.

**Model / effort:** Opus 5, **medium**. The mechanical edit is easy; the judgment
is in the display-vs-navigation split and not regressing the badge behavior that
`docs/nfl-pickem-reward-phase8.md` item 2 established.

### As-built (2026-08-04) — DONE, browser verification still owed

Implemented the display-vs-navigation split exactly as specified. The substring
heuristic still runs (unchanged rules, unchanged order) but now only feeds
display; navigation reads a separate function that refuses name-derived results.

`components/venue/venueHubShared.tsx`:
- **Registry-derived id map.** `REWARD_DEFINITION_GAME_TYPE` is a
  `Record<RewardDefinitionGameType, ChallengeGameType>` translating the registry's
  game-type enum (`ChallengeGameType` in `types/index.ts:157`, imported here
  aliased as `RewardDefinitionGameType`) into this module's *different*
  same-named local enum. They genuinely disagree: `"live-trivia"` vs
  `"live_trivia"`, the registry's legacy `"trivia"` alias (mapped to
  `"speed-trivia"`), and the local-only `"unknown"`. Because it's a full
  `Record`, adding a member to the `@/types` enum is a compile error here rather
  than a silently-missed reward.
  `GAME_TYPE_BY_REWARD_DEFINITION_ID` is then built by iterating
  `REWARD_DEFINITIONS` — so a new registry entry is picked up automatically, per
  the plan's "prefer a lookup keyed off the registry." This also subsumes the old
  hard-coded `rewardDefinitionId === "nfl_pickem_challenge"` short-circuit, and
  newly makes `live_trivia_challenge` authoritative (it previously fell through
  to the name guess, which happened to be right only because the wizard names it
  "Live Trivia Challenge").
- **`resolveChallengeGameType(name, rewardDefinitionId?)`** (new, exported) returns
  `{ gameType, fromDefinition }`. `fromDefinition: true` only when the id hit the
  registry map. An *unrecognized* id (e.g. a retired definition) counts as no
  signal → falls through to the name guess with `fromDefinition: false`, so it
  also can't drive navigation. The name branch moved verbatim into a private
  `inferChallengeGameTypeFromName(lower)`.
- **`inferChallengeGameType`** is now a thin wrapper over the resolver, same
  signature and same return values as before — `VenueChallengesPanel.tsx:93`
  (card icon/badge/eyebrow) and `VenueHubClient.tsx:1475` (modal icon/eyebrow)
  are untouched and behave identically. The `docs/nfl-pickem-reward-phase8.md`
  item-2 badge behavior is preserved.
- **`rewardPlayVenueGameKey(name, rewardDefinitionId?)`** (new, exported) is the
  only function navigation may consult: `null` unless `fromDefinition`, else
  `challengeGameTypeToVenueGameKey(gameType)`. `challengeGameTypeToVenueGameKey`
  itself is unchanged and still exported (used by `rewardGameLabel` and tests).

`components/venue/VenueHubClient.tsx`:
- `selectedChallengeDetail.venueGameKey` now calls
  `rewardPlayVenueGameKey(selectedChallenge.name, selectedChallenge.rewardDefinitionId)`
  instead of `challengeGameTypeToVenueGameKey(gameType)`; the
  `challengeGameTypeToVenueGameKey` import was dropped. This reuses the existing
  `selectedChallengePlayKey === null` → no-button guard, exactly as the plan
  wanted — no second code path.

Tests: `tests/components.venue-hub-shared-reward-helpers.test.ts` grew three
describe blocks (now 22 tests, up from 16) — definition id beats a misleading
name; legacy/NULL id falls back to the guess; unrecognized id = no signal;
`inferChallengeGameType` still returns the guess for display; and
`rewardPlayVenueGameKey` returns `null` for every name-derived case (the
"Trivia Champion" scenario from the finding) while routing definition-backed
rewards correctly.

Gates: `npx tsc --noEmit` clean, `npm run lint` clean, 24/24 tests pass across
this file plus `tests/lib.venue-game-transition-snapshot.test.ts`.

**DB question confirmed 2026-08-04** (`node --env-file=.env.local`, Node's built-in
env-file loader worked where `dotenv` didn't — no need to read `.env.local`
directly). 3 live `challenge_campaigns` rows have `reward_definition_id IS NULL`:
"General Saloon - Saturday/Sunday/3-Day Challenge" at `venue-riverside`. None of
those names match any branch of `inferChallengeGameTypeFromName` (no "trivia",
"bingo", "nfl", "pick", or "fantasy" substring), so they already resolved to
`"unknown"` → no Play Now button before this fix and are unchanged by it. Not
purely defensive in the sense the plan worried about (rows do exist), but no
user-visible regression risk from them.

**Browser-verified 2026-08-04.** Live venue: pacific-street, reward: "Live Trivia
Challenge" (`bb094fdd-5212-47bf-ba08-d0d8a15aad85`, `reward_definition_id:
"live_trivia_challenge"`). Opened its modal → showed "PLAY NOW!" → clicked →
navigated to `/trivia/live?venueId=venue-pacific-street` (Live Trivia, correct).

---

## Phase 4 — Close-out

Run `npx tsc --noEmit`, `npm run lint`, `npm run test`. Update
`docs/rewards-panel-prize-first-plan.md` with an as-built note pointing here, and
update the `project_rewards_panel_prize_first` memory.

**Model / effort:** Sonnet 5, **low**.

### As-built (2026-08-04) — DONE

`npx tsc --noEmit` clean, `npm run lint` clean, `npm run test` green (158 files /
1341 tests passed, 13 skipped — no failures). `docs/rewards-panel-prize-first-plan.md`
now points here. `project_rewards_panel_prize_first` memory updated.

**Update 2026-08-04:** the browser verifications and DB check carried over from
Phases 1 and 3 are now done too — see the "Browser-verified" / "DB question
confirmed" notes added to those phases above. Nothing outstanding remains on this
plan.

---

## Suggested order

Phases 2 and 3 are both in `venueHubShared.tsx` and share a test file — do them
together in one session (Opus 5, medium, since Phase 3 sets the bar). Phase 1 is
independent and touches `lib/venueGameTransition.ts`; it can run in parallel or
after. Phase 4 last.
