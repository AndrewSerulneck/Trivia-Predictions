# Share Your Win — Celebration Effects, Animated Story, and the Guide Clip

**Status (2026-11-11):** **Phases 1 and 2 are BUILT and shipped together** (website only; handoffs
`docs/share-win-celebration-plan_PHASE_1_HANDOFF.md`, `docs/share-win-celebration-plan_PHASE_2_HANDOFF.md`, which
has the commit and deploy state). Waiting on Andrew's phone check (`docs/native-app-device-checklist.md` §P).
Next: Phase 4 (the guide clip). Phase 3 later.

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
- **Changed by Andrew before Phase 2 (2026-11-11):** the Animated Story is **silent** — no crowd cheer ("I'll find
  one myself and put it in the video"). **No effect-usage tracking** (no migration). **Ship Phase 1 together with
  Phase 2.**

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
3. **Phase 3** (the app's one-tap Instagram button for video, needs an app build): do it, or leave video on the share sheet? *Default: later.*
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
- **A video never takes the app's picture-only Instagram plugin** (`planShareDestination` `video: true` → share
  sheet) until Phase 3 teaches the plugin `backgroundVideo`.
- **Animated = Story size + at least one effect;** the video is made automatically for the current choice and any
  change (or Cancel) aborts it. Share is enabled only once the video for the current choice is ready.
