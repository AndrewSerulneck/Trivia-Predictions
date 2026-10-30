# Reel Video Assets Plan — 9:16 Instagram Reel / Ad for Hightop Challenge

**Status:** Plan written 2026-10-22. No phase started. Phase 0 (Andrew's decisions) is next.
Handoffs go next to this file as `docs/reel-video-assets-plan_PHASE_<N>_HANDOFF.md`.

## Summary for Andrew (plain English)

You will end up with a folder, `video-assets/`, holding ready-to-drop clips for CapCut. It will have
six animated graphics (intro logo, four feature callouts, end card), four simulated "phone screen
recordings" of the app with the callouts already on them, a second-by-second storyboard, and an end
card with the official App Store and Google Play badges. Everything is drawn and recorded on your
Mac by a script, so you don't need to film your phone. It costs nothing to run: no cloud services
and no API credits.

**Decided 2026-10-22 (Andrew):** bar owners are sent to **"Link in bio"** and **hightopchallenge.com**,
never to the stores. The **App Store and Google Play badges appear on the last screen only**, as a
quiet "available on" mark; they're never mentioned in the voiceover or framed as the owner's next
step. Push notifications are being built (native plan Phase 5), so the push line can stay.

**Still to decide before Phase 1 (details in §1):**
1. **The script runs about 45 seconds, not 30.** It's ~125 words, and a fast ad read is ~160 words a
   minute. Either keep the full script and make a 45 s cut, or use the trimmed 30 s script in §1.1.
2. **Don't publish until the claims are true.** Push notifications (native plan Phase 5) and, for
   "to your regulars", partner-sent pushes (Phase 5b, not yet agreed) must be live. Both store
   listings must also be live before the badges can appear, because both stores' rules allow the
   badge only for an app people can download. The assets can be built now.
3. **Voiceover source:** your own recording, a hired voice, or AI text-to-speech. The final timings
   follow the real voiceover length.

## Phases at a glance

| Phase | What | Model | Effort | Who |
|---|---|---|---|---|
| 0 | Answer §1's four decisions | — | — | Andrew |
| 1 | Folder, tooling, frame-accurate render pipeline, one test clip | Sonnet 5.5 | medium | Claude |
| 2 | Six motion-graphic components (stinger, 4 callouts, end card without badges) | Opus 5.5 | high | Claude |
| 3 | Four simulated app-UI scenes + `record-ui-simulations.js` → MP4s | Opus 5.5 | high | Claude |
| 4 | `STORYBOARD.md`: second-by-second timing + CapCut instructions | Sonnet 5.5 | medium | Claude |
| 5 | Official store badges on the end card (+ a no-badge variant) | Sonnet 5.5 | low | Claude + Andrew |
| 6 | Assemble in CapCut, review, optional fix pass | Sonnet 5.5 (fixes) | low | Andrew |

Phases 2 and 3 use Opus because how it looks *is* the deliverable: brand-faithful layout, motion
timing and a believable copy of the real screens. Phases 1, 4 and 5 are mechanical.

Every phase ends with its handoff note (global CLAUDE.md rules) and a status-line update here.

---

## 1. Decisions for Andrew (Phase 0)

### 1.1 Length — recommend: **make both cuts**, 30 s trimmed for the ad and 45 s full for organic Reels

Full script ≈ 125 words ≈ 45–47 s at 160 wpm. Reading it in 30 s needs ~250 wpm, which is too fast
to follow. Trimmed 30 s script (~77 words, no feature it can't back up):

1. "What if your bar had its own trivia and sports app?"
2. "That's exactly what we built."
3. "Host trivia nights, bingo, NFL pick 'em and more — guests play right from their phones."
4. "Games are geofenced, so guests have to be at your bar to play."
5. "Offer prizes to the winners, and they'll come back week after week."
6. "Promote your specials right inside the app." *(only if Andrew confirms a partner can do this
   today; see 1.2)*
7. "Skip the AI-generated social posts. Give your guests an elevated experience — with Hightop Challenge."

### 1.2 Feature claims — the ad must not run before they are true

- Push notifications: **not built yet**. They're coming in native plan Phase 5 (Andrew, 2026-10-22).
  "To your regulars" means a *partner* sends them, which is the unagreed Phase 5b (native plan §6
  item 4). The `scene-push-promo` scene can be built now. The ad runs only after the feature ships.
- Menu items / promotions: the only thing like this is the **admin-managed** ad-slot system
  (`lib/adSlotRegistry.ts`, `lib/adPlacements.ts`, `/advertise`). Partners can't post their own
  promotions from the Partner Dashboard. Andrew must say whether "your specials, placed in the app
  for you" is an accurate offer. If not, drop line 7 and the `callout-push` / `scene-push-promo`
  assets (Phase 3 then builds three scenes, not four).
- If push stays in the plan as a *future* feature, the scene must not show it as shipping.

### 1.3 Call to action — DECIDED (Andrew, 2026-10-22)

The audience is bar owners. Their path is **"Link in bio"** (Instagram) and **hightopchallenge.com**,
never the store app, which is players-only (`docs/native-app-store-plan.md` §2 item 12). End card,
top to bottom: logo, "Elevate Your Guest Experience", the button graphic "Get Started Today", then
**"Link in bio · hightopchallenge.com"** as the large action line. Last and smallest: an "Available on"
row with the App Store and Google Play badges, for marketability. No voiceover mentions them, and no
arrow or button points owners at them.

**The badges can appear only once both store listings are live.** Apple Developer and Google Play
enrolment are still in progress (native plan status line). Phase 5 renders two end cards (with and
without badges), so a version without badges can run earlier.

### 1.4 Voiceover and music

Record the voiceover **before Phase 4**, because the storyboard timings come from it. Use music that
is licensed for ads. Instagram's in-app music library is often blocked for ads; CapCut's commercial
library is safer, but check its licence terms.

---

## 2. Technical decisions (already made — don't re-ask)

1. **Location:** `video-assets/` at the repo root with `components/`, `scenes/`, `renders/`,
   `raw-recordings/`, `assets/` (fonts, logos, icons, badges copied in), plus its own
   `package.json`, like `native/`. It must never touch the Next.js app. Add `/video-assets` to
   `.vercelignore`, `"video-assets"` to `tsconfig.json` `exclude`, `'video-assets/**'` to the
   `eslint.config.*` `ignores`, and git-ignore `video-assets/renders/`, `video-assets/raw-recordings/`
   and `video-assets/node_modules/`. Commit the source HTML and scripts, never the MP4s.
2. **Self-contained, offline HTML.** Each component is one HTML file with embedded CSS keyframes
   plus a shared `video-assets/assets/tokens.css`. **Not the Tailwind CDN:** a network script makes
   renders vary and can fail mid-render. Colours come from the brand tokens
   (`design-system/project/colors_and_type.css` and `lib/themeTokens.ts`), copied in, not invented.
   Fonts are Bree Serif (display) and Nunito (body) from `@fontsource/bree-serif` and
   `@fontsource-variable/nunito` in `video-assets/package.json`. `design-system/project/fonts/` holds
   only a README. Logo: `public/brand/web/htc-logo-512.webp` (or `public/brand/logo.svg`). Game icons:
   `public/brand/*-icon.png`. The app's Tailwind-only / no-inline-style rules don't apply in this
   folder (it isn't app code), but the 12 px text floor and "minimal and simple" design rules do.
3. **Stage:** every file renders at **1080×1920**. App-UI scenes put the UI in a 360×640 container
   scaled 3× (CSS `zoom: 3`), so the sizes match the real app's CSS values and text stays crisp.
4. **Frame-accurate capture, not real-time screen recording.** At 1080×1920, real-time recording
   (`puppeteer-screen-recorder`, Playwright `recordVideo`) drops frames, and `recordVideo` outputs
   low-bitrate VP8. Instead each page exposes a **seek contract**:
   `window.__REEL__ = { durationMs, fps: 30, seek(ms) }`. `seek` pauses all CSS animations
   (`document.getAnimations()` → `pause()`, `currentTime = ms`) and sets any scripted state (scroll
   position, typed text, pin pulse) as a pure function of `ms`. **No `setTimeout`/`setInterval`/
   `requestAnimationFrame` timing in a scene.** The capture script seeks each frame, takes a
   screenshot and pipes the frames to ffmpeg. Output is identical on every run.
5. **Tooling:** Playwright (already in the root `node_modules`, Chromium 1234 cached in
   `~/Library/Caches/ms-playwright`). Add `playwright` to `video-assets/package.json` anyway, so it
   stands alone. ffmpeg is **not installed**: use `ffmpeg-static` (npm). Playwright's bundled
   `ffmpeg-1011` encodes VP8 only and can't make H.264/ProRes.
6. **Output formats per clip:**
   - `*.mp4`: H.264, yuv420p, 30 fps, 1080×1920, CRF ~18, opaque (dark backdrop). For scenes and the
     stinger and end card.
   - `*-alpha.mov`: ProRes 4444 with transparency, for callouts to place over other footage.
   - `*-green.mp4`: the same callout on #00FF00, a fallback if CapCut won't read the alpha `.mov`
     (CapCut → Cutout → Chroma key).
   - `*-poster.png`: one still frame.
7. **Reels safe zones:** keep text and badges out of the top 250 px, the bottom 420 px (caption and
   the ad CTA button cover it) and the right 140 px (like/share rail). Check Meta's current numbers
   in Phase 2. `video-assets/assets/safe-zones.png` is a guide image that is never rendered into output.
8. **Simulated UI must look like the real app.** Phase 3 recreates the real screens from the real
   components, never generic mock-ups. A viewer who downloads the app should see what the ad showed.

---

## 3. Phase details

### Phase 1 — Scaffold + render pipeline (Sonnet 5.5, medium)
- Create the folders and config edits from §2.1. In `video-assets/`, `npm init` and install
  `playwright`, `ffmpeg-static`, `@fontsource/bree-serif` and `@fontsource-variable/nunito`.
- `video-assets/assets/`: `tokens.css` (brand colours, font faces), copied logo and icons, `safe-zones.png`.
- `video-assets/lib/reel-runtime.js`: the seek contract helper the pages include (pauses animations,
  seeks, provides a `progress(ms, startMs, endMs, easing)` helper for scripted motion).
- `video-assets/capture-assets.js`: `node capture-assets.js [name…] [--formats mp4,alpha,green,poster]`.
  Opens each `components/*.html` / `scenes/*.html` over `file://`, waits for `document.fonts.ready`,
  seeks frame by frame and encodes to `renders/`. Write to a temp name, then rename: `~/Documents` is
  iCloud-synced and makes `name 2` copies of files that change mid-sync (see
  `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`).
- `video-assets/preview.html`: lists every component and scene, plays each live and scaled to the
  window, and has a scrub slider wired to `seek()` and a safe-zone toggle.
- Prove it with one throwaway `components/_test.html` (a 3 s fade + move): run `ffprobe` (from
  `ffmpeg-static`'s sibling or `ffmpeg -i`) and confirm 1080×1920, 30 fps, 90 frames, correct
  duration, and that the alpha `.mov` really has an alpha channel.
- Run `npx tsc --noEmit`, `npm run lint` and `npm run test` from the repo root. They must be unchanged
  (this folder is excluded).

### Phase 2 — Motion-graphic components (Opus 5.5, high)
Build the six files in `video-assets/components/`, each with `durationMs` and a smooth entrance and
exit: `stinger.html` (logo reveal, glow, "The Social Gaming Platform for Bars", ~2.5 s);
`callout-games.html` ("Trivia • Bingo • Pick 'Em • Fantasy Sports", with the real game icons;
transparent backdrop); `callout-geofence.html` (pulsing radar and pin, "📍 Geofenced to Your Venue" /
"Players must be in your bar to play"); `callout-rewards.html` ("$15 Off Tab" voucher drawn as **the
app's real gift-card prize design**, `components/prizes/PrizeCard.tsx` + `lib/prizeCardFace.ts` +
`PRIZE_CARD` in `lib/themeTokens.ts`; `npm run prize-card:render` draws a specimen to copy from,
never a new card style), plus "Drive Repeat Guests"; `callout-push.html` (only per §1.2; an iOS-style
banner); `end-card.html` (logo, tagline, "Get Started Today" button graphic, "Link in bio ·
hightopchallenge.com", and a small "Available on" badge slot at the bottom that Phase 5 fills,
inside the safe zone). Use **Prize** in on-screen copy, never "Reward" (project wording rule). Render all formats
and check each poster frame against the safe zones.

### Phase 3 — Simulated app-UI scenes (Opus 5.5, high)
`video-assets/scenes/` + `video-assets/record-ui-simulations.js` (a thin wrapper over the Phase 1
capture that renders each scene twice: `scene-*.mp4` with the matching callout baked in, and
`scene-*-clean.mp4` without it). Before drawing, read the real screens: venue home and game cards
(`components/venue/`, copy in `lib/venueGameCards.ts`), the prize wallet (`components/prizes/`), the
join and location flow (`components/join/`), and the signup geofence map
(`components/signup/`). Use `design-system/project/ui_kits/web/` and `design-system/project/screenshots/`
for reference; they're older, so the components win where they differ. Scenes:
- `scene-dashboard`: venue home with a smooth scroll through the game cards (Live Trivia, Prop Bingo,
  Pick 'Em, NFL Pick 'Em, Fantasy), 6–8 s.
- `scene-geofence`: venue location check, a map with a geofence circle and a pulsing pin, then
  "You're in". The map is a drawn stylised map, **not** a Google Static Maps capture (keeps it free
  and avoids Google's terms on reuse).
- `scene-rewards`: the prize wallet; a $15 Off Tab card flips and the redeem sheet's live coupon shows.
- `scene-push-promo`: only per §1.2.
Use made-up venue, player and prize names. Never use production data or a real venue's branding
unless Andrew provides it and says to.

### Phase 4 — Storyboard (Sonnet 5.5, medium)
Write `video-assets/STORYBOARD.md`. Timed to the **real voiceover** (put it in
`video-assets/raw-recordings/voiceover.*`; read its length with ffmpeg). If it isn't recorded yet,
time to the draft in §4 and say so. For each line: start–end seconds, background clip, overlay,
CapCut steps (keyframe zoom start/end %, position, the text animation preset name, transition and
its length), SFX cue (whoosh on callout enter, soft pop on the pin, chime on the voucher, ding on the
notification), and the caption text. Add CapCut project settings (9:16, 1080×1920, 30 fps; export
1080p 30 fps, high bitrate) and a "muted viewers" note: burned-in captions on every line.

### Phase 5 — Store badges (Sonnet 5.5, low + Andrew)
Download the **official, unmodified** badges: Apple "Download on the App Store" (black) from Apple
Marketing Tools (`https://tools.applemarketingtools.com/`) and Google "Get it on Google Play" from
`https://play.google.com/intl/en_us/badges/`. If a download needs a browser, Andrew downloads them
and puts them in `video-assets/assets/badges/`. Follow each store's current guidelines (re-read at
the time): no recolouring, no redrawing, minimum size and clear space, the same height when shown
side by side, and the official localised wording. Render `end-card.mp4` (with badges) and
`end-card-web-only.mp4` (no badges). The with-badge version is for use **only after both listings
are live** (§1.3).

### Phase 6 — Assembly (Andrew) + optional fixes (Sonnet 5.5, low)
Andrew builds the edit in CapCut from `STORYBOARD.md`. He notes anything that looks wrong on a phone
(safe zones, text size, timing) and a fix pass re-renders those clips only.

---

## 4. Draft timing — 30 s trimmed cut (Phase 4 refines it to the real VO)

| Time | VO line (§1.1) | Background | Overlay |
|---|---|---|---|
| 0.0–3.0 | 1 "What if your bar…" | `scene-dashboard-clean` (fast push-in) | large hook text in CapCut |
| 3.0–5.0 | 2 "That's exactly what we built." | — | `stinger` (full screen) |
| 5.0–11.0 | 3 "Host trivia nights, bingo…" | `scene-dashboard` | `callout-games` (baked in) |
| 11.0–15.5 | 4 "Games are geofenced…" | `scene-geofence` | `callout-geofence` |
| 15.5–20.0 | 5 "Offer prizes…" | `scene-rewards` | `callout-rewards` |
| 20.0–23.0 | 6 "Promote your specials…" (if kept) | `scene-push-promo` | `callout-push` |
| 23.0–30.0 | 7 "Skip the AI-generated… Hightop Challenge." | — | `end-card` (hold the last 3 s) |

The 45 s full cut uses the same order with each scene about 1.5× longer. The full script's line 8
("Stop trying to attract business with AI…") plays over a quick montage of the clean scenes before
the end card.

## 5. Cost

All local: Playwright + ffmpeg on the Mac. **$0 recurring, no cloud, no API calls, no
database reads.** A full render of ~12 clips × 4 formats is a few minutes of CPU. Renders aren't
committed (git-ignored), so the repo doesn't grow. They do sync to iCloud (~1–2 GB at most for all
formats). If that's a concern, Phase 1 can add `REEL_RENDER_DIR` to send renders to
`~/Movies/hightop-reel/`.

## 6. Risks / unverified

- CapCut's alpha `.mov` support differs between desktop and mobile versions, hence the green-screen
  fallback. Phase 2 should record which one Andrew's CapCut accepts.
- The Reels safe-zone numbers change. They're a guide, re-checked in Phase 2.
- The store badge guidelines and URLs are as remembered on 2026-10-22. Re-read them in Phase 5.
