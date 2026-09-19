# AGENTS.md — Hightop Challenge

**Be concise by default.** Keep responses short — direct answers, no restating the task, no trailing summaries unless asked.

This file exists because some agent tools look for `AGENTS.md` by convention.
The canonical project rules live in **`CLAUDE.md`** (hard boundaries, code
style, naming rules) and **`SYSTEM_CONTEXT.md`** (architecture, product
direction) — read both before starting any task. This file does not duplicate
them; it documents recurring processes and active implementation-plan pointers below.

## Phase handoffs and planned Bingo / Pick ’Em work

For every multi-phase plan, write `<PLAN_NAME>_PHASE_<N>_HANDOFF.md` next to the
plan before marking a phase complete; also write one when stopping part-way.
Update the plan's status to link it. Open with a plain-English developer summary,
then give the next agent the scope, branch/commit/deployment/data state, decisions,
changed paths/functions, traps, exact test/run commands and results, open questions,
and recommended next steps/model/effort. Assume no conversation context.

Current plan: `docs/bingo-pickem-reliability-plan.md` (2026-09-12). **Complete and
developer-accepted (2026-09-19): Andrew confirmed authenticated Prop Bingo works after the
atomic migration. Phase 6 was intentionally skipped; do not repair historical boards,
rewards or consequences. All offline gates pass. Physical-device and real-game timing checks
are optional operational monitoring, not unfinished plan phases.** Final handoff:
`docs/bingo-pickem-reliability-plan_PHASE_7_HANDOFF.md`. Release record:
`docs/bingo-pickem-reliability-release-record-2026-09-19.md`. Quality evidence:
`docs/bingo-board-quality-calibration-2026-09-19.md`. Incident audit:
`docs/bingo-brunswick-grove-2026-09-09-audit.md`; executable contract/inventory:
`docs/bingo-grading-capability-matrix.md`. Preserve ignored private evidence under
`tmp/bingo-incident-private/`; never commit player/consequence records.

Application release commit `62f027cd46528d771e154ccb5cc75df24f6d8173` is pushed to
`origin/main`. The linked database migration is applied; deployment status was not independently checked.

Adding a supported square requires a precise label, provider fields and IDs, a sanitized
real capture, hit/miss/boundary/missing/partial/correction regressions, and admission in
`lib/sportsBingoCapabilities.ts` before generation. Run all-four-league grading checks
and the original incident replay. Odds alone are not capability evidence. Preserve
legacy parsing; terminal-card corrections never belong in the active sweep. The new
`20260914010000_bingo_atomic_grading.sql` was applied to linked project `pkmxupsayzshvpirkaav`
at 2026-09-19T23:48Z and verified. Do not reapply or down-migrate it. Final release must add exact commit/deployment and
live/device verification facts to the Phase 7 handoff, release record and these context files.

## Adding a new Reward definition

The Rewards system (`docs/rewards-system-plan.md`) lets a venue offer a
pre-set challenge — complete a requirement within a time window, win a prize —
by picking from a slate of **reward definitions** rather than authoring one
free-form. Today there is one definition, the Live Trivia Challenge. To add
another:

1. **Add one entry to `REWARD_DEFINITIONS`** in `lib/rewardDefinitions.ts`:
   `id`, `name`, `gameType` (which game's points count), `challengeMode`
   (`"progress"` — leaderboard mode is retired from creation),
   `requiresScheduledGame` (the `OwnerScheduleGameType` the venue must already
   run, or `null` if the reward gates on nothing), `requirementTemplate`
   (player-facing copy, `{threshold}` substituted at expansion),
   `thresholdOptions` + `defaultThreshold`, `accent`, and `glyph`.
2. **Only if `requiresScheduledGame` points at a game with no existing lookup
   yet**, add a schedule lookup in `lib/rewards.ts` (mirror
   `getVenueLiveTriviaSchedules`) and wire it into
   `resolveRewardCreationContext` alongside the existing `live_trivia`
   branch. If the new definition's `requiresScheduledGame` is `null`, or
   reuses a game that's already wired, skip this step entirely.
3. **Nothing else changes.** The Create Reward wizard
   (`components/rewards/CreateRewardWizard.tsx`), both hosts (admin
   `ChallengesSection.tsx` and Partner Dashboard `app/owner/competitions/page.tsx`),
   `createReward()`'s expansion into `challenge_campaigns`, the multi-winner
   engine, the venue Rewards panel card states, and `PrizeWalletPanel`
   redemption rendering are all definition-agnostic — they read the registry,
   not a hardcoded list.
4. Add a Vitest case to `tests/lib.rewards-definitions.test.ts` for the new
   definition's cadence resolution and `createReward` expansion.

Full rationale, the prize/quota data model, and the multi-winner ledger design
are in `docs/rewards-system-plan.md` (§3–§4).
