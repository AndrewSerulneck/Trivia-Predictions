# Share to social: Phase 2 handoff (Reels with sound)

**For Andrew:** the Share to social sheet now has a third size, **Reel**. Pick it and you get a **Music** choice
("Game-night beat", the tune you approved in the test, or "No music"), a **Play preview** button that plays the Reel
with sound right on the screen, and **Make Reel**. Making one takes about 1–3 seconds on a Mac (with a progress bar).
Then Share or Download the video, as with pictures. The Reel matches the test page you approved: applause at the
start, the drumroll, the crowd cheer and the ka-ching on the prize. It is 15 seconds with a prize and 10 without. It
now ends on **exactly** the Post/Story picture, held still for the last ~3 seconds. Browsers that can't make video
(some older ones) only see Post and Story. Everything is made on the partner's phone or computer, so it costs us
nothing to run. It's built and tested on the `after-app-review` branch. **It is not committed, pushed or live**, and
nobody has tried it in a real browser on a phone yet.

**Three things need you:**
1. **Try it:** dev server → `/owner/dashboard` → Share to social → Reel. Then try it on your iPhone and post a test
   Reel to Instagram.
2. **Music:** there is only one track (the test tune). If you want more, download tracks you like from Pixabay or
   Mixkit (instrumental only) into `data/promo-sounds/originals/` with their page links. Each one must also pass a
   48-hour test on Hightop's Instagram before partners can use it.
3. **Before this goes live:** run that 48-hour test with the two crowd sounds, and confirm their two Pixabay links
   (`data/promo-sounds/originals/SOURCES.md`).

## For the next agent

### 1. Next phase (Phase 3) goal and scope
Plan §4.5 / D5: at the end of **scheduling a new game** (`components/owner/schedule/ScheduleGameFlow.tsx`, `save()`)
and **creating a new prize** (`components/owner/rewards/RewardsFlow.tsx`, the `onCreated` handler of
`CreateRewardWizard`), show a final screen with **Share to social** and **Done**.
- Share to social → `?sheet=social&scheduleId=<id>` or `&rewardId=<id>`.
- The sheet must read those params and pre-select that game, with the prize ticked. It doesn't read them yet.
  `promoOptions` keys are `schedule:<id>` / `game:<id>`. For a `rewardId`, use `promoGameForPrizeGameType` with the
  prize's definition `gameType`; if the prize is pinned to one scheduled game, use that schedule.
- The end screen lives in the **owner host**, never inside `CreateRewardWizard` (don't fork it; admin uses it too).
- A game type with no design shows plain Done only.
- Switching sheets reuses the "close without asking → open the other sheet" pattern (`onRequestSchedule`).

**Out of scope:** anything Meta (Phases 4–7), new music tracks (waiting on Andrew), committing unless Andrew asks.
Model / effort per plan §5.1: **Sonnet 5.5, medium**.

### 2. Starting state
- Branch `after-app-review`, last commit `5fd76ed9`. **Nothing for this feature is committed.** Main is frozen
  (App Store review): never push main, `supabase db push` or change Production env.
- No migration, env var, cron, data change, server route or deploy in Phases 0–2.
- **Uncommitted, modified:**
  - Phases 0–1: `AGENTS.md`, `CLAUDE.md`, `app/owner/dashboard/page.tsx`, `components/owner/share/ShareDetailsPanel.tsx`,
    `lib/ownerSchedule.ts`, `lib/ownerSheetParams.ts`, `lib/rewardDefinitions.ts`, `types/index.ts`.
  - Phases 1–2: `lib/socialShare/storyCanvas.ts`.
  - Phase 2: `next.config.ts`, `package.json`, `package-lock.json`, `tests/brand-logo-assets-contract.test.ts`.
- **Uncommitted, new:** `lib/promo/` (12 files), `components/owner/social/` (2), `public/promo/sounds/` (2 `.m4a`),
  `scripts/convert-promo-sound.py`, `data/promo-sounds/`, 3 test files, the plan, the Phase 0/1/2 handoffs, and
  `docs/partner-social-promo-spike/`.
- New npm dependencies (exact pins): `mediabunny@1.61.6` and `@mediabunny/aac-encoder@1.61.6`, both MPL-2.0 and
  published 2026-10-16, so more than 2 weeks old. 1.62.x and later were too new. Phase 0 tested 1.61.6.

### 3. Decisions (plan §2, D1–D25; don't re-ask)
- D17: the end card is the Post/Story picture and the Reel's last frame.
- D19: no QR.
- D21: no whistle; the Reel opens with applause; the music stays at full level and fades only over the last second.
- D22: the sheet is one screen.
- **New in Phase 2 (my calls, within the approved design):**
  - **D23:** the music at launch is the approved code-made "Game-night beat" plus "No music". There is a new
    licence `hightop-original` for sounds made in code. Library tracks wait for Andrew to pick them.
  - **D24:** one shared sound design for every game (`reelSfxCues`). There are no per-design
    `sfxCues`/`defaultMusicId` fields.
  - **D25:** the held end card is still and exact. The rows glide into place and the background stops moving. The
    brand line sits at the top during the beats.

### 4. Files and how they fit
- `lib/promo/promoSounds.ts`: **the sound registry.**
  - Entries: `game-night-beat` (music, synth, gain 0.55); `applause-cheer` and `stadium-crowd` (sfx, files);
    `drumroll` and `ka-ching` (sfx, synth).
  - Each entry has a `license` (`source`, `licence`, `sourceUrl`, `downloadedOn`, `contentIdChecked`).
  - Also exports `PROMO_MUSIC`, `DEFAULT_PROMO_MUSIC_ID`, `promoSoundFor` and `ALLOWED_PROMO_SOUND_LICENCES`.
- `lib/promo/promoSynth.ts`: the code-made sounds, ported from the spike. `PROMO_SYNTHS: Record<PromoSynthId, …>`,
  so a missing one is a type error.
- `lib/promo/promoReel.ts` (pure):
  - `reelPlan(withPrize)`. With a prize: title 0–3, when 3–6.5, roll 6.5–7.5, prize 7.5–11.5, end 11.5–15. Without:
    title 0–3, when 3–6.5, end 6.5–10.
  - `reelHoldStartS` (= end start + 0.6 s), `reelCoverMs`, the future Instagram `thumb_offset` (12100 ms with a
    prize, 7100 ms without), and `reelFrameCount`.
  - `reelSfxCues(plan)`: the sound design from D18/D21, timed exactly as in the spike.
  - Easing, `seededRandom`, and the constants (30 fps, 1080×1920, 6 Mbps H.264, 160 kbps AAC, 48 kHz).
- `lib/promo/promoReelRender.ts` (browser; **only loaded by the sheet with `import()`**):
  - `prepareReel(input)` loads the fonts, lays out the end card with `buildPromoEndCardLayout` (story size, the
    same `measurePromoText` as the picture), paints the end card once, and returns `{ plan, draw(ctx, t), mix() }`.
  - `mix()` fetches and decodes the sound files (cached per page), mixes them with `OfflineAudioContext`, and
    memoises the result.
  - `playReelPreview(scene, canvas, audioContext, onEnded)` draws the frames live onto a canvas of any size.
  - `encodeReel(scene, { onProgress, signal })` does a dynamic `import("mediabunny")`, checks AVC (throws
    `ReelUnsupportedError` if missing), and registers the WASM AAC encoder only if native AAC is missing. Then
    `CanvasSource` + `AudioBufferSource` → MP4 (`fastStart: "in-memory"`) → `Blob`.
- `lib/promo/promoReelSupport.ts`: `canMakeReel()` = `VideoEncoder.isConfigSupported({ codec: "avc1.640028", … })`
  plus `OfflineAudioContext`. That is the codec string Mediabunny builds for 1080×1920 at 6 Mbps. It loads nothing.
- `lib/promo/promoEndCard.ts`:
  - New `buildPromoEndCardLayout` returns `{ spec, groups }`. Each group is one row (`brand|title|when|prize|venue|cta`)
    with its `top`, `height`, `shapes` and `text`.
  - `buildPromoEndCardSpec` = `.spec`, unchanged output.
  - Also exports `PROMO_GLOW`, `PROMO_NAVY_TOP` and `PROMO_NAVY_BOTTOM`.
- `lib/promo/promoRender.ts`: `measurePromoText` is now exported (shared with the Reel).
- `lib/socialShare/storyCanvas.ts`: new `paintStoryBlocks(ctx, {background?, width?, height?, shapes?, textBlocks?})`
  draws synchronously with the same shape and text code as `renderStoryImage`. `renderStoryImage` itself is unchanged.
- `lib/promo/promoCopy.ts`: `PromoSize = PromoFormat | "reel"`, `PROMO_SIZES`, and all the Reel wording.
- `components/owner/social/ShareToSocialSheet.tsx`:
  - New state: `size`, `musicId`, `reelSupported` (checked once on open), `reel` (making / ready / error, keyed by
    `reelKey` = game, shown prizes, name, handle, music), and `previewKey`.
  - Refs: an abort controller, a cached `{key, scene}` shared by the preview and Make Reel, and a stop function.
  - An effect cleanup aborts the Reel being made and stops the preview whenever `open`, `size` or `reelKey` changes.
  - In Reel mode the still preview is the **story** picture, which is also the video's poster.
  - The AudioContext is created inside the tap handler, before any `await`; otherwise iPhones stay silent.
  - The progress bar is a native `<progress>` styled with Tailwind arbitrary variants (no inline styles).
- `public/promo/sounds/applause-cheer-v1.m4a` (129 KB) and `stadium-crowd-v1.m4a` (92 KB) are trimmed to the parts
  the mix uses, so the cue offsets are 0.
- `next.config.ts`: `/promo/:path*` is served `public, max-age=31536000, immutable`. `proxy.ts`'s matcher already skips
  dotted paths.
- `scripts/convert-promo-sound.py <original> <start> <length> <id>` runs afconvert → WAV, trims with Python `wave`,
  then afconvert → AAC m4a. It refuses to overwrite an existing `-v1`.
- Tests:
  - `tests/lib.promo.test.ts`: +7, covering layout groups = spec blocks, the timeline, the hold/cover times, and the
    cues.
  - `tests/promo-coverage-contract.test.ts`: +7 sound-licence rules, plus the immutable header.
  - `tests/components.share-to-social-sheet.test.ts`: +3, with the Reel renderer mocked.
  - `tests/brand-logo-assets-contract.test.ts`: its immutable-path allowlist now includes `/promo/:path*`.

### 5. Facts and traps
- **Playwright's bundled Chromium can't encode H.264.** For headless video checks, use
  `chromium.launch({ channel: "chrome" })`; Chrome is installed on Andrew's Mac.
- The production build puts Mediabunny in its own lazy chunk (~514 KB raw, ~127 KB gzipped;
  `.next/static/chunks/9055.*.js` in this build), plus a separate AAC-add-on chunk. The dashboard page chunk
  contains neither.
- The MP4 lasts 15.08 s / 10.07 s: the AAC encoder pads the last frame. That's harmless.
- A no-prize Reel with "No music" is silent after the opening applause (~3 s). That follows the design: the crowd
  only comes with a prize. Ask Andrew if he wants a crowd bed there.
- The drumroll ring is drawn over "8 PM" for 1 s, as in the approved spike.
- `contentIdChecked` is `null` for the two Pixabay crowd sounds. The contract only **requires** it for music files.
  SOURCES.md asks for the 48-hour test before they ship anyway (an open item for Andrew, not a test failure).
- Still true from Phase 1:
  - The 4 stale sports-bingo star-index snapshot tests fail (date-checked; not ours).
  - `npm run lint` reports 309 errors, all in the git-ignored `tmp/`.
  - The Pick 'Em tier fields may be missing from the dashboard's prize list (Phase 1 handoff §5).

### 6. Build / test, verified vs not
- `npx tsc --noEmit`: clean.
- `npx eslint lib/promo components/owner/social …`: clean.
- `npm run build`: passes.
- `npm run test`: 480 files pass; the only failures are the 4 stale bingo snapshots.
- **Verified headless in real Chrome**, with the real code bundled by esbuild (recipe in Phase 1 handoff §5; the entry
  scripts are in this session's scratchpad, not the repo). Three Reels were made, with timing, size and sound levels
  checked and frame grabs checked by eye:
  - Live Trivia, 1 prize, beat: 15 s, 10.5 MB, made in 1.9 s.
  - Category Blitz, no prize, no music, long days: 10 s, 6.0 MB, 0.9 s.
  - NFL Pick 'Em, 4 prizes, no time, long venue name: 15 s, 9.9 MB, 1.8 s.
  - **The last frame matches the Story picture** (mean RGB difference 2.3–2.6 out of 765, which is only compression).
  - The sound levels follow the cues: applause at 0–2.5 s; the music; the crowd peaks at 7.5–10.5 s; the fade at the
    end.
  - `playReelPreview` played the 10 s Reel and called `onEnded` at 10.2 s.
- Found and fixed by eye: the brand line overlapped the title during the beats, and "Every Monday & Thursday" wrapped
  into the big time.
- **Not verified:**
  - The sheet in a real browser: layout, the progress bar, the video player, Share with an MP4 on iPhone/Android.
  - **iPhone Safari's speed and memory** making a 1080×1920 Reel. Phase 0 only tested the Claude app's WKWebView.
  - Android Chrome, Mac Safari and Firefox.
  - That Instagram plays this exact build's audio (Phase 0 proved the same pipeline).

### 7. Open questions for Andrew
1. Try Reel on the dev server and on your iPhone, and post one test Reel to Instagram. Is the 1–3 s wait and the
   flow OK?
2. More music? Pick tracks (Pixabay / Mixkit / CC0, instrumental) by ear, with their page links. Each needs the
   48-hour Content ID test before partners can use it.
3. Before deploy: the 48-hour test for the two crowd sounds, and confirm their Pixabay links (still open from
   Phase 0).
4. Should a no-prize Reel with "No music" get a crowd bed? It's silent after 3 s today.

### 8. Recommended first steps for Phase 3
1. Read plan §4.5 and the Standing rules in `docs/navigation-unification-plan.md` (sheet switching, `WizardFooter`,
   never `router.push` a step) and `docs/rewards-system-plan.md` (don't fork `CreateRewardWizard`).
2. Teach `ShareToSocialSheet` to pre-select from `scheduleId` / `rewardId` / `game` search params (read them with
   `useSearchParams` in the sheet). Unit-test this first: it's pure option matching over `promoOptions`.
3. Add the end screens in `ScheduleGameFlow` (new games only) and `RewardsFlow` (on `onCreated`), then extend
   `tests/components.share-to-social-sheet.test.ts`.
