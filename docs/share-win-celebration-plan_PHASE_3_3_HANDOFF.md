# Share Your Win — Phase 3.3 handoff (release: commit, web deploy, app build 2.0.1)

## For Andrew (plain English)

> **Released 2026-11-11 on Andrew's word ("Release … can we just release the thing?"), full rollout, no staging,
> before §Q results were reported.** iOS 2.0.1 (3) submitted to App Review (submission
> `4eef4a13-fa56-4a0c-be28-4d147fc0be3e`, state WAITING_FOR_REVIEW, release type AFTER_APPROVAL = goes live on
> approval). Android code 3 promoted internal → production at 100% (status completed; Google review then live).
> If one-tap video misbehaves: `NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF` = `ios` / `android` / `all` + redeploy.


**What changed:** Phases 3, 3.1 and 3.2 (the app's Instagram Story button sends the Animated video) are committed and
the website is deployed. New app builds are made: **version 2.0.1**, iOS build **3**, Android code **3**.

**Is it live?**
- **Website: yes** (commit `b761190e`, Vercel production, Ready 2026-11-11). On its own it changes nothing visible:
  it waits for an app build that says it can send a video. Android app users' **More** button now saves the video
  in small pieces (Phase 3.2) — watch for "Couldn't share" reports on Android.
- **App: ready to test, not released (2026-11-11).** Both stores now run from `native/scripts/store-release.cjs`
  (runbook "Automated uploads and releases"):
  - iOS build 3 is **VALID** in App Store Connect. A TestFlight internal group **"Team"** (all builds) was created with
    the one App Store Connect user in it. Version **2.0.1** exists in **Prepare for Submission** with build 3 attached
    and What's New "Share your win to Instagram Stories as a video in one tap." **Not submitted.**
  - Android code 3 (2.0.1) is on **Internal testing**, status completed. Production is still code 2. **Not promoted.**
  - (iOS 2.0.0 is already live, so 2.0.1 was required.)

**Needs you (in order):**
1. Install both test builds: iPhone → TestFlight app (the invite email); Android → Play Console → Testing → Internal
   testing → Testers tab → make sure your email is on the list → copy the opt-in link and open it on the phone.
2. Run checklist **§Q items 84–89** (`docs/native-app-device-checklist.md`) and send the agent the results.
3. If item 84 fails on iPhone only: the agent sets `NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF=ios` and redeploys; release anyway.
4. Say "release": the agent runs `asc-submit --version 2.0.1` and `play-promote --code 3 --fraction 0.2` (staged 20%;
   say another % if you prefer), then raises the Android rollout after a few quiet days on your word.

**Cost:** none on the server.

---

## For the next agent

### 1. Goal and scope
Phase 3.3 is release work; the only code change is the version bump. Remaining: Andrew's uploads, §Q device check,
store release, and recording results. **Out of scope:** Phase 4 (guide clip, Opus 5.5 medium per the plan table);
moving pictures to file paths.

### 2. Starting state
- `main` at `b761190e` "Share Your Win Phase 3–3.2: one-tap Instagram Story video by file" — pushed, deployed
  (`https://hightop-challenge-g3le5gaae-andrewserulnecks-projects.vercel.app`, production, Ready).
- Version bump commit (see §4) — committed and pushed after the iOS archive succeeded.
- Untracked and unrelated, left alone: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.
- No migration, data change, cron or env var.

### 3. Decisions made
- Andrew (2026-11-11): "Execute phase 3.3, then commit, deploy and build the app."
- Andrew (2026-11-11): marketed version **2.0.1** (not 2.0.0), because iOS 2.0.0 build 2 (exported Nov 9) may already
  be approved/released, which closes 2.0.0 to new builds.
- One commit for 3–3.2 (they share files). iOS video switch starts **on** (env var unset).
- Used `npx cap copy` (not `cap sync`): only `capacitor.config.json` changed, no dependency changed, so no SPM/Gradle
  resolution was wanted.

### 4. Files changed in 3.3
- `native/package.json` `version` 2.0.1; `native/capacitor.config.json` both `appendUserAgent` → `HightopChallengeApp/2.0.1`;
  `native/ios/App/App.xcodeproj/project.pbxproj` both `MARKETING_VERSION = 2.0.1`, both `CURRENT_PROJECT_VERSION = 3`;
  `native/android/app/build.gradle` `versionCode 3`, `versionName "2.0.1"`. Generated (gitignored) copies in
  `native/ios/App/App/capacitor.config.json` and `native/android/app/src/main/assets/capacitor.config.json` updated by
  `npx cap copy`.
- Plan status line, this handoff.

### 5. Facts and traps
- Counters used before this: iOS builds 1 (1.0.0) and 2 (2.0.0); Android codes 1 and 2 (both 1.0.0). Android 2.0.0 was
  never built. Nobody checked the consoles in this session (no App Store Connect API key on this Mac); if an upload
  is refused for a used counter, bump to 4 and rebuild.
- `native/package-lock.json` still says `1.0.0` at its top (it said that at 2.0.0 too); harmless, left alone.
- Android release build: `cd native/android && ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21
  ./gradlew :app:bundleRelease --offline --console=plain` (22 s). Built manifest checked: `versionCode="3"`,
  `versionName="2.0.1"`.
- Auto mode needed the xcodebuild archive call resent verbatim once; no other permission issue.

### 6. Verified
- `npx tsc --noEmit` ✓; `npm run test` ✓ 522 files / 6,914 passed / 13 skipped; native contract tests ✓ (60).
- Web path of `StoryCaptureModal` unchanged by reading the diff (off-app the support state stays `NO_INSTAGRAM_STORY`,
  as before); no browser run (the changed code only runs inside the app).
- Live: `https://play.hightopchallenge.com/` and `https://hightopchallenge.com/info` → 200 after deploy.
- Android: signed `~/Downloads/Hightop-Challenge-2.0.1-3.aab`, `signatureVerified: true`, upload cert SHA-256
  `E4:1C:A0:44:…:EC:B4`, file SHA-256 `3dd46e50aad762a3870ffd01cf39ee66ae191ec1546f9a16609d5d1e200e6cec`.
- iOS: `ARCHIVE SUCCEEDED` → `~/Library/Caches/hightop-native/releases/Hightop-Challenge-2.0.1-3.xcarchive`; **uploaded to App Store Connect 2026-11-11 19:18 ET** (`-exportArchive` with `destination` upload → "Upload succeeded", processing);
  `EXPORT SUCCEEDED` (options plist per the runbook, `destination` export) →
  `~/Library/Caches/hightop-native/releases/ios-app-store-2.0.1-3/App.ipa`, copied to
  `~/Downloads/Hightop-Challenge-2.0.1-3.ipa`, SHA-256 `33b4f827bec57ce70676162f9519dd33509f6cdbe4a1ce577f4bef97d3fc899f`.
  Inspected: bundle `com.hightopchallenge.app`, 2.0.1 / 3, device families [1, 2], `codesign --verify --deep --strict`
  valid, Apple Distribution: Hightop Challenge LLC (2U7HMXGQM3), `get-task-allow` false, `aps-environment` production,
  associated domains `applinks:play.hightopchallenge.com` + `webcredentials:hightopchallenge.com`, location purpose
  string present (ITMS-90683 fix from `4b4bbcdd`), UA `HightopChallengeApp/2.0.1 (ios)`, binary contains
  `com.instagram.sharedSticker.backgroundVideo` and "Could not prepare the video." (the 3.2 plugin).
- **Unverified:** everything in §Q (device-only).

### 7. Open questions for Andrew
- §Q results (84–89) on both platforms.
- Rollout size for Play (staged %) and whether to use Apple phased release.

### 8. Next steps (Opus 5.5 high for anything native; Sonnet 5.5 medium just to record results)
0. Store state lives in the stores: check with `node native/scripts/store-release.cjs asc-status` and `play-status`
   before acting. Submit/promote only on Andrew's word after §Q passes.
1. When Andrew reports §Q: record results in the checklist table and the plan status.
2. If 84 fails on iPhone: `vercel env add NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF production` → `ios`, then redeploy
   (`NEXT_PUBLIC_*` is build-time). Android fail → value `android`; both → `all`.
3. After store release, update `docs/native-app-release-runbook.md` "Current launch state" with 2.0.1 / 3.
4. Phase 4 (guide clip) is independent.
