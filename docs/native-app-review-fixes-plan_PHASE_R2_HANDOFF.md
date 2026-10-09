# Native App Review Fixes — Phase R2 Handoff (venue QR scan on the venue list)

Plan: `docs/native-app-review-fixes-plan.md` · Phase R2 finished 2026-10-09 · Next phase: **R3**.

## 1. For Andrew (plain English)

**What changed.** In the app, a signed-in player who taps "Scan QR code" on the venue list and scans
a venue's QR code now gets one of these results:

- **The venue is near them** (it's in their list): it opens, exactly as if they had tapped it.
- **The venue is too far away:** they see "You need to be at <venue name> to join." Nothing opens. A QR
  code doesn't prove where someone is, so the location rule is unchanged.
- **The code is for a venue we can't find** (deleted, or hidden): they see "That's not a Hightop code."
  Hidden venues get the same message, so a scan can't reveal that one exists.
- **Their location check is still running, or location is off:** a short message asks them to wait,
  or to allow location and scan again.

Before R2, nothing happened in any of these cases. God Mode accounts can open any venue this way,
the same as tapping it in their list.

**The website is unchanged.** The scan button only appears inside the app. The scan button on the
sign-in screen (before the player signs in) behaves exactly as before.

**Is it live?** No. The code is finished and every automated check passes. It is **not committed,
pushed or deployed** (R1 isn't either). No new app build is needed. This is website code, so it goes
live with a normal deploy.

**What needs you.**
1. Say whether to commit R1 and R2, and when to push and deploy.
2. Optional phone check after deploy (§2.7). It needs a printed or on-screen venue QR code.

---

## 2. For the next agent

### 2.1 Next phase goal and scope

**R3: one haptics path, and the stale "prize won" buzz** (Sonnet 5.5, medium effort, per the plan).
The full spec is in `docs/native-app-review-fixes-plan.md` § "Phase R3". In short:

- `lib/haptics.ts` `haptic()` becomes the single buzz function.
  - When `hasNativeCapability("Haptics")` is true, it calls `playHaptic` from `lib/nativeHaptics.ts`
    and skips `navigator.vibrate`. Map the patterns as: selection→tap, commit→tap, success→success,
    warning→warning.
  - Respect Reduce Motion on the native path only.
  - Otherwise it keeps today's `navigator.vibrate` path.
- Remove double buzzes where both `haptic()` and `triggerAnimation()` fire for the same moment.
- Fix `components/venue/VenueChallengesPanel.tsx` so `wonIdsRef` is set as a baseline only from a
  **successful** load.
- Update the CLAUDE.md haptics sentence.

**Out of scope for R3:**
- R4 (the iPhone location timeout) and R5 (tidy-ups).
- Any `native/` change.
- Any change to website buzz behaviour.

### 2.2 Starting state

- Branch: `main`.
- Last commit: `6726074a1d989c75e76d1b50f4826e9165a64ee5` ("Native app Phase 4b: handoff, device
  checklist section I, plan status").
- **R1 and R2 are both uncommitted** in the working tree. Nothing was pushed or deployed.
- Untracked files that were already there before R1 and are not ours:
  - `.vscode/settings.json`
  - `native/ios/App/App/config 2.xml`: an iCloud " 2" duplicate. Never commit it. Ask Andrew before
    deleting it.
- These plan and handoff docs are also untracked: `docs/native-app-review-fixes-plan.md` and its
  `_PHASE_R1_HANDOFF.md` / `_PHASE_R2_HANDOFF.md`.
- **If Andrew asks you to commit:** add the files by name, never with `git add -A`.
  - R1's file list: `docs/native-app-review-fixes-plan_PHASE_R1_HANDOFF.md` §2.2 and §2.4.
  - R2's files: §2.4 below.
  - R1 and R2 both edited `components/join/JoinFlow.tsx`, `CLAUDE.md` and
    `docs/native-app-store-plan.md`. Splitting them into separate commits would need a partial-hunk
    add. Interactive `git add -p` isn't available, so one combined "R1 + R2" commit is simplest. Ask
    Andrew.
- No database, env var, migration or Vercel change. No data was touched.

### 2.3 Decisions made in R2 (don't re-ask)

- **The geofence rule is unchanged** (plan §3 item 3). A scan selects a venue only if it's in the
  list this sign-in already built. `handleSelectVenue` → `/api/join/profile` stays the authority,
  exactly as for a tap. God Mode's list is "every public venue", so it always finds the venue.
- **Unknown or hidden id:** shows the same text as a bad code, `"That's not a Hightop code."`. That
  text now has one home: `NOT_A_HIGHTOP_CODE_MESSAGE` in `lib/nativeQrScan.ts`, used by both
  `ScanQrButton` and `lib/joinVenueList.ts`. Using the same words is deliberate: a scan must not be
  able to tell a hidden venue from a missing one.
- **Where the out-of-range name comes from:** the public list `listVenues()`, which excludes hidden
  venues. Nothing calls `getVenueById`, because it doesn't filter `hidden`. `listVenues()` reads the
  5-minute sessionStorage cache that `buildVenueListAfterAuth` just filled, so a scan normally makes
  **zero network requests**. A cold cache costs one venues query.
- **Added a fourth outcome the plan didn't list: "not ready".** It covers a list that isn't built for
  the current sign-in yet: location still running, location failed or denied, or a stale generation.
  Without it, an in-range venue would wrongly show "You need to be at …".
  - While `locationLoading` is true it says "Still checking your location. Try again in a moment."
  - Otherwise it says "We need your location to check you're at the venue. Allow location, then scan
    again."
- **The message is shown by `ScanQrButton`.** `onVenueScanned` may now return a string (sync or
  async) and the button shows it under itself. The pre-sign-in host still returns `router.push(...)`
  (void), so nothing changes there.
- Per CLAUDE.md, no geolocation call, no `venueListBuiltRef` reset and no list mutation happen in the
  scan path.

### 2.4 Files changed in R2

- `lib/joinVenueList.ts`: new pure exports.
  - `ScannedVenueDecision` (`select` | `not-ready` | `out-of-range` | `not-found`).
  - `decideScannedVenue(venueId, state, joinableVenues)`. Order of checks: in the visible list →
    select; not in public venues → not-found; list not built for this generation → not-ready;
    otherwise out-of-range with `getVenueDisplayName`.
  - `scannedVenueMessage(decision, locationLoading)`.
  - Now imports `lib/nativeQrScan.ts` (only its constant) and `lib/venueDisplay.ts`.
- `lib/nativeQrScan.ts`: new `NOT_A_HIGHTOP_CODE_MESSAGE`.
- `components/join/ScanQrButton.tsx`:
  - `onVenueScanned` type is now `(venueId, path) => void | string | Promise<void | string>`.
  - The button awaits the handler and shows a returned string.
  - `MESSAGES.invalid` uses the shared constant.
- `components/join/JoinFlow.tsx`:
  - New `handleVenueListQrScanned` (just before `handleBackToVenueList`, ~line 1631). It runs
    `decideScannedVenue(scannedVenueId, venueListState, await listVenues())`, then either
    `handleSelectVenue(decision.venue)` or returns the message.
  - The venue-list `<ScanQrButton>` (~line 3284) now uses it.
  - The comment on `handleVenueQrScanned` (~785) was updated. It is still used by the pre-sign-in
    button (~2982).
- Tests:
  - `tests/lib.join-venue-list.test.ts`: new `decideScannedVenue` block (6 tests): in the list,
    out of range with display name and message, God Mode, unknown or hidden, not ready (both
    messages), and a stale generation.
  - `tests/god-mode-join-contract.test.ts`: new "Venue-list QR scan (R2)" block (3 static tests).
    The handler must go through `decideScannedVenue` + `handleSelectVenue` with no
    router/location navigation, no geolocation, and no list or `venueListBuiltRef` mutation. The
    venue-list button must use it, and the pre-sign-in button must keep the `/?v=` push.
- Docs:
  - `CLAUDE.md`: one sentence added to the native-app QR scanner bullet.
  - Status lines in `docs/native-app-review-fixes-plan.md` and `docs/native-app-store-plan.md`.

### 2.5 Facts and traps

- `venueListState` must only be read through `visibleJoinVenueList()`. That's the Phase 2C rule,
  pinned by `god-mode-join-contract`. `decideScannedVenue` does that internally. The handler passes
  the raw state to it, and the existing static test still passes (it checks that the raw list isn't
  rendered or set).
- `handleSelectVenue` has three branches: account → `resolveAndNavigate`, session →
  `resolveAndNavigateFromSession`, and the legacy venue-login panel. A scan follows whichever applies,
  the same as a tap.
- `tests/native-qr-scan.test.ts` pins exactly **2** `<ScanQrButton` in JoinFlow. Don't add a third.
- Not done: a jsdom render test of `ScanQrButton` showing the returned message. That code is a
  four-line branch. Add the test if R3/R5 touches the button.
- Unrelated iCloud " 2" duplicate files exist in the repo. Don't create or commit them.

### 2.6 How to build, run and test (all run 2026-10-09 after R2)

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean. The only output is the usual Babel note about `lib/sportsBingo.ts` size.
- `npm run test:god-mode-join`: 59/59 (50 before R2).
- `npm run test`: **319 files passed, 1 skipped; 3,685 tests passed, 13 skipped, 0 failed**.
- Focused: `npx vitest run tests/lib.join-venue-list.test.ts tests/god-mode-join-contract.test.ts tests/native-qr-scan.test.ts`
  gives 43/43.
- `npm run build` was not run. It isn't a core check. Never run it at the same time as typecheck.
- **Unverified:** a real scan on a device. Headless browsers have no camera or scanner plugin.

### 2.7 Device check (Andrew, app, after deploy; optional)

On the venue list while signed in, tap "Scan QR code" and scan each of these:
1. The QR for the venue you're at: the venue opens.
2. A QR for a venue elsewhere (as a normal account): "You need to be at <name> to join."
3. The plain join QR (merch): "That's the Hightop join code. Pick your venue from the list."

### 2.8 Open questions for Andrew

- When to commit, push and deploy R1 and R2 (one commit or two).
- From R1, still open: keep "Back on the venue page minimises the app"? And the Android device check.

### 2.9 Recommended first steps for R3 (Sonnet 5.5, medium)

1. Read `docs/native-app-review-fixes-plan.md` § R3, `lib/haptics.ts`, `lib/nativeHaptics.ts` and
   `components/venue/VenueChallengesPanel.tsx` (~line 46, `wonIdsRef`).
2. Run `grep -rn "from \"@/lib/haptics\"" components app lib` to list the ~20 `haptic()` callers.
   For each one, check whether the same moment also calls `triggerAnimation(...)` with an animation
   in `HAPTIC_BY_ANIMATION`. Drop one of the two.
3. Keep the website path byte-for-byte the same. Gate the new path on `hasNativeCapability("Haptics")`.
4. Write the plan's three tests, run the core checks, then write
   `docs/native-app-review-fixes-plan_PHASE_R3_HANDOFF.md` and update both status lines.
