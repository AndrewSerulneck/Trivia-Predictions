# Category Blitz letter die — Phase 13.1 handoff (2026-10-30)

## For Andrew (plain English)
**What changed:** two fixes to how the die reads the clock.
- Once the letter arrives, the die decides "was this letter late?" one time and sticks with it. Before, a new clock
  reading arriving mid-bounce could make the die vanish halfway through its landing.
- The phone now measures its clock against the server's more accurately. The server stamps the time when your
  request arrives as well as when the reply leaves, so the server's own work time no longer skews the reading.

**Your two answers are recorded** in the plan: extending tonight's window mid-game → (a), built as new Phase 13.4;
phone clock fast → fix now, built as new Phase 13.5.

**Is it live?** No. Committed locally on `after-app-review` only. Not pushed; `main` stays frozen until Apple approves.
**Cost:** zero. One more number rides on the reply the game already gets every 15 s.
**What's left:** 13.2, 13.3, 13.4, 13.5, then Phase 14 (one more review, then your phone pass).
**Needs you:** nothing.

---

## For the next agent (Phase 13.2)

### 1. Next phase
Phase 13.2 in `docs/category-blitz-letter-die-plan.md` (sessions reply ordering: a failed reply never moves
`appliedLoadSeqRef`; the end-of-session broadcasts and `loadCurrentRound` join the ordering). Then 13.3, 13.4, 13.5,
each its own sub-phase, handoff and local commit. **Out of scope:** pushing, merging to `main`, the round timer on the
server clock, option (b) for finding 1 (moving `scheduledEndAt` on a schedule edit — Andrew chose (a)).

### 2. Starting state
- Branch `after-app-review`. The 13.1 commit sits on `7d96d774` (Phase 13 docs), which sits on `2899a9d6` (Phases 1–12.3).
  Nothing pushed or deployed. No database, Supabase, Vercel or production access was used; no data changed.

### 3. Decisions made
- Andrew, 2026-10-30: finding 1 → option (a) (both engines check the fit against the earlier of the live window end and
  the session's frozen `scheduledEndAt`; no schedule edit moves an open session). Written up as Phase 13.4.
- Andrew, 2026-10-30: finding 3 → fix now (one server-clock "round age" for `showReveal`, the die watchdog and the die's
  cutoff). Written up as Phase 13.5.
- 13.1a: the latched offset is taken from `live.current` at the moment the arrival is latched; `serverClockOffsetMs` was
  removed from the stage effect's deps (it is only read at arrival now, and `live.current` is refreshed by a layout
  effect, which runs before that effect in the same commit).
- 13.1b: stamps that can't be true (server work < 0, or longer than the phone's whole round trip) fall back to the old
  one-stamp midpoint formula rather than being thrown away. The 2 s cap and "fastest wins" now compare network time.

### 4. Files changed
- `components/category-blitz/LetterDieRoll.tsx`: `Latches.arrivalClockOffsetMs`; latched beside `letterArrivedAtMs` in
  the props effect; `step` passes `l.arrivalClockOffsetMs ?? p.serverClockOffsetMs` to `dieStage`.
- `lib/categoryBlitzLetterDie.ts`: `nextDieClockSample` takes optional `serverReceivedAtMs`; NTP formula
  `offset = ((serverIn − sent) + (serverNow − received)) / 2`, `rtt = (received − sent) − (serverNow − serverIn)`.
- `app/api/category-blitz/sessions/route.ts`: the drive reply adds `serverReceivedAtMs: now.getTime()` (`now` is taken
  at entry). The `peek=1` reply is unchanged (it never had clock fields).
- `lib/categoryBlitzRealtime.ts`: `loadSession` reads and passes `serverReceivedAtMs`.
- Tests: `tests/components.letter-die-roll.test.ts` ("Phase 13.1a", 2 tests), `tests/lib.category-blitz-letter-die.test.ts`
  (5 NTP tests), `tests/api.category-blitz-sessions.test.ts` (payload pins the new field).
- `docs/category-blitz-letter-die-plan.md`: status line, phases table (13.1–13.5, 14), Andrew's decisions, new §13.4 and
  §13.5, Phase 14 checklist items.

### 5. Facts and traps
- `dieStage` itself is unchanged; it still re-reads whatever offset it is given. The latch lives in the component.
  Phase 13.5 will move the cutoff onto a shared `roundAgeMs` helper — keep the arrival latch when doing that.
- `lib/categoryBlitz.ts` contains a non-text byte: use `grep -a`.
- Don't run `tsc` and `npm run build` at the same time (`.next/types`).

### 6. Build / test (2026-10-30, sequential)
`npx tsc --noEmit` clean; `npx eslint` clean on all 7 touched files; `npm run test` 5,719 pass / 13 skipped / 4 fail (only
the 4 known Bingo star-index freshness tripwires); `npm run build` succeeded. Mutation checks: reverting the latch fails
"a better clock reading during the landing never makes the die vanish"; reverting the NTP formula fails 3 NTP tests.
`/verify`'s browser steps were not run (they seed the shared production DB). Not verified: real device or browser.

### 7. Open questions
None.

### 8. First steps for Phase 13.2
1. Read plan §Phase 13.2. 2. In `loadSession` (`lib/categoryBlitzRealtime.ts`, the `appliedLoadSeqRef` lines after the
clock reading and in the catch), only an `ok` reply advances the seq; a failure sets its error only when
`seq > appliedLoadSeqRef.current`. 3. The three end-of-session broadcast handlers bump `loadSeqRef` and set
`appliedLoadSeqRef` to it; `loadCurrentRound` takes the seq and skips stale writes. 4. Tests from the plan, mutation-check,
gates, commit locally, write `…_PHASE_13.2_HANDOFF.md`. Model: Opus 5.5, effort high.
