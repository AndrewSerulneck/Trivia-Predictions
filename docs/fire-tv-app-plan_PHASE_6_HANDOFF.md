# Fire TV app: Phase 6 handoff (release build and store pack), plus the Phase 5 emulator pass

## For Andrew (plain English)

- **What changed:**
  - **Emulator test (stand-in for Phase 5):** the app ran on a TV emulator against the live website. It opens,
    connects, runs Try demo and shows the Menu. One real bug turned up and is fixed: after leaving Try demo, the
    on-screen keyboard popped up over the QR code and swallowed the next Back press. Now the keyboard only opens when
    you press OK on the code boxes.
  - **Phase 6:**
    - the Fire TV app's signing key
    - the signed release app file (354 KB)
    - store icons, a background and 7 screenshots
    - all the listing text in `docs/fire-tv-store/listing.md`
    - one new paragraph about the TV app on the Privacy page
- **Live?** You OK'd the merge on 2026-11-22. The keyboard fix and the Privacy paragraph go live when PR #38 merges and
  Vercel deploys `main`.
- **What's left:** Phase 5 on a real Fire Stick, then Phase 7 (you submit to Amazon). Don't submit before Phase 5
  passes; Amazon tests on real hardware.
- **Signing keys: backed up (2026-11-22).** You gave the agent permission to do it. Everything in the signing
  folder is in one password-locked disk image in your **iCloud Drive › Hightop Challenge Backups ›
  hightop-signing-keys-2026-11-22.dmg**. That includes the Fire TV key, the phone app's Android key and the Apple push
  key. The password is in your Apple Note **"Hightop Challenge TV – Amazon upload key"**. To open the image,
  double-click it and type that password.
- **What I need from you:** nothing for this phase.
  - Done: you OK'd **Hightop Test Bar**, display code **J6NK**, for Amazon's reviewer (2026-11-22), and asked for the
    commit and PR.
- **Cost:** none added. No new requests, crons or paid services.

---

## For the next agent

### 1. Next phase goal and scope

- **Phase 5 (device test)** is still open. It needs Andrew's Fire Stick and its IP; he had no stick on 2026-11-22.
  Follow plan → "Phase 5" and "Andrew's steps → Phase 5". **Sonnet 5.5 / medium.**
  - Install the **release** APK (§6): it's what Amazon will ship. Use the debug APK only when you need DevTools.
  - Recheck the keyboard fix on the real Amazon keyboard (§5).
  - Add the "Fire TV app" section to `docs/tv-display-physical-device-checklist.md` (not done; it belongs to Phase 5).
- **Phase 7 (Andrew submits)** comes after Phase 5 passes. He follows plan → "Andrew's steps → Phase 7" with
  `docs/fire-tv-store/listing.md` open.
- **Out of scope:**
  - Phase 8: the dashboard store link, which needs the approved store URL.
  - Phases 9+: sports screens.
  - Vega.

### 2. Starting state

- **Branch:** `feat/fire-tv-phase-6`, cut from `origin/main` at `2f5d13d8` (#37 merged). Committed and pushed with a
  PR on 2026-11-22 (Andrew asked); **not merged or deployed**. Merge only after Andrew's OK.
  - The working tree also has two modified files that are **not part of this work and were there before:**
    `app/api/admin/route.ts` and `components/admin/sections/VenuesSection.tsx`. Don't commit them with this.
  - It also has many untracked iCloud `* 2.*` duplicates.
- **To commit, stage only these paths:**
  - `components/venue-screen/TvConnectScreen.tsx`
  - `tests/tv-app-contract.test.ts`
  - `app/privacy/page.tsx`
  - `native-tv/app/build.gradle.kts`, `native-tv/art/render-art.mjs`, `native-tv/README.md`
  - `native-tv/scripts/create-upload-key.cjs`
  - `docs/fire-tv-store/` (listing.md, `images/` ×4, `screenshots/` ×7)
  - `docs/fire-tv-app-plan.md` (status line) and this file
- **Deployed:** PR #38 (branch `feat/fire-tv-phase-6` → `main`), merge OK'd by Andrew 2026-11-22. Vercel's Git
  integration deploys `main`. Confirm the production deploy happened before you rely on the keyboard fix.
  - The release APK doesn't need rebuilding for the web fix, because the app loads the website.
- **Data:** no writes, apart from what opening `/tv-app` on the emulator always does: each open creates one
  10-minute `tv_device_pairings` row. One read-only query listed venues with display codes (for the reviewer venue).
- **Signing key:** created 2026-11-22 08:37, outside the repo (§4). **Backed up 2026-11-22**, by the agent with
  Andrew's permission. No password manager was used: this Mac has no password-manager CLI, no Time Machine and no
  external drive attached.
  - **What:** the whole signing folder (8 files):
    - the Fire TV and Android upload keys, their credentials and certificates
    - APNs `AuthKey_AFVL66FJLV.p8`
    - the Google service-account JSON
  - **Where:** an AES-256 encrypted UDZO disk image (153,600 bytes) in iCloud Drive:
    `~/Library/Mobile Documents/com~apple~CloudDocs/Hightop Challenge Backups/hightop-signing-keys-2026-11-22.dmg`.
    iCloud reported it as uploaded.
  - **Password:** in the iCloud Apple Note "Hightop Challenge TV – Amazon upload key", never in the repo.
  - **Verified:** the image opens with that password and `diff -r` matches the folder; a wrong password is rejected.
  - **If you add or replace a key in the folder,** make a new dated image the same way
    (`hdiutil create -srcfolder … -encryption AES-256 -stdinpass`) and update the note.

### 3. Decisions made

- **Keyboard fix (web, not native):**
  - On load, focus goes to the code boxes (a focusable `<label>`), never to the hidden `<input>`.
  - OK, a tap or a typed character moves focus into the input, and the keyboard opens then.
  - `inputmode="none"` was tried first and **doesn't work**: with an input focused, Android's WebView keeps the
    remote's DPAD_CENTER for itself (it opens the keyboard) and the page never gets the key. So with
    `inputmode=none`, OK did nothing. Verified with a keydown logger over CDP.
  - The contract test forbids `inputMode="none"`.
  - After a wrong code, the input is refocused, so the keyboard reopens for retyping.
- **Upload key:** a separate key from the phone app's, as the plan says.
  - PKCS12, RSA 3072, alias `hightop-tv-upload`, 10,000 days (valid to 2054-04-09).
  - Gradle reads `fire-tv-upload-credentials.json` (JsonSlurper) at configuration time. Without the files, release is
    unsigned.
- **APK, not AAB.** Amazon takes APKs.
  - The APK is signed with v2 only: AGP drops v1 because minSdk 25 ≥ 24, and Fire OS 6+ verifies v2.
  - If Amazon's uploader asks for v1, add `enableV1Signing = true` to the signing config.
- **Minify + shrinkResources on.**
  - R8 renames `TvBridge` (to `a.j`) but keeps `getVenueId` / `setVenueId` / `clearVenueId`.
  - Runtime proof: a scratchpad copy of the release build, identical except WebView debugging was on, stored and read
    a venue over CDP.
- **Store icon `fire-store-1280x720`:**
  - The approved D22 layout, scaled down (logo 372 px, pill 40 px) so the logo and the "TV" pill fit Amazon's centre
    882×448 safe area.
  - The approved full-size `fire-1280x720` put the pill outside it.
  - Same design otherwise. Andrew can overrule.
- **Background:** dark navy on the left, so Amazon's text overlay reads over it. Brand blue and the logo sit inside
  the right-hand 1214×830 subject area.
- **Category: Entertainment**, not Games → Trivia. Under Games, a reviewer may expect remote gameplay. The reason is in
  listing.md.
- **Content rating:** alcohol is "infrequent/mild" (bar setting); gambling "No" (D22); UGC is limited to moderated
  usernames.
- **Screenshot order:** question, answer, champion, round break, pre-game, venue home, Connect. All from Try demo
  (fake "Demo Bar" names) and the Connect screen, captured from production on the emulator.

### 4. Files

- `components/venue-screen/TvConnectScreen.tsx`:
  - `boxesRef` (label, `tabIndex=0`, `onBoxesKeyDown`)
  - the input is `tabIndex=-1` and `pointer-events-none`
  - `reopenKeyboardRef` plus an effect refocuses the input after a failed code
  - D-pad Up/Down/Left now targets `boxesRef`
- `tests/tv-app-contract.test.ts`: "never auto-focuses the code input…" in the Connect screen block.
- `app/privacy/page.tsx`: the summary names the TV app; new section "Hightop Challenge TV app".
- `native-tv/app/build.gradle.kts`: `signingConfigs.upload` (only when the key files exist); release uses minify,
  shrinkResources and that config.
- `native-tv/scripts/create-upload-key.cjs`: one-time key creation. It refuses to overwrite and prints only public
  info. **Never rerun it.**
- `native-tv/art/render-art.mjs`: new designs `fire-store` and `background`, a `ground`/`justify` per design, and a
  114×114 resize. Rerunning it left the in-app res byte-identical.
- `native-tv/README.md`: the release build section, the art outputs, and "uninstall before switching debug ↔ release".
- `docs/fire-tv-store/listing.md`: everything to paste: fields, descriptions, bullets, keywords, content rating,
  privacy answers, reviewer notes, and the file-to-box table.
- `docs/fire-tv-store/images/`: `icon-small-114x114.png`, `icon-large-512x512.png`, `fire-tv-icon-1280x720.png`,
  `fire-tv-background-1920x1080.png`. All PNG, `hasAlpha: no`.
- `docs/fire-tv-store/screenshots/01…07-*-1920x1080.jpg`: JPEG, quality 92.

Outside the repo:
- `~/Library/Application Support/Hightop Challenge/signing/fire-tv-upload.p12`, `fire-tv-upload-credentials.json`
  (0600; folder 0700) and `fire-tv-upload-certificate.pem`.
  - Upload cert SHA-256:
    `81:22:DA:95:84:4A:42:C1:10:90:E0:0E:FA:2F:73:A8:1D:82:40:2D:23:B0:03:9F:32:F3:0A:90:80:0B:AA:01`.
- **The APK to upload:**
  `~/Library/Application Support/Hightop Challenge/releases/fire-tv/hightop-challenge-tv-1.0.0-vc1.apk`.
  - 353,656 bytes, SHA-256 `7126e620dabc512561d234b42d4dda5bc5306d28ef48d52c884930744a6bd3e7`
  - versionCode 1, versionName 1.0.0

### 5. Facts and traps

- **DPAD_CENTER on a focused `<input>` never reaches the page** in Android WebView (it's the IME's "show keyboard"
  key). Any TV-remote UI must keep focus on non-editable elements until the user presses OK.
- **Programmatic focus on an input right after any key press opens the keyboard** (user activation). A fresh launch
  doesn't, because there's no activation yet.
- **The Amazon keyboard is unverified.** The emulator uses Gboard. On the stick, check that:
  - first open and Back-from-demo show no keyboard
  - OK on the boxes opens it
  - typing a code fills the boxes and connects
- **Next.js dev in a scratchpad clone:**
  - Turbopack refuses a symlinked `node_modules` ("points out of the filesystem root"). `next dev --webpack -p 3117`
    works with the symlink.
  - When rsync-copying the repo, don't exclude `native`/`data` by bare name: that also drops `components/native`.
- **zsh doesn't word-split `$ADB` with flags.** Use a tiny wrapper script.
- **Debug ↔ release are different signatures:** `adb uninstall com.hightopchallenge.tv` before switching (it wipes
  the stored venue).
- **Flaky test:** one test file failed on the first full `npm run test` run and passed on two re-runs. It's not in the
  files touched here; its name scrolled away. If it recurs, look for it.
- **The release build logs no `HightopTV` "Back on …" lines.** Use the debug build for log-based checks.

### 6. Build, run, test; what was verified

```sh
cd native-tv && export JAVA_HOME=/opt/homebrew/opt/openjdk@21
./gradlew --project-cache-dir "$HOME/Library/Caches/hightop-native-tv/gradle-project" clean lintRelease testReleaseUnitTest assembleRelease
~/Library/Android/sdk/build-tools/36.0.0/apksigner verify --print-certs ~/Library/Caches/hightop-native-tv/app/outputs/apk/release/app-release.apk
# Phase 5 install (release):
~/Library/Android/sdk/platform-tools/adb install -r "$HOME/Library/Application Support/Hightop Challenge/releases/fire-tv/hightop-challenge-tv-1.0.0-vc1.apk"
```

Verified on 2026-11-22:
- **Release APK:**
  - apksigner "Verifies" (v2), with signer DN `CN=Hightop Challenge, O=Hightop Challenge LLC, C=US` and the cert above
  - lint 0 errors; unit tests pass
  - `aapt2` shows the package, versions, two permissions, leanback and label "Hightop Challenge TV"
- **Emulator (AVD `hightop_tv_api29`, Chromium 91) against production:**
  - debug APK on main: Connect loads with a live QR; Try demo cycles every screen; keyboard bug reproduced
  - release APK: Connect, Try demo and the Menu dialog (Change venue / Reload) work, with no crash in logcat
- **Emulator against a local clone with the fix** (`:3117`, no `.env.local`):
  - no keyboard on first open or after Back from the demo
  - OK opens the keyboard; typed letters fill the boxes
  - a wrong code shows the error and reopens the keyboard
  - Up → Try demo, Down → boxes
  - one Back exits
- **Website:**
  - `npx tsc --noEmit` clean; ESLint clean on the changed files
  - `npm run test`: 599 passed, 1 skipped (7814 tests), after one flaky run
  - `npm run build` OK
- Store images: sizes checked and no alpha. Icon and background safe areas checked against an overlay.
- Amazon sizes were checked on 2026-11-22: Fire TV icon 1280×720, background 1920×1080, 3–10 screenshots at 1920×1080,
  512 and 114 icons. Sources: developer.amazon.com "Submitting Your App to the Appstore (Fire TV)" and the Appstore
  details page.

**Not verified (Phase 5, real stick):**
- the real Fire OS WebView and the Amazon keyboard
- the remote's Menu key code
- 2-hour keep-awake
- stinger sound autoplay
- HDMI off/on
- the 5-minute stale reload
- a real QR connect from a partner's phone
- the keyboard fix on production (after deploy)

### 7. Open questions for Andrew

1. (Optional) Category: Entertainment (recommended) or Games → Trivia.

Answered 2026-11-22: the key backup is done (an encrypted image in iCloud Drive; §2), and the merge of PR #38 is OK'd.

Answered 2026-11-22: reviewer venue **Hightop Test Bar** / `J6NK` / `venue-hightop-test` is OK'd (`/tv/J6NK` resolves
to it); commit and PR: yes.

### 8. Recommended first steps for the next phase

1. If this branch isn't merged yet, merge and deploy it first. Then check `https://hightopchallenge.com/tv-app` and
   check that the focused code boxes open no keyboard on load.
2. Ask for the Fire Stick IP, check it says Fire OS, `adb connect <ip>:5555`, and install the **release** APK above.
3. Run the checklist with Andrew. Check the keyboard first: first open, OK on the boxes, typing `J6NK`, Back after
   the demo.
4. If a native fix is needed: rebuild the release, keep **versionCode 1** (nothing has been uploaded yet), and
   replace the file in `releases/fire-tv/`. Update the size and SHA-256 here.
5. **Model:** Phase 5 **Sonnet 5.5 / medium**, as the plan names. This session ran on **Opus 5.5** (Andrew switched
   the model himself).
