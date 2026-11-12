# Venue Display — Brand Hype, Effects & Intro Stinger — PLAN

> **Status:** Phase 1 (intro stinger) + keep-awake built 2026-11-12, **not committed or deployed** — see
> `venue-display-hype-and-intro-stinger-plan_PHASE_1_HANDOFF.md`. Phase 0 not started (Andrew asked for Phase 1 first).
> **Phase 2 (sound)** built 2026-11-12 with Andrew's own sound files — see `venue-display-hype-and-intro-stinger-plan_PHASE_2_HANDOFF.md`.
> **Phase 3 (brand chrome)** redone 2026-11-12 on top of the Phase 0 engine, browser-verified, not committed — see
> `venue-display-hype-and-intro-stinger-plan_PHASE_3_HANDOFF.md`; pictures/frame times in `docs/venue-display-hype_PHASE_3_after/`. **Phases 0 + 3 committed (`d71c2e92`).**
> **Phase 4 (idle screen)** built + browser-verified 2026-11-12, not committed — see
> `venue-display-hype-and-intro-stinger-plan_PHASE_4_HANDOFF.md`; pictures/results in `docs/venue-display-hype_PHASE_4_after/`. Next: Phase 5.
> **Phase 0 (baseline + effects engine)** done 2026-11-12, not committed — see
> `venue-display-hype-and-intro-stinger-plan_PHASE_0_HANDOFF.md`; baseline in `docs/venue-display-hype_PHASE_0_baseline/`.
> **Phase 5 (game moments)** built 2026-11-12, browser-verified, not committed — see
> `venue-display-hype-and-intro-stinger-plan_PHASE_5_HANDOFF.md`; pictures/counts in `docs/venue-display-hype_PHASE_5_after/`. Next: Phase 6.
> Created 2026-11-12. Owner: Andrew. Each phase ends with a handoff note `venue-display-hype-and-intro-stinger-plan_PHASE_<N>_HANDOFF.md`
> next to this file, and this status line is updated to point at it.
>
> **Scope:** the venue TV display (`/venue/[venueId]/screen`, the "Display URL" handed out on `/owner/display`) and its
> `/tv` pairing screen. Predecessor (shipped 2026-07): `docs/tv-display-brand-and-animation-plan.md` — read its §2
> "Architectural decisions & gotchas" before touching `components/venue-screen/*`.

---

## Summary for Andrew

The TV display works but looks plain. This plan makes it look like the Hightop ads: navy stage, cyan and gold light,
coins, sparks, twinkles, shine sweeps and bursts. Every time a TV opens the display, it plays the **Explosion intro
stinger** from the ads (logo bursts in with coins, "IT'S GAME TIME."), then fades into the venue's screen.

What you decided (2026-11-12):

| Question | Your answer |
|---|---|
| When the stinger plays | **Every time the display opens**: TV turned on, auto-resume after a power cut, a reload, the dashboard's Expand button. Not when a game goes live, not on the `/tv` pairing screen. |
| What it ends on | **"IT'S GAME TIME."**, exactly like the ad. |
| Sound | **Try sound, fall back to silent.** You approve the sound file (Phase 2). |
| Idle screen (between games) | **Calm + periodic bursts**: gentle moving colour and twinkles, plus a coin/spark burst and logo shine about once a minute. |

Things to know:

- **The stinger is rebuilt as live code, not played as a video.** The ad's video file is 14.6 MB; sending it to every
  TV every time it opens would cost real bandwidth (estimate in §6). The ad's animation was code to begin with
  (`stinger.html`), so the web version is the same animation, sharp on any TV size, and about 15 KB.
- **Most TVs will play the stinger silently.** TV browsers block sound that starts on its own unless someone has just
  pressed a button on that page. Sound will play reliably when you tap **Expand** on the dashboard, and on TVs whose
  browser allows it. Nothing breaks when it's blocked.
- **No new costs:** no new database work, no extra polling, no paid services.
- **You'll need to** approve a sound file (Phase 2) and run the on-TV check (Phase 6) on a real TV/stick.

---

## 1. Decisions already made (don't re-ask)

1. **Stinger trigger:** every mount of `VenueScreenClient` (= every page load of `/venue/[venueId]/screen`), including
   auto-resume from `/tv` and the dashboard Expand overlay. **Skipped** in the small dashboard preview thumbnail
   (`ScaledPreview` in `app/owner/display/page.tsx`) — the owner sees it when they tap Expand. Skip mechanism: a query
   param `intro=0` that only `ScaledPreview` adds. Not played on `/tv`, not on idle → live (the existing
   `TvGoLiveTakeover` stays the go-live moment, upgraded in Phase 5).
2. **Stinger content:** the Explosion stinger (`Intro Stinger - Explosion/`, source `stinger.html`), unchanged timeline,
   ending on "IT'S GAME TIME." — **the tagline must not appear before 2.15 s** (Andrew, 2026-10-26; this rule carries
   over from the ad).
3. **Implementation:** port `stinger.html`'s canvas code to a React client component (not a `<video>`). Reasons: ~15 KB
   vs 14.6 MB per open (§6), crisp at 4K, can sit over the live screen with a transparent exit, no codec/autoplay
   issues on TV browsers.
4. **Sound:** attempt to play; on `NotAllowedError` (autoplay blocked) stay silent. No on-screen "tap for sound"
   button (TVs have no pointer; copy must be minimal). Andrew approves the file.
5. **Idle screen:** calm ambient motion + a periodic "moment" (coin/spark burst + logo shine) about every 60–90 s,
   aligned to the wall clock so two TVs in one bar fire together.
6. **Brand language = the ads:** navy canvas `#020617`; cyan `#22d3ee`/`#67e8f9` light; gold coins (`#fff3b0 →
   #fbbf24 → #b45309`, star emboss); cyan/gold sparks; 4-point star twinkles; diagonal shine sweep; spring-overshoot
   arrivals; shockwave ring. Per-game colours stay as in `lib/venueScreenBrand.ts` (Live Trivia cyan→violet, Category
   Blitz fuchsia→violet, Squares amber/emerald, Bracket orange). The venue's own screen colours
   (`screenBrandPrimary/Secondary`) keep tinting the stage.

7. **Answers to §7 (Andrew, 2026-11-12):** (1) no licensed sound file — the Phase 2 agent finds CC0 options for
   him to pick; (2) **no sound-off switch**, sound stays on (bars are loud; partners aren't asked questions);
   (3) devices: none deployed yet — assume Fire TV Stick first, plus Google TV, smart-TV browsers and Apple TV.
8. **Keep the TV awake (Andrew, 2026-11-12):** the display and `/tv` stop the TV's screensaver/dimming —
   `lib/useKeepScreenAwake.ts` (Screen Wake Lock, fallback: 1 KB muted looping video). Built with Phase 1.
9. **Reduced motion keeps the 2.15 s tagline rule** (decided in Phase 1): the reduced stinger uses the same timeline
   (fades only, no particles/rays/spring), so it lasts ~4.3 s rather than the 1.5 s first planned — a 1.5 s version
   would have shown the tagline before 2.15 s.

## 2. Current state (2026-11-12)

- Branch `main`, last commit `0dc4251d`. Nothing for this plan is written.
- Route: `app/venue/[venueId]/screen/page.tsx` → `components/venue-screen/VenueScreenClient.tsx` (polls
  `/api/venue-screen/state`; 1 s during questions/rounds, 4 s intermissions, 15 s Squares, 30 s Bracket, 20 s idle —
  `lib/venueScreenTiming.ts`). Fixed 2304×1296 canvas scaled to the viewport (`ViewportFitCanvas`).
- Panels (framer-motion 12): `TvQuestionReveal`, `TvAnswerReveal`, `TvRoundBreak`, `TvFinalStandings`,
  `TvLetterReveal`, `TvBlitzResults`, `TvIdleAttract`, `TvGoLiveTakeover`, `TvPairingDisplay`, plus plainer
  `SquaresTvScreen`, `BracketTvScreen`, `SponsorRail`, and the `VenueTitle` header inside `VenueScreenClient`.
- `/tv` (`app/tv/page.tsx`): pairing code + QR; a paired TV shows "Resuming…" for 4 s then navigates to the screen.
- What looks "boring": a flat header (two lines of text + a chip), static gradient stages, Squares/Bracket are plain
  lists with no motion, the idle screen is a slow carousel with little brand energy, and nothing on open.
- Stinger source: `/Volumes/External_1/Hightop Challenge Advertising/_Source (to remake clips)/stinger.html`
  (11 KB, external drive "External_1" must be connected). Timeline constants: `T_IN 0.18`, `T_HIT 0.30`,
  `T_SHINE 1.15`, `T_TAG 2.15`, `T_OUT 3.40`, `T_END 3.95`, `DURATION 4.0`; 34 coins, 46 sparks, 9 twinkles from a
  seeded RNG (`rng(20261026)`); damped spring `1 - e^(-7.5τ)·cos(13.5τ)`; tagline `IT’S` white + `GAME TIME.` gold
  `#fcd34d`, Nunito 900. It loads `public/brand/htc-logo.png` (1254 px).
- Found while planning: stray text `md` in the copy at `app/owner/display/page.tsx:148` ("…/tv</span>.\n md It'll
  show…"). Fix it in Phase 1 (same file).

## 3. Constraints every phase must keep

- **Poll idempotency:** an effect fires once per identity (`transitionKey`/round/phase), never on a poll tick. A
  reload mid-game must not replay game moments (only the stinger plays on load). Verify with the MutationObserver
  "0 remounts" check from the predecessor plan.
- **Burn-in:** the idle screen runs for hours. Keep `getVenueScreenBurnInTransform` + `TvIdleAttract` drift; no new
  static bright element; ambient motion must keep moving.
- **Weak hardware:** Fire TV Stick / smart-TV browsers. Animate only `transform`/`opacity`; never animate CSS
  `filter: blur` or `box-shadow`; no per-frame canvas `shadowBlur` (pre-render glows to sprites once). One shared
  `requestAnimationFrame` loop for all canvas effects. Pause the loop when nothing is animating and when
  `document.hidden`.
- **`prefers-reduced-motion`:** every effect has a reduced version (fades only). Stinger reduced = logo + tagline fade,
  ~1.5 s.
- **Fail open:** the screen must never get stuck behind an effect. Stinger has a hard 5 s unmount timeout and is
  skipped if the logo can't decode within 1.5 s. Effect errors are caught and the effect is dropped, not the screen.
- **Security gates unchanged:** `correctAnswer` only on `reveal`; no new data in the screen payload unless a phase says
  so. No player ids.
- **Styling:** `components/venue-screen/*` is the inline-style exception (dynamic values); tokens from
  `lib/venueScreenBrand.ts`. Nunito only. No text under 12 px (`lib/textSizeFloor.ts`). Copy minimal: no new words
  except where a phase names them.
- **Brand images are immutable-cached** (`/brand/web/*`): new artwork = new file name.
- **Cost:** no new API routes, polls, crons or DB reads. Assets load once per device (immutable cache).
- **Dev server:** Andrew runs `npm run dev` on :3000 — never use it or `pkill next`. Browser-test from a scratchpad
  clone with no `.env.local` and mocked `/api/venue-screen/state` (dev and live share one database).

## 4. Phases

### Model and effort per phase

| Phase | What | Model | Effort | Why |
|---|---|---|---|---|
| 0 | Baseline + effects engine (`components/venue-screen/fx/`) | Opus 5.5 | High | Shared engine every later phase builds on; performance and idempotency mistakes multiply. |
| 1 | Intro stinger port + wiring | Opus 5.5 | Medium | Exact port of a known file, but it sits in front of the live screen and the poll loop, and must not break the takeover or preview. |
| 2 | Stinger sound | Sonnet 5.5 | Medium | Small, well-specified: one audio element, autoplay fallback, iframe `allow`. |
| 3 | Brand chrome: header, stage, Squares, Bracket, `/tv` | Sonnet 5.5 | Medium | Well-specified UI on top of the Phase 0 engine. |
| 4 | Idle screen: calm + periodic bursts | Sonnet 5.5 | Medium | One panel, wall-clock rules already established in `TvIdleAttract`. |
| 5 | Game moments (reveals, letter slam, champions, go-live) | Sonnet 5.5 | High | Many panels, each tied to poll-driven identities; higher effort to keep re-fire bugs out. |
| 6 | Verification, performance pass, release | Opus 5.5 | Medium | Judging frame-time data and long-run leaks across the whole surface; release gate. |

Recommended order: 0 → 1 → 2 → 3 → 4 → 5 → 6. Phases 3, 4 and 5 are independent once 0 is done and could ship
separately; the stinger (1) is the headline and should ship first.

---

### Phase 0 — Baseline and effects engine

**Goal:** know what the screens look like and how fast a weak device draws them today; build the shared effect
pieces later phases use.

1. **Baseline captures.** In a scratchpad clone (`cp -Rc`, no `.env.local`, production build on a free port, every
   `/api/venue-screen/state` answered by fixtures), screenshot every state at 1920×1080: idle (0, 1, 2 next games),
   Live Trivia question/reveal/round break/final, Category Blitz round/results, Squares, Bracket, go-live takeover,
   `/tv` pairing. Record frame times with Chromium CPU throttling ×6 (rough Fire TV Stick stand-in). Save under
   `docs/venue-display-hype_PHASE_0_baseline/`.
2. **`components/venue-screen/fx/` engine:**
   - `FxCanvas.tsx` — one full-viewport, DPR-aware `<canvas>` overlay mounted once in `VenueScreenClient`, **outside**
     the scaled 2304×1296 canvas (so particles are sharp at 4K), `pointer-events-none`. One rAF loop; idle when no
     emitters are live; stops on `document.hidden`.
   - `fxSprites.ts` — pre-render once to offscreen canvases: gold coin (from `stinger.html` `coin()`), cyan and gold
     spark with baked glow, 4-point star twinkle, confetti chips in the game palette. No `shadowBlur` per frame.
   - `fxEmitters.ts` — pure, deterministic emitters (seeded RNG copied from `stinger.html`): `burst` (coins + sparks
     outward from a point, gravity optional), `shower` (coins/confetti from the top), `twinkleField`, `shockwave`
     ring. Each is a pure function `(tSeconds) → draw list` so it's unit-testable without a browser.
   - `useFx()` hook — panels call `fx.burst({ at, palette, size, key })`; the `key` dedupes (same key never fires
     twice in a session), which is how poll idempotency is enforced in one place.
   - `fxQuality.ts` — tier `full | lite | off`: start `full` (or `lite` when `navigator.hardwareConcurrency <= 2`);
     a frame-time watchdog drops a tier when the 1 s rolling average exceeds 28 ms; `prefers-reduced-motion` → `off`
     (fades only). Tier lives in a ref, not state (no re-renders).
   - `ShineSweep.tsx` (framer-motion, transform only) and `BrandStage.tsx` (two pre-blurred radial "aurora" blobs
     drifting by transform on wall-clock periods, using the theme's `ambientA/ambientB`).
3. **Tests:** `tests/venue-screen-fx.test.ts` — emitter determinism (same seed → same frame), key dedupe, quality
   tier transitions, no emitter alive after its life ends.

**Done when:** engine merged but **not yet visible** (no panel uses it), tests pass, baseline captured.

### Phase 1 — Intro stinger

**Goal:** the Explosion stinger plays over the display every time it opens, then reveals the live screen.

1. `components/venue-screen/TvIntroStinger.tsx` — port of `stinger.html`: same timeline constants, particle counts,
   seed, spring, shockwave, shine, twinkles, tagline. Changes from the file:
   - Draws on its own full-viewport DPR-aware canvas (or the Phase 0 `FxCanvas` layer), sized from the viewport, not
     1920×1080; `L = min(W,H) × 0.64` for landscape (portrait layout kept for phones in the dashboard Expand).
   - Glows pre-rendered to sprites (no per-frame `shadowBlur`) — visually match the ad side by side.
   - **Exit:** instead of fading to navy (`T_OUT → T_END`), the navy background fades out over the live screen
     underneath while the logo lifts/fades, so it hands straight into the display. Total ~4.3 s.
   - Logo: add `public/brand/web/htc-logo-1280.webp` (new file name; made from `public/brand/htc-logo.png`, 1254 px →
     keep 1254 or pad to 1280) — 512 px is too small at 4K (logo ≈ 1380 px there). Preload it.
   - Tagline waits for `document.fonts.load("900 …px <Nunito token family>")` before first draw; use the font family
     from `--ht-font-body`, never a literal face.
   - Pure timeline helper `stingerTimeline.ts` exporting the constants and `taglineAlpha(t)`.
2. **Wiring in `VenueScreenClient`:** render the screen underneath immediately (initial state is server-rendered);
   overlay `<TvIntroStinger>` on mount unless `intro=0`. The poll loop runs as normal underneath. If an idle → live
   flip happens during the stinger, queue `TvGoLiveTakeover` until the stinger ends.
3. **Skip in the thumbnail:** `ScaledPreview` (`app/owner/display/page.tsx`) appends `intro=0`; `FullscreenExpander`
   does not. Pass it through `page.tsx` `searchParams` like `mode`. Fix the stray `md` at line 148 while there.
4. **Reduced motion:** logo + tagline fade in/out, 1.5 s, no particles.
5. **Fail-safes:** hard unmount at 5 s; skip if logo decode fails/takes > 1.5 s; try/catch around drawing.
6. **Tests:** `tests/venue-screen-intro-stinger-contract.test.ts` — `taglineAlpha(t) === 0` for all `t < 2.15`;
   `VenueScreenClient` mounts the stinger; `intro=0` skips it; `ScaledPreview` adds `intro=0` and the Expand URL
   doesn't.
7. **Add a feature-rules row to `CLAUDE.md`** pointing at this doc's Standing rules (§8). Don't edit the ad folder
   (`/Volumes/External_1/…`); it's Andrew's library and is read-only for this plan.

**Done when:** browser-verified at 1920×1080 and 3840×2160 and in reduced motion; side-by-side frames vs the ad at
0.3 s, 1.2 s, 2.5 s, 3.3 s look the same; tests pass; Andrew has watched it.

### Phase 2 — Stinger sound

1. **Sound file (needs Andrew):** Andrew supplies an explosion/whoosh he has the rights to use on a website (CapCut
   library sounds are usually licensed for CapCut videos only — check), or we pick a CC0 one and he approves it.
   Trim to the stinger (impact at 0.30 s), normalise to about −16 LUFS (bars are loud but this shouldn't startle), AAC
   `.m4a` ≤ 60 KB (plays on every TV browser), new file name under `public/brand/web/` (e.g.
   `htc-stinger-boom-v1.m4a`). No ffmpeg on the Mac: encode with AVFoundation (`encode.swift` pattern in the ad
   `_Source` folder) or `afconvert`.
2. `TvIntroStinger` creates an `HTMLAudioElement`, `preload="auto"`, and calls `play()` at `T_IN`; a rejected promise
   (`NotAllowedError`) → silent, no retry, no on-screen prompt. Skip when `intro=0`.
3. The Expand overlay iframe in `FullscreenExpander` gets `allow="autoplay; fullscreen"` so the owner's tap delegates
   autoplay (the iframe is cross-origin once the domain split is on: apex → `play.`).
4. **Open item for Andrew:** whether venues need a way to turn the sound off. Default: no switch in v1 (most TVs will
   be silent anyway); add one later only if a partner asks.

**Done when:** sound plays in the dashboard Expand view on Chrome desktop and iOS Safari; a fresh headless page with
autoplay blocked stays silent with no console error.

### Phase 3 — Brand chrome on every screen

1. **Header (`VenueTitle` in `VenueScreenClient`):** logo mark (`htc-logo-192.webp`) with a `ShineSweep` every ~45 s;
   "Hightop Challenge" eyebrow with a slow gradient in the game colours; venue name with a soft glow; the game chip
   gets the game's gradient border and a breathing glow. A thin animated light rule under the header in the game
   colours.
2. **Stage:** replace the static `stageGradient` with `BrandStage` (drifting aurora blobs in `ambientA/ambientB`,
   faint twinkle field in `lite`+ tiers) for every mode. Keep venue colour overrides.
3. **Squares (`SquaresTvScreen`) and Bracket (`BracketTvScreen`):** staggered row entrance on identity change only;
   top 3 get gold/silver/bronze edges with a slow shine; score count-up when a score changes between polls (keyed on
   username + score); upset card gets a spark burst once per upset id.
4. **`/tv` pairing (`TvPairingDisplay`, `app/tv/page.tsx`):** `BrandStage` background and a logo shine; code digits
   pop in with the spring. No stinger here (decision 1).
5. **Sponsor rail:** gentle shine on rotation only; don't restyle sponsor logos.

**Done when:** every mode screenshots differently from the Phase 0 baseline, 0 remounts across 10 polls, frame time
under the throttled budget in `lite`.

### Phase 4 — Idle screen: calm + periodic bursts

1. Ambient: `BrandStage` + sparse twinkles (`twinkleField`), always moving (burn-in).
2. **Moment every 75 s, wall-clock aligned** (`Math.floor(nowMs / 75_000)` is the burst key, so two TVs fire
   together and a reload doesn't fire an extra one): logo shine + a small coin/spark burst behind the "Next up" card.
   `lite` tier: shine + sparks only; reduced motion: shine fade only.
3. Next-game cards take the game's colours and its vector art from `GAME_TILE_THEMES`
   (`components/game-themes/gameTileThemes.tsx`) — check `docs/game-themes-plan.md` Standing rules first (a theme
   styles the name, never rewords it; vector art only).
4. Countdown: under 1 hour, digits flip; under 5 minutes, a heartbeat pulse in the accent colour. No new words.
5. Keep the existing drift and rotation timing in `TvIdleAttract` (wall-clock, non-harmonic).

**Done when:** an accelerated-clock run (Playwright `clock.install` + `runFor`) over a simulated 3 hours shows bursts
at every 75 s boundary, no memory growth in the fx layer (heap snapshot start vs end), burn-in drift still moving.

### Phase 5 — Game moments

Each moment is keyed on a stable identity so it fires once; a reload mid-game shows the settled state without the
moment.

| Moment | Panel | Effect | Key |
|---|---|---|---|
| Question appears | `TvQuestionReveal` | light-streak wipe across the stage before the words | `gameId:round` |
| Last 5 s of a question / round | `TvQuestionReveal`, `TvLetterReveal` | timer ring heartbeat, stage edge glow in accent | — (CSS, no fx) |
| Correct answer | `TvAnswerReveal` | shockwave + spark burst behind the answer, shine across it | `gameId:round:reveal` |
| Round leaderboard | `TvRoundBreak` | rows slide to new ranks; a player moving into 1st gets a coin pop | `gameId:round` |
| Final standings | `TvFinalStandings` | champion: the stinger's coin explosion around the winner + confetti shower in the game colours | `gameId:final` |
| Letter slam | `TvLetterReveal` | shockwave ring + spark burst at the slam frame | `roundId` |
| Blitz results | `TvBlitzResults` | winner row shine + small burst | `roundId:results` |
| Go-live | `TvGoLiveTakeover` | mini version of the stinger burst (no tagline) in the game colour, keeps its 1.8 s length | existing `liveTakeover.key` |

Reuse ideas, not code paths, from `lib/socialShare/celebrationEffects.ts` and
`components/category-blitz/SessionCompleteFireworks.tsx` — they're built for phones/share pictures; the TV uses the fx
engine. Don't touch the answer-reveal security gate in `lib/venueScreen.ts`.

**Done when:** full mocked sequence (idle → live → question → reveal → round break → … → final) shows each moment
exactly once; reload at each step shows no moment; reduced-motion run clean.

### Phase 6 — Verification, performance and release

1. Playwright in the scratchpad clone: every state × motion/reduced × 1920×1080 / 3840×2160 / phone portrait
   (Expand). Zero console errors; 0 remounts per poll; stinger timing frames.
2. Throttled (×6) frame times per state vs Phase 0 baseline; confirm the quality watchdog steps down and the screen
   never drops below ~30 fps for more than a second.
3. Long run: accelerated 3 h idle + a mocked game night; fx heap and canvas count flat.
4. Update `docs/tv-display-physical-device-checklist.md` with stinger/sound/burst items; **Andrew runs it on a real
   TV/stick** (watch the stinger after power-on, check sound behaviour, leave idle running an evening).
5. `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` (not typecheck and build at once). PR,
   deploy, then compare the screen route's function invocations and bandwidth in Vercel against the week before
   (should be unchanged apart from the one-time asset downloads).

## 5. Risks

- **Weak TV sticks stutter.** Mitigation: sprites, one rAF loop, transform-only CSS, quality watchdog, `lite` tier.
  Unknown until Phase 6's real-device run.
- **Re-firing on polls / reloads.** Mitigation: all moments go through `useFx` keys; contract tests.
- **Stinger hides a live game for ~4 s after a reload.** Accepted (Andrew: every time it opens). The game keeps
  running underneath and is fully visible at ~4.3 s.
- **Sound licensing.** Only use a file Andrew confirms he can use on a website.
- **Visual fatigue.** Idle bursts at 75 s and per-moment effects only; nothing loops constantly at full strength.

## 6. Cost estimate

No new API calls, polls, crons, DB reads or logs. Added bytes per **device**, once (immutable cache): stinger code
~15 KB, `htc-logo-1280.webp` ~80–150 KB, sound ≤ 60 KB, fx engine ~10 KB in the screen bundle.

For comparison, playing the ad video instead: 14.6 MB per open. At 50 venues × 2 TVs × 3 opens a day that is
~4.4 GB/day (~130 GB/month), and video files often aren't cached by TV browsers. The code port is effectively zero.
Device CPU/GPU use rises a little during effects; that's on the venue's hardware, not ours.

## 7. Open questions for Andrew

1. **Sound file** (Phase 2): do you have an explosion/whoosh you're licensed to use on the website, or should the
   Phase 2 agent find CC0 options for you to pick from?
2. **Sound off switch:** OK to ship with no switch (default), adding one only if a partner asks?
3. **Which devices** do your venues use for the display (Fire TV Stick, Chromecast/Google TV, smart-TV browser, a
   laptop)? Helps tune Phase 0's performance budget. Not blocking.

## 8. Standing rules (for future work on the venue display effects)

- The intro stinger plays on every load of `/venue/[venueId]/screen` except when `intro=0` (dashboard thumbnail only).
  "IT'S GAME TIME." never shows before 2.15 s.
- Every effect fires through `useFx` with a stable identity key; nothing fires on a poll tick or replays on reload
  (except the stinger).
- Canvas effects use pre-rendered sprites and the single `FxCanvas` loop; no per-frame `shadowBlur`, no animated CSS
  `filter`/`box-shadow`.
- Every effect has a reduced-motion version and degrades through the `full → lite → off` tiers.
- The screen never waits on an effect: stinger hard-stops at 5 s; effect errors drop the effect, not the screen.
- No new network requests for effects beyond immutable-cached assets loaded once per device.
- Game moments (plan §4 Phase 5) claim their identity through the engine's gate: canvas effects via `useFx` (`burst`,
  `shower`), CSS ones via `useFxMoment(key)` (`LightStreak`, `OneShotShine` in `fx/MomentOverlays.tsx`). Keys:
  `gameId:round` (question), `gameId:round:reveal`, `gameId:final`, `roundId` (letter slam), `roundId:results`,
  `golive:<takeover key>`; the round-break coin pop compares `fx.remember("leader:<gameId>")` with the new leader. A
  reload never replays one, because keys claimed before the gate arms are swallowed.
- State-driven cues are not moments: the last-5-s edge glow (`EdgeGlow`) and ring heartbeat follow the timer and are
  CSS only (transform/opacity); they show on a reload mid-countdown, by design.
- The display and `/tv` keep the TV awake via `useKeepScreenAwake()` only; it does nothing when embedded (the dashboard
  preview iframes), so an owner's phone is never held awake.
