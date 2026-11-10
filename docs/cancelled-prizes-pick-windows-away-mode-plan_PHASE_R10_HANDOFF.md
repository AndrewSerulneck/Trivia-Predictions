# Phase R10 handoff: one "at the bar" rule for Category Blitz and every write (2026-11-10)

## For Andrew (plain English)

- **What changed:** "At the bar" now means one thing everywhere: your location pass hasn't run out. Before, Category Blitz let
  a player who had left keep starting rounds from home for up to 30 minutes, while picks, squares and brackets cut them off
  at 15. Now both stop at the same moment. The pass lasts 16 minutes and the app re-checks location every 15, so someone
  still at the bar never sees it run out.
- **Live?** No. Code and tests only: uncommitted, not deployed, no database or env change. Held for Phase R like the rest.
- **Cost:** none. Same number of location checks and requests.
- **Needs you:** nothing now. Next is Phase R: a fresh `/code-review` of everything held, then your go-ahead for
  `supabase db push` (three migrations), commit and deploy.

## For the next agent

### 1. Next phase: Phase R (review + release), and what is out of scope
Plan §7 "Phase R: Review + release": run `/code-review` at **high** on the whole held diff (A2–B4 + R1–R10). Fix findings
caused by R7–R10; anything else goes to Andrew to decide (no automatic new remedial round). Then `npm run test`, typecheck,
lint, `npm run build`, the SQL proofs, Andrew's go-ahead for `supabase db push`, commit, deploy, CLAUDE.md Feature-rules row,
`SYSTEM_CONTEXT.md` §7/§8. Out of scope: Q7 (separate plan only if Andrew wants it).

### 2. Starting state
Branch `main`, last commit `40d47492`. Nothing committed, pushed or deployed; ~149 changed entries from A2–R10 (Andrew
2026-11-09: don't commit before Phase R). No migration, env or data change in R10. Still-unapplied migrations:
`20261109214742_push_game_reminder_optins.sql`, `20261109223743_pickem_pick_windows.sql`,
`20261110014242_pickem_venue_frozen_lines.sql`. `VENUE_PRESENCE_TTL_MS` is not set in Vercel (checked 2026-11-10 per plan), so
the code default (now 16 min) applies; `VENUE_PRESENCE_ENFORCEMENT=1` everywhere.

### 3. Decisions already made
Andrew 2026-11-10: every §8 question takes its default. Q8 = one rule, 16-minute lease, heartbeat stays 15 min (built here).
Not (a) 14-minute heartbeat (+7% checks) and not (b) a Category Blitz-only grace.

### 4. Files changed
- `lib/venuePresence.ts`:
  - New exported `presenceRowAllowsPlay(row, nowMs)`: `status === "active"` and parseable `expires_at > nowMs`.
  - `getActiveVenuePresence`: after loading the row, returns success if the predicate passes; otherwise the old branches
    unchanged (non-active status → failure + telemetry; active but lapsed → `expired` upsert + telemetry).
  - `isVenuePresenceLive`: selects `status, expires_at` and returns the predicate (was: `active|expired` and
    `last_verified_at` within 2 × TTL). Still read-only, no telemetry; God Mode still true.
  - `VENUE_PRESENCE_TTL_MS` 15 → 16 min; `getVenuePresenceTuningConfig` ttl clamp `max` 15 → 16 min; comment reworded.
- `components/venue/VenuePresenceBoundary.tsx`: comment only (`PRESENCE_CHECK_INTERVAL_MS` stays 15 min; lease outlives it by 1 min).
- Tests: new `tests/lib.venue-presence-live.test.ts` (predicate table of 10 rows, both functions agree on each + no row,
  TTL − interval = 60 s contract read from the component source, env clamp accepts the default). Rewrote the
  `isVenuePresenceLive` describe in `tests/lib.venue-presence-checkin.test.ts` (no grace). Fixture expiry times moved
  15 → 16 min in `tests/lib.venue-presence-phase5.test.ts` (lines 128, 138, 234) and `tests/lib.venue-presence-god-mode.test.ts` (165, 193).
- Docs: plan status lines, R10 "Built" note, standing rule D8 extended with the R10 rule.

### 5. Facts and traps
- The contract test parses `const PRESENCE_CHECK_INTERVAL_MS = 15 * 60 * 1000;` from the component with a regex; if that line's
  shape changes, update the regex (the constant isn't exported because the component is a client file).
- Telemetry rows record `lease_ttl_ms`; after deploy they will show 960000 instead of 900000.
- A lease that lapses now flips Category Blitz to peek at once (no 15-minute slack). The heartbeat starts a few seconds after
  15 min, inside the 1-minute margin, so a player at the bar shouldn't notice; a backgrounded tab whose timers are throttled
  past 16 min will see peek until the next check, same as writes already did.
- `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md` has no presence rules; nothing there to update.
- Raw `npx tsc --noEmit` prints `.next/types/` "routes.d 2.ts" duplicates; filter with `grep -v "routes.d 2.ts"`.

### 6. Build, run, test
- `npm run test`: 520 files passed, 1 skipped; 6,860 tests passed, 13 skipped.
- `npm run test:god-mode-join`: 59 passed. `npx tsc --noEmit` (filtered): clean. `npx eslint` on changed files: clean.
- Not run: `npm run build`, browser test (Phase R). **Unverified:** a real heartbeat at minute 15 renewing a lease before the
  16-minute end on a phone.

### 7. Open questions for Andrew
None.

### 8. Recommended first steps for Phase R
Model: Opus 5.5, high effort (plan §7 table: `/code-review`, migrations, deploy). Start with `/code-review` high on the working tree, then the checklist in §7 "Phase R".
