# Native App Store Plan — Phase 4b Handoff (in-app QR scanner, plus 4a.1 native picture share)

**Date:** 2026-10-09. **Phases:** 4a.1 and 4b of `docs/native-app-store-plan.md` (Sonnet 5.5).
**State:** built, committed locally, verified by tests, the production build, both shell builds and (for the
scanner) the Android emulator. **NOT pushed. NOT deployed. Not tried on a real phone.**

---

## Summary for Andrew (plain English)

**What changed.**
1. **Android can now share the story picture itself** (Phase 4a.1). Before, Android only got "Save image" plus
   "Share a link instead". Now the picture goes straight into the phone's share sheet (WhatsApp, Messages...). This
   needed the extra `@capacitor/filesystem` plugin you approved. iPhone is unchanged (it already worked).
2. **"Scan QR code" button** (Phase 4b) on the app's sign-in screen and on the venue list. It exists **only in the
   app** (not on the website, not in old app builds). The camera question appears only when someone taps it, never
   when the app opens. It accepts only our own links (`play.hightopchallenge.com` / `hightopchallenge.com`, the join
   page). Anything else says "That's not a Hightop code." and nothing opens. The app never opens a scanned link
   itself: for a venue link it builds its own address from the venue name in the code.
3. **What a scan does today:** the printed coaster QR is just `play.hightopchallenge.com` (no venue inside), so a scan
   of it says "That's the Hightop join code. Sign in ... to find your venue." A QR that names a venue
   (`...?v=<venue>`) opens that venue's join step, exactly like the phone's own Camera app does today. **No such
   venue-specific QR is printed anywhere yet** — the scanner is ready for them, and also satisfies Apple's "more than a
   website" review. Say so if you want a different result for the plain join code.
4. **Android now needs Android 8 or newer** (was 7). The scanner plugin requires it; Android 7 phones are well under
   2% of devices.

**Is it live?** No. Nothing is pushed or deployed.

**Can you still do a full code review of all the plan's work?** Yes. I tagged the commit just before the plan began:
`native-app-plan-base`. See "Reviewing everything" below. The work is in separate, named commits (one per phase).

**Needs you.**
1. **Decide when to push** the unpushed commits (2D+2E+3, 3B.1, 3B.2, 4a, 4a.1, 4b, docs). The website part must
   deploy before the app buttons show; then rebuild the shell. (Pushing to `main` deploys on Vercel — your call.)
2. **Device check** — rebuild and run the new section **I** of `docs/native-app-device-checklist.md` (and 3B.3).
   The one thing no emulator can prove: a real phone camera reading a real printed QR.
3. **Where else "Invite a friend" goes** — my recommendation for the next agent is below; veto or reorder it.

---

## Reviewing everything (for Andrew or a reviewing agent)

- Base tag `native-app-plan-base` = `77399f5`, the commit before Phase 1a+1b. **Everything the plan did** is
  `git diff native-app-plan-base..HEAD` (list: `git log --oneline native-app-plan-base..HEAD`).
- **Only what's still unpushed:** `git diff origin/main..HEAD` (origin/main is `858660c`, Phase 2C, until pushed).
  Once pushed, use the tag, not `origin/main`.
- One commit per phase, oldest first: `4849397` 1a+1b (legal pages, account deletion) · `f96c386` 2A (shell spike) ·
  `858660c` 2C (venue-list fix) · `4706072` 2D+2E+3 (fit screen, front door, production shell) · `1fb5a1f` 3B.1
  (player-only) · `772aa5a` 3B.2 (/info buttons) · `1aac107` 4a (share+haptics) · `92f6304` 4a.1 (Android picture
  share) · 4b scanner (see `git log`) · docs commit (this handoff).
- Do NOT push the tag unless asked (`git push origin native-app-plan-base` would publish it).
- To have an agent review it all, point it at that range ("review `git diff native-app-plan-base..HEAD`"). Suggested
  order: `lib/nativeApp.ts`, `proxy.ts` (3B.1 app-UA rewrite), `lib/playerAccountDeletion.ts` + migration
  `20261008044524` (1b — the riskiest, already deployed), then the rest. Note the Claude Code `/code-review` command
  reviews the *current* diff by default; for a historical range, give the agent the range above or review one phase
  commit at a time (`git show <sha>`). Don't rewrite history to make a review easier.

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md` (Native app bullets), `docs/native-app-store-plan.md`,
`docs/native-app-store-plan_PHASE_3_HANDOFF.md` (rebuild/run commands), `…_PHASE_4A_HANDOFF.md` and this file.

### 1. Next phase and scope
- **Next planned: 4c (Face ID passkeys, Opus 5.5 xhigh)** and **5 (push, Opus 5.5 high)** — both **need Andrew's paid
  Apple Developer account** (not yet approved as of this note). Don't start them without asking. Nothing in 4b blocks them.
- **Small unscheduled follow-up (call it 4d, Sonnet 5.5, low–medium): "Invite a friend" in more places.** Andrew asked
  me to say where. Recommended, in order — reuse `ShareLinkButton` + `INVITE_FRIEND_PAYLOAD` (`lib/nativeShare.ts`),
  never a new share path:
  1. **Venue home screen** (`components/venue/VenueHubClient.tsx`): one compact "Invite a friend" row near the top
     or under the games grid — the place a player lands every visit and the best moment to bring friends to the table.
  2. **After a win / results**, next to the existing story-share button (Live Trivia and Category Blitz final
     screens): "Share my win" already exists as the story; add "Invite a friend" beside it while the player is happy.
  3. **Leaderboard when few are playing** (an empty/short-board banner, like the Category Blitz solo banner).
  4. **Account drawer** (`components/navigation/AccountMenuList.tsx`): a quiet permanent row, last before Sign Out.
  Do NOT put it on the sign-in screens, in partner pages (`/owner/*`), or anywhere in `/tv`. Keep copy unchanged
  (`INVITE_FRIEND_PAYLOAD`); don't add analytics or a server call (cost rule: no new recurring cost).
  Add a contract-test line like the existing ones in `tests/native-share-haptics-contract.test.ts`.
- Out of scope for everything: any partner surface in the app (player-only, plan §2 item 12), purchase buttons,
  changing the permanent join QR URL.

### 2. Starting state
- Branch `main`, **ahead of `origin/main` by 7 commits (2D+2E+3, 3B.1, 3B.2, 4a, 4a.1, 4b, docs); nothing pushed.** Run `git log --oneline -12`
  and `git status`. No migrations, env vars, `vercel.json` or production data touched in 4a.1/4b.
- Untracked/ignored junk, **not ours, left alone**: `.vscode/settings.json`, and iCloud conflict copies
  (`native/ios/App/App/config 2.xml`, `.next/types/routes.d 2.ts`, `tests/* 2.ts`). `npx tsc --noEmit` reports exactly one
  error — `Duplicate identifier 'LayoutProps'` in `.next/types/routes.d 2.ts` — from that iCloud copy; it predates
  this work. Tell Andrew before deleting them. **Careful with `git add native` / `git add -A`:** it will stage
  `config 2.xml` (I caught and removed it from the 4b commit once).
- Local git tag created: `native-app-plan-base` (not pushed).

### 3. Decisions (don't re-ask)
- Andrew approved `@capacitor/filesystem` (this session) → Android picture share. iPhone keeps the web view's own share.
- QR plugin = `@capacitor/barcode-scanner@3.1.3` (official, OutSystems libs). Rejected `@capacitor-mlkit/barcode-scanning`:
  its iOS side has no `Package.swift`, and this project's iOS shell is Swift Package Manager (`CapApp-SPM`).
  Android uses the plugin's `zxing` option (no Google Play Services dependency, works on the emulator).
- Accepted hosts: `play.hightopchallenge.com`, `hightopchallenge.com` only (plan §4b); paths `/` and `/join` only; optional
  `?v=` must match `[A-Za-z0-9_-]{1,64}`. `www.` is deliberately NOT accepted — add it to `HIGHTOP_QR_HOSTS` if a
  printed `www.` QR ever exists.
- Raised Android `minSdkVersion` 24 → 26 (`native/android/variables.gradle`), required by the plugin.
- A plain join-code scan shows a message and stays put; only a venue-bearing code navigates (`router.push` of a
  path we build). Andrew can change this.

### 4. Files
- `lib/nativeApp.ts` — `NativeCapability` += `"Filesystem"`, `"CapacitorBarcodeScanner"`.
- `lib/nativeImageShare.ts` (4a.1) — `shareImageNatively`: Filesystem `writeFile` to `CACHE/hightop-share/<safe name>`, then
  Share `share({files:[uri]})`. Called only from `lib/socialShare/sharePipeline.ts` `shareStoryImage`, and only when the
  web view's `canShare` is false (Android). Outcomes `shared|canceled|failed|unavailable`.
- `lib/nativeQrScan.ts` (4b) — `parseHightopQr`, `joinPathForScan`, `scanQr`, `canScanQr`.
- `lib/useIsNativeApp.ts` — added `useHasNativeCapability(name)` (hydration-safe, like `useIsNativeApp`).
- `components/join/ScanQrButton.tsx` — the button; renders null unless the plugin exists; props `onVenueScanned`, `joinCodeMessage`.
- `components/join/JoinFlow.tsx` — `handleVenueQrScanned` + two `<ScanQrButton>` (auth-method-selection panel, below
  Create Account; venue-list panel, at the bottom).
- `native/` — `package.json`/lock, `ios/App/CapApp-SPM/Package.swift`, `Package.resolved`, Android gradle files +
  `AndroidManifest.xml` (`CAMERA`, optional camera feature) + `variables.gradle`. iOS `Info.plist` already had
  `NSCameraUsageDescription` ("...only to scan a venue's QR code...").
- Tests: `tests/native-image-share.test.ts` (8), `tests/native-qr-scan.test.ts` (12).
- Docs: `CLAUDE.md` Phase 4 bullet; `docs/native-app-device-checklist.md` section **I**.

### 5. Facts and traps
- Plugin errors arrive with `code` `OS-PLUG-BARC-0006` (player closed the scanner) and `...-0007` (camera refused), the same on
  iOS and Android (verified on Android in the emulator by reading the library's `OSBARCError`). Other codes → "failed".
- Android's library shows its OWN "Camera Access Not Enabled" dialog (Ok / Settings) after a refusal, then rejects 0007; our
  line "Camera access is off..." then shows in the page.
- `FileReader` doesn't exist in the Vitest (node) environment: that's why `blobToBase64` uses `arrayBuffer()`+`btoa` in slices.
- 4a handoff said `tsc` was clean; the 4a **test file** actually had two type errors (fixed in the 4a.1 commit). Always run
  `npx tsc --noEmit` and expect only the iCloud `routes.d 2.ts` error.
- The scanner activity is a separate Android Activity; app resume after it is a normal resume. Nothing else was tested around it.
- Emulator camera is a virtual scene — it can't read our QR without a custom scene image. Real decoding is unverified.
- Don't run typecheck and build together; never `git checkout -- <file>`; quote globs in zsh (`--include='*.tsx'`).

### 6. Build, run, verify
- Web: `npx tsc --noEmit` (only the iCloud error), `npm run lint` (clean), `npm run test` → **318 files passed / 1 skipped,
  3,646 tests passed / 13 skipped / 0 failed**, `npm run build` → success.
- Shells: `cd native && npx cap sync`. Android: `cd native/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`
  → BUILD SUCCESSFUL (APK in `~/Library/Caches/hightop-native/android/app/outputs/apk/debug/app-debug.apk`; `aapt2 dump permissions`
  shows `CAMERA`, minSdk 26). iOS: `xcodebuild -project native/ios/App/App.xcodeproj -scheme App -sdk iphonesimulator
  -configuration Debug -derivedDataPath ~/Library/Caches/hightop-native/ios-dd CODE_SIGNING_ALLOWED=NO build` → BUILD SUCCEEDED.
- Emulator proof (AVD `hightop_api36`, debug app, Chrome DevTools protocol over `adb forward` to `webview_devtools_remote_<pid>`):
  all four plugins report available; `scanBarcode` with the camera revoked → permission dialog **on the call** → "Don't allow" →
  rejects `OS-PLUG-BARC-0007`; after `pm grant` the scanner opens with our instruction line, flashlight and close button;
  close → rejects `OS-PLUG-BARC-0006`. (The deployed site has no button yet, so the page button itself was not exercised.)
- **NOT verified:** the button on screen (needs deploy), a real camera reading a real QR, iOS camera prompt/scanner on the
  simulator/iPhone, the Android picture share (Share sheet with the image), venue-link navigation after a scan.

### 7. Open questions for Andrew
Push/deploy timing · what a plain join-code scan should do (message today) · whether to accept `www.hightopchallenge.com` ·
approve the "Invite a friend" placement list (§1) · OK with Android 8+ minimum.

### 8. Recommended first steps
`git log --oneline -12`; `git status`. If Andrew has pushed and rebuilt: help with checklist **I**. If he asks for 4d: do it
(Sonnet 5.5, low–medium; reuse the existing button; one contract-test line; run `npm run test`, lint, tsc). For 4c/5: confirm the
paid Apple account exists first.
