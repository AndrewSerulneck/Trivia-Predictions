# Fire TV app — Phase 4 handoff (Fire OS app, `native-tv/`)

## For Andrew (plain English)

- **What changed:** the Fire TV app now exists as a test build. It opens hightopchallenge.com/tv-app full screen and
  adds what a browser can't:
  - the TV never sleeps
  - a "Can't connect." screen that comes back by itself
  - the remote's Back and Menu (☰) buttons: Menu → **Change venue** or **Reload**
  - the TV remembers its venue in the app itself
- **Also done today:**
  - The database change from Phase 3 is in. The first try failed safely (nothing changed), because a venue id is
    text, not the format the change assumed. I fixed that one line and it went in.
  - Your answer that Category Blitz, Squares and Bracket stay off **every** TV (Silk too) is recorded as D26.
- **Live?** No.
  - Phase 3 is still PR #36, waiting for you to say **"merge it"**.
  - This phase is a second pull request that sits on top of #36 (link in the chat). Nothing reaches the website
    until both are merged.
- **The app only works once #36 is live**, because it opens hightopchallenge.com/tv-app.
- **What I need from you:**
  1. Say **"merge it"** for #36, then do the laptop test (plan → "Andrew's steps → Phase 3").
  2. Then say "merge it" for the Phase 4 PR as well. It changes one small thing on the website: the browser
     keep-awake trick switches off inside the app, because the app does it better.
  3. Then Phase 5: install the test app on your Fire Stick (plan → "Andrew's steps → Phase 5").
- **Cost:** none added. A TV costs the same as Silk today. A TV left on the Fire TV Home screen makes no requests at
  all, because the app pauses the page.

---

## For the next agent

### 1. Next phase goal and scope

- **Phase 5:** install on Andrew's Fire Stick and run the checklist (plan → "Phase 5" and "Andrew's steps → Phase 5")
  with **Sonnet 5.5 / medium**. Then fix small bugs, rebuild, reinstall, and record the results here and in
  `docs/tv-display-physical-device-checklist.md` (add a "Fire TV app" section).
- **Prerequisite:** PR #36 (Phase 3) must be merged and deployed. The app loads `https://hightopchallenge.com/tv-app`,
  which 404s until then. Merge the Phase 4 PR too, so the web keep-awake hook stands down in the app.
- **Out of scope:**
  - release signing, minify, store assets and listing (Phase 6)
  - Vega (Phase 13)
  - the sports screens (Phases 9–11)

### 2. Starting state

**Branches and PRs:**
- `feat/fire-tv-app` was cut from `feat/fire-tv-connect` at `6f773b45`, **not from `main`**. It's stacked because #36
  isn't merged and this phase needs `lib/tvApp.ts`.
- Its PR targets `feat/fire-tv-connect`. After #36 merges, retarget it to `main` (GitHub does this itself if the head
  branch is deleted on merge). Then check that the diff shows only Phase 4 files.

**Phase 3 close-out, done in this session:**
- **`supabase db push` applied `20261122114719_tv_device_pairings.sql`**, with Andrew's yes on 2026-11-22.
  - The first push failed at statement 0: `venues.id` is **text**, and the migration said `venue_id uuid`. Nothing
    was applied; `supabase migration list` still showed the remote column empty.
  - The never-applied file was corrected to `venue_id text` (commit `6f773b45` on `feat/fire-tv-connect`, pushed),
    dry-run again (only that file) and pushed.
  - Verified: the service role reads the table (0 rows), and anon gets `42501`.
- The 22 `supabase/migrations/* 2.sql` iCloud duplicates were moved to
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/8515d5db-6181-400a-bf21-044b2fb34273/scratchpad/migration-dupes/`.
  All 22 are byte-identical to tracked files, so losing that folder loses nothing. If iCloud recreates them, move
  them out again before any `db push`.
- D26 (D21 covers every display) is recorded in the plan. The Phase 3 handoff has an update block at its top.

**Still waiting on Andrew:**
- merge #36, deploy, and his laptop QR smoke test
- merge the Phase 4 PR

**Data:** apart from the migration above, nothing was read from or written to Supabase. No undo log is needed: the
table is new and empty.

### 3. Decisions made (Andrew can overrule)

- **minSdk 25** (Fire OS 6+). Fire OS 5 sticks (API 22) ship WebViews too old for the site.
  - `targetSdk` 35 and `compileSdk` 36. Lint's "not latest target" warning is accepted: Fire OS tops out around API
    30, so a target of 36 changes nothing on a stick.
- **Package `com.hightopchallenge.tv`.** The phone app is `com.hightopchallenge.app`; a contract test pins the
  difference.
- **No AndroidX dependencies:**
  - the shell uses `android.app.Activity`, the platform `WebView` and the platform `AlertDialog`, with `junit` for
    tests only
  - Kotlin 2.2.20 and AGP 8.13.0, matching what's cached
  - Gradle 8.14.3 wrapper, copied from `native/android`
- **`ACCESS_NETWORK_STATE` added** (a departure from the plan's "internet permission only").
  - It's a normal permission: no prompt, no data.
  - Without it the app can't tell that Wi-Fi dropped while a page is already on screen. Phase 5's "turn off Wi-Fi →
    Can't connect" check needs that.
  - Pinned by the contract test: exactly these two permissions.
- **Navigation rules** (`TvUrlPolicy`):
  - **Main frame:** https only, on `hightopchallenge.com`, `www.hightopchallenge.com` or `play.hightopchallenge.com`
    (port 443). `/owner` and `/admin` are always blocked: a TV never holds a partner session (D9).
  - **Iframes:** https, `about:`, `data:` or `blob:` only.
  - Anything blocked is logged (`HightopTV` tag) and never handed to another app.
- **Offline screen:**
  - shown on a main-frame network error, an HTTP status ≥ 500, a certificate error on the page being loaded, or the
    network lost for more than 10 s
  - retries at 2, 4, 8 and 16 s, then every 30 s, and immediately when the network returns
  - 404 is **not** treated as offline: a deleted venue's display 404 stays visible until Menu → Change venue
- **Lifecycle:**
  - `onPause` calls `pauseTimers()`, so no polling while the app is in the background
  - coming back after ≥ 5 min reloads the page (a long-lived TV otherwise runs an old bundle forever)
  - `singleTask`, plus `configChanges` covering keyboard, navigation, uiMode and density, so a remote or keyboard
    change never rebuilds the WebView mid-game
- **Renderer crash:** the activity recreates itself (API 26+) instead of the app dying.
- **`textZoom = 100`:** a large system font size can't reflow the 1920×1080 screens.
- **Web keep-awake stands down in the app:**
  - `lib/useKeepScreenAwake.ts` returns early with `method: "native"` when `isTvApp()`
  - Silk and other browsers are unchanged
- **Menu dialog:** the platform dialog, no title. "Change venue" is pre-selected so the focus is visible at once.

### 4. Files

`native-tv/` is a new standalone Gradle project:
- `settings.gradle.kts`, `build.gradle.kts` (build dirs → `~/Library/Caches/hightop-native-tv/`), `gradle.properties`,
  `gradlew`, `gradle/wrapper/*`, `.gitignore` (ignores `local.properties`, `.gradle/`, `.kotlin/`, `art/out/`, keys)
- `app/build.gradle.kts`:
  - `START_URL`, `SITE_HOSTS` and `DEV_ORIGIN` BuildConfig fields
  - versionCode 1, versionName `1.0.0`. It must stay digits and dots, because the UA regex in `lib/tvApp.ts` parses it.
  - `-PtvStartUrl=` works in **debug only**
- `app/proguard-rules.pro`: keeps the `@JavascriptInterface` methods, for Phase 6 minify.
- `app/src/main/AndroidManifest.xml`:
  - leanback required, touchscreen not required
  - `LAUNCHER` + `LEANBACK_LAUNCHER`, `android:banner`
  - landscape, https only, `allowBackup=false`
- `app/src/main/java/com/hightopchallenge/tv/`:
  - `TvPolicy.kt`, pure and unit-tested: `tvUserAgent`, `TvUrlPolicy`, `backActionFor`, `changeVenueUrl`,
    `isStorableVenueId`, `retryDelayMs`, `isStaleAfterBackground`, `isServerOutage` and the constants.
  - `TvBridge.kt`: `window.HightopTV` backed by SharedPreferences `hightop_tv` / `venue_id`.
  - `MainActivity.kt`: WebView setup, clients, offline screen, network watch, keys, menu and lifecycle.
- `app/src/main/res/`:
  - `layout/activity_main.xml` (WebView + offline overlay)
  - `drawable/retry_button.xml` (cyan focus ring)
  - `drawable-nodpi/htc_logo.png` (320 px, from `htc-logo-512.webp`)
  - `drawable-xhdpi/tv_banner.png` (320×180, Option 2)
  - `mipmap-*/ic_launcher.png`
  - `values/{colors,strings,themes}.xml`
  - `xml/network_security_config.xml` (no cleartext)
- `app/src/debug/res/xml/network_security_config.xml`: cleartext only to `10.0.2.2`, `localhost` and `127.0.0.1`.
- `app/src/test/java/com/hightopchallenge/tv/TvPolicyTest.kt`: 14 tests.
- `art/render-art.mjs`: renders the Option 2 art (D22) with Playwright from `public/brand/web/htc-logo-1254.webp` and
  Nunito. Writes the banner and icons, plus `art/out/icon-512x512.png` and `art/out/fire-1280x720.png` for Phase 6.
- `README.md`: build, install, debug and art commands.

Website:
- `lib/useKeepScreenAwake.ts`: the TV-app stand-down (`KeepAwakeStatus.method` gains `"native"`).
- `tests/tv-app-contract.test.ts`: a new block, "the Fire OS app (native-tv/) matches the website". It checks:
  - no phone-app token anywhere in `native-tv/` text files
  - same UA token, bridge name and methods
  - the proguard keep rule
  - start URL, hosts and a parseable versionName
  - the package id differs from the phone app's
  - manifest TV features, exactly two permissions, no cleartext
  - `FLAG_KEEP_SCREEN_ON`, and the hook's stand-down

### 5. Facts and traps found

- **`venues.id` is text, not uuid.** Any new FK to venues must be `text`.
- **The tripwire scans Kotlin tests too.** Write the phone token split, as `"HightopChallenge" + "App/"`.
- **Emulator:**
  - No Android TV system image is installed. I made AVD `hightop_tv_api29` (`tv_1080p` profile on
    `system-images;android-29;google_apis;arm64-v8a`).
  - The TV profile sets `hw.keyboard=no` and has no touchscreen. Android 10's system server then aborts in a loop
    ("Could not register INotify for /dev/input"). I set `hw.keyboard=yes` and `hw.touchScreen=yes` in
    `~/.android/avd/hightop_tv_api29.avd/config.ini`.
  - Boot it with
    `~/Library/Android/sdk/emulator/emulator -avd hightop_tv_api29 -no-window -no-audio -no-snapshot -gpu swiftshader_indirect -port 5584`.
    It takes about 2 minutes.
  - Its WebView is Chromium **91**, and `/tv-app` rendered fine on it.
- **The Java bridge returns `undefined`, not `null`, for a missing venue.** `lib/tvApp.ts` already handles it
  (`?? ""`).
- **Driving the WebView from the Mac:** forward the DevTools socket, then send CDP `Runtime.evaluate` over Node's
  global `WebSocket`. Script: `scratchpad/cdp.mjs` in this session's scratchpad (it may be cleared; it's 12 lines).
- **⚠ Back after leaving Try demo (emulator):**
  - The first Back after returning to Connect was swallowed before it reached the activity: no `Back on …` log line.
    Later presses worked, and a fresh launch exits on one Back.
  - Cause, most likely: Connect re-focuses its hidden code `<input>`, the IME binds, and the IME eats Back.
  - **Phase 5: check on the stick.** If one Back press is wasted there, the fixes are:
    - native: a `WebView` subclass whose `dispatchKeyEventPreIme` handles Back when the keyboard isn't visible
    - or web: don't auto-focus the `<input>`; focus a wrapper and move focus into the input only on OK
- **Fire TV keyboard:** still unverified whether Connect's programmatic focus on the `opacity-0` input pops up the
  on-screen keyboard by itself on Fire OS (Phase 3 handoff §6). Check it in Phase 5 together with the Back issue.
- `ACCESS_NETWORK_STATE`: `onLost` fires for the default network, and the 10 s grace avoids flashing the overlay on
  short blips. While the overlay shows, the page behind keeps running; Retry reloads `pendingUrl` (the page that was
  on screen).

### 6. Build, run, test; what was verified

Commands:
```sh
cd native-tv && export JAVA_HOME=/opt/homebrew/opt/openjdk@21
printf 'sdk.dir=%s\n' "$HOME/Library/Android/sdk" > local.properties
./gradlew --project-cache-dir "$HOME/Library/Caches/hightop-native-tv/gradle-project" clean lintDebug testDebugUnitTest assembleDebug
```
- **APK (production start URL): `~/Library/Caches/hightop-native-tv/app/outputs/apk/debug/app-debug.apk`** (1.2 MB).
  Its dex contains only `https://hightopchallenge.com/tv-app`.
- **Phase 5 install:** `~/Library/Android/sdk/platform-tools/adb install -r ~/Library/Caches/hightop-native-tv/app/outputs/apk/debug/app-debug.apk`

Results:
- Kotlin unit tests: 14/14 pass. Android lint: 0 errors. The accepted warnings are target SDK, Gradle 8.14.8
  available, fixed orientation, `allowBackup`, launcher icon shape and missing density folders.
- Website:
  - `npx tsc --noEmit` clean
  - `npm run test`: 599 files passed, 1 skipped (7813 tests)
  - ESLint clean on changed files
  - `npm run build` OK (`/tv-app` and `/tv-app/demo` static)

**Emulator smoke test** (debug build with `-PtvStartUrl=http://10.0.2.2:3117/tv-app`, against a scratchpad clone
with no `.env.local` on `:3117`; Andrew's :3000 server was never touched):
- ✅ The Connect screen renders at 1920×1080, with first focus on the code boxes. The QR box showed "Can't connect."
  only because the clone has no database.
- ✅ The page UA ends in `HightopChallengeTV/1.0.0`, and `window.HightopTV` is an object.
- ✅ The bridge refuses `<script>` and stores `venue-smoke-1`.
- ✅ With localStorage cleared, a force-stop and relaunch went straight to `/venue/venue-smoke-1/screen`, from the
  bridge alone.
- ✅ Menu → Change venue cleared both the bridge and localStorage and landed on `/tv-app`. Back closes the menu
  without exiting.
- ✅ Blocked and logged: `https://example.com/`, `/owner/display` and `intent://…`. The page stayed on `/tv-app`.
- ✅ D-pad Up → Try demo, OK → `/tv-app/demo`, Back → `/tv-app`.
  - ⚠ The next Back was swallowed (§5); the one after it exited.
  - A fresh launch exits on one Back.
- ✅ Wi-Fi and data off → "Can't connect." with Retry focused, after the 10 s grace. Back on → reloaded by itself.
- ✅ The window has `fl=KEEP_SCREEN_ON`, and the WindowManager holds `SCREEN_BRIGHT_WAKE_LOCK` for the app's uid.

Screenshots are in this session's scratchpad `shots/` (01–08); they may be cleared.

**Not verified (Phase 5 on the real stick):**
- a real Fire OS WebView and the Amazon keyboard
- the remote's Menu key code, and DPAD_CENTER → Enter in the page
- the screensaver being held off for 2 hours
- the stinger sound autoplaying
- HDMI-off and resume
- the 5-minute stale reload
- the real QR connect, against production after #36 deploys
- the Back-after-demo issue

### 7. Open questions for Andrew

- Merge #36 ("merge it"), then the laptop test. Then merge the Phase 4 PR.
- Phase 5 needs his Fire Stick's IP (Settings → My Fire TV → About → Network), and confirmation that it runs Fire OS.
- Phase 6 still needs: which test venue's display code goes in Amazon's reviewer notes.

### 8. Recommended first steps for Phase 5

1. Read this note, then check that #36 and the Phase 4 PR are merged and that `https://hightopchallenge.com/tv-app`
   returns 200.
2. Rebuild the APK on `main` (commands in §6) so it has every fix, then `adb connect <ip>:5555` and install.
3. Run `adb logcat -s HightopTV chromium` while Andrew goes through the checklist. Check the Back-after-demo issue and
   the keyboard pop-up first.
4. Use **Sonnet 5.5 / medium**, as the plan names. This phase ran on **Opus 5.5 / high**, as the plan names.
