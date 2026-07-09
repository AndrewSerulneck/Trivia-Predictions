# Category Blitz "no grading" — briefing for a fresh pass

## What this app is

Hightop Challenge: users join a specific physical **venue** and earn points
playing mini-games (Trivia, Pick'em, Bingo, Predictions, Fantasy) scoped
strictly to that venue. Authentication is global (one account, one
username/passkey), but points, leaderboards, and game state are entirely
venue-specific — a user can belong to many venues with independent standings
in each. Next.js app, Supabase (Postgres + realtime broadcast) backend.

## What Category Blitz is

The newest mini-game. Like Live Trivia (`lib/liveShowdown*`), it's a **live,
venue-synchronized** game — everyone physically present plays the same
round, at the same moment, against the same clock (Pick'em, Bingo,
Predictions, and Fantasy are async/self-paced instead). Mechanically: a
round draws one letter for the whole
venue and 12 categories at random from that letter's vetted pool; every
player has 3 minutes to submit an answer per category starting with the
drawn letter; unique answers score 2 points, duplicate answers (across
players) cancel to zero for everyone who submitted that answer.

Core files:
- `lib/categoryBlitz.ts` — server-only engine: session/round lifecycle,
  scoring, the Haiku-based answer grader, the `driveVenueCategoryBlitz`
  self-healing function that every client poll runs through (this is what
  makes the game advance without a working cron), and `runCategoryBlitzEngine`
  (the actual Vercel Cron entry point, which **does not run** in `next dev`
  or preview deployments).
- `lib/categoryBlitzRealtime.ts` — client hook (`useCategoryBlitzSession`)
  driving all phase transitions from Supabase realtime broadcasts + a poll
  fallback + local timers.
- `components/category-blitz/CategoryBlitzGame.tsx` + reveal sub-components
  (`RoundStartReveal.tsx`, `RevealSequence.tsx`, `GradingCascade.tsx`,
  `LiveLeaderboard.tsx`) — the UI phase machine: `idle → lobby → answering →
  scoring → reveal → results → complete`.

## The reported problem

User (playing solo on `next dev`, localhost) reports: submits answers, round
timer runs out, and **nothing gets graded** — no reveal animation, no
grading cascade, no leaderboard. Just... nothing happens. This has persisted
across multiple rounds of fixes.

## What's already been investigated and "fixed" this session (and did NOT resolve it)

A prior analysis document, `docs/category-blitz-no-grading-analysis.md`,
identified 5 root causes/fixes, all of which have now been implemented:

1. **`lib/categoryBlitzRealtime.ts`'s fallback poll was disabled during
   `phase === "answering"`** (`if (phase === "answering") return;` inside a
   `setInterval`) — meaning, in solo play, the *only* thing that could ever
   call `scoreRound()` was this one browser tab's own 250ms local timer +
   `RoundStartReveal`'s Framer Motion `onAnimationComplete` callback, with
   **zero fallback**. **Fix applied:** removed the skip; the poll (every 15s)
   now always runs and calls `driveVenueCategoryBlitz` →
   `scoreExpiredRoundForVenue`, a server-truth safety net.

2. **No `visibilitychange` recovery.** If the tab was backgrounded during the
   ~1-2s `RoundStartReveal` animation, its `onAnimationComplete` (which sets
   `revealDoneRef`, a client-side gate that must be satisfied before the
   local timer will call `scoreRound()`) could permanently stall — nothing
   ever re-checks it. **Fix applied:** a `document.visibilitychange` listener
   forces an immediate resync on refocus, and (in
   `lib/categoryBlitzRealtime.ts`'s `applyRoundRef`) if that resync finds the
   *same* round already progressed past `"active"` server-side, it force-marks
   the reveal as "already seen" so the stalled local gate can't block the
   phase transition forever.

3. **`testMode` was an ambient per-request flag, not durable.** Any given
   HTTP request could independently decide a round's duration (10s test vs
   180s real), causing confusing mismatches between the UI's "test mode: on"
   badge and actual round behavior. **Fix applied:** added a
   `test_mode boolean` column to `category_blitz_sessions` (new migration,
   applied by the user via Supabase's SQL editor), stamped once at
   `createSession()` time; `startRound()` and `driveVenueCategoryBlitz()` now
   read `session.test_mode` from the DB for an *existing* session instead of
   trusting whichever request is currently driving.

4. **`scoreRound()` had no server-side check that the round had actually
   expired** — its own route docstring claimed otherwise. **Fix applied:**
   added a guard rejecting a claim attempt if `Date.now() < ends_at -
   SUBMISSION_GRACE_MS` (defense-in-depth; not believed to be the actual
   cause of the reported symptom).

5. **No mid-round reload/resume path** — a page reload replays
   `RoundStartReveal` from scratch (`revealedRoundId` resets to `null`),
   re-arming the completion gate and burning more of the round's clock.
   **Fix applied:** `showReveal` now also checks that the round's elapsed
   time is within the reveal animation's own max duration
   (`ROUND_START_REVEAL_MAX_MS`); if a round has clearly been running longer
   than that, the reveal is skipped and `markRevealDone` is called directly.

All 5 changes typecheck, lint clean, and don't break the existing test
suite. **None of them fixed the user's actual reported symptom** — after
implementing all five, the user reports it is "still the same problems."

## Confirmed NOT the cause (ruled out by direct user confirmation)

The user was asked three specific questions and confirmed:

1. **`CATEGORY_BLITZ_ALLOW_SOLO_SCORING=true` is set** in `.env.local` — so
   the `<3-player` gate in `scoreRound()` (which would otherwise force every
   answer to grade as `insufficient_players` / 0 points when playing solo)
   should be bypassed.
2. **The new `test_mode` migration was applied** — via Supabase's web SQL
   editor directly against the hosted dev database (project ref
   `pkmxupsayzshvpirkaav`, per `supabase/config.toml` — this is NOT a local
   Supabase instance, it's the same hosted Postgres the dev server's
   `.env.local` points at). So `category_blitz_sessions.test_mode` should
   exist and session queries should not be erroring on a missing column.
3. **Testing is against the dev server** (`localhost`, `next dev`), not a
   Vercel preview/production deploy — so uncommitted local changes should be
   live (Next.js fast-refreshes both client and server code from disk on
   save; no restart or commit required for them to take effect, provided the
   same dev server process is still running against this working directory).

## What I was in the middle of when redirected here

Attempting to actually seed a throwaway session server-side (bypassing the
browser/auth entirely, using `lib/categoryBlitz.ts`'s admin-only exports
directly via a Node script, mirroring `scripts/simulate-category-blitz.cjs`)
and drive it forward to observe real behavior + capture any DB/console
errors — to stop guessing and see the actual failure directly. This was
interrupted before any real observation was made, so **there is currently no
confirmed root cause for the persisting symptom** — everything above is
either "fixed but unverified in practice" or "ruled out by user's own
report," and there's been no direct browser/DB observation yet of what
*actually* happens in the failing case.

## Open hypotheses, not yet checked

- **Dev server process staleness.** Is the currently-running `next dev`
  process (PID confirmed listening on port 3000) actually the same one that
  picked up all these edits, or could it be stuck on a stale build /
  needs a hard restart? (`rm -rf .next` + restart is cheap to try.)
- **Browser-side staleness.** Stale service worker, cached JS bundle, or a
  `localStorage` `tp:category-blitz-test-mode` flag left in a weird state
  from earlier testing sessions.
- **A stuck/pre-existing session or round in the DB from before these fixes
  landed** — e.g. a session or round created under the old buggy code that's
  now in some state the new code doesn't know how to recover (the fixes
  patch the *forward* path, not necessarily every possible pre-existing
  stuck state). Worth checking `category_blitz_sessions` /
  `category_blitz_rounds` directly for the venue being tested, and possibly
  force-ending/deleting any lingering session before a clean retest.
- **The actual symptom may not be literally identical to before.** "Still
  the same problems" was reported without fresh browser console/network
  output — it's possible the *presenting* behavior has subtly changed (e.g.
  scoring now happens but the reveal/cascade UI has a separate bug not
  covered by the analysis doc) but looks the same at a glance ("nothing
  happens" from the user's perspective either way).
- **Something in the reveal/scoring client state machine
  (`revealDoneRef`/`resultsRevealDoneRef`/`phaseRef` in
  `lib/categoryBlitzRealtime.ts`) that the fixes didn't account for** — this
  state machine has needed multiple rounds of subtle timing fixes across
  prior sessions (per project memory: reveal/intermission timing bug,
  `startRound` race, and now these 5 phases) — it's plausible there's
  another edge case in the same area.
- **An actual runtime error that's being silently swallowed.** Several
  functions in `lib/categoryBlitz.ts` destructure `{ data }` from a Supabase
  query and ignore `error` (e.g. `scoreExpiredRoundForVenue`), which would
  silently no-op on any query failure (including one caused by an
  unexpected schema state) rather than surfacing it. Worth checking the dev
  server's terminal output and the browser console/network tab directly
  during a real repro, which has not yet been done this session.

## Suggested next steps for whoever picks this up

1. **Get direct observation of a real repro** — browser console + network
   tab open, dev server terminal visible, walk through: join venue solo →
   start/join a round (test mode toggle for short rounds) → submit ≥1
   answer → let timer expire → watch what actually happens (or doesn't) at
   each phase transition. This has not yet been done in this session despite
   multiple rounds of code changes — everything so far has been
   analysis/code-reading, not live observation.
2. Query `category_blitz_sessions` and `category_blitz_rounds` directly for
   the venue in question to see actual DB state vs. what the UI shows.
3. Check for a stuck pre-existing session for that venue and clear it before
   retesting, to rule out "old broken state, not a new bug."
4. If reproducible, capture the exact failure point (does `phase` ever leave
   `"answering"`? Does `POST /api/category-blitz/rounds/[id]/score` ever
   fire, and what does it return? Does `category_blitz_rounds.status` ever
   reach `"complete"` in the DB regardless of what the UI shows?) — that
   will localize whether this is a server-side scoring problem, a
   client-side phase-transition problem, or a UI rendering problem sitting
   on top of otherwise-correct state.
