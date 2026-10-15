# Category Blitz How-to-Play Plan — Phase 5 Handoff (sleep when idle)

**Date:** 2026-10-14 · **Plan:** `docs/category-blitz-how-to-play-plan.md` · **Phase 5 status:** built and checked
locally. **Not committed, not pushed, not deployed.** Phase 1 = `b1030fd`; Phases 2–5 are uncommitted on branch
`category-blitz-scoring-cadence`.

## For Andrew (plain English)

- **Category Blitz now runs only while someone is playing it.** A new round starts only when a player has the game
  open on their phone. Opening the venue home page, the TV screen or the admin panel no longer keeps it running.
- **Nothing is lost when people leave mid-round.** The every-minute background job still grades the round. It just
  doesn't start another one.
- **A player who opens the game after a quiet spell gets a fresh round straight away**, with the full 3 minutes.
- **Venue home:** the Category Blitz card is always there, as before. The red "LIVE / Live game in progress!" label
  now shows only while a round is actually being played or its results are showing. Before, it showed all day at the
  12 venues, because the game never stopped.
- **TV screen:** while the game is asleep, the TV shows its normal idle screen with a "Category Blitz — Play anytime —
  Start it on your phone" card. When someone starts a round, the TV switches to it within about 20 seconds.
- **Cost:** today the game starts about **2,470 rounds a day** (measured 2026-10-09 → 10-14), and almost nobody plays
  them. After this ships, rounds only start when people play. The background job goes from about 85 database queries a
  minute to 1. The database stops growing by about 43 MB a month. Nothing in this change costs more.
- **Nothing changes until you deploy.** Committing and deploying are your call. Phase 6 (deleting the old empty
  rounds) should run only **after** this is live, or the table keeps refilling.
- **Not checked yet:** the TV's new idle card in a real browser, and the whole flow on a real phone.

## For the next agent

### 1. Next phase
**Phase 6: one-time cleanup of old empty Category Blitz rounds** (plan §5 Phase 6). Model: **Claude Opus 5.5,
effort medium.** **Hard precondition: Phase 5 must be deployed to production first.** Check that before you write or
run anything (see §8). Out of scope: Phase 7 (full gates, device checklist, release record), any change to the engine,
and any table other than `category_blitz_rounds`.

### 2. Starting state
- Branch `category-blitz-scoring-cadence`. Only `b1030fd` (Phase 1) is committed. Phases 2, 3, 4 and 5 are uncommitted.
- The working tree also has a lot of Andrew's unrelated uncommitted work: Speed Trivia, Live Trivia ranked places,
  `components/venue/venueHubShared.tsx`, `AGENTS.md`, `SYSTEM_CONTEXT.md`, `package.json`/`package-lock.json`, the
  sports-bingo star indexes and others. **Stage only Category Blitz files, by path.** Never run `git add -A` or
  `git checkout -- <file>`.
- Andrew's `next dev` is running on :3000 **from this working tree**, so it already serves the Phase 5 code. Never
  `pkill next`.
- **Data:** I created one throwaway continuous session on the `sim-category-blitz` venue (production DB, via the dev
  server: id `a5e52028-820b-4977-9fdf-e4f6743612f1`, one round). I deleted it right after. Afterwards the venue had
  0 sessions and 0 rounds. No other venue was written to. Every other production query in this phase was read-only.
- Production is still running the **old** engine: 12 open continuous sessions, about 205 rounds per venue per day.

### 3. Decisions already made (don't re-ask)
- Andrew (plan §2): sleep when idle, **yes**. The TV must not keep the game awake. No migration, no flag, no env var.
  The behaviour change ships with the deploy.
- **Peek mechanism:** `GET /api/category-blitz/sessions?venueId=…&peek=1`. It keeps the response shape
  (`ok, session, nextWindowAt, realtimeChannel`) and adds `live: boolean`. I picked a query flag over a new route so that
  the room mapping and the concealment (`session.venueId` remapped to the caller's venue, hashed channel) stay in one
  file.
- **"Awake" rule** (one home: `isContinuousGameAwake` in `lib/categoryBlitzShared.ts`). The game is awake when
  `now < nextRoundStartAtMs(latestRound) + CATEGORY_BLITZ_SLEEP_GRACE_MS` (30 s), using the venue's continuous timing.
  So it is awake during a round and during its results/intermission. It goes to sleep 30 s after the next round was due
  if nobody started it. No rounds at all also counts as asleep. The 30 s covers the game page's boundary kick (0–10 s)
  and its 15 s fallback poll, so the TV and venue home don't flicker to "asleep" while a live room rolls into its next
  round.
- **Scheduled (non-continuous) venues are unchanged in behaviour.** For them, peek reports `live` = "an open session
  exists", as before. The TV still drives `driveVenueCategoryBlitz` for scheduled venues; the plan says the scheduled
  engine is untouched.
- **TV asleep state:** text only ("Play anytime" / "Start it on your phone"). There's **no QR code**. The plan offered
  a QR from `lib/joinQr.ts`, but that encodes `https://play.hightopchallenge.com` and the domain split is still
  flag-off. I didn't want to put a link on the TV that might not work yet. Adding one later is a small change in
  `IdleVenueScreen`/`TvIdleAttract`.
- **The continuous cron now only scores.** `runContinuousCategoryBlitzEngine()` = `scoreExpiredRounds()`, the same
  function the `/api/cron/category-blitz-score` cron already runs every minute. Running both is safe: the
  `active→scoring` claim in `scoreRound` lets exactly one caller grade a round. I didn't touch `vercel.json` (hard
  boundary), so both cron entries stay.

### 4. Files changed (Phase 5 only)
| File | Change |
|---|---|
| `lib/categoryBlitzShared.ts` | `CATEGORY_BLITZ_SLEEP_GRACE_MS`, `isContinuousGameAwake()` (pure, client-safe). |
| `lib/categoryBlitz.ts` | New `peekCategoryBlitz(venueId, now)` + `CategoryBlitzPeek` type: 2–3 reads (config, open session, latest round), never writes. `runContinuousCategoryBlitzEngine()` now takes no args and returns `{ scored, errors }` from `scoreExpiredRounds()`. `scoreExpiredRounds` docstring updated. (This file also has uncommitted Phase 3 edits.) |
| `app/api/category-blitz/sessions/route.ts` | `peek=1` branch at the top of GET: no drive, no presence registration, adds `live`. Continuous sessions get `roundDurationSeconds`/`intermissionSeconds`, as the drive path does. The no-peek path, used by the game page, is unchanged and still drives. |
| `app/api/cron/category-blitz-continuous/route.ts` | Docstring only. |
| `lib/venueScreen.ts` | `getCategoryBlitzInput` peeks instead of `driveContinuousCategoryBlitz`. When continuous mode is asleep it returns `asleep: true`, which makes `selectVenueScreenState` produce `mode: "idle"` with `idle.categoryBlitzOnDemand = true` (new optional field). When awake, it reuses the peek's session and round, so there's no second round read. |
| `components/venue-screen/IdleVenueScreen.tsx`, `TvIdleAttract.tsx` | "Play anytime" card. `NextGame.startsAt` is now optional, with a new `kicker` that replaces the time line. |
| `components/venue/VenueHubClient.tsx` | `loadCategoryBlitzStatus` calls with `&peek=1`; LIVE = `payload.live === true`. |
| `components/admin/sections/CategoryBlitzSection.tsx` | Live-session panel polls with `&peek=1`. |
| `components/category-blitz/CategoryBlitzGame.tsx` | `fetchCategoryBlitzNextWindowAt` (scheduled lobby's "next game in") uses `&peek=1`. It only needs `nextWindowAt`, and the session hook already drives. |
| `lib/categoryBlitzRealtime.ts` | Comment only: the kick and the poll are now the only things that start rounds. |
| `lib/venueGameCards.ts` | Stale comment on the unread `visibleOnVenueHome: false` corrected. |
| `CLAUDE.md` | The Category Blitz continuous bullet now states the sleep rule. The old "cron advances rounds" sentence was false. |
| `.claude/skills/verify/SKILL.md` | Notes that a no-peek sessions GET starts continuous rounds and that `peek=1` only reads. |
| `scripts/count-category-blitz-rounds.cjs` (new) | Read-only measurement script (§6). **Not** added to `package.json`, because that file has Andrew's uncommitted changes. |
| Tests | `tests/lib.category-blitz-continuous-engine.test.ts`: the old "cron drives every open session" tests were replaced by sleep tests, plus peek and wake tests. `tests/api.category-blitz-sessions.test.ts`: peek tests. `tests/lib.venue-screen.test.ts`, `tests/venue-screen-idle-components.test.ts`: asleep state. `tests/lib.venue-screen-sponsors.test.ts`: mock gains `peekCategoryBlitz`. **New tripwire `tests/category-blitz-sleep-contract.test.ts`**: the awake rule; `driveContinuousCategoryBlitz(` is called only from `lib/categoryBlitz.ts` and the sessions route; the continuous cron body never drives, starts or creates; venue home and admin call only with `peek=1`; the TV uses `peekCategoryBlitz`. |

How they fit: the game page (`useCategoryBlitzSession`: initial load, 15 s poll, round-boundary kick, visibility
catch-up) → `GET /api/category-blitz/sessions` (no peek) → `driveContinuousCategoryBlitz`. That is the only path that
creates a continuous session or starts a round. Everything else peeks. Expired rounds are graded by either cron, by the
client's own `/score` call at zero, or by `scoreExpiredRoundForVenue` inside a drive.

### 5. Facts and traps
- **Baseline (production, read-only, 2026-10-14 ~21:00 ET):**

  | UTC day | rounds | answers |
  |---|---|---|
  | 10-09 | 2,431 | 0 |
  | 10-10 | 2,472 | 0 |
  | 10-11 | 2,471 | 0 |
  | 10-12 | 2,470 | 0 |
  | 10-13 | 2,455 | 0 |
  | 10-14 | 2,477 | 93 |

  In the last 24 h it was 205–209 rounds at each of 12 venues, with 12 open continuous sessions. Compare after deploy.
- **The global continuous default is ON in production.** `sim-category-blitz` (no override row) resolves to
  continuous. So does a made-up venue id: `peekCategoryBlitz` reports a config for any id when the flag is on. The TV
  returns `null` for unknown venues before it gets that far.
- **A background tab still counts as "open".** Desktop Chrome throttles a hidden tab's 15 s poll to about once a
  minute, and each poll past the boundary starts a round. A player who leaves the game open in a background tab keeps
  it going. iOS Safari and the native app suspend hidden pages, so they stop. This matches Andrew's rule ("while a
  player has it open").
- **A round stuck in `scoring` (pre-existing, not changed):** nothing rescues it. `scoreRound` on a `scoring` round
  only re-reads it, and `driveContinuousCategoryBlitz` returns `round_in_progress` forever. With peek, such a venue now
  reads as asleep 30 s after its expected next round instead of LIVE forever. The cron scans `status = 'active'` only,
  not the plan's `active, scoring`, because adding `scoring` would re-read stuck rows every minute and fix nothing.
- **Idle-tick cost:** `scoreExpiredRounds` is one query, `status = 'active' AND ends_at < now − grace`. The table has a
  partial unique index `uq_category_blitz_rounds_session_open (session_id) WHERE status IN ('active','scoring')`, which
  holds at most one row per open session. I didn't EXPLAIN it. If you want to confirm the planner uses it, run
  `supabase inspect db index-stats --linked` (read-only).
- Two players arriving within a second still produce one round. That comes from the existing DB partial unique index
  plus the `23505` branch in `startContinuousRound`. The unit-test fake doesn't enforce unique indexes, so this path
  isn't unit-tested; the code is unchanged from before.
- `NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM` (off): the peek route and the TV still go through
  `resolveCategoryBlitzRoomId`, and the peek response remaps `session.venueId` to the caller's venue.
- `lib/categoryBlitz.ts` needs `grep -a` (plain grep treats it as binary).
- One `npm run test` failure is **not ours**: `tests/scripts.speed-trivia-admission.test.ts` › "plans from database
  counts and supplies less-used subtopics" (expected `Literary Landscapes`, got `Music`). It belongs to Andrew's
  uncommitted Speed Trivia work.

### 6. Build / run / test — what was verified
- `npx tsc --noEmit`: clean. `npx eslint` on every changed file: clean.
- `npm run test`: 373 files pass, 4,443 tests pass, 13 skipped, **1 failed (the unrelated Speed Trivia test above)**.
  Phase 5 suites: engine 19/19, sessions route 4/4, venue screen 31/31, sleep contract 8/8.
- `npm run build`: **green**, 204 pages (run after the tests, never at the same time as tsc).
- **Live, against the real database via Andrew's dev server, `sim-category-blitz`:** `peek=1` twice gave
  `session: null, live: false`, and nothing was created. A no-peek GET (the game page's call) created a continuous
  session and started a round. `peek=1` then gave `live: true`, `roundDurationSeconds: 180`. Cleaned up afterwards.
- **Read-only `peekCategoryBlitz` against production** (tsx probe, not in the repo): `venue-hightop-test` and
  `venue-pacific-street` were awake (old engine still running), 300–400 ms per call; `sim-category-blitz` was asleep.
- **Measure after deploy** (plan step 8):
  `node --env-file=.env.local scripts/count-category-blitz-rounds.cjs --days 7` (run from the repo root). Re-run it
  daily for a few days and report the drop to Andrew.
- **Not verified:** the TV's "Play anytime" card in a browser; a full browser session (game open → close → no new
  round over several minutes); a real phone. Phase 7 covers these. The cron change is covered by unit tests only. I
  didn't call the production cron by hand.

### 7. Open questions for Andrew
- Commit Phases 2–5 and deploy? Phase 6 is blocked until Phase 5 is live.
- Optional: a QR code on the TV's "Play anytime" card, once `play.hightopchallenge.com` is live.
- Plan §7 (still not asked): a small daily prune of empty rounds older than 7 days.

### 8. First steps for Phase 6
1. **Confirm Phase 5 is deployed.** Ask Andrew, or check Vercel. Then run
   `node --env-file=.env.local scripts/count-category-blitz-rounds.cjs --days 3` and check that today's count has
   dropped well below about 100 per venue per day. If it hasn't, stop: the table is still refilling.
2. `git status`; confirm the branch and that the Phase 2–5 files are present (or committed).
3. Read plan §5 Phase 6. The predicate is exact: **zero submissions** (fresh read per batch), `status = 'complete'`,
   `started_at` older than 24 h, and **not the latest round of its session**. Dry run by default; `--apply` deletes.
   Batches of about 1,000. Put the log in the scratchpad, not the repo.
4. After Phase 5, the open sessions' latest rounds are the ones the engine and the TV read. Keep them; the predicate
   already does.
