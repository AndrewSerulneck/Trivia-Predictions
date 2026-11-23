# Fire TV app — Phase 10 handoff (Pick 'Em Live Board + All-Time Leaderboard slides)

Written 2026-11-23 by the agent that did Phase 10 (Claude Sonnet 5.5, high effort, as the plan names).

## For Andrew (plain English)

**What changed.**
- **Phase 9 is merged and live** (PR #39, merge commit `92af7e06`, Vercel deploy succeeded). From now on every TV shows
  the Live Trivia pre-game screen for the last 60 minutes before a game. Category Blitz, Super Bowl Squares and March
  Madness no longer show on any TV.
- **Your database change is applied** (production, 2026-11-23). I ran `supabase db push` after a dry run showed it was the
  only pending migration. Two server-only tables and one function for the shared games copy, plus one index. I checked
  it: both tables exist and the claim function works (it hands a sports league to one TV at a time). Nothing uses them
  until Phase 11 turns the sports data on.
- **Phase 10 is built:** the **Pick 'Em Live Board** (4 game tiles, a league label on each, this bar's top 5 on the side,
  no join QR) and the **All-Time Leaderboard** (top 10 in two columns of 5, only #1 in gold, points with commas). They
  match the mockups you approved. When a score changes while the board is up, that tile flashes for a few seconds with
  a ribbon ("KC +7") and "61% here picked KC". It never repeats on a refresh.

**Is it live?** The code is in a pull request (see the PR link in the chat), not merged. **Nothing changes on any TV
even after it merges:** the slides only appear when you open a TV address with `?mode=carousel&slide=pick-em` (or
`slide=all-time`). Phase 11 builds the rotation that shows them for real and switches the sports data on.

**What's left:** Phase 11 (carousel, ticker, "Get the app" QR on every screen, "LIVE TRIVIA" title on the pre-game).

**What needs you:** nothing blocks Phase 11. Still open from Phase 9: (1) the NHL Pick 'Em start-time bug, which needs
its own small plan (NHL games show and lock at 7 AM New York time); (2) the Prizes slide's per-player progress bar
doesn't fit a TV, so Phase 11 will drop it unless you say otherwise.

**See it:** with the dev server on :3000 open `/venue/<a venue id>/screen?mode=carousel&slide=pick-em&intro=0`, or
`...mode=carousel-weeknight&slide=pick-em`, or `...mode=carousel&slide=all-time`. (Fixture data; relative times, so the
games always look live.)

## For the next agent (Phase 11, Sonnet 5.5 / high)

### 1. Goal and scope
Phase 11 per `docs/fire-tv-app-plan.md`: carousel (D20: 1 Next Live Trivia, 2 Pick 'Em, 3 All-Time, 4 Prizes, 5 Get the
app; 15 s each), ticker (D15), shared "Get the app" QR (D16) on every listed screen, pre-game "LIVE TRIVIA" title and
60:00 countdown, "Hightop" → "Hightop Challenge" wording. It also **turns the carousel data on** (flip
`TV_CAROUSEL_DATA_ENABLED` in `lib/venueScreenCarousel.ts` to `true`; the migration is already applied). Out of scope:
Bingo (R1), Category Blitz/Squares/Bracket (R2), college basketball (D19), the NHL Pick 'Em bug.

### 2. Starting state
- Phase 9: **merged to `main`** (PR #39, `92af7e06`) and deployed. Migration `20261122174439_tv_sports_snapshot.sql`
  **applied to production** 2026-11-23 (only migration that was pending). Verified: both tables readable by the service
  role; `claim_tv_sports_refresh(['__verify__'], 30)` returned the key, a second call returned `[]`; the test row was
  deleted afterwards. No other data written.
- Phase 10: branch `feat/fire-tv-phase-10`, from `origin/main` at `92af7e06`. One commit; PR opened against `main`
  (link in the chat). **Not merged, not deployed** when written.
- **Left uncommitted on purpose** (other sessions' work, in the working tree; never commit them as part of Phase 11
  unless Andrew says so): `.claude/settings.json`, `AGENTS.md`, `CLAUDE.md`, `app/api/admin/route.ts`,
  `components/admin/sections/VenuesSection.tsx`, `docs/fire-tv-store/listing.md`, `docs/native-app-release-runbook.md`,
  `package.json` (the `fire-tv:release` script), `native-tv/scripts/release.cjs`, the Phase 8b status line in
  `docs/fire-tv-app-plan.md` (its table row 8b and the first Status sentences), and dozens of iCloud `"* 2.*"`
  duplicates. To commit only your hunks of a file with other people's edits, build the index copy from `git show HEAD:<file>`
  and `git update-index --cacheinfo` it (interactive `git add -p` isn't available).

### 3. Decisions made in Phase 10 (don't re-ask)
- **Built at 1920×1080 inside a 1.2× wrapper.** The stage is 2304×1296; the mockups are 1920×1080. `TvSlideCanvas`
  scales its children by `2304/1920` so every number is the mockup's. Phase 11's ticker (96 px) and dots (120 px from
  bottom) and QR (right 70, bottom 130, plate 210) are in these same design px: put them inside a `TvSlideCanvas`-style
  1920×1080 frame, or multiply by 1.2.
- **Slides draw their own background** (`TV_SLIDE_BACKGROUNDS` in `lib/venueScreenBrand.ts`), over the stage. The idle
  burn-in drift still moves them (it wraps the whole screen).
- **Right-hand label** on the board: the league if the board is one league ("NFL"); otherwise "<Weekday> night" (from 5 PM
  on the TV's clock) or "<Weekday>". Server render says "Today" until hydrated. The mockup's "Week 11" isn't in the data.
- **Pick split bar:** the bar fills from the left with the **away** side's share (away is the top row); the bigger side is
  bold. No picks → empty bar and "No picks yet". Pick counts hide at 0 or unknown.
- **Top 5 empty** (nobody has a settled pick today, `leaders` null): the side column shows "Top 5 here / No results yet"
  so the layout doesn't jump.
- **Score flash:** ribbon `"<ABBR> +<points>"` (generic, no "TOUCHDOWN": the feed doesn't say how the points came) and the
  caption `"<pct>% here picked <ABBR>"` (a percentage; an exact head-count isn't known, only a rounded share) or `"<ABBR>
  scores"` when the venue has no picks. 6.5 s, three glow pulses; under reduced motion the highlight and ribbon show
  without the pulse.
- **Preview hook for Phase 10 only:** `?mode=carousel|carousel-weeknight|carousel-empty` plus `&slide=pick-em|all-time`
  (`parseVenueScreenPreviewSlide` in `lib/venueScreenTiming.ts`; ignored without a carousel debug mode). It lives in
  `IdleVenueScreen`; Phase 11 replaces that branch with the carousel and may keep `slide=` to pin a slide.

### 4. Files
| File | What |
|---|---|
| `lib/tvPickEmBoard.ts` (new, pure) | `boardGamesOf`, `tileViewOf` (one tile's text; unknown scores "–", never 0), `formatGameTime`, `pickEmBoardLabel`, `formatLeaderRecord`, `formatPoints`, `allTimeColumns`, `detectScoreFlash`, `scoreSnapshotOf`, `TV_SCORE_FLASH_KEEP_MS` (90 s). |
| `components/venue-screen/TvSlideCanvas.tsx` (new) | `TvSlideCanvas` (background, dim top rule, 1920×1080 frame scaled 1.2×) and `TvSlideHeader`. Exports the design size constants. |
| `components/venue-screen/TvPickEmBoard.tsx` (new, client) | Slide 2. Props `venueName, games, leaders, nowMs, flash`. Claims the flash through `useFxMoment(flash.token)` only if the flash's game is on the board. |
| `components/venue-screen/TvAllTimeLeaderboard.tsx` (new) | Slide 3. Props `venueName, entries`. Static. |
| `components/venue-screen/usePickEmScoreFlash.ts` (new) | Compares each poll's scores with the last and returns the latest flash for 90 s. **Call it from something that stays mounted while idle** (today `IdleVenueScreen`; in Phase 11, the carousel component above the slides), not from the slide. |
| `components/venue-screen/IdleVenueScreen.tsx` | `previewSlide` prop, renders the two slides when pinned; else unchanged. |
| `components/venue-screen/VenueScreenClient.tsx`, `app/venue/[venueId]/screen/page.tsx` | Pass `previewSlide` (page reads `?slide=`). |
| `lib/venueScreenBrand.ts` | `TV_SLIDE_BACKGROUNDS`. |
| `lib/venueScreenTiming.ts` | `VenueScreenPreviewSlide`, `parseVenueScreenPreviewSlide`. |
| `tests/lib.tvPickEmBoard.test.ts`, `tests/venue-screen-board-slides.test.ts` | 24 tests: tile text, labels, flash detection, both slides' markup (tile/row counts, no QR, gold only on #1, no "0" for unknown scores), preview parsing. |

### 5. Facts and traps
- **Idle data poll is 20 s but a slide shows 15 s.** A score change usually lands while a different slide is up, which is
  why the flash is detected above the slide and kept 90 s. If Phase 11 wants the flash to play when the board next
  appears, that already works (the board claims it on mount); if a rotation mounts the board twice in 90 s the second
  mount gets "duplicate" and doesn't replay.
- **Only board games flash** (first four ranked). A game that changes rank between polls is judged by the snapshot of all
  ≤16 games, so promotion alone never flashes.
- **`vitest` only runs `*.test.ts`** here, not `.tsx`; render components with `React.createElement` +
  `renderToStaticMarkup` (see `tests/venue-screen-board-slides.test.ts`).
- **Full-suite flakiness under load:** on this machine `npm run test` showed 3 failures in one run
  (`lib.question-variety`, `lib.sportsBingo.nfl-star-index-freshness`, a PGlite-based test) that all pass when run alone.
  They are timeouts/clock-dependent and not from this phase; re-run those files alone before assuming a regression.
- Scratch clone browser testing: the clone needs `data/` (symlink it) or the state route fails on the Category Blitz
  letter index. Stub `getVenueScreenState` in the clone's `lib/venueScreen.ts` (returns an idle state; the route's
  `?mode=` fixtures then add the carousel). `next dev --webpack -p 3133`; kill only your own PID.
- The Next.js dev badge shows bottom-left in screenshots (dev only).
- Display copy: "Prize" never "Reward"; minimal words (the only new strings are "Pick 'Em Live", "Top 5 here", "No
  results yet", "No picks yet", "All-Time Leaderboard", "pts", "N picks").

### 6. Verified
- `npx tsc --noEmit -p .`: clean. ESLint on every changed/new file: clean.
- `npm run test`: 7,888 passed; the 3 failures noted above pass alone.
- Browser (scratch clone, stubbed state, headless Chromium) at **1920×1080 and 1280×720**: Sunday NFL board, weeknight
  NBA/NHL board (one scheduled game with "–" scores and a start time), All-Time slide; no console errors; bottom 150 px
  and bottom-right corner empty; top-5 column ends well above the QR corner.
- Score flash in the browser: with the poll mocked to raise KC's score by 7 on the second poll, the ribbon appeared once
  (~6 s) and did not reappear on the third poll that repeated the same score.
- **Not verified:** a real TV; real production data on these slides (the data switch is still off); the flash with real
  feed timing; a 12+ character username at 48 px (it ellipsizes, not checked visually).

### 7. Open questions for Andrew
1. NHL Pick 'Em start-time bug: make it its own small plan? (From Phase 9.)
2. Prizes slide: drop the mockup's progress bar? (Phase 11 will drop it unless told otherwise.)

### 8. First steps for Phase 11
1. Read this note, the plan's Phase 11 section, D15/D16/D20/D21, and `docs/fire-tv-app-plan_PHASE_9_HANDOFF.md` §4 (idle
   payload).
2. Branch from `main` after this PR merges. Build the carousel as one component that stays mounted while idle, calls
   `usePickEmScoreFlash`, and rotates slides from the wall clock (like `TvIdleAttract`: no extra requests).
3. Put dots and the ticker in the bottom 150 px and the shared QR in the bottom-right corner, in 1920×1080 design px.
4. Flip `TV_CAROUSEL_DATA_ENABLED` last, after a browser check with the data on. Tell Andrew the plain-English cost line
   (the baseline is in the Phase 9 handoff; read `[tv-state]` logs with the MCP, project `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`).
5. Check `LiveTriviaScreen`, `TvFinalStandings`, `TvRoundBreak` at 1920×1080 for anything under the QR.
