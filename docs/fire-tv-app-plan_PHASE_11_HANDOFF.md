# Fire TV app — Phase 11 handoff (carousel, ticker, "Get the app" QR, pre-game title)

Written 2026-11-23 by the agent that did Phase 11 (Claude Sonnet 5.5, as the plan names).

## For Andrew (plain English)

**What changed.** Every venue TV now shows the real carousel when nothing is playing: **Next Live Trivia → Pick 'Em
board → All-Time Leaderboard → Prizes → Get the app**, 15 seconds each. A slide with nothing to show is skipped. A **score
ticker** runs along the bottom, and a small **"Get the app" QR** sits in the bottom-right corner (not on the last slide, which
has a big one). The QR is also on the Live Trivia **round break** and **final standings**, and the pre-game screen now has a
big **LIVE TRIVIA** title and counts down from 60:00. Every screen says "Hightop Challenge" in full. Try demo shows each
slide for 15 seconds.

**Is it live?** Not yet. It's in a pull request (`feat/fire-tv-phase-11`). **When it merges and deploys, it goes live on
every TV at once**, the Silk Display URL included, and **the sports data switches on** (it was off until now). I ran the data
once against production before opening the PR: it worked (31 games stored, a venue's carousel came back in 0.2 s, 5 KB).

**Cost.** Same plan as before (D27): a TV on the carousel makes the server do 4 small reads per request and refresh the
sports feed every 2 minutes while games are on. The feed is a flat subscription, so $0 more. No new crons. Real usage can't
be compared yet: no TV has been on since Phase 9 deployed (no `[tv-state]` log lines). Phase 15 compares.

**Things you should know.**
1. **Round break shows 7 players, not 8**, so the list stays clear of the QR.
2. The Live Trivia **final** screen's confetti (3.6 s, once) can drift over the QR. The QR is back and uncovered after that.
3. Five leagues came back empty on the production run (WNBA, MLB, Ligue 1, Bundesliga, UFC): probably no games in the
   window. They're retried every 30 minutes. Nothing breaks.
4. I ran this **before N3** (the NHL game-day check) because you asked. They're independent.

**What needs you:** merge the PR. Then Phase 12 (check the screens on a real TV on a game day).

## For the next agent (Phase 12, Haiku 5.5 / low; Andrew checks, you record)

### 1. Goal and scope
Phase 12: Andrew checks the sports screens on a real TV on a game day (`docs/fire-tv-app-plan.md` → "Andrew's steps →
Phase 12"). You record results in a Phase 12 handoff and `docs/tv-display-physical-device-checklist.md` and list fixes. Out of
scope: new features, R1 (Bingo), R2 (Category Blitz/Squares/Bracket TV screens), college basketball (D19). N3 is separate.

### 2. Starting state
- Branch `feat/fire-tv-phase-11` from `main` at `89a4f381` (N2 merge). One commit; PR opened against `main`. **Not merged, not deployed** when written.
- `TV_CAROUSEL_DATA_ENABLED` is `true` in `lib/venueScreenCarousel.ts`: goes live on merge. Migration
  `20261122174439_tv_sports_snapshot.sql` was already applied (2026-11-23).
- **Production data written during verification:** one `refreshTvSportsIfDue` run wrote 38 rows to `tv_sports_games` (31 games
  in the window) and `tv_sports_refresh` due dates for 17 leagues. This is the cache a TV would fill anyway; nothing else.
  Temporary test file removed (`git status` clean of it).
- Working tree otherwise clean; scratch clone and dev server on :3141 were mine, in the scratchpad (kill PID in `scratchpad/dev.pid` only).

### 3. Decisions made in Phase 11 (don't re-ask)
- **Slide timing counts from when the carousel mounts**, in whole 15 s steps off the parent's 1 s clock (so a game ending
  restarts at slide 1; a poll never moves it). Not wall-clock-synchronised between TVs. Server and first client render both show slide 1 (hydration-safe).
- **Pinned slide** (`?mode=carousel*&slide=next|pick-em|all-time|prizes|app`, and Try demo) via the existing `previewSlide` prop.
- **Ticker:** drawn only when it has segments (games, then "Pick 'Em leader: X 9–3"). Tag reads LIVE if a game is live, else TODAY.
  Fixed right segment is the next Live Trivia short form after hydration. Games hidden while slide 2 shows the board.
- **QR dock** = "Get the app / Scan to play" + 210-design-px plate, `TvAppDock` (1920×1080 design px) or `TvAppCorner` (alone over a full canvas, `low` = 44 px up).
- **Prizes card:** prize (big), partner's challenge name, "N pts" only for points-target prizes. No end date or bar (no data / D28).
- **Pre-game:** title 150 px, QR 270, tile scale 2, countdown in minutes (`formatPregameCountdown`, "60:00").
- **Round break capped at 7 rows** (`ROUND_BREAK_MAX_ROWS` in `LiveTriviaIntermissionScreen.tsx`); an `AutoScaleToFit` padding reserve did NOT work (overflow into padding isn't measured), so a row cap is used.
- Stage twinkles also off on the round break / final (`showsCornerQr` in `VenueScreenClient.tsx`).

### 4. Files
| File | What |
|---|---|
| `lib/tvCarousel.ts` (new, pure) | Slide order/skip rules (`carouselSlidesOf`, `carouselSlideAt`, `carouselShowsCornerQr`), ticker model (`tickerSegmentsOf`, `tickerRepeatsFor`, `tickerLoopSeconds`). |
| `components/venue-screen/TvCarousel.tsx` (new) | The idle screen: rotation, fade, dots, ticker, corner QR; owns `usePickEmScoreFlash`. `IdleVenueScreen` now just renders it. |
| `TvAppDock.tsx`, `TvTicker.tsx`, `TvNextLiveTriviaSlide.tsx`, `TvPrizesSlide.tsx` (new) | The shared QR, ticker, slides 1 and 4. |
| `TvSlideCanvas.tsx` | New `TvDesignFrame` (1920×1080 frame scaled 1.2×). |
| `TvIdleAttract.tsx` | Now slide 5: "Hightop / Challenge", new sentence line, `tickerVisible` (bottom 200 px clear, footer hidden), drift only after hydration (fixes the old dev hydration warning). |
| `TvLiveTriviaPregame.tsx` | LIVE TRIVIA title, minutes-only countdown, smaller QR/tile to fit. |
| `VenueScreenClient.tsx`, `LiveTriviaIntermissionScreen.tsx` | Corner QR on round break/final; twinkles off there; 7-row cap. |
| `lib/venueScreenIdleLine.ts` | `formatIdleCountdown` moved here (re-exported from `IdleVenueScreen`); new `formatPregameCountdown`, `formatNextLiveTriviaSentence`, `splitNextLiveTriviaLine`; **old `formatNextLiveTriviaLine` and its test file deleted**. |
| `lib/venueScreenTiming.ts`, `lib/tvAppDemo.ts`, `components/venue-screen/TvDemo.tsx` | Preview slide ids; demo = 5 pinned slide steps + Live Trivia steps. |
| `lib/venueScreenCarousel.ts` | `TV_CAROUSEL_DATA_ENABLED = true`. |
| Tests | New `tests/venue-screen-carousel.test.ts`; updated board-slides, idle-components, idle-moments-contract, pregame-components, `lib.venueScreenCarousel`. |
| Docs | Plan status/table row 11; Standing rules in `docs/live-trivia-pregame-and-display-cleanup-plan.md`. |

### 5. Facts and traps
- `listPickEmTvFeedGames` reports `ok: false` when a league returns no events, so off-season leagues show as "no-reply" in `[tv-sports]` logs. Normal.
- AutoScaleToFit doesn't see content overflowing into its own padding.
- `vitest` only runs `*.test.ts`; render components with `React.createElement` + `renderToStaticMarkup`.
- Debug fixture quirk: `?mode=carousel` says "Every Thursday" with a Tuesday time (fixture data only).
- Scratch-clone browser testing: rsync without `.env.local`/`native`, symlink `node_modules` and `data`, stub `getVenueScreenState` in the clone, `next dev --webpack -p 3141`; Try demo (`/tv-app/demo`, ArrowRight advances) shows the Live Trivia screens without a database.
- Dev-only badge ("N", "Updated just now", "DEBUG") covers the ticker's left edge in screenshots; not in production.

### 6. Verified
- `npx tsc --noEmit -p .` clean; ESLint on changed files clean; `npm run test`: 606 files passed, 7,931 tests passed.
- Browser (scratch clone, headless Chromium, 1920×1080 and 1280×720): all five slides, pre-game (9:55, title fits), round break (7 rows, clear of QR), final standings (strip clear of QR), rotation through all five slides in 15 s steps and back to slide 1 at 75 s with a poll in between; no console errors.
- Production, read/refresh once: shared copy refreshed (17 leagues claimed, 38 rows), carousel built for one venue (212 ms, 5,317 bytes, 16 games, 10 all-time, 2 prizes).
- **Not verified:** a real TV / Fire Stick; a real game day with the score flash through the full rotation; MMA/tennis feeds; the cost baseline (no TV traffic yet); ticker readability at distance; a 12+ character username on slides 2–3.

### 7. Open questions for Andrew
None. Waiting on: merge of the PR; a game day for Phase 12.

### 8. First steps for Phase 12
1. Confirm the PR merged and deployed. Read Andrew's results.
2. Record them in a Phase 12 handoff and in `docs/tv-display-physical-device-checklist.md`; file fixes as follow-ups, don't fix unless trivial.
3. Check `[tv-state]` / `[tv-sports]` logs (MCP `get_runtime_logs`, project `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, team `team_uGVCpxcJGBQ1VdCDO0lSMRZf`) for the first real numbers.
