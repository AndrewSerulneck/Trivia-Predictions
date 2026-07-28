# Phase 0 — Foundations: game type, week-scope column, seed data

Read `docs/nfl-pickem-reward-plan.md` first.

Nothing user-visible ships in this phase. It removes the three blockers every
later phase would otherwise hit independently.

## 1. Add `"nfl-pickem"` as a challenge game type

- `types/index.ts:157` — add `| "nfl-pickem"` to the `ChallengeGameType` union.
- `lib/challengeCampaigns.ts:268` — add `"nfl-pickem"` to `VALID_GAME_TYPES`
  (typed `Array<Exclude<ChallengeGameType, "trivia">>`, so the union change alone
  will not satisfy the compiler at the call sites that iterate it).
- Grep for other places that enumerate game types exhaustively (admin campaign
  forms, `lib/ownerCompetitionTemplates.ts`, any `Record<ChallengeGameType, …>`)
  and add the member wherever a non-exhaustive map would now fail typecheck.
  **Do not** add NFL Pick 'Em to `lib/ownerCompetitionTemplates.ts` as a new
  owner Competition template — Competitions are a separate, retired-from-creation
  surface; this feature ships through Rewards only.

**No migration is needed for the game type.**
`supabase/migrations/20260715000200_add_nfl_pickem_game_types.sql` already permits
`'nfl-pickem'` in `challenge_campaigns_game_types_valid`. Verify this by reading
that file; do not write a second constraint migration.

## 2. New migration: `challenge_campaigns.nfl_week_scope`

Create **one new** migration file, named
`supabase/migrations/20260727120000_rewards_nfl_week_scope.sql` (adjust the
timestamp so it sorts after `20260726120100_award_cycle_winner_prize_snapshot.sql`).

Model it closely on `20260725120000_rewards_game_winner_slots.sql` — same additive,
NULL-means-legacy, shape-constrained style.

```sql
alter table challenge_campaigns
  add column if not exists nfl_week_scope jsonb;
```

Add a check constraint named `challenge_campaigns_nfl_week_scope_shape` allowing
only: `null`, **or** a jsonb object whose `kind` is `'weekly'` or `'season'` and
which carries an integer `season`. Reject arrays, scalars, and unknown `kind`
values. Add a `comment on column` explaining that NULL means "not an NFL Pick 'Em
reward" and that only `reward_definition_id = 'nfl_pickem_challenge'` campaigns
ever read it.

Then wire the column through the existing plumbing in `lib/challengeCampaigns.ts`,
following exactly how `game_winner_slots` is threaded:

- add `nflWeekScope?: NFLWeekScope | null` to the `ChallengeCampaign` interface in
  `types/index.ts` (type it as `unknown`-free; define
  `export type NFLWeekScope = { kind: "weekly"; season: number } | { kind: "season"; season: number; fromWeek: number }`
  in `types/index.ts` alongside `ChallengeGameWinnerSlot`),
- select it in the campaign row select list,
- map it in the row→campaign mapper,
- accept it in `createChallengeCampaign` and write it to the row,
- accept it in `updateChallengeCampaign` if `game_winner_slots` is handled there.

Do **not** add validation logic here — Phase 3 owns the normalizer. This phase
only makes the column round-trip.

## 3. Extend the dev seed

`scripts/seed-nfl-pickem-test-data.cjs` already seeds weeks 997/998/999 and four
`nflsim_` users. Extend it so later phases are actually verifiable:

- Guarantee the seeded users end a completed week with **distinct** correct-pick
  counts (a clear #1) in week 997, and an **exact tie for first** in week 998.
  Phase 7 needs both cases to test winner resolution and the tiebreaker.
- Ensure at least **3 distinct users have picks** in each completed week, and add
  a **fourth week (996)** where only **2** users made picks — Phase 7's minimum
  participation gate needs a negative case.
- Keep the existing `generateMockNFLGames` mirroring intact (the file header
  documents that it is duplicated byte-for-byte from `lib/nflPickEm.ts` — if you
  change the generation logic, change both).
- Update `scripts/unseed-nfl-pickem-test-data.cjs` to clean up week 996 too.

Print a summary at the end of the seed (week number → per-user correct counts) so
later phases can assert against it without re-deriving.

## Constraints

- No `any`. Absolute `@/` imports in TS.
- Do not modify existing files under `supabase/migrations/` — create the new one only.
- Do not touch `proxy.ts`, `lib/supabaseAdmin.ts`, or `vercel.json`.

## Acceptance

- `npx tsc --noEmit`, `npm run build`, `npm test` all pass.
- `node --env-file=.env.local scripts/seed-nfl-pickem-test-data.cjs <venueId>` runs
  and prints the per-week/per-user correct-pick summary described above.
- A campaign created with `gameTypes: ["nfl-pickem"]` and an `nflWeekScope` value
  round-trips through `createChallengeCampaign` → `listChallengeCampaigns`
  unchanged. Add a test asserting this.
