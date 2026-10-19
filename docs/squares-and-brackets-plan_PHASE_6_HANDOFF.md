# Squares + Brackets — Phase 6 handoff (review step; fixes planned as 6.1–6.9)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 6 has sub-phases 6.1–6.9; §13 has the
findings). **Next:** 6.1, Opus 5.5 · medium, **urgent**.

## For Andrew (plain English)

- **What happened:** Phase 5 (the TV view) is committed. I then ran the code review over everything built for Squares
  so far and checked each finding by hand. As you asked, I didn't patch them in place: each problem now has a designed
  fix, written into the plan as its own step (6.1–6.4), followed by the live-game check, the rehearsal, your phone
  pass and the launch (6.5–6.9). I also wrote your phone/TV checklist (`docs/squares-and-brackets-device-checklist.md`,
  section A), which you'll use during the rehearsal.
- **One problem is live today and isn't a Squares problem.** The nightly job that hands out "winner of the Live
  Trivia game" prizes doesn't check what kind of prize it's handing out. At Pacific Street, your **NFL Pick 'Em
  "most picks right" weekly prize** is in its reach. The only thing that has stopped it so far is that prize's
  3-player minimum: the first Live Trivia game there with 3 or more players would give the NFL prize to the trivia
  winner, and again every week. A Squares prize would be caught the same way once the switch is on. The fix (6.1) is
  small and needs no database change. **It needs you to push and deploy**, ideally before Friday's trivia night
  (Oct 23). Pushing `main` also ships the four Squares commits; they're switched off and their database changes are
  already applied, so nothing changes for anyone.
- **The other findings** only matter once Squares is switched on or at a bigger scale. Examples: a rehearsal could
  pay a real partner's prize; archiving the game too early would blank everyone's board; a correction made the
  morning after the game would never be re-scored. All are planned (6.2–6.4). 6.2 includes one database change for
  you to apply.
- **Is it live?** No Squares change is live. The Squares switch is still off. Nothing pushed or deployed.
- **Cost:** no change from this phase. After 6.3, the server stops making about 4,000 empty database reads a day
  during the days after the game.

---

## For the next agent

### 1. Next phase goal and scope
**6.1 (plan §4 Phase 6):** make every prize sweep pay only its own kind of prize. Live Trivia's
`resolveGameWinnerRewards` (`lib/liveTriviaWinnerRewards.ts`) must accept only `rewardDefinitionId ===
"live_trivia_challenge"`, through one predicate `isLiveTriviaGameWinnerCampaign` mirroring `isNFLWeekWinnerCampaign`
(`lib/nflPickEmWinnerRewards.ts:287`). Audit every `awardCycleWinner` caller (`lib/challengeCampaigns.ts`,
`lib/nflPickEmWinnerRewards.ts`, `lib/squaresPrizeAwards.ts`, `lib/liveTriviaWinnerRewards.ts`). Add behaviour tests
plus `tests/prize-sweep-ownership-contract.test.ts`. No migration.
**Out of scope for 6.1:** everything in 6.2–6.9 (Squares lifecycle, payment chunks, screens, rehearsal). Don't fold
them in: 6.1 has to ship alone and fast.

### 2. Starting state
- Branch `main`. Commits this session: `01b87ad` (Phase 5). Phase 6's docs are **uncommitted** (Andrew asked only
  for the Phase 5 commit): `docs/squares-and-brackets-plan.md` (status line, "Needs you", Phase 6 section, §13),
  `docs/squares-and-brackets-device-checklist.md` (new), this file (new), one `CLAUDE.md` bullet in the Squares
  section.
- Local `main` is **4 commits ahead of `origin/main`** (`863a9b6`, `0565068`, `8783a7c`, `01b87ad`: Squares 0–5,
  flags off). The F1 code is on `origin/main` (deployed), so the NFL exposure is live.
- Uncommitted and NOT ours, leave alone: `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `lib/pos/providers.ts`, and the first `CLAUDE.md` hunk (POS/Toast note). Stage our files only; for `CLAUDE.md`,
  use a hunk patch (`git diff CLAUDE.md` → keep only the Squares hunk → `git apply --cached`).
- Data: nothing written. Read-only production checks only (below). `squares_events` has **0 rows**.
- Phase 0 live-capture pollers still running: PID 71943 (`1392308`, WSH @ SF, kickoff 2026-10-20T00:15Z) and PID 71944
  (`1392309`, NE @ CHI, 2026-10-23T00:15Z), waiting; logs `.scratch/nfl-live-capture-<id>.log`.

### 3. Decisions already made
- **Andrew (2026-10-19, this session):** review findings are not patched in place. Each gets a designed fix as its
  own plan phase, numbered from 6.1. Follow that for 6.6's re-review too (6.6.1, …).
- Order: 6.1 alone first (live problem); 6.2 → 6.3 → 6.4 after; 6.3 uses 6.2's migration columns, so do 6.2 first.
- One migration for all of 6.2/6.3 (`purpose`, `reopened_at`, `credit_blocked_at`/`credit_blocked_note`, replaced
  `squares_claim` + `squares_void_moment`) so Andrew runs `supabase db push` once.
- A rehearsal's main guard is in SQL: `squares_claim` refuses a `rehearsal` event at any venue that isn't hidden, so no
  real venue ever gets a rehearsal board, points, prize or Results row.
- The public flag must never be on in Production before 6.9: `isSquaresPrizeOffered` has no start date, so the
  Squares prize would show in every partner's wizard. Rehearsal UI runs on a Preview.
- All earlier decisions (plan §1, Phase 2–5 handoffs) still stand.

### 4. Files created or changed (this session)
- Committed in `01b87ad`: the Phase 5 files (see `docs/squares-and-brackets-plan_PHASE_5_HANDOFF.md` §4), with the plan
  status and that handoff's "Starting state" line updated to say committed.
- New: `docs/squares-and-brackets-device-checklist.md` (section A = Squares, A1–A8; section B is a placeholder for
  Phase 10), `docs/squares-and-brackets-plan_PHASE_6_HANDOFF.md`.
- Changed: `docs/squares-and-brackets-plan.md` (status, "Needs you", phase table row 6, §4 Phase 6 rewritten with
  6.1–6.9, new §13), `CLAUDE.md` (one Squares bullet).
- No code changed.

### 5. Facts and traps discovered
- **F1 production evidence (read-only, 2026-10-19):** `game_winner` prizes in production: one `live_trivia_challenge`
  (`16f3b066-…`, Pacific Street, slots = Fri schedule `4b449b74-…`), one `nfl_pickem_challenge` (`ceceade0-…`, Pacific
  Street, slots **null**, weekly, `min_players` 3, created 2026-10-02T16:32Z). No `game_winner` prize has a null
  definition (only `points_threshold` ones do). Neither has `challenge_cycle_winners` rows. Pacific Street's trivia
  schedules: weekly Friday `4b449b74-…` and one-offs. The live trivia sweep cron is `/api/cron/resolve-live-trivia-winners`.
- Points accrual already skips non-`points_threshold` prizes (`lib/challengeCampaigns.ts:2555`), and the slot cascade
  skips null slots (`lib/rewardGameSlotCascade.ts:201`), so those don't catch Squares/NFL prizes.
- Column names that tripped me: `challenge_cycle_winners` has no `user_id`/`created_at` (select `*`);
  `live_showdown_answers` has no `created_at`; schedules are `trivia_schedules`.
- The code review's findings came back unverified; my check of each is in plan §13 (F8 is only reachable through
  another bug).
- `/verify` (repo skill) targets player game pages. For Phase 5 I checked instead: `GET /api/venue-screen/state?venueId=venue-hightop-test`
  on Andrew's running dev server answers `mode: "idle"` with `s-maxage=15`; `npx tsc --noEmit` clean;
  `tests/squares-tv.test.ts` + `tests/venue-screen-reliability.test.ts` 18/18. (Phase 5's own full run: 4,998 pass.)
- iCloud `* 2` copies in `.next/types`: `find .next/types -name "* 2*" -delete` before `tsc`.
- Andrew's `next dev` holds :3000. Never `pkill next-server`.

### 6. Build / test
- Standard: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not tsc and build at once).
- 6.1: `npx vitest run tests/lib.live-trivia-winner-rewards.test.ts tests/api.cron.resolve-live-trivia-winners.test.ts`
  plus the new contract test.
- 6.2: `npm run test:squares-sql` (PGlite) for the migration; `npm run test:account-deletion-sql` if any users FK
  changes (none planned).
- Unverified this session: nothing was run for the findings beyond reading code and the read-only queries above.

### 7. Open questions for Andrew
- **6.1 deploy:** OK to push `main` (includes the four Squares commits, switched off) and deploy once 6.1 is done?
- Optional, no rush: should partners be able to set up a Squares prize before Jan 25? Today it's offered whenever the
  flag is on, which is only from the launch. Recommendation: leave it.

### 8. Recommended first steps for 6.1
1. Read `lib/liveTriviaWinnerRewards.ts` (sweep, ~lines 180–350) and `isNFLWeekWinnerCampaign` in
   `lib/nflPickEmWinnerRewards.ts`.
2. Add the predicate and constant; filter at line ~213; grep every `awardCycleWinner(` caller and confirm each guards
   on its own definition.
3. Tests: a Squares prize and the NFL prize at a venue with a finished 3-player trivia game are not awarded; the Live
   Trivia prize still is. Contract test over the callers.
4. Full gates, commit, write `docs/squares-and-brackets-plan_PHASE_6.1_HANDOFF.md`, ask Andrew to push and deploy.
Model: Opus 5.5, effort medium.
