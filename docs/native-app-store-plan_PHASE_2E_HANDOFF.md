# Native App Store Plan — Phase 2E Handoff (the app's front door, no `/info`, false "No connection")

Plan: `docs/native-app-store-plan.md` → "Phase 2E". Worked 2026-10-09 by Claude Opus 5.5.
**Status: built and verified. The native fixes were tested on Andrew's iPhone 16 Pro, the iOS
Simulator and the Android emulator. The web changes were tested in a local production build with the
app's user agent. NOT committed, NOT pushed, NOT deployed.** Phase 2D is also still uncommitted, and
the two phases share four files (see §2). **Next:** Andrew's commit/push decision, then his iPhone
check (§6), then Phase 3, or Part B once the paid Apple account is approved.

---

## Summary for Andrew (plain English)

**What changed.**
- **No more fake "No connection" screen (R6).** I found the cause. When you tap Back on a legal page,
  the site starts two page loads at once. On a phone network the second one cancels the first, and
  the app treated "cancelled" as "offline". The app now shows "No connection" only when the phone
  really can't reach us. Back inside the app now does a single page load. I reproduced the bug
  before the fix and confirmed it gone after, on your iPhone and in the simulator.
- **"Try again" goes back to the page you were on**, not to the sign-in screen.
- **Android fix:** a "page not found" error no longer shows "No connection" either.
- **No `/info` inside the app (R5).**
  - `/info`, `/faqs` and `/advertise` open in Safari or Chrome. The legal pages (privacy, terms,
    rules, support, delete-account) stay inside the app, because Apple wants them reachable there.
  - Every "Home" or "Back to Home Page" button in the app now goes to the app's front door, which is
    the player sign-in.
  - On the website, those same buttons still go to `/info`, exactly as before.
- **The front door.**
  - In the app, the sign-in screen's "Home" button is replaced by a small **"Venue partner? Sign in"**
    link.
  - When a partner signs in inside the app, the phone remembers it. Next time they open the app from
    its icon, it opens straight on the Partner Dashboard.
  - If their sign-in has expired, the app shows the front door and forgets the partner setting.
  - Signing out also forgets it.
  - **Your QR rule is built in:** if the app was opened through a link or a QR code, it always shows
    the player sign-in.
- **Airplane mode (R7):** on Android, the "No connection" screen appears correctly, both when the app
  is first opened and while using it, and "Try again" works once the connection is back. The iPhone
  airplane-mode test is yours (§6).

**Is it live?**
- **App:** the new test build is on your iPhone, the simulator and the emulator. The native fixes
  already work there: the false "No connection", "Try again", and `/info` opening in Safari.
- **Website:** the front door, the partner link, the remembered partner and the new Back targets are
  **not live** until you say "commit and push". Vercel deploys from `main`.

**What needs you.**
1. Say whether to commit and push. Phase 2D is uncommitted too. I recommend two commits: first 2D,
   then 2E.
2. After the deploy, a ~10-minute check on your iPhone (§6). The new test build is already installed.
3. One question (§7): when a partner also plays as a guest on the same phone, should playing switch
   the app back to opening on the player side?

---

## For the next agent

You have none of this conversation. Read these first:
- `CLAUDE.md`, including the rewritten "`/info` IS the home page — on the website" rule and the new
  "app's front door" bullet under "Native app";
- `docs/native-app-store-plan.md`, Phase 2E (its status note lists the deviations) and Phase 3 (its
  new "Already done by 2E" paragraph);
- the 2A handoff §5 and §6 (build commands, traps) and the 2D handoff §5 (device probing);
- this file.

### 1. Next phase: goal and scope

Two possible next steps:

1. **Close out 2D + 2E:** Andrew's commit/push, then the device checklist in §6.
2. **Then Phase 3, the production shell** (Opus 5.5, high, per the plan). The plan's Phase 3
   section now lists what 2E already built, so don't rebuild it.

Phase 3 must still do:
- add the remaining link-outs to the existing mechanism: `/admin`, `/owner/signup`,
  `/owner/register`, and the Stripe billing actions;
- Universal Links, then the warm-resume (`appUrlOpen`) half of the QR rule;
- the minimum-version gate;
- icons and splash;
- the Android back button, routed through the page;
- `@capacitor/geolocation`, for the iOS double location prompt;
- `nativePlatform()`, `nativeAppVersion()` and `hasNativeCapability()`, added in `lib/nativeApp.ts`;
- replace `SpikeViewController` with `HightopBridgeViewController`, and turn off
  `webContentsDebuggingEnabled` for release builds.

Out of scope for any of this: passkeys (Part B) and push notifications (Phase 5).

### 2. Starting state

- Branch `main`, HEAD `858660c` (2C), pushed. **Both 2D and 2E are uncommitted.**
- **Files touched only by 2E:**
  - web: `lib/nativeApp.ts` (new), `lib/useIsNativeApp.ts` (new), `lib/appFrontDoor.ts` (new),
    `components/join/AppFrontDoor.tsx` (new), `app/page.tsx`, `lib/domainSplit.ts`;
  - navigation: `components/navigation/exitNavigation.ts`, `components/navigation/ExitBackButton.tsx`,
    `components/navigation/SignOutButton.tsx`;
  - home-link call sites: `components/legal/LegalPage.tsx`, `components/signup/SignupShell.tsx`,
    `components/signup/SignupWizard.tsx`, `components/account/DeleteAccountPanel.tsx`;
  - partner pages: `app/owner/login/page.tsx`, `app/owner/dashboard/page.tsx`,
    `app/owner/billing/setup/page.tsx`;
  - tests: `tests/native-app-contract.test.ts` (new), `tests/lib.app-front-door.test.ts` (new);
  - shell: `native/www/offline.html`, `native/ios/App/App/HightopBridgeViewController.swift` (new),
    `native/ios/App/App.xcodeproj/project.pbxproj` (adds that file),
    `native/ios/App/App/AppDelegate.swift` (one line: the spike VC's superclass),
    `native/ios/App/App/SceneDelegate.swift` (comment only),
    `native/android/app/src/main/java/com/hightopchallenge/app/HightopWebViewClient.java` (new),
    `MainActivity.java` (installs the client);
  - this file.
- **Files shared by 2D and 2E:**
  - `components/join/JoinFlow.tsx`: 2D changed one line, the logo `width={256}`; 2E changed the
    imports, the `inNativeApp` hook and the bottom link.
  - `native/capacitor.config.json`: 2D added `plugins.StatusBar` and `plugins.SystemBars`; 2E added
    `plugins.HightopShell`, removed `server.errorPath`, and reformatted `allowNavigation` onto separate
    lines.
  - `CLAUDE.md`, `docs/native-app-store-plan.md` and `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`.
- To commit them separately, use the 2C technique: build a 2D-only copy of each shared file and stage
  it with `git update-index --cacheinfo`, so the working tree is never touched. One combined
  "Native app Phases 2D + 2E" commit is also fine.
- **Never `git checkout -- <file>` to undo an edit.** These files hold two phases of uncommitted work.
- **Devices:** all three have the 2E debug build installed:
  - Andrew's iPhone 16 Pro (UDID `00008140-001E74DE1A7B001C`, bundle id `com.hightopchallenge.spike`);
  - the "iPhone 17" simulator;
  - the emulator `hightop_api36`, left running with airplane mode **off**.
  - On the emulator, Chrome sits on its first-run screen from the link-out test. That's harmless.
- **Production data:** none written. No env vars, no migrations, no `vercel.json` change, no
  `proxy.ts` change, no deploy.

### 3. Decisions made (don't re-ask)

- **R6 root cause, confirmed.** With `history.back()` from `/privacy`, the page only starts leaving at
  **+150 ms**. That was measured in the simulator, and WebKit fires no `beforeunload` for history
  traversal. `useExitNavigation`'s 150 ms fallback then fires a second navigation (log: "Failed to
  fetch RSC payload for https://hightopchallenge.com/info…"). When that second navigation cancels the
  first, iOS reports `NSURLErrorDomain -999`, and Capacitor's `WebViewDelegationHandler` loads
  `server.errorPath` for any provisional failure. I reproduced this deterministically on the old
  build:
  `history.back(); setTimeout(()=>location.assign(...),20)` led to `offline.html`.
- **Fixed at both ends.**
  - Shell: offline page only for real network errors.
  - Web, inside the app only: Back waits for `pagehide` (2,000 ms ceiling, `IN_APP_BACK_FALLBACK_MS`)
    instead of 150 ms. The website keeps 150 ms, because the plan says the website must behave
    identically. Website Back from a legal page still races on slow networks; there it means landing
    on `/info` instead of the previous page, not an error. It's a possible follow-up; ask Andrew
    before changing website behaviour.
- **`server.errorPath` is removed**, and the shell shows `plugins.HightopShell.offlinePage` itself.
  - iOS: Capacitor builds its navigation delegate inside a `final` `loadView`, so
    `HightopBridgeViewController.capacitorDidLoad()` puts a forwarding wrapper in front of it
    (`responds(to:)` / `forwardingTarget(for:)` pass every other delegate call to Capacitor).
  - Android: Capacitor's `onReceivedHttpError` also showed the offline page for any main-frame HTTP
    error, such as a 404. Removed.
- **Marketing link-out is native**, with one list in `native/capacitor.config.json`:
  `openInBrowser { host: "hightopchallenge.com", paths: ["/", "/info", "/faqs", "/advertise"] }`.
  - `/` matches only the apex root, which rewrites to `/info`. Every other entry also matches the
    paths below it.
  - I chose native over web interception because it catches every navigation type: links,
    `location.href`, and `router.push` to an absolute URL.
- **The remembered side is a cookie, not localStorage** (a deviation from the plan).
  - Why: the partner signs in on the apex, but the launch choice runs on `play.`, and localStorage is
    per host.
  - Cookie `htc_app_side=partner`: `Domain=` is `NEXT_PUBLIC_COOKIE_DOMAIN` (set in production;
    `lib/storage.ts` uses the same variable), 180 days, not HttpOnly, written by JavaScript only
    inside the app.
  - It's a hint, never an access check.
  - Written by: owner login success, and every successful dashboard first load in the app.
  - Cleared by: partner sign-out, and a dashboard 401 on a launch entry.
- **"Launch" = `isAppLaunchEntry()`:** inside the app, `history.length === 1`, and the navigation
  type is not reload or back_forward.
  - Verified on the simulator and the iPhone: the first page has `len=1`.
  - The dashboard hop uses `location.replace`, so the history length stays 1.
  - A partner who taps back to the front door has a longer history, so they are never bounced
    again. No storage is needed.
- **Partner session check, without a new request.** `play.` can't see the apex's HttpOnly
  `tp_owner_sess` cookie (host-only on the apex). So the front door decides with
  `partnerSession: "unchecked"` and hops to the dashboard. The dashboard's existing
  `GET /api/owner/dashboard` call is the check. On a 401 on a launch entry with "partner"
  remembered, it forgets the side and does `location.replace(homeHref(true))`. That costs one tiny
  401 per expired-partner launch, and only the first time, because the side is then forgotten.
- **`launchedFromLink`** is true when:
  - the page URL has `?v=` (a venue link); or
  - the shell's `@capacitor/app` `getLaunchUrl` returns a URL. It's read through
    `window.Capacitor.nativePromise("App","getLaunchUrl")`, with a 500 ms timeout, and fails to
    "not a link".

  Before Universal Links exist, this is always false for an icon launch.
- **The front door gate is server-side, by user agent.** `app/page.tsx` is already dynamic (it reads
  `searchParams`), so `headers()` costs nothing. Only an app request gets `<AppFrontDoor>`. That
  component holds `JoinFlow` back until the decision is made, so JoinFlow's start-up (venue list,
  location prompt) can't race the dashboard hop. Website requests render `JoinFlow` exactly as before.
- **The partner link shows only on the `auth-method-selection` panel in the app.** The other panels
  show nothing there in the app, and the website keeps its Home button on every panel.
- **`homeHref(inNativeApp)` takes a boolean**, so `lib/domainSplit.ts` stays pure for the edge.
  - Server-rendered Back controls use `ExitBackButton`'s new **`home`** option, resolved at tap time.
  - Rendered links use `useIsNativeApp()`, a `useSyncExternalStore` hook: `false` during
    hydration, then the real value.
  - Tap handlers call `homeHref(isNativeApp())`.

### 4. What was built (how it fits)

- `lib/nativeApp.ts`:
  - `NATIVE_APP_UA_TOKEN`, `isNativeUserAgent(ua)` (server-safe), `isNativeApp()` (UA token or
    `Capacitor.isNativePlatform()`), and `nativeLaunchUrl()`.
  - It is the only reader (contract test).
- `lib/useIsNativeApp.ts`: the hydration-safe hook.
- `lib/domainSplit.ts`: `homeHref(inNativeApp)` returns `gameHref("/")` in the app and
  `marketingHref("/info")` otherwise.
- `lib/appFrontDoor.ts`:
  - `chooseAppLaunchDestination()` (pure);
  - `parseRememberedAppSide`, `readRememberedAppSide`, `rememberPartnerSide` (no-op outside the app),
    `forgetAppSide`;
  - `isAppLaunchEntry`, `launchedFromLink`, `PARTNER_LAUNCH_PATH`.
- `components/join/AppFrontDoor.tsx`: the gate.
  - It shows `HightopLoader` with the default show-delay, so a fast decision paints nothing.
  - For a remembered partner on a plain launch, it does
    `location.replace(marketingHref("/owner/dashboard"))`.
- `components/navigation/exitNavigation.ts`:
  - new `home` option, resolved in `resolveHref`;
  - new in-app branch in the history path (the `pagehide` wait);
  - `ExitBackButton` passes `home` through.
- R5 call sites:
  - `LegalPage` and `/owner/login` use `backTo={{ home: true, … }}`;
  - `SignupShell` uses `{ home: true }` when there is no `exitHref`;
  - `SignupWizard` and `billing/setup` use `homeHref(isNativeApp())`;
  - `DeleteAccountPanel` uses `homeHref(useIsNativeApp())`;
  - in `JoinFlow`, the app shows the "Venue partner? Sign in" link to `marketingHref("/owner/login")`
    and the website shows the Home link with `homeHref(false)`.
  - The account drawer's legal links (`AccountMenuList`, `marketingHref(link.href)`) are unchanged;
    they stay in the app.
- `SignOutButton`:
  - `performSignOut("partner")` calls `forgetAppSide()`;
  - in the app, a partner's default redirect is `homeHref(true)` instead of `/owner/login`.
- Dashboard (`app/owner/dashboard/page.tsx`), in the first-load effect:
  - a 401 on a launch entry with "partner" remembered → forget the side and go to the front door;
  - success → `rememberPartnerSide()`.
- `native/capacitor.config.json`: `plugins.HightopShell` = `{ offlinePage: "offline.html",
  openInBrowser: {…} }`; no `server.errorPath`.
- `native/www/offline.html`:
  - "Try again" reads `?url=` and goes there only if it's https on `play.hightopchallenge.com` or
    `hightopchallenge.com`;
  - otherwise it goes to `https://play.hightopchallenge.com/`.
- iOS, `HightopBridgeViewController.swift` (registered in `project.pbxproj` with ids
  `A1C0DE0E2E0000000000B001`/`…F001`). `SpikeViewController` now subclasses it, and SceneDelegate
  still roots on the spike VC.
  - `OpenInBrowserRules` sends matching URLs to Safari through `UIApplication.shared.open`.
  - `HightopNavigationDelegate` handles `didFailProvisionalNavigation` and `didFail`.
  - Only these errors count as offline, and they load `capacitor://localhost/offline.html?url=<failed>`:
    NotConnectedToInternet, NetworkConnectionLost, CannotFindHost, CannotConnectToHost,
    DNSLookupFailed, TimedOut, InternationalRoamingOff, CallIsActive, DataNotAllowed,
    CannotLoadFromNetwork, SecureConnectionFailed.
  - Anything else is logged (`Hightop: ignored navigation failure …`) and ignored.
- Android, `HightopWebViewClient extends BridgeWebViewClient`:
  - `shouldOverrideUrlLoading`: link-outs go to `ACTION_VIEW`;
  - `onReceivedError`: calls `super` (plugin listeners, e.g. SystemBars, are package-private to reach
    otherwise); then, for HOST_LOOKUP, CONNECT, TIMEOUT, IO or FAILED_SSL_HANDSHAKE only, it reads
    `assets/public/offline.html` and calls
    `loadDataWithBaseURL("https://localhost/offline.html?url=…")`;
  - it never answers the offline page's own failure;
  - `onReceivedHttpError` is not overridden; with no errorPath, `super` only notifies listeners.

### 5. Facts and traps discovered

- **Android trap (it crashed the app once during testing):** Capacitor's local server serves the
  error page only when the URL is *exactly* `bridge.getErrorUrl()` (`WebViewLocalServer.isErrorUrl`).
  So `loadUrl("https://localhost/offline.html?url=…")` went to the network. In airplane mode it
  failed, re-triggered `onReceivedError` and looped until an `OutOfMemoryError`. Hence the
  assets + `loadDataWithBaseURL` approach and the self-guard. Don't switch back to `loadUrl`.
- iOS's `capacitor://localhost/offline.html?url=…` is served fine: the scheme handler ignores the query.
- WebKit fires **no `beforeunload`** for `history.back()`. `pagehide` and `visibilitychange` arrive
  only when the previous page commits (+150 ms in the simulator on fast Wi-Fi).
- A link-out on iOS **backgrounds the app** (Safari comes to the front). The `SPIKE_STEPS`
  `evaluateJavaScript` steps after that never run, so put link-out steps last in a probe.
- **Testing an offline network on iOS:** I couldn't produce a real network error. The simulator has no
  airplane mode, and a dead port (`play.hightopchallenge.com:81`) just hangs for more than 75 s. The
  iOS offline path is covered by:
  - the cancel-ignored repro (simulator and device);
  - offline.html's retry logic (simulator);
  - Andrew's Airplane Mode check.
- **Probing Android:** `node` (v24, global `WebSocket`) with a small CDP script. In zsh, call it
  through a shell function: a `C="node x"` variable isn't word-split. `adb shell cmd connectivity
  airplane-mode enable|disable` works on this image. The devtools socket name changes when the app
  restarts, so re-forward it.
- **The proxy redirects unauthenticated game paths to `/`.** To test a 404, use a missing static file
  (`/brand/nope-2e.webp`).
- **Playwright's new page starts with an `about:blank` history entry**, so `history.length` is 2. To
  emulate an app cold launch, use `addInitScript` to override `History.prototype.length` to 1.
- Local `.env.local` has no `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` (names only checked), so locally
  `homeHref(true)` is `/` and partner links are relative. In production the split is on, so they're
  absolute (`https://play.hightopchallenge.com/`). The contract test covers both.
- `devicectl … --console` output arrives buffered. Wait and re-read the log before concluding a step
  hung.

### 6. How to build, run and test; what was verified

**Commands.**
- Web: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run test:god-mode-join`,
  `npm run test:pwa-contract`, `npm run build`.
- Native: `cd native && npx cap sync`, then the commands in the 2A handoff §6 and the 2D handoff §5.
  - iOS device build: `xcodebuild … -destination 'id=00008140-001E74DE1A7B001C' -allowProvisioningUpdates`,
    then `xcrun devicectl device install app …`.
  - Android: `ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`.

**Results, 2026-10-09.**
- Typecheck clean. Lint clean (only the usual `lib/sportsBingo.ts` Babel note).
- `npm run test`: **314 files passed / 1 skipped; 3,585 tests passed / 13 skipped / 0 failed.**
- God Mode join 50/50 (6 files). PWA contract 20/20.
- Build OK: 196 pages, `Proxy (Middleware)` listed.
- New tests: `tests/native-app-contract.test.ts` and `tests/lib.app-front-door.test.ts` (the plan's
  four front-door cases, plus the QR rule across every session state).

**Native, verified.**
- **R6 race** (`history.back()` plus a competing `location.assign` 20 ms later):
  - Simulator, old build: "No connection" (`-999`).
  - Simulator and **Andrew's iPhone**, new build: `ignored … -999`, and the page lands normally.
  - iPhone, the real Back button on the live `/privacy` page, over its own network: returned to `/`
    with no offline page.
- **Link-out:**
  - `/info` opened in Safari (simulator screenshot, and on the iPhone the app went to the background).
  - Android opened Chrome.
  - `/terms` and `/privacy` stayed in the app on both platforms.
- **Offline page:**
  - Android airplane mode, mid-use: offline page with `?url=…/terms`; "Try again" after reconnecting
    → `/terms`.
  - Android cold launch in airplane mode: offline page; "Try again" → the app.
  - Android 404: the site's own 404 page, not "No connection".
  - iOS: `offline.html?url=` retry → `/terms?x=1`, and a foreign URL → the start page.

**Web, verified** in a local `next start` with WebKit "iPhone 15 Pro" and the app user agent:
- Website `/`: Home link present, no partner link.
- App `/`: no Home link; "Venue partner? Sign in" → `/owner/login`.
- App, "partner" remembered, no session: `/` → `/owner/dashboard` → (one `/api/owner/dashboard`
  401) → `/`, cookie cleared, front door shown.
- App, "partner" remembered + `?v=`: stays on `/`.
- Back from a first-page `/terms`: app → `/`, website → `/info`.
- Back from `/privacy` with history (app): → `/`.
- `/owner/login` Back: app → `/`, website → `/info`.

**Not verified:**
- the "partner + valid session → dashboard" path end to end. I didn't create a partner account in
  production. The unit test covers the choice, and Andrew's check covers the real thing;
- iPhone Airplane Mode;
- the whole flow against the deployed site.

**Andrew's iPhone check, after "commit and push" and the Vercel deploy.** The debug app on the phone
already has the 2E shell.
1. Open the app: the sign-in screen, with "Venue partner? Sign in" at the bottom and no Home button.
2. Tap "Venue partner? Sign in", then Back: you return to the sign-in, not `/info`.
3. Sign in as a partner. Swipe the app away and reopen it from the icon: it opens on the Partner
   Dashboard.
4. On the dashboard, open the menu, then Sign Out: you're at the app's sign-in. Reopen from the icon:
   the sign-in, not the dashboard.
5. From the player menu, open Privacy, then Terms, and tap Back on each: no "No connection".
6. Any link to `/info` or `/faqs` opens Safari.
7. Turn on Airplane Mode, then tap something that loads a new page: "No connection". Turn Airplane
   Mode off, tap Try again: you're back on that page.
8. Also from the 2D handoff §6: Bingo sideways, and no content under the status bar.
9. Mobile Safari (not the app): the sign-in still has its Home button → `/info`, and the legal pages'
   Back still goes to `/info`.

### 7. Open questions for Andrew

1. Commit and push 2D and 2E? (Recommended: two commits, 2D then 2E, or one combined commit.)
2. **New:** if a remembered partner also plays as a guest on the same phone, should reaching a venue
   home switch the app back to opening on the player side? Today it doesn't: the partner shortcut
   stays until they sign out of the dashboard. If yes, the change is one `forgetAppSide()` call when
   the venue home loads in the app.
3. Still open from earlier phases: R3 (Rick is God Mode; keep that?), and the 2A per-item device
   checklist (A1–A14).
4. Optional: the website's own Back race (150 ms) can drop a slow-network visitor on `/info` instead
   of the previous page. Fix it on the website too? That changes website behaviour, so it's Andrew's
   call.

### 8. Recommended first steps for the next agent

1. If Andrew hasn't decided, ask about committing 2D and 2E (§2 has the file split). Never
   `git checkout -- <file>`.
2. After the deploy, walk Andrew through §6.
3. Phase 3 (Opus 5.5, high): start from the plan's "Already done by 2E" paragraph.
   - Add `/admin`, `/owner/signup`, `/owner/register` and billing to `HightopShell.openInBrowser`.
     Note the matcher is a path prefix, so list `/owner/signup`, never `/owner`, which would also
     catch `/owner/login` and `/owner/dashboard`. Extend `tests/native-app-contract.test.ts`.
   - For Universal Links, `launchedFromLink()` already asks `getLaunchUrl`. Add an `appUrlOpen`
     listener for warm resumes; it must never apply the partner shortcut.
