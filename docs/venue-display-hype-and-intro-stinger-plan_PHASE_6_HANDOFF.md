# Venue Display Hype — Phase 6 Handoff (verification, performance, release)

Written 2026-11-12 by Claude Opus 5.5 (the plan's model for Phase 6; run at medium effort, as named).

## For Andrew (plain English)

- **What I did:** tested the whole new TV display (intro, sound, idle bursts, game moments) at TV size, 4K, phone
  size and with "reduce motion" on, then ran a simulated 3-hour idle stretch and three back-to-back game nights.
- **Three problems found and fixed:**
  1. With "reduce motion" switched on, some screens logged an error on load and redrew themselves. This was there
     before this project. Fixed.
  2. On a 4K TV that struggles, the slowly drifting background colours made game screens choppy. Now, if the TV is
     struggling, the colours stop drifting (the same switch that already turns the coin effects down).
  3. After one brief slowdown, the effects turned themselves off for the rest of the night. Now they step down one
     notch at a time and try again a minute later, so a hiccup no longer kills them.
  Also: when a TV blocks sound (most do), the second sound used to play on its own. Now both stay silent together.
- **Is it live?** Not yet. The work is committed and pushed to PR #12 (`feature/venue-display-intro-stinger`).
  Vercel builds a preview of the PR automatically. Merging the PR puts it live.
- **Cost:** no new API calls, polls, crons or database reads. Each TV downloads about 222 KB of new files once
  (logo 179 KB, two sounds 43 KB, keep-awake clip 1 KB), then caches them.
- **Needs you:**
  1. **Say whether to merge PR #12** (that's the production deploy). You can test the preview link on a TV first.
  2. **Run the real-TV check:** `docs/tv-display-physical-device-checklist.md` section F (Fire TV Stick first): the
     intro after power-on, sound, leave idle running an evening, watch a game.
  3. Sound licence: confirmed by Andrew 2026-11-13.

## For the next agent

### 1. Goal and scope
The plan has no Phase 7. What remains is **release follow-up**: merge PR #12 when Andrew says so; act on his
real-TV checklist results; compare Vercel usage after release (step 5 of plan §4 Phase 6). Out of scope unless
Andrew asks: new effects, stinger redesign. Candidate follow-ups are in §7.

### 2. Starting state
- Branch `feature/venue-display-intro-stinger`. Commits on top of `main` (`0dc4251d`): `4b4cc05f` (Phases 1–2),
  `d71c2e92` (0 + 3), `b395bb25` (4), `252fa61d` (5), and the Phase 6 commit (this note, the fixes and
  `docs/venue-display-hype_PHASE_6_after/`). Pushed; PR #12 updated. `main` had not moved since `0dc4251d` when
  this was written.
- **Not merged or deployed to production.** No DB, env, migration, cron or `vercel.json` changes in any phase.
- **Another session was working in the same folder at the same time** on "partner business type" (signup wizard,
  admin billing, a new migration `supabase/migrations/20261112214307_partner_business_type.sql`, their own plan
  `docs/partner-business-type-plan*.md`). None of that is in my commits. Leave it alone; it's theirs. Also
  untracked and not ours: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.

### 3. Decisions made (don't re-ask)
- **Watchdog recovery** replaces Phase 0's "drop and stay off": hold 3 s after a drop (`FX_TIER_HOLD_MS`), retry one
  tier up after `fxTierRetryDelayMs(drops)` (60 s × 2^(drops−1), cap 32 min), never above `ceiling` (the reduced
  motion / ≤ 2-core tier). A device that's really too slow stutters for about 1 s at each retry, at most once every
  32 min once it settles. Reduced-motion changes reset the counter.
- **BrandStage follows the tier**: at `off` the washes glide to their home positions over 1.2 s and stop.
- **Hydration-safe reduced motion**: element existence uses `useReducedMotionAfterHydration()`; framer's hook stays
  for animation values. On a reduced-motion TV the first frame matches the server and the motion-only elements drop
  on the next render.
- **Sound all-or-nothing**: a rejected boom sets `soundBlocked`; the shine is skipped.
- **No `npm run build` in the shared working tree** (another session's half-done work plus Andrew's dev server on
  `.next`). The production build was run on a clean `git archive` of the Phase 6 commit instead (see §6).
- Edge glow stays red in the last 5 s (Phase 5 default; Andrew didn't object).

### 4. Files (Phase 6)
- New: `components/venue-screen/fx/useReducedMotionAfterHydration.ts`;
  `tests/venue-screen-reduced-motion-hydration-contract.test.ts`; `tests/venue-screen-brand-stage-tier-contract.test.ts`;
  `docs/venue-display-hype_PHASE_6_after/` (README with all numbers, `frame-times/`, `logs/`, `scripts/`, `shots/`);
  this note.
- Engine: `fx/fxQuality.ts` (`raiseFxTier`, `FX_TIER_HOLD_MS`, `FX_TIER_RETRY_MS`, `FX_TIER_RETRY_MAX_MS`,
  `fxTierRetryDelayMs`); `fx/fxEngine.ts` (`ceiling`, `drops`, `holdUntil`, `scheduleRetry`, ambient registry
  `ambients` + `startAmbientItem`, `subscribeTier`); `fx/useFx.ts` (`useFxTier`); `fx/BrandStage.tsx` (`still`).
- Panels: `TvQuestionReveal`, `TvAnswerReveal` (`showBloom`), `TvRoundBreak` (`showHandoff`), `TvFinalStandings`,
  `TvBlitzResults` (`hideMotionOnly`); `TvIntroStinger.tsx` (`soundBlocked`).
- Tests changed: `tests/venue-screen-fx.test.ts` (+3), `tests/venue-screen-intro-stinger-contract.test.ts` (+1, 2 updated).
- Docs: plan status + §8 standing rules; `docs/tv-display-physical-device-checklist.md` (header note + section F).

### 5. Facts and traps
- **Playwright's fake clock can't drive a game night.** Under `page.clock`, polls succeed but React/framer screen
  changes stall (the screen stays on the question). It's fine for idle (`fastForward` between 75 s slots). Run game
  sequences in real time. Also stamp mocked `updatedAt` / `revealEndsAt` from the page's clock
  (`page.evaluate(() => Date.now())`), never node's.
- **Mock leaderboards:** the round break sorts by score, so swapping rows without swapping points never changes
  the leader (no coin pop).
- **4K in headless** drops the tier to `off` within ~1 s (CPU raster, no GPU). Idle at 4K ×6 is 14–25 fps, the same
  as the baseline (the idle screen's own wash). Only a real 4K TV settles the 4K question.
- **#418 from clock skew** (see README §5): a TV whose clock differs from the server's by about a second or more
  logs one hydration error on load (countdown digits). Harmless, not fixed.
- Clone recipe: Phase 5 handoff §5, or `docs/venue-display-hype_PHASE_6_after/README.md`. Port 3181 was used here
  and stopped. Never `pkill next`.
- `npm run lint` fails on ~309 errors inside the git-ignored `tmp/` folder (another workspace's build output). Use
  `npx eslint . --ignore-pattern 'tmp/**'` (0 errors).

### 6. Build, run, test, verification
- `npx tsc --noEmit` ✔ · `npx eslint . --ignore-pattern 'tmp/**'` ✔ · `npm run test` ✔ (532 files, 7,031 tests;
  includes the other session's uncommitted tests) · production build ✔ on a clean `git archive` of the Phase 6
  commit (dummy Supabase env), and three times in the verification clone.
- Browser results: `docs/venue-display-hype_PHASE_6_after/README.md`.
- **Not verified:** a real TV or stick; real 4K; iOS Safari Expand and sound by ear; Vercel usage after release
  (needs the deploy; no Observability Plus, so compare request counts for `/api/venue-screen/state` and bandwidth
  in the Vercel dashboard's Usage tab, week before vs week after; expect no change beyond about 222 KB once per TV).

### 7. Open questions for Andrew
1. Merge PR #12 (production deploy), and when?
2. Real-TV checklist results (§F), especially stinger smoothness on a Fire TV Stick.
3. Sound licence for the two user-supplied files (from Phase 2).
4. Optional follow-ups: fix the clock-skew #418; keep twinkles inside the stage in phone portrait; lighten the
   stinger if the stick stutters (Phase 0 handoff §5 options).

### 8. Recommended first steps (release follow-up; Sonnet 5.5, medium; Opus 5.5 high if the stinger or engine changes)
1. `gh pr view 12`; confirm CI checks are green and `main` hasn't moved (rebase if it has, then re-run `npm run test`).
2. Merge only on Andrew's word; watch the production deploy; open `/venue/<id>/screen` once to confirm the stinger.
3. A week later, compare Vercel usage as in §6 and report.

## Code review of PR #12 (2026-11-13, Claude Opus 5.5, `/code-review high`)

**For Andrew:** an independent review found 10 issues. 9 are fixed. None changed how the display looks except the
venue name in the header, which now sits 24 px higher, as originally intended. The tenth is a cost trade-off, kept
on purpose (below). `main` (PR #13/#14, partner business type) is merged into the branch. Still not live.

| # | Finding | Fix |
|---|---|---|
| 1 | Hard stop counted from mount, so a slow logo (up to 1.5 s) cut the exit fade at 5 s | `TvIntroStinger`: hard stop re-armed at the first animation frame (`STINGER_HARD_STOP_MS` from there; `LOGO_TIMEOUT + HARD_STOP` before it). Browser: 1.2 s slow logo → stinger ran 5.97 s to its end |
| 2 | Navy cover only removed by JS: a TV whose scripts fail stays navy forever | CSS fail-safe `animate-stinger-cover-failsafe` (tailwind keyframes; 7 s, `STINGER_COVER_FAILSAFE_MS`). Browser with JS off: opacity 0 / hidden at 8 s |
| 3 | Bracket row key `username` alone; nameless users all show "Player" → duplicate keys | `bracketRowKeys()` in `BracketTvScreen.tsx` (repeat names get a suffix) |
| 4 | `attach()` set the tier without rebuilding ambients started earlier by child effects (StageTwinkles with `intro=0`) → duplicate infinite twinkle emitter after a motion change; full density on 2-core | `fxEngine.ts` `restartAmbients()` on attach. Browser: reduced → 0 live, motion back → 1 (not 2) |
| 5 | Twinkle field kept the viewport it started in | Area resolved inside the build (`useFx.ts`); engine rebuilds ambients on resize. Browser: resize keeps 1 live emitter |
| 6 | Go-live held back by the stinger lost its burst (gate armed 1 s after the stinger) | `FxCanvas.tsx`: gate arms when `armed` AND 1 s since mount (`mountedAt`), synchronously in the effect. Browser: go-live polled at 3 s and 4.8 s both fire the burst after the stinger |
| 7 | Round-break leader pop: `remember` ran before the delayed burst; if cleared first, the change was used up | `TvRoundBreak.tsx`: cleanup puts the previous leader back unless `popped` |
| 8 | Header `h1`: `-my-6 mt-2` — `mt-2` wins in Tailwind 3, so 24 px of padding wasn't cancelled | `-mb-6 -mt-4` (computed: margin-top −16 px, bottom −24 px) |
| 9 | New components used `function` declarations (CLAUDE.md: arrow functions) | Converted: `StageTwinkles`, `FxProvider`, `BrandStage`, `ShineSweep`, `CountUp`, `LightStreak`, `OneShotShine`, `EdgeGlow`, `TvIntroStinger`, `FlipChar`, engine helpers. Pre-existing ones left alone |
| 10 | StageTwinkles keeps the fx loop running (~30 fps full-viewport canvas) all night, also in dashboard thumbnails | **Not changed:** the always-on twinkle field is a Phase 3 design choice, its cost is in the Phase 6 frame times, and the watchdog turns it off on a struggling device. Revisit if the real-TV run shows heat/stutter, or skip twinkles when embedded |

Tests: new `tests/venue-screen-review-fixes.test.ts` (engine behaviour with stubbed browser globals, stinger
fail-safes, gate timing, leader restore, row keys, title margins); `tests/venue-screen-brand-chrome-contract.test.ts`
updated for the row keys. Full suite 7,039 passed; `tsc` and `eslint` clean; production build passed in a scratch
clone (harness as in §5, plus the clone-only `window.__fx` line); browser scripts in
`docs/venue-display-hype_PHASE_6_after/scripts/review-*.mjs.txt` (port 3183). Note: the idle screen polls every 20 s,
so the go-live script shortens that one timer in the page to land the poll under the stinger.

Next steps are unchanged (§8): Andrew's merge decision and the real-TV checklist §F.
