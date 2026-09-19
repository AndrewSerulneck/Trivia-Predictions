# Bingo and Pick ’Em reliability plan — Phase 6 handoff

## Developer summary

Andrew explicitly skipped Phase 6 on September 19, 2026. No historical Bingo board, square, point,
leaderboard entry, reward, challenge accrual or notification was repaired. The Brunswick Grove card
that was stored as lost remains historical evidence and remains unchanged. This is intentional: the
product decision is to make future boards reliable, not to reconcile past boards or rewards.

Nothing in this phase is live because this phase made no runtime or production-data change. Phase 7
is next: verify the complete local release candidate, record what is and is not release-ready, and
leave deployment, physical-device checks and real-game observation accurately owned.

## Next agent: Phase 7 goal, scope and exclusions

Execute **Phase 7 — Integrated checks, release, and final documentation** in
`docs/bingo-pickem-reliability-plan.md`. Recommended model: **GPT-5.6 Sol (`gpt-5.6-sol`), High**.

Run the complete offline gates, focused selector/replay checks, safe read-only provider checks, and a
local server smoke test. Update `CLAUDE.md`, `AGENTS.md`, `SYSTEM_CONTEXT.md`, the current plan and the
dated NFL plans with the verified as-built state. Produce a release record and the Phase 7 handoff.

Explicitly out of scope: any repair of historical boards or consequences; any Phase 6 repair tool;
production database mutation; applying migrations; deploying; changing environment values; or
claiming physical-device/live-game evidence that was not observed. A production migration and
deployment remain separate authorization boundaries.

## Starting state

- Repository: `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch `main`.
- HEAD: `783ebd2f07bffef05e086ef0687ec53f99377dbc` (`Prop Bingo NFL Phase 2: game-day
  re-verification, blockers cleared`).
- All Phase 0–5 work is uncommitted and unpushed in one dirty working tree. Preserve it; do not reset,
  clean or revert unrelated changes.
- Nothing from this plan is deployed. No current release commit or deployment URL exists.
- At the Phase 6 skip handoff, `supabase/migrations/20260914010000_bingo_atomic_grading.sql` was
  local and unapplied. During the authorized Phase 7 follow-up it was applied to linked project
  `pkmxupsayzshvpirkaav` at 2026-09-19T23:48Z and verified; application deployment remains pending.
- No production data was queried or mutated in Phase 6. No backup or undo log was created because no
  repair was prepared or applied. The Phase 1 protected read-only evidence remains under ignored
  `tmp/bingo-incident-private/`, including `2026-09-12T21-50-36-367Z/`; never commit it.
- Last separately recorded production evidence remains the old deployment
  `dpl_4HKutJZ6hgaa7TCpcvQNh4PdC8kv`, source commit
  `d282bd35decbadbbf6d5924477361f6b82fe4e01`. It does not contain this plan.

## Decision made — do not re-ask

Andrew's exact direction was: **“Let's skip Phase 6. It is not necessary to reconcile affected
boards or rewards. We don't need to fix past boards, we just need future boards to work properly
with the improvements from this plan.”**

Consequences of that decision:

1. Card `314a6a4f-762f-499c-ac3a-9ddc2a3cd63a` for Brunswick Grove/game `1392216` stays stored as
   lost even though the sanitized replay finds a winning third column.
2. No points/reward/challenge/notification consequence analysis or repair is required for this plan.
3. Do not build or run a repair script, reopen terminal cards, or ask Andrew to choose the disputed
   “punts downed inside the 20” interpretation.
4. Preserve the audit and private evidence as historical proof and regression input.
5. Future-board correctness still requires the Phase 4 atomic migration before application release.

## Files and artifacts

- Created this handoff: `docs/bingo-pickem-reliability-plan_PHASE_6_HANDOFF.md`.
- Updated the Phase 6 status and top status in `docs/bingo-pickem-reliability-plan.md`.
- No runtime, test, fixture, migration, provider, deployment or production-data artifact was created
  for Phase 6.

## Facts and traps

- Incident identifiers remain venue slug `brunswick-grove`, provider game `1392216`, card
  `314a6a4f-762f-499c-ac3a-9ddc2a3cd63a`, kickoff `2026-09-10T00:20:00Z`.
- Stored outcome: 18 void, six miss, one FREE hit, card lost. Verified replay: 11 hit, 14 miss,
  winning indices `[2, 7, 12, 17, 22]`. This discrepancy is intentionally not repaired.
- “Skipped” means a recorded product decision, not “awaiting repair authorization.” Do not turn it
  back into an open Phase 6 item in status documents.
- The normal progress sweep intentionally does not reopen won/lost cards. Keep that boundary.

## Build, run and test state

Phase 6 required no commands because it was skipped before implementation. Begin Phase 7 from the
verified Phase 5 commands in `docs/bingo-pickem-reliability-plan_PHASE_5_HANDOFF.md`. The most
important offline incident command remains:

```sh
node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs --assert-correct
```

This replay is side-effect-free. It is regression evidence only, not authorization to repair the
stored card.

## Open questions and recommended first steps

There is no open historical-repair question. Do not ask for Phase 6 authorization.

1. Run Phase 7's focused selector tests and full type/lint/test/build gates.
2. Inspect provider scripts for side effects, then run only their read-only checks through the
   existing environment-loading commands without displaying secret values.
3. Record deployment as pending unless Andrew separately authorizes migration and release.
4. Assign physical-device popup placement and real live→final observation to Andrew/release owner if
   this environment cannot perform them.
5. Write `docs/bingo-pickem-reliability-plan_PHASE_7_HANDOFF.md` even if release remains pending.
