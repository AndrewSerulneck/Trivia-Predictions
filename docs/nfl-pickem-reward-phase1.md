# Phase 1 — Tiebreaker backend

Read `docs/nfl-pickem-reward-plan.md` first.

The week-winner reward is decided by most correct picks. Ties are broken by a
**prediction question**: *"How many total points will be scored in this week's
last game?"* Closest guess wins. This phase builds the data model and settlement;
Phase 2 builds the UI; Phase 7 consumes the ranking.

## The tiebreaker game

Define **the week's last game** as the game with the latest `starts_at` among that
week's NFL games. Ties on `starts_at` break by `game_id` ascending, so the choice
is deterministic and stable across calls — Phase 2 shows this game to users and
Phase 7 must resolve against the same one.

Add an exported helper in the new module:

```ts
getWeekTiebreakerGame(weekId: string): Promise<NFLTiebreakerGame | null>
```

Derive it from the same source `listNFLPickEmGames` uses, so a seeded/mock week
works identically to a real one.

## New table

Create **one** migration, `supabase/migrations/20260727120100_nfl_pickem_tiebreakers.sql`
(timestamp must sort after Phase 0's):

```
nfl_pickem_tiebreakers
  id             uuid pk default gen_random_uuid()
  user_id        uuid not null            -- references users(id) on delete cascade
  venue_id       uuid not null            -- references venues(id) on delete cascade
  week_id        uuid not null            -- references nfl_pickem_weeks(id) on delete cascade
  game_id        text not null            -- the tiebreaker game this guess is against
  predicted_total integer not null check (predicted_total >= 0 and predicted_total <= 200)
  actual_total   integer                  -- null until settled
  created_at     timestamptz not null default now()
  updated_at     timestamptz not null default now()
  unique (user_id, venue_id, week_id)
```

Index on `(venue_id, week_id)` — Phase 7 reads exactly that way. Follow the RLS
conventions of the neighbouring `20260715000000_add_nfl_pickem_weeks.sql`
migration; match whatever that file does rather than inventing a new policy shape.

`venue_id` is on the row deliberately: the same user at two venues is two
independent contests, mirroring how `pickem_picks` is scoped.

## New module: `lib/nflPickEmTiebreaker.ts`

`import "server-only"` at the top. Export:

- `getWeekTiebreakerGame(weekId)` — as above.
- `submitTiebreakerGuess({ userId, venueId, weekId, predictedTotal })` —
  upserts on the unique key. **Rejects the write once the tiebreaker game has
  kicked off**, reusing the same kickoff-comparison discipline
  `submitNFLPickEmPick` already applies per game (read it and match its
  error-message style and clock handling). Range-check `predictedTotal` in code as
  well as in the constraint.
- `getTiebreakerGuess({ userId, venueId, weekId })` — for rendering the user's own
  current answer.
- `listTiebreakerGuesses({ venueId, weekId })` — all guesses at a venue for a
  week, for Phase 7 and the Phase 2 leaderboard display.
- `settleWeekTiebreaker(weekId)` — once the tiebreaker game is final, compute
  `actual_total = home_score + away_score` and write it to every row for that
  week. Idempotent: safe to call repeatedly; a row that already has the same
  `actual_total` is left alone.
- `rankByTiebreakerProximity(userIds, guesses, actualTotal)` — **pure function, no
  I/O, exported for direct unit testing.** Given the tied user ids, their guesses,
  and the actual total, return them ordered best-first.

## Ranking rules for `rankByTiebreakerProximity` (be precise — Phase 7 depends on these)

1. Smaller `Math.abs(predictedTotal - actualTotal)` ranks better.
2. On equal distance, the **lower** guess ranks better (the standard
   "closest without going over" instinct; pick one and document it here — this is
   the rule).
3. A user with **no guess** always ranks below every user who guessed.
4. If users are still exactly tied after 1–3 (identical guesses, or none of the
   tied users guessed), fall back to **`userId` ascending** so the outcome is
   deterministic across re-runs. Phase 7 relies on this — a non-deterministic
   ordering could award a different player on a re-sweep.
5. If `actualTotal` is `null` (game not final / unsettled), return the input
   ordered by `userId` ascending and let the caller decide not to award yet.

## Privacy

Another user's guess must not be readable before the tiebreaker game kicks off —
same rule and same rationale as pick privacy in
`docs/nfl-pickem-phase5.md`. `listTiebreakerGuesses` takes a
`revealFor: { userId: string } | "all"` argument; when not `"all"`, **omit the
`predictedTotal` key entirely** (do not send `null`) for other users' unrevealed
guesses. Assume a hostile client.

## Tests

Add `tests/lib.nfl-pickem-tiebreaker.test.ts`, following the mocking pattern in
`tests/lib.nfl-pickem.test.ts`. Cover:

- `getWeekTiebreakerGame` picks the latest kickoff and breaks `starts_at` ties by
  `game_id` deterministically.
- `submitTiebreakerGuess` rejects after kickoff, upserts before it.
- `settleWeekTiebreaker` is idempotent.
- `rankByTiebreakerProximity`: all five rules above, each with its own case.
- Privacy: another user's `predictedTotal` key is absent before kickoff, present
  after.

## Constraints

- No `any`. Type row shapes explicitly, following `PickEmPickRow` / `NFLWeekRow`.
- Absolute `@/` imports. Arrow functions for new utilities.
- Do not modify existing migrations. Do not touch `proxy.ts`,
  `lib/supabaseAdmin.ts`, `vercel.json`.
- Every query filters `venue_id`.

## Acceptance

- `npm run build` and `npm test` pass.
- `rankByTiebreakerProximity` has direct unit coverage for every rule.
