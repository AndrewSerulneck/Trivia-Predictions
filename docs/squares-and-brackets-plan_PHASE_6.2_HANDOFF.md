# Squares + Brackets — Phase 6.2 handoff (Squares event lifecycle)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 6, sub-phase 6.2; findings F3, F4, F5 in §13).
**Next:** 6.3, Opus 5.5 · medium.

## For Andrew (plain English)

- **What changed:** Super Bowl Squares now knows the difference between the real Super Bowl and a **practice game**
  (a "rehearsal"). A practice game can only be played at hidden test venues such as `venue-hightop-test`: a real bar
  can't claim a square on it, so it can never get points or a Prize from it. Three other fixes ride along:
  - if an admin corrects a quarter's score long after the game (more than 12 hours), the app now really does re-check
    the score afterwards, as its message promised;
  - archiving the Super Bowl by mistake during Feb 1–15 can no longer wipe everyone's boards (it's refused until the
    season window closes, and the app won't quietly re-create an empty copy);
  - a switch (`SQUARES_REHEARSAL_ENABLED`) lets the December practice run happen without turning Squares on for
    customers.
- **Is it live?** No. It's committed on this computer only, and it has a database change that isn't applied yet.
- **Needs you, in this order:**
  1. Run `supabase db push` (it applies one new file, `20261019142642_squares_event_lifecycle.sql`: two new columns
     on the Squares event, two on Squares results, and two updated database functions). Nothing customer-facing
     changes: Squares is still switched off.
  2. Then push `main` and deploy. This also ships fix 6.1 (the Pacific Street NFL prize protection) if you haven't
     deployed it yet. If you'd rather deploy 6.1 before Friday Oct 23 without waiting for the database step, that's
     also safe: Squares is off, so nothing reads the new columns (see "Deploy order" below).
- **Cost:** no change for now. During a rehearsal with the switch on and no practice game set up, the cron makes one
  tiny database read a minute and no sports-data requests.

---

## For the next agent

### 1. Next phase goal and scope
**6.3 (plan §4 Phase 6 → "6.3 — Paying winners"):** chunked mark-paid writes (`payUnpaidSquaresResults`, ≤ 150 ids
per `.in()`), results that can never be credited (`credit_blocked_at` / `credit_blocked_note` — the columns are in
6.2's migration), no idle settlement reads once the watch is over, fix the `squaresPrizeCycleStart` comment.
**Out of scope:** 6.4 (player screen after a void), 6.5–6.9. Don't change 6.1's sweep code or 6.2's gates without
a reason recorded in the plan.

### 2. Starting state
- Branch `main`. This phase is one commit: `feat(squares): plan 6.2 — event lifecycle: rehearsal events, archive
  guard, late voids` (`git log -1 --grep "plan 6.2"`). Local `main` is **7 commits ahead of `origin/main`**
  (`863a9b6`, `0565068`, `8783a7c`, `01b87ad`, `0af6f13`, `9c8ebfe` = 6.1, and 6.2). Nothing pushed or deployed.
- **Migration `supabase/migrations/20261019142642_squares_event_lifecycle.sql` is NOT applied** to the linked project
  `pkmxupsayzshvpirkaav`. Andrew runs `supabase db push`. Never edit it after it is applied; until then it may still
  change, but it is proven as is.
- **Deploy order:** the 6.2 code selects `purpose, reopened_at` (`EVENT_COLUMNS` in `lib/squaresStore.ts`). Deploying
  the code before the migration is harmless while `NEXT_PUBLIC_SQUARES_ENABLED` is off and `SQUARES_REHEARSAL_ENABLED`
  is unset: the cron, routes, TV and prize offering then never read `squares_events`. Only the admin Squares panel
  would show an error until the push. Never set `SQUARES_REHEARSAL_ENABLED` before the push.
- Uncommitted and NOT ours, left alone: `docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
  `lib/pos/providers.ts`, and the POS/Toast hunk at the top of `CLAUDE.md`'s POS section (committed only the Squares
  hunk of `CLAUDE.md` via a hunk patch). `supabase/migrations/Warnings` is an old untracked file (Aug 12), not ours.
- Data: nothing written or read in production this phase. `squares_events` had 0 rows on 2026-10-19 (6.1 handoff).

### 3. Decisions made in 6.2 (with why) — don't re-ask
- **The rehearsal gate (the plan asked this phase to decide it):**
  - `squaresSettlementMode(now)` (`lib/squaresSettlement.ts`): `season` = public flag on AND card window open
    (discovery runs); `rehearsal` = `SQUARES_REHEARSAL_ENABLED` on, **without needing the public flag** (Vercel crons
    only run on Production, and the public flag must stay off there until 6.9); else null (zero I/O).
    `isSquaresSettlementActive` = mode ≠ null (the cron route still calls it first).
  - `rehearsal` mode never discovers: with no current event it returns `skipped: "no_event"` with no feed request.
  - TV read (`lib/squaresTvRead.ts`): `isSquaresServerLive(now)` in `lib/seasonalGames.ts` = public flag AND (window
    OR switch). So the TV only shows Squares on a deployment with the public flag on (the 6.7 Preview).
  - Player routes (`/api/squares/board|claim|score`) and `/squares` were already gated on the public flag only (no
    window), so on the Preview they work with no change. Not tightened (no requirement; would block Jan 25–31).
  - Recommended 6.7 setup: Production = `SQUARES_REHEARSAL_ENABLED=true` only (server-side, no redeploy needed to
    flip, but a deploy containing 6.2 must be live). Preview = `NEXT_PUBLIC_SQUARES_ENABLED=true` +
    `SQUARES_REHEARSAL_ENABLED=true`, then redeploy the Preview (public var is build-time). Turn the switch off after.
- **Purpose is fixed for an event's life.** `discover` (cron or admin button) → `super_bowl`; admin
  `create_from_game` → `squaresEventPurposeFor(game, squaresSeason())` (`super_bowl` only for this season's
  inter-conference postseason game; a record with no `season` fails safe to `rehearsal`). `set_game` refuses a change
  of purpose (`squaresSetGameRefusal`) — otherwise a Super Bowl event re-pointed at a regular-season game would keep
  playing at every venue. Not in the plan; added because it was the one way around the claim guard.
- **Rehearsal prize guard** (`squaresPrizePaysAtVenue` + one `venues` read in `awardSquaresPrizes`, only for a
  rehearsal event with unchecked winners). A visible-venue rehearsal winner is stamped `prize_checked_at` and logged
  `[SquaresPrize] rehearsal-visible-venue` (only reachable if a hidden venue is un-hidden mid-rehearsal). A failed
  venues read pays and stamps nothing (retried).
- **Archive guard** (`squaresArchiveRefusal`, `lib/squaresAdmin.ts`): drawn `super_bowl` refused until
  `isSquaresWindowClosed(now)` (Eastern date > `closesAfter`); undrawn events and rehearsals archive any time (the
  existing "unpaid results" check still applies).
- **Discovery skips archived games** via `findArchivedSquaresEventForGame` (one read, only on a discovery run that
  found the Super Bowl); action `super_bowl_archived`. The admin "Find the Super Bowl" button still creates it.
- **Late voids:** `isSquaresReopenWatchOn(reopenedAt, nowMs)` (`lib/squares.ts`): 3 h (`SQUARES_POST_FINAL_WATCH_MS`)
  after the void, even past the 12 h deadline. Past the deadline it reads at the post-final pace (every 5 min,
  `skipped: "reopened_wait"` between reads) — the game is long over, no need for every minute. Admin message: "It will
  re-grade from the feed within about 10 minutes; if the feed no longer shows this game, enter the scores instead", or,
  when the settlement isn't running, "press Run settlement now, or enter the scores".
- **Claim copy:** `rehearsal_only` → HTTP 403, "This board is a test game and isn't open at this venue."
  (`squaresClaimMessage`). The board view still shows a rehearsal event at a visible venue on a Preview (empty board,
  claims refused) — acceptable because the public flag is off in Production; 6.9 must archive the rehearsal first
  (added to the plan's 6.9 bullet).

### 4. Files created or changed
- `supabase/migrations/20261019142642_squares_event_lifecycle.sql` (new): `squares_events.purpose` (check
  `squares_events_purpose_valid`, default `super_bowl`), `squares_events.reopened_at`,
  `squares_results.credit_blocked_at` + `credit_blocked_note` (check `squares_results_credit_blocked_note_valid`: a
  note needs the timestamp, ≤ 500 chars); `squares_claim` replaced (+ `rehearsal_only`, reads `venues.hidden`, fails
  closed on null); `squares_void_moment` replaced (+ `reopened_at = now()`, log detail `reopened: true`). Both diffed
  against `20261019051458`: only those lines differ. Grants restated (service_role only). No new table → no new grants.
- `lib/seasonalGames.ts`: `isSquaresRehearsalEnabled()` (moved here from `lib/squaresSettlement.ts`; the single reader
  of `SQUARES_REHEARSAL_ENABLED`), `isSquaresWindowClosed(now)`, `isSquaresServerLive(now)`.
- `lib/squares.ts`: `SquaresEventPurpose`, `squaresEventPurposeFor`, `isSquaresReopenWatchOn`.
- `lib/squaresStore.ts`: `EVENT_COLUMNS` + record fields `purpose`, `reopenedAt`; `findArchivedSquaresEventForGame`;
  `createSquaresEvent` requires `purpose`.
- `lib/squaresSettlement.ts`: `SquaresSettlementMode`, `squaresSettlementMode`; tick: no discovery outside `season`,
  archived-game skip, `purpose: "super_bowl"` on discovery, late-void watch; `settleSquaresWinners` takes `purpose`.
- `lib/squaresPrizeAwards.ts`: `squaresPrizePaysAtVenue`, rehearsal venues read, header comment.
- `lib/squaresAdmin.ts`: `squaresArchiveRefusal`, `squaresSetGameRefusal`, purpose on create (+ log detail and
  message), `flags.settlementMode`, void message.
- `lib/squaresBoard.ts` (outcome type), `app/api/squares/claim/route.ts` (403), `lib/squaresView.ts` (copy),
  `lib/squaresTvRead.ts` (gate), `components/admin/sections/SquaresSection.tsx` (REHEARSAL badge, mode text, label).
- Tests: `scripts/test-squares-sql.cjs` (rehearsal claim/release refused at a visible venue with no board created,
  accepted at a hidden one, un-hiding stops it, `wrong_venue` still first, Super Bowl plays everywhere, purpose check,
  `reopened_at` stamped, 6.3 columns + note check); `tests/squares-settlement.test.ts` (discovery purpose, late void
  re-grades at +6 min with 1 read then `reopened_wait`, watch ends at 3 h, no watch without `reopened_at`, archived
  game not re-created, switch-alone runs in December without discovery and draws an admin rehearsal, December with the
  flag but no switch is inert); `tests/squares-engine.test.ts` (mode, TV gate, purpose, archive refusal incl. the
  Eastern-date edge, set_game, watch helper, claim copy/status, migration grants, purpose on every insert);
  `tests/lib.squares-prize-awards.test.ts` (fake now serves `venues`; rehearsal hidden/visible/read-error; Super Bowl
  never reads venues).
- Docs: plan status line + 6.2 "Built" note + 6.9 archive step, `CLAUDE.md` Squares 6.2 bullet, this file.

### 5. Facts and traps
- The previous session had started 6.2 (migration, SQL test, store types, `squaresEventPurposeFor`) without a
  handoff; this session verified it (function diffs, SQL proof) and finished it.
- `venues.hidden` is nullable in production (`listVenues` filters `hidden.is.null,hidden.eq.false`); the SQL uses
  `is not true` and the TypeScript `=== true`, so null = visible everywhere.
- The settlement test fake (`tests/squares-settlement.test.ts`) inserts events with `purpose` only if the code passes
  it; a rehearsal event in tests must be pushed into `tables.squares_events` by hand with its moments.
- `vi.stubEnv` leaks between tests unless unstubbed; the new describe blocks call `vi.unstubAllEnvs()` in `afterEach`.
- Plan 6.9 says "On Jan 31 confirm the event is discovered" — but discovery only runs inside the card window, which
  opens **Feb 1** (Eastern). Either confirm on Feb 1, or have an admin press "Find the Super Bowl" on Jan 31 (that
  creates it; the cron then draws at lock as long as the window or switch is on). Not changed here — flag it to 6.9.
- Production query recipe: see the 6.1 handoff §5 (`node --env-file=.env.local <file>.mjs`; never print `.env.local`).

### 6. Build / test (all run 2026-10-19 after the change)
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **5,033 pass / 13 skipped / 0 fail** (418 files);
  `npm run test:squares-sql` "all checks passed"; `npm run build` succeeds. Don't run tsc and build at once.
- Focused: `npx vitest run tests/squares-engine.test.ts tests/squares-settlement.test.ts tests/lib.squares-prize-awards.test.ts`.
- `/verify` (browser pass) was **not** run: the only player-visible change is one refusal message, and the claim
  route can't run against the shared database until the migration is applied. 6.7's rehearsal exercises it for real.
- Unverified: the migration on real Postgres/Supabase (proven on PGlite only); behaviour on a deployment.

### 7. Open questions for Andrew
- Run `supabase db push`, then push + deploy (or deploy 6.1 first; both are safe, see §2).
- Unchanged: Squares prize setup before Jan 25? Recommendation: leave it.

### 8. Recommended first steps for 6.3
1. Read plan §4 "6.3" and §13 F2, F7, F8, F9; this file §3.
2. `credit_blocked_*` columns already exist in 6.2's migration — if 6.3 needs a partial index, that's a NEW migration
   (and the 6.2 one must not be edited once applied; check `supabase migration list` first).
3. In `tick`, the early return before `settleSquaresWinners` must still let the 6.2 late-void watch pay (use
   `isSquaresReopenWatchOn`).
4. Full gates, commit, `docs/squares-and-brackets-plan_PHASE_6.3_HANDOFF.md`.
Model: Opus 5.5, effort medium.
