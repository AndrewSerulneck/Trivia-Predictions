# Share Your Win — Celebration Effects, Animated Story, and the Guide Clip

**Status (2026-11-11):** **Phases 1 and 2 are BUILT and shipped together** (website only; handoffs
`docs/share-win-celebration-plan_PHASE_1_HANDOFF.md`, `docs/share-win-celebration-plan_PHASE_2_HANDOFF.md`, which
has the commit and deploy state). Waiting on Andrew's phone check (`docs/native-app-device-checklist.md` §P).
**Phases 3–3.2 are committed (`b761190e`) and deployed (web).** **Phase 3.3:** app 2.0.1 built (iOS build 3,
Android code 3), signed, on TestFlight and Play internal testing; **released 2026-11-11**: iOS in App Review, Android production 100% (handoff `docs/share-win-celebration-plan_PHASE_3_3_HANDOFF.md`).
**Next:** §Q 84–89 on the store builds; flip `NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF` if one-tap video fails.
**Phase 4 (guide clip): rendered 2026-11-11**, 44 s, `Guest Share Celebration clip 16x9/9x16.mp4`; waiting on Andrew's
review (handoff `docs/share-win-celebration-plan_PHASE_4_HANDOFF.md`).

## 1. Summary for Andrew

When a guest wins, the app offers a "Share Your Win" picture. The Subscribe and Setup Guide shows the real one:
a flat purple card ("Spotlight") with the win line, the stats and the bar's panel. The other two designs, "Card"
and "Night", are just as plain. The app already has a **"Take a selfie instead"** button (front camera, framed
with the win line and the bar's panel), but the video never shows it.

This plan:

1. **Phase 1:** adds four celebration effects to the share pictures: **Fireworks, Lasers, Confetti and Clapping
   hands**. **The guest chooses which ones to add** with toggle chips on the share sheet, so a picture never gets
   effects nobody asked for. They work on every design, the selfie, Story and Post, and every game and prize.
   Website only, so no app rebuild is needed.
2. **Phase 2:** adds a **Still / Animated** choice. Animated makes a short video Story (about 5 s) where the chosen
   effects move. The phone makes it, the same way the partner Make Reel does. Silent (Andrew adds his own sound
   in the guide video). Website only.
3. **Phase 3 (optional):** lets the iPhone/Android app's one-tap "Instagram Story" button send the video too. This
   needs an app rebuild and store review. Until then, in the app an animated Story goes through the phone's
   normal share sheet, which includes Instagram.
   **Fixes before that app build (Phases 3.1–3.3, from a code review):** a failed video no longer switches off the
   one-tap picture too. The video goes to the app as a file in small pieces, not as one huge block of text, which
   could crash low-memory Android phones (this also helps the share sheet today). The phone's cache keeps one
   video at most, not one more after every share. A website switch can turn off one-tap video on iPhone (or
   Android) with a redeploy, without an app update, in case Instagram ignores the video. It starts **on**.
4. **Phase 4:** makes **one replacement clip** for the guide's guest-share scene (v3 at 3:28.8, about 24 s). A guest
   wins Live Trivia, the fireworks play, they toggle effects on the new picture, then tap "Take a selfie instead"
   and pose with a peace sign (an AI-generated guest, shown through the app's real camera screen). The selfie is
   framed and posted to their Instagram Story. It comes as 16x9 + 9x16 to slice into v3 (not a full re-render).

**Cost:** none recurring. Pictures and videos are made on the guest's phone and are never uploaded to our servers.
There's no new request, cron, table or paid API. A 5 s animated Story is about 4 MB, made on the phone.

## 2. Model and effort per phase

| Phase | What | Model | Effort | Why |
|---|---|---|---|---|
| 1 | Effects engine + effect chips (still pictures) | Opus 5.5 | high | Shared renderer (`storyCanvas.ts`, `shareDesigns.ts`) used by every game, prize and the partner Reel; share-sheet state |
| 2 | Animated Story (MP4 on the phone) | Opus 5.5 | high | New encode + share path across web, iPhone and Android fallbacks |
| 3 | Native Instagram Story video (optional) | Opus 5.5 | high | Swift + Java plugin change, app rebuild, store review |
| 3.1 | Review fixes, web only (findings 1, 3, 4) | Sonnet 5.5 | medium | Small, fully specified change to the planner, sheet state and one env switch, with tests; no native code |
| 3.2 | Video crosses as a file; one video in the cache (findings 2, 5) | Opus 5.5 | high | Web + Swift + Java protocol change, a file-path security check, memory on low-end Android; both platforms must compile |
| 3.3 | Release: commit, deploy, app build, §Q | Opus 5.5 | high | Native build, signing, store submission (same as the Phase 3 handoff's release step) |
| 4 | Guide replacement clip | Opus 5.5 | medium | Capture pipeline with known traps + creative judgment; not app code, so medium |

## 3. Decisions already made (Andrew, 2026-11-11)

- **Upgrade the real app first, then film the clip from it.** The guide must not show a picture the app can't make.
- **Effects:** Fireworks bursts, Laser light beams, Confetti, Clapping hands (drawn vector art, never an emoji or a logo).
- **Guests pick the effects** ("I don't want to force too many effects into one photo or reel"). Toggle chips, any
  combination, on the still picture AND the animated Story.
- **Offer both still and animated.**
- **The selfie in the clip is an AI-generated person** (a fictional guest, peace sign / "cool" pose).
- **Clip only**, sliced into the current **v3** guide (`Subscribe and Setup Guide v3 *.mp4`, source
  `tutorial.html` = v3). Not a full re-render.
- **§6 answers (Andrew, 2026-11-11):** (1) effects **all off** when the sheet opens; (2) the Animated Story gets a
  **short crowd cheer** (not silent); (3) Phase 3 **later**; (4) the guide clip **waits for Phase 2**.
- **Phase 3 now (Andrew, 2026-11-11):** "Execute phase 3" — the app's one-tap Instagram Story button sends the
  video too.
- **Changed by Andrew before Phase 2 (2026-11-11):** the Animated Story is **silent** — no crowd cheer ("I'll find
  one myself and put it in the video"). **No effect-usage tracking** (no migration). **Ship Phase 1 together with
  Phase 2.**
- **Code-review fixes (Andrew, 2026-11-11):** (1) **fix first:** Phases 3.1 and 3.2 go into the FIRST Phase 3 app
  build. No build is made from the current Phase 3 code. (2) **iOS video switch starts ON:** one-tap video works
  as soon as the new build is installed. If the phone check (§Q) fails, Andrew switches it off and redeploys
  before releasing the build to the store. **No extra "No video?" hint** on screen.

## 4. Phases

### Phase 1: Effects engine and effect chips (still pictures)

**Goal:** a guest can turn Fireworks / Lasers / Confetti / Clapping hands on or off on any share picture.

**In scope**
- `lib/socialShare/celebrationEffects.ts` (new): `type CelebrationEffect = "fireworks" | "lasers" | "confetti" |
  "clapping"`, `CELEBRATION_EFFECT_ORDER`, labels (on-screen words in `copyPresets.ts`), and one pure function per
  effect that returns `StoryShapeBlock`s (plus paths if the renderer needs a new block kind) for a design + size +
  `t` (time in seconds; Phase 1 always passes the "hero" still moment). Seeded randomness only (`seededRandom` style).
  The same input always gives the same picture: `tests/share-pictures-stability.test.ts` must stay green.
- `buildShareDesignSpec(prepared, design, size, { effects })`: effects are drawn **in reserved zones**, never over
  the headline, the stats, the venue panel or the QR, and on the selfie never inside `faceSafeZoneHint`. Layer
  order: background, then lasers (behind), then the design, then fireworks/confetti, then text and panel, then clapping hands.
  Any combination of the four must stay readable. Test every one of the 16 combinations on every design and both sizes.
- If `storyCanvas.ts` needs new primitives (arcs, rotated polygons, radial gradients, additive glow for lasers),
  add them as new block kinds in `contracts.ts`. The renderer stays the one renderer. Check that the partner Reel
  (`lib/promo/promoReelRender.ts`), which shares the block drawer, is unaffected.
- `StoryCaptureModal.tsx`: a row of four toggle chips under the design thumbnails, for ready-made designs and the
  selfie. Default **all off** (the plain picture is today's picture) unless Andrew picks a default in §6. Thumbnails
  and the big preview redraw with the choice (`useSharePictures.ts`: effects are part of the cache key, so there
  are no redraw loops; see the 9f.3 rules in `docs/native-app-store-plan.md`).
  Optionally remember the last choice in localStorage (wrapped in try/catch, zero requests).
- The selfie frame: effects draw over the photo at Story and Post size. The existing PNG frames in
  `public/story-frames/*` stay.
- Copy: chip labels only ("Fireworks", "Lasers", "Confetti", "Clapping"). No helper text (CLAUDE.md copy rule).
- Visual check: extend `npm run share-card:render -- --sheet` to render each effect alone, plus all four, for every
  design and size.

**Out of scope:** animation, native changes, analytics schema changes (no migration; if Andrew wants to know which
effects get used, add them to an existing analytics payload field only if one already accepts free JSON. Otherwise
leave it as an open question).

**Rules to keep** (from `docs/native-app-store-plan.md` "Share pictures v2" + 9d/9e/9f, and `tests/share-designs.test.ts`):
canvas text ≥ 34 px (`STORY_TEXT_FLOOR_PX`), Story safe zones (top 250 / bottom 340), every design still carries
the bar + QR, the headline only via `shareWinHeadline`, no layout branches on a game id (effects are generic, and a
per-game tint comes from the registry colours in `shareGames.ts`), "Prize", never "Reward", one sheet
(`StoryCaptureModal`, never forked), and the clipboard write still starts inside the tap.

**Gates:** `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not at the same time as tsc),
`npm run share-card:render -- --sheet`, then look at the sheet. Browser-check the share sheet in a scratchpad clone
with mocked routes (the `/verify` skill covers Live Trivia).

### Phase 2: Animated Story

**Goal:** a "Still / Animated" switch on the share sheet. Animated = a ~5 s 1080×1920 MP4 (30 fps) where the chosen
effects move: fireworks launch and burst, lasers sweep, confetti falls, hands clap. The text, panel and QR stay still
and readable the whole time, and the last 1.5 s holds the full picture.

- `lib/socialShare/celebrationVideo.ts` (new): reuses mediabunny the way `encodeReel` does (`lib/promo/promoReelRender.ts`)
  and `canMakeReel` (`lib/promo/promoReelSupport.ts`) for the capability check. No support → hide "Animated" (never
  WebM, the same rule as the Reel). Draws frames with the Phase 1 spec builder at `t`. Lazy-imports mediabunny only
  when Animated is picked.
- Story size only (Instagram/Facebook Stories). Post stays a still picture. The selfie can be animated: the photo
  stays still and the effects move over it.
- Sound: **none** (Andrew changed §6 answer 2 on 2026-11-11). The MP4 has no audio track, so the capability check
  is the video half of `canMakeReel` (`canEncodeStoryVideo`).
- Share: `sharePipeline.ts` / `planShareDestination` must handle a `video/mp4` file. Web Share with files on iPhone
  Safari and Android Chrome; "Save" fallback; in the app, the Instagram Story button falls back to the system share
  sheet for a video until Phase 3. Copy caption + link keeps working.
- Progress while making it ("Making your Story…" + bar, cancel), the same pattern as Make Reel.
- **Gates:** as Phase 1, plus a real iPhone and Android check by Andrew (add a section to
  `docs/native-app-device-checklist.md`).

### Phase 3 (optional): the app's Instagram Story button sends the video

- iOS `InstagramStoriesPlugin.swift`: `com.instagram.sharedSticker.backgroundVideo`. Android `InstagramStoriesPlugin.java`:
  `ADD_TO_STORY` with a `video/mp4` content URI. Web side `lib/nativeInstagramStories.ts` capability-checks it, so
  old builds keep using the share sheet.
- Needs an app rebuild + App Store / Play review. Follow `docs/native-app-store-plan.md` standing rules.
- Waits on Andrew deciding it's worth a build.

### Remedial Phases 3.1–3.3: code-review fixes before the Phase 3 app build (added 2026-11-11)

A `/code-review` of the uncommitted Phase 3 tree (2026-11-11) found 5 issues. None of them crashes the website, and
the web half is still inert until an app build answers `video`. Andrew decided (§3): fix them all **before** the first
Phase 3 app build. The iOS video switch starts **on**.

**Starting state for 3.1:** branch `main` at `f0374061`, with the 13 Phase 3 files uncommitted (list in the Phase 3
handoff §4). **Never `git checkout`/`git restore` those files**; that wipes Phase 3. Commit only on Andrew's word.
Suggested commits are separate ones: Phase 3 as-is, then 3.1, then 3.2. No migration, no data change, no cron.

**The five findings and where each is fixed:**

| # | Finding | Fixed in |
|---|---|---|
| 1 | A failed video open sets `NO_INSTAGRAM_STORY`, so the one-tap **picture** is switched off too (`StoryCaptureModal.tsx:573`) | 3.1 |
| 2 | The whole MP4 crosses the bridge as one base64 string: about 5.4 MB of text, several copies, ~25 MB peak in the Android Java heap (`nativeInstagramStories.ts:68`). The same is true of the Phase 2 share-sheet path (`nativeImageShare.ts` `writeFile`), which is **live today** for Android app users | 3.2 |
| 3 | `videoCopy` returns `directFailed` but the planner never uses it; the sheet picks the failure wording itself (`shareDestinations.ts:58`, `StoryCaptureModal.tsx:574`) | 3.1 |
| 4 | iOS `isAvailable` says `video: true` whenever Instagram is installed; if Instagram ignores `backgroundVideo`, JS still gets "opened" and the guest is stuck on an empty Story (`InstagramStoriesPlugin.swift:36`) | 3.1 (web switch) |
| 5 | Android writes the video to a second cache file (`instagram-story.mp4`, ~4 MB) next to the PNG, and nothing ever replaces or deletes it (`InstagramStoriesPlugin.java:93`) | 3.2 |

#### Phase 3.1: web-only fixes (findings 1, 3, 4)

**Goal:** a failed video keeps the one-tap picture working, the planner owns all the failure wording, and a
website switch can turn off one-tap video per platform. No native change, so it's safe to deploy alone.

1. **Failure keeps what still works (finding 1).** In `pickDestination` (`StoryCaptureModal.tsx`, the
   `instagram-story-native` branch):
   - outcome `"unavailable"` (Instagram removed) → `setInstagramStory(NO_INSTAGRAM_STORY)` (as today);
   - outcome `"failed"` while sharing a **video** → `setInstagramStory((s) => ({ ...s, video: false }))`, so the
     still picture keeps its one-tap path;
   - outcome `"failed"` while sharing a **picture** → `NO_INSTAGRAM_STORY` (as today; if the picture fails, the
     video would too).
2. **The planner owns the failure wording (finding 3).** `ShareDestinationPlan` gains `failHint?: string`. The
   `instagram-story-native` plan sets `failHint: copy.directFailed` (the merged copy already picks the video wording).
   The sheet uses `plan.failHint` and drops its own `animated ? … : …` choice and the
   `SHARE_DESTINATION_VIDEO_COPY` import, if nothing else uses it. Make `directFailed` required on the Instagram
   Story copy type so a missing string is a type error, not a blank hint.
3. **Website switch for one-tap video (finding 4).** Env var **`NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF`**: a
   comma list of platforms (`ios`, `android`, `ios,android`). **Unset or empty = video one-tap ON everywhere**
   (Andrew's answer). Read it in ONE pure helper in `lib/nativeInstagramStories.ts`, for example
   `instagramStoryVideoOff(platform, raw = process.env.NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF)`, written as a literal
   `process.env.NEXT_PUBLIC_…` read so Next inlines it. `getInstagramStorySupport()` returns `video: false` when the
   switch names `nativePlatform()`. Picture one-tap is never affected. Don't add the var to Vercel now (unset =
   on). Write the off/on steps into the Standing rules below: `vercel env add NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF
   production` with value `ios`, then redeploy. To turn it back on, set it to `none`, because agents are denied
   `vercel env rm`.
   - No extra on-screen hint (Andrew: no "No video?" copy).
   - Keep the two `hasNativeCapability("InstagramStories")` calls (pinned by `tests/share-destinations.test.ts:150`).
4. **Tests:**
   - `tests/share-pictures-stability.test.ts`: a failed video → the next **Still** tap on Instagram Story still calls
     the plugin with a PNG; `"unavailable"` → both drop.
   - `tests/share-destinations.test.ts`: the native plan carries `failHint`, with picture and video wording; every
     `toEqual` on a native plan gains the field.
   - `tests/instagram-story-caption.test.ts`: the switch helper's truth table (unset, empty, `none`, `ios`,
     `android`, `ios,android`, spaces and case), and `getInstagramStorySupport` → `video: false` on the named
     platform with `picture` unchanged.
5. **Docs:**
   - Amend "Standing rules (Phase 3)": change "A failed open drops both" to the new rule, and add the switch.
   - Write the 3.1 handoff (short form is fine: `docs/share-win-celebration-plan_PHASE_3_1_HANDOFF.md`).

**Gates:** `npx tsc --noEmit`; source lint (`npx eslint lib/nativeInstagramStories.ts lib/socialShare
components/social-share` plus the changed tests; full `npm run lint` trips on old `tmp/` files); `npm run test`;
`npm run build`. Never run tsc and build together.

#### Phase 3.2: the video crosses as a file; the cache keeps one video (findings 2, 5)

**Status: DONE 2026-11-11, uncommitted** (handoff `docs/share-win-celebration-plan_PHASE_3_2_HANDOFF.md`).

**Goal:** the MP4 never crosses the bridge as one string. The web writes it to the app cache in pieces with
`@capacitor/filesystem`, which every app build since 4a.1 has. It hands the plugin only the file's URI, and keeps
at most one video in `hightop-share/`. The plugin no longer writes its own video copy.

1. **One chunked cache writer (web).** In `lib/nativeImageShare.ts`, add `writeShareFileNatively(blob, fileName):
   Promise<string | null>` (returns the `file://` URI, or null):
   - The first piece goes with `Filesystem.writeFile`, every later piece with `Filesystem.appendFile`. All go to
     `directory: "CACHE"`, `path: "hightop-share/<safeFileName>"`, as base64 with no `encoding`.
   - **Piece size is a multiple of 3 bytes** (768 KiB = 786,432), so each piece's base64 stands alone with no
     padding mid-file.
   - Read each piece with `blob.slice` + `FileReader`, so only one piece is in memory as text at a time.
   - **Before writing a `.mp4`**, `Filesystem.readdir` the folder and `deleteFile` every other `.mp4` in it. The
     cache then never holds more than one video. Never delete the file just shared: the receiving app may still be
     reading it, and the next video write replaces it. Errors from the cleanup are ignored, never fatal.
   - `shareImageNatively` uses the writer, which fixes the live Phase 2 share-sheet video path on every existing
     app build, with no rebuild. Pictures go through it too: one code path.
2. **Instagram video by path (web).** In `shareToInstagramStory`, a `video/*` blob is written with
   `writeShareFileNatively`:
   - Use the story's own file name (add `fileName` to `InstagramStoryOptions`; the sheet already has it from
     `getStoryShareFileName`), so the share-sheet path and the one-tap path reuse one file.
   - Then call `shareToStory({ mediaType: "video", path: uri, topColor, bottomColor, caption })` with **no `data`**.
   - A failed write → `"failed"`.
   - Pictures keep sending `data` as today. That works on every build since 9d, and a PNG is ~1–2 MB. Moving pictures
     to paths is out of scope.
3. **Re-key the capability so no pre-3.2 build gets a path (web + native).** `isAvailable` answers
   **`videoFile: true`** instead of `video`, and `getInstagramStorySupport` reads `videoFile`, not `video`. A
   Phase 3 build made from the current code (any TestFlight/internal test build) then reads as "no video" and uses
   the share sheet; it never receives a path it can't open. Video support also needs
   `hasNativeCapability("Filesystem")`. The 3.1 switch still applies.
4. **iOS plugin** (`InstagramStoriesPlugin.swift`):
   - For `mediaType == "video"`, read `path`, not `data`. Accept only a file URL whose resolved path
     (`resolvingSymlinksInPath().standardizedFileURL`) is inside `<cachesDirectory>/hightop-share/`; otherwise
     reject "Could not prepare the video.".
   - Load it with `Data(contentsOf:)` off the main thread, then the same ONE pasteboard item under
     `backgroundVideo`, with the caption (9f.2 unchanged).
   - The picture branch is unchanged.
   - `isAvailable` → `["available": a, "videoFile": a]`.
5. **Android plugin** (`InstagramStoriesPlugin.java`):
   - For video, read `path`, turn it into a `File` (`Uri.parse(path).getPath()`), and require
     `file.getCanonicalPath()` to start with `new File(getCacheDir(), SHARE_FOLDER).getCanonicalPath() +
     File.separator` and the file to exist. Then use `FileProvider.getUriForFile` (already covered by
     `<cache-path path=".">`).
   - **Delete `VIDEO_FILE`** and the video base64 write. The plugin writes only `instagram-story.png`, as before
     Phase 3.
   - `isAvailable` → `videoFile` (the `video/mp4` resolve check stays).
   - Also catch `OutOfMemoryError` around the picture's `Base64.decode` + write, and reject "Could not prepare the
     picture.". Today an OOM there is an uncaught `Error` that crashes the app. It does NOT produce the "Could not
     prepare…" rejection the review assumed.
6. **Tests:**
   - `tests/native-image-share.test.ts`:
     - a 2 MB blob → one `writeFile` + `appendFile` calls;
     - every piece except the last is 786,432 bytes, and the decoded pieces join back into the original bytes;
     - a video write first deletes other `.mp4` files only (not `.png`, not its own name);
     - a failed cleanup still writes;
     - a failed write → `"failed"`.
   - `tests/instagram-story-caption.test.ts`:
     - a video call sends `path` and no `data`;
     - a picture still sends `data`;
     - `videoFile` parsing: an old build, a pre-3.2 Phase 3 build answering only `video`, a 3.2 build, and no
       Filesystem;
     - source pins: Swift and Java check the `hightop-share` prefix, Java has no `instagram-story.mp4`, and Java
       catches `OutOfMemoryError`.
   - Update the Phase 3 sheet tests in `tests/share-pictures-stability.test.ts` for the new call shape.
7. **Docs:**
   - Replace the Phase 3 standing rule's "Android writes `instagram-story.mp4`" with the rules below.
   - Add to checklist §Q:
     - **89:** on an Android phone, share an Animated Story 3 times in a row, alternating Instagram Story and
       More: no crash and no long freeze.
     - **90:** on the same phone, `adb shell run-as com.hightopchallenge.app ls -la cache/hightop-share` shows at
       most one `.mp4`. This one is for a developer; Andrew can skip it.
   - Update `docs/native-app-store-plan.md` 9d's standing-rule line.
   - Write the full 3.2 handoff.

**Gates:** as 3.1, plus:
- Android: `cd native/android && ANDROID_HOME=~/Library/Android/sdk JAVA_HOME=/opt/homebrew/opt/openjdk@21
  ./gradlew :app:compileDebugJavaWithJavac --offline --console=plain`
- iOS (unsigned simulator build): `cd native/ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration
  Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath <scratchpad>/ios-dd
  CODE_SIGNING_ALLOWED=NO build`
- **Check before building:** that `appendFile` with base64 data and no `encoding` appends raw bytes on BOTH
  platforms in the installed `@capacitor/filesystem` (8.1.x; iOS `FilesystemOperationExecutor.swift`
  `appendData`). If one platform doesn't, stop and report it; don't switch to a different design without Andrew.

**Cost:** nothing on the server. Per video share on the phone: 1 `readdir`, ≤1 `deleteFile`, ~6 write calls of
≤1 MB each, 1 plugin call. Peak memory on the bridge falls from ~25 MB to ~1–2 MB per piece. iOS still holds the 4 MB
`Data` once for the pasteboard.

#### Phase 3.3: release

The Phase 3 handoff's release steps, now covering 3, 3.1 and 3.2 together:
1. Commit on Andrew's word.
2. Deploy the web on his word. This is safe: the web treats every build before 3.2 as "no video".
3. Make the app build by `docs/native-app-release-runbook.md`. Bump the build counters only after checking the
   consoles (iOS build 2 and Android versionCode 2 at the time of writing).
4. Andrew runs checklist §Q items 84–90 on TestFlight / internal testing **before** the store release. If item 84
   fails on iPhone, set `NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF=ios` and redeploy, then release. Videos then use the
   share sheet on iPhone.

### Phase 4: the guide replacement clip

**Goal:** one clip, 16x9 + 9x16 (60 fps, navy background, silent), to replace v3's guest-share scene (3:28.8 →
about 3:52.4). Pace it slower than feels natural, because Andrew reads a voiceover over it. Expected length about
35–40 s (longer than the old 24 s scene, because it adds effects + selfie). Ship it under a NEW file name (CapCut
caches by name), e.g. `Subscribe and Setup Guide/Guest Share Celebration clip 16x9.mp4` and `… 9x16.mp4`.

**Story beats** (keep v3's opening captions so it slices in cleanly):
1. Live Trivia answer → CORRECT → the app's real champion fireworks → "CONGRATULATIONS" (reuse the existing
   `p-trivia-*` captures if the screens haven't changed).
2. "Create story" → the Share Your Win sheet (new capture) → the hand taps **Fireworks**, then **Lasers**: the
   picture lights up. Optionally flip **Animated** and show it moving (only if Phase 2 has shipped).
3. Callouts as in v3: YOUR BUSINESS NAME / YOUR ADDRESS / YOUR SOCIAL HANDLE.
4. Hand taps **"Take a selfie instead"** → the real camera screen with the AI guest doing a peace sign → capture → the
   framed selfie with the win line and the bar's panel (+ an effect toggled on).
5. Share → Instagram Story (illustration, as in v3, with @JOESBARANDGRILL + location stickers) → likes climb.
   Captions: "WHEN GUESTS WIN…", "THE APP PROMPTS THEM TO POST IT", "THEY PICK THE CELEBRATION", "OR SNAP A
   SELFIE", "AUTOMATICALLY TAGGED WITH YOUR BAR", "INSTANT FREE PUBLICITY". The wording is Andrew's call.
   Give him a timing table for his voiceover.

**How (see the folder README + memory notes):**
- Source lives in `~/Documents/Hightop Challenge Advertising/_Source (to remake clips)/`. Write a NEW page
  `guest-share-clip.html` copying the helpers from `tutorial.html` (`sceneGuest`, `igStory`, `phoneAt`, `handOn`,
  `callout`, `captions`). Don't edit `tutorial.html` (v3 stays the current cut). Render with `render-stream.cjs`
  (6 renderers) + `encode-stream` (H.264, `AVVideoAllowFrameReorderingKey: false`; check with `inspect.swift`).
- Screens: build the repo (main, after Phase 1/2 is merged) in a scratchpad clone with NO `.env.local` on port 3102
  (`NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED=1 NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1 npx next build && npx next start -p 3102`;
  `cp -Rc` to clone, anchored rsync excludes). Extend `tutorial-player-capture.cjs trivia` to capture the sheet with
  each effect state and the selfie flow. The bar is **Joe's Bar and Grill** (rename `venue-uptown` in
  `lib/defaultVenues.ts` in the scratch copy only). **Never "General Saloon".** Share bar details come from localStorage
  `htc_share_venue_v3` (savedAt within 10 min of the fixed clock).
- AI selfie: generate a fictional guest (adult, at a bar, front-camera arm's-length angle, peace sign, smiling,
  portrait 9:16, no real brands/logos/signage, nobody recognisable) with the Canva `generate-image` tool. Show Andrew
  2–3 options before rendering.
- Feed it into the REAL camera screen: launch Chromium with `--use-fake-ui-for-media-stream
  --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file>.y4m`. There's no ffmpeg on the Mac, so
  write a tiny Node script that writes a Y4M (4:2:0) from the PNG's pixels. Mind the mirror: the preview mirrors
  (`mirrorPreview`), the saved picture doesn't.
- Fireworks/lasers animating on the sheet: capture frame by frame with `context.clock.install` + `pauseAt` +
  `runFor(1000/30)` (the same trick as the v2 fireworks).
- Add the clip to the folder README (Subscribe and Setup Guide row + timing table), and update the memory note.

## 5. Facts and traps (found while planning)

- Share code: `components/social-share/StoryCaptureModal.tsx` (one sheet), `useSharePictures.ts`,
  `lib/socialShare/shareDesigns.ts` (`spotlight`, `card`, `night`, `selfie`; `readyMadeDesignsFor`: a prize leads
  with Card), `storyCanvas.ts` (one renderer), `storyPayloads.ts` (`faceSafeZoneHint`), `shareGames.ts` (game
  registry; only Live Trivia and Category Blitz have selfie frames), `storyAssets.ts`.
- The selfie is `design = "selfie"`: a photo + the PNG frame (Story only) + top/bottom gradients + the win line + the panel.
- Partner Reel encoding: `lib/promo/promoReelRender.ts` `encodeReel` (mediabunny 1.61.6, `@mediabunny/aac-encoder`
  fallback), `promoReelSupport.ts` `canMakeReel`.
- The native Instagram Story plugin currently sends `backgroundImage` only (`native/ios/App/App/InstagramStoriesPlugin.swift:50`).
- The guide's guest scene is `sceneGuest` in `_Source (to remake clips)/tutorial.html` (story-time 28 s ÷ `SPEED`
  285/240 ≈ 23.6 s), starting at 3:28.8 in v3. The share picture crop is `PIC` (CSS 116..274 × 77..356 at 3x).

## 6. Open questions for Andrew (defaults are used if he doesn't answer)

1. **Default effects when the sheet opens:** all off (today's picture), or Fireworks on? *Default: all off.*
2. **Animated Story sound:** silent, or a short crowd cheer? *Default: silent.* → **Silent** (Andrew, final).
3. **Phase 3** (the app's one-tap Instagram button for video, needs an app build): do it, or leave video on the share sheet? *Default: later.* → **Do it** (Andrew, 2026-11-11; built).
4. **Phase 4 timing:** make the clip after Phase 1 (still effects only) or wait for Phase 2 so it can show Animated? *Default: wait for Phase 2.*

## Standing rules (Phase 1, 2026-11-11)

- **Effects are a registry-free engine:** `lib/socialShare/celebrationEffects.ts` (pure, seeded). A design hands it
  a `CelebrationStage` (content boxes = `keepOut`, the selfie `face`, palette from `shareGames.ts`); never name a game
  id there (`tests/share-designs.test.ts` scans it). New effect = one entry in `CELEBRATION_EFFECT_ORDER`, its
  placement in `planCelebration`, its drawing in `celebrationLayers`, its label in `SHARE_EFFECT_NAMES`.
- **Layers:** lasers `effects.behind` (under the frame/design), fireworks + confetti `effects.middle` (over shapes,
  under images and text), clapping hands `effects.front`. Nothing in middle/front may overlap a `keepOut` box
  (`tests/share-celebration-effects.test.ts`, all 16 combinations × every design × both sizes).
- **The plan places all four effects every time**, so switching one on never moves another; tests pin it.
- **Effects are part of the picture's key** (`useSharePictures` `effectsKey`); a picture drawn with other effects
  may stay on screen while the redraw lands, but is never shared (`designReady` / `capturedEffectsKey`).
- **Drawn vector paths only** — no emoji, no images, no text in an effect (test).
- **No QR code on any share picture** (Andrew, 2026-11-11: people seeing a post aren't at the bar). The venue panel is
  text only (`venuePanel`, `shareDesigns.ts`); `tests/share-card-qr.test.ts` and `npm run share-card:render` fail on a QR.


## Standing rules (Phase 2, 2026-11-11)

- **One drawing order for stills and video:** `storyCanvas.ts` `prepareStoryPainter` + `paintStoryPicture` (base,
  `behind`, design, `middle`, content, `front`). `renderStoryImage` and `celebrationVideo.ts` both use it; never draw a
  share picture another way.
- **The video ends on the still:** `celebrationLayers` clamps `t` to `CELEBRATION_HERO_T` (3.5 s), the video is 5 s
  (1.5 s held), and `buildShareDesignAnimation(...).effectsAt(t ≥ 3.5)` equals `buildShareDesignSpec(...).effects`
  (test). Retiming motion is fine; changing what the hero moment shows changes the still too.
- **Moving effects stay off content in every frame:** confetti still falling hides where it crosses a `keepOut` box,
  a firework rises inside its own reserved circle, and a laser over a selfie is planned short enough to fade before
  the face at any sway (`tests/share-celebration-video.test.ts` checks all 105 moving frames).
- **Silent MP4 only, never WebM;** Mediabunny is imported only inside `encodeCelebrationVideo`. No support
  (`canMakeCelebrationVideo` false) → Still / Animated never shows.
- **A video takes the app's Instagram plugin only when that build says it can** (Phase 3, below): otherwise
  `planShareDestination` `video: true` → share sheet.
- **Animated = Story size + at least one effect;** the video is made automatically for the current choice and any
  change (or Cancel) aborts it. Share is enabled only once the video for the current choice is ready.

## Standing rules (Phase 3, 2026-11-11)

- **One plugin call for both:** `InstagramStories.shareToStory` with `mediaType: "image" | "video"` (set from the
  blob's type in `shareToInstagramStory`, `lib/nativeInstagramStories.ts`). iOS puts a video under
  `com.instagram.sharedSticker.backgroundVideo`, still in the ONE pasteboard item with the caption (9f.2); Android
  shares the web's file as `video/mp4` through the same FileProvider + ADD_TO_STORY intent.
- **The video crosses as a file, never base64 (Phase 3.2):** `writeShareFileNatively` (`lib/nativeImageShare.ts`) writes
  it to `CACHE/hightop-share/<story file name>` with `Filesystem.writeFile` + `appendFile` in 768 KiB pieces (a multiple
  of 3: each piece's base64 stands alone; no `encoding`, so both platforms append raw bytes), and
  `shareToInstagramStory` sends the plugin only `path` (the file URI). Pictures still send `data` (base64). Both plugins
  accept only an existing file inside `<cache>/hightop-share/` (symlinks and `..` resolved) and write no video of their
  own; Android writes only `instagram-story.png`. The share sheet (`shareImageNatively`) uses the same writer, and
  `lib/nativeImageShare.ts` stays the only caller of `Filesystem` (`tests/native-image-share.test.ts`).
- **The cache holds one video at most:** before writing a `.mp4`, the writer deletes every OTHER `.mp4` in the folder
  (best effort; never the file being written, never pictures). A video's name always ends `.mp4`.
- **Video support is asked, never assumed:** `isAvailable` answers `{ available, videoFile }`; `getInstagramStorySupport()`
  turns it into `{ picture, video }` (video only when picture, `videoFile`, the `Filesystem` plugin, and the switch
  below allow). Builds from before Phase 3.2 never answer `videoFile` (a Phase 3 test build answers only `video`, which
  is ignored), so their videos go through the share sheet — no plugin ever receives a path it can't read.
  On Android `videoFile` = Instagram resolves an ADD_TO_STORY intent typed `video/mp4`. Never rename it back to `video`.
- **Planner:** `planShareDestination` goes native for a video only with `instagramStoryDirect` AND
  `instagramStoryVideoDirect`; any other destination never goes native. A failed **video** open drops only
  `video` (the one-tap picture stays); a failed picture or a removed Instagram drops both (`NO_INSTAGRAM_STORY`).
  The planner owns the wording (`plan.failHint`: "Tap More to share the video" / "…the picture").
- **Website switch for one-tap video:** `NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF` = comma list of `ios`, `android`
  (read only by `instagramStoryVideoOff`, `lib/nativeInstagramStories.ts`). Unset, empty or `none` = on. Off:
  `vercel env add NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF production` with `ios`, then redeploy. Back on: set `none`
  (agents can't `vercel env rm`), redeploy. Pictures are never affected.
- Native changes need a rebuild + store release (`docs/native-app-release-runbook.md`); the web half is safe to
  deploy first.
- Android catches `OutOfMemoryError` around the picture's decode + write and rejects "Could not prepare the picture."
  rather than crashing.
