# Venue Display Hype — Phase 5 Handoff (game moments)

Written 2026-11-12 by Claude Sonnet 5.5 (the plan's named model for Phase 5; the plan says high effort).

## For Andrew (plain English)

- **What changed:** the TV display now has a moment for each beat of a game, and each plays **once**:
  - **New question:** a light streak sweeps across the screen before the words.
  - **Last 5 seconds:** the screen edge glows in the timer's colour and the timer ring beats like a pulse.
  - **Correct answer:** a ring and a coin-and-spark burst fly out of the green check mark, and a shine crosses the answer.
  - **Round leaderboard:** if a player takes 1st place since the last break, their row gets a small coin pop.
  - **Final standings:** coins explode around the crown, then confetti rains over the whole screen (the old confetti was replaced; this one is lighter on the TV).
  - **Category Blitz letter slam:** the rings plus a spark burst land with the letter. **Results:** the winner row shines and pops.
  - **Go-live ("We're live"):** a gold coin and spark burst in the game's colours, same 1.85 seconds.
- **Reloads:** if a TV is reloaded or powered on in the middle of a game, it shows that moment's settled screen. It doesn't replay the effect. Regular screen refreshes never replay anything either. I checked both in a browser.
- **Is it live?** No. Not committed, pushed or deployed. No database, settings, cost or API changes.
- **Checked on a simulated slow TV:** each moment stays above 49 frames a second. On the weakest setting the app turns the coin effects off by itself and the CSS-only cues keep working.
- **Needs you:** nothing blocking. When convenient, look at the pictures in `docs/venue-display-hype_PHASE_5_after/`, and whether to commit Phases 0–5 (see below).
- **Heads-up:** Phase 4 (idle screen, built by another session at the same time) is also uncommitted in the working tree. I didn't touch its files. Phases 4 and 5 can be committed separately.

## For the next agent

### 1. Next phase and scope

**Phase 6 — Verification, performance and release** (plan §4 Phase 6; **Opus 5.5, medium**). Scope: every state × motion/reduced × 1920×1080 / 3840×2160 / phone portrait; ×6 throttled frame times vs `docs/venue-display-hype_PHASE_0_baseline/`; long run (accelerated 3 h idle + a game night; fx heap and canvas count flat); update `docs/tv-display-physical-device-checklist.md` (stinger, sound, bursts, moments); `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` (not typecheck and build together); PR, deploy, compare function invocations/bandwidth.

Out of scope for Phase 6: new effects, stinger changes. Out of scope for me (done): Phase 5 moments.

### 2. Starting state

- Branch `feature/venue-display-intro-stinger`, last commit `d71c2e92` ("phase 0 baseline + phase 3 effects layer and brand chrome"). Phases 0–3 are committed in it (not pushed). **Uncommitted, all in the working tree:**
  - **Phase 4 (another session, concurrent; has its own handoff `…_PHASE_4_HANDOFF.md` and browser results in `docs/venue-display-hype_PHASE_4_after/`):** `TvIdleAttract.tsx`, `IdleVenueScreen.tsx`, `tests/venue-screen-idle-moments-contract.test.ts`. Not touched by me. My Phase 5 clone included it (it was in the working tree), and one go-live window counted an extra effect that matched a 75 s idle slot boundary, so the idle burst does fire. `git status` also lists a pre-existing untracked `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`: not ours, leave alone.
  - **Phase 5 (mine):** listed in §4.
- Nothing pushed or deployed. No DB, env, migration, cron or Vercel changes. No backups needed.
- Andrew hasn't said whether to commit. Suggest a separate commit per phase, `git add` by path, asking first.
- Don't `git checkout -- <file>` to undo your own edit (wipes all uncommitted work in that file; see memory note).

### 3. Decisions made (don't re-ask)

- **CSS moments and canvas moments share one gate.** `FxEngine.claim(key)` (new) uses the same `createFxGate` as `fire`. So "never twice per page load" and "never for what was on screen at load / under the stinger" are one rule. `useFxMoment(key)` (new, `fx/useFx.ts`) returns `true` once if the claim is `play`. The claim happens in a `setTimeout(0)` inside the effect: the lint rule forbids setState in an effect body, and it means a panel unmounted in the same tick never claims.
- **One decision at mount, derived keys after.** A panel claims its moment key on mount; if it plays, `useFxAt(moment, delayMs, fire)` fires the canvas part later with a derived key (`…:burst`). So a reload (swallowed at mount) never even schedules the burst.
- **Round-break coin pop:** the payload has no previous rank, so the engine now has `remember(scope, value)` (per page life). `TvRoundBreak` remembers the leader per `gameId`; it pops only if there was a previous leader and it differs. A reload remembers silently (no pop), and the first break of a game has no previous leader (no pop).
- **Final standings:** the 72-node framer-motion confetti was **removed** and replaced by `fx.shower` (mixed coins + confetti in `CONFETTI_COLORS`) and `fx.burst` at the crown (22 coins, 34 sparks, ring). So a TV with canvas effects `off` shows no confetti (previously it did). Reduced motion had none already.
- **Letter slam:** the three CSS rings are kept (gated by the moment, so a reload doesn't replay them); the 14 CSS spokes were replaced by `fx.burst` sparks (`coins: 0`).
- **"Behind the answer" isn't possible:** the canvas is one layer at z 60, above the stage. The reveal burst is anchored to the green check badge (left of "Correct answer") so sparks radiate from it rather than from the answer's centre; text is not covered for more than a moment.
- **Last-5-s cues are state-driven CSS, not moments** (plan table says "CSS, no fx"): `EdgeGlow` in the timer's colour (red at ≤ 5 s, matching the ring; the plan said "accent"), ring heartbeat via a wrapper `scale` loop. They show on a reload mid-countdown. Reduced motion: edge glow held still at 0.45 opacity, no ring beat.
- **Burst sizes scale with the stage** (`size: N * stageScale()`), so at 4K they aren't tiny. Round-break/Blitz-winner bursts anchor at 16 % across the row (`pointIn(el, 0.16)`), next to the name rather than the row centre.
- **Go-live burst:** fires 340 ms after the takeover mounts (as the wipe lands). If the takeover mounts within ~1 s of the stinger ending, the gate swallows it (rare: idle → live flip during the stinger).
- **Question streak** is a new `LightStreak`, in addition to the existing top-bar sweep (kept). **Answer shine:** `OneShotShine` inside an `overflow-hidden` overlay span so the text glow isn't clipped.
- Entrances (words, rows, letter flight, podium bars) still run on mount, as before. They are not "moments"; only effects are gated.

### 4. Files

- **New:** `components/venue-screen/fx/MomentOverlays.tsx` (`LightStreak`, `OneShotShine`, `EdgeGlow`; transform/opacity only; `LightStreak`/`OneShotShine` return `null` under reduced motion, only ever mounted after a claim, so no hydration risk); `tests/venue-screen-game-moments-contract.test.ts` (15 tests); `docs/venue-display-hype_PHASE_5_after/` (9 screenshots, `README.md` with counts, two `.mjs.txt` scripts); this note.
- **Engine:** `fx/fxEngine.ts` (`claim`, `remember`), `fx/useFx.ts` (`moment`, `remember` on `FxApi`; `NOOP_FX`; new exports `useFxMoment`, `useFxAt`, `stageScale`, `pointIn`).
- **Panels:** `TvQuestionReveal.tsx` (+`gameId`, streak, edge glow, ring beat), `TvAnswerReveal.tsx` (+`gameId`, burst via `badgeRef`, shine), `TvRoundBreak.tsx` (+`gameId`, leader pop, `leaderRowRef`), `TvFinalStandings.tsx` (fx shower + burst, `crownRef`, old confetti and its RNG removed), `TvLetterReveal.tsx` (slam moment, edge glow, ring beat, spokes removed), `TvBlitzResults.tsx` (+`roundId`, winner shine/burst), `TvGoLiveTakeover.tsx` (+`momentKey`, `SPARKS` per game).
- **Wrappers:** `LiveTriviaScreen.tsx`, `LiveTriviaRevealScreen.tsx`, `LiveTriviaIntermissionScreen.tsx` pass `gameId={live.gameId}`; `CategoryBlitzIntermissionScreen.tsx` passes `roundId`; `VenueScreenClient.tsx` passes `momentKey={liveTakeover.key}`.
- **Docs:** plan status line + §8 standing rules; `CLAUDE.md` feature-rules row for the display (one clause added).
- `lib/venueScreen.ts` (the answer-reveal security gate) is **untouched**; a test pins the `phase === "reveal"` gate.

### 5. Facts and traps

- **`innerText` follows CSS `text-transform`**: "Correct answer" is `CORRECT ANSWER` in `innerText`. Match case-insensitively in Playwright. Question text is split into per-word inline-block spans; match a single word (`1993`).
- **Detecting canvas effects:** twinkles are ambient and live (`liveCount()` ≥ 1), so pixel counts can't tell a small pop from twinkle noise (noise ≈ 240 px at 1080p; a 9-coin pop ≈ 415). Count rising edges of `engine.liveCount()` from a sampler that runs the **whole** time. A window that starts after the screen appears misses effects that fire at +320–1000 ms. `window.__fx = engine` was added in the **clone only** (`FxCanvas.tsx`); don't put it in the repo.
- **Poll intervals in the mock:** idle polls every 20 s, intermission 4 s, question/reveal 1 s. To test a moment, load a page in a state with a fast poll (a round break), and serve states with `page.route`. Idle → live takes ≤ 20 s.
- **Port 3157 may be taken** by another session's clone (this time PID 69963, cwd in another session's scratchpad). I used port **3171** and killed only my own server (`pkill -f "next start -p 3171"`). Never `pkill next`.
- **React #418 hydration warning** appeared on `/tv/fx-baseline/lt-intermission` in 2 of 3 full harness runs but in none of ~100 other loads. Hypothesis (unproven): the server renders the countdown digit from the server's `Date.now()` and the client re-reads its own, so a second boundary between them changes the text. It pre-dates Phase 5 (my round-break change adds only a `ref`). If Phase 6 sees it in production logs, fix by rendering the countdown from `state.updatedAt` on the first client render.
- **4K in headless:** the watchdog drops to `off` within ~1 s, so no 4K burst is visible in headless (same as Phase 3). Only a real 4K TV settles this.
- **Fire TV Stick concern from Phase 0 still stands:** the intro stinger is the heaviest thing (≈ 7 fps at ×6 headless). Phase 5 moments are light by comparison.
- **ESLint `react-hooks/set-state-in-effect`** rejects `setState` directly in an effect body; call it from a timer/subscription callback. Reading `ref.current` during render is also rejected.
- Clone recipe (worked): `rsync -a --exclude node_modules --exclude .next --exclude '.env*' --exclude .git --exclude docs --exclude data --exclude tests ./ <clone>/`, `rsync -a data/ <clone>/data/`, `cp -Rc node_modules <clone>/`, copy the three harness files from `docs/venue-display-hype_PHASE_0_baseline/harness/` (`fxBaselineFixtures.ts.txt` → `lib/`, `fx-baseline-page.tsx.txt` → `app/tv/fx-baseline/[name]/page.tsx`, `mock-state-route.ts.txt` → `app/api/venue-screen/state/route.ts`), then `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy npx next build` (~4 min) and `… npx next start -p <port>`. There is no `timeout` command on this Mac; run the build in the background.

### 6. Build, run, test, verification

- `npx tsc --noEmit` ✔ · `npx eslint components/venue-screen tests/venue-screen-game-moments-contract.test.ts` ✔ · `npm run test` ✔ (527 files, 6,996 tests; run before the last docs-only edits, which touch `CLAUDE.md`, so re-run). `npm run build` not run in the repo (ran in the clone ✔, three times).
- **Browser** (production build in a clone, port 3171, Chromium 149): the table of counts is in `docs/venue-display-hype_PHASE_5_after/README.md`: every moment fires exactly once on a live page, 0 on polls, 0 on reloads of all 7 states, 0 under reduced motion; ×6 throttle frame times 13–21 ms (49–77 fps); no console errors apart from the #418 note above. Screenshots checked by eye: question streak, reveal burst, round-break pop, final, letter slam, blitz winner, go-live, last-5-s glow.
- **Not verified:** a real TV; 4K bursts; long-run heap and canvas count (Phase 6); bracket/squares unaffected (not touched); the go-live burst when the takeover lands right after the stinger (swallowed by design); Safari/iOS Expand overlay.

### 7. Open questions for Andrew

1. Commit Phases 4 and 5 (and when)?
2. Edge glow is red in the last 5 s (matches the ring). The plan said "accent colour". Keep red? (Default: yes.)

### 8. Recommended first steps (Phase 6, Opus 5.5, medium)

1. Read plan §3, §4 Phase 6, §8; this note §2–§5; `docs/venue-display-hype_PHASE_3_after/` and `_PHASE_5_after/` READMEs.
2. Build the clone with the recipe in §5, re-run `docs/venue-display-hype_PHASE_5_after/verify5.mjs.txt` (copy it as `.mjs` next to a `node_modules` symlink; add the `window.__fx` line to the clone's `FxCanvas.tsx`), then the Phase 0 `capture.mjs` for baseline comparison.
3. Do the long-run (accelerated clock) heap check; decide on the stinger weight (Phase 0 handoff §5 has options) only if the real-TV run shows stutter.
4. Update `docs/tv-display-physical-device-checklist.md`; hand Andrew the real-TV run.
