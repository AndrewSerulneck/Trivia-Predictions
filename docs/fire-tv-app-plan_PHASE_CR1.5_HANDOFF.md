# Fire TV plan — Phase CR1.5 handoff (TV Connect screen timing: F7, F8, F9, F10, F11, F35)

**For Andrew:** the TV's Connect screen no longer says "Code expired" when a partner connects in the last few seconds.
It also stops double-polling when hidden and shown again, ignores a TV clock that is wrong, no longer says "expired"
when a partner taps connect twice, and stops sending a new code request on every key press after "Can't connect."
(OK / Enter only, and not before the wait the server asks for). The `?awake=debug` readout now updates in the TV app.
Website only: no store release, no migration, no env var. Live when the PR merges. Nothing needs you.

**What changed**
- `components/venue-screen/TvConnectScreen.tsx`: deadline = receipt time + `TV_PAIR_TTL_MS` (server `expired` decides);
  one final status read at the deadline, even if hidden (≤ 201 reads per code); an in-flight flag so `onVisible`
  can't start a second chain; renew only on Enter or a tap, never on other keys or window focus, and not before
  `Retry-After` (kept in `retryAfterMsRef`).
- `lib/tvConnect.ts`: create's cleanup spares rows claimed in the last 60 s (`.or("claimed_at.is.null,claimed_at.lt.…")`);
  `claimTvPairing` on 0 rows reads the code and returns ok if it is already claimed for the same venue.
- `lib/useKeepScreenAwake.ts`: the native branch now listens to `visibilitychange` (F35).
- Tests: new `tests/components.tvConnectScreen.test.ts` (jsdom, fake timers; 6 tests); `tests/lib.tvConnect.test.ts`
  (+2, and the fake DB understands `.or()`); `tests/tv-app-contract.test.ts` now pins "Enter only, no focus renewal".
  Against the old code the new tests fail (7 of 8; the 8th, "server's expired still ends it", is a guard).

**Verified:** `npm run test` (all pass after the contract update), `npx tsc --noEmit`, eslint on the touched files.
Not verified on a real TV (the plan's device review comes last, D34).

**Decision:** the wording of the plan said "keep tap/Enter"; I kept Enter and `pointerdown` (a phone-sized tap), and
dropped `focus` and "any key". Say so if taps should go too.

**Branch / state:** `fix/tv-connect-timing` from `origin/main` `ddad2a3a`; one commit; PR number and CI in the plan
status line once pushed. Also recorded in the CR1.4 handoff §9 that #60 merged as `ddad2a3a`.

**Next phase:** CR1.6 is in `docs/bingo-pickem-reliability-plan.md` ("Phase CR1.6", BallDontLie season probe); then CR2,
CR3. CR1.7 waits for Amazon to approve 1.0.0. Model per the table.
