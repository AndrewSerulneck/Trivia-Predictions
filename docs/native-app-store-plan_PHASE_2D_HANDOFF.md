# Native App Store Plan — Phase 2D Handoff (fit the screen: status bar, venue-home gap, smaller logos)

Plan: `docs/native-app-store-plan.md` → "Phase 2D". Worked 2026-10-08/09 by Claude Opus 5.5.
**Status: built and verified on Andrew's real iPhone 16 Pro, the iOS Simulator and the Android
emulator. NOT committed, NOT pushed, NOT deployed** (Andrew asked to "execute 2D", not to commit
it). **Next phase: 2E** (app front door). Its spec, plus a new QR rule Andrew asked for, is in the plan.

---

## Summary for Andrew (plain English)

**What changed.**
- **iPhone app: nothing hides under the clock, battery or camera cutout any more.** The app now
  starts the page *below* the status bar, the way Android already did, and paints that strip the
  site's dark navy with white icons. This one change fixed every screen at once. I found at least six
  screens that were cut off before: the sign-in logo, the venue-home menu and bell, the venue menu,
  Category Blitz's Back button, the Pick 'Em intro and the partner sign-in's Back button.
- **Android app:** the white status bar is now dark navy with white icons, matching the iPhone.
- **Venue home (website and app):** the header bar now measures itself. The game cards sit just
  under the Games / Leaderboard / Rewards bar, with no dead band and nothing tucked underneath. On
  the website the header looks exactly as before. The first card used to touch the header's bottom
  edge; it now has a little breathing room.
- **Smaller logos (you asked):** the big logo on the **player sign-in** and the **partner sign-in**
  is 20% smaller (320 → 256 px), so the sign-in buttons move up about 64 px. The Partner Dashboard
  has no big logo (its top-left is the round menu button), so nothing changed there.
- **Your QR question** is answered and written into the 2E plan. Today, scanning the QR opens
  `play.hightopchallenge.com` in the phone's browser, and that page is the **player** sign-in. Nothing
  there sends anyone to the partner sign-in (I checked the live site). The risk only appears once 2E
  adds "remember that this phone belongs to a partner". The new rule: a QR or link always opens the
  player sign-in, and only tapping the app icon uses the partner shortcut.

**Is it live?**
- The **app** changes are already on your iPhone. I installed the new test build over the old one
  (same "Hightop Challenge" icon). On Android they're in the emulator.
- The **website** changes (venue header, smaller logos) are **not live**. Say "commit and push" to
  ship them; Vercel deploys from `main`. The app picks them up as soon as the site deploys.

**What needs you.**
1. Say whether to commit and push Phase 2D.
2. A 10-minute check on your iPhone, after the push (the checklist is in §6 below). The most
   important check is **Bingo turned sideways**, because I couldn't rotate the simulator on this Mac.
3. Optional: if you want the venue home checked as a regular (non-God-Mode) player, sign in with any
   normal account. I made a throwaway test player for my own checks and deleted it afterwards.

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md`; `docs/native-app-store-plan.md` (§2, the
"Andrew's first device report" table, Phase 2E); `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`
(§5 traps, §6 commands, §8 Phase 3 approach, §9 device report); `…_PHASE_2C_HANDOFF.md` §5 (the
venue-list rules); and this file.

### 1. Next phase: goal and scope

**2E: the app's front door** (R5, no `/info` inside the app; R6, the false "No connection" screen
on Back from a legal page; R7, the Airplane Mode re-test). The plan's Phase 2E section is the spec.
It now includes **Andrew's QR rule** (item 4): a launch that came through a link or QR always lands on
the player sign-in, the remembered-partner shortcut applies only to a plain icon launch, and there's
an extra unit-test case for it.

Out of scope for 2E: the rest of Phase 3 (icons, splash, the min-version gate, Universal Links, the
link-out rules beyond what 2E names), passkeys (Phase 2 Part B), push notifications.

### 2. Starting state

- Branch `main`. HEAD **`858660c`** ("Native app Phase 2C…"), preceded by **`f96c386`** ("Native app
  Phase 2A…"). Both were pushed to `origin/main` on 2026-10-08 at Andrew's request ("commit and push.
  Commit Phase 2A and 2C separately"). The plan, `CLAUDE.md` and the 2A handoff held edits from both
  phases. They were split by building a 2A-only copy of each file and staging it with
  `git update-index --cacheinfo`, so the working tree was never touched. Vercel deploys from `main`;
  I didn't separately check that the 2C deploy finished.
- **Phase 2D is uncommitted.** Files (all 2D, none mixed):
  `components/venue/VenueHubHeaderBar.tsx`, `components/venue/VenueHubClient.tsx`,
  `components/join/JoinFlow.tsx` (one line: logo width), `components/owner/OwnerShell.tsx` (one line:
  logo width), `tests/native-safe-area-contract.test.ts` (new), `native/capacitor.config.json`,
  `native/package.json`, `native/package-lock.json`, `native/ios/App/CapApp-SPM/Package.swift`,
  `native/android/app/capacitor.build.gradle`, `native/android/capacitor.settings.gradle`
  (the last four were regenerated by `npx cap sync`), `native/android/app/src/main/res/values/styles.xml`,
  `native/android/app/src/main/res/values/htc_colors.xml` (new), `CLAUDE.md` (one Native-app bullet),
  `docs/native-app-store-plan.md` (status line, 2D status note, 2E QR rule),
  `docs/native-app-store-plan_PHASE_2A_HANDOFF.md` (R1/R2 rows marked fixed, §8 status-bar line),
  and this file. Suggested commit: all of them in one "Native app Phase 2D" commit.
- **Devices:** Andrew's iPhone 16 Pro (UDID `00008140-001E74DE1A7B001C`, paired with this Mac) has the
  **new 2D debug build** installed (bundle id `com.hightopchallenge.spike`, Personal Team signing,
  identity "Apple Development: andrew@hightopchallenge.com"). The iOS Simulator "iPhone 17" (iOS 27)
  and the Android emulator `hightop_api36` also have the 2D build. I left the emulator running
  headless (`-no-window`); stop it with `adb emu kill`.
- **Production data:** with Andrew's mid-session permission ("You can create a test account"), I created
  a throwaway player, account `HtTest2D` (`accounts.id b29e562c-f4e6-47dc-9bf1-0e5519b6b2be`) with
  `users.id 42c7a081-1849-4bfa-8136-d94dfb549826` at the hidden venue `venue-hightop-test`. I used it
  for a signed `tp_sess` session on the phone and the simulator, then **deleted** it with
  `scripts/delete-player-account.cjs --username HtTest2D --confirm` (`usersDeleted: 1`; re-query showed
  0 rows left). It had no `auth.users` row. I cleared its cookies and localStorage on the iPhone
  (verified empty). The simulator's web view may still hold its cookies; harmless, because the user is
  gone. No other data was written. No env vars, migrations, `vercel.json` or `proxy.ts` changes.

### 3. Decisions made (don't re-ask)

- **Diagnosis result: case (b).** On the real iPhone 16 Pro, inside the app, `env(safe-area-inset-top)`
  read **62px** (bottom 34px), which is correct. The shell was fine; the pages ignored it.
- **Shell fix chosen (the plan's step 2), not a per-page web audit.** Why: the sweep found at least six
  clipped surfaces, and they would keep regressing. Measured inside the app with the screen drawn
  under the status bar (top of the first control, in CSS px; the island ends near 59): `/` logo 14,
  venue-home menu and bell 14 (see the section-rule bug below), the venue menu drawer's Close 18,
  `/category-blitz/play` Back 11, the `/pickem` intro title under the clock, `/owner/login` Back 35.
  Fine already: legal pages, `/trivia`, `/account/delete`, `/activity`, `/redeem-prizes`, `/faqs`,
  `/owner/signup` (Back at 64–69). With the fix, the iOS web view is **820px tall instead of 874px**
  and starts below the bar. The inset inside it reads 8px top (the island's leftover) and 34px bottom.
- `ios.contentInset` stays `"never"`. The status-bar plugin moves the web view's frame, so content
  insets aren't involved, and fixed headers and bottom bars behave as on a normal page.
- **The venue header fix also ships to the website**, because it's a real website bug: it also bit
  the installed home-screen PWA, where the inset is real. See §5.
- **Spacer = the header's measured height** (a `ResizeObserver` writes `--venue-hub-header-h` on the
  spacer through a ref, so no inline `style` prop). I preferred it to `sticky`: an unknown ancestor
  with `overflow` would silently break `sticky`.
- **Logos 320 → 256 px (−20%)**, inside the plan's 15–25%. The Partner Dashboard (dark `OwnerShell`
  / `OwnerAppBar`) has **no** big logo; its top-left is the round chevron menu button
  (`tests/owner-menu-contract.test.ts` pins that the dark variant has no `ExplodingLogo`). So the
  partner change is the light `OwnerShell` (`/owner/login` and the other light partner pages).
- **The QR question (Andrew):** written into the plan's Phase 2E item 4 as a rule, not built here.

### 4. What was built

- **`native/capacitor.config.json`:** new `plugins.StatusBar` = `{ overlaysWebView: false, style:
  "DARK", backgroundColor: "#020617" }` and `plugins.SystemBars` = `{ style: "DARK" }`. Capacitor's
  style names describe the *background*: "DARK" means light icons. `SystemBars` is Capacitor 8's
  built-in (core) plugin. Without it, Android follows the phone's light/dark mode and drew dark
  icons on the dark bar.
- **`native/package.json`:** `@capacitor/status-bar` `^8.0.4` (`npx cap sync` regenerated the SPM
  `Package.swift` and the two Android gradle files).
- **Android theme** (`styles.xml`, `AppTheme.NoActionBar`): `android:windowBackground` =
  `@color/htc_canvas` (`#020617`, new `htc_colors.xml`), plus `windowLightStatusBar` /
  `windowLightNavigationBar` false. On Android 15+ (edge-to-edge is enforced), the strip behind the
  bars is the window background, and the status-bar plugin's colour options do nothing there (its
  README says so).
- **`components/venue/VenueHubHeaderBar.tsx`:** the root is now a fragment holding:
  - a `<header ref={headerRef}>`, formerly a `<section>`. Classes: the old ones plus
    `max-[430px]:p-[0.625rem] max-[430px]:pt-[max(env(safe-area-inset-top),0.625rem)]`. These restate
    the phone padding the global section rule used to supply, so the website is pixel-identical
    (measured: header 133px tall before and after), while the safe-area inset now wins where it is
    real;
  - the spacer `<div ref={spacerRef} aria-hidden data-venue-hub-header-spacer
    className="shrink-0 h-[var(--venue-hub-header-h,calc(max(env(safe-area-inset-top),0px)+8rem))]">`.
    The old guess is the fallback until the first measurement.
  - a `useLayoutEffect` that measures the header (`getBoundingClientRect().height`, ceil), sets the
    variable, and keeps it current with a `ResizeObserver`.
- **`components/venue/VenueHubClient.tsx`:** the old fixed spacer line is deleted. The header
  component now owns its spacer.
- **`components/join/JoinFlow.tsx`** `<ExplodingLogo width={256} />` and
  **`components/owner/OwnerShell.tsx`** (light variant) `<ExplodingLogo width={256} variant="slate" />`.
  `ExplodingLogo` still serves `/brand/web/htc-logo-512.webp` above 120px, so no new artwork.
- **`tests/native-safe-area-contract.test.ts`** (new, 7 tests, part of `npm run test`): pins the
  StatusBar/SystemBars config and the plugin dependency, and the Android `htc_canvas` background. It
  scans every `.tsx` in `components/` and `app/` (except `components/venue-screen`) for a
  `<section>`/`<article>` whose opening tag carries `safe-area-inset-top`. It also checks that the
  global rule still exists (so the guard is updated if the rule goes), that the venue header is a
  `<header>` with the phone safe-area class, and that the spacer is measured and the `+8rem)]` spacer
  is gone from `VenueHubClient`.

### 5. Facts and traps discovered

- **The global phone rule** (`app/globals.css`, inside `@media (max-width: 430px)`):
  `.tp-page-main section, .tp-page-main article { padding: 0.625rem !important; }`. Because of the
  `!important`, **no utility class can beat it, not even `!pt-…`**: the rule's specificity (0,1,1) is
  higher than a utility's (0,1,0) when both are important. It also overrides `p-0` on the three venue
  panels (`VenueGamesPanel` / `VenueLeaderboardPanel` / `VenueChallengesPanel` are `<section … p-0>`),
  which therefore get 8.75px padding on phones. That's harmless and left alone; changing the global
  rule would touch every player page. **Don't put safe-area padding on a `<section>`/`<article>`**;
  use `<header>`/`<div>`. The contract test enforces this.
- Root font size is **14px** at ≤430px wide, so `0.625rem` = 8.75px and `8rem` = 112px.
- **iOS SystemBars + StatusBar coexist fine.** Both set "DARK", and the device shows white icons on
  navy.
- **iOS rotation:** the plugin's `handleViewWillTransition` re-runs `resizeWebView()` using the status
  bar frame, which is 0 in iPhone landscape, so landscape Bingo should get the full height.
  **Unverified**: see §6.
- **The geolocation double prompt (WebKit's "play.hightopchallenge.com would like to use your current
  location") shows on every venue/game page in the app.** That's the known Phase 3 item (2A handoff
  §8: switch to `@capacitor/geolocation`), not a 2D regression.
- **Probing the real iPhone without the Safari GUI works.** The spike's debug hook runs JavaScript on
  the device: `xcrun devicectl device process launch --device <UDID> --terminate-existing --console
  --environment-variables '{"SPIKE_STEPS":"[{\"delay\":8,\"js\":\"location.href\"}]"}'
  com.hightopchallenge.spike`, then read the `SPIKE[i] … result=…` lines. It fails with `Locked` if
  the phone is locked. Each launch starts at `/` (the `server.url`). Navigate with
  `location.href=…` in a step. Script-driven `.click()` on the join panel tiles did nothing (they need
  a real tap), so the keyboard theory for R1 was never tested; it turned out not to matter.
- **Building for and installing on the iPhone from the command line works:** `xcodebuild -project
  App.xcodeproj -scheme App -configuration Debug -destination 'id=00008140-001E74DE1A7B001C'
  -derivedDataPath <scratch> -allowProvisioningUpdates build`, then `xcrun devicectl device install
  app --device <UDID> <scratch>/Build/Products/Debug-iphoneos/App.app`.
- **Simulator screenshots:** `xcrun simctl io booted screenshot x.png`. **Simulator.app (the GUI)
  isn't on this Mac**, so the simulator can't be rotated (osascript can't find the app). Landscape
  needs the real phone.
- **A signed player session for checks:** `scripts/print-test-auth-cookies.cjs` mirrors the HMAC. In
  the app's web view I set `tp_user_id`, `tp_venue_id`, `tp_sess` with `document.cookie` (+ the
  `tp:user-id`, `tp:venue-id`, `tp:username`, `tp:account-id` localStorage keys), then navigated to
  `/venue/<id>`. Production has **no** standing test player: create one, then delete it with
  `scripts/delete-player-account.cjs`.
- Repo oddity, not mine: `git ls-files` shows tracked iCloud conflict copies such as
  `tests/lib.envNumber.test 2.ts` and ten more `tests/* 2.ts` files. They predate this work. Mention
  them to Andrew before deleting anything.
- Android `adb` lives at `~/Library/Android/sdk/platform-tools/adb` (not on `PATH`).

### 6. How to build, run and test; what was verified

Web checks, run 2026-10-09 after the change (dev server stopped before the build):
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note for
  `lib/sportsBingo.ts`).
- `npm run test`: **312 files passed / 1 skipped; 3,562 tests passed / 13 skipped / 0 failed.**
- `npm run test:pwa-contract`: 20/20. `npm run test:god-mode-join`: 6 files, 50/50 (JoinFlow was touched).
- `npm run build`: success, 196 static pages, `Proxy (Middleware)` listed.
- **Website before/after** (Playwright WebKit, "iPhone 15 Pro" profile, live `play.` versus local
  `next dev`, same signed test session). Venue header 133px tall in both. First card was at y=128
  (5px *under* the header), now y=149 (16px below it). Sign-in and `/owner/login` logos 320 → 256px.
  Visual: identical apart from those changes.
- **App (shell fix):** iPhone 16 Pro: web view 820px tall; venue menu and bell at y=14 inside the
  web view, i.e. below the status bar; tested against the live site, so the header fix wasn't yet in
  play. Simulator screenshots confirm sign-in, venue home, Category Blitz and legal pages clear the
  bar. Android emulator: dark navy status bar with white icons, layout unchanged otherwise.
- Native rebuild after any change to `native/capacitor.config.json` or its plugins:
  `cd native && npx cap sync`, then the iOS and Android build commands in the 2A handoff §6 (or the
  device build in §5 above).

**Unverified (Andrew's device check, after "commit and push"):**
1. **Bingo landscape** (`docs/bingo-fullscreen-pwa-device-checklist.md`): the board fills the
   screen sideways, and nothing is cut off at the notch side or the home bar.
2. Sign-in, the venue home, a game (Category Blitz), a legal page, the Partner Dashboard and
   `/owner/login`: every Back, menu and bell button is fully visible and tappable, and the status
   bar is dark with white text.
3. The venue home has no gap between the Games / Leaderboard / Rewards bar and the first card.
4. Typing a PIN, then closing the keyboard, doesn't leave the page shifted up.
5. Mobile Safari (not the app): the venue home and both sign-in pages look the same or better.

### 7. Open questions for Andrew

1. Commit and push Phase 2D? (One commit; file list in §2.)
2. Still open from earlier phases: R3 (Rick is God Mode; keep that?), and the 2A per-item device
   checklist (A1–A14).

### 8. Recommended first steps for 2E (Opus 5.5, high, per the plan)

1. If Andrew hasn't decided, ask about committing 2D first, so 2E starts from a clean tree.
2. Build `lib/nativeApp.ts` (`isNativeApp()`: the `HightopChallengeApp/` user-agent token or
   `window.Capacitor`; the only reader; with a contract test) and `homeHref()` beside `marketingHref`
   in `lib/domainSplit.ts`. Switch the R5 call sites. JoinFlow is one, so run
   `npm run test:god-mode-join`, and route any new reset through `discardVenueList()` (2C rule).
3. The front-door choice (plan 2E item 4): build it as a pure function so it can be unit-tested,
   including **Andrew's QR rule** (link/QR launch → player sign-in, whatever the remembered side).
   Before Universal Links exist, the app can't yet tell a QR launch from an icon launch, so the
   function takes "launched from a link" as an input. Phase 3 wires it from `@capacitor/app`.
4. R6: reproduce Back from a legal page on the phone with the `SPIKE_STEPS` probe (§5) and fix both
   ends as the plan says (`native/www/offline.html` "Try again" should reload the failed URL; ignore
   cancelled navigations, iOS `NSURLErrorCancelled` −999).
5. Note for 2E's link-out work: `/owner/login` now draws below the status bar too, so its Back button
   is tappable in the app.
