# Category Blitz Letter Die — Phase 7 handoff (die lifecycle fixes)

**Date:** 2026-10-30 · **Branch:** `after-app-review` · **Plan:** `docs/category-blitz-letter-die-plan.md`

## For Andrew (plain English)
- **What changed:** three fixes to *when* the letter die shows up.
  1. If you reloaded the game mid-round, the die used to stay switched off for every later game in that tab. Now it
     comes back with the next game.
  2. On the last round of a scheduled game, the die used to start rolling over the final standings and hide them
     for up to 12 seconds. Now it only rolls when another round is actually coming.
  3. If the die ever gets stuck (phone busy as the round starts), the game already showed the board after ~6
     seconds, but on a Majority Rules round the "Blend In!" announcement was lost. Now it still plays.
- **Live?** No. Nothing committed, pushed or deployed (main is frozen for App Store review). No cost, no database or
  server change (the game engine got one comment line, no logic).
- **Needs from you:** nothing now. Check #2 on your phone in Phase 11 (last round of a scheduled game: the standings
  stay visible).

## For the next agent (Phase 8, Opus 5.5, high — board cascade without a remount)
1. **Goal / scope:** plan §5 Phase 8 (finding 2: rows swap `motion.div` → `div` at the end of the cascade, which
   remounts a focused input). Out of scope: Phases 9–10, the engine, the venue TV, merging to `main`.
2. **Starting state:** branch `after-app-review`, last commit `c3ecdb8a`. **Nothing from Phases 1–7 is committed.**
   No data, migration, env or cron touched. Never push `main`, deploy, `supabase db push`, or change Production env.
3. **Decisions:** plan §2 items 1–13. Phase 7 followed the plan's text exactly; no new decisions.
4. **Files changed (Phase 7):**
   - `lib/categoryBlitzShared.ts` — new `anotherRoundFollows(session, latestRound)`: continuous → true; scheduled
     with no `scheduledEndAt` → false; else `nextRoundStartAtMs(latest, testMode) + roundDurationSeconds(testMode)*1000
     <= Date.parse(scheduledEndAt)` (mirrors the engine's `canFitAnother`).
   - `lib/categoryBlitz.ts` — comment only, above `canFitAnother` in `driveVenueCategoryBlitz`, pointing back.
   - `components/category-blitz/CategoryBlitzGame.tsx` (die section, ~lines 2462–2560):
     - 7.1 `dieKey` = `after:<session.id ?? "none">:<prevId|round id ?? "none">` (`dieSessionId`).
     - 7.2 `dieCountdown` in `results` is `nextRoundStartsIn` only when `anotherRoundFollows(session, round)`, else
       null (the die then mounts but stays idle and renders nothing; at round start it lands without tumbling).
     - 7.3 `dieDoneRoundId` renamed `modeCueRoundId`. The watchdog effect (deps now include `answeringRoundId`,
       `answeringRoundStartedAt`) computes `sawRoundStart` (round age ≤ `ROUND_START_REVEAL_MAX_MS`) when it arms and,
       on firing, also sets `modeCueRoundId` if true. `modeFlipCue` reads `modeCueRoundId`.
   - `tests/lib.category-blitz-shared.test.ts` — 6 cases for `anotherRoundFollows` (each branch, exact `==` boundary,
     1 ms short, unscored round, test mode).
   - `tests/components.category-blitz-letter-die-wiring.test.ts` — mock session now takes `session` overrides
     (`scheduledEndAt: null` default); helpers `stallDieFrames()` (spies `window.requestAnimationFrame` to a no-op) and
     `WATCHDOG_FIRED_MS`; 7 new tests (7.1 ×1, 7.2 ×4: scheduled-no-room / scheduled-fits / continuous / manual,
     7.3 ×2: fresh reverse round via watchdog → exactly one takeover; mid-round reverse reload via watchdog → none).
5. **Traps:**
   - `grep` on `lib/categoryBlitz.ts` without `-a` prints nothing (file detects as binary-ish); use `grep -a`.
   - `stallDieFrames` works because the die calls `window.requestAnimationFrame` at call time; framer-motion keeps its
     own frame loop. Restore the spy in-test (no global `restoreAllMocks`).
   - The watchdog only fires while `dieHoldsBoard` (its cleanup clears it once the die flies or is skipped), so setting
     the cue there can't double a takeover; the per-round dedupe refs guard it anyway.
   - Known limit (plan 7.2): if the engine drives late, the predicate can say "fits" and the session still ends; the
     die then tumbles until `complete` unmounts it — no worse than before.
6. **Gates run:** `npx tsc --noEmit` clean; `npx eslint` clean on all 5 touched files; `npm run test` 5,649 pass / 13
   skipped / 4 fail (the known Bingo star-index freshness tripwires `tests/lib.sportsBingo.{mlb,nfl}-star-index{,-freshness}.test.ts`);
   `npm run build` exit 0. **Mutation-checked:** removing the session id from the key, removing the last-round gate,
   removing the watchdog cue, and ignoring the round's age each fail at least one test. Unverified: real browser/phone.
7. **Open questions:** none new. (Still open from earlier: Andrew's view on judgment call 11.) The intermission's
   "Next round in" copy on a final round is a separate UX question that could reuse `anotherRoundFollows` — ask Andrew first.
8. **First steps for Phase 8:** read plan §5 Phase 8 and `AnsweringScreen`'s `morphActive` / `morphSettleMs` /
   `compactChrome` (~lines 1611–1645 of `CategoryBlitzGame.tsx`); add its tests to the same wiring test file (the
   `projectedRows()` helper already counts `[data-category-blitz-row-projected]`).
