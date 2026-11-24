# Bingo and Pick 'Em reliability plan — Phase CR1.2 handoff (Pick 'Em game id and grading guards)

**Date:** 2026-11-24 · **Model:** Claude Opus 5.5 / high (as the plan names) · **Fixes:** F24–F28 from the Fire TV
plan's CR1 review (`docs/fire-tv-app-plan.md`, "CR1 review findings").

## Summary for Andrew

- **What changed:** Pick 'Em can no longer pay a player twice for one game. Before, if the sports feed changed a
  game's start time after someone picked, the game showed as "not picked", they could pick again, and both picks
  were paid. Now:
  - the pick still shows on the moved game;
  - picking again just switches the side of the pick they already have;
  - if two picks somehow exist, only the first one is graded and the other is canceled.
- **Also fixed:**
  - A game whose start time moved later is no longer graded early from its live score.
  - A postponed game is canceled, not graded as a tie (push).
  - "Your team won" notifications link to the right day: the bar's date, not tomorrow's in UTC.
  - Two games between the same teams a couple of days apart can no longer be mixed up.
- **Is it live?** It goes live when the PR merges and Vercel deploys; the PR is listed below. No database change.
- **Production today (read-only check):** 137 picks, no duplicates, no game listed under two ids. So nothing needs
  repairing, and the new safety check has nothing to cancel.
- **One new finding (F44):** the separate NFL Pick 'Em screen has the same "pick disappears after a time change"
  problem. It can't pay twice any more: today's fix stops that at grading. The screen fix is a small new phase,
  **CR1.2.1**. **Needs you:** say yes or no to CR1.2.1.

## For the next agent

### 1. Next phase and scope
- In this plan, next is **CR1.6** (BallDontLie season probe, Sonnet 5.5 / medium; approved), then **CR1.2.1** (F44,
  Sonnet 5.5 / medium; **awaiting Andrew's OK**). Both are in "Remedial phases from the CR1 code review". They can
  share one PR.
- The Fire TV plan's own queue (CR1.3 before Tue 2026-12-01, CR1.4, CR1.5, CR2, CR3) is in
  `docs/fire-tv-app-plan.md`.
- Out of scope for CR1.6: anything Pick 'Em.

### 2. Starting state
- **Branch** `fix/pickem-game-id-and-grading`, from `main` `537cbc20`.
- **Commits:**
  - `53e5c22c`: the code and the test.
  - A second commit: these docs.
- **PR:** listed in this plan's status line once opened. Merge follows the auto-merge rule (CI green + verified).
- **No migration and no data change.** Only one read-only production select was run (§6). No undo log needed.

### 3. Decisions (don't re-ask)
- Approved by Andrew 2026-11-24 (CR1.1–CR1.7 all yes).
- **No game-id migration.** `buildPickEmGameId` still embeds the start time: lines, frozen lines, the unique
  index and old picks all key on the full id. Instead, picks are also matched by the provider id (the part before
  the first `__`).
- **A moved game's pick keeps its old `game_id` and `starts_at`.** Picking the moved game only switches
  `selected_team` / `selected_side`. Rewriting `game_id` would cut a spread pick off from its locked or frozen line,
  which is keyed by the old id.
- **A pick on the same real game at another venue is refused** with "You already made a pick for this game.". That
  matches the unique index `idx_pickem_picks_user_game_unique (user_id, game_id)`, which is per user, not per venue.
- **Canceled picks are never carried to a new id.** After a postponement cancels a pick, the player can pick the
  rescheduled game.
- **Settlement de-dupe:** when one player has pending picks under *different* ids of one provider game, the
  earliest `created_at` (then `id`) is graded and the others are canceled. The log line is
  `[Pick 'Em] duplicate-pick-canceled`. Two picks under the *same* id can't exist (unique index), and
  `tests/lib.pickem-college-football.test.ts` relies on that shortcut, so they are left alone.
- **Postponed / called off** (non-college only; college keeps `collegeFootballGradeGate`): the provider's `status`,
  `status_state` or `game_state` matches `cancel|postpon|abandon|forfeit`, or is exactly `ppd` / `cncl`. The pick is
  canceled at once. "Suspended" is deliberately not included, because the game can resume.

### 4. Files
- `lib/pickem.ts`:
  - `pickForGameId()`: looks up the exact id, then the provider id.
  - `isPickEmFeedCalledOff()`.
  - `PICKEM_TEAM_MATCH_WINDOW_MS` (12 h).
  - `findMovedGamePick()`: one bounded read. It reads by user and `sport_key`, `starts_at` within ±21 days of the
    game's current start, then filters by provider id in JS. It doesn't use a `LIKE` pattern, because `_` is a
    LIKE wildcard. It runs only when the exact-id read finds nothing.
  - `listUserPicksByGameId`: now also keys each non-canceled pick by provider id.
  - `submitPickEmPick`:
    - `existing = exactPick ?? findMovedGamePick(...)`.
    - Another venue's pick → refused.
    - The lock is checked at `max(stored start, current start)`.
  - `settlePendingPickEmPicks`:
    - the de-dupe pass before the loop;
    - the F28 time guard in the team-name fallback;
    - `realStartsAtMs = max(row.starts_at, feed commence_time)` for the 4-hour `isStale` rule (F25);
    - `feedSaysScheduled` via `extractTvFeedState({status_state, game_state})` (F26);
    - the called-off cancel;
    - win groups keyed by the venue-local date (`getVenueTimezone` once per venue per run, falling back to
      America/New_York) and a new `isToday` field on `PickEmWinGroup`, used by `insertPickEmWinGroupNotifications`
      (F27).
  - `BallDontLieScoreEvent` gained `game_state`, filled in `fetchScoresForSportKey`.
- `tests/lib.pickem-game-id-and-grading.test.ts` (new, 18 tests). It is built from the CR1 repro
  `docs/fire-tv-app-plan_CR1_evidence/pickem-game-id-and-grading-repro.test.ts.txt`, flipped to assert the correct
  behaviour, plus new cases (submit, venues, canceled, F27, F28). On the old code **12 fail and 6 pass**: the
  controls, plus cases the old code got right by accident.
- Docs:
  - this note;
  - this plan (status line, table rows CR1.2 and CR1.2.1, the CR1.2.1 phase details);
  - `docs/fire-tv-app-plan.md` (status line, CR1.2 row, F44 pointer row);
  - `docs/fire-tv-app-plan_PHASE_CR1_HANDOFF.md` (CR2 now numbers from **F45**).

### 5. Facts and traps
- **F44:** `lib/nflPickEm.ts` builds its own ids (`<id>__<startsAt>__<away>__<home>`, `:1389`). It also finds picks
  by exact id only (`:1438` list, `:1649` submit). CR1.2's settlement de-dupe covers NFL payments, because NFL
  settles through `settlePendingPickEmPicks`. The screen and submit fix is CR1.2.1.
- The settlement de-dupe only sees picks that are pending in the same run. If one duplicate were already won, the
  other would still grade. That can't happen in practice: both picks have started by the time the game is final.
  Submit now prevents new duplicates.
- `listUserPicksByGameId` reads only picks whose stored `starts_at` falls in the requested local day. If a game
  moves across local midnight, its pick won't show on the new day's list. Submit still finds it (±21 days), so it
  can't be duplicated.
- Not fixed, pre-existing, outside this phase: a game the feed still calls `in_progress` 4 h after its real start
  is graded from the live score (the 4-hour rule). That's rare (long extra innings or overtime).
- The repro's Supabase mock had no `maybeSingle` / `single`. The new test adds them, and `insert` now returns an id.
- The `.env.local` names check (`cut -d= -f1 .env.local`) was denied by the permission prompt in this session. The
  production select worked with `node --env-file=.env.local` and `NEXT_PUBLIC_SUPABASE_URL` /
  `SUPABASE_SERVICE_ROLE_KEY`.

### 6. Verification
- `npx vitest run tests/lib.pickem-game-id-and-grading.test.ts`: 18/18 pass. With `lib/pickem.ts` stashed, 12 fail.
- `npm run test`: 610 files and 7,990 tests pass, 13 skipped. `npm run lint`: clean. `npx tsc --noEmit`: clean.
- **Production, read-only, 2026-11-24, before deploy** (script in the session scratchpad; it is just one `select`
  of `pickem_picks`, paged):
  - total 137 (NFL 72, NBA 38, MLB 27; no NHL);
  - 0 created since the N2 deploy (2026-11-23 22:09:44Z);
  - **0 duplicate user + provider-game pairs**;
  - **0 provider games under more than one `game_id`**;
  - 0 pending.

  The CR1 handoff said WNBA picks existed. This select found none under `sport_slug` `wnba`.
- **Cost:**
  - One extra bounded read per *new* pick (the moved-game lookup).
  - At most one cached `venues.timezone` read per venue per settlement run, only when a win is graded
    (10-minute per-instance cache).
  - No new cron, poll or provider call.
- **Unverified:**
  - What BallDontLie actually sends for a postponed NHL game. The code accepts `PPD` / `postponed` in any of the
    three fields.
  - Whether NHL rows ever change `start_time_utc`.
  - The post-deploy re-run of the select. Re-run it once a few NHL picks exist, and record the counts in the next PR
    that touches this plan (CR1.6 / CR1.2.1).

### 7. Open questions for Andrew
1. Approve **CR1.2.1** (F44, the NFL screen)? Default: yes, with CR1.6.

### 8. Recommended first steps
- **CR1.6:** read its phase details in this plan. Model Sonnet 5.5 / medium. Branch from `main` after this PR merges.
- If CR1.2.1 is approved, do it on the same branch:
  - copy the mock from `tests/lib.pickem-game-id-and-grading.test.ts`;
  - mirror `findMovedGamePick` and `pickForGameId` in `lib/nflPickEm.ts`;
  - keep the frozen-lines contract test passing.
