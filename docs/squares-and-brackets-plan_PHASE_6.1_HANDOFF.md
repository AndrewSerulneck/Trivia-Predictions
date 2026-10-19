# Squares + Brackets — Phase 6.1 handoff (each prize sweep pays only its own kind of prize)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 6, sub-phase 6.1; finding F1 in §13).
**Next:** 6.2, Opus 5.5 · high.

## For Andrew (plain English)

- **What changed:** the job that hands out "winner of the Live Trivia game" prizes now only hands out Live Trivia
  prizes. Your NFL Pick 'Em "most picks right" prize at Pacific Street, and any future Super Bowl Squares prize, can
  no longer go to a trivia winner. The weekly 1st/2nd/3rd trivia prize job got the same check, and so did the Squares
  and NFL jobs, so each one only pays its own prizes. A new automatic test fails if a future prize job forgets this.
- **Nothing real is skipped:** I checked production. Every "winner" and "1st/2nd/3rd" prize there is labelled with its
  game, so the stricter check drops nothing that should be paid. Points-target prizes (the older "earn N points"
  kind) are untouched.
- **Is it live?** No. It is committed on this computer only. **Needs you: push `main` and deploy, ideally before
  Friday's trivia night at Pacific Street (Oct 23).** Pushing also ships the five earlier Squares commits; Squares is
  switched off and its database changes are already applied, so nobody sees anything new.
- **After Friday:** I (or the next agent) can check that the NFL prize still has no winners recorded from a trivia
  night.
- **Cost:** no change (no new reads; the filter runs on data already loaded).

---

## For the next agent

### 1. Next phase goal and scope
**6.2 (plan §4 Phase 6 → "6.2 — Squares event lifecycle"):** rehearsal vs Super Bowl events (`purpose`), archive
guard, late voids re-graded (`reopened_at`), the rehearsal switch, plus the `credit_blocked_*` columns 6.3 needs —
all in ONE new migration so Andrew runs `supabase db push` once. The plan section lists the exact columns, the
replaced `squares_claim` / `squares_void_moment`, and the code changes.
**Out of scope:** 6.3 (chunked payment writes, stuck results, idle reads), 6.4 (player screen after a void),
6.5–6.9. Don't touch the 6.1 sweep code.

### 2. Starting state
- Branch `main`. Commits this session: `0af6f13` (Phase 6 review docs) and the 6.1 commit (message
  `fix(rewards): each prize sweep pays only its own kind of prize (squares plan 6.1)`; `git log -1 --grep "plan 6.1"`).
- Local `main` is **6 commits ahead of `origin/main`** (`863a9b6`, `0565068`, `8783a7c`, `01b87ad`, `0af6f13`, 6.1).
  Nothing pushed or deployed. F1 stays live in production until Andrew pushes + deploys.
- Uncommitted and NOT ours, leave alone: `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `lib/pos/providers.ts`, and the POS/Toast hunk at the top of `CLAUDE.md`'s POS section. Stage our files only; for
  `CLAUDE.md` use a hunk patch (`git diff CLAUDE.md` → keep the Squares hunk → `git apply --cached --recount`).
- Data: nothing written. One read-only production query (below). `squares_events` still has 0 rows.

### 3. Decisions already made
- Plan §1 and the Phase 6 handoff §3 still stand (findings get designed fixes as sub-phases; 6.2 before 6.3; one
  migration for 6.2/6.3; rehearsal's main guard is in SQL; public flag never on in Production before 6.9).
- 6.1 choices: strict definition match everywhere (a prize with a null definition is never paid by a game sweep);
  the points-target path in `applyChallengeCampaignPoints` stays routed by game type, not definition, because legacy
  points targets have a null definition (3 active in production) and it already never pays a non-`points_threshold`
  prize.

### 4. Files changed in 6.1
- `lib/rewardDefinitions.ts`: new `LIVE_TRIVIA_REWARD_DEFINITION_ID` (client-safe; the registry entry uses it).
- `lib/liveTriviaWinnerRewards.ts`: new exported `isLiveTriviaGameWinnerCampaign(campaign)` (active, no winner,
  `game_winner`, Live Trivia definition, non-empty venues — mirror of `isNFLWeekWinnerCampaign`); the sweep's campaign
  collection uses it. Header comment "OWNERSHIP" explains why.
- `lib/liveTriviaRankedRewards.ts`: new exported `isLiveTriviaRankedCampaign`; the weekly-places sweep filters
  `listActiveRankedPlaceCampaigns()` with it (silently: another game's prize is not a config error).
- `lib/rankedRewardBackfill.ts`: `planRankedRewardBackfill` only finds a Live Trivia ranked prize.
- `lib/squaresPrizeAwards.ts`: in-memory `rewardDefinitionId === SQUARES_PRIZE_DEFINITION_ID` check beside the read's
  own `.eq("reward_definition_id", …)`.
- `lib/nflPickEmWinnerRewards.ts`: unchanged (already guarded by `isNFLWeekWinnerCampaign`).
- Tests: `tests/prize-sweep-ownership-contract.test.ts` (new: every file under `lib/`/`app/` that `await`s
  `awardCycleWinner` / `awardRankedCyclePlaces` must be in its map with its own definition check; a new paying file
  fails until added). New cases in `tests/lib.live-trivia-winner-rewards.test.ts` (Squares + NFL + Live Trivia prize at
  one venue, 3-player game → only Live Trivia paid; null definition never paid), `tests/lib.live-trivia-ranked-rewards.test.ts`,
  `tests/lib.ranked-reward-backfill.test.ts`, `tests/lib.squares-prize-awards.test.ts` (its fixture now sets
  `rewardDefinitionId: "squares_challenge"`, as a real row does).
- Docs: plan status line + 6.1 "Built" note, `CLAUDE.md` Squares Phase 6 bullet, this file.

### 5. Facts and traps
- **Production, read-only, 2026-10-19:** `challenge_campaigns` by (win condition | definition | active-and-unresolved):
  `game_winner|live_trivia_challenge|true` 1, `game_winner|nfl_pickem_challenge|true` 1,
  `ranked_places|live_trivia_challenge|true` 1, `points_threshold|null|true` 3, `points_threshold|null|false` 4.
  So the strict checks drop nothing real.
- To query production: write a small `.mjs` (supabase-js, `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
  and run `node --env-file=.env.local <file>` from the repo root (it must resolve `node_modules`); delete it after.
  Never print `.env.local`.
- The contract test's regexes are literal: renaming a predicate or reformatting the filter line means updating the
  map in the test, not loosening it.
- `/verify` (repo skill) drives player game pages in a browser; 6.1 has no page (cron sweeps only), so it was not run.

### 6. Build / test (all run 2026-10-19, after the change)
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **5,012 pass / 13 skipped / 0 fail** (417 files);
  `npm run build` succeeds. Don't run tsc and build at the same time.
- Focused: `npx vitest run tests/prize-sweep-ownership-contract.test.ts tests/lib.live-trivia-winner-rewards.test.ts
  tests/lib.live-trivia-ranked-rewards.test.ts tests/lib.ranked-reward-backfill.test.ts tests/lib.squares-prize-awards.test.ts
  tests/lib.nfl-pickem-winner-rewards.test.ts tests/api.cron.resolve-live-trivia-winners.test.ts`.
- Unverified: behaviour in production (needs the deploy). After the next Pacific Street trivia night with a deploy in
  place, check `challenge_cycle_winners` has no row for the NFL prize `ceceade0-…` dated that night.

### 7. Open questions for Andrew
- Push `main` + deploy (ships 6.1 and the switched-off Squares commits) before Fri Oct 23?
- Unchanged from Phase 6: Squares prize setup before Jan 25? Recommendation: leave it.

### 8. Recommended first steps for 6.2
1. Read plan §4 "6.2" in full, §13 F3–F5, and `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` (no new table is
   planned, but replaced functions keep their grants).
2. `supabase migration new squares_event_lifecycle`; replace `squares_claim` and `squares_void_moment` in the new file
   (never edit `20261019045030` / `20261019051458`). Prove it in `npm run test:squares-sql` (PGlite) first.
3. Code: `purpose` set by discovery / admin create; REHEARSAL badge; `rehearsal_only` copy; `squaresPrizeCoversEvent`
   hidden-venue guard; discovery skips archived games; archive guard; late-void watch via `reopened_at`;
   `isSquaresRehearsalEnabled()`.
4. Full gates, commit, handoff `docs/squares-and-brackets-plan_PHASE_6.2_HANDOFF.md`, then ask Andrew to run
   `supabase db push`.
Model: Opus 5.5, effort high.
