# Pick 'Em plan: Phase 7.4 handoff (stuck pending picks can't stop settlement)

Plan: `docs/pickem-college-football-and-prize-plan.md` — finding **F4** in §9, "### Phase 7.4" in §7. Previous handoff:
`…_PHASE_7.3_HANDOFF.md`. Built 2026-11-01.

## For Andrew (plain English)

**What changed:** Pick 'Em scores the oldest unscored picks first, 500 at a time. A pick whose game can no longer be
found (we only look a week back for scores) used to sit there forever; if 500 of them piled up, nobody would ever be
scored or paid again. Now any pick whose game started more than 8 days ago is cancelled (no points, no loss) before
scoring starts. Production has exactly 4 such picks today (NFL, from Jul 30 and Aug 2); the first run after deploy will
cancel them. Also: a College Football pick whose game disappears from the data feed is now cancelled 48 hours after
kickoff, like every other unscorable college pick — but never because the feed was down (a feed outage looks like
"no games", so we check the feed actually answered first).

**Is it live?** No. Code only (no database change), uncommitted, not deployed (`main` is frozen). It ships with Phases 1–6.
With 7.4 done, the "don't deploy before 7.4" rule is met — but 7.5 and 7.6 (re-review) are still planned before your
phone pass.

**Cost:** a normal run makes no extra request. Only when a stuck pick exists: one extra database update and one re-read,
once (after that it's gone). Provider (BallDontLie) calls are unchanged.

**What needs you:** nothing for 7.4. (7.1c's database change is still waiting for you to apply: see its handoff.)

## For the next agent

### 1. Next phase goal and scope
**Next: Phase 7.5 — small fixes F5, F6, F10. Sonnet 5.5 · medium.** Spec: "### Phase 7.5" in plan §7 and F5/F6/F10 in §9.
F5: the blocked-game limit message is the prize covering THAT game (server sets it per game). F6: the prize sweep's
"graded in the last 5 minutes" read (`lib/pickemPrizeAwards.ts`, one unordered `.limit(1000)`) is ordered and paged or
capped per venue. F10: `PickEmPrizeTiebreakerCard`'s "Saved!" flash uses dark/light tokens, not `bg-emerald-400` (may
wait for the light-theme release). Out of scope: F7 (Andrew: leave the default), 7.6's re-review.

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). Phases 1–6, every Phase 7 doc and 7.1/7.1b/7.2/7.1c/7.3/7.4
  are **uncommitted**. Nothing pushed or deployed. `main` frozen: never push `main`, never `supabase db push`, never change
  Production env without Andrew (memory: `project_main_frozen_during_app_review`).
- **Production DB:** untouched by 7.4 (read-only SELECTs only). `20261101153306` (7.1c) is written but **not applied**;
  the earlier seven Pick 'Em migrations are applied.
- **Live measurement 2026-11-01 (read-only):** pending picks with `starts_at` older than 8 days = **4**, all NFL
  (`americanfootball_nfl`): two at `2026-07-30T20:20:00+00:00`, two at `2026-08-02T13:00:00+00:00`. These are also the
  only started pending picks in the table. The first run after deploy logs
  `[Pick 'Em] stale-pending-canceled count=4 oldest=2026-07-30T20:20:00+00:00 …` and cancels them (0 points).

### 3. Decisions made (don't re-ask)
- Cutoff = 8 days (`PICKEM_UNFINDABLE_PENDING_MS`, exported from `lib/pickem.ts`), one day of margin past the ±7-day
  score fetch. Applies to EVERY sport, MMA included (MMA reads by year, but a fight not graded within 8 days is not going
  to be; cancel is the same terminal outcome every void uses).
- **Cost-first shape:** the bulk cancel runs only when the FIRST row of the oldest-first 500-row read is past the cutoff
  (so a normal run has zero extra requests), then the read runs again so the fresh picks grade in the same run. One
  `UPDATE … WHERE status = 'pending' AND starts_at < cutoff` (`.select("id, starts_at")` for the count/oldest log), not
  per-id updates.
- The cancel writes the same shape as any other cancel: `status 'canceled'`, `winning_team_id null`, `resolved_at now`,
  `reward_points` = 10 (every settled row carries it; payment, stats and prizes all key on `won` / `reward_claimed_at`,
  so a canceled row is never paid). Scores are left null.
- A per-player call (`settlePendingPickEmPicks({ userId })`, from `/api/pickem/picks` and `/api/pickem/games`) cancels only
  that player's stuck picks — same scope as its read.
- A failed bulk cancel logs `[Pick 'Em] stale-pending-cancel-failed` and the run continues with what it read (never throws).
- **Missing college game:** cancelled at 48 h only when the sport's fetch was COMPLETE. `lib/balldontlie.ts`
  `fetchBallDontLieJson` returns `{}` on a network error or non-2xx reply, which `fetchBallDontLieList` used to turn into
  `[]` silently = "no games". Without the completeness check a provider outage would cancel every college pick past 48 h.
  Incomplete = any day query threw, came back with no `data` list (`failure` box), or hit the 2-page cap (`truncation`
  box; ~97 D1 games per Saturday vs a 200-row cap, so not expected). Other sports with a missing game keep waiting for the
  8-day cancel (unchanged behaviour inside the window).

### 4. Files changed
- `lib/balldontlie.ts`: `fetchBallDontLieList(path, query, maxPages, truncation?, failure?)` — new optional 5th arg; set
  `failed = true` when a page has no `data` array. Existing callers (pickem, pickemGameLines, nflPickEm, fantasy) unchanged.
- `lib/pickemCollegeFootball.ts`: new pure `collegeFootballMissingGameGate({ scoresComplete, startsAtMs, nowMs })` →
  `"wait" | "cancel"`.
- `lib/pickem.ts`:
  - `fetchScoresForSportKey` now returns `PickEmScoreFetch = { events, complete }` (MMA and unknown providers: `complete:
    false`). Its only caller is `settlePendingPickEmPicks`.
  - `PICKEM_UNFINDABLE_PENDING_MS` + the read-then-cancel-then-reread block at the top of `settlePendingPickEmPicks`
    (`readPending` closure).
  - The per-pick write + won/lost/push counting moved into a `recordSettlement` closure (same code, now shared by the main
    path and the missing-game cancel).
  - `if (!scoreEvent)` now runs the college missing-game cancel (log: `the provider has no such game 48 hours after kickoff`).
- `tests/lib.pickem-stale-pending.test.ts` (new, 13 tests): its mock honours order + limit + `lt`. 600 stuck + 1 fresh →
  all 600 cancelled, fresh one won, one log line, two reads, no NFL score request; normal run = one read, no log; 7 d 23 h
  not cancelled; per-player scope; failed cancel; college missing game: cancel at 48 h (winner + spread), wait before,
  wait on failed reply / thrown day / page cap; NFL missing game waits; gate unit test.
- `tests/lib.balldontlie-list-failure.test.ts` (new, 4 tests): the failure box on 200-empty / 503 / network error / no box.
- `tests/lib.pickem-nfl-scoring-mode.test.ts`: `beforeEach` now fakes the clock to 5 h after the fixture's kickoff
  (2026-01-01). Those tests used the REAL clock, 10 months after kickoff, so the new 8-day rule cancelled their picks.
  Grading logic in the file is untouched and all 17 pass — that is the "NFL grading unchanged" check.
- Plan (status line, Phase 7 table, 7.4 + 7.5 headings, F4 row), `CLAUDE.md` Pick 'Em Phase 7 bullet, this file.

### 5. Facts and traps
- The older settlement test mocks (`tests/lib.pickem-college-football.test.ts`, `…college-spreads…`, `…nfl-scoring-mode…`)
  ignore `limit` and have no `.lt`. Any test whose pick is > 8 days older than the clock now hits the bulk cancel and fails
  with `.lt is not a function` — give it a fake clock near kickoff, don't weaken the rule.
- Mutation check done: with both new guards disabled, 5 of the 13 new tests fail (head-of-queue, per-player, failed cancel,
  both college cancels); restored afterwards (file copied back; `git checkout` was NOT used — it would wipe the other
  uncommitted phases).
- `lib/nflPickEmRewardAccrual.ts` has its own 500-row page on WON picks; unaffected.
- Canceled picks are already excluded from the Pick 'Em Prize limit (`lib/pickemPrizeLimit.ts`), standings
  (`lib/pickemPrizeStandings.ts`) and awards (`lib/pickemPrizeAwards.ts`), so the cancel frees the "X out of N" slot and
  ends the prize final-pass hold F4 described.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification (2026-11-01)
- `npx tsc --noEmit` clean; `npx eslint` on every changed file clean.
- `npm run test`: 6,011 pass / 13 skipped / 4 fail — the same four date-based Prop Bingo star-index tripwires as every
  phase (`tests/lib.sportsBingo.{nfl,mlb}-star-index{,-freshness}.test.ts`).
- `npm run build` passes.
- No SQL changed, so the PGlite suites were not re-run (they passed at 7.3).
- **Unverified:** the bulk update's `.select()` count on real PostgREST (standard supabase-js `update().eq().lt().select()`;
  only exercised against the mock), and a real provider outage reply shape (assumed `{}` per `fetchBallDontLieJson`).
  Watch the first production run for the `stale-pending-canceled count=4` line.

### 7. Open questions for Andrew
- None new. Waiting on him: apply 7.1c's migration. Still open: §8 Q1 (NBA/WNBA spreads later), Q3 (Pick 'Em standings
  in Partner Results; default no).

### 8. Recommended first steps for Phase 7.5 (Sonnet 5.5 · medium)
1. Read F5, F6, F10 in plan §9 and "### Phase 7.5" in §7.
2. F5: find where the games response sets `limitMessage` / `pickLimitReached` (`lib/pickemGamePrizes.ts`,
   `lib/pickemPrizeLimit.ts`, `components/pickem/PickEmGameList.tsx`) and make the message per game.
3. F6: `lib/pickemPrizeAwards.ts`, the "graded in the last 5 minutes" read; order by `resolved_at` and page, or cap per venue.
4. F10: `components/pickem/PickEmPrizeTiebreakerCard.tsx` — tokens per `AGENTS.md` "Adding a colour" (dark + light values).
5. Re-run `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
