# Phase 3 — Week-scope model + reward definition (client-safe)

Read `docs/nfl-pickem-reward-plan.md` first, especially findings #7 and #8 —
they are the two things most likely to be got wrong here.

This phase is pure model + registry. No server I/O, no UI. It is the shared
contract Phases 4 and 5 both validate against, mirroring how
`lib/rewardGameSlots.ts` serves `lib/rewards.ts` and `CreateRewardWizard.tsx`.

## New module: `lib/nflPickEmRewardWeeks.ts`

**No `"server-only"` import, no Supabase dependency** — the wizard and the server
must run the same rules. Read `lib/rewardGameSlots.ts` first and mirror its
structure, its comment density, and its normalize/serialize/validate split.

### The scope type — exactly two shapes, no third

```ts
export type NFLRewardWeekScope =
  | { kind: "weekly"; season: number }
  | { kind: "season"; season: number; fromWeek: number };
```

- **`weekly`** — the reward runs as its own contest **every** NFL week it is
  active. Cadence `"weekly"`, one cycle per NFL week.
- **`season`** — a single contest over the remainder of the season, starting at
  `fromWeek` (the current or next week at creation time). Cadence `"none"`, one
  cycle.

There is **no** arbitrary week list and no start/end week range. A partner cannot
express "Weeks 12–16". If you find yourself adding a `weekNumbers: number[]`
field, stop — that is the shape this plan explicitly rejects.

### Exports

- `NFL_REWARD_WEEK_SCOPE_KINDS` — the two kind literals.
- `isNFLRewardWeekScopeKind(value: unknown)`.
- `normalizeNFLWeekScope(value: unknown): NFLRewardWeekScope | null` — reads the
  jsonb column. Malformed → `null`. Unlike `normalizeGameWinnerSlots`, **null here
  means "not an NFL reward"**, not a legacy fallback; there is no legacy row to
  preserve, so fail closed.
- `serializeNFLWeekScope(scope): NFLRewardWeekScope | null`.
- `deriveNFLWeekScopeTerms(scope, opts)` → the engine mapping (below).
- `describeNFLWeekScope(scope, winCondition, quantity)` → confirm-screen readback.
- Message constants for every refusal, in the style of
  `GAME_SLOTS_NONE_SELECTED_MESSAGE`.

### Engine mapping — `deriveNFLWeekScopeTerms`

This is the part that must be exactly right. Return:

```ts
{
  cadence: CampaignRecurringType;   // "weekly" | "none"
  activeDays: string[];
  quota: number;
  startDate: string | null;         // YYYY-MM-DD
  endDate: string | null;           // YYYY-MM-DD
}
```

Rules:

**`activeDays` — all seven days, Thursday first, for BOTH kinds:**
```ts
["thu", "fri", "sat", "sun", "mon", "tue", "wed"]
```
Two independent reasons, both verified in `lib/challengeCampaigns.ts`:

1. `computeCycleStart` (line ~647) anchors a weekly cycle on **`activeDays[0]`**.
   An NFL week runs Thursday→Wednesday, so `"thu"` must be first. Anchoring on
   Sunday would split every NFL week across two reward cycles.
2. `isCampaignEligibleAtTime` (line ~822) **blocks point accrual entirely** on any
   weekday absent from `activeDays`. NFL games settle Thursday, Sunday and Monday
   (and occasionally Friday/Saturday late in the season), so all seven must be
   present or Phase 6's accrual silently drops picks.

**Do not** build this list with `weekdaysForSlots` or by filtering
`REWARD_WEEKDAY_KEYS` from `lib/rewardGameSlots.ts` — both emit Sunday-first order
and would break rule 1. Write the literal, and comment why.

**`quota`:**
- `winCondition === "game_winner"` → **always exactly 1**, both kinds. One venue,
  one week (or one season), one winner. Reject any other value with a clear
  message; do not silently clamp.
- `winCondition === "points_threshold"` → the partner's chosen quantity,
  range-checked against `REWARD_MAX_QUANTITY` from `lib/rewardTerms.ts`.

**`cadence`, `startDate`, `endDate`:**
- `weekly` → cadence `"weekly"`, `startDate`/`endDate` `null` (the weekly cycle
  math owns the boundaries).
- `season` → cadence `"none"`. `startDate` = the `week_start_date` of `fromWeek`;
  `endDate` = the `week_end_date` of the season's final week. Both are passed in
  via `opts` by the caller (Phase 4 supplies them from `nfl_pickem_weeks`) —
  this module must stay I/O-free. **These are mandatory for `season`**: with
  `recurringType: "none"` and no `startDate`, `computeCycleStart` returns the
  epoch sentinel and `getCampaignCloseTimestampMs` returns `null`, so the reward
  would never close. Refuse a `season` scope whose dates weren't supplied.

### Readback copy — `describeNFLWeekScope`

Must state the 3-picker rule (see the plan's locked decisions). Examples:

- weekly + game_winner:
  *"Each week, the guest with the most correct NFL picks at your venue wins this
  reward — 1 winner per week. Ties are broken by the weekly tiebreaker question.
  A week with fewer than 3 players making picks has no winner."*
- season + game_winner:
  *"At the end of the season, the guest with the most correct NFL picks at your
  venue wins this reward — 1 winner for the season. Ties are broken by the final
  week's tiebreaker question. A season with fewer than 3 players making picks has
  no winner."*
- weekly + points_threshold:
  *"Each week, the first {quantity} guests to get {threshold} NFL picks right win
  this reward."*
- season + points_threshold:
  *"The first {quantity} guests to get {threshold} NFL picks right this season win
  this reward."*

## Registry entry

Add to `REWARD_DEFINITIONS` in `lib/rewardDefinitions.ts`:

```ts
{
  id: "nfl_pickem_challenge",
  name: "NFL Pick 'Em Challenge",
  gameType: "nfl-pickem",
  challengeMode: "progress",
  requiresScheduledGame: null,      // gates on the NFL season, not a venue schedule
  requirementTemplate: "Get {threshold} NFL picks right",
  supportsGameWinner: true,
  gameWinnerRequirement: "Get the most NFL picks right at this venue",
  thresholdOptions: [5, 10, 25, 50],
  defaultThreshold: 10,
  accent: "pickem",
  glyph: "🏈",
}
```

Extend `RewardDefinitionId` to `"live_trivia_challenge" | "nfl_pickem_challenge"`.

**Threshold step problem:** `isValidRewardThreshold` currently requires a multiple
of 10 (`REWARD_THRESHOLD_STEP`), which is correct for Live Trivia points but wrong
for a correct-picks count ("get 25 picks right"). Make the step **per-definition**:
add `thresholdStep: number` to `RewardDefinition` (10 for Live Trivia, 1 for NFL)
and change `isValidRewardThreshold(threshold, definition)` to read it. Update every
caller, including `REWARD_THRESHOLD_NOT_MULTIPLE_OF_TEN_MESSAGE` in
`lib/rewards.ts` — make that message definition-aware rather than hardcoding "10".

## De-hardcode the Live Trivia copy in `lib/rewardTerms.ts`

That module names "Live Trivia" in ~8 user-facing strings and in
`renderTermsSentence`. Parameterize them off a game label supplied by the caller
(default `"Live Trivia"` so existing behavior and existing tests are unchanged).
This is a mechanical refactor — do not change any rule, only the copy source.

NFL rewards do **not** route through `validateRewardTerms` at all (they have no
venue schedule to judge against); this refactor exists so the wizard can render
consistent copy, not so NFL borrows the Live Trivia rules.

## Tests

New `tests/lib.nfl-pickem-reward-weeks.test.ts`:

- `activeDays` is exactly `["thu","fri","sat","sun","mon","tue","wed"]` for both
  kinds — **assert the order explicitly, index 0 is `"thu"`**.
- `game_winner` quota is forced to 1; a request for 2 is refused with a message.
- `season` without supplied dates is refused; with them, `startDate`/`endDate`
  match the inputs and cadence is `"none"`.
- `weekly` yields cadence `"weekly"` and null dates.
- `normalizeNFLWeekScope` rejects arrays, scalars, unknown `kind`, and a
  non-numeric `season`.
- Round-trip `serialize(normalize(x)) === x` for both valid shapes.
- A regression test that no exported function can produce a scope carrying a week
  list or a week range.

Also confirm the existing Live Trivia reward tests still pass unchanged after the
`thresholdStep` and copy refactors — if any needed edits, note it in the run log.

## Constraints

- No `"server-only"`, no Supabase import in `lib/nflPickEmRewardWeeks.ts`.
- No `any`. Absolute `@/` imports. Arrow functions for utilities.
- Do not touch `proxy.ts`, `lib/supabaseAdmin.ts`, `vercel.json`, or migrations.

## Acceptance

- `npx tsc --noEmit`, `npm run build`, `npm test` pass.
- The new definition appears in `REWARD_DEFINITIONS` but is not yet creatable
  (Phase 4 wires the server path) — that is expected at the end of this phase.
