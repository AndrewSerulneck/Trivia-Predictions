# Pick 'Em plan — Phase 7.5.4 handoff (2026-11-01)

## For Andrew (plain English)
- **What changed:** the Pick 'Em games list used to wait for three separate lookups one after another (college spread lines,
  the Pick 'Em Prize lines, and the player's "today" tally). They now run at the same time, so the screen loads in the time of
  the slowest one instead of the sum. The bar's college scoring rule (spread vs pick-the-winner), which was re-read on every
  list view, is now remembered for 30 seconds per server instance. Making a pick still reads the rule fresh.
- **Is it live?** No — code only, uncommitted, not deployed (main is frozen). No migration, no data touched.
- **Visible effect:** if a partner switches the college rule, a player's list may show the old rule for up to 30 seconds;
  a pick made in that window is still stamped with the new rule.
- **What's left:** 7.5.5 (cleanups), the 7.6 re-review, your phone pass. Still waiting on you to apply migration
  `20261102021619` before the code deploys (from 7.5.3).

## For the next agent

### 1. Next phase: 7.5.5 (Sonnet 5.5 · medium)
Spec: plan "### Phase 7.5.5" (F13 delete dead `ActiveGamesPanel` + contract test; F18 stable ledger paging in
`settlePickEmPrizes`; F20 fix two doc comments). Out of scope: 7.6, F7.

### 2. Starting state
Branch `after-app-review`, last commit `407e4da2`; Phases 1–7.5.4 uncommitted on top. Main frozen (no push main, no
`supabase db push`, no prod env). Applied migrations through `20261101153306`; `20261102021619` NOT applied. No data written.

### 3. Decisions
- Verified the fields are disjoint: lines write `scoringMode/homeSpread/awaySpread/lineComingSoon`; prizes read `sportSlug,
  sportKey, startsAt, userPickTeam` and write `pickLimitReached/pickLimitMessage`; today's summary takes no game input.
  So all three are in one `Promise.all` (no ordering kept).
- A failed rule read is NOT cached (entry deleted; default shown for that call only). Successful reads cached 30 s.
- `submitPickEmPick` / `resolvePickScoringMode` untouched (fresh read = stamp of record).

### 4. Files
- `lib/pickem.ts` — `listPickEmGames` now builds `[collegeScoring, prizes, today]` via `Promise.all`;
  `resolveCollegeScoringModeForDisplay` has the cache (`COLLEGE_RULE_DISPLAY_CACHE_TTL_MS` = 30 000); new export
  `clearCollegeScoringModeDisplayCache()` (test hook). The debug-probe block is unchanged and still runs after the reads.
- `tests/lib.pickem-college-spreads.test.ts` — cache cleared in `beforeEach`; mock gained `collegeModeGate` and
  `tablesOpened`; new describe "the games list display reads (7.5.4)": one rule read within 30 s and a second after;
  today's summary read opens while the rule read is still pending; failed read not cached.
- Plan status/table/section, `CLAUDE.md` Pick 'Em bullet.

### 5. Facts and traps
- Any test that flips the venue's college mode between list calls must call `clearCollegeScoringModeDisplayCache()` first
  (the cache is module-level). Other test files passed unchanged.
- `tests/lib.pickem-college-spreads.test.ts` mocks `@/lib/pickemPrizeLimit` without `activePickEmPrizes`, so the prize loader
  logs `[PickEmPrize] game-prizes-failed` to stderr in that file — pre-existing noise, caught inside the loader.
- `npm run test` has the same 4 pre-existing failures (Sports Bingo star-index staleness tripwires), unrelated.

### 6. Verified
`npx tsc --noEmit` clean; eslint clean on the two files; `npx vitest run tests/lib.pickem` all pass; full `npm run test`
6,036 pass / 4 unrelated fail / 13 skipped. Not measured against production (no timings taken).
Cost: removes one settings read per list view per instance per 30 s; no new requests.

### 7. Open questions
None.

### 8. First steps for 7.5.5
Re-check importers of `components/activity/ActiveGamesPanel.tsx` before deleting; then F18 and F20 as specced.
