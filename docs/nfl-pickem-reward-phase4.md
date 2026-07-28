# Phase 4 — Server creation path

Read `docs/nfl-pickem-reward-plan.md` and `docs/nfl-pickem-reward-phase3.md`
first. This phase makes `nfl_pickem_challenge` actually creatable.

The hard part is that `lib/rewards.ts` currently assumes **every** reward gates on
a Live Trivia venue schedule. NFL gates on the NFL season calendar instead. Split
that assumption cleanly rather than bolting NFL onto the Live Trivia path.

## 1. Generalize `RewardCreationContext`

Today it carries `scheduled`, `hasRecurringSchedule`, `scheduleDays`, `timezone`,
`allowedCadences`, `scheduleShapes`, `gameSlots` — all Live-Trivia-shaped.

Add an NFL branch without disturbing the existing fields (the wizard's Live Trivia
path must keep working byte-for-byte). Suggested shape:

```ts
/** Present only for definitions whose gate is the NFL season. */
nflSeason?: {
  season: number;
  /** The week a season-long reward would start from (current, else next). */
  fromWeek: number;
  fromWeekStartDate: string;   // YYYY-MM-DD
  seasonEndDate: string;       // YYYY-MM-DD — last week's week_end_date
  /** Weeks remaining, for the wizard's readback ("13 weeks left this season"). */
  weeksRemaining: number;
} | null;
```

In `resolveRewardCreationContext`, branch on the definition:

- `requiresScheduledGame === "live_trivia"` → today's path, untouched.
- `definition.id === "nfl_pickem_challenge"` → read `nfl_pickem_weeks` for the
  current season (see how `listNFLWeeks` / `getCurrentNFLWeek` in
  `lib/nflPickEm.ts` resolve the season and the current week — reuse them, do not
  re-query raw). Set `scheduled = true` only if the season has at least one
  current-or-future week; `allowedCadences = ["none", "weekly"]`; `gameSlots = []`;
  `scheduleShapes = []`; `nflSeason` as above.

Add a sentinel message for the not-available case, alongside the existing ones:

```ts
export const REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE =
  "The NFL season isn't set up yet, so there are no weeks left to run this reward.";
```

`REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE` says "Schedule Live Trivia…" — do **not**
reuse it for NFL. Make `createReward` pick the right message per definition.

## 2. `createReward` — the NFL branch

Add `nflWeekScope?: NFLRewardWeekScope | null` to `CreateRewardParams`.

For an NFL reward, the scope **replaces** `cadence` and (for game_winner) the
quantity — exactly the way `gameWinnerSlots` replaces them today. Nothing about
the scope is taken on trust from the client:

1. `normalizeNFLWeekScope(params.nflWeekScope)`. Null → throw a
   `RewardTermsError` naming the problem.
2. Re-derive `season` and `fromWeek` **from the server's own
   `context.nflSeason`**, not from the client's values. A client-supplied
   `fromWeek` in the past would let a partner backdate a reward over already-played
   weeks and mint prizes for contests nobody knew were running.
3. Call `deriveNFLWeekScopeTerms(scope, { fromWeekStartDate, seasonEndDate })`
   with the server's dates.
4. Use the derived `cadence`, `activeDays`, `quota`, `startDate`, `endDate` when
   calling `createChallengeCampaign`. Pass `nflWeekScope` through so Phase 7 can
   read it back.
5. **Skip `validateRewardTerms` entirely for NFL rewards** — that function judges a
   proposal against a venue's Live Trivia schedule, which NFL has none of. Range-
   check the quantity directly instead (1…`REWARD_MAX_QUANTITY`), and enforce
   `quota === 1` for `game_winner` via the Phase 3 derivation.

Keep the existing Live Trivia path exactly as-is. The cleanest structure is an
early NFL branch that computes `{ cadence, activeDays, winnerQuota, startDate,
endDate, nflWeekScope }` and then falls into the **shared** prize-normalization and
`createChallengeCampaign` call — do not duplicate the prize handling.

## 3. Guards to keep

- The `cadence === "weekly" && activeDays.length === 0` defense-in-depth check
  must still run for the NFL path (Phase 3 guarantees seven days, but the guard is
  what makes a future regression loud instead of silent).
- `venueIds: [venueId]` — non-empty, as the existing comment warns. An empty list
  means "global campaign" and would fire this reward at every venue.
- `gameTypes: ["nfl-pickem"]` from the definition.

## 4. API route

Find the route that backs the Create Reward wizard (`createReward`'s caller — grep
for `REWARD_UNKNOWN_DEFINITION_MESSAGE` in `app/api/`). Thread `nflWeekScope`
through its body parsing and error mapping:

- `RewardTermsError` → **400** (it already maps by type; verify NFL's throws use
  it, not bare `Error`).
- `REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE` → **409**.

Also extend whatever route serves `resolveRewardCreationContext` to the wizard so
the new `nflSeason` field reaches the client.

## Tests

Extend the existing rewards tests (find them by grepping `createReward` in
`tests/`). Cover:

- Creating an NFL weekly game-winner reward stores `recurringType: "weekly"`,
  `winnerQuota: 1`, `activeDays[0] === "thu"` with all seven days, and the scope
  on the campaign.
- Creating an NFL season reward stores `recurringType: "none"` with non-null
  `startDate`/`endDate` drawn from the server's week rows.
- A client sending `winnerQuota: 5` with `game_winner` is **refused**, not clamped.
- A client sending a past `fromWeek` gets the server's `fromWeek`, not its own.
- A client sending a scope with an extra `weekNumbers` array has it dropped by
  `normalizeNFLWeekScope` (no week-range smuggling).
- The Live Trivia creation tests still pass unchanged.

## Constraints

- No `any`. Absolute `@/` imports.
- Do not touch `proxy.ts`, `lib/supabaseAdmin.ts`, `vercel.json`, or migrations.
- Venue ownership/authorization is the caller's job (as today) — do not add or
  remove auth checks in `lib/rewards.ts`.

## Acceptance

- `npx tsc --noEmit`, `npm run build`, `npm test` pass.
- An NFL reward can be created via the API with a `weekly` and with a `season`
  scope, and both round-trip through `listChallengeCampaigns` with the expected
  engine fields.
