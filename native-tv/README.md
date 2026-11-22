# Hightop Challenge TV (Fire OS)

The Amazon Fire TV app. It's a thin native shell: one full-screen WebView on `https://hightopchallenge.com/tv-app`.
Every screen is a web page, so screen changes ship with the website and need no app update. Plan:
`docs/fire-tv-app-plan.md` (Phase 4 built this; Phase 6 adds release signing).

Separate from the phone app (`native/`, Capacitor, players only). Package `com.hightopchallenge.tv`.

## What the shell adds (plan D7)

| Feature | Where |
|---|---|
| UA token ` HightopChallengeTV/<versionName>` (never the phone app's token) | `TvPolicy.kt` `tvUserAgent`, read only by `lib/tvApp.ts` |
| Only https pages on `hightopchallenge.com`, `www.` and `play.` load; `/owner` and `/admin` never do; nothing is handed to another app | `TvPolicy.kt` `TvUrlPolicy` |
| Screen never sleeps: `FLAG_KEEP_SCREEN_ON` (the web keep-awake hook stands down in the app) | `MainActivity.onCreate`, `lib/useKeepScreenAwake.ts` |
| "Can't connect." with Retry; retries at 2, 4, 8, 16, then every 30 s, and at once when the network returns; a Wi-Fi drop longer than 10 s shows it | `MainActivity` `showOffline` / `watchNetwork` |
| Back: leaves Try demo (`/tv-app/...` sub-pages); on Connect or the display, exits | `backActionFor` |
| Menu (☰): Change venue (clears the stored venue, loads `/tv-app?change=1`) and Reload | `MainActivity.showMenu` |
| Remembered venue in app storage: `window.HightopTV.getVenueId()` / `setVenueId(id)` / `clearVenueId()` | `TvBridge.kt` |
| Back after 5+ minutes away (Home, sleep, HDMI off): the page reloads | `isStaleAfterBackground` |
| In the background, page timers pause: a TV on the Home screen makes no requests | `MainActivity.onPause` |

## Build

Needs JDK 21 (Homebrew `openjdk@21`) and the Android SDK at `~/Library/Android/sdk`. Build output goes to
`~/Library/Caches/hightop-native-tv/` because iCloud makes "name 2" copies inside build folders in `~/Documents`.

```sh
cd native-tv
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
printf 'sdk.dir=%s\n' "$HOME/Library/Android/sdk" > local.properties   # once; git-ignored
./gradlew --project-cache-dir "$HOME/Library/Caches/hightop-native-tv/gradle-project" lintDebug testDebugUnitTest assembleDebug
```

APK: `~/Library/Caches/hightop-native-tv/app/outputs/apk/debug/app-debug.apk`

The `--project-cache-dir` flag keeps Gradle's `.gradle/` out of iCloud too.

## Install on a Fire TV Stick (Phase 5)

```sh
ADB=~/Library/Android/sdk/platform-tools/adb     # adb is not on PATH
$ADB connect <stick-ip>:5555                    # approve "Allow USB debugging?" on the TV
$ADB install -r ~/Library/Caches/hightop-native-tv/app/outputs/apk/debug/app-debug.apk
$ADB logcat -s HightopTV                         # shell logs (blocked navigations, Back)
```

Debug builds allow Chrome DevTools: `adb forward tcp:9339 localabstract:webview_devtools_remote_<pid>` (the socket
name is in `adb shell cat /proc/net/unix`), then open `http://localhost:9339/json`.

## Point a debug build at another server

```sh
./gradlew assembleDebug -PtvStartUrl=http://10.0.2.2:3117/tv-app   # emulator → a dev server on this Mac
```

Only debug builds read `tvStartUrl`; that exact origin is then allowed too. Plain http works only for `10.0.2.2`,
`localhost` and `127.0.0.1` (`src/debug/res/xml/network_security_config.xml`). Release builds always use production.

## Art

`node native-tv/art/render-art.mjs` (from the repo root) renders the approved Option 2 store art (plan D22) into the
banner (`res/drawable-xhdpi/tv_banner.png`, 320×180) and launcher icons, plus 512×512 and 1280×720 masters in
`native-tv/art/out/` (git-ignored) for Phase 6.

## Tests

- `app/src/test/.../TvPolicyTest.kt`: URL allow-list, UA string, Back rule, bridge input, retry delays.
- `tests/tv-app-contract.test.ts` (Vitest, repo root): `native-tv/` never contains the phone app's token, and its UA
  token, bridge name and methods, start URL, hosts, permissions and package id match the website.
