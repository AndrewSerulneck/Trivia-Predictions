# Share to social: Phase 0 handoff (rendering + audio spike), DONE

**For Andrew:** Phase 0 passed and you approved the Reel. A 15-second Reel with music, sound effects and your crowd
recordings is made entirely in the browser and plays with sound in Instagram on your Mac (Chrome) and iPhone (Claude
app). It ends on a still end card with the game, when, the prize, the venue and "Play on Hightop Challenge" (no QR).
Nothing on the website has changed yet. Nothing is committed. Next is Phase 1: the Share to social sheet on the
Partner Dashboard with Post and Story pictures.

## For the next agent

### 1. Next phase (Phase 1) goal and scope
Build `docs/partner-social-promo-plan.md` §5 Phase 1: `lib/promo/*` registries (§4.2) + subject builders +
`prizesForGame` (one bounded read) + the shared prize panel; the 6 game designs (§4.1) rendered as **Post
(1080×1350 JPEG) and Story (1080×1920 JPEG)**, both using the **end card layout** (§4.1, D17/D19); the Share to
social sheet `?sheet=social` (§4.4) with Share / Download / Copy caption; a dashboard entry button; the coverage
contract test (§9). **Out of scope:** Reels/sound (Phase 2), end-of-flow prompts (Phase 3), anything Meta (Phases
4–7), committing/pushing unless Andrew asks.

### 2. Starting state
- Branch `after-app-review`, last commit `5fd76ed9`. **Nothing for this feature is committed.**
- Uncommitted: `docs/partner-social-promo-plan.md`, this file, `data/promo-sounds/originals/` (README.md,
  SOURCES.md, two Pixabay MP3s), and notes in `CLAUDE.md` (Feature rules row), `AGENTS.md` (Adding a new Reward
  definition, step 5), comments in `lib/ownerSchedule.ts`, `lib/rewardDefinitions.ts`, `types/index.ts`.
  `tests/prizes-wording-contract.test.ts` passed after those edits.
- No data, env var, migration, cron or deploy changes. Main stays frozen (App Store review).

### 3. Decisions (all in plan §2, D1–D20; don't re-ask)
One design per game with an optional prize panel (D13); Category Blitz included (D14); the end card holds everything
and doubles as the cover and the Post/Story picture (D17); **no QR** (D19); free libraries CC0/Pixabay/Mixkit (D7);
crowd = both Pixabay files layered (D18); "Share to social" (D9); every partner (D11); 15-min cron approved for
Phase 7 (D15); browser rendering is a go (D20).

### 4. What was built (spike only, not in the repo)
- Test page: https://claude.ai/artifact/Mex9BDgSGEaircnafoqCmz (version 4, private to Andrew). Read its source with
  the Artifact tool `read` action. **It is the visual and timing reference for Phases 1–2:** the `drawFrame(t, p)`
  timeline, the end-card layout numbers, the prize card drawing (white→slate gradient, cyan/violet glow,
  WIN / prize / how to win), and the `buildAudio` mix (Web Audio `OfflineAudioContext` → limiter →
  `AudioBufferSource({codec:"aac"})`; video `CanvasSource({codec:"avc", bitrate: 6e6, keyFrameInterval: 2})`,
  30 fps, `Mp4OutputFormat({fastStart:"in-memory"})`, `BufferTarget`).
- Libraries: `mediabunny@1.61.6` + `@mediabunny/aac-encoder@1.61.6` (MPL-2.0). In the app, install them as npm
  deps (pin exact versions) and lazy-load them in the sheet only.
- Crowd timing used: stadium file read from 8.0 s for 4.4 s, starting 0.3 s before the reveal at gain 0.45, fade
  in 0.4 s / out 1.3 s; applause file from 0.95 s for 6.0 s at gain 1.0, fade out 1.2 s.

### 5. Facts and traps
- Device results: **Mac Chrome 156** and **iPhone iOS 18.7, Claude app (WKWebView)**: WebCodecs, H.264 1080×1920,
  built-in AAC, Web Audio all **yes**; Instagram played the sound on both. **Not tested:** Android Chrome, Mac
  Safari, Firefox. The WASM AAC add-on was never needed. Keep the `canEncodeAudio("aac")` check + lazy
  `registerAacEncoder()` fallback anyway.
- Artifacts don't serve `.m4a`; the spike publishes the sounds as `sounds/*.mp4`. The app will serve
  `public/promo/sounds/<id>-v1.m4a`. Add an immutable cache header for `/promo/:path*` like `/brand/web/:path*` in
  `next.config.*`.
- The two sound files' Pixabay URLs in `SOURCES.md` are inferred from the file names. Andrew hasn't confirmed them
  yet. `contentIdChecked` is still open (plan §6).
- No ffmpeg on Andrew's Mac. Use macOS `afconvert` (`afconvert -f m4af -d aac -b 160000 in.mp3 out.m4a`) for
  sound conversion. Trimming happens at mix time, not in the file.
- Headless check that works: Playwright from the repo's `node_modules` (Chromium is installed) can load the spike
  HTML from `file://` and grab `#stage` with `toDataURL`. The sound fetches fail on `file://`; that's expected.
- Player share pictures (`lib/socialShare/shareDesigns.ts`) still carry a QR. D19 applies to partner promos only,
  unless Andrew asks.

### 6. How to build / test
`npm run test` (Vitest), `npx tsc --noEmit`, `npm run lint`; never run typecheck and build at once. Browser-test
the sheet from a scratchpad clone with mocked routes (CLAUDE.md, "Manual Testing"). Never `npm run dev` on :3000
or `pkill next`.

### 7. Open questions for Andrew
None blocking. Nice to have: confirm the two Pixabay URLs in `data/promo-sounds/originals/SOURCES.md`.

### 8. Recommended first steps for Phase 1
1. Read the plan §4.1–4.4 and §9, the Standing rules in `docs/navigation-unification-plan.md` (sheet primitives)
   and `docs/rewards-system-plan.md`, and `lib/socialShare/shareDesigns.ts` + `storyCanvas.ts` (reuse the
   renderer).
2. Find the Pick 'Em / NFL Pick 'Em / Squares / Bracket "is it on at this venue, and when" data (plan §11).
3. Write `lib/promo/promoSubjects.ts` + `prizesForGame` + the coverage contract test first (pure, testable), then
   the end-card spec builder, then the sheet.
