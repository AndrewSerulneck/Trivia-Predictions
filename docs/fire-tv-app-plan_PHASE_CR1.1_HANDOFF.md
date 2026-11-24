# Fire TV plan — Phase CR1.1 handoff (TV Prizes slide: real targets, open prizes only)

**For the developer:** The TV Prizes slide no longer shows a made-up "1 pts" / "100 pts" under game-winner and leaderboard prizes, and no longer lists prizes whose dates have closed or not yet opened. Web only; no data, migration or store release. Live once the PR deploys.

**What changed:** `lib/challengeCampaigns.ts` (new pure `isCampaignWindowOpen`, `hasPointsTarget`; `getCampaignCloseTimestampMs` takes a narrower type), `lib/venueScreenCarousel.ts` (`readPrizes` exported; selects the mode, win condition and schedule columns; drops closed / not-yet-open rows; target only for `progress` + `points_threshold`), tests `tests/lib.venueScreenPrizes.test.ts` (mocked database, fails on the old code) and additions to `tests/lib.venueScreenCarousel.test.ts`. Nothing finalizes from the TV poll.

**Verified:** `npm run test` (7952 pass), `npx tsc --noEmit`, `npm run lint` clean. Not yet checked on the deploy: `/venue/<id>/screen?mode=carousel&slide=prizes` should show no "pts" under game-winner prizes.

**Next:** CR1.3 (due before Tue 2026-12-01), then CR1.4, CR1.5, CR1.6, CR1.2; CR1.7 waits for Amazon's 1.0.0 approval.
