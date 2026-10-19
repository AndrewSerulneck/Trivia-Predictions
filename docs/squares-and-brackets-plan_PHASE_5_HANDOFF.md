# Squares + Brackets — Phase 5 handoff (Squares TV view)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 5, §6). **Next:** Phase 6 (review, rehearsal, launch), Opus 5.5 · high.

## For Andrew (plain English)

- **What changed:** when a venue's TV has nothing else live, and Super Bowl Squares is under way, the TV now shows the
  Squares board instead of the idle "coming up" screen: the 10×10 grid with everyone's usernames, the drawn numbers, the
  live score, the square that is winning right now (and who holds it), and who won each quarter. Live Trivia and
  Category Blitz still take over the screen when they run.
- **When it shows:** only once the numbers are drawn, at least one player at that venue holds a square, and until 7 hours
  after kickoff. Before the draw, or at a venue nobody played at, the TV looks exactly as it does today.
- **Is it live?** No. The Squares switch is still off, so nothing changes for anyone. Not committed, pushed or deployed.
- **Needs you:** nothing now. I could not check how it looks on a real TV-sized screen (see "Not verified"); that is part of
  the Phase 6 rehearsal.
- **Cost:** no new polling. The TV already asked for its state every 20 s; Squares mode asks every 15 s. Outside Feb 1–15
  or with the switch off the server does zero extra work. Inside, one board read (≈5 small database queries) per venue
  per 15 s, however many TVs are on at that venue, plus a 15 s CDN cache on the response. A venue with a TV on for a
  4-hour game ≈ 960 board reads (≈4,800 queries) at most; most venues far fewer.

---

## For the next agent

### 1. Next phase goal and scope
**Phase 6 (plan §4):** `/code-review high` on Phases 1–5 and fix findings; rehearsal on hidden venue `venue-hightop-test`
(claim → draw → live → settle → points → Prize → Results → TV, for real); Andrew's phone pass
(`docs/squares-and-brackets-device-checklist.md`, section A — file does not exist yet, create it); turn on
`NEXT_PUBLIC_SQUARES_ENABLED` and redeploy by **Mon Jan 25, 2027**; watch logs Feb 14. Out of scope: Brackets (Phases 7+).
Also still open from Phase 2 §8.1: read Phase 0's live capture (`tests/fixtures/squares/nfl-live-capture-*.json`) and fix
`quartersFinishedFromStatus` / record real status strings in plan §8.

### 2. Starting state
- Branch `main`; Phase 5 committed on top of `8783a7c` (Phase 4). Nothing pushed or deployed.
- Uncommitted and NOT mine: `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`,
  and the first `CLAUDE.md` hunk (POS/Toast note). `CLAUDE.md` also holds my one Phase 5 bullet (after "Results: `lib/results/adapters/squares.ts`…").
  Stage mine only with a hunk patch.
- No migration in Phase 5; no data touched. Flags `NEXT_PUBLIC_SQUARES_ENABLED`, `SQUARES_REHEARSAL_ENABLED` absent.

### 3. Decisions made (don't re-ask)
- **Squares replaces only the idle screen** (plan). It is read only when `!liveTrivia.isGameActive && !categoryBlitz.session`.
- **Shows from "drawn"** (not open/locked), needs ≥1 claim at that venue, hides at kickoff + 7 h (`SQUARES_TV_WINDOW_MS`).
  A "complete" game keeps showing (final score, all four winners) until the window ends. Judgement call; change in `lib/squaresTv.ts`.
- **Reuse, don't add a loop:** the TV payload rides on the existing state route. The board is read server-side
  (`getSquaresBoardView` with `userId: null`), not by a per-TV client request, so the shared `/api/squares/score` isn't used.
- Poll 15 s (`lib/venueScreenTiming.ts`); the route's `s-maxage=15` header now covers `squares` as well as `idle`.
  Burn-in drift applies to Squares as well as idle (it can stay up for hours).
- Failures hide Squares (TV falls back to idle); logged `[SquaresTv] board-read-failed`.

### 4. Files
New: `lib/squaresTv.ts` (pure payload builder, no ids), `lib/squaresTvRead.ts` (server read: gate + 15 s per-venue cache),
`components/venue-screen/SquaresTvScreen.tsx`, `tests/squares-tv.test.ts` (13 tests).
Changed: `lib/venueScreen.ts` (new `mode: "squares"` variant, `squares` input, `getVenueScreenState` reads it only when it would be idle),
`lib/venueScreenBrand.ts` (`"squares"` mode + `SQUARES_THEME`, gold/emerald), `lib/venueScreenTiming.ts`,
`app/api/venue-screen/state/route.ts` (cache header), `components/venue-screen/VenueScreenClient.tsx` (title uses
`SQUARES_GAME_NAME`; panel; transition key `sq:<phase>`), `tests/venue-screen-reliability.test.ts` (helper type), plan, `CLAUDE.md`.

### 5. Facts and traps
- The literal "Super Bowl Squares" may only appear in `lib/venueGameCards.ts`; the TV imports `SQUARES_GAME_NAME`.
- The `squares` variant has no `idle`/`liveTrivia` data: any code switching on `state.mode` must handle it (tsc catches exhaustive spots; the debug-mode helper can't produce it, by design).
- `modeToGameLabel` returns null for squares, so there is no "We're live" takeover when it appears.
- The per-instance cache is in memory per serverless instance; with several instances the real cost is a few reads per 15 s, still bounded.
- iCloud makes `* 2` copies in `.next/types`; `find .next/types -name "* 2*" -delete` before `tsc`.

### 6. Build / test (2026-10-19, all green)
`npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 416 files, 4,998 pass / 13 skip / 0 fail; `npm run build` passes.
### Not verified
- **No visual check at TV size.** Grid math: cells 5.5 rem, header row 4.5 rem, in the 2304×1296 canvas under the title bar; I
  computed it fits (~1,020 px tall) but never saw it. Check at 1920×1080 and in the rehearsal; long usernames are truncated to 8 chars + CSS clip.
- No real-event run (no event exists yet); a real TV with a live board is part of the Phase 6 rehearsal.

### 7. Open questions for Andrew
None. (Optional: should the TV also show Squares before the draw, e.g. "Claim your squares at your table"? Not built; plan says digits and score.)

### 8. Recommended first steps for Phase 6
1. Read Phase 0's capture and finish the quarter-rule check (Phase 2 handoff §8.1).
2. Run `/code-review high` over Phases 1–5; then the rehearsal on `venue-hightop-test` (open `/venue/venue-hightop-test/screen` during the drawn phase).
3. Write the device checklist; look at the TV at 1920×1080 first.
Model: Opus 5.5, effort high.
