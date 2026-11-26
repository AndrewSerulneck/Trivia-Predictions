# Fire TV plan — Phase CR2.1 handoff (TV display polish: F45–F47, F49–F53)

**For Andrew:** eight small fixes to the idle TV screens, web only. The Pick 'Em board no longer says "No picks yet" when
the pick count simply failed to load. When two games score in one update, both flash, one after the other. A score
update after a gap in the feed no longer flashes old news. A slide keeps its full 15 seconds when the slide list changes
(for example, the leaderboard loads late). The ticker doesn't jump at the Pick 'Em slide. There is never a second QR
while "Get the app" fades out. The Live Trivia finish confetti stops above the corner QR. A prize with no separate name
prints its title once. It's live once the PR merges and deploys; nothing needs you. **Next is CR2.3 (waiting for your
go), then CR3.**

## For the next agent

- **Branch:** `fix/tv-display-polish` from `main` `73349915`; code, tests, plan and this note are one PR (see the plan's
  status line). Not a shell change, so **no store release**. No data, migration or env change.
- **Next:** CR2.3 (`docs/fire-tv-app-plan.md` "Phase CR2.3"; Sonnet 5.5 / medium), then CR3. Wait for Andrew's go. CR1.7
  still waits for Amazon.
- **Files:** `lib/tvPickEmBoard.ts`, `lib/tvCarousel.ts`, `components/venue-screen/{TvPickEmBoard,TvCarousel,TvTicker,
  TvAppDock,TvFinalStandings,TvPrizesSlide,usePickEmScoreFlash}.ts(x)`. Tests: new
  `tests/venue-screen-tv-display-polish.test.ts` (node) and `…-dom.test.ts` (jsdom); updated
  `tests/venue-screen-carousel.test.ts` and `tests/lib.tvPickEmBoard.test.ts` for the renamed functions.
- **Changed APIs:** `detectScoreFlash` → `detectScoreFlashes` (array); `carouselSlideAt` → `nextCarouselSlide(slides,
  current, shownAtMs, nowMs)`; `usePickEmScoreFlash` returns `{ flash, done }`; `TvPickEmBoard` takes `onFlashEnd`;
  `TvTicker` draws an empty bar for no segments (the carousel decides whether to mount it).
- **Traps:** framer's cross-fade doesn't finish under vitest fake timers, so the F51 test uses real timers and drives the TV
  clock through the `nowMs` prop (about 2.5 s). `sed -i` needs `''` on macOS. Turbopack rejects a symlinked `node_modules`;
  a scratchpad clone needs `cp -Rc` of it.
- **Verified:** `npm run test` (617 files, all pass), `npx eslint` on the touched files, `npx tsc --noEmit` clean; the 17 new
  tests fail on the old code (checked by stashing the source). Browser check on `/tv-app/demo` from a scratchpad clone on
  :3101 (stopped; clone removed): all five slides draw with ticker and one QR, no console errors; on the Live Trivia final,
  the dock's top is at 688 of 900 px, which is where the confetti area now ends.
- **Not verified:** the live rotation across a real poll on `/venue/<id>/screen?mode=carousel` (needs a database; the demo
  pins slides). The real-TV checklist (`docs/venue-display-hype-and-intro-stinger-plan.md` §F) still applies. Confetti
  placement was checked by measurement, not by watching the shower.
- **Open questions:** none.
