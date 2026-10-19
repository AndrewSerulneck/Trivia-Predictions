# Squares + Brackets — Phase 2 handoff (Super Bowl Squares engine)

**Date:** 2026-10-19 (Mon, ~01:35 ET). **Plan:** `docs/squares-and-brackets-plan.md`. **Next:** Phase 3 (Squares
player screens), Sonnet 5.5 · high.

## For Andrew (plain English)

- **What changed:** the behind-the-scenes machinery for Super Bowl Squares is built. It can find the Super Bowl in
  the NFL feed by itself, keep one board per venue, let each player hold up to 2 squares, draw the numbers at random
  30 minutes before kickoff (once, and never again), check the score once a minute during the game, and pay the
  winners their venue points (25 / 25 / 25 / 50). A score has to stay the same for a full minute before it counts,
  and a quarter only counts when the feed clearly shows it is over. If a score is unclear, it waits rather than
  guess, and the worst case is that a quarter is paid at the end of the game.
- **Admin panel:** a new **Squares** page in the admin console (Prizes & Events). It shows the game, the drawn
  numbers, the live score and each quarter's result. It can also fix problems: point at a different game, move the
  lock time, run the scoring by hand, grade a quarter by hand, and **undo** a quarter (any points already paid are
  taken back, and every undo is logged).
- **Is it live?** No. The player switch is off, there are no player screens yet (Phase 3), nothing is committed,
  pushed or deployed, and the database changes are written but **not applied**.
- **Needs you (no rush, before late January):**
  1. **Apply two database changes** when you're ready (`supabase db push`): Phase 1's points ledger and this
     phase's Squares tables. They must both be applied before the switch goes on, and Phase 3 will want them for
     testing.
  2. **Commit?** Phases 0, 1 and 2 are all uncommitted. Tell me if you'd like them committed (only these files,
     none of your own edits).
- **One thing still running:** the Monday-night and Thursday-night game watchers from Phase 0. Tonight's (Commanders
  at 49ers, 8:15 PM ET) needs your Mac awake. It's how we confirm the "quarter is over" rule against a real game.

---

## For the next agent

### 1. Next phase goal and scope
Phase 3, Squares player screens (plan §4 "Phase 3"): route `/squares` (`GameLandingExperience`, statement-layout
tutorial, the Venue Home card's return transition), the 10×10 grid (colour-only cells, tap → owner sheet, 350 px and
289 px checks), claim/release with `haptic()`, "x of 2 used", after-lock digits + live score + leading square +
moment winners, `useNativeBackHandler` on every closable popup (+ `tests/native-back-review-fixes.test.ts`), and the
**shared CDN-cached score endpoint** (15 s `s-maxage`, not user-specific — it should read `squares_events.live_score`,
see §5, so it costs zero provider requests). Board polling every 30 s only while open and before lock.
**Out of scope:** Prizes/Results (Phase 4), TV (Phase 5), flag on (Phase 6). Don't change the engine's rules.

### 2. Starting state
- Branch `main`, last commit `b5c1778`. **Nothing from Phases 0, 1 or 2 is committed.** Andrew's own unrelated
  uncommitted edits are still in the tree (`CLAUDE.md` — Phase 1 and I each appended to its last section only —
  `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`). Don't
  commit, revert or `git checkout` those. Stage only the Squares/Brackets paths (Phase 0 handoff §4, Phase 1 handoff
  §4, and §4 below) and only after Andrew says so.
- **Migrations NOT applied** to linked project `pkmxupsayzshvpirkaav`: `20261019045030_seasonal_points_credits.sql`
  (Phase 1) and `20261019051458_squares_engine.sql` (this phase; it ALTERs Phase 1's table, so apply in order —
  `supabase db push` does). Until applied, every Squares route/RPC fails closed (`[Squares] rpc-missing`, 503s).
- No database writes, deploys or env changes. `NEXT_PUBLIC_SQUARES_ENABLED` and `SQUARES_REHEARSAL_ENABLED` are
  absent from Vercel (= off).
- **Phase 0 capture still running** (checked 01:32 ET): PID 71943 (`1392308`, WSH @ SF, kickoff 2026-10-20T00:15Z)
  and PID 71944 (`1392309`, NE @ CHI, 2026-10-23T00:15Z). Output `tests/fixtures/squares/nfl-live-capture-<id>.json`,
  logs `.scratch/nfl-live-capture-<id>.log`. **The capture was not available for this phase** (kickoff was ~19 h
  away) — see §5 "Quarter rule" for what that means and §8 step 1 for what to do.

### 3. Decisions already made (don't re-ask)
Andrew's decisions are plan §1 (1–15). Decided in Phase 2 (by me, within the plan's remit):
- **One draw per event, shared by every venue** (plan §4 table proposal put digits on `squares_events`). Every
  venue's winning cell for a moment is the same cell; boards differ only in who holds it. Grading is one INSERT…SELECT
  over all boards.
- **Grid convention:** `cell = row * 10 + col`, columns = the AFC team (`col_side` says which feed side that is),
  rows = NFC. A same-conference game (admin rehearsal) puts the visitor on columns.
- **Boards are created by the first claim**, not by opening the page (no write on a read).
- **Quarter rule = positive evidence only** (`lib/squares.ts` header): final, or strict status text ("Halftime",
  "3rd Quarter", "Q3", "End of 1st"; never "3rd & 5"), or a LATER quarter with points > 0 (a 0 may be pre-filled).
  Score = cumulative through the quarter with null = 0, accepted only when all quarters + OT sum to the team total.
  Then a 60 s hold on an unchanged score (`planMomentStep`). Unknown wording ⇒ the moment is proven at the final.
- **Corrections are never automatic.** After all four moments are graded and the record is final, the settlement
  compares the graded quarters with the final record and writes `mismatch_note` + an admin-log row
  (`[Squares] moment-mismatch`). An admin voids and re-grades. (Same stance as Bingo's terminal corrections.)
- **Void = reverse paid credits, burn unpaid ones, bump `grade_no`.** Credit keys are `board:moment:grade_no`, so a
  re-grade pays under new keys while the old keys stay spent forever. This needed a logged reversal on Phase 1's
  ledger: `reverse_seasonal_points` + `reversed_at/reversal_reason/reversal_kind` (`reversed` | `burned`). Points
  never go below 0 (`users_points_non_negative`). The leaderboard ignores reversed rows.
- **Paying stays in TypeScript** through `creditSeasonalPoints` (still the only caller of `credit_seasonal_points`).
  A burn row is what stops a late payment racing a void. `payUnpaidSquaresResults` marks a result paid only for
  `credited`, or `already_credited` to the same player.
- **Cron:** rides on `/api/cron/pickem-settle` (no `vercel.json` change). Squares runs **before** Pick 'Em so a Pick
  'Em failure can't stall a live Super Bowl; `runSquaresTick` never throws.
- **Gate:** `isSquaresSettlementActive(now)` = flag on AND (today inside the Feb 1–15 card window OR server-only
  `SQUARES_REHEARSAL_ENABLED`, for Phase 6's rehearsal on a December/January game). Pure, zero I/O when false.
- **Player API built now** (engine, not UI): `GET /api/squares/board`, `POST /api/squares/claim`, both 404 with the
  flag off, session-bound userId, `no-store`. Phase 3 only builds screens on them.
- **Admin route is NOT flag-gated** (admin-only), so the event can be checked and a rehearsal set up pre-launch.
- **Account deletion:** every `users` FK is CASCADE (claims, results). A deleted winner's result row goes with them;
  the moment stays graded, so nothing re-awards it. `delete_player_account` unchanged.

### 4. Files created or changed
New:
- `supabase/migrations/20261019051458_squares_engine.sql` — §0 ledger reversal; tables `squares_events` (one
  current via partial unique index on `archived_at is null`), `squares_event_moments` (4 rows/event: hold, grade,
  `grade_no`, `mismatch_note`), `squares_boards` (unique event+venue), `squares_claims` (PK board+cell),
  `squares_results` (unique board+moment+grade_no; null user = nobody won), `squares_admin_log`; RLS forced,
  service_role grants only; RPCs `squares_claim(event, user, venue, cell, action)`, `squares_draw`,
  `squares_grade_moment(…, p_points, p_source, p_grade_no)`, `squares_void_moment(…, optional scores)`,
  `reverse_seasonal_points`, helper `squares_is_digit_permutation`. All RPCs service-role only.
- `lib/squares.ts` — pure rules: grid math, `squaresAxes`, `findSuperBowl`, `lockAtFor`, the evidence rule
  (`quartersFinishedFromStatus/FromFields`, `squaresMomentEvidence`), `planMomentStep` (hold), `liveScoreOf`,
  `gradedMomentMismatches`, `squaresEventPhase`, `squaresCreditKey`, timing constants.
- `lib/squaresFeed.ts` (server-only) — `fetchSquaresGame(id)` (`/nfl/v1/games/{id}`), `fetchSuperBowlGame(season)`.
- `lib/squaresStore.ts` (server-only) — row mapping, `getCurrentSquaresEvent`, `getSquaresMoments` (self-heals
  missing moment rows), `eventFieldsFromGame`, `createSquaresEvent`, `logSquaresAdmin`.
- `lib/squaresSettlement.ts` (server-only) — `isSquaresSettlementActive`, `isSquaresRehearsalEnabled` (single
  reader of `SQUARES_REHEARSAL_ENABLED`), `squaresSeason()` (= 2026), `drawDigitPermutation` (node:crypto),
  `runSquaresTick({ now, force })`, `gradeMoment`, `payUnpaidSquaresResults`.
- `lib/squaresBoard.ts` (server-only) — `getSquaresBoardView` (usernames, `mine`, never a user id; digits hidden
  until drawn) and `claimSquaresCell` (the only caller of `squares_claim`).
- `lib/squaresAdmin.ts` (server-only) — `parseSquaresAdminAction`, `getSquaresAdminOverview`,
  `runSquaresAdminAction` (discover, create_from_game, set_game, move_lock, grade_moment, void_moment, archive,
  run_now). Archive refuses while wins are unpaid.
- `app/api/squares/board/route.ts`, `app/api/squares/claim/route.ts`, `app/api/admin/squares/route.ts`.
- `components/admin/sections/SquaresSection.tsx` — the admin panel (light admin styling).
- `scripts/test-squares-sql.cjs` + npm `test:squares-sql` — PGlite proof (claims, cap, lock by DB clock, venue,
  draw once, set-based grading, void+re-grade, burn, reversal, cascades, grants, RLS).
- `tests/squares-engine.test.ts` (33) — rules, fixtures incl. null quarters + OT, live-safety cases, hold,
  mismatch, **live-capture replay** (runs automatically on any `nfl-live-capture-*.json` with a final snapshot),
  SQL mirrors (cap, key, moments, grants, CASCADE), one-writer contracts, cost gate, admin parsing, route 404s.
- `tests/squares-settlement.test.ts` (3) — a minute-by-minute Super Bowl through `runSquaresTick` against an
  in-memory fake DB: discovery, hourly pre-lock refresh, single draw, hold restart, payments once, post-final 5-min
  throttle, watch end, mismatch report, zero I/O outside the window.

Changed:
- `app/api/cron/pickem-settle/route.ts` — Squares tick first, behind the pure gate; `squares` in the JSON.
- `lib/leaderboard.ts` — seasonal credits read `.is("reversed_at", null)`.
- `components/admin/adminSectionMeta.ts` (`"squares"`, label "Squares", Prizes & Events, migrated),
  `components/admin/adminSectionComponents.tsx`, `components/admin/AdminShell.tsx`. Not on the mobile allowlist.
- `package.json` (`test:squares-sql`), `CLAUDE.md` (one bullet in the Squares section), plan status + §10.

### 5. Facts and traps
- **Quarter rule is unverified against a live game.** The capture runs tonight. If BDL's live `status` uses wording
  the strict parser doesn't know (e.g. "In Progress"), quarters simply grade at the final — correct but late, which
  would make Phase 3's "each moment's winner" show up only at the end. Read the capture and, if needed, extend
  `quartersFinishedFromStatus` (keep it strict; add the real strings as test cases). Also check whether live
  quarter fields are pre-filled with 0 (the rule already ignores 0s).
- **Timestamps from PostgREST are `+00:00`, `toISOString()` gives `Z`.** Compare with `Date.parse`, never strings
  (bug caught in `refreshBeforeLock`).
- `squares_events.live_score` (`{col,row,status,statusState,at}`) is written each feed read during the game. Phase
  3's shared score endpoint should read that row (one DB read per CDN miss), **not** call BDL.
- `squares_claim` locks the event row `FOR SHARE`; `squares_draw` UPDATEs it, so a claim and the draw serialize, and
  claims close by the **database** clock at `lock_at` (or once drawn) whatever the app clock says.
- `squares_grade_moment` needs `p_grade_no` = the moment's current `grade_no` (else `stale`), so an observation
  from before a void can't grade the new round.
- Draw ⇒ every venue's board for that event has the same digits; the board view hides digits until `drawn_at`.
- `reverse_seasonal_points` raises on a `conflict` outcome (a credit for an unlocked user raced the burn); the void
  rolls back and the admin retries. Not reachable in practice (both lock the same users rows).
- `runSquaresTick` is safe to run any number of times; admin "Run settlement now" = `force: true` (skips the gate
  and throttles, still never re-draws or re-pays).
- The cron writes the report to the JSON response only; errors log as `[Squares] tick-errors`.
- `tests/squares-engine.test.ts` greps `app/`, `components/`, `lib/` for RPC names — a second caller fails it.
- Andrew's `next dev` was running; `npm run build` in place was fine (don't kill it). Building and typechecking at the
  same time breaks `.next/types` — run them one after the other.

### 6. Build / run / test (all run 2026-10-19 ~01:30 ET, all green)
- `npx tsc --noEmit`: clean. `npm run lint`: exit 0.
- `npm run test`: 409 files, **4,886 pass / 13 skipped (environment-gated) / 0 fail** (final run, after every edit).
- `npm run test:squares-sql`, `npm run test:seasonal-points-sql`, `npm run test:account-deletion-sql`: pass.
- `npm run build`: passes, 207 pages; `/api/squares/board`, `/api/squares/claim`, `/api/admin/squares` listed.
- **Not verified:** the migrations on the real database (not applied); the admin panel in a browser; real BDL
  responses for `/nfl/v1/games/{id}` during a live game (the capture will tell); concurrency of claims under real
  load (PGlite is one connection — the guarantee rests on the advisory lock + PK, same pattern as
  `award_cycle_winner`).
- **Cost (plan §6):** outside Feb 1–15 or with the flag off: 0 reads, 0 requests. Inside: 1 small event read per
  minute (≈ 21.6k tiny reads over 15 days); BDL ≈ 1 discovery + ≈ 330 hourly pre-lock refreshes + ≈ 30 (lock →
  kickoff) + ≈ 210 (game) + ≈ 36 (3 h watch at 5 min) ≈ **600 requests total**, flat tier, $0 extra. Writes per
  game: ≈ 280 `live_score` updates, a handful of hold updates, 4 grades, ≤ 4 × boards result rows, ≤ 4 × boards
  credits. No new cron invocations.

### 7. Open questions for Andrew
- Apply the two migrations (any time before Phase 3 testing / at the latest before the flag goes on).
- Commit Phases 0–2?
- (Still open from Phase 1, not blocking: the two Official Rules sentences in that handoff's summary.)

### 8. Recommended first steps for Phase 3
1. Check `tests/fixtures/squares/nfl-live-capture-1392308.json` (and `…1392309.json` after Thu Oct 22). Run
   `npx vitest run tests/squares-engine.test.ts` — the "live capture replay" case now runs on it and must pass. Write
   the real live `status` / `status_state` strings into plan §8 and, if quarters were only provable at the final,
   extend `quartersFinishedFromStatus` with those strings (+ tests). If the files are missing/short, re-run
   `node --env-file=.env.local scripts/capture-nfl-live-game.cjs <id>` on a later game.
2. Ask Andrew to apply the migrations (or test UI against mocked routes in a scratchpad clone — never exercise the
   real POST from a dev server against the shared production DB without the hidden test venue).
3. Build `/squares` on `GET /api/squares/board` + `POST /api/squares/claim` (response shapes: `SquaresBoardView`
   and `{ ok, outcome, myCells }` in `lib/squaresBoard.ts`; 409 outcomes `taken|cap_reached|not_yours|locked`).
4. Add the shared score endpoint reading `squares_events.live_score` with `Cache-Control: public, s-maxage=15`.
Model: Sonnet 5.5, effort high (plan §4).
