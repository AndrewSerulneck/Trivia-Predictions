# Native App Store Plan — Phase 2 Part A Handoff (native shell spike, free provisioning + emulator)

Plan: `docs/native-app-store-plan.md` (Phase 2 now has Part A / Part B). Part A was worked on
2026-10-08 by Claude Opus 5.5 (xhigh). **Status: the automated half is done; Andrew's device half is
waiting.** The checklist Andrew fills in is `docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`.
Part A is finished when that checklist has results and this file's §9 is filled in.

---

## Summary for Andrew (plain English)

**What changed.**
- The plan now splits Phase 2 into **Part A** (now) and **Part B** (once Apple approves the paid
  account: Face ID passkeys and the 7-day sign-in test). It also records your decision to **test
  Android on the free emulator instead of buying a phone**.
- A real test app now exists for **iPhone and Android**, in a new `native/` folder. It opens the live
  site inside a phone app. It doesn't change the website: the website's build, tests and Vercel
  deploys ignore the folder.
- I ran most of the risky checks myself in Apple's iPhone Simulator and the Android emulator. The
  findings, in plain words:
  1. **Partner pages work inside the app** on both phones. Android needed a small fix so app
     features also work on the partner pages (done in the test app).
  2. **Stripe payment pages open in Safari/Chrome, not in the app**, on both phones, as we wanted.
     `/admin` still opens *inside* the app, so Phase 3 adds a rule for it.
  3. **The location question:** Android asks once (good). **iPhone asks twice** (the app, then a
     second "play.hightopchallenge.com would like to use your location" box). I proved the fix: the
     app's own location feature gives a single prompt. Phase 3 switches to it.
  4. **Staying signed in:** on Android, if a player signed in and swiped the app away within a few
     seconds, they came back **signed out**. I added a fix to the test app and proved it works. The
     iPhone didn't have this problem.
  5. **Android's back button** used to close the whole app on the first press. With a standard add-on
     it now steps back one page at a time.
  6. **No internet:** Android shows our "No connection — Try again" screen.
- Nothing about the live website, the database or any account was changed. No production data was
  written.

**Is it live?** No, and nothing here needs to be. It's a test app on your Mac. The files are **not
committed yet**; say the word and they'll be committed.

**What needs you.**
1. Run the checklist `docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md` (about 45 minutes):
   put the test app on your iPhone through Xcode (step-by-step there), then sign in and try the
   things only a real sign-in or a real phone can show (Bingo sideways, live updates after 5
   minutes, partner sign-in, the delete-account screen).
2. Tell me when the results are in.

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md`, `docs/native-app-store-plan.md` (§2, §5,
Phase 2 incl. the Part A / Part B split), this file and the device checklist.

### 1. Goal and scope

**Part A** = prove the risky parts that don't need the paid Apple account: plan Phase 2 items 1
(kill-and-relaunch half), 2, 3, 4, 6, 7, 8, plus the delete-account screen and legal pages in the app.
**Remaining in Part A:** Andrew's device results (checklist A1–A14), then fill in §9 below. If a
result is a Fail, investigate and record the Phase 3 approach.

**Part B** (separate handoff `…_PHASE_2B_HANDOFF.md`, after the paid Apple Developer account is
approved): item 5 (passkeys, iOS and Android) and item 1's 7-day half. Out of scope for both parts:
production-shell polish (icons, splash, status-bar colour, min-version gate, `lib/nativeApp.ts`,
link-out rules in web code). That is Phase 3, which consumes §8 below.

### 2. Starting state

- Branch `main`, HEAD `ea4ca4d` at the start; **nothing from Part A is committed or pushed** (Andrew
  hasn't asked). Uncommitted: `docs/native-app-store-plan.md` (Part A/B split, emulator decision),
  `tsconfig.json` (`exclude` += `native`), `eslint.config.mjs` (ignores `native/**`), new
  `.vercelignore` (`/native` — anchored; an unanchored `native` also dropped `components/native/` and broke the 2026-10-09 deploy), new `native/`, this file and the device checklist.
- No production data was written. No env vars, no migrations, no `vercel.json` change, no deploy.
- Emulator state: an AVD **`hightop_api36`** (Pixel 8, `system-images;android-36;google_apis_playstore;arm64-v8a`,
  WebView 133) was created and left running with the debug app installed. SDK platform 36 and
  build-tools 36.0.0 were installed. On that emulator the shell has `mock_location` allowed, and test
  location providers (gps/network/fused) fix it at 40.7128,-74.0060 (NYC). Those settings are
  emulator-only and harmless; they reset if the AVD is wiped. Stray test cookies (`spike_*`) on
  `play.` exist only in the emulator and simulator.
- iOS Simulator "iPhone 17" (iOS 27.0) has the debug app installed, with location permission granted
  and its location set to NYC.

### 3. Decisions already made (don't re-ask)

- Andrew, 2026-10-08: **split Phase 2 into Part A / Part B** as described in the plan.
- Andrew, 2026-10-08: **Android testing uses the emulator; no phone is bought.** Plan §2 item 4 and
  Phase 0 item 8 were updated. The emulator counts as a pass; its blind spots (real GPS, camera,
  low-end performance) are noted in the plan.
- Mine: **the iOS spike's bundle id is `com.hightopchallenge.spike`, not `com.hightopchallenge.app`.**
  A free Personal Team that builds a bundle id registers it to itself, and that could block the
  Organization team from claiming the permanent id later (plan §2 item 11: confirm before the first
  upload). Android's `applicationId` is `com.hightopchallenge.app` (nothing is registered until a
  Play upload). Phase 3 sets the iOS id to `com.hightopchallenge.app` under the paid team.
- Mine: Capacitor **8.5.3** (current major at start; `npm view @capacitor/core version`),
  `@capacitor/app` 8.1.2, `@capacitor/geolocation` 8.2.3. iOS uses **Swift Package Manager**
  (Capacitor 8 default), so no CocoaPods are needed (and none are installed).

### 4. Files created or changed

- `native/package.json`, `native/package-lock.json`, `native/.gitignore` (`node_modules/`).
- `native/capacitor.config.json`: `appId com.hightopchallenge.app`, `server.url
  https://play.hightopchallenge.com`, `allowNavigation [play.hightopchallenge.com,
  hightopchallenge.com]`, `server.errorPath offline.html`, per-platform `appendUserAgent
  "HightopChallengeApp/0.1.0 (ios|android)"`, iOS `contentInset: never`,
  `webContentsDebuggingEnabled: true` on both. **Phase 3: turn debugging off for release builds.**
- `native/www/index.html` (redirects to `play.`; not used while `server.url` is set) and
  `native/www/offline.html` (the "No connection — Try again" page; plain inline CSS, since it's a
  bundled static file outside the Next app).
- `native/ios/…` (generated by `npx cap add ios`), then edited:
  - `App.xcodeproj/project.pbxproj`: `PRODUCT_BUNDLE_IDENTIFIER = com.hightopchallenge.spike` (both
    configs).
  - `App/Info.plist`: `NSLocationWhenInUseUsageDescription` (friendly copy; Phase 3 can polish).
  - `App/AppDelegate.swift`: appended **`SpikeViewController: CAPBridgeViewController`**, a
    `#if DEBUG` automation hook (reads env `SPIKE_STEPS`, a JSON list of `{delay, js}`, evaluates
    each in the web view and `NSLog`s `SPIKE[i] url=… result=…`). **Spike-only; delete in Phase 3.**
  - `App/SceneDelegate.swift`: `rootViewController = SpikeViewController()`. **Trap:** Capacitor 8's
    generated SceneDelegate builds the root VC in code, so `Main.storyboard`'s `customClass` is
    ignored (left as `CAPBridgeViewController`). Subclass in SceneDelegate.
- `native/android/…` (generated by `npx cap add android`), then edited:
  - `app/src/main/AndroidManifest.xml`: `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`.
  - `app/build.gradle`: `implementation "androidx.webkit:webkit:$androidxWebkitVersion"`.
  - `app/src/main/java/com/hightopchallenge/app/MainActivity.java`: (a) **`injectBridgeOnApex()`**
    uses reflection on `Bridge.getJSInjector()` → `getScriptString()` and
    `WebViewCompat.addDocumentStartJavaScript(..., {"https://hightopchallenge.com"})`; (b)
    **`onPause()` → `CookieManager.getInstance().flush()`**.
  - `build.gradle` (root): `allprojects { layout.buildDirectory = ~/Library/Caches/hightop-native/android/<project> }`.
    See the iCloud trap in §5. The debug APK is at
    `~/Library/Caches/hightop-native/android/app/outputs/apk/debug/app-debug.apk`.
- Repo root: `.vercelignore` (`/native` — anchored; an unanchored `native` also dropped `components/native/` and broke the 2026-10-09 deploy), `tsconfig.json`, `eslint.config.mjs`.
- Docs: `docs/native-app-store-plan.md` (status line, §1, §2 item 4, Phase 0 item 8, Phase 2 split,
  §6), this file, `docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`, and one `CLAUDE.md`
  bullet.

### 5. Facts and traps discovered

- **`~/Documents` is synced by iCloud Drive** (`com.apple.CloudDocs.iCloudDriveFileProvider` on the
  folder). iCloud creates `name 2.ext` / `dir 2` conflict copies inside busy build folders. Gradle then
  fails (`config 2.xml: ' ' is not a valid file-based resource name`, or dexing errors from
  `MainActivity 2.class`). The fix is the root `build.gradle` redirect above. Xcode builds here used
  `-derivedDataPath` in a scratch dir; Xcode's default DerivedData (`~/Library/Developer/Xcode/DerivedData`)
  is outside iCloud anyway. If a `* 2*` file ever appears in `native/`, delete it; never commit one.
  Check with `find native -name "* [0-9]*" -not -path "*/node_modules/*"`.
- **Never `rm -rf …/build*`** inside `native/node_modules/@capacitor/*`. The glob also matches
  `build.gradle`. (This happened once; fixed by `rm -rf node_modules/@capacitor/{android,app} && npm install`.)
- **JDK:** Gradle 8.14.3 (Capacitor 8 wrapper) can't run on Java 25. Android Studio's bundled JBR in
  this install is Java 25 (`Unsupported class file major version 69`). Build with
  `JAVA_HOME=/opt/homebrew/opt/openjdk@21`. Inside Android Studio, set **Settings → Build, Execution,
  Deployment → Build Tools → Gradle → Gradle JDK** to that JDK 21 if a sync fails.
- `ANDROID_HOME` isn't set in the shell; the SDK is at `~/Library/Android/sdk`.
- **Android bridge only on `server.url`'s origin.** Capacitor 8 `Bridge.loadWebView()` calls
  `addDocumentStartJavaScript` with only the `appUrl` origin, although its `androidBridge` message
  listener accepts every `allowNavigation` origin. So on `https://hightopchallenge.com/owner/*`,
  `window.Capacitor` was **undefined** until the MainActivity fix. iOS injects its WKUserScript into
  every page, so both hosts were fine there with no change.
- **Chromium's history intervention:** navigations made by script without a user gesture are
  skipped by `WebView.canGoBack()`. My CDP-scripted navigations first made Back look broken
  (`canGoBack=false` with 3 entries). Real taps, or CDP `Runtime.evaluate` with `userGesture: true`,
  behave normally. Use the latter when automating Back tests.
- **Android `CookieManager` writes lazily.** Measured: a cookie set and then the app killed
  immediately → lost; after 35 s → kept; Home then kill 2 s later → **lost without the flush, kept
  with `onPause` flush** (both a JS cookie and an HttpOnly cookie set via CDP). localStorage was lost
  only on an immediate kill. iOS (simulator): a cookie and localStorage set ~1–2 s before kill → kept;
  backgrounded then killed → kept.
- **iOS geolocation double prompt:** even with the app's location permission granted
  (`simctl privacy grant`), WKWebView's `navigator.geolocation` shows a second WebKit dialog
  "“play.hightopchallenge.com” would like to use your current location…". Native
  `Capacitor.nativePromise("Geolocation","getCurrentPosition",…)` returned the position with no
  dialog. Not yet known: whether the WebKit dialog repeats on every launch (checklist A4 asks).
  Android: one system dialog, then `navigator.geolocation` worked (no second prompt).
- **Android passkeys:** `window.PublicKeyCredential` is `undefined` in the Android WebView, so the
  join screen hides "Face ID / Touch ID" (`browserSupportsWebAuthn()` in
  `components/join/JoinFlow.tsx`). That's expected until Part B (androidx.webkit web-authentication
  support + `assetlinks.json`). On iOS, `PublicKeyCredential` is a function and the button shows.
  Whether it *works* without Associated Domains is Part B.
- **The iOS UA reports "iPhone OS 18_7"** on an iOS 27 simulator (WebKit's frozen UA). Never parse
  the OS version from the UA; use the `HightopChallengeApp/<ver> (ios|android)` token.
- The first launch on a freshly booted simulator showed a white page for 40 s+. The second launch was
  instant. That was probably simulator warm-up, but A12 checks a real cold start on mobile data.
- Android status bar is **white** over the dark site (the web view starts below the bar, at
  `screenY 132`). iOS draws the site under a transparent status bar (`contentInset: never` +
  `viewport-fit=cover`), and the site's safe-area padding held up on the join and `/delete-account`
  pages. Phase 3: status-bar colour/style on both.
- Tooling: Playwright `connectOverCDP` **can't** attach to an Android WebView ("Browser context
  management is not supported"). Use raw CDP over WebSocket. `xcrun simctl launch --console-pty`
  shows the app's stdout/NSLog. Killing that process also terminates the app, which is handy as a
  "kill". Swift `print` from the hook didn't show; `NSLog` does.

### 6. How to build, run and test, and the results

Setup (once): `cd native && npm install`.
- After changing `capacitor.config.json` or plugins: `cd native && npx cap sync`.
- **iOS Simulator:** `cd native/ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath <scratch>/ios-dd build`
  then `xcrun simctl install "iPhone 17" <scratch>/ios-dd/Build/Products/Debug-iphonesimulator/App.app`.
  Probe: `SIMCTL_CHILD_SPIKE_STEPS='[{"delay":9,"js":"location.href"}]' xcrun simctl launch --console-pty "iPhone 17" com.hightopchallenge.spike`
  and read the `SPIKE[i]` lines.
- **Android:** `cd native/android && ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`,
  start the emulator with `~/Library/Android/sdk/emulator/emulator -avd hightop_api36 &`, install with
  `adb install -r ~/Library/Caches/hightop-native/android/app/outputs/apk/debug/app-debug.apk`. Probe:
  `adb forward tcp:9333 localabstract:$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | tail -1)`,
  then CDP `Runtime.evaluate` against `http://localhost:9333/json`'s page (the throwaway client was a
  ~40-line Node script; rewrite it, since it lived in the session scratchpad).
  Fake GPS: `adb shell appops set com.android.shell android:mock_location allow`, then
  `adb shell cmd location providers add-test-provider fused` / `set-test-provider-enabled fused true` /
  `set-test-provider-location fused --location LAT,LNG --accuracy 10`. Push a fix *while* a request
  is pending. `adb emu geo fix` didn't reach the providers on this image.
- Website checks after the root config edits: `npx tsc --noEmit` clean; `npm run lint` clean;
  `npm run test` **310 files passed / 1 skipped; 3,539 tests passed / 13 skipped / 0 failed**.
  `npm run build` wasn't re-run (only `tsconfig` `exclude` and eslint `ignores` changed;
  `.vercelignore` keeps `native/` out of Vercel uploads).

**Results so far.** Sim = iPhone 17 Simulator, iOS 27. Emu = hightop_api36, Android 16, WebView 133.

| Plan item | iOS (Sim) | Android (Emu) |
|---|---|---|
| UA token | ✅ `… HightopChallengeApp/0.1.0 (ios)` | ✅ `… HightopChallengeApp/0.1.0 (android)` |
| 1 — storage survives kill (synthetic cookies; a real sign-in is A2/A3) | ✅ kept, even when killed ~1–2 s after the write | ❌ → ✅ lost on a quick kill; **fixed by `onPause` flush** (immediate force-stop within ~1 s still loses it, which is acceptable) |
| 2 — geolocation prompts | ❌ **two prompts** (app + WebKit); ✅ the native plugin gives one | ✅ one system prompt; web geolocation works |
| 3 — partner host `hightopchallenge.com/owner/login` stays in-app | ✅, bridge present | ✅ in-app; bridge **missing** → ✅ after the `injectBridgeOnApex` fix (native round trip `WebView.getServerBasePath` OK) |
| 4 — Stripe (`checkout.stripe.com`) → system browser | ✅ Safari; app stays put | ✅ Chrome; app stays put |
| 4 — `/admin` | ⚠ stays **in-app** (allowed host) | ⚠ stays **in-app** |
| 4 — `window.open`/`target=_blank` external | ✅ Safari | ✅ Chrome |
| 4 — `window.open` to **our own** host | → Safari | → replaces the page **in-app** (inconsistent; Phase 3 rule) |
| 6 — Bingo landscape / safe area | join + `/delete-account` respect the status bar; Bingo needs sign-in → **A7** | Bingo needs sign-in → **A7**; status bar is white |
| 7 — Android back | n/a | ❌ closes the app on the first press → ✅ with `@capacitor/app`: steps back through history across both hosts; at the first page it does nothing |
| 8 — realtime after 5 min background | needs sign-in → **A8** | needs sign-in → **A8** |
| Offline launch | not tested in Sim → **A13** | ✅ `offline.html` "No connection — Try again" |
| Legal / delete-account pages in app | ✅ `/delete-account` renders correctly | signed-in screen → **A10/A11** |

### 7. Open questions for Andrew

1. Device checklist results (A1–A14).
2. Commit the Part A files now? (Recommended: yes, so Part B and Phase 3 start from a clean tree.)

### 8. Approach Phase 3 should take (from Part A so far)

> **Phase 3 is built (2026-10-09)** — see `docs/native-app-store-plan_PHASE_3_HANDOFF.md`. Geolocation,
> back button, link-outs, spike removal, debugging flag and cold-start items below are done; the Android
> apex injection keeps its reflection, hardened with a version pin. The iOS bundle id waits on the paid team.

- **Geolocation:** in the app, `lib/geolocation.ts` uses `@capacitor/geolocation` (lazy-loaded behind
  `isNativeApp()`) instead of `navigator.geolocation`. This avoids the iOS double prompt. Keep God
  Mode's server-authoritative path untouched and run `npm run test:god-mode-join`.
- **Android bridge on the apex:** keep the effect of `injectBridgeOnApex`, but replace the reflection
  (it breaks silently if Capacitor renames the private method). Options: rebuild the script without
  reflection (check what Capacitor exposes publicly at that version), or upstream a fix. At minimum, add a startup log/assert and
  a device-checklist item ("`window.Capacitor` on `/owner/*`").
- **Cookie flush on pause** (Android): keep it.
- **Back button:** keep `@capacitor/app`. Register a JS `backButton` listener (when `isNativeApp()`)
  that calls into the page's `useExitNavigation` / history and, on the first page, calls
  `App.minimizeApp()` (don't kill the app).
- **Link-outs:** ~~add a native or web rule~~ 2E built the native mechanism
  (`plugins.HightopShell.openInBrowser`); add `/admin` and `/owner/signup|register`, plus the Stripe
  billing actions, to it. Normalise own-host `_blank` (open in-app on both, or system browser on both).
- **Status bar:** ~~set its colour and style on both~~ done in Phase 2D (dark navy, light icons; iOS web view below the bar). Turn `webContentsDebuggingEnabled` off in
  release. Delete `SpikeViewController` and its SceneDelegate line. Set the iOS bundle id to
  `com.hightopchallenge.app` under the paid team.
- **Cold start:** a native splash that stays up until the first page load, and the offline page for
  failures (`server.errorPath` already works on Android).

### 9. Andrew's device results

**First device report (Andrew, 2026-10-08)** — free-form, not yet per checklist item A1–A14. Copied
here from the plan ("Andrew's first device report") by the Phase 2C agent, as the plan asks. The
per-item checklist results are still to come.

| # | What Andrew saw | Cause | Fixed in |
|---|---|---|---|
| R1 | iPhone: content sits too high — sign-in logo, venue-home menu/alerts buttons and Back buttons are under the status bar; Back can't be tapped. | `contentInset: "never"` + `viewport-fit=cover`; safe-area padding is inconsistent and may read as 0 on the device. Undiagnosed on the phone. | **2D — fixed 2026-10-09** (`…_PHASE_2D_HANDOFF.md`): the inset read correctly (62px on the iPhone 16 Pro); the iOS web view now starts below the status bar (`@capacitor/status-bar`, `overlaysWebView: false`) |
| R2 | Venue home: big gap between the game buttons and the Games / Leaderboard / Rewards bar. | Fixed `8rem` spacer in `components/venue/VenueHubClient.tsx` instead of the header's measured height. | **2D — fixed 2026-10-09**: the spacer uses the measured header height |
| R3 | Signed in as Rick, every venue shows. | Working as designed: `Rick` is one of three God Mode accounts (`Andrew`, `marc`, `Rick`). Andrew to decide whether Rick stays God Mode. | none |
| R4 | A new player briefly sees every venue behind the "share your location" question. | Real website bug in `components/join/JoinFlow.tsx`: sign-out / back reset `venueListBuiltRef` but not the list, so the previous God Mode list stayed on screen while the new player's location loaded; the deep-link path also filled the list with every venue. | **2C — fixed 2026-10-08** (`…_PHASE_2C_HANDOFF.md`) |
| R5 | `/info` shouldn't be part of the app. | Design change: every "home" control points at `/info`. | **2E — built 2026-10-09** (`…_PHASE_2E_HANDOFF.md`): `homeHref()`, app front door, marketing pages open in the browser |
| R6 | Back from a legal page shows a false "No connection"; "Try again" goes to the sign-in. | Confirmed in the simulator: the Back fallback's second navigation cancels the first (NSURLErrorCancelled −999) and Capacitor showed `server.errorPath` for it. | **2E — fixed 2026-10-09**: native wrappers show the offline page only for network errors; in-app Back is one navigation; "Try again" reloads the failed page |
| R7 | The app still works with Wi-Fi off. | Expected (mobile data). Use Airplane Mode to test the offline screen. | 2E: ✅ Android emulator (cold launch and mid-use); iPhone Airplane Mode is Andrew's check |

### 10. Recommended next steps

1. When Andrew reports, copy the results into §9, investigate any Fail (the debug hooks above help),
   update §8, and mark Part A done in the plan's status line.
2. Part B, once the paid Apple account is approved: Associated Domains
   `webcredentials:hightopchallenge.com`; serve `/.well-known/apple-app-site-association` and
   `/.well-known/assetlinks.json` (a narrow `proxy.ts` allow on both hosts; plan Phase 3 bullet, with
   tests in `tests/proxy.behavior.test.ts`); Android `WebSettingsCompat.setWebAuthenticationSupport`;
   then try the existing web passkey flow on both. Model: Opus 5.5, xhigh (plan).
