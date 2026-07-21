# AGENTS.md — Hightop Challenge

This file exists because some agent tools look for `AGENTS.md` by convention.
The canonical project rules live in **`CLAUDE.md`** (hard boundaries, code
style, naming rules) and **`SYSTEM_CONTEXT.md`** (architecture, product
direction) — read both before starting any task. This file does not duplicate
them; it only documents the one recurring, well-defined process below.

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
