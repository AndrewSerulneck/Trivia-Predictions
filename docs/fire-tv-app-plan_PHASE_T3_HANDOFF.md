# Fire TV plan — Phase T3 handoff

**For Andrew:** The random star-tilt test that failed CI once on PR #41 now uses a fixed seed, so it can't flake. Website
test only, no store release, no live behavior change. T2 is still waiting on your yes (below).

**Small-phase note.** Changed: `tests/lib.sportsBingo.nfl-star-tilt.test.ts` — "puts stars on boards materially more
often than chance" now calls `installSeededRandom(4)` first. Star share by seed (30 boards): 1 → 0.350, 2 → 0.313,
3 → 0.329, 4 → 0.371, 5 → 0.346, 6 → 0.338, 7 → 0.363, 8 → 0.354, 99 → 0.354; the 0.3 bar holds for all, so the test
still proves the tilt. Seed 4 chosen (margin 0.07). Verified: the file passes (12 tests); full `npm run test` 7891 passed;
`npm run lint` shows the same 480 errors with and without the change (local `tmp/` only). Branch `fix/star-tilt-seeded`.

**Another flake seen:** PR #44's CI failed once on `tests/lib.sportsBingo.nfl-flavor-squares.test.ts` > "caps the Tier-1
block per board and per team, and still fills 24 squares" (passed on the sibling run). Likely the same unseeded-random
cause; not fixed here (out of T3 scope).

**Next (T2):** needs Andrew to add repo secret `BALLDONTLIE_API_KEY` (`gh secret set BALLDONTLIE_API_KEY`), say whether the
bot opens a PR (recommended) or commits to `main`, and approve the Actions setting "Allow GitHub Actions to create and
approve pull requests". Then add `.github/workflows/nfl-star-index-weekly.yml` per the plan's Phase T2 section.
