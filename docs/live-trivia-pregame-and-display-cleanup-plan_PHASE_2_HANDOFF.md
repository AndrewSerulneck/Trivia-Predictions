# Phase 2 handoff — display state (pre-game mode, Live Trivia priority, no Category Blitz "Next up")

## For Andrew

The display now knows about the 15 minutes before a Live Trivia game. In that window it switches to a pre-game
screen, which beats Category Blitz, Squares and March Madness. Only the live game itself beats it. The "We're live"
burst now fires when pre-game turns into the real game. Before this change it would not have fired, because it only
watched for idle → live. Category Blitz is gone from the "Next up" carousel for good. The display shows Category Blitz
only while someone is playing a round.

The pre-game screen is a **placeholder**: a big countdown and "Round 1: <category>". Phase 3 builds the real screen
(QR, three steps, Live Trivia button) and the new idle screen you asked for (gentle motion, app QR).

**Status:** written and tested on branch `feature/live-trivia-pregame-display` (stacked on PR #16, no ads on the
display), **not committed**, not pushed, not deployed. Don't ship Phase 2 without Phase 3: the placeholder isn't meant for venues.

**Needs you (before Phase 3, optional):** Q5. On the new idle app-download screen, should it keep one small line for the
next Live Trivia game (e.g. "Live Trivia · Thursday 8:00 PM")? My default is yes, if one is scheduled.

## For the next agent (Phase 3: pre-game screen UI + idle app-download screen) — Sonnet 5.5, high effort

### 1. Goal and scope
- Build `components/venue-screen/TvLiveTriviaPregame.tsx` per plan §4 Phase 3 steps 1–4, and replace the placeholder
  `LiveTriviaPregamePanel` in `components/venue-screen/VenueScreenClient.tsx` with it.
- **New in scope (plan Phase 3 step 5, D12):** idle screen becomes an app-download attract: a still, high-contrast
  QR to `APP_DOWNLOAD_URL`, gentle motion around it, and the "Live Trivia · Category Blitz" tagline in `TvIdleAttract.tsx`
  dropped. Q5's default: one small next-Live-Trivia line if scheduled.
- Out of scope: short link / Display page (Phase 4), deleting Link a TV (Phase 5), any state/precedence change (Phase 2
  owns `selectVenueScreenState`; don't add a second precedence check in components).

### 2. Starting state
- Branch `feature/live-trivia-pregame-display`, created from `fix/no-ads-on-venue-display` @ `09bae3fa` (PR #16, open,
  Phase 1). Phase 2 is uncommitted working-tree changes on it (files in §4). If PR #16 merges first, rebase onto `main`.
- Nothing pushed or deployed. No migrations, no data changes, no env vars.
- Untracked `* 2.ts` / `* 2.m4a` / `* 2.mp4` / `README 2.md` duplicates and two `docs/*_BACKFILL_LOG_*.json` files are
  not ours. Leave them alone.

### 3. Decisions (don't re-ask). Full list in plan §1.
- D1 15-minute lead. D8 precedence: Live Trivia active (incl. final) > pre-game > Category Blitz (session in play) >
  Squares > Bracket > idle. Q2: a Category Blitz round started during pre-game shows on phones only.
- D7 superseded: no Category Blitz "Next up" card, ever. D12: idle = animated app-download QR. D13: "Round 1:
  <category>" small, only when set. D14: no short domain.

### 4. Files changed
- `lib/venueScreen.ts`: new union member `mode: "live-trivia-pregame"` with `pregame: VenueScreenPregame`
  (`gameId` = `${scheduleId}:${occurrenceDate}`, `title`, `startsAt` ISO, `firstRoundCategory` or null).
  `getLiveTriviaPregame(liveTrivia, nowMs)` (exported, pure) is the one window check. `selectVenueScreenState` is the
  single precedence point (comment above it). Removed `idle.nextCategoryBlitz`, `idle.categoryBlitzOnDemand`, and
  input fields `nextStartsAt`/`nextRecurringDays`/`asleep`; removed the scheduled-engine `listSchedules` read.
  `wouldBeIdle` (gates Squares/Bracket reads) also excludes pre-game.
- `lib/liveShowdownEngine.ts`: `nextSchedule.occurrenceDate` added (additive; from `findRelevantSchedules`).
- `lib/venueScreenTiming.ts`: `LIVE_TRIVIA_PREGAME_LEAD_MS`, `PREGAME_POLL_MS` (10 s),
  `PREGAME_FINAL_STRETCH_MS`/`_POLL_MS` (last 60 s → 2 s), `isGoLiveTransition(prev, next)`; debug mode
  `live-trivia-pregame`; idle polls wake exactly at the pre-game start (instead of up to 20 s late).
- `lib/venueScreenDebug.ts`: `?mode=live-trivia-pregame` renders a pre-game state (countdown frozen at ~14:59 since
  each poll re-applies it; "Round 1: History").
- `components/venue-screen/VenueScreenClient.tsx`: renders the placeholder inside `ScreenTransition` (key
  `ltp:<gameId>`), header chip "Live Trivia", Live Trivia theme, burn-in drift on pre-game, takeover via
  `isGoLiveTransition`.
- `components/venue-screen/IdleVenueScreen.tsx`: Category Blitz card removed.
- `scripts/verify-venue-screen-overflow.mjs`: dropped `nextCategoryBlitz` from its idle fixture.
- Tests: new `tests/lib.venueScreen-pregame.test.ts` (16 tests: window edges, precedence, takeover, poll pace, debug);
  updated `tests/lib.venue-screen.test.ts`, `tests/venue-screen-idle-components.test.ts`,
  `tests/venue-screen-idle-moments-contract.test.ts` (now asserts NO `gameKey: "category-blitz"` in the idle wrapper),
  `tests/venue-screen-reliability.test.ts`.

### 5. Facts and traps
- The old takeover check was `previousMode === "idle"`. A test pins the client line
  `const flippedLive = isGoLiveTransition(previousMode, json.mode);`. If you restructure the poll effect, keep it
  (or update the test deliberately).
- `previousMode` is seeded from `initialState.mode`, so a reload during pre-game, then go-live, still fires once.
  A reload mid-game never fires.
- `modeToGameLabel` returns null for pre-game. Don't map it to "Live Trivia": that is the takeover label, not the chip.
- The engine's active window covers the final-standings window, so pre-game can't reappear after a game ends unless
  another occurrence starts within 15 minutes.
- `TvIdleAttract` still renders the tagline "Live Trivia · Category Blitz" (a wordmark, not a card). The idle test
  comments say Phase 3 replaces it.
- The pre-game countdown should use the client's `nowMs` against `pregame.startsAt`. Polls land go-live within ~2 s.
- Category Blitz rules: the TV only peeks (`tests/category-blitz-sleep-contract.test.ts`, still green). The scheduled
  fallback still calls `driveVenueCategoryBlitz` (unchanged, applies only to venues opted out of continuous mode).

### 6. Build / test / verified
- `npm run test`: 535 files passed (7059 tests). `npx tsc --noEmit`: clean. `npx eslint` on every changed file:
  clean. (`npm run lint` repo-wide fails on 309 pre-existing parse errors in `tmp/group-games-phase-4/…`. That isn't from
  this change.)
- **Unverified:** no browser render of the placeholder or the takeover. Phase 3's accelerated-clock Playwright run
  (plan Phase 3 step 4) covers it. Use a scratchpad clone with no `.env.local` and mocked `/api/venue-screen/state`;
  never Andrew's :3000, never `pkill next`.
- Cost: unchanged from plan (~70 extra polls per display per game; zero new reads per poll; one fewer read for
  scheduled-mode Category Blitz venues).

### 7. Open questions
- Q5 (above). Proceed with the default if Andrew hasn't answered.

### 8. First steps for Phase 3
1. Read plan §3 constraints, `docs/venue-display-hype-and-intro-stinger-plan.md` §8 and `docs/game-themes-plan.md` Standing rules.
2. Look at `components/venue/VenueGamesPanel.tsx` (phone Live Trivia tile) and `GAME_TILE_THEMES.live_trivia`. Extract a
   shared presentational tile so the TV and phone can't drift apart.
3. Build `TvLiveTriviaPregame`, then the idle app-download screen. Delete `LiveTriviaPregamePanel`.
4. Check with `?mode=live-trivia-pregame` and `?mode=idle` at 1920×1080, 3840×2160 and 1280×720, then run the
   accelerated-clock run.
