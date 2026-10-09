# Native App Review Fixes — Phase R1 Handoff (Android Back)

Plan: `docs/native-app-review-fixes-plan.md` · Phase R1 finished 2026-10-09 · Next phase: **R2**.

## 1. For Andrew (plain English)

**What changed.** The phone's Back button inside the Android app now behaves the way people expect:

- If a popup is open (the menu, a coupon, the story camera, the Bingo "create board" sheet, the
  calendar, an ad, a reward's details, a dropdown), Back closes that popup. The page under it stays
  where it was.
- Back on the venue page (the main screen once you're signed in) now puts the app in the background,
  like other Android apps do on their main screen. It no longer bounces you back into the game you
  just left.
- Back from other screens no longer piles up history, so pressing Back again can't loop between two
  screens.
- If the "Please update the app" screen is showing, Back can't open pages behind it. It puts the
  app in the background instead.

**The website is unchanged.** Every change only does something inside the app. A tap on the
on-screen Back arrow works exactly as before, everywhere.

**Is it live?** No. The code is finished and every automated check passes, but it is **not
committed, pushed or deployed**. No new app build is needed: this is website code, so it goes live
with a normal deploy.

**What needs you.**
1. Say whether to commit (and when to push/deploy). I didn't commit because you didn't ask.
2. The Android phone check below (§2.7) after it's deployed. Only a real device or the emulator can
   confirm it.
3. Optional: the plan's default is that **Back on the venue page minimises the app**. If you'd
   rather it went somewhere else (for example the sign-in screen), say so. It's a one-line change.

---

## 2. For the next agent

### 2.1 Next phase goal and scope

**R2 — venue QR scan on the signed-in venue list** (Opus 5.5, medium effort, per the plan). Full
spec: `docs/native-app-review-fixes-plan.md` § "Phase R2". In short: on the `venue-list` panel a
scan currently just `router.push('/?v=X')`. The load effect then sees a stored identity and stays on
the list, so nothing happens. Fix: when `activePanel === "venue-list"`, resolve the scanned venue
id and call the same `handleSelectVenue` a tap uses (no URL push).
- In the built list: select it.
- Not in the list (out of range): show "You need to be at <venue> to join". Don't select it.
- Unknown or hidden id: show the bad-code message.
- Before sign-in (the `/?v=` deep-link path): behaviour unchanged.

**Out of scope for R2:** anything in R3–R5 (haptics, location timeout, tidy-ups), any `native/`
change, and any change to the geofence rule. A QR never bypasses the geofence, and
`/api/join/profile` stays the authority.

### 2.2 Starting state

- Branch `main`. Last commit `6726074a1d989c75e76d1b50f4826e9165a64ee5` ("Native app Phase 4b:
  handoff, device checklist section I, plan status").
- **R1 is uncommitted** in the working tree. Nothing was pushed or deployed.
- Untracked files that were **already there before R1, and are not mine**: `.vscode/settings.json`,
  `docs/native-app-review-fixes-plan.md` (the plan itself; never committed yet), and
  `native/ios/App/App/config 2.xml`. That last one is an iCloud " 2" duplicate. Don't commit it. Ask
  Andrew before deleting it.
- `docs/native-app-store-plan.md` already had an uncommitted status-line edit (pointing at this
  review plan) before R1. I only changed "not started" → "R1 done … handoff …".
- If Andrew asks you to commit R1, commit these files: the 19 code files listed in §2.4,
  `tests/native-back-review-fixes.test.ts`, `CLAUDE.md`, `docs/native-app-store-plan.md`,
  `docs/native-app-review-fixes-plan.md` and this handoff. Do **not** use `git add -A`, which would
  sweep in the untracked files above.
- No database, env var, migration or Vercel change. No data touched.

### 2.3 Decisions already made (don't re-ask)

- Plan §3 item 2 (default, Andrew may override): **the venue hub is the signed-in player's root.
  Back there minimises.** It is implemented as an `"exit"` registration on the hub. To change it,
  change only that line (`components/venue/VenueHubClient.tsx`, `useNativeBackHandler("exit", minimizeNativeApp)`).
- Plan §3 item 4: the website must not change. All new registrations go through
  `useNativeBackHandler`, which is inert outside the app (`isNativeApp()` check inside the hook). The
  `replace` option is only passed by the native registration. The tap path calls `handleExit()`
  with no argument, which defaults to `push`.
- No new primitive: one `useNativeBackHandler("overlay", open ? close : null)` per popup.
- Game screens whose Back is a caller-owned `onExit` (Trivia `returnToVenueHome`, Live Trivia
  `goHome`, Bingo/Pick 'Em/Fantasy/NFL `onBack`, Category Blitz `backToVenue`) were **left as they
  are**. Their fallback still `router.push`es the venue. That is now harmless: the venue hub
  minimises on Back, so the pushed entry is never walked back into. `onExit` always wins in
  `useExitNavigation`, so `{ replace }` does not reach those.

### 2.4 Files changed

Core (Problem B and the hub):
- `components/navigation/nativeBackButton.ts`: new `minimizeNativeApp()`, which calls
  `callNative("App","minimizeApp")` and swallows a rejection, so it's a no-op on the website. The
  header comment now documents the player-popup rule and the replace rule.
- `components/navigation/exitNavigation.ts`: `handleExit({ replace = false }: ExitRunOptions = {})`
  plus the exported type `ExitRunOptions`. A local `goTo(target)` picks `router.replace` or
  `router.push`. **All 7** former `router.push` calls inside `handleExit` now use `goTo`:
  - the two venue-home `fallbackNavigate` calls;
  - `preferHref`;
  - the `history.length <= 1` branch;
  - the in-app 2000 ms fallback;
  - the website 150 ms fallback;
  - the SSR tail.

  Precedence, `history.back()` and both timers are untouched.
- `components/navigation/ExitBackButton.tsx`: the native registration now calls
  `handleExit({ replace: true })`. `onClick` is unchanged.
- `components/native/NativeAppRuntimeImpl.tsx`:
  - The `minimize` fallback is now `minimizeNativeApp`.
  - New `useNativeBackHandler("overlay", update.required ? minimizeNativeApp : null)`, so Back can't
    navigate behind `AppUpdateRequired`. The page's ExitBackButton is still mounted underneath it.
  - The unused `callNative` import was removed.
- `components/venue/VenueHubClient.tsx`: three hook calls just before the render `return`:
  - menu drawer (`isMenuOpen`);
  - reward-detail modal (`selectedChallengeDetail` → `setSelectedChallengeId(null)`);
  - `("exit", minimizeNativeApp)`.

Player popups (Problem A). Each registers the **same close its X/scrim/Escape uses**:

| File | Registration |
|---|---|
| `components/venue/CategoryBlitzOnboardingOverlay.tsx` | `open ? (currentStep > 0 ? goToPreviousStep : handleClose) : null` (= its own Back button) |
| `components/ui/AccountMenu.tsx` | drawer `isMenuOpen` + Change Username modal `isUsernameModalOpen` (the in-game hamburger, via `LeftHamburgerMenu`/`PageShell`) |
| `components/social-share/StoryCaptureModal.tsx` | `isOpen ? closeModal : null` (stops the camera, like Escape) |
| `components/social-share/ShareActionsSheet.tsx` | `onClose ?? null` (an in-modal panel; it mounts after the camera modal, so it wins first) |
| `components/prizes/PrizeWalletPanel.tsx` (`RedeemModal`) | `onClose` (mounted only while open; the host's `onClose` already ignores it mid-confirm) |
| `components/bingo/CreateBoardSheet.tsx` | `step === "sport" ? requestClose : handleStepBack` (the header chevron, or X on step 1) |
| `components/bingo/SportsBingoSelectBoard.tsx` | expanded preview `preview && isPreviewExpanded` |
| `components/bingo/SportsBingoHome.tsx` | expanded active board + expanded final board, both `&& !isLandscapeGameView` (portrait tree only) |
| `components/ui/DateCalendarPopover.tsx` | `isOpen ? closeSheet : null` |
| `components/ui/PopupAds.tsx` | `popup?.open ? beginClose : null` |
| `components/ui/Dropdown.tsx` | `isOpen` (shared with owner pages; inert there because `/owner` is web-only) |
| `components/leaderboard/LeaderboardTable.tsx` | timeframe menu |
| `app/trivia/live/page.tsx` | sponsor popup `popupAd` (registered before the `if (loading)` early return) |
| `components/join/JoinFlow.tsx` (`PasskeyEnrollmentPrompt`) | `onSkip`, the prompt's only dismissal. Without it, the wizard's `"step"` handler would run under the prompt. Skip does `location.assign(venueTarget)` |

Tests and docs:
- New `tests/native-back-review-fixes.test.ts` (jsdom). Behaviour tests render the real
  `ExitBackButton` with a fake `window.Capacitor` bridge and a mocked `next/navigation`. They check:
  - an overlay beats exit;
  - native Back calls `replace` on the fresh-history, `preferHref` and `venueHomeFallback` paths;
  - a tap pushes, in the app and on the website;
  - on the website nothing registers;
  - the hub minimises via `nativePromise("App","minimizeApp",{})`, but its popups close first.

  Static tests pin every registration in the table above, the hub exit, the update-screen block and
  the ExitBackButton tap/native split. **A new player popup should be added to `OVERLAYS` in that
  file.**
- `CLAUDE.md`: three lines appended to the native-app "Production shell" bullet (the Android Back
  rule).
- Status lines: `docs/native-app-review-fixes-plan.md`, `docs/native-app-store-plan.md`.

### 2.5 Facts and traps

- `useNativeBackHandler` registers when `run` goes from null to non-null. Its stack position is
  **when it opened**, not its last render. Same rank → newest wins. So a popup opened inside a
  sheet (Bingo preview inside `CreateBoardSheet`, Share panel inside the story camera) correctly
  wins over its host.
- Hooks must sit above every early `return` in a component. I placed each one accordingly (for
  example SportsBingoHome before its landscape `return` at ~line 2063, and Live Trivia before
  `if (loading)`). Lint's rules-of-hooks passes.
- Not registered, on purpose:
  - `VenueAccessOverlay` has no dismiss (its buttons are recheck and leave), per plan.
  - Live Trivia's forfeit modal, `ReadyPrompt`, `RoundStartCountdownOverlay` and the `components/animations/*` overlays are timed or non-dismissable.
  - `components/ui/LeftHamburgerNav.tsx` is **dead code**: nothing imports it.
  - The NFL leaderboard row expander is an accordion, not a popup.
  - `app/info` is a marketing page, which opens in the system browser in the app.
  - Admin and owner surfaces are web-only.
- `VenueAccessOverlay` caveat: because it isn't registered, Back on a game page under it still runs
  the game's exit (to the venue hub, where the same presence boundary applies). On the hub itself,
  Back minimises. This follows the plan as written. Flag it to Andrew only if the device check shows
  something odd.
- `AppUpdateRequired` block: a popup that opens on a timer *after* the update screen (for example a
  timed ad) would register later and win one Back press (closing the hidden ad). That's harmless,
  and the update screen covers everything.
- The repo has iCloud " 2" duplicate files (for example `tests/... 2.ts`, `native/ios/App/App/config 2.xml`).
  They are pre-existing. Don't create or commit them.
- `tests/*.test.ts` only (no `.tsx`), so test components use `createElement`.

### 2.6 How to build, run and test

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm run test`: **319 files passed, 1 skipped; 3,676 tests passed, 13 skipped, 0 failed**.
- `npm run test:god-mode-join` (required because JoinFlow was touched): 6 files, 50/50.
- Focused: `npx vitest run tests/native-back-review-fixes.test.ts tests/lib.native-app-phase3.test.ts tests/native-app-contract.test.ts` gives 73/73.
- Not run: `npm run build` (not one of the plan's core checks; it was not run this phase). Never run
  it at the same time as typecheck.
- **Unverified:** real Android behaviour. Headless/jsdom can't press a hardware Back.

### 2.7 Device check (Andrew, Android emulator or phone, after deploy)

- Open each popup, then press Back. The popup closes and the page stays. Popups to check:
  - venue menu;
  - a reward's details;
  - the Category Blitz tutorial (Back steps back through the slides, then closes);
  - the in-game ☰ menu and Change Username;
  - the story camera and its share panel;
  - a prize coupon;
  - Bingo create-board (steps back, then closes);
  - an expanded Bingo board;
  - the Bingo calendar;
  - a sponsor ad;
  - the leaderboard timeframe and week dropdowns.
- Venue → game → Back → venue → Back: the app goes to the background, with no bounce.
- Any content page (for example FAQs from the menu) → Back → the parent → Back again: no loop.

### 2.8 Open questions for Andrew

- Commit/push/deploy timing for R1. It's website-only, so a normal deploy suffices.
- Keep "venue hub Back = minimise", or choose a different destination.

### 2.9 Recommended first steps for R2 (Opus 5.5, medium)

1. Read `CLAUDE.md` § "Join/Login Flow" and `docs/native-app-review-fixes-plan.md` § R2.
2. `components/join/JoinFlow.tsx`:
   - `handleVenueQrScanned` is at **line ~785** (`(_venueId, path) => router.push(path)`).
   - The two `ScanQrButton` hosts are at ~2982 (auth-method screen, pre-sign-in: keep as is) and
     ~3265 (venue-list panel: the one to fix).
   - `handleSelectVenue` is at ~1579.
   - The rendered list is `venueList = visibleJoinVenueList(venueListState)` (~801).
   - List helpers: `beginVenueListBuild` / `commitVenueList` / `discardVenueList` (~865–880).
   - The scan parser is `lib/nativeQrScan.ts` (`parseHightopQr`, `joinPathForScan`); the button is
     `components/join/ScanQrButton.tsx`.
3. Put the pure decision (in list → select, out of range → message, unknown → bad-code message) in a
   small pure function, ideally beside `lib/joinVenueList.ts`, so it can be unit-tested without
   rendering JoinFlow. Don't reset `venueListBuiltRef` and don't call geolocation.
4. Run the core checks and `npm run test:god-mode-join`. Then write
   `docs/native-app-review-fixes-plan_PHASE_R2_HANDOFF.md` and update the plan's status line.
