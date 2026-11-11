# Share Your Win — Phase 3 handoff (the app's Instagram Story button sends the video)

**Date:** 2026-11-11 · **Plan:** `docs/share-win-celebration-plan.md` · **Phase done:** 3 of 4 · **Next:** release
this change (commit → web deploy → app build + store review → checklist §Q), and separately Phase 4 (the guide clip).

> **Superseded next step (2026-11-11):** a code review found 5 issues. **Do NOT make an app build from this code.**
> Do remedial Phases 3.1 and 3.2 first, then release as Phase 3.3 (plan §4, "Remedial Phases 3.1–3.3"). §8 below
> describes the old order.

## For Andrew (plain English)

- **What changed:** in the iPhone/Android app, when a guest makes an **Animated** Story and taps **Instagram
  Story**, Instagram now opens straight in its Story editor with the video. Before this, the video went through
  the phone's share sheet. Pictures work the same as before.
- **Is it live?** **No. It is built and tested, but not committed.** It goes live in two steps:
  1. **The website part** can be committed and deployed now. On its own it changes nothing for anyone: it waits
     for an app build that reports it can send a video.
  2. **The app part** needs a **new app build** sent to Apple and Google for review (the release runbook,
     `docs/native-app-release-runbook.md`). Guests get the one-tap video once they update the app. Until then,
     older app builds keep using the share sheet for videos. This was checked on purpose, so nobody gets a
     broken Story.
- **Cost:** none. The video is made on the guest's phone and passed straight to Instagram. Nothing new runs on our
  servers.
- **Needs you:**
  1. Say "commit" (and "push" if you want the web part deployed now).
  2. Make the new app build and upload it. Raise the build numbers first: iOS `CURRENT_PROJECT_VERSION` (currently 2)
     and Android `versionCode` (currently 2). Per the runbook, check each store console's highest number first.
  3. On the new build, run checklist **§Q** (items 84–88) in `docs/native-app-device-checklist.md` on an iPhone and
     an Android phone that have Instagram.

## For the next agent

### 1. Goal and scope

Phase 3 (done here): the native `InstagramStories` plugin also sends an MP4 as the Story background, and the web
side sends a video to it only when the installed build says it can. **Remaining release work:** commit, deploy,
native build + store submission, device check. **Out of scope:** Phase 4 (guide clip), app version/build-number
bumps (do them at upload time per the runbook), any change to how the video is made (Phase 2).

### 2. Starting state

- Branch `main`, last commit `f0374061` ("Share Your Win: celebration effects and Animated Story", already pushed).
  **All Phase 3 changes are uncommitted** in the working tree (13 files, listed in §4). Andrew has not asked for a
  commit yet.
- Not mine and left alone (untracked): `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.
- No migration, no data change, no env var, no Vercel change, no `npx cap sync` needed (the plugin files are
  already in the Xcode project and Gradle sources; `capacitor.config.json` is unchanged).
- App version stays 2.0.0, iOS build 2, Android versionCode 2. These were not bumped (runbook: bump at upload time,
  after checking the console counters).

### 3. Decisions made

- Andrew, 2026-11-11: "Execute phase 3" (the plan's §6 Q3 default was "later"; this is his go-ahead).
- Mine:
  - **One plugin method, not a new one.** `shareToStory` takes a new `mediaType: "image" | "video"` field. An older
    build ignores the field, so the web side must never send it a video. It never does, because:
  - **Capability by answer, not by plugin presence.** `isAvailable` now returns `{ available, video }`. A
    pre-Phase-3 build returns only `available`, so `video` reads false and the video goes to the share sheet.
  - **iOS `video` = `available`.** iOS can't tell in advance which pasteboard keys Instagram understands. Meta's doc
    lists the background video asset for current Instagram.
  - **Android `video`** = Instagram resolves an `ADD_TO_STORY` intent typed `video/mp4`. This is a real check.
  - The top/bottom colors are still sent with a video. Meta ignores them when there's a background asset, so this
    is harmless.
  - The failure hint for a video says "Tap More to share the video." (new `SHARE_DESTINATION_VIDEO_COPY["instagram-story"].directFailed`).
- Meta doc re-checked 2026-11-11
  (https://developers.facebook.com/docs/instagram-platform/sharing-to-stories/). Background video: H.264/H.265/WebM,
  up to 1080p and 20 s, under 50 MB recommended. Android uses the `ADD_TO_STORY` action with a content URI and needs
  the `source_application` App ID. Our video is 1080×1920, 5 s, H.264, about 2–4 MB, so it fits. Note that the page
  doesn't print the iOS key string. `com.instagram.sharedSticker.backgroundVideo` follows the documented
  `com.instagram.sharedSticker.*` pattern and is the long-standing key. **Confirm it on the iPhone (§Q item 84).**

### 4. Files changed

- `lib/nativeInstagramStories.ts`:
  - `canShareToInstagramStory()` → **`getInstagramStorySupport(): Promise<InstagramStorySupport>`**
    (`{ picture, video }`) + `NO_INSTAGRAM_STORY`.
  - `shareToInstagramStory(media, …)` adds `mediaType` from `media.type`.
  - Still exactly two `hasNativeCapability("InstagramStories")` calls (pinned by `tests/share-destinations.test.ts`).
- `lib/socialShare/shareDestinations.ts`: `ShareDestinationEnv.instagramStoryVideoDirect?`. Native for Instagram
  Story = `instagramStoryDirect && (!video || instagramStoryVideoDirect)`.
- `lib/socialShare/copyPresets.ts`: `SHARE_DESTINATION_VIDEO_COPY["instagram-story"].directFailed`.
- `components/social-share/StoryCaptureModal.tsx`:
  - State `instagramStory: InstagramStorySupport` replaces `instagramStoryDirect: boolean`, and is asked once per
    open, in the app only.
  - Passes both flags to the planner.
  - On a failed open it resets to `NO_INSTAGRAM_STORY`, with the video or the picture hint.
- `native/ios/App/App/InstagramStoriesPlugin.swift`:
  - `isAvailable` → `["available": a, "video": a]`.
  - `shareToStory` picks `backgroundVideo` or `backgroundImage` by `mediaType`.
  - It still writes ONE pasteboard item with the caption.
- `native/android/app/src/main/java/com/hightopchallenge/app/InstagramStoriesPlugin.java`:
  - Constants `PICTURE_FILE/TYPE` and `VIDEO_FILE/TYPE`.
  - `storyIntent(uri, mimeType, …)` and `instagramCanTakeStory(mimeType)`.
  - `isAvailable` adds `video`.
  - `shareToStory` writes `instagram-story.mp4` or `.png` in `cache/hightop-share/` and sends the matching type.
- Tests:
  - `tests/instagram-story-caption.test.ts` (+4): the `mediaType` field, support parsing (old/new build, no
    Instagram, bridge error) and native source pins.
  - `tests/share-celebration-video.test.ts`: the old-build rule (renamed) + a new Phase 3 planner test.
  - `tests/share-pictures-stability.test.ts` (+3 sheet tests): Phase 3 build → plugin gets the MP4; old build →
    share sheet; failure → video hint, then the share sheet.
  - `tests/share-sheet-taps.test.ts`: mock renamed only.
- Docs:
  - The plan (status, §3, §6 Q3, Phase 2 rule amended, new "Standing rules (Phase 3)").
  - `docs/native-app-store-plan.md` (9d standing-rule line).
  - `docs/native-app-device-checklist.md` §Q (84–88).

### 5. Facts and traps

- Android compile: `cd native/android && ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21
  ./gradlew :app:compileDebugJavaWithJavac --offline --console=plain`. It took about 9 s and wrote no files in the
  repo.
- iOS compile (unsigned, simulator): `cd native/ios/App && xcodebuild -project App.xcodeproj -scheme App
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath
  <scratchpad>/ios-dd CODE_SIGNING_ALLOWED=NO build`.
- The Instagram path can't be exercised on a simulator or emulator (no Instagram), so §Q on real phones is the
  only end-to-end check.
- The video crosses the Capacitor bridge as base64: about 3–5 MB of text for a 2–4 MB MP4. That is the same order
  as the Android Filesystem share Phase 2 already does. If a phone is slow or fails here, the fallback is to write
  the file through `Filesystem` and pass a path. That was not needed so far.
- `npm run lint` still trips on old `tmp/group-games-phase-4/release/…` files (not source). Lint source folders
  directly.

### 6. Verified

- `npx tsc --noEmit` ✓. Source lint ✓ (`npx eslint lib/nativeInstagramStories.ts lib/socialShare components/social-share`
  and the 4 test files).
- `npm run test` ✓: **522 files / 6,899 tests passed, 13 skipped**.
- `npm run build` ✓.
- Android `compileDebugJavaWithJavac` ✓ and iOS simulator `xcodebuild … build` ✓ (**BUILD SUCCEEDED**).
- **Not verified:**
  - on a real phone, Instagram accepting the video: the iOS key, the Android `video/mp4` intent, and how the
    Story editor frames a 1080×1920 video;
  - the base64 bridge time for a ~4 MB video;
  - the old-build fallback on an installed older build (covered by unit tests only).

  All of these are checklist §Q.

### 7. Open questions for Andrew

- Commit now? Push (deploy the web half) now? The web half is inert until the new app build is installed.
- When to cut the new app build. It can carry other pending native changes, such as the iOS Info.plist commit
  `4b4bbcdd` "for next build".

### 8. Recommended next steps

1. On Andrew's word: `git add` the 13 files above (not the untracked backfill log) and commit "Share Your Win
   Phase 3: Instagram Story button sends the animated video". Push if he says so.
2. Release the app by `docs/native-app-release-runbook.md`. **Opus 5.5, high**, per the plan table (native build,
   signing, store). Bump the build counters only after checking the consoles.
3. After the device check, record the §Q results in the checklist. If iOS Instagram ignores `backgroundVideo`, the
   web fix is to set `video: false` in `isAvailable` on iOS (Swift, rebuild). Until then, videos keep using the
   share sheet there.
4. Phase 4 (the guide clip) is independent: **Opus 5.5, medium**, per the plan table. It can show the share sheet
   path or this one-tap path.
