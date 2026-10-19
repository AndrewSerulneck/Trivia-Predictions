# Squares + Brackets — Phase 3 handoff (Squares player screens)

**Date:** 2026-10-19 (Mon, ~09:00 ET). **Plan:** `docs/squares-and-brackets-plan.md`. **Next:** Phase 4 (Squares Prizes +
Results page), Opus 5.5 · high (plan §4).

## For Andrew (plain English)

- **What changed:** players now have a Squares screen. It shows the 10×10 board with the squares colour-coded (open,
  taken by someone, yours), the headline ("Pick your squares — 1 of 2 used"), and the four scoring moments with who won
  each. Tap a square to see who holds it and to claim or release it. After the lock it shows the drawn numbers on the
  edges, the live score, which square is winning right now, and each quarter's winner. The tutorial cards have art.
- **The database changes are applied** (you asked for it): the points ledger and the Squares tables are live in
  production, empty. I checked all seven tables answer.
- **Phases 0–3 are committed** on `main` (nothing pushed, nothing deployed). Your own POS edits were left out of the commit.
- **Is it live?** No. The switch (`NEXT_PUBLIC_SQUARES_ENABLED`) is still off, so nobody sees a card or the page.
- **Checked on a phone-size browser** (350 px and 289 px wide, with fake data — no real claims were made): no sideways
  scroll, no tiny text, the refusal message shows, the tutorial art fits. A square is ~27 px at 350 px and ~21 px at
  289 px (smaller than the plan's ~26 px guess at the smallest phone). That's why the claim button lives in a bigger
  sheet, not on the square.
- **Cost:** an open Squares page asks for the board every 30 s before the lock, then the shared score every 15 s after
  it, only while the screen is showing. The shared score is cached by the CDN, so it's a handful of database reads a
  minute for the whole country, and zero calls to the sports data service.
- **Still open / needs you:** nothing blocking. Leave your Mac awake tonight (Commanders at 49ers, 8:15 PM ET) so the
  game watcher can record the real "quarter is over" wording (see §5 below).

---

## For the next agent

### 1. Next phase goal and scope
**Phase 4 — Squares Prizes + Results (plan §4):** a new entry in `lib/rewardDefinitions.ts` (follow `AGENTS.md` "Add a
reward"); the partner picks which moments pay a Prize (any of Q1 / half / Q3 / final); each moment = one winner, awarded
through `award_cycle_winner`; no points target, no minimum players (make `guardRewardWizardStep` skip `players`);
`CreateRewardWizard` stays one shared component. Results page: register `squares` in `lib/results/competitions.ts`
(`hasBreakdown: false`), one adapter under `lib/results/adapters/` + a line in `adapters/index.ts`, a placement rule in
`lib/results/rewardPlacement.ts` (Prize → that game's card). Privacy contract (`tests/results-privacy-contract.test.ts`):
no player id leaves the server. Also needs `challenge_campaigns_game_types_valid` + `VALID_GAME_TYPES` to accept
`squares` (Phase 1 only allowed it in `game_sessions_type_valid`; plan §9) — that is a NEW migration (never edit an
existing one; give any new table an explicit `service_role` grant). The tutorial's third card already says "Check the
Prizes tab…"; once Prizes exist, the screen could show a small Prize line (keep it minimal — plan §1 design rule).
**Out of scope:** TV (Phase 5), flag on / rehearsal (Phase 6), anything in Brackets, changing the engine's rules.

### 2. Starting state
- Branch `main`. Commits: `863a9b6` (Phases 0–2) and the Phase 3 commit right after it (`git log --oneline -3`).
  **Nothing is pushed or deployed.**
- **Uncommitted, NOT mine — don't touch or stage:** `CLAUDE.md` first hunk (Andrew's POS note near line 887),
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`. `CLAUDE.md`
  also holds my bullets — stage mine only with a hunk patch (`git diff -U3 CLAUDE.md`, keep the `Squares` hunks,
  `git apply --cached`), as I did.
- **Database:** both migrations applied to `pkmxupsayzshvpirkaav` on 2026-10-19 (~08:32 ET) with `supabase db push`
  (Andrew's explicit instruction). Verified read-only: `seasonal_points_credits`, `squares_events`,
  `squares_event_moments`, `squares_boards`, `squares_claims`, `squares_results`, `squares_admin_log` all exist, count 0.
  No data written, no event created. Do not reapply or edit them.
- Flags: `NEXT_PUBLIC_SQUARES_ENABLED` and `SQUARES_REHEARSAL_ENABLED` absent from Vercel (off).
- **Phase 0 live capture still running** (checked 08:50 ET): PIDs 71943 (game 1392308, WSH @ SF, kickoff
  2026-10-20T00:15Z) and 71944 (1392309, NE @ CHI, 2026-10-23T00:15Z). Output `tests/fixtures/squares/nfl-live-capture-<id>.json`
  (absent until kickoff), logs `.scratch/nfl-live-capture-<id>.log`. The Phase 2 handoff's §8 step 1 (read the capture, fix
  `quartersFinishedFromStatus`, record the real status strings in plan §8) is STILL TO DO — it was not possible in Phase 3
  (the game hadn't been played). Do it first, tomorrow or after Thu Oct 22.

### 3. Decisions already made (don't re-ask)
Andrew's plan §1 (1–15). Phase 3 choices (mine, within the plan's remit):
- **Cells are colour-only `div role="gridcell"`, not `<button>`.** `app/globals.css` gives every phone `button` a 36 px
  min-height and ≤380 px side padding (`!important`), which would swell the squares. Roving tab stop + arrow keys + Enter/Space.
- **Won = white inset ring; leading = pulsing amber outline** (a square can be both). Mine = amber, taken = sky, open = faint.
- **Two payloads:** board (per venue, uncached) + shared score (CDN). Merge rules in `lib/squaresView.ts`
  (`squaresScreenState`, `squaresMomentRows`): the score wins for anything live; a moment's winner NAME comes only from
  the board and only when the board's winning cell equals the score's (else "—" until the board refetch lands).
- **A board read counts as a score read** (`lastScoreAtRef`) — opening the page costs one request, not two.
- **Score endpoint:** `GET /api/squares/score` = one PostgREST select with the moments embedded
  (`squares_event_moments(...)`), `Cache-Control: public, s-maxage=15, stale-while-revalidate=15`; errors/404 `no-store`;
  `dynamic = "force-dynamic"`. No auth (nothing in it is private: digits only after the draw, no player/venue).
- **Page** 404s with the flag off via `notFound()`. The flag is a `NEXT_PUBLIC_*` value, so `/squares` is prerendered at
  build: env var, THEN redeploy (same as every flag).
- **App-bar label** is `SQUARES_SHORT_NAME = "Squares"` (the full name truncated beside the points pill at 350 px; at
  289 px even "Squares" truncates to "SQ…" — shared bar behaviour, left alone).
- Tutorial art: board (steps 0, 2; step 2 outlines one winning square) and two digit strips for step 1 (strips keep digits
  ≥12 px at any card size). Tutorial copy is unchanged from Phase 1.

### 4. Files created or changed
New:
- `lib/squaresView.ts` — pure, client-safe: `SquaresScoreView` type, `squaresScreenState`, `squaresCellModels`,
  `squaresCellLabel`, `squaresCellAction` / `squaresCellNote`, `squaresClaimMessage`, `squaresMomentRows`,
  `squaresHeadline`, `leadingCellOf`, `squaresRevision`/`boardRevision`/`scoreRevision`, `SQUARES_MOMENT_LABELS`,
  poll constants (30 s board, 15 s score).
- `lib/squaresScore.ts` (server-only) — `getSquaresScoreView()`; `app/api/squares/score/route.ts`.
- `app/squares/page.tsx` — `GameLandingExperience gameKey="squares"`, `playingBackgroundClassName="bg-[#052e16]"` (matches
  the transition fallback in `lib/venueGameTransition.ts`).
- `components/squares/SquaresGame.tsx` (screen), `SquaresGrid.tsx`, `SquaresCellSheet.tsx` (scroll lock, Escape,
  `useNativeBackHandler("overlay", open ? onClose : null)`), `useSquaresData.ts` (polling + `act` claim/release).
- Tests: `tests/squares-view.test.ts` (22), `tests/squares-screen.test.ts` (16, jsdom, fake network + fake timers incl.
  the cost cadence), `tests/squares-score-route.test.ts` (12: headers, one DB request, no player/venue fields, standing rules).
Changed:
- `lib/squaresStore.ts` — exported `MomentRow` + `toMomentRecord` (for the embedded select).
- `components/venue/GameIdentityPanel.tsx` — `SquaresIllustration` + dispatch line.
- `components/auth/AuthNavigationGuard.tsx` (`/squares` is an in-session route), `lib/analytics.ts` (`gameTypeForPath`),
  `components/venue/AppBar.tsx` + `lib/venueGameCards.ts` (`SQUARES_SHORT_NAME`), `lib/venueGameTransition.ts` (comment),
  `tests/native-back-review-fixes.test.ts` (sheet pinned), `CLAUDE.md` (bullet + "applied"), plan status + §11.

### 5. Facts and traps
- **Quarter rule still unverified against a live game** (see §2). If BDL's live `status` wording isn't known to
  `quartersFinishedFromStatus`, quarters grade only at the final; the screen then shows "—" for Q1/half/Q3 until the end.
  The headline shows the feed's `status` string raw (e.g. "Halftime"), so verify it reads sensibly with real values.
  Before kickoff the feed's status is a date string ("10/19 - 8:15 PM EDT"): the headline therefore shows "Kickoff <time>"
  until `kickoffAt` passes and a score exists, and never the raw string.
- `tests/squares-view.test.ts` / `squares-screen.test.ts` use `createElement`, not JSX (`*.test.ts` glob).
- **Native Back hooks are inert outside the app** — a jsdom test of a Back handler must set `window.Capacitor` first
  (see the Escape/Back case in `squares-screen.test.ts`).
- **Browser testing:** Andrew's `next dev` holds :3000 and shares the production DB. I tested from a scratchpad clone
  (`rsync` with ANCHORED excludes `/native /docs /.git /node_modules …` — an unanchored `native` also drops
  `lib/native`; `cp -cR node_modules` because Turbopack rejects a symlinked `node_modules`), port 3100, env
  `NEXT_PUBLIC_SQUARES_ENABLED=true` + dummy Supabase URL, all `/api/squares/*` mocked with Playwright `page.route`,
  cookies `tp_user_id`/`tp_venue_id` only (no `SESSION_SECRET` in the clone). In Playwright use
  `getByRole("button", {name: "Next", exact: true})` — the Next.js dev-tools button also matches `/next/i`.
  Clone and server were removed afterwards (I killed only PID on :3100).
- Don't run `tsc` and `next build` at the same time (`.next/types`).
- A claim that returns any answer triggers a board re-read (`act` → `fetchBoard(true)`; if one is in flight it re-runs once
  after it ends). 4xx refusals keep the sheet open with the message; success closes it.

### 6. Build / run / test (all 2026-10-19, all green)
- `npx tsc --noEmit` clean; `npm run lint` exit 0; `npm run test`: 413 files, **4,937 pass / 13 skipped / 0 fail**;
  `npm run build`: passes, 208 pages (`/squares`, `/api/squares/score` listed).
- Browser (mocked data, Chromium, 350×740 and 289×568, open and live-game states): no horizontal scroll, no text <12 px,
  tutorial art fits all three steps, sheet + refusal message work, claim POST body is
  `{venueId,userId,cell,action}`. Screenshots were in the scratchpad (not kept).
- **Not verified:** a real claim against the real database (no event exists yet; the engine is covered by
  `npm run test:squares-sql`); the page on a physical phone / in the native app (Phase 6 device checklist);
  real `status` strings (capture); the CDN actually honouring the 15 s cache on Vercel (check
  `x-vercel-cache` on `/api/squares/score` in Phase 6 rehearsal).
- Cost (plan §6): page open before lock ≈ 2 board reads/min/player; after lock ≈ 4 score hits/min/player served by the
  CDN, origin ≈ 4 DB requests/min nationwide; board re-reads ≈ 5 per player per game (draw + 4 moments). Zero sports-feed
  calls from any player screen. No new cron, no `vercel.json` change.

### 7. Open questions for Andrew
None blocking. (Still open from Phase 1, not blocking: the two Official Rules sentences in that handoff.)

### 8. Recommended first steps for Phase 4
1. Read plan §4 Phase 4, `AGENTS.md` "Add a reward" / "Add a competition to Results", `lib/rewardDefinitions.ts`,
   `lib/results/rewardPlacement.ts` header, and `docs/nfl-pickem-reward-plan.md` (closest precedent: a reward that does not
   gate on the venue schedule).
2. If the capture files exist, do the quarter-rule check first (Phase 2 handoff §8.1) — Prize timing depends on it.
3. New migration for the `challenge_campaigns_game_types_valid` constraint (+ `VALID_GAME_TYPES`, `ChallengeGameType`
   already has `squares`); apply only with Andrew's go-ahead.
4. Award each moment's winner from `lib/squaresSettlement.ts` right after a result is written (one winner per moment per
   venue; the board's `squares_results` row is the trigger). Keep it idempotent via `award_cycle_winner`.
Model: Opus 5.5, effort high.
