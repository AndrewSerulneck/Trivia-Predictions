# Share Your Win — Phase 1 handoff (effects engine + effect chips)

**Date:** 2026-11-11 · **Plan:** `docs/share-win-celebration-plan.md` · **Phase done:** 1 of 4 · **Next:** Phase 2 (Animated Story)

## For Andrew (plain English)

- **What changed:** the "Share your win" sheet now has four buttons under the designs: **Fireworks, Lasers,
  Confetti, Clapping**. A guest taps any mix of them and the picture redraws with those effects. All four start
  **off**, so a guest who taps nothing shares exactly today's picture. They work on Spotlight, Card, Night, Story,
  Post and every game and prize. After **Take a selfie instead** → Capture, the same buttons appear and redraw the
  selfie without retaking it.
- **The effects never cover the words, the QR code, the bar's panel or (on a selfie) the face.** A test checks this
  for every combination, design, size and game, and the visual check confirms every QR still scans (184 pictures).
- **Is it live?** No. Nothing is committed, pushed or deployed. It is website-only: no app rebuild, no database
  change, no new setting, no cost (pictures are drawn on the guest's phone).
- **What's left:** Phase 2 (the moving "Animated" Story with a short crowd cheer, as you chose), then Phase 4 (the
  guide clip, which waits for Phase 2, as you chose). Phase 3 (the app's one-tap Instagram button for video) is later.
- **Needs you:** say if you want this committed and deployed now or together with Phase 2. Look at the pictures:
  `npm run share-card:render -- --sheet` writes `tmp/share-cards/effects-sheet.png` (each effect alone, then all four,
  on every design and size).

## For the next agent (Phase 2)

### 1. Goal and scope

Phase 2 = plan §4 "Phase 2: Animated Story": a **Still / Animated** switch on the sheet; Animated makes a ~5 s
1080×1920 MP4 (30 fps) on the phone where the chosen effects move; Story size only; the selfie can be animated
(photo still, effects move). **Sound: a short crowd cheer** (Andrew's §6 answer 2, not silent). It must be audio we
are licensed to use or make ourselves. Share a `video/mp4` through `planShareDestination` / Web Share / Save; in the
app the Instagram Story button falls back to the system share sheet for video (Phase 3 is later).
**Out of scope:** native plugin changes (Phase 3), the guide clip (Phase 4), analytics schema changes.

### 2. Starting state

- Branch `main`, last commit `7fe6d7dc` ("Cancelled prizes, pick windows, away mode, live trivia reminders").
- **Phase 1 is entirely uncommitted.** Files below. Also untracked and NOT mine: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`
  (leave it alone). `docs/share-win-celebration-plan.md` itself was untracked before Phase 1 and still is.
- No migration, no data change, no env var, no deploy. Nothing touched production.

### 3. Decisions already made (don't re-ask)

- Andrew, 2026-11-11, §6: (1) effects **all off** at open; (2) Animated Story gets a **short crowd cheer**;
  (3) Phase 3 **later**; (4) Phase 4 clip **waits for Phase 2**.
- Earlier (plan §3): guest picks effects with toggle chips, any combination, on still AND animated; vector art only.
- Mine (Phase 1): the last choice is **not** remembered in localStorage (Andrew chose "all off" at open; remembering
  would override it). No helper text; chip labels only. Chips show in the selfie view only after Capture (before
  capture the camera preview is a DOM approximation that can't show effects).

### 4. Files and how they fit

- **`lib/socialShare/celebrationEffects.ts` (new):** `CelebrationEffect`, `CELEBRATION_EFFECT_ORDER`,
  `CELEBRATION_HERO_T = 3.5` (the still picture's moment), `normalizeCelebrationEffects`, `celebrationEffectsKey`.
  - `planCelebration(stage)` → `{ bursts, beams, pieces, claps, palette }`. Pure, seeded (`fnv1aHash` + a
    mulberry-style PRNG), cached (48 most recent stages, keyed by `JSON.stringify(stage)`). Always plans all four
    effects. Order: hands first, fireworks around them; if that leaves no burst, fireworks first; overlapping only
    as the last resort (happens only on the Post-size selfie, which is mostly face; the test allows exactly that).
    Fireworks may fall back to the top/bottom bands and run off the side; the first hand pair may fall back into
    Instagram's top band. Lasers fan in from the top corners; over a selfie each beam is shortened to fade before the face.
  - `celebrationLayers(plan, effects, t = HERO)` → `StoryEffectLayers { behind, middle, front }`. **Motion for
    Phase 2 is a first pass only:** fireworks open over 1.2 s staggered (start = HERO − 1.2 − 0.35·i), lasers fade in
    over 0.6 s then sway ±0.1 rad, confetti falls in (`y − (HERO − t)·fall`), hands clap (`|sin|` opening). All reach
    the hero layout at `t = HERO` and hold after it. Tune freely; keep `t = HERO` = the still.
  - `celebrationFootprint(plan)` → where everything landed (tests, debugging).
- **`lib/socialShare/shareDesigns.ts`:** each design now returns `contentShapes` (venue panel rect, gift card rect).
  `estimateTextBox(block)` estimates text ink boxes without a canvas (0.6 em/char; a block that wraps claims its full
  `maxWidth`, because the real face fits more per line than the estimate). `celebrationStage(...)` builds keep-outs
  (text boxes + images + content shapes + selfie face; the face hint is shifted for Post by `(1350 − 1920)/2`).
  `buildShareDesignSpec(prepared, design, size, { mirrorPreview, effects })` adds `spec.effects` (null when none).
  `shareDesignCelebrationStage(...)` exposes the stage. `designParts(...)` is the single design dispatch.
- **`lib/socialShare/contracts.ts`:** `StoryShapeBlock.composite?: "lighter" | "screen"`; `StoryEffectLayers`;
  `StoryRenderSpec.effects?`.
- **`lib/socialShare/storyCanvas.ts`:** `renderStoryImage` draws photo/background → `effects.behind` → frame →
  backdrop → shapes → `effects.middle` → images → text → `effects.front`. `drawShape` honours `composite`.
  New `snapshotStorySource(source)` copies a video frame to a canvas. **`paintStoryBlocks` (used by the partner Reel)
  was NOT changed** and doesn't draw effects; for Phase 2 frames either extend it or draw `spec.effects` shapes yourself.
- **`lib/socialShare/copyPresets.ts`:** `SHARE_EFFECT_NAMES` (Fireworks / Lasers / Confetti / Clapping).
- **`components/social-share/useSharePictures.ts`:** new 5th arg `effects`; `SharePicture.effectsKey`. Two effects:
  a reset effect on `[active, preparedStory, size]` (revokes all URLs, clears state — keeps 9f.3 R6) and the draw
  effect on `[active, preparedStory, size, effectsKey]`, which replaces each picture as its redraw lands and revokes
  the replaced URL then (no flash of an empty frame). `urlsRef` mirrors the URLs in state.
- **`components/social-share/StoryCaptureModal.tsx`:** `effects` state (all off), `effectChips` (2×2 grid under
  340 px, one row from 340 px), `designReady` (picture's `effectsKey` matches), `shareBlob` only when it matches.
  Selfie: capture snapshots the video (`snapshotRef`), renders `selfieSpecFor(effects)`; `toggleEffect` re-renders
  from the snapshot (`selfieRenderIdRef` drops stale renders); `capturedEffectsKey` gates Share. Camera view got
  `min-h-[14rem]` so the chips can't squeeze the preview on short phones (the sheet scrolls instead).
- **`scripts/render-share-cards.cjs`:** also renders each effect alone + all four for 3 cases × 4 designs × 2 sizes
  (`<case>-<design>-<size>-fx-<effects>.png`) and `effects-sheet.png` with `--sheet`; decodes every QR.
- **Tests:** `tests/share-celebration-effects.test.ts` (new, 12 tests), `tests/share-pictures-stability.test.ts`
  (+3: chips all off, a tap redraws once and toggles back, old picture stays but isn't shareable),
  `tests/share-designs.test.ts` (game-id scan now includes `celebrationEffects.ts`).
- **Docs:** plan status/§3/§4 sound line/new "Standing rules"; one sentence in `docs/native-app-store-plan.md`
  "Share pictures v2"; a row in `CLAUDE.md` "Feature rules".

### 5. Facts and traps

- **`npm run lint` reports 309 errors, all in `tmp/group-games-phase-4/release/…`** (an old release copy, not
  source, pre-existing). Lint the source dirs directly: `npx eslint lib components scripts/render-share-cards.cjs tests/<files>` → clean.
- Text widths are estimated (no canvas in pure code). Under-estimating lets an effect touch a word; the fix that
  worked: a wrapped block claims its full `maxWidth`. Don't make `ESTIMATED_EM_PER_CHAR` smaller.
- One combined SVG path for the hand parts **cancels where parts overlap** (opposite winding). Outline the combined
  path, but fill each part separately (`HAND_PARTS`).
- Hand-pair art box (local units): 252 × 280 centred on (0, −125); tilted box 292 × 314 (`CLAP_ART` / `CLAP_BOX`).
  If you change `HAND_PARTS`, the 66 px wrist spacing or the 0.3 rad lean, recompute these (sample the outline).
- Browser test from a scratchpad copy: a test page must live under `app/venue/[venueId]/…`, or
  `AuthNavigationGuard` redirects a signed-in player to their venue home. Set `htc_share_venue_v3` with a fresh
  `savedAt` in localStorage (9f.4) so no venue read is needed. At 289 px the Next dev badge (`nextjs-portal`) sits over
  "Start camera"; hide it with `page.addStyleTag`. Click "Create story" in a retry loop (hydration). Chromium's
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` gives a working fake camera.
- Kill only the PIDs you start (`pgrep -P <npx pid>` → the `next-server` child); Andrew's dev server is on :3000.

### 6. Build, run, test — what was verified

- `npx tsc --noEmit` ✓ · source lint ✓ · `npm run test` ✓ **521 files / 6,875 tests passed, 13 skipped** ·
  `npm run build` ✓ (237 pages; `next-env.d.ts` unchanged) · `npm run share-card:render -- --sheet` ✓ **184/184 QR decode**
  (64 plain + 120 with effects). Looked at the sheets: nothing over words/QR/panel; hands read as clapping hands.
- Real browser (scratchpad copy, no `.env.local`, `next dev --webpack -p 3101`, all `/api/**` mocked, copy deleted
  after): at 350 and 289 px — four chips, all off; Fireworks + Lasers redraws the big picture and thumbnails; no
  horizontal overflow; no page errors; Share enabled after the redraw. Selfie at 289 px with a fake camera: Lasers on
  → Capture → chips appear → Clapping redraws the captured selfie (Lasers + Clapping drawn) → Share enabled.
- **Not verified:** a real iPhone/Android (draw time per toggle on a slow phone; the PNG redraw is 3 pictures per
  tap, selected one first), and the in-app (Capacitor) sheet. Lasers use `globalCompositeOperation = "lighter"`;
  Safari supports it, but it wasn't seen on a device.

### 7. Open questions for Andrew

- Commit/deploy Phase 1 now, or ship it with Phase 2?
- Effect usage analytics: there is no free-JSON field in `story_share_events` (only typed columns + `result_reason`,
  which carries the destination). Knowing which effects get used needs a migration — his call, not done.
- The crowd cheer (Phase 2): which sound? It must be licensed or made by us; ask before using a downloaded clip.

### 8. Recommended first steps (Phase 2 — **Opus 5.5, high** per the plan table)

1. Read plan §4 Phase 2 and the "Standing rules" section, then `lib/promo/promoReelRender.ts` `encodeReel` and
   `lib/promo/promoReelSupport.ts` `canMakeReel`.
2. Plan the frames once: `planCelebration(shareDesignCelebrationStage(prepared, design, "story"))`; draw the still
   design once to a bitmap (without effects), then per frame paint `celebrationLayers(plan, effects, t)` in the right
   order. Note `behind` must go UNDER the design: either keep two static bitmaps (background-only, and everything
   above it minus effects split at shapes/images) or redraw the design's blocks per frame (`paintStoryBlocks` + images).
3. Last 1.5 s holds the hero picture (`t ≥ CELEBRATION_HERO_T` already holds). 5 s at 30 fps = 150 frames.
4. Add the cheer, the Still/Animated switch (hidden when `canMakeReel` is false), progress + cancel, the video share
   path, and a device-checklist section for Andrew.
