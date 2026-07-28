# Phase 0 — Expand the NFL Pick 'Em dev test data

Read `docs/nfl-pickem-improvements-plan.md` first.

## Why

The existing seed (`scripts/seed-nfl-pickem-test-data.cjs` + the mock branch in
`lib/nflPickEm.ts`) creates **one** future week with 14 unplayed games. That is
not enough to verify the later phases:

- Phase 2 needs a week containing **both** already-kicked-off games (locked,
  with final scores) and not-yet-started games (open) *at the same time*.
- Phase 3's dropdown needs **multiple** past weeks to select between.
- Phases 5–6 need **other users** with picks, correct/wrong results, and points.

## Goal

Rework the seed so a single command produces a realistic multi-week state.

## Requirements

### Weeks

Seed **three** weeks in the current season, all with `week_number` in a
reserved test range (keep using 999 and add 997, 998 so the unseed script can
find them by range):

1. **Two completed past weeks** — every game final with scores and a winner.
2. **One in-progress "current" week** — this is the important one. It must
   satisfy, *at the moment of seeding*:
   - at least **2 games already kicked off** (locked; `status: "final"` with
     scores, or `"live"`), and
   - at least **3 games not yet kicked off** (open, pickable).

   Anchor this week so that holds regardless of what day/time the script runs.
   Note the app defines a week as Thursday→Monday, and the `nfl_pickem_weeks`
   CHECK constraints enforce `week_end_date = week_start_date + 4` and
   Thursday/Monday day-of-week — so pick the week window to satisfy those
   constraints, and adjust the *mock kickoff times within it* relative to
   `now` to get the required mix. If the script runs on a Tue/Wed (outside any
   Thu–Mon window), still produce a week that satisfies the mix.

   **Important interaction with Phase 3:** the dropdown will show only weeks
   whose `week_start_date <= today`. The "current" seeded week must therefore
   have a start date on or before today, or it will be invisible.

### Mock games

Update the mock generator in `lib/nflPickEm.ts` (`generateMockNFLGames`) so it
is week-aware: given the week window it returns games whose kickoff times are
distributed across that window, marking games in the past as `final` with
plausible differing scores (not the current hardcoded 24–17 for every game)
and a winner, and games in the future as `scheduled` with null scores.

Keep the existing flag-file mechanism (`.nfl-pickem-test-data`) and the
`process.env.NODE_ENV === "production"` guard exactly as they are.

### Fake opponents

Create **4 fake users** in the same venue as the test week's picks so the
leaderboard has content:

- Real `auth.users` + `public.users` rows are required — `pickem_picks` FKs to
  `users`. Follow the pattern in `scripts/simulate-category-blitz.cjs`.
- Give them recognizable usernames prefixed `nflsim-` so cleanup is
  unambiguous.
- Insert `pickem_picks` rows for them across all three weeks with a **mix** of
  correct, wrong, and still-pending picks, and varying pick counts (one user
  should have picked only some games — the leaderboard must handle partial
  participation). Set `sport_slug = 'nfl'` and a `game_id` matching the
  composite id format the app builds
  (`${bdlId}__${startsAt}__${awayTeam}__${homeTeam}`) or picks will not
  associate with games.
- After inserting, call the `recalculate_nfl_user_week` RPC for each
  (user, venue, week) so `nfl_pickem_user_weeks` is consistent.

Use the venue the developer is testing in. Default to `venue-pacific-street`
but accept an optional CLI arg to override.

### Cleanup

`scripts/unseed-nfl-pickem-test-data.cjs` must remove **everything** Phase 0
adds: the flag file, all reserved-range `nfl_pickem_weeks` rows, all
`nfl-sim` users' `pickem_picks`, their `nfl_pickem_user_weeks` rows, and their
`public.users` + `auth.users` rows. It must remain safe to run twice.

## Acceptance

- `node --env-file=.env.local scripts/seed-nfl-pickem-test-data.cjs` runs
  clean, then `curl -s "localhost:3000/api/nfl-pickem/weeks?includeComplete=true"`
  returns 3 weeks.
- The current week's `/api/nfl-pickem/games` response contains both
  `"isLocked": true` and `"isLocked": false` games.
- `node --env-file=.env.local scripts/unseed-nfl-pickem-test-data.cjs` leaves
  no `nflsim-` users and no reserved-range weeks behind; running it a second
  time succeeds.
- `npm run build` and `npm test` pass.
