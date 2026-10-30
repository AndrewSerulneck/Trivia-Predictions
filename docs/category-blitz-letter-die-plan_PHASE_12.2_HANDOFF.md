# Category Blitz letter die — Phase 12.2 handoff (2026-10-30)

## For Andrew (plain English)

**What changed:**

1. **A phone whose clock is a few seconds wrong now gets the die.** Before, a phone running more than 3 seconds fast
   tumbled the die for 5 seconds and then the die simply vanished, every round: no landing, no letter drop, no
   Majority Rules flip. Each reply the game already gets from the server now also carries the server's time, so the
   phone knows how far off its own clock is. Only the die's "did the letter arrive late?" check uses that. Nothing
   else changed.
2. **An old, slow server reply can no longer overwrite a newer one.** If a partner shortened tonight's window, a reply
   that left the server *before* the edit but arrived *after* the fresh one could bring the old end time back for up
   to 15 seconds, and the die could tumble over the final scores. Now every reply is numbered, and an older one that
   arrives late is thrown away. The same fix also covers the game's other session details (the same race existed
   there).

**Is it live?** No. All letter-die work (Phases 1–12.2) is still uncommitted on `after-app-review`. No database change,
no new requests, no cost change (one number added to a reply the game already gets every 15 seconds).

**What's left:** Phase 12.3 (fewer screen redraws as the categories slide in), then Phase 13 (one more review and your
phone pass, which now includes "set the phone's clock a few seconds off").

**Needs you (information only, not blocking):** the round timer, the old letter-drop animation's timing and a
back-up timer in the game still use the phone's own clock. On a phone more than ~3 seconds off, the old letter drop is
skipped when the die isn't used, and the timer shows a few seconds more or less. This was already true before the die
existed; the plan kept this phase to the die only. Say so if you want those moved onto the server's clock too.

---

## For the next agent (Phase 12.3)

### 1. Next phase
Phase 12.3 in `docs/category-blitz-letter-die-plan.md` (§5, "Phase 12.3"): 12.3a (move cascade-row readiness out of
`AnsweringScreen` so each row's `onAnimationComplete` doesn't re-render the whole board; keep ONE fallback mechanism;
`React.Profiler` test), 12.3b (one `CB_ROW_CASCADE_REDUCED_DURATION_S` constant for the bare `0.2`). Sonnet 5.5, medium.
Then Phase 13 (Opus 5.5 high re-review of 12.1–12.3 + Andrew's phone pass).
**Out of scope:** moving the round timer, `showReveal`, the elapsed-time reveal fallback or the die watchdog's
`sawRoundStart` onto the server clock (information item above); when the engine closes a session; the cron's test-mode
cadence; merging (`main` is frozen until Apple approval).

### 2. Starting state
- Branch `after-app-review`, last commit `c3ecdb8a`. All letter-die work (Phases 1–12.2) is **uncommitted**; nothing
  pushed or deployed. No data, migration or production access was used.

### 3. Decisions made in 12.2 (and why)
- **12.2a: chose the recommended `serverNow` + offset fix**, not the capped latched-tumble exemption. The exemption
  would still skew (just in the safe direction) and would bring back a second rule in `dieStage`; the offset fixes both
  directions with one number on a reply the game already polls.
  - Field name is **`serverNowMs`** (ms epoch number), not the plan's `serverNow`, to match the existing convention in
    `app/api/challenge-campaigns/redeem/route.ts` (the live coupon clock). Added to the non-`peek` GET response only
    (the game never peeks). Stamped with `Date.now()` as the reply is built, not the request's `now`.
  - The offset = `serverNowMs − midpoint(sent, received)`, error ≤ RTT/2. The **fastest reading wins**; readings with an
    RTT over `DIE_CLOCK_MAX_RTT_MS` (2000, i.e. ±1 s, a third of the 3 s cutoff) are never used; the kept reading is
    replaced by the next usable one once it is more than `DIE_CLOCK_SAMPLE_MAX_AGE_MS` (60 s) old **in either
    direction** (the phone's clock can be changed mid-game — this is exactly what Phase 13 tests). No reading → offset 0
    = the old behaviour.
  - Sign: `serverClockOffsetMs` = server − phone, so a phone 4 s **ahead** is −4000. The cutoff is
    `letterArrivedAtMs + serverClockOffsetMs − roundStartedAtMs > DIE_MID_ROUND_CUTOFF_MS`.
  - **Scoped to the die's cutoff only** (plan): `dieStage` gained a required `serverClockOffsetMs` input;
    `LetterDieRoll` an optional prop (default 0, so the dev panel demo is unchanged); the game passes it once. A
    contract test pins that `serverClockOffsetMs` appears exactly 3 times in `CategoryBlitzGame.tsx` (destructure, prop,
    value), so nobody quietly spreads it to the timer.
  - Not fixed (follow-up, information item for Andrew): the tumble *start* also comes from the phone clock
    (`nextRoundStartsIn` is computed in the hook from the phone clock), so a phone ~7+ s fast tumbles longer than
    `DIE_MAX_TUMBLE_MS` (12 s) and gives up. A phone 4 s fast tumbles ~9 s and lands normally (wiring test).
- **12.2b: drop the whole stale reply**, not just `scheduleWindowEndAt`. `loadSeqRef` numbers each `loadSession` call;
  `appliedLoadSeqRef` is the newest number applied. A reply (ok, `ok:false` or a thrown fetch) older than the newest
  applied one writes nothing. This fixes the plan's noted `setSession` race too.
  - Trap handled: dropping a whole reply could drop a **visibility resync's `forceReveal`** if a poll fired at the same
    moment and won (likely: browsers flush a throttled interval when a tab returns). `forceRevealPendingRef` is set when
    a forceReveal load starts and consumed by whichever ok reply is applied next, so the winner carries it. Test +
    mutation check cover it.
  - The clock reading is taken **before** the staleness check: a reading is valid whatever order replies land in.
  - Not covered (pre-existing, small): once a reply has been applied, its follow-up `current-round` fetch
    (`loadCurrentRound`) can itself race a later one. Not touched.

### 4. Files changed in 12.2
- `lib/categoryBlitzLetterDie.ts` — `DieTimingInput.serverClockOffsetMs`; the cutoff uses it; new `DieClockSample`,
  `DIE_CLOCK_MAX_RTT_MS`, `DIE_CLOCK_SAMPLE_MAX_AGE_MS`, `nextDieClockSample(prev, { serverNowMs, sentAtMs, receivedAtMs })`.
- `lib/categoryBlitzRealtime.ts` — `loadSession`: sequence guard, `forceRevealPendingRef` carry, clock reading;
  new state `serverClockOffsetMs` exposed on `CategoryBlitzSessionState` and the hook's return.
- `app/api/category-blitz/sessions/route.ts` — `serverNowMs: Date.now()` on the non-peek response + doc comment.
- `components/category-blitz/LetterDieRoll.tsx` — optional `serverClockOffsetMs` prop → `live` ref → `dieStage`;
  added to the evaluate effect's deps.
- `components/category-blitz/CategoryBlitzGame.tsx` — destructures `serverClockOffsetMs` and passes it to the die.
- Tests: `tests/lib.category-blitz-letter-die.test.ts` (base input gains the offset; "phone clock off" block: 4 s
  ahead lands / bug without offset, correct clock 6 s late → done, 4 s behind + 6 s late → done / miss without offset;
  `nextDieClockSample` block), **new** `tests/lib.category-blitz-session-load-order.test.ts` (out-of-order replies keep
  the newer window end + session; an older failure doesn't raise an error; a resync's forceReveal survives losing the
  race; `serverNowMs` → offset; none → 0), `tests/components.category-blitz-letter-die-wiring.test.ts` (mock gains the
  offset; phone 4 s ahead → die lands and flies to the board), `tests/api.category-blitz-sessions.test.ts` (exact body
  now includes `serverNowMs`), `tests/category-blitz-letter-die-contract.test.ts` (12.2 pins).

### 5. Facts and traps
- In the wiring test, a phone 4 s ahead also trips the game's elapsed-time reveal fallback (`markRevealDone` early,
  raw phone clock). Harmless: it only unblocks the round's scoring gate; it does not set `finishedRevealRoundId`, so
  the die still holds the board, lands and flies (the test asserts the cascade rows, which only appear on the die path).
- `lib/categoryBlitz.ts` still contains a non-text byte (not touched this phase; `grep -a`, byte-mode Python).
- Test harness for the hook: `renderHook` + `vi.mock("@/lib/supabase", () => ({ supabase: null }))` keeps realtime
  dormant; held fetch promises let a test resolve replies out of order (`retry()` starts a load,
  `document.dispatchEvent(new Event("visibilitychange"))` starts a forceReveal one — jsdom's state is "visible").

### 6. Build / test (all run 2026-10-30, sequentially)
- `npx tsc --noEmit` clean. `npx eslint` on the 10 touched files clean.
- `npm run test`: 5,710 pass / 13 skipped / 4 fail — only the 4 known Bingo star-index freshness tripwires.
- `npm run build` exit 0.
- Mutation checks (restored from scratchpad copies, verified with `cmp`): offset dropped from the cutoff → 3 tests
  fail (2 unit + wiring); sequence guard removed → 2 hook tests fail; forceReveal not carried → the resync test fails.
- Not verified: a real phone with a wrong clock (Phase 13 item), real network timing of the RTT filter.

### 7. Open questions for Andrew
- (Information only) Round timer / old letter drop / watchdog still use the phone's clock. Keep?
- (Carried over, information only) Extending tonight's window mid-game still ends the game at the old time; cron
  test-mode cadence (12.1 handoff).
- (Carried over, optional) May the letter-die work be committed on `after-app-review` (local only) so Phase 13 reviews
  an exact diff?

### 8. First steps for Phase 12.3
1. Read the plan's Phase 11.4 and 12.3 sections and `docs/category-blitz-letter-die-plan_PHASE_11.4_HANDOFF.md`.
2. Find `readyRows` / `markRowReady` / the fallback timer (`endS * 1000 + 500`) in `AnsweringScreen`
   (`components/category-blitz/CategoryBlitzGame.tsx`); the 11.4 contract assertions pin those literals — update them
   with the refactor.
3. 12.3b: the two bare `0.2` fades; check RoundStartReveal's reduced variant before reusing the constant.
4. Gates (same list as above), then `…_PHASE_12.3_HANDOFF.md` and the status line.
