# Phase 3 handoff — pre-game screen UI + idle app-download screen

## For Andrew

Done and checked in a real browser. **Not committed, not pushed, not live.**

- **Pre-game screen** (15 minutes before a Live Trivia game): a big "Starts in 14:59" countdown, "Round 1: <category>"
  underneath when one is set, then three steps side by side: **1 Get the app** (QR + `hightopchallenge.com/app`),
  **2 Sign in**, **3 Tap Live Trivia** (a bigger copy of the real Venue Home button). The countdown flips digits and
  beats in the last 5 minutes. A light streak and shine play once when the screen appears.
- **Idle screen** (nothing on): a still QR to download the app, "Get the app", the Hightop wordmark, the venue name and one
  small line, "Live Trivia · Tomorrow 8:00 PM", when a game is scheduled. Your answer to Q5 was yes. The "Next up"
  carousel and the "Live Trivia · Category Blitz" tagline are gone. The gentle motion is all around the QR (glow, rings,
  wordmark shine, slow drift); the QR itself never moves.
- Checked: the QR decodes (jsQR) at 1080p and when the screenshot is shrunk to 20 %; idle → pre-game shows **no** "We're
  live" burst; pre-game → live shows it **exactly once**. 1280×720, 1920×1080 and 3840×2160 look right.
- **Needs you:** (1) commit and push when you're happy (I only committed Phase 2, as you said). (2) Look at the wording:
  "Starts in", "Get the app", "Sign in", "Tap Live Trivia". (3) A real TV: scan the QR from your usual seating.
  Phase 3 can't be shipped alone to venues without Phase 2 (already committed) — both ship together with Phase 6.

## For the next agent (Phase 4: short display link + Display page rewrite) — Opus 5.5, high effort

### 1. Goal and scope
Plan §4 Phase 4 (migration `venues.display_code`, `app/tv/[code]/route.ts`, `app/tv/page.tsx` → `/info`, Display page rewrite,
`sendVenueAddedEmail` link, tests). Out of scope: deleting Link a TV code (Phase 5), anything in the display components.

### 2. Starting state
- Branch `feature/live-trivia-pregame-display`. HEAD `625219bc` (Phase 2). Phase 3 is **uncommitted** working-tree changes
  (files in §4). Nothing pushed or deployed. No migrations, data changes or env vars in Phases 2–3.
- Untracked `* 2.ts/.m4a/.mp4/README 2.md` duplicates and two `docs/*_BACKFILL_LOG_*.json` files are not ours; leave alone.
- Branches 2–3 and 4–5 can run in parallel per the plan; Phase 4 does not depend on Phase 3's files.

### 3. Decisions (don't re-ask). Full list in plan §1.
D1–D14 unchanged. New this phase: **Q5 = yes** (idle keeps one small next-Live-Trivia line). The idle burn-in drift stays
(whole composition drifts ~0.1 px/s, ≤26 px over 227 s; QR scans fine); only the QR plate has no animation of its own.

### 4. Files
- `components/game-themes/GameTileFace.tsx` (new): backdrop + title + subtitle slot + art of a game button. Used by
  `components/venue/VenueGamesPanel.tsx` (phone; markup unchanged, game-themes tests green) and by the TV replica.
- `components/venue-screen/TvLiveTriviaPregame.tsx` (new): the pre-game screen. Tile = `GameTileFace` at the phone's 380 px
  width, `transform: scale(2.2)` inside a fixed 836×387 box. Entrance moment key `pregame:<gameId>` (`useFxMoment`):
  `LightStreak` + `OneShotShine`. Heartbeat ring under 300 s (`PREGAME_HEARTBEAT_UNDER_S`). Flip digits use
  `useReducedMotionAfterHydration` (added to the SSR contract list).
- `components/venue-screen/AppDownloadQr.tsx` (new): QR to `APP_DOWNLOAD_URL`, white plate, 4-module quiet zone,
  `appDownloadQrPlatePx(size)`. No motion code allowed in it (contract test).
- `components/venue-screen/TvIdleAttract.tsx` (rewritten): wordmark + venue + next-game line (left), QR (right) with
  halo/rings behind the plate. `IdleVenueScreen.tsx` now just passes `nextLiveTriviaStartsAt`; `getIdleGameDisplay` and the
  schedule-day formatter were deleted (dead). `formatIdleCountdown` stays (pre-game uses it).
- `lib/venueScreenIdleLine.ts` (new, pure): `formatNextLiveTriviaLine(startsAt, nowMs)` → "Live Trivia · Today|Tomorrow|<Weekday> h:mm AM/PM" in the **device's** time zone; null if none/past.
- `components/venue-screen/fx/FlipChar.tsx` (moved out of the idle file), `fx/useHydrated.ts` (new).
- `components/venue-screen/VenueScreenClient.tsx`: placeholder `LiveTriviaPregamePanel` deleted; renders `TvLiveTriviaPregame` with `theme.accent`.
- Tests: new `tests/venue-screen-pregame-components.test.ts`, `tests/lib.venueScreenIdleLine.test.ts`; rewritten
  `tests/venue-screen-idle-components.test.ts`, `tests/venue-screen-idle-moments-contract.test.ts`; edited `tests/venue-screen-reduced-motion-hydration-contract.test.ts`.

### 5. Facts and traps
- Gradient text (`background-clip:text`) paints only inside its own box: the wordmark needs the `paddingBottom/marginBottom`
  pair or the g and p lose their tails. Its wrapper also needs right padding (negative letter-spacing clips the last glyph).
- The next-game line is device-time text, so it renders only after hydration (`useHydrated`); SSR markup is the same with or
  without a scheduled game. Don't use `suppressHydrationWarning` (it keeps the server's wrong time zone).
- Rings/halo sit behind the plate; the heading and URL caption are `relative` so rings never paint over them.
- Sponsor slots (`idle.sponsorSlots`) were never drawn by the old idle screen either; still not drawn.
- The 75 s idle burst is anchored on the wordmark (not the QR).
- Dev-only console error "tree hydrated but some attributes … didn't match" appears intermittently on idle (the drift
  transform is computed from `nowMs`, which differs server vs client). Pre-existing (README §5 of the hype Phase 6 results). Not fixed.
- Playwright's fake clock can't drive screen changes; the sequence run used real time (hype Phase 6 handoff §5).

### 6. Build / test / verify
- `npm run test` 537 files, 7,072 tests ✔ · `npx tsc --noEmit` ✔ · `npx eslint components lib tests scripts` ✔ (the repo-wide `npm run lint` still fails on `tmp/` build output; use `--ignore-pattern 'tmp/**'`).
- Browser (scratchpad clone, dummy Supabase env, `next dev -p 3190`, mock `/api/venue-screen/state` and fixture page `/tv/h/<name>`; server stopped, `3000` and `3111` untouched):
  screenshots of pre-game and idle at 1280×720 / 1920×1080 / 3840×2160 (no console errors); jsQR decodes the QR at 1080p
  and at 0.5/0.33/0.25/0.2 scale; real-time run: idle at 0.9 s → pre-game at 20.3 s (first idle poll, **no takeover**) →
  "We're live" at 52.5 s (once) → live at 54.3 s.
- **Not verified:** a real TV/Fire Stick; a real phone camera at 4 m (jsQR is only a proxy; the QR plate is ~11 in wide on a 55" TV, so expect ~3–4 m); light/dark nothing applies; text ≥ 12 px is enforced by the existing contract (the smallest on-canvas copy is the idle footer, 22 px canvas); `scripts/verify-venue-screen-overflow.mjs` was not re-run against these screens (needs a seeded dev venue) — run it in Phase 6, and add a pre-game fixture to it.
- Cost: no new requests, polls or reads in Phase 3.

### 7. Open questions
- Wording sign-off (above). Real-TV QR scan test.

### 8. First steps for Phase 4
Read plan §4 Phase 4 and `docs/partner-business-type-plan_PHASE_1_BACKFILL_LOG_2026-11-12.json` for the backfill-log pattern;
write the migration as a new file; `supabase db push` only with Andrew's go-ahead. Phase 6 must add to the "Standing rules":
the `pregame:<gameId>` moment key, "the QR is never animated or covered", and `GameTileFace` as the one tile face.
