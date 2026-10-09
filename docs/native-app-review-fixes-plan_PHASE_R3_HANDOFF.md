# Native App Review Fixes — Phase R3 Handoff (one haptics path, stale "prize won" buzz)

Plan: `docs/native-app-review-fixes-plan.md` · Phase R3 finished 2026-10-09 · Next phase: **R4**.

## 1. For Andrew (plain English)

**What changed.**
- **Buzzes now work everywhere in the iPhone app.** Before, there were two separate buzz systems. The
  big moments (a Bingo win, a correct Trivia answer) buzzed in the app, but everyday taps (picking a
  Trivia answer, claiming a prize, submitting picks, signing out) only used the browser's vibrate,
  which iPhones don't support. Now every buzz goes through one function, and in the app it uses the
  phone's real haptic motor.
- **No double buzz.** I checked every place that buzzes and every place that plays a gameplay
  animation. None fire for the same moment, so each moment buzzes once.
- **The "prize won" buzz no longer fires for an old win.** Before, if the rewards list failed to load
  on opening and then loaded on a refresh, a prize you won days ago could buzz as if brand new. Now the
  panel only trusts a list that loaded successfully.

**The website is unchanged.** The website and older app builds still use the browser's vibrate exactly as before.

**Is it live?** No. Finished and all automated checks pass, but **not committed, pushed or deployed**
(R1 and R2 aren't either). No new app build is needed.

**What needs you.**
1. Say whether to commit R1 + R2 + R3, and when to push/deploy.
2. Optional phone check after deploy (§2.7).

---

## 2. For the next agent

### 2.1 Next phase goal and scope

**R4: iPhone location check takes too long** (Opus 5.5, medium). Spec: `docs/native-app-review-fixes-plan.md`
§ "Phase R4". In short: in `lib/geolocation.ts` `getBestCurrentLocation`, the native branch waits up to
`timeoutMs` (18 s) for a high-accuracy fix, then up to 14 s more for the fallback (~32 s). Give it the web
path's budget: high-accuracy timeout = `sampleDurationMs` (9 s); low-accuracy fallback
(`maximumAge: 120000`) gets what remains of `timeoutMs` (at least ~3 s). Total ≤ `timeoutMs`. Keep error
type/message identical so `JoinFlow`'s messages don't change. Check every caller for custom
`timeoutMs`/`sampleDurationMs`. Fake-timer tests for three cases (high accuracy succeeds; times out then
fallback succeeds; both fail within `timeoutMs`), then `npm run test:god-mode-join` and core checks.
**Out of scope:** R5 tidy-ups, any `native/` change, any website behaviour change.

### 2.2 Starting state

- Branch `main`, last commit `6726074a1d989c75e76d1b50f4826e9165a64ee5`.
- **R1, R2 and R3 are all uncommitted.** Nothing pushed or deployed. No DB, env, migration or Vercel change.
- Untracked files not ours: `.vscode/settings.json`, `native/ios/App/App/config 2.xml` (iCloud " 2"
  duplicate; never commit; ask Andrew before deleting). The plan and R1/R2/R3 handoffs are untracked too.
- If asked to commit, add files by name, never `git add -A`. R1/R2/R3 share `CLAUDE.md`,
  `docs/native-app-store-plan.md` and (R1/R2) `components/join/JoinFlow.tsx`, and interactive
  `git add -p` isn't available, so one combined commit is simplest. Ask Andrew.
- R3's files are in §2.4.

### 2.3 Decisions made in R3 (don't re-ask)

- `haptic()` mapping: selection→tap, commit→tap, success→success, warning→warning. `celebrate` is only
  reachable through animations.
- Reduce Motion: `playHaptic` already honours it, so `haptic()` gets it on the native path only. The
  website path is untouched (byte-for-byte same `navigator.vibrate` call).
- **Double-buzz audit result: nothing to drop.** Every `haptic()` caller (~17 in 14 files) fires at a
  tap/submit/claim moment. The `HAPTIC_BY_ANIMATION` animations fire later, from results or live events.
  Examples: Trivia `haptic("selection")` on tap vs `SPEED_TRIVIA_CORRECT` when the result arrives; Bingo
  `haptic("success")` on claim vs `BINGO_WIN`/`BINGO_SQUARE` on detection; Fantasy `haptic("commit")` on submit vs
  `FANTASY_SCORE_UP` on a live score. Not removed because they are separate moments. A test guards the three
  densest files against a `haptic()` directly followed by `triggerAnimation(`. Re-audit if you add either side.
- "Baseline only from a successful load": added an explicit `hasLoadedChallenges` prop rather than inferring
  from the card list, because a failed first load leaves `[]` (indistinguishable from "no rewards"), and the
  hub clears `challengesError` at the start of the retry, which would otherwise have let the empty list become
  the baseline.

### 2.4 Files changed in R3

- `lib/haptics.ts`: `haptic()` now checks `hasNativeCapability("Haptics")`; if true it calls `playHaptic(NATIVE_KIND[pattern])`
  and returns, else the old `navigator.vibrate`. Imports `hasNativeCapability` (`lib/nativeApp.ts`) and
  `playHaptic`/`HapticKind` (`lib/nativeHaptics.ts`; no import cycle).
- `components/venue/VenueHubClient.tsx`: new state `hasLoadedChallenges`, set `true` right after
  `setChallengeCards(...)` in `loadChallengeCampaigns` (success path only); passed to the panel.
- `components/venue/VenueChallengesPanel.tsx`: new required prop `hasLoadedChallenges`; the won-ids effect
  returns early while loading, while `challengesError` is set, or before the first success. Only one caller
  (the hub).
- `tests/native-haptics-unified.test.ts` (new, jsdom, 7 tests): routing to native vs vibrate (with plugin; website
  and old shell without it); no `callNative` outside `lib/nativeHaptics.ts` in the two buzz callers; the
  haptic/animation adjacency guard; panel tests: failed first load → old win no buzz, genuine new win buzzes once,
  failed refresh doesn't reset the baseline. `playHaptic` is mocked.
- `CLAUDE.md`: the haptics sentence in the native bullet rewritten (one native call site, `playHaptic`; reached
  from `triggerAnimation` and `haptic()`; never both for one moment; baseline rule).
- Status lines in `docs/native-app-review-fixes-plan.md` and `docs/native-app-store-plan.md` (line 41).

### 2.5 Facts and traps

- `tests/native-share-haptics-contract.test.ts` still passes unchanged. It asserts only `lib/nativeShare.ts` and
  `lib/nativeHaptics.ts` talk to the plugins; `lib/haptics.ts` reaches the plugin only via `playHaptic`.
- Test traps: the panel reads `card.name` (`inferChallengeGameType`), so fixture cards need a `name`. Test files are
  `*.test.ts`, so use `createElement`, not JSX.
- The shell is zsh: unquoted `--include=*.ts` globs error out; use `grep -rnE ... app components lib`. BSD `sed -i ''`.
- **One full `npm run test` run had a single failing test that I did not identify**; two immediate reruns were fully
  green (3,692 pass). It looks flaky/timing-related and is unrelated to the files above. If it appears again, capture
  the test name from the first run's `FAIL` line.

### 2.6 How to build, run and test (run 2026-10-09 after R3)

- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note).
- `npx vitest run tests/native-haptics-unified.test.ts tests/native-share-haptics-contract.test.ts`: pass.
- `npm run test`: 320 files passed, 1 skipped; 3,692 tests passed, 13 skipped, 0 failed (see flaky note).
- Not run: `npm run build` (not a core check; never run it concurrently with typecheck), `test:god-mode-join`
  (join flow untouched in R3).
- **Unverified:** actual haptic feel on a device.

### 2.7 Device check (Andrew, iPhone app, after deploy; optional)

1. In Speed Trivia, tap an answer: a light tap should be felt (before: nothing on iPhone).
2. Claim a prize or sign out: a success buzz / warning buzz.
3. With iPhone Reduce Motion on, none of these buzz.

### 2.8 Open questions for Andrew

- When to commit/push/deploy R1–R3 (one commit vs more).
- From R1, still open: keep "Back on the venue page minimises the app"? And the Android device check.

### 2.9 Recommended first steps for R4 (Opus 5.5, medium)

1. Read plan § R4 and `lib/geolocation.ts` (`getBestCurrentLocation`, native branch ~line 153).
2. `grep -rnE "getBestCurrentLocation" app components lib` and note each caller's options.
3. Implement the budget split, then the three fake-timer tests; keep the error type/message unchanged.
4. Run `npm run test:god-mode-join`, then `npx tsc --noEmit`, `npm run lint`, `npm run test`.
5. Write `docs/native-app-review-fixes-plan_PHASE_R4_HANDOFF.md` and update both status lines.
