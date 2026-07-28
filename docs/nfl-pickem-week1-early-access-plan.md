# NFL Pick 'Em — Week 1 Early Access Plan

Let guests preview and pick the 2026 Week 1 slate **now** (late July), and let
partners/admins create NFL Pick 'Em rewards against it, ~6 weeks before kickoff.

## Root cause (verified against prod + the live BallDontLie API, 2026-07-28)

The feature isn't broken. **It has no data.**

1. **`nfl_pickem_weeks` is empty — 0 rows.** Verified directly against production
   Supabase. Both reported symptoms fall straight out of this single fact:
   - `/nfl-pickem` shows no schedule because `listNFLWeeks` returns `[]`.
   - The reward wizard says *"The NFL season isn't set up yet…"*
     (`REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE`, `lib/nflPickEmRewardWeeks.ts:181`)
     because `resolveNFLSeasonContext` (`lib/rewards.ts:275`) returns `null` on an
     empty week list.
2. **Why it's empty: `/api/cron/nfl-week-sync` exists but was never scheduled.**
   The route (`app/api/cron/nfl-week-sync/route.ts`) is fully written and calls
   `syncNFLWeeks(currentYear)` — but it is **not** in `vercel.json`'s `crons`
   array, so nothing has ever invoked it. This is the whole bug.
3. **The 2026 schedule IS available right now.** A live call to
   `/nfl/v1/games?seasons[]=2026&postseason=false` returns the full regular
   season; Week 1 is 16 real games, opener `2026-09-10T00:20:00.000Z`
   (Patriots @ Seahawks). Nothing is waiting on the NFL.
4. **Results-within-minutes is already solved — no work needed.**
   `/api/cron/pickem-settle` runs **every minute** (`*/1 * * * *`, already in
   `vercel.json`) → `settlePendingPickEmPicks` (`lib/pickem.ts:2169`) pulls live
   scores from BallDontLie and writes `won`/`lost` on `pickem_picks`, then
   `accrueNFLPickEmChallengePoints` feeds reward progress. Confirmed present and
   wired.

### Two real correctness bugs found while verifying (must fix, or Week 1 ships visibly wrong)

- **Week numbers would be off by one.** `syncNFLWeeks` ignores BDL's
  authoritative `game.week` field and recomputes via `calculateNFLWeekNumber`
  (`lib/nflPickEm.ts:283`), which anchors on "first Thursday in September" =
  **Sept 3, 2026**. The real Week 1 Thursday is **Sept 10**, so the opener would
  be stored and displayed as **"Week 2"**. BDL's `week` field is correct and
  should be trusted instead.
- **The Monday-night game would be missing.** Week 1's games span UTC dates
  `2026-09-10` → `2026-09-15`, but the stored week window is Thu→Mon
  (`week_end_date = week_start_date + 4`, enforced by a CHECK constraint), and
  `listNFLPickEmGames` fetches `fetchNFLGamesFromBDL(weekStartDate, weekEndDate)`
  — iterating Sept 10–14 only. The 8:15pm ET Monday game (`2026-09-15T00:15Z`
  in UTC) falls outside, so **15 of 16 games** would render.
  **Fix:** fetch by `seasons[]` + `weeks[]` instead of by date range —
  verified working: `weeks[]=1&seasons[]=2026` returns exactly 16 games, all
  `week === 1`. This removes the date-window class of bug entirely.

### What needs no change at all

- **Pick submission already works for a future week.** `app/api/nfl-pickem/picks/route.ts`
  has no season/week-status gate, and `submitNFLPickEmPick` only enforces the
  per-game kickoff lock. A Week 1 pick made in July is simply an unlocked pick.
- **Reward *creation* already accepts future weeks.** `resolveNFLSeasonContext`
  filters `weekEndDate >= today`, which a September week satisfies today. Once
  rows exist, the wizard works with zero logic changes.

## Locked product decisions

| Decision | Choice |
| --- | --- |
| Early visibility rule | **Preseason-only exception**: surface the next upcoming week *only when no week has started yet*. In-season behavior (past + current only) is untouched, and the exception self-expires the moment Week 1 opens. |
| Reward shown during the ~6-week gap | **"Upcoming"** — visible to guests, framed as *starts Week 1 · Sept 10*, not presented as currently winnable. |
| Initial data population | Wire the cron, then **run the sync against production** as a one-off so it's live immediately. |
| Week numbering | **Trust BDL's `week` field.** Never recompute from a hardcoded September anchor. |

## Phases

| Phase | Scope | Model / effort |
| --- | --- | --- |
| 0 | **Sync foundation + data.** Trust BDL `week`; derive `week_start_date` from the week's *earliest* game (today it uses `weekGames[0]`, i.e. arbitrary API order); refetch games by `seasons[]`+`weeks[]` so MNF stops disappearing; add `/api/cron/nfl-week-sync` to `vercel.json` (daily). Then run the sync against prod and verify 18 weeks + 16 Week-1 games. | **sonnet / high** |
| 1 | **Preseason visibility.** `buildNFLGameWeekOptions`: when `startedWeeks` is empty, return the earliest upcoming week and mark it current. Pure function — unit-test the three states (preseason / in-season / post-season). Plus `WeekSelector` + `NFLPickEmGameList` copy: "Week 1 opens Sept 10 — lock in your picks early." | **sonnet / high** |
| 2 | **Reward "upcoming" state.** Surface a not-yet-started NFL reward on the venue Rewards panel as upcoming (starts Week 1 · Sept 10) rather than as live-and-winnable. Touches `VenueChallengesPanel` / rewards panel rendering + the terms readback. Fuzziest phase — the campaign is genuinely `is_active` during the gap, so this is presentation, not lifecycle. | **opus / high** |
| 3 | **Verification.** Regression tests for the two correctness bugs (week numbering, MNF presence), then real-browser pass via the `verify` skill: Week 1 renders with all 16 games, a pick saves and persists, partner creates an NFL reward end-to-end. | **opus / high** |

Each phase ends with `npm run build` + `npm test` + `npx tsc --noEmit`.

## As built (2026-07-28) — Phases 0–3 complete, browser verification still pending

**Phase 0 found a THIRD bug the plan didn't predict, and it was the actual
root cause.** `nfl_pickem_weeks` in production was missing its
`UNIQUE (season, week_number)` constraint entirely: the table already existed
when `20260715000000_add_nfl_pickem_weeks.sql` ran, so `CREATE TABLE IF NOT
EXISTS` skipped the whole body — constraint included. Every `syncNFLWeeks`
upsert had always failed with Postgres `42P10`, swallowed by the per-row
`console.error`, reporting "0 weeks synced" as a success. Fixed by
`supabase/migrations/20260728120000_nfl_pickem_weeks_unique_constraint.sql`
(applied). A fourth issue surfaced the same way: the sync's query sent
`seasons` rather than `seasons[]`, which balldontlie silently matches to zero
games — so even with the constraint in place it would have synced nothing.

**Phase 1 needed a server-side gate the plan didn't account for.**
`/api/nfl-pickem/games` carries its OWN `isNFLWeekStarted` check, independent
of the week-list filter. Fixing only `buildNFLGameWeekOptions` would have shown
Week 1 in the dropdown and then 400'd the moment a guest selected it. The
allow rule is now shared via `isPreseasonPreviewWeek` (`lib/nflPickEm.ts`) so
the list and the route cannot drift; the route re-derives it server-side
rather than trusting the client's list, since `weekId` is user-controllable.

**Phase 2** attaches `upcomingStartDate` via `attachNFLRewardUpcomingState`
(`lib/rewards.ts`), applied in `app/api/challenge-campaigns/route.ts`. Both
scopes reduce to one question — "has the first week I cover started?" — so the
helper returns a date and the caller compares it to today in NFL Eastern.
Deliberately does NOT use `listNFLWeeks` (it fires the `update_nfl_week_status`
write RPC on every call); uses the new `getSeasonFirstWeekStartDate` instead,
which costs one indexed read per distinct season and zero when a venue has no
NFL rewards.

**Verified live against production:** 18 weeks synced with correct numbering
(Week 1 → 2026-09-10), `/api/nfl-pickem/games` returns all 16 Week 1 games
including the Monday-nighter, `/api/nfl-pickem/weeks` returns Week 1 with
`isUpcomingPreview: true`.

**Phase 3 regression tests were each confirmed to FAIL against the original
buggy code before being kept** — including making the balldontlie mock honour
`dates[]` filtering, without which the MNF assertion passed vacuously.
1029 tests green, clean typecheck, clean build, no new lint findings.

**Still outstanding:** the real-browser pass (`verify` skill) — Week 1
rendering, a pick saving and persisting, and a partner creating an NFL reward
end-to-end. The "Upcoming" reward card in particular has NOT been seen
rendered: no NFL campaign exists in production yet, so `upcomingStartDate` has
only been exercised by unit tests.

## Constraints

- TypeScript strict, no `any` (note: `syncNFLWeeks`/`fetchNFLGamesFromBDL` already
  carry `any` — Phase 0 touches these; type the new code properly, don't add more).
- `vercel.json` cron **additions** are now auto-allowed by the guard hook
  (`.claude/hooks/guard-vercel-cron.cjs`); changing or removing an existing entry
  still needs explicit permission.
- Do not weaken the in-season retention mechanic
  (`docs/nfl-pickem-improvements-plan.md`) — the exception is preseason-only.
- `generateMockNFLGames` is duplicated byte-for-byte in
  `scripts/seed-nfl-pickem-test-data.cjs`; if Phase 0 changes generation logic,
  change both.

## Known follow-up, explicitly out of scope

`syncNFLWeeks` and `resolveNFLSeasonContext` both key the season off
`new Date().getFullYear()`. In Jan–Feb 2027 that resolves to season **2027**,
which won't exist yet — reward creation would report "season isn't set up"
during the playoffs. Existing 2026 rows are unaffected (the sync upserts, never
deletes). Worth a dedicated fix before January.
