# Category Blitz letter die — Phase 13.5 handoff (2026-10-31)

## For Andrew (plain English)
**What changed:** if a player's phone clock runs a few seconds fast and they switch away from the app while the letter
die is rolling, coming back now still shows the round-start reveal — and on a Majority Rules round, its banner — instead
of jumping straight to the board. The die, the reveal and the die's safety timer now all judge "did this round just
start?" by the server's clock, the same way, so they can't disagree. Players with a correct clock see no difference.

**Is it live?** No. Committed locally on `after-app-review` only; nothing pushed, `main` stays frozen until Apple approves.
**Cost:** zero (no new requests, reads or writes; the clock reading already came with the existing poll).
**What's left:** Phase 14 — a fresh review of 13.1–13.5, then your phone pass (checklist in plan §Phase 14).
**Needs you:** nothing now. One optional idea for later: the round's countdown timer and the answer deadline still use
the phone's own clock (out of scope by the plan); say if you'd like those moved onto the server's clock too.

---

## For the next agent (Phase 14)

### 1. Next phase
Plan §Phase 14 (`docs/category-blitz-letter-die-plan.md`): a fresh-eyes `/code-review` (high) of the 13.1–13.5 commits
only — `git diff 2899a9d6..HEAD` — then Andrew's phone pass (his checklist is in the plan). Any new finding becomes a new
sub-phase (same rule as Phases 6, 11, 12, 13: no in-place patches). Out of scope: pushing, merging to `main` (only after
Apple approval), the round timer / submission deadlines on the server clock (Andrew's call, see above), the TV poll's
double schedules read (open since 13.3).

### 2. Starting state
Branch `after-app-review`; the 13.5 commit sits on `401235c2` (13.4). Not pushed or deployed. No DB, Vercel or Supabase
access used; no data changed; no backups needed.

### 3. Decisions
- Andrew, 2026-10-30: 13-review finding 3 → "fix it now" (this phase). Finding 1 → option (a), built in 13.4.
- Scope (plan §13.5): exactly three readers — the die's cutoff in `dieStage`, `showReveal`, the watchdog's
  `sawRoundStart`. The round timer and submission deadlines stay on the phone's clock.
- The 13.1a latch is unchanged: `LetterDieRoll` still passes the offset latched at the letter's arrival into `dieStage`.

### 4. Files changed
- `lib/categoryBlitzLetterDie.ts`: new exported `roundAgeMs(roundStartedAtMs, phoneNowMs, serverClockOffsetMs)` =
  `phoneNowMs + offset − roundStartedAtMs`. `dieStage`'s late-letter check now calls it (same maths as before).
- `components/category-blitz/CategoryBlitzGame.tsx` (~2466 and ~2600–2625):
  - `revealElapsedMs = roundAgeMs(Date.parse(startedAt), nowMs, serverClockOffsetMs)` (was `nowMs − startedAt`). This
    drives `showReveal`, the elapsed-time `markRevealDone` fallback, and so `dieSkipped && showReveal` (the Majority Rules
    takeover when the die was skipped).
  - The watchdog's `sawRoundStart` uses `roundAgeMs(…, Date.now(), serverClockOffsetRef.current)`. The offset is read via
    `serverClockOffsetRef` (synced in its own effect, declared just above the watchdog) so an offset change never
    re-runs the watchdog effect, which would restart (postpone) its timeout.
- Tests:
  - `tests/lib.category-blitz-letter-die.test.ts`: `describe("roundAgeMs")` — unit values for fast/slow/correct clocks,
    and a sweep pinning `dieStage`'s cutoff to `roundAgeMs > DIE_MID_ROUND_CUTOFF_MS` at offsets −4000/0/+4000.
  - `tests/components.category-blitz-letter-die-wiring.test.ts`: `describe("13.5 …")` — phone 4 s fast + tab hidden →
    reveal plays (standard) and the takeover fires once (Majority Rules); correct clock + 6 s old → board, fallback marks
    reveal done; phone 4 s slow + 6 s old by server → no reveal; phone 4 s fast + stalled die frames on Majority Rules →
    the watchdog's takeover still plays.
  - `tests/category-blitz-letter-die-contract.test.ts`: the 12.2 test pinned "only the die reads the offset" (3
    occurrences). It now pins the 13.5 rule: `dieStage` and both game call sites use `roundAgeMs`, no raw
    `nowMs/Date.now() − startedAt` remains, and the game names `serverClockOffsetMs` exactly 7 times (destructure, die
    prop ×2, reveal, ref init, ref sync ×2) — a new reader fails it.

### 5. Facts and traps
- "Is the reveal showing?" in the wiring tests = no die, no `[data-category-blitz-answer-list]` board, and the category
  text present. Framer's RoundStartReveal animation runs on jsdom's real-time frames, so under fake timers it never
  completes; don't wait for its `onDone`.
- `stallDieFrames()` is restored at the end of each test, not in `afterEach`; a failing assertion before the restore
  leaks the stub and makes later Phase 8 tests fail too. That's what you see when mutation-checking the watchdog — read
  the first failure only.
- `showReveal` is re-evaluated every 250 ms tick (today's behaviour); a new, faster clock reading mid-reveal can shift
  its 3 s cut-off by a few hundred ms. Not latched (the plan didn't ask; the die's verdict is latched since 13.1a).
- `lib/categoryBlitz.ts` has non-UTF-8 bytes (use `grep -a`); not touched here.
- Don't run `tsc` and `npm run build` at once.

### 6. Verified
`npx tsc --noEmit` clean; eslint clean on the 5 touched files; `npm run test`: 5,743 pass / 13 skipped / 5 fail before
the contract update (the 12.2 contract + the 4 known Bingo star-index freshness tripwires), then the contract file 12/12
— so only the 4 known Bingo failures remain; `npm run build` exit 0. Mutation checks (all reverted): reveal without
the offset → 3 of the new tests fail; watchdog without the offset → the watchdog test fails; `roundAgeMs` dropping the
offset → 12 tests fail (incl. 12.2a's). No browser or device check — the phone pass is Phase 14.

### 7. Open questions
- Optional for Andrew: move the round timer and submission deadline onto the server clock too (not planned).
- Still open from 13.3: should the venue TV poll (`lib/venueScreen.ts`) use `driveVenueCategoryBlitzWithSchedules` to
  drop its second schedules read? Not in the plan.

### 8. First steps for Phase 14
Read plan §Phase 14; run `/code-review` (high) on `git diff 2899a9d6..HEAD`; check each finding against the code; write
any confirmed ones into the plan as Phases 14.x with fixes, tests and model/effort; write
`…_PHASE_14_HANDOFF.md`; update the status line. Then hand the phone checklist to Andrew. Opus 5.5, high (plan table).
