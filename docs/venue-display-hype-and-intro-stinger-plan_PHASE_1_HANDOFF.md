# Venue Display Hype — Phase 1 Handoff (intro stinger + keep-awake)

Written 2026-11-12 by Claude Opus 5.5 (the plan's named model for Phase 1).

## For Andrew (plain English)

- **What changed:** every time the TV display opens, it now plays the Explosion intro from the ads (logo bursts in
  with coins, "IT'S GAME TIME."), then the navy background fades away and shows the venue's screen (~4.3 s). The
  small preview on your Venue Display dashboard page skips it; tapping **Expand** shows it.
- **TVs stay awake:** the display and the `/tv` pairing page now ask the TV not to dim or start its screensaver.
  Where a TV's browser doesn't support that, the page plays a tiny invisible silent video, which TVs count as activity.
- Fixed the stray "md" in the "Link a TV" text on the dashboard.
- **Is it live?** No. Nothing is committed, pushed or deployed. It's on your Mac in the working copy.
- **What's left:** sound (Phase 2: I'll find free-to-use explosion sounds for you to pick), the effects engine and the
  rest of the redesign (Phases 0, 3–6), and a check on a real TV.
- **Needs you:** (1) watch it: run the site and open `/venue/<your venue id>/screen`, or tap Expand on
  `/owner/display`; (2) say when to commit and deploy; (3) once deployed, leave a Fire TV Stick on the display for an
  hour or more and confirm no screensaver appears. That can't be tested from here.

## For the next agent

### 1. Next phase and scope
The plan's order is 0 → 1 → 2 …. Andrew asked for Phase 1 first, so **Phase 0 (effects engine + baseline) has not
been done.** The next phase is Andrew's call: Phase 2 (sound) builds directly on this, and Phase 0 is needed before
Phases 3–5. Out of scope here: sound, `FxCanvas`/`useFx`, any other panel changes.

### 2. Starting state
- Branch `main`, last commit `0dc4251d`. **All Phase 1 work is uncommitted.** Nothing pushed or deployed. No DB,
  env, migration or cron changes; no data touched.
- Pre-existing untracked files (not mine, leave alone): `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`,
  and the plan doc itself was untracked before this phase.

### 3. Decisions (don't re-ask)
- Andrew's answers to plan §7: no licensed sound file → Phase 2 finds CC0 options for him to pick; **no sound-off
  switch, sound on**, partners aren't asked questions; devices: assume Fire TV Stick first, plus Google TV, smart TVs
  and Apple TV. Recorded in plan §1 items 7–9.
- Keep-awake added at Andrew's request (plan §1 item 8, §8).
- **Reduced motion departs from the plan's "1.5 s":** it uses the full timeline with fades only (~4.3 s), because a
  1.5 s version would break the "no tagline before 2.15 s" rule. Recorded as plan §1 item 9.
- The stinger has its **own canvas** (the plan allowed this or the Phase 0 `FxCanvas`). Phase 0 can move it onto
  `FxCanvas` later, but doesn't have to. It's a one-off 4 s overlay that unmounts.
- Logo asset is `htc-logo-1254.webp` (native size, not padded to 1280 as the plan suggested); 179 KB at q82, slightly
  above the plan's 80–150 KB estimate. Loaded once per device (immutable cache).
- Wake lock is skipped when the page is in an iframe (`window.self !== window.top`), so the dashboard thumbnail and
  the Expand view never hold the owner's phone awake.

### 4. Files
- `components/venue-screen/stingerTimeline.ts` (new, pure): timeline constants (`T_IN 0.18 … T_END 3.95`,
  `T_REVEAL_END 4.3`), `STINGER_HARD_STOP_MS 5000`, `STINGER_LOGO_TIMEOUT_MS 1500`, seeded `rng`, `spring`,
  `taglineAlpha`, `stageAlpha`, `stingerGeometry`, `stingerParticles`, `isIntroDisabled`, `withIntroDisabled`.
- `components/venue-screen/TvIntroStinger.tsx` (new): canvas port of `stinger.html`. Sprites built once in
  `buildScene` (coin, glow stars, logo+glow, tagline shadow); per-frame code (`drawSprite` … `renderStingerFrame`)
  has no `shadowBlur`. The server-rendered navy cover stops the live screen flashing before the first frame. Backing store is
  capped at a 2880 px long side (`MAX_CANVAS_LONG_SIDE`). Fail-open: hard stop at 5 s, skip (300 ms fade) if the logo
  fails or takes over 1.5 s, any draw error ends it. Reads `prefers-reduced-motion` via `matchMedia`. Font comes from
  `resolveCanvasFont`/`loadCanvasFonts` in `lib/socialShare/storyCanvas.ts` (`var(--ht-font-body)`).
- `components/venue-screen/VenueScreenClient.tsx`: new `intro` prop (default true), `introPlaying` state, stinger
  rendered **outside** `ViewportFitCanvas` (a fixed element inside a transformed parent isn't viewport-fixed),
  go-live takeover held back with `liveTakeover && !introPlaying`, `useKeepScreenAwake()`.
- `app/venue/[venueId]/screen/page.tsx`: reads `intro` searchParam → `intro={!isIntroDisabled(...)}`.
- `app/owner/display/page.tsx`: `ScaledPreview` uses `withIntroDisabled(url)`; `FullscreenExpander` unchanged; stray
  `md` removed. (The helper lives in `stingerTimeline.ts` because Next page files can't export extra names.)
- `lib/useKeepScreenAwake.ts` (new): Wake Lock with re-acquire on `visibilitychange` and on the lock's `release`
  event; fallback is a 1 px, 0.01-opacity muted looping `<video>` of `public/brand/web/keep-awake-v1.mp4`.
- `app/tv/page.tsx`: calls `useKeepScreenAwake()`.
- `public/brand/web/htc-logo-1254.webp` (new, 179 KB), `public/brand/web/keep-awake-v1.mp4` (new, 995 B, 16×16 navy,
  4 s H.264 baseline, made with an AVAssetWriter Swift script, as there's no ffmpeg).
- `tests/venue-screen-intro-stinger-contract.test.ts` (new, 12 tests).
- `CLAUDE.md`: Feature-rules row added. Plan doc: status line, §1 items 7–9, a §8 keep-awake rule.

### 5. Facts and traps
- `.claude/hooks` blocks **any** `rm` of a path named `.env.local`, even in a scratchpad clone. Build the clone by
  `cp -Rc`-ing each top-level entry except `.env.local`, `.next` and `.git` (filenames with spaces get skipped by a
  plain `for f in $(ls -A)`, which is harmless).
- The screen route needs Supabase server-side, so for browser tests I added a throwaway harness page in the clone only
  (`app/tv/stinger-harness/page.tsx`: renders `VenueScreenClient` with an idle fixture; `/tv/*` is public in
  `proxy.ts`) and mocked `/api/venue-screen/state`. **Not in the repo.**
- Headless Chromium has `navigator.wakeLock` but refuses the request, so the video fallback runs there. That's useful for
  testing the fallback; a real lock needs a headed or real device.
- `stinger.html` source is on the external drive: `/Volumes/External_1/Hightop Challenge Advertising/_Source (to remake clips)/stinger.html`. It's read-only; don't edit.
- `npm run lint` reports ~309 errors, all in pre-existing `tmp/group-games-phase-4/*` scratch files. Changed files
  lint clean.

### 6. Build / test / verification
- `npx tsc --noEmit` ✔ · `npx eslint` on changed files ✔ · `npm run test` ✔ (523 files, 6929 passed).
- Browser (Playwright, clone dev server on :3123, mocked state): 1920×1080, 1920×1080@2× (3840 backing → capped
  2880), 390×844@3× portrait, reduced motion, `intro=0`. Results: stinger renders and matches the ad's composition;
  the tagline sits below the logo; the stage fades over the live idle screen; the overlay is gone after ~4.3 s; no console
  errors. `intro=0` shows no stinger. With the logo returning 404, the overlay is gone in 840 ms. Fallback video plays
  top-level; 0 videos inside an iframe.
- **Not verified:** frame-for-frame comparison with the ad's video at 0.3/1.2/2.5/3.3 s (eyeballed only, no ad frames
  extracted); performance on a throttled CPU or real Fire TV; that wake lock actually suppresses the Fire TV / Google
  TV / Tizen / webOS screensaver (needs a real device; Phase 6 checklist); Andrew hasn't watched it yet.
- Apple TV has no web browser; it can only show the display via AirPlay from another device, where that device's
  own sleep settings apply.

### 7. Open questions for Andrew
- Watch the stinger and approve it (plan Phase 1 "Done when").
- Commit/deploy timing.
- Phase 2: pick from CC0 sound options (the next agent finds them).

### 8. Recommended next steps
1. Get Andrew's sign-off, then commit on a branch (not `main` directly) and open a PR.
2. Next phase per plan: **Phase 2 (Sonnet 5.5, medium)**: add the audio in `TvIntroStinger` (`play()` at `T_IN`,
   silent on `NotAllowedError`), and `allow="autoplay; fullscreen"` on the Expand iframe. Or **Phase 0 (Opus 5.5, high)**
   if Andrew wants the engine first.
3. Add stinger + keep-awake items to `docs/tv-display-physical-device-checklist.md` in Phase 6 (or sooner if Andrew
   tests on a stick).
