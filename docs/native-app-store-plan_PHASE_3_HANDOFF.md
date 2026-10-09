# Native App Store Plan — Phase 3 Handoff (production shell)

Plan: `docs/native-app-store-plan.md` → "Phase 3". Worked 2026-10-09 by Claude Opus 5.5 (high).
**Status: built and verified on the Android emulator, the iOS Simulator, Andrew's iPhone 16 Pro (install +
probe) and a local production build. NOT committed, NOT pushed, NOT deployed** — Andrew asked to execute
Phase 3 but did not answer the 2D/2E commit question, so Phases 2D, 2E and 3 are all uncommitted in the
same working tree (file split in §2). Two pieces wait on Phase 0's paid accounts: Universal Links / App
Links going live (§3 "Universal Links") and the permanent iOS bundle id.

---

## Summary for Andrew (plain English)

**What changed.**
- **The app has its own icon and launch screen** — the Hightop logo on dark navy, on both phones —
  instead of the blank Capacitor defaults. No white flash while it opens.
- **iPhone: one location question, not two.** The app now reads the phone's location itself, so the
  second "play.hightopchallenge.com would like to use your location" box is gone. If location is turned
  off, the app tells you how to turn it on in the Settings app.
- **Android's Back button now does what the on-screen Back does.** It closes an open sheet first, steps
  back inside a sign-up flow, then goes back a page. On the very first screen it puts the app in the
  background instead of doing nothing.
- **Partner sign-up, subscribing and `/admin` never happen inside the app** (Apple's payment rules). Those
  pages open in Safari/Chrome, or the app shows "this is on our website — Open in browser". The in-app
  **Billing** page still shows the plan, status and invoices, with one **"Manage billing on the web"**
  button and no Subscribe, Update card, Resume or Cancel buttons.
- **A "Please update" screen** exists for the day an old app version can't work with the live site.
  It's off until we set a minimum version in Vercel.
- **Links and the join QR can open the app** (Universal Links / App Links). The app and the site are
  ready for it, but it only switches on once the paid Apple and Google accounts exist (Phase 0) and two
  settings are added in Vercel.
- **The "Add to Home Screen" prompt can never show inside the app.**
- The app is now **version 1.0.0** everywhere, and release builds can't be inspected with developer tools.

**Is it live?**
- **App:** the new test build is on your iPhone, the iPhone simulator and the Android emulator.
- **Website:** none of 2D, 2E or 3 is live until you say "commit and push". Vercel then deploys it.
  Website visitors see no difference, except that the sign-up, subscribe and admin pages are now
  rendered per visit instead of being pre-built. That costs a few function runs a day at most.

**What needs you.**
1. **Commit and push?** Phases 2D, 2E and 3 are all waiting. I recommend three commits in order (2D, 2E,
   3). One combined commit is also fine.
2. After the deploy, the device checklist **`docs/native-app-device-checklist.md`** (~20 minutes), plus the
   2D/2E checks it points to.
3. Still open from 2E: if a partner also plays as a guest on the same phone, should the app switch back to
   opening on the player side? Today the partner shortcut stays until they sign out.
   **Answered 2026-10-09 (plan §2 item 12): moot — the app is player-only, partners never sign in inside
   it, and Phase 3B.1 removed the partner shortcut.**
4. When the paid accounts arrive (Phase 0): the steps in §7 below (bundle id, entitlements, two Vercel
   settings).

---

## For the next agent

You have none of this conversation. Read first: `CLAUDE.md` (the "Native app" bullets, including the new
Phase 3 one), `docs/native-app-store-plan.md` (§2 decisions, §5 hard rules, Phase 3 and its status note,
Phases 4a–5), the 2A handoff §5–§6 (build commands, iCloud/JDK traps), the 2E handoff §3–§6 (front door,
offline page, link-outs), and this file.

### 1. Next phase: goal and scope

Phases 4a (share + haptics), 4b (QR scanner), 4c (passkeys) and 5 (push) can run in any order now. Part B
(passkeys on device + the 7-day login test) needs the paid Apple account. Recommended order:

1. **Close out:** Andrew's commit/push, then his device checklist. Fix anything he reports first.
2. **Phase 4a** (Sonnet 5.5, medium) is the smallest, and it is the first real user of
   `hasNativeCapability()`. Install `@capacitor/share` and `@capacitor/haptics` in `native/` **only**
   (never in the root `package.json` — a contract test forbids `@capacitor/*` imports in the website), run
   `npx cap sync`, add `"Share" | "Haptics"` to `NativeCapability` in `lib/nativeApp.ts`, and call them
   with `callNative()`. A shell without the plugin must fall back to the web behaviour.

Out of scope for whoever comes next unless Andrew asks: store listings (Phase 6), `/info` badges (Phase 7).

### 2. Starting state

- Branch `main`, HEAD `858660c` (2C), pushed. **2D, 2E and 3 are uncommitted.** Never `git checkout --
  <file>` to undo an edit — these files hold three phases of uncommitted work.
- `.vscode/settings.json` is untracked and is not ours; leave it out of commits.
- **Files touched only by Phase 3:**
  - web, new: `lib/nativeLinkOut.ts`, `lib/nativeAppConfig.ts`, `lib/nativeAppLinks.ts`,
    `components/navigation/nativeBackButton.ts`, `components/native/{NativeAppRuntime,NativeAppRuntimeImpl,AppUpdateRequired,WebOnlyInApp,WebOnlyNotice,ManageBillingOnWeb}.tsx`,
    `app/api/app/config/route.ts`, `app/.well-known/apple-app-site-association/route.ts`,
    `app/.well-known/assetlinks.json/route.ts`, `app/admin/layout.tsx`, `app/owner/signup/layout.tsx`,
    `app/owner/register/layout.tsx`, `app/owner/billing/setup/layout.tsx`;
  - web, changed: `lib/geolocation.ts`, `lib/pwa.ts`, `components/bingo/SportsBingoHome.tsx`,
    `components/navigation/WizardFooter.tsx`, `components/owner/sheet/useModalOverlay.ts`,
    `app/layout.tsx`, `app/owner/billing/page.tsx`, `proxy.ts`, `.env.example`;
  - tests: `tests/lib.native-app-phase3.test.ts` (new), `tests/proxy.behavior.test.ts`,
    `tests/pwa-contract.test.ts`;
  - native, new: `native/android/app/src/main/java/com/hightopchallenge/app/HightopShellPlugin.java`,
    `native/ios/App/App/App.entitlements` (not wired, see §7), `native/scripts/generate-app-icons.cjs`;
  - native, changed: `native/ios/App/App/Info.plist`, `native/ios/App/App/AppDelegate.swift` (spike
    removed), `native/android/app/src/main/AndroidManifest.xml`, `native/android/app/build.gradle`
    (versionName), `native/android/app/src/main/res/values/ic_launcher_background.xml`, every
    `ic_launcher*.png` under `res/mipmap-*`, every `splash.png` under `res/drawable*`, and
    `native/ios/App/App/Assets.xcassets/{AppIcon.appiconset,Splash.imageset}/*.png`;
  - docs: this file, `docs/native-app-device-checklist.md` (new).
- **Files shared with 2D/2E** (Phase 3 edited files those phases created or changed):
  `lib/nativeApp.ts` (2E new; 3 added helpers), `tests/native-app-contract.test.ts` (2E new; 3 extended),
  `components/navigation/ExitBackButton.tsx` (2E `home`; 3 Back registration),
  `lib/domainSplit.ts` (2E `homeHref`; 3 `.well-known` neutral), `components/join/JoinFlow.tsx`
  (2D logo, 2E partner link, 3 `queryLocationPermission` + device-settings steps in the app),
  `native/capacitor.config.json` (2D plugins, 2E HightopShell; 3 link-out paths, version, no
  debugging flag, `backgroundColor`), `native/package.json` (2D status-bar; 3 version 1.0.0),
  `native/package-lock.json` (2D; 3 only the version field), `native/ios/App/App/HightopBridgeViewController.swift`
  (2E new; 3 plugin, links, probe), `native/ios/App/App/SceneDelegate.swift` (2E comment; 3 root VC),
  `native/ios/App/App.xcodeproj/project.pbxproj` (2E file ref; 3 MARKETING_VERSION),
  `native/android/app/src/main/java/com/hightopchallenge/app/MainActivity.java` (2E client; 3 plugin,
  links, hardened injection), `native/android/app/src/main/res/values/styles.xml` (2D bars; 3 splash),
  `CLAUDE.md`, `docs/native-app-store-plan.md`, `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`.
- To commit the phases separately, use the 2C technique (build an earlier-phase copy of each shared file,
  stage it with `git update-index --cacheinfo`, never touching the working tree). Splitting three phases
  across ~17 shared files is laborious; one combined "Native app Phases 2D + 2E + 3" commit, or 2D alone
  then "2E + 3", are reasonable alternatives. Ask Andrew.
- **Devices** (all have the Phase 3 debug build, production config):
  - Andrew's iPhone 16 Pro, UDID `00008140-001E74DE1A7B001C`, bundle id `com.hightopchallenge.spike`,
    installed 2026-10-09 ~06:40 (free provisioning: expires after 7 days);
  - the "iPhone 17" simulator (booted);
  - the emulator `hightop_api36` (running; Chrome sits on its first-run screen from the link-out tests;
    `adb reverse` was removed).
- **Production data:** none written. No migrations, no `vercel.json` change, no Vercel env vars added,
  no deploy. The new env vars are documented in `.env.example` only.

### 3. Decisions made (don't re-ask)

- **No `@capacitor/*` package in the website.** The shell injects `window.Capacitor` and one
  `Capacitor.Plugins.<Name>` per native plugin into every page (both hosts; the Android apex via
  `injectBridgeOnApex`). `lib/nativeApp.ts` talks to that directly: `hasNativeCapability()` =
  `Capacitor.isPluginAvailable()`, `callNative()` = `nativePromise()`, `addNativeListener()` =
  `Capacitor.addListener()`. Website visitors download nothing extra. Contract-tested.
- **`NativeAppRuntime`** (root layout) is a few lines that `import()` the real runtime only when
  `isNativeApp()`. Verified: website page loads never fetch the runtime chunk. The runtime does the
  Android Back listener and the minimum-version gate.
- **Android Back = "what the on-screen control would do"**, never new navigation logic
  (`components/navigation/nativeBackButton.ts`). Ranks: `overlay` (useModalOverlay's `requestClose`, the
  same path as Escape, so DiscardGuard still asks) > `step` (WizardFooter's `onBack`) > `exit`
  (ExitBackButton's `handleExit`). Same rank → most recently registered. Nothing registered → history,
  and at the first page `App.minimizeApp` (background, not quit). Registering any `backButton` listener
  turns off the plugin's default `webView.goBack()`.
- **Geolocation: native on iOS only.** `usesNativeLocation()` = `nativePlatform() === "ios" &&
  hasNativeCapability("Geolocation")`. Android keeps `navigator.geolocation` (2A proved it asks once).
  Plugin error codes map to the browser's 1/2/3 (`nativeLocationErrorCode`), so every caller's error
  copy works unchanged. `queryLocationPermission()` asks the app on iOS (WKWebView's own permission
  answer is about WebKit's prompt, not the app's). In the app, `LocationReEnableSteps` shows the
  device-Settings steps. `getBestCurrentLocation` in the app is one high-accuracy native fix, then a
  low-accuracy one (no watch sampling). God Mode's server path is untouched; `test:god-mode-join` 50/50.
- **Link-outs: one list, two readers.** `lib/nativeLinkOut.ts` = `native/capacitor.config.json`
  `openInBrowser.paths` (contract test). The shell catches full page loads; a Next router (soft)
  navigation never reaches the shell, so each web-only page's **layout** renders `WebOnlyInApp`, a server
  component that checks the request's User-Agent and renders `WebOnlyNotice` instead of the page in the
  app. No flash, and the page's own code (Stripe checkout, signup wizard, admin fetches) never runs in
  the app. Web-only = `/owner/signup`, `/owner/register`, `/owner/billing/setup`, `/admin`.
  `/owner/login`, `/owner/dashboard` and `/owner/billing` stay in the app.
- **Billing in the app** shows status and invoices; every action is `ManageBillingOnWeb`, which opens
  `https://hightopchallenge.com/owner/billing` in the browser via our plugin (fallback: a full load of
  `/owner/billing/setup`, which is on the link-out list and forwards a subscribed partner to Billing).
- **Our own native plugin, `HightopShell`**, method `openInBrowser({ url })`, https only. iOS: in
  `HightopBridgeViewController.swift`, registered with `bridge.registerPluginInstance` in
  `capacitorDidLoad`. Android: `HightopShellPlugin.java`, registered with `registerPlugin(...)` **before**
  `super.onCreate`. Why a plugin, not more config paths: the web can then send any page to the browser
  without a store release (old app versions stay in use). Its config block `plugins.HightopShell` was
  already the shell's settings (2E); same name on purpose.
- **Universal Links / App Links: the shell loads the link itself.** Capacitor only reports a link
  (`appUrlOpen`); nothing navigates. iOS observes `.capacitorOpenUniversalLink` (registered in
  `capacitorDidLoad`, before Capacitor delivers a cold-launch link on its first `viewDidAppear`). Android:
  `BridgeActivity.load()` passes the launch intent through `onNewIntent`, so one override covers cold and
  warm. Both accept only https on `server.url`'s host. The QR rule holds: a warm link load leaves
  `history.length > 1`, and a cold one has a launch URL, so `AppFrontDoor` never applies the partner
  shortcut (2E logic, unchanged).
- **Only `play.` is claimed.** Apex marketing pages are sent OUT of the app, so claiming them would
  bounce a link between the app and the browser. The apex trust files still name the app, for
  passkeys only (`webcredentials` / `get_login_creds`). AASA excludes `/api/*`.
- **Trust files come from env vars** (`APPLE_TEAM_ID`, `ANDROID_APP_CERT_SHA256`, one reader:
  `lib/nativeAppLinks.ts`). Each is a 404 until set. CDN: `s-maxage=3600`.
- **Minimum-version gate on the web, not in the shell.** `GET /api/app/config` returns
  `{ minSupportedVersion, latestVersion, storeUrls }` (`lib/nativeAppConfig.ts`, env
  `NATIVE_APP_MIN_VERSION` / `_LATEST_VERSION` / `_IOS_STORE_URL` / `_ANDROID_STORE_URL`), with
  `public, s-maxage=300, stale-while-revalidate=86400`. The page compares `nativeAppVersion()`
  (UA token) and shows `AppUpdateRequired` (not dismissible). Why web: it works for **every** shell
  ever shipped, including ones built before the gate existed; a native check would only protect shells
  that contain it. It fails open (no answer, junk, no version → no gate). A malformed env value reads as
  unset, so a typo can't lock everyone out. sessionStorage caches the answer for 30 min per tab.
  "latestVersion" is informational; nothing nags.
- **Vercel env vars apply on the next deployment.** The plan said "no redeploy needed"; that's wrong
  on Vercel. After changing any of the six env vars, click **Redeploy** (no code change). Comments,
  `.env.example` and the checklist say so.
- **Icons/splash: our own script**, `native/scripts/generate-app-icons.cjs`, using the repo root's
  `sharp`. `@capacitor/assets` 3.0.5 pulls sharp 0.32 with install scripts this npm blocks
  (`allow-scripts`); it was installed, failed that check, and removed (lockfile verified clean). The source
  `public/brand/htc-logo.png` is only read; nothing under `public/` changed (the `/brand/web/`
  immutable-cache rule is untouched). iOS icon is opaque (App Store rejects alpha). Android adaptive
  icon = navy background + logo at 61% of the 108dp foreground; Android 12+ splash uses
  `windowSplashScreenBackground` navy + the foreground icon.
- **Version 1.0.0 everywhere:** `native/package.json`, both UA tokens, iOS `MARKETING_VERSION`,
  Android `versionName` (contract test pins them equal). Build numbers stay 1 / versionCode 1.
- **`webContentsDebuggingEnabled` removed** from the config: Capacitor's default is on for debug builds,
  off for release.
- **Spike removed:** `SpikeViewController` is gone; `SceneDelegate` roots on
  `HightopBridgeViewController`. Its debug probe moved into that class, `#if DEBUG` only, renamed
  **`HIGHTOP_PROBE_STEPS`** (log prefix `PROBE[i]`). Same JSON shape as the old `SPIKE_STEPS`.
- **Android apex bridge injection keeps its reflection** (Capacitor 8.5.3 has no public way to get the
  script, and rebuilding it needs the private plugin map). Hardened instead: logs
  `apex bridge injected` / `apex bridge injection FAILED`, and `VERIFIED_CAPACITOR_ANDROID = "8.5.3"`
  must equal `native/package.json`'s `@capacitor/android`, so an upgrade fails `npm run test` until
  someone re-verifies on the emulator (`window.Capacitor.Plugins` on an apex page) and bumps it.
- **Info.plist:** friendly `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription` (for 4b),
  `NSFaceIDUsageDescription` (for 4c); `UIRequiredDeviceCapabilities` `armv7` → `arm64`.
- **PWA prompt:** new `shouldOfferInstallPrompt()` in `lib/pwa.ts` = flag AND `!isNativeApp()`; both
  callers use it. (The iPhone app's web view passes `isIOSSafari()`, so the flag alone would have
  shown the coach card in the app.)
- **Own-host `window.open` / `target=_blank`** still differs (iOS: Safari; Android: in-app). Nothing in
  the player or partner UI opens our own host in a new window (only ads, to advertisers, and `/info`),
  so this was left alone. Normalising Android needs replacing Capacitor's WebChromeClient.

### 4. How the pieces fit

```
app/layout.tsx ── <NativeAppRuntime/> ──(in app only, import())──> NativeAppRuntimeImpl
                                                   ├─ addNativeListener("App","backButton") → handleNativeBackPress
                                                   │      ↑ registry (components/navigation/nativeBackButton.ts)
                                                   │      ├─ useModalOverlay   "overlay" → requestClose
                                                   │      ├─ WizardFooter      "step"    → onBack
                                                   │      └─ ExitBackButton    "exit"    → handleExit
                                                   └─ fetch /api/app/config → decideAppUpdate → <AppUpdateRequired/>
app/{admin,owner/signup,owner/register,owner/billing/setup}/layout.tsx → <WebOnlyInApp path> (UA) → <WebOnlyNotice>
app/owner/billing/page.tsx ── useIsNativeApp() → <ManageBillingOnWeb/> → openInSystemBrowser()
lib/nativeApp.ts ── the only reader of the UA token / window.Capacitor (helpers above)
lib/geolocation.ts ── usesNativeLocation() → callNative("Geolocation", …)
native: HightopBridgeViewController.swift (iOS) / MainActivity + HightopWebViewClient + HightopShellPlugin (Android)
```

### 5. Facts and traps discovered

- **The proxy never sees `/.well-known/*`.** `proxy.ts`'s matcher excludes any path containing a dot
  (`.*\..*`), and `/.well-known` has one. The plan's worry (extensionless AASA gated) didn't apply.
  Belt and braces anyway: `isPublicPath` allows `/.well-known/`, `classifyPage` calls it `neutral`
  (never bounced between hosts), and `tests/proxy.behavior.test.ts` pins the matcher exclusion, the
  pass-through and that lookalikes stay gated.
- **Next.js serves `app/.well-known/…` route folders** (the build lists both routes as `ƒ`).
- **In zsh, never name a shell variable `path`** — it is tied to `PATH` and kills every command after it.
- **WKWebView `evaluateJavaScript` can't return a Promise** ("unsupported type"). Probe steps that call
  `nativePromise` still run; read the effect another way (a screenshot, the next step).
- **The Android emulator can't reach a plain-http server by default** (cleartext blocked; `10.0.2.2` also
  failed with `next start`'s binding). What worked for testing the new web code in the app: `adb reverse
  tcp:3107 tcp:3107`, edit the GENERATED `android/app/src/main/assets/capacitor.config.json`
  (`server.url http://localhost:3107`, `cleartext`, `allowNavigation += localhost`), temporarily add
  `android:usesCleartextTraffic="true"` to the manifest, build, then **restore the manifest** (copy kept
  in the scratchpad) and run `npx cap sync android` (regenerates the asset config). Both generated config
  copies are git-ignored. Everything was restored and rebuilt; `grep usesCleartextTraffic` = 0.
- **Android Back with the keyboard open:** the first press only closes the keyboard (the system eats it);
  the second reaches the page. That's standard.
- A chrome-error page for a blocked/cleartext load is *not* our offline page: `HightopWebViewClient`
  shows "No connection" only for real network errors (2E), so this is expected.
- `am start -a VIEW -d https://play… com.hightopchallenge.app` delivers a link straight to the app,
  without App Links verification. Use it to test link handling before the trust files are live.
- Capacitor's Android `native-bridge` logs every `backButton` payload as `Capacitor/Console … {"canGoBack":…}`.
  Grep logcat for it to see whether a press reached the page.

### 6. How to build, run and test; what was verified

**Commands.**
- Web: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:god-mode-join`,
  `npm run test:pwa-contract`, `npm run build` (don't run typecheck and build at the same time).
- Icons: `cd native && node scripts/generate-app-icons.cjs`, then `npx cap sync`.
- Native builds: as in the 2A handoff §6 and 2D handoff §5. iPhone: `xcodebuild -project
  App.xcodeproj -scheme App -configuration Debug -destination 'id=00008140-001E74DE1A7B001C'
  -derivedDataPath <scratch> -allowProvisioningUpdates build`, then `xcrun devicectl device install app
  --device 00008140-001E74DE1A7B001C <scratch>/Build/Products/Debug-iphoneos/App.app`.
- Probe iOS: `SIMCTL_CHILD_HIGHTOP_PROBE_STEPS='[{"delay":10,"js":"location.href"}]' xcrun simctl launch
  --console-pty "iPhone 17" com.hightopchallenge.spike` (run it in the background and `pkill` it; macOS has
  no `timeout`). Device: `xcrun devicectl device process launch … --console --environment-variables
  '{"HIGHTOP_PROBE_STEPS":"[…]"}' com.hightopchallenge.spike` (phone unlocked).
- Probe Android: forward the devtools socket (2A §6) and send CDP `Runtime.evaluate` (use
  `userGesture: true` for clicks). The throwaway scripts lived in the session scratchpad; rewrite them
  (~25 lines).

**Results, 2026-10-09.**
- Typecheck clean; lint clean (only the usual `lib/sportsBingo.ts` Babel size note).
- `npm run test`: **315 files passed / 1 skipped; 3,618 tests passed / 13 skipped / 0 failed.**
- `test:god-mode-join` 50/50 (6 files); `test:pwa-contract` 20/20.
- New/extended tests: `tests/lib.native-app-phase3.test.ts` (15), `tests/native-app-contract.test.ts`
  (29), `tests/proxy.behavior.test.ts` (16).
- `npm run build`: success, 196 pages, `Proxy (Middleware)`; `/.well-known/*` and `/api/app/config` listed.
  `/admin`, `/owner/signup`, `/owner/register`, `/owner/billing/setup` are now dynamic (`ƒ`): the
  layout reads the User-Agent.
- **Local production server** (`next start`, WebKit iPhone profile):
  - `/api/app/config` with and without env vars, correct cache header;
  - AASA on `play.` (applinks + webcredentials) vs apex (webcredentials only), assetlinks relations, 404
    when unset;
  - website UA: `/` has the Home link and never fetches the runtime chunk; `/owner/signup` renders the
    wizard; `/owner/billing/setup` → `/owner/login` as before;
  - app UA: `/owner/signup`, `/owner/billing/setup`, `/admin` render the notice; with
    `NATIVE_APP_MIN_VERSION=9.0.0` the update screen covers every page (screenshots checked).
- **Android emulator, live-site build:** cold App Link (`/terms?al=cold`) opened on that page (history
  1, then the site's own 308 to the apex); warm App Link (`/?al=warm`) loaded with history 2; on the apex
  `Capacitor.Plugins` includes `HightopShell` (bridge injection works); `openInBrowser` rejects
  `javascript:` and opens Chrome for https.
- **Android emulator, local-build test APK:** front door shows "Venue partner? Sign in"; Back at the
  first page → `moveTaskToBack`; Back on `/terms` → `/`; Create Account step → Back (after the keyboard
  press) → "How do you want to continue?" on the same page; `/owner/billing/setup` → notice → "Open in
  browser" → Chrome.
- **iOS Simulator:** plugins include `Geolocation`, `App`, `HightopShell`; UA `HightopChallengeApp/1.0.0
  (ios)`; `HightopShell.openInBrowser` opened Safari on the billing page ("◀ Hightop Challenge" back
  chip).
- **Andrew's iPhone:** Phase 3 build installed; probe confirmed the same plugin list and UA.

**Not verified (device checklist or later):**
- The iPhone single location prompt end to end: it needs the deployed site (the web half is new).
- Android Back on an open owner sheet (needs a partner session): checklist step 9.
- The in-app Billing page with a real subscription (static contract test only): checklist step 11.
- Universal Links / App Links verification by the OS (needs the paid accounts and env vars).
- The icon and launch screen on the real home screen (images checked as files only).
- A release (not debug) build of either app.

### 7. Open questions and things waiting on Andrew

1. Commit/push 2D + 2E + 3 (how to split — §2).
2. Device checklist `docs/native-app-device-checklist.md` after the deploy.
3. From 2E: should a remembered partner who plays as a guest switch the app back to the player side?
4. **When the paid Apple Organization account is approved** (in one change, then a device build):
   `PRODUCT_BUNDLE_IDENTIFIER = com.hightopchallenge.app` (reconfirm with Andrew: plan §2 item 11 —
   permanent), `DEVELOPMENT_TEAM = <new Team ID>`, `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` in both
   build configurations of `project.pbxproj`; then `vercel env add APPLE_TEAM_ID production` and
   Redeploy. Check `https://play.hightopchallenge.com/.well-known/apple-app-site-association`.
5. **When Play Console exists:** enable Play App Signing; put the app-signing **and** upload certificate
   SHA-256 fingerprints in `ANDROID_APP_CERT_SHA256` (comma-separated) and Redeploy. Verify with
   `adb shell pm verify-app-links --re-verify com.hightopchallenge.app` then `pm get-app-links`.
6. **At the first store release:** set `NATIVE_APP_IOS_STORE_URL` / `NATIVE_APP_ANDROID_STORE_URL`.
   Leave `NATIVE_APP_MIN_VERSION` unset until a release actually breaks old versions.
7. Optional follow-up: `StandalonePwaRuntime`'s pull-to-refresh exists because the installed PWA has no
   reload button; the native app has none either. Enabling it in the app would be one condition
   (`isRunningAsInstalledPwa() || isNativeApp()` for the pull gesture only — **not** the `tp-standalone`
   class, which adds status-bar padding the app no longer needs). Ask Andrew.
8. Still open from earlier: R3 (Rick is God Mode), the 2A checklist A1–A14, and the website's 150 ms Back
   race (2E §7.4).

### 8. Recommended first steps for the next agent

1. If Andrew hasn't decided, ask about committing (§2). Never `git checkout -- <file>`.
2. After the deploy, walk Andrew through the device checklist; fix ❌s first.
3. Then Phase 4a (Sonnet 5.5, medium) as in §1, or Part B / §7 items 4–5 if the paid accounts have
   arrived (Opus 5.5, xhigh for passkeys, per the plan).
