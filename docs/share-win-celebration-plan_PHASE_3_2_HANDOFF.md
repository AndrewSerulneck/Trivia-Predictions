# Share Your Win — Phase 3.2 handoff (the video crosses as a file; one video in the cache)

## For Andrew (plain English)

**What changed:** the app no longer squeezes a 4 MB video through as one giant block of text, which could crash
low-memory Android phones. The website now saves the video to the phone in small pieces, and the app's Instagram
button just gets told where the file is. The same fix covers the **More** button (the phone's share sheet), which is
live today. The phone keeps one video at most, not a new one after every share.

**Is it live?** No. Built and tested, **not committed, not deployed**, no app build made.

**What's left:** Phase 3.3 (release): commit Phases 3, 3.1 and 3.2, deploy the website, make the first Phase 3 app
build, then you run checklist §Q items 84–90 (`docs/native-app-device-checklist.md`) on TestFlight / Play internal
testing before releasing to the stores.

**Needs you:** say "commit" (and, separately, "deploy"). Deploying first is safe: the website treats every app build
made before this one as "no one-tap video" and uses the share sheet. **One thing to know:** once deployed, the
share-sheet change reaches Android app users right away (no app update), so watch for "Couldn't share" reports on
Android after the deploy.

**Cost:** none on the server. On the phone, per video share: 1 folder listing, ≤1 delete, ~6 small writes, 1 plugin call.

---

## For the next agent (Phase 3.3: release)

### 1. Goal and scope
- **3.3 goal:** the release steps in plan §4 "Phase 3.3": commit (on Andrew's word), deploy the web (on his word),
  make the app build by `docs/native-app-release-runbook.md`, and have Andrew run checklist §Q 84–90 before the store
  release. If item 84 fails on iPhone: `vercel env add NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF production` with value
  `ios`, redeploy, then release.
- **Out of scope:** moving **pictures** to file paths (they still cross as base64 `data`; every build since 9d reads it,
  ~1–2 MB). Phase 4 (the guide clip).

### 2. Starting state
- Branch `main` at `f0374061`. **Phases 3, 3.1 and 3.2 are all uncommitted** in the same working tree. **Never
  `git checkout`/`git restore` these files** — that wipes all three phases.
- Files modified (17): `components/social-share/StoryCaptureModal.tsx`, `docs/native-app-device-checklist.md`,
  `docs/native-app-store-plan.md`, `docs/share-win-celebration-plan.md`, `lib/nativeImageShare.ts` (new in 3.2),
  `lib/nativeInstagramStories.ts`, `lib/socialShare/copyPresets.ts`, `lib/socialShare/shareDestinations.ts`,
  `native/android/app/src/main/java/com/hightopchallenge/app/InstagramStoriesPlugin.java`,
  `native/ios/App/App/InstagramStoriesPlugin.swift`, `tests/instagram-story-caption.test.ts`,
  `tests/native-image-share.test.ts` (new in 3.2), `tests/share-celebration-video.test.ts`,
  `tests/share-destinations.test.ts`, `tests/share-pictures-stability.test.ts`, `tests/share-sheet-taps.test.ts`.
  Untracked handoffs: `docs/share-win-celebration-plan_PHASE_3_HANDOFF.md`, `…_PHASE_3_1_HANDOFF.md`, this file.
  (`docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json` is untracked and unrelated.)
- Separate commits are hard to split now: Phase 3, 3.1 and 3.2 all edit `lib/nativeInstagramStories.ts`, both plugins
  and the same tests. Suggest **one commit** "Share Your Win Phase 3–3.2: one-tap Instagram Story video by file" unless
  Andrew wants them split (then use `git add -p` with care, never checkout).
- No migration, no data change, no cron, no env var added. Nothing deployed. No app build made.

### 3. Decisions already made (don't re-ask)
- Andrew (2026-11-11): 3.1 and 3.2 go into the **first** Phase 3 app build; no build from the pre-3.2 code.
- iOS video switch starts **on** (`NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF` unset). No "No video?" hint on screen.
- Capability re-keyed `video` → **`videoFile`** so a Phase 3 TestFlight build (which expects base64) never gets a path.
- Pictures stay base64; only video moves to a path.

### 4. What changed in 3.2 and how it fits
- **`lib/nativeImageShare.ts`**
  - `writeShareFileNatively(blob, fileName): Promise<string | null>` — the one cache writer. `Filesystem.writeFile` for
    the first piece, `appendFile` for each later one; `directory: "CACHE"`, `path: "hightop-share/<safe name>"`, base64
    with **no `encoding`**. Pieces are `SHARE_FILE_PIECE_BYTES` = 786,432 (768 KiB, multiple of 3), read one at a time
    via `blob.slice` + `FileReader`. Returns the `uri` from `writeFile`, or null on any failure.
  - Before a `.mp4` write, `removeOtherVideos` does `readdir` and `deleteFile` on every other `.mp4` (case-insensitive;
    not the name being written; never pictures). All cleanup errors are swallowed.
  - `safeFileName` now shortens the stem, never the extension (it used to cut at 80 chars and could drop `.mp4`).
  - `shareImageNatively` now uses the writer (pictures and videos, one path).
- **`lib/nativeInstagramStories.ts`**
  - `getInstagramStorySupport` reads `videoFile` (not `video`) and also requires `hasNativeCapability("Filesystem")`;
    the 3.1 switch still applies.
  - `shareToInstagramStory(media, { caption, colors, fileName })`: a `video/*` blob is written with
    `writeShareFileNatively` (name forced to `.mp4`, default `hightop-story.mp4`), then the plugin gets
    `{ path, mediaType: "video", topColor, bottomColor, caption }` with **no `data`**. A failed write → `"failed"`.
    Pictures still send `data`.
- **`components/social-share/StoryCaptureModal.tsx`**: passes `fileName` (from `getStoryShareFileName`) to
  `shareToInstagramStory`, so More and Instagram Story reuse one cache file.
- **iOS `InstagramStoriesPlugin.swift`**: `isAvailable` → `["available": a, "videoFile": a]`. Video branch:
  `shareFolderFile(path)` accepts only a `file://` URL whose `resolvingSymlinksInPath().standardizedFileURL` path starts
  with `<Caches>/hightop-share/` (resolved the same way) and is an existing non-directory; reads it with
  `Data(contentsOf:)` on a background queue; then the shared `openStory` builds the ONE pasteboard item
  (`backgroundVideo` + colors + caption, 9f.2). Rejects "Could not prepare the video." otherwise. Picture branch unchanged.
- **Android `InstagramStoriesPlugin.java`**: `isAvailable` → `videoFile`. Video reads `path`; `shareFolderFile` requires
  scheme `file`, `getCanonicalPath()` under `new File(getCacheDir(), SHARE_FOLDER).getCanonicalPath() + File.separator`,
  and `isFile()`; then `FileProvider.getUriForFile` (covered by `<cache-path path=".">`). `VIDEO_FILE` and the video
  base64 write are gone. `catch (OutOfMemoryError)` around the picture decode + write → "Could not prepare the picture.".

### 5. Facts and traps
- **`appendFile` was checked before building (plan's gate).** Installed `@capacitor/filesystem` 8.1.4 (the only version
  ever in `native/package.json`, since Phase 4a.1, so every installed app build has it):
  - iOS: no `encoding` → `.byteBuffer(Data(base64…))` (`CAPPluginCall+Accelerators.swift`), and `IONFilesystemLib`
    2.0.0 `appendData` does `FileHandle.seekToEnd()` + `write(contentsOf:)` — raw bytes.
  - Android: no `encoding` → `IONFILEEncoding.Base64` (default); `ionfilesystem-android` 1.1.1 `saveFile` does
    `Base64.decode` then writes through `FileOutputStream(file, append = mode == APPEND)` (read from the bytecode with
    `javap -c`; no sources jar exists).
- `writeFile` returns `uri` = iOS `url.absoluteString` / Android `file://…`; `appendFile` returns nothing useful.
- `readdir` returns `{ files: [{ name, type, uri, … }] }`; the writer also accepts plain strings.
- iOS `resolvingSymlinksInPath` strips a leading `/private` when the result exists; both sides of the prefix check
  are resolved the same way, so `/var` vs `/private/var` can't cause a false reject. **Not yet seen on a device.**
- Rewriting the same name while Instagram may still read the previous copy is accepted (plan: "the next video
  write replaces it").
- The cleanup also removes `instagram-story.mp4` left behind by any Phase 3 test build.
- `tests/share-destinations.test.ts` pins exactly two `hasNativeCapability("InstagramStories")` calls in
  `lib/nativeInstagramStories.ts`; the new `hasNativeCapability("Filesystem")` doesn't count against it.
- `tests/native-image-share.test.ts` pins that `lib/nativeInstagramStories.ts` never calls `Filesystem` itself.
- Live effect on deploy: on Android the app's share sheet (`shareStoryImage` → `shareImageNatively`) now writes in
  pieces. iPhone keeps using the web view's own share (unchanged).

### 6. Build, run, test — what was verified
- `npx tsc --noEmit` ✓
- `npx eslint lib/nativeInstagramStories.ts lib/nativeImageShare.ts lib/socialShare components/social-share` + the 4
  changed share tests ✓ (full `npm run lint` trips on old `tmp/` files)
- `npm run test` ✓ — 522 files, 6,914 passed, 13 skipped
- `npm run build` ✓
- Android: `cd native/android && ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew
  :app:compileDebugJavaWithJavac --offline --console=plain` → BUILD SUCCESSFUL
- iOS: `cd native/ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator
  -destination 'generic/platform=iOS Simulator' -derivedDataPath <scratchpad>/ios-dd CODE_SIGNING_ALLOWED=NO build`
  → BUILD SUCCEEDED
- **Unverified (device only):** Instagram opening the video from the path on both platforms (§Q 84), the iOS path
  check on a real device, memory on a low-end Android (§Q 89), one `.mp4` in the cache (§Q 90).

### 7. Open questions for Andrew
- Commit as one commit or three? (Default: one; see §2.)
- Go-ahead to commit and to deploy.

### 8. Recommended first steps for Phase 3.3 (Opus 5.5, high)
1. Read plan §4 "Phase 3.3" and `docs/native-app-release-runbook.md`.
2. On Andrew's word, commit; on his word, deploy the web (`git push` → Vercel).
3. Check App Store Connect / Play Console for the current build numbers before bumping (iOS build 2 and Android
   versionCode 2 at the time of writing), then `npx cap sync` and make the builds per the runbook.
4. Hand Andrew §Q 84–90; act on item 84's result (env switch) before the store release.
