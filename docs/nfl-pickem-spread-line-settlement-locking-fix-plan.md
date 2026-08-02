# NFL Pick 'Em Spread Line Settlement Locking Fix Plan

## Goal

Fix the spread-mode settlement gap found in review of
`docs/nfl-pickem-venue-scoring-mode-plan.md`.

Spread-mode NFL picks must settle from the same pre-kickoff line shown to
players. Settlement must not depend on someone opening the games page after
kickoff, and it must not create or lock a brand-new post-kickoff line.

## Finding To Address

Current spread settlement in `lib/pickem.ts` only settles if
`getNFLPickEmGameLine(gameId)` returns a row with `lockedAt`.

However, `locked_at` is only set by `refreshNFLPickEmGameLines()` inside
`listNFLPickEmGames()` in `lib/nflPickEm.ts`, which is a games-listing path.
Cron/webhook settlement does not lock lines itself.

That creates two bad outcomes:

1. If a pre-kickoff line exists but nobody opens the NFL games API after
   kickoff, `locked_at` remains `null` and spread-mode picks can stay pending
   forever.
2. If no row existed before kickoff and someone opens the games page after
   kickoff, the listing path can fetch odds after kickoff and immediately lock
   that line, grading users against a line that was never guaranteed to be the
   displayed pre-kickoff line.

## Desired Contract

- A spread line is valid for settlement only if the row already exists in
  `nfl_pickem_game_lines`.
- Settlement may lock an existing unlocked row once `starts_at <= now`.
- Settlement must preserve the stored spread values when locking.
- Settlement must not fetch odds.
- Settlement must not create a missing line row.
- Listing may refresh or upsert unlocked line rows before kickoff.
- Listing after kickoff may lock an existing row, but must not create a new
  locked row.
- Already-settled `pickem_picks` rows are never recalculated.

## Phase 1: Document The Contract

Recommended model: Codex 5.4
Intelligence: medium

- Add the locking contract above to `docs/nfl-pickem-venue-scoring-mode-plan.md`
  or reference this handoff doc from it.
- Keep the language explicit that post-kickoff line creation is forbidden.

### Status As Of 2026-08-02

- Phase 1 is complete.
- `docs/nfl-pickem-venue-scoring-mode-plan.md` now includes an explicit
  `Spread Line Locking Contract` section and points back to this fix plan.
- The contract explicitly states that post-kickoff line creation is forbidden.

## Phase 2: Add A Settlement-Safe Line Helper

Recommended model: Codex 5.5
Intelligence: high

Add a helper in `lib/nflPickEm.ts`, likely named:

```ts
getLockedNFLPickEmGameLineForSettlement(gameId: string, now = new Date())
```

Behavior:

- Load the existing row from `nfl_pickem_game_lines`.
- If no row exists, return `null`.
- If `locked_at` exists, return the mapped row.
- If `starts_at > now`, return `null`.
- If `starts_at <= now`, update only `locked_at`, preserving:
  - `home_spread`
  - `away_spread`
  - `provider`
  - `fetched_at`
- Return the locked row.

The update should be defensive:

- Match by `game_id`.
- Only update rows where `locked_at` is still `null` if the Supabase query
  builder supports that pattern locally.
- If another worker locked it first, reload and return the row.

Do not call BallDontLie or odds fetching from this helper.

### Status As Of 2026-08-02

- Phase 2 is complete.
- `lib/nflPickEm.ts` now exports
  `getLockedNFLPickEmGameLineForSettlement(gameId, now = new Date())`.
- The helper loads only an existing `nfl_pickem_game_lines` row, returns `null`
  when no row exists or kickoff has not arrived, returns already-locked rows as
  is, and locks existing unlocked rows at/after kickoff by updating only
  `locked_at`.
- The lock update is defensive: it matches by `game_id`, filters to
  `locked_at is null`, and reloads the row if another worker won the race.
- The helper does not fetch odds and does not create or upsert line rows.

## Phase 3: Wire Settlement To The Safe Helper

Recommended model: Codex 5.5
Intelligence: high

- In `lib/pickem.ts`, replace the local `getLockedNFLLine()` cache with the new
  settlement-safe helper.
- Keep spread-mode NFL picks pending only when:
  - no pre-existing line row exists, or
  - the line cannot be read/locked due to an error.
- Preserve current behavior for:
  - non-NFL picks
  - standard-mode NFL picks
  - already-settled picks

## Phase 4: Tighten Listing-Time Locking

Recommended model: Codex 5.4
Intelligence: medium

Update `refreshNFLPickEmGameLines()` in `lib/nflPickEm.ts`:

- Before kickoff:
  - Continue fetching and upserting latest unlocked spread rows.
- At or after kickoff:
  - If an existing row is present, set `locked_at` without overwriting spread
    values.
  - If no existing row is present, do not fetch/upsert/create a new row for
    that game.

### Status As Of 2026-08-02

- Phase 4 is complete.
- `refreshNFLPickEmGameLines()` now fetches odds only for pre-kickoff games
  whose line can still be refreshed, and it skips odds fetch/upsert entirely
  for kicked-off games.
- At/after kickoff, listing now only locks an already-existing
  `nfl_pickem_game_lines` row and does so with a defensive `locked_at is null`
  filter, preserving the stored spread/provider/fetched timestamp values.
- If no line row existed before kickoff, listing leaves that game without a
  line row instead of creating a new locked post-kickoff line.

This makes the pre-kickoff stored line the only possible spread-settlement
input.

## Phase 5: Regression Tests

Recommended model: Codex 5.5
Intelligence: high

Add focused Vitest coverage:

- Settlement locks an existing pre-kickoff unlocked line and grades spread
  picks.
- Settlement does not settle spread picks when no line row exists.
- Listing after kickoff does not create a brand-new locked line.
- Listing after kickoff preserves and locks an existing row without overwriting
  spread values.
- Already-settled picks still do not recalculate after mode changes.

Likely test files:

- `tests/lib.pickem-nfl-scoring-mode.test.ts`
- `tests/lib.nfl-pickem-game-fetch.test.ts`

### Status As Of 2026-08-02

- Phase 5 is complete.
- `tests/lib.pickem-nfl-scoring-mode.test.ts` now runs spread settlement through
  the real settlement-safe line helper against the mocked `nfl_pickem_game_lines`
  table. It proves settlement locks an existing unlocked pre-kickoff line,
  preserves the stored spread values, and grades the spread pick from that row.
- The same suite now covers the missing-line guard: if no pre-existing
  `nfl_pickem_game_lines` row exists, spread-mode settlement leaves the pick
  pending and does not create a line.
- Existing coverage in `tests/lib.nfl-pickem-game-fetch.test.ts` covers listing
  after kickoff: it does not fetch odds or create a brand-new locked line, and
  it locks an existing row without overwriting spread/provider/fetched values.
- Existing coverage in `tests/lib.pickem-nfl-scoring-mode.test.ts` still covers
  the already-settled-picks guard after a venue mode toggle.
- `lib/nflPickEm.ts` also had a stale fallback map type in
  `refreshNFLPickEmGameLines()` corrected from a nonexistent `NFLSpreadLine` /
  numeric-key map to `Map<string, NormalizedNFLSpreadLine>`, matching
  `fetchNFLSpreadLinesFromBDL()`.
- Verified:
  `npx vitest run tests/lib.pickem-nfl-scoring-mode.test.ts tests/lib.nfl-pickem-game-fetch.test.ts`
  and `npx tsc --noEmit`

## Phase 6: Verification

Recommended model: Codex 5.4
Intelligence: medium

Run:

```bash
npx vitest run tests/lib.nfl-pickem-game-fetch.test.ts tests/lib.pickem-nfl-scoring-mode.test.ts
npx tsc --noEmit
```

Before commit, preferably also run:

```bash
npm run test
```

## Best Overall Agent

Use Codex 5.5 for the implementation pass. The change crosses provider timing,
database row locking, and shared settlement behavior, so it benefits from the
higher reasoning model even though the edit is small.

## Handoff For Next Chat

- Phase 3 is complete as of 2026-08-02.
- `lib/pickem.ts` now imports and uses
  `getLockedNFLPickEmGameLineForSettlement()` for NFL spread settlement.
- The local settlement line cache still caches per `game_id`, but now caches the
  settlement-safe helper result and catches helper errors as `null`, leaving the
  spread-mode pick pending.
- `tests/lib.pickem-nfl-scoring-mode.test.ts` now mocks
  `getLockedNFLPickEmGameLineForSettlement` instead of the retired raw
  `getNFLPickEmGameLine` settlement path.
- Verified:
  `npx vitest run tests/lib.pickem-nfl-scoring-mode.test.ts`
- Phase 4 is complete as of 2026-08-02.
- `lib/nflPickEm.ts` now limits `refreshNFLPickEmGameLines()` odds fetching to
  pre-kickoff games only. Kicked-off games are never upserted from listing.
- Listing after kickoff now has two branches only:
  - existing row: lock it in place without changing spread values
  - missing row: skip it entirely, leaving settlement to keep picks pending
- `tests/lib.nfl-pickem-game-fetch.test.ts` now covers the no-post-kickoff-row
  path and the builder mock supports `.is(...)` for the defensive lock filter.
- Phase 5 is complete as of 2026-08-02.
- `tests/lib.pickem-nfl-scoring-mode.test.ts` now imports the real
  `getLockedNFLPickEmGameLineForSettlement()` via `vi.importOriginal`, while
  keeping it spied/mocked for call assertions. The Supabase mock now supports
  `.is(...)`, `.maybeSingle()`, and `.single()` so the helper can lock rows in
  the in-memory `nfl_pickem_game_lines` table.
- Added settlement regression coverage for:
  - existing unlocked line row locks in place and grades the spread pick
  - missing line row leaves the spread pick pending and creates nothing
- Verified:
  `npx vitest run tests/lib.pickem-nfl-scoring-mode.test.ts tests/lib.nfl-pickem-game-fetch.test.ts`
  and `npx tsc --noEmit`
- Start next at Phase 6. Targeted Vitest and TypeScript have already passed;
  the remaining preferred pre-commit check is the full `npm run test` suite if
  runtime permits.
- First read:
  - `CLAUDE.md`
  - `SYSTEM_CONTEXT.md`
  - `docs/nfl-pickem-venue-scoring-mode-plan.md`
  - `docs/nfl-pickem-spread-line-settlement-locking-fix-plan.md`
  - `lib/nflPickEm.ts`
  - `lib/pickem.ts`
  - `tests/lib.nfl-pickem-game-fetch.test.ts`
  - `tests/lib.pickem-nfl-scoring-mode.test.ts`
- Implement Phase 6 verification:
  - targeted Vitest already passed:
    `npx vitest run tests/lib.nfl-pickem-game-fetch.test.ts tests/lib.pickem-nfl-scoring-mode.test.ts`
  - TypeScript already passed: `npx tsc --noEmit`
  - run `npm run test` before commit if runtime permits
- Preserve the hard rule: if no line row existed before kickoff, spread-mode
  settlement must leave the pick pending rather than creating or locking a new
  post-kickoff line.

## Round 3 Code Review Findings (2026-08-02)

A third `/code-review` pass over `billing-guard-hardening-plan.md`'s branch
found four more findings in this same spread-line/settlement surface, on top
of everything this doc already fixed. Full findings, work items, and as-built
records live in `docs/code-review-round3-plan.md` Phases 1–4; this section is
the pointer this doc's own contract promised ("The NFL findings belong in
this doc, not the billing inventory").

| # | Finding | File | Status |
|---|---|---|---|
| 1 | Kickoff line-lock used `.single()` on a compare-and-set update — the losing concurrent request matched zero rows and 500'd the whole games API instead of reading back the winner's row | `lib/nflPickEm.ts` (`refreshNFLPickEmGameLines`) | ✅ closed — round3 Phase 1: switched to `.maybeSingle()` + reload-on-zero-rows, mirroring the sibling `lockNFLPickEmGameLineForSettlement` shape this doc's Phase 2 introduced |
| 2 | The spread-line refresh ran unconditionally on every games-list request — unscoped to venues that actually use spread mode, and fatal (any DB error 500'd standard-mode venues too) | `lib/nflPickEm.ts` (`listNFLPickEmGames` / `refreshNFLPickEmGameLines`) | ✅ closed — round3 Phase 2: refresh now skipped entirely for `scoringMode === "standard"` (confirmed this doc's own settlement-safe helper covers the mid-week standard→spread switch case, so skipping is safe); wrapped non-fatally with a `spreadLinesUnavailable` flag surfaced to spread-mode callers |
| 3 | The odds provider query capped at 4 pages (400 rows) with no truncation detection — a full week's rows (games × sportsbooks) could exceed that, silently dropping the games whose rows sorted last | `lib/nflPickEm.ts` (`fetchNFLSpreadLinesFromBDL`) | ✅ closed — round3 Phase 3: raised the page cap with the games×books arithmetic in a comment, and a truncation-hit now logs a warning naming the week |
| 4 | Both `continue` branches in spread settlement (missing scores, missing line) left a pick `pending` forever with no fallback or deadline — the identical permanent-stall shape this doc's own contract was written to prevent for the missing-line case, but this doc never addressed the missing-scores case or gave the missing-line case a deadline | `lib/pickem.ts` (settlement sweep) | ✅ closed — round3 Phase 4: both branches now void the pick (`canceled`, no points) after the existing `staleFinalizeMs` staleness window elapses; before that window they still retry as `pending`, so this doc's hard rule (no settlement on a line that never existed pre-kickoff) is preserved — voiding-after-staleness is a bounded terminal state, not a new post-kickoff line fabrication. Confirmed `lib/nflPickEmRewardAccrual.ts` correctly ignores voided picks (no reward points) |

**Verification (round3 Phase 8, 2026-08-02):** `npx tsc --noEmit` / `npm run
lint` / `npm run test` all green at **155 files / 1290 passed / 13 skipped**.
Browser-verified live against the real BallDontLie provider (no mocks) via
the `/api/nfl-pickem/games` route: a standard-mode venue (`venue-riverside`)
returned 200 with 16 games and no spread data attempted, faster than the
spread path (~0.58s vs ~1.36s, confirming the refresh is actually skipped,
not just empty); a spread-mode venue (throwaway `venue_game_settings` row on
`venue-dock-s-corner-tavern`, reverted after the test) returned 200 with
`spreadsUnavailable: false` and a spread on **all 16** week-1 games — no
truncation. The settlement-stall fix (item 4) was verified by direct code
inspection (`lib/pickem.ts` lines ~2385–2478 match the as-built shape above)
plus the existing `tests/lib.pickem-nfl-scoring-mode.test.ts` cases
(`"keeps spread NFL picks pending inside the staleness window..."`, `"voids a
spread NFL pick past the staleness window..."`, `"voids a stale spread NFL
pick when the provider never reported final scores..."`) rather than driving
a full end-to-end settlement sweep in-browser, which would have required
seeding a real kicked-off game with score data — disproportionate for a path
already covered by targeted unit tests.
