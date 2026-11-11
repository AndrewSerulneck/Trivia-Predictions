# Share Your Win — Phase 2 handoff (Animated Story)

**Date:** 2026-11-11 · **Plan:** `docs/share-win-celebration-plan.md` · **Phase done:** 2 of 4 (shipped with Phase 1)
· **Next:** Phase 4 (the guide replacement clip). Phase 3 (the app's Instagram button sends video) is later.

## For Andrew (plain English)

- **What changed:** on the "Share your win" sheet, Story size now has a **Still / Animated** switch. Turn on at
  least one effect, tap **Animated**, and the phone makes a 5-second video. You see "Making your Story… N%" with a
  **Cancel** button while it works. In the video the lasers sweep in, the fireworks shoot up and burst, the
  confetti falls, the hands clap, and the last 1.5 s is the still picture. It has **no sound**, as you asked. The
  share buttons send the video. **Save** downloads an `.mp4`. It also works on a selfie: the photo stays still
  and the effects move over it.
- **Phones that can't make video never see the switch.** That includes iPhones on iOS below 16.4. They keep the
  still pictures.
- **Is it live?** Phases 1 and 2 were committed together in one commit on `main` (message: "Share Your Win: celebration effects
  and Animated Story") and pushed. The website deploys from that push. No app rebuild, no database change, no new
  setting, no new cost: the videos are made on the guest's phone and never uploaded. A video is about 2–4 MB.
- **No usage tracking,** as you asked.
- **Needs you:** check it on a real iPhone and Android phone. The steps are in
  `docs/native-app-device-checklist.md` §P (76–83). Please note how long the video takes to make. On a Mac it
  took 0.6–2.3 s. A phone will be slower.
- **What's left:** Phase 4, the guide clip (it can now show Animated). Phase 3 is the app's one-tap Instagram
  button for video, and it needs an app build. Until then, in the app a video goes through the phone's share
  sheet, which includes Instagram.

## For the next agent (Phase 4, the guide clip)

### 1. Goal and scope

Phase 4 = plan §4 "Phase 4": one replacement clip (16x9 + 9x16) for the v3 guide's guest-share scene. It is built
from the REAL app screens (now including effect chips and Still / Animated). The clip is silent (Andrew adds the
sound himself). **Out of scope:** app code changes (unless the capture finds a real bug; fix it as a separate,
tested change), Phase 3 native plugin work, analytics.

### 2. Starting state

- Branch `main`. Phase 1 + Phase 2 are in ONE commit on top of `7fe6d7dc`: "Share Your Win: celebration effects and
  Animated Story". It was pushed to `origin/main`, which deploys production (run `git log --oneline -3` and check the Vercel deploy).
- Not mine and left alone (untracked): `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.
- No migration, no data change, no env var. Nothing touched the database.

### 3. Decisions already made (don't re-ask)

- Andrew, 2026-11-11 (before Phase 2): **silent** video (no crowd cheer; he adds sound in the guide himself);
  **no effect-usage tracking**; **ship Phase 1 with Phase 2**.
- Earlier: effects all off at open; Phase 3 later; the clip waited for Phase 2; the clip is sliced into v3, not a
  full re-render; the AI-generated selfie guest; the bar is "Joe's Bar and Grill" (never "General Saloon").
- Mine (Phase 2):
  - The video is made **automatically** when Animated is picked; there is no "Make video" button. Any change
    (effect, design, size, selfie retake, Still, closing) aborts it. Cancel → Still.
  - **Animated needs at least one effect** (the button is greyed out until then; with all effects off, the sheet
    shows Still).
  - Thumbnails stay still pictures. Only the big preview plays the video (muted, looping, `playsInline`).
  - It is Story size only. Post hides the switch.
  - In the app, a video **never** uses the native Instagram Story plugin (it sends pictures only). It uses the
    share sheet.

### 4. Files and how they fit

- **`lib/socialShare/storyCanvas.ts`:** `renderStoryImage` was split into `prepareStoryPainter({ source, spec,
  exportMirrored })` → `{ paintBase, paintDesign, paintContent }`, `paintEffectShapes(context, shapes)` and
  `paintStoryPicture(context, painter, effects)`. The drawing order is the same: photo/background → `behind` →
  frame + backdrop + shapes → `middle` → images + text → `front`. `renderStoryImage` = prepare + paint + export.
- **`lib/socialShare/celebrationEffects.ts`:** motion retimed (the still is unchanged at `t = 3.5`):
  - Fireworks: burst *i* launches at `0.2 + 0.55·i` s, rises for 0.35 s (a spark inside its own circle),
    then opens over 1 s.
  - Lasers: fade in over 0.6 s. They sway ±0.1 rad, and the sway dies away over the last 1.2 s.
  - Confetti: falls in and slows to rest over the last 0.6 s (`fallStill`). A piece that crosses a `keepOut` box
    is hidden, as if it fell behind it.
  - Clapping: claps until 3.5 s.
  - `celebrationLayers` clamps `t` to [0, 3.5], so every later moment is the still. `CelebrationPlan.keepOut` is
    new (it holds the stage's keep-outs). `planBeams` now shortens a selfie laser so it fades before the face at
    any sway angle (`LASER_SWAY`).
- **`lib/socialShare/shareDesigns.ts`:** `buildShareDesignAnimation(prepared, design, size, { mirrorPreview,
  effects })` → `{ spec (effects null), effectsAt(t) }`.
- **`lib/socialShare/celebrationVideo.ts` (new):** `CELEBRATION_VIDEO_FPS = 30`, `…_SECONDS = 5`,
  `…_FRAMES = 150`, `…_HOLD_S = 1.5`, `canMakeCelebrationVideo()` (cheap; loads nothing),
  `encodeCelebrationVideo({ spec, effectsAt, source }, { onProgress, signal })` → `video/mp4` Blob.
  - It paints three layer canvases once, then for each frame: base, `behind`, design, `middle`, content, `front`.
    The held frames are painted once.
  - Mediabunny is loaded via `import("mediabunny")` inside the function. The video is H.264 at 6 Mbps, MP4 with
    fast-start, and has no audio track. The canvases are freed afterwards.
- **`lib/promo/promoReelSupport.ts`:** `canEncodeStoryVideo()` (the VideoEncoder half). `canMakeReel` = it +
  OfflineAudioContext (behaviour unchanged).
- **`lib/socialShare/shareDestinations.ts`:** `ShareDestinationEnv.video?`. When true, `instagram-story` never
  goes native, and the hints use `SHARE_DESTINATION_VIDEO_COPY` ("video", "Save Video", "Video saved.").
- **`lib/socialShare/copyPresets.ts`:** `SHARE_MOTION_NAMES`, `SHARE_VIDEO_MAKING` / `_FAILED` / `_RETRY` /
  `_CANCEL`, `SHARE_DESTINATION_VIDEO_COPY`.
- **`components/social-share/StoryCaptureModal.tsx`:** new state `motion`, `videoSupported` (one check per open),
  `video`, `videoAttempt` and `selfieSnapshot` (the captured still, as state).
  - `videoInput` is a memoised object per choice. The video state is current only when `video.input === videoInput`.
  - An effect encodes for `videoInput` and aborts on change. A second effect revokes each video URL when it is
    replaced or the sheet closes.
  - `shareBlob` = the video when `animated`. File names end `.mp4`. `planShareDestination(..., { video })`.
  - UI: `motionToggle` (wraps beside Story / Post), and `videoPanel` (progress + Cancel, or the failure line +
    Try again) over the big picture or the captured selfie.
- **`components/social-share/ShareActionsSheet.tsx`:** handles a video blob (a `<video>` thumbnail, "Save video").
- **`scripts/render-share-cards.cjs`:** `--video` encodes 4 real videos in **Google Chrome** (the `chrome`
  channel; Playwright's Chromium has no H.264) on an **https** origin (WebCodecs needs a secure page).
  - It decodes them back with Mediabunny and checks 5 s / 150 frames / 1080×1920 / avc1 / no audio, that the
    held frame's QR decodes, and that the held frame matches the still.
  - Output: `tmp/share-cards/video-*.mp4` and `video-strip.png` (rows = videos, columns = 0, 0.5 … 3.5 s, then the
    held frame).
- **Tests:**
  - `tests/share-celebration-video.test.ts` (new, 11 tests):
    - timing and the hold;
    - confetti, fireworks and lasers vs content in every moving frame;
    - destination rules for video;
    - mediabunny loaded lazily, no audio, MP4 only.
  - `tests/share-pictures-stability.test.ts` (+5): hidden when unsupported; Still at open; Animated needs an
    effect; Post hides it; makes once and shares an `.mp4`; a change aborts; Cancel; failure + Try again.
- **Docs:** plan status, §3 changes and "Standing rules (Phase 2)"; device checklist §P; the CLAUDE.md row.

### 5. Facts and traps

- **Playwright's bundled Chromium can't encode H.264.** Use `chromium.launch({ channel: "chrome" })`.
  **WebCodecs needs a secure context:** `http://<fake host>` fails, `https://…` via `page.route` works, and so
  does `http://localhost`.
- `npm run lint` still reports the old errors in `tmp/group-games-phase-4/release/…` (not source). Lint the source
  folders directly instead: `npx eslint lib components scripts/render-share-cards.cjs tests/<files>` (clean).
- In the browser check, the selfie `<video>.duration` read back as `null` right after load (JSON of NaN/Infinity
  while the metadata was settling). It played, and the same encoder's files measure 5.00 s when decoded. If Phase
  4 captures the selfie video, wait for `loadedmetadata`.
- The selfie preview's "Captured" badge sits over the headline in the sheet's preview. This was already there
  before Phase 2 and is not in the shared picture.
- Browser test recipe (worked):
  - `rsync` the repo to the scratchpad, excluding `.env.local`, `.next`, `node_modules` (symlink it instead),
    `native` and `.git`.
  - Add a page at `app/venue/[venueId]/share-test/page.tsx` that renders `StoryShareLauncher`, then run
    `npx next dev --webpack -p 3101`.
  - Set the cookies `tp_user_id` / `tp_venue_id`, and the localStorage keys `tp_*` and `htc_share_venue_v3` (with
    `savedAt: Date.now()`). Mock `**/api/**`.
  - Hide `nextjs-portal`, and click "Create story" in a retry loop.
  - For the camera, launch Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.
  - Kill only the `next-server` PID on 3101 and its `next dev` parent.

### 6. Build, run, test — what was verified

- `npx tsc --noEmit` ✓ · source lint ✓ · `npm run test` ✓ **522 files / 6,891 tests passed, 13 skipped** ·
  `npm run build` ✓ · `npm run share-card:render -- --sheet` ✓ **184/184 QR decode**.
- `npm run share-card:render -- --video` ✓: 4/4 videos, 2.34–3.89 MB, encoded in 0.6–2.3 s on the Mac, held-frame
  difference 0.7–1.2/255, and the QR decodes. I looked at the strip: the motion reads, and nothing crosses the
  words, the QR or the panel.
- Real Chrome, sheet at 350 and 289 px:
  - Animated is greyed out at open.
  - Fireworks + Lasers → Animated → progress → the video plays (1080×1920, 5 s), Share turns on, there is no
    sideways scroll, and there are no page errors.
  - Save → `hightop-live-trivia-ace.mp4` + "Video saved."; Still → back to the picture.
  - Selfie at 289 px (fake camera): Capture → Confetti + Clapping → Animated → the video plays and Share turns on.
- **Not verified:**
  - real iPhone / Android: encode time, Safari's WebCodecs H.264 encoder, memory on older iPhones, Instagram
    accepting a silent MP4 from the share sheet;
  - the in-app share of a video: iOS WKWebView Web Share with a video file, and the Android Capacitor
    Filesystem + Share path with a ~4 MB base64 write.
  
  These are Andrew's checklist §P.

### 7. Open questions for Andrew

- The device results from checklist §P, above all how long the video takes on his phones. If it takes more than
  about 10 s, consider a lower bitrate or 24 fps (the cost stays zero either way).
- Phase 3 (the native Instagram Story video) is still "later".

### 8. Recommended first steps for Phase 4 (**Opus 5.5, medium** per the plan table)

1. Read plan §4 Phase 4 and §5, plus `~/Documents/Hightop Challenge Advertising/` README and the memory note on the
   ad-clips folder.
2. Confirm the deploy is live, then build `main` in a scratchpad clone (port 3102, no `.env.local`) as §4 says.
3. Generate 2–3 AI selfie options (Canva `generate-image`) and show Andrew before rendering.
4. For the Animated beat, capture the sheet's `<video>`, or render frames straight from
   `buildShareDesignAnimation` + `paintStoryPicture` (the same pixels, with no encoder in the loop).
