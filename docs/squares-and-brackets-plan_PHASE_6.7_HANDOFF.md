# Squares plan — Phase 6.7 handoff (rehearsal SET UP; the live run is Sun Oct 25, 2026)

Date: 2026-10-21. Plan: `docs/squares-and-brackets-plan.md` §4 "6.7". Status: **part 1 (setup) done, part 2 (live run
+ checks) waits on the game.**

## For Andrew (plain English)

- **What's ready:** a Squares rehearsal on a real NFL game, **Kansas City @ Seattle, Sunday Oct 25, 8:20 PM ET**, at
  the hidden Hightop Test Bar. 46 test players already hold 92 of the 100 squares. The 8 open squares (1, 39, 53, 54,
  59, 64, 98, 99) are for you. A test prize ($10 gift card for each of Q1, halftime, Q3 and the final) is set up there.
- **What's live:** the 4 Squares commits (6.5 part 1, 6.6.1–6.6.4) were pushed and deployed to Production. The
  rehearsal switch (`SQUARES_REHEARSAL_ENABLED`) is on in Production, and Production's every-minute job is already
  following the game. Players see nothing new: the Squares card and the Squares prize stay hidden, because the public
  switch is still off in Production.
- **Your phone pass (checklist section A, `docs/squares-and-brackets-device-checklist.md`)** happens on this test
  site: **https://hightop-challenge-p3267il9b-andrewserulnecks-projects.vercel.app**. Sign in, pick **Hightop Test
  Bar**, then go to `/squares` on that site (the card on the venue home only shows Feb 1–15). Second player: username
  `bktrehearsal1`, PIN `1066` (it already holds 2 squares, so it can't claim more; use it for "tap someone else's
  square"). Claims close at **7:50 PM ET**, and the numbers are drawn within a minute or two of that. TV:
  `<test site>/venue/venue-hightop-test/screen`.
- **Optional:** to check the partner prize wizard (A6, first bullet), create a second Squares prize at the test
  venue, e.g. paying Q1 and the final only. That's fine: it also tests two prizes on one game.
- **Running cost:** before the game, one small database read a minute plus one feed request an hour. During the game,
  about one feed request a minute. No new services.
- **Needs you:** the phone pass on Sunday night. After the rehearsal: switch `SQUARES_REHEARSAL_ENABLED` **off** in
  Production (Vercel dashboard → Environment Variables; then Redeploy). I'm not allowed to remove a variable myself.

## For the next agent

### 1. Next: 6.7 part 2 (Opus 5.5 · high), from Sun Oct 25 ~23:30Z to Mon Oct 26
Goal: watch the live run, then check every step against the database and the Preview API; run one void + re-grade;
record request counts against plan §6; write the 6.7 part 2 handoff + the plan's "as built". Out of scope: launch
(6.9), any rule change (a failure becomes a 6.8.x sub-phase, never an in-place patch), brackets.
**6.5 part 2** (the Thu Oct 22 NE @ CHI capture, recorder PID 10302, `docs/squares-and-brackets-plan_PHASE_6.5_HANDOFF.md` §8)
should be looked at BEFORE Sunday. If it changes `quartersFinishedFromStatus`, that change must be reviewed, committed,
pushed and the Preview branch updated before the 7:50 PM ET lock, or the rehearsal runs on the old rule. Say which
one it ran on.

### 2. Starting state
- Branch `main`, pushed to `origin/main` at `92a4aea` (6.6.3 + 6.6.4). Production deploy `hightop-challenge-6astjrbib`
  (Ready, aliases hightopchallenge.com / play.). This handoff + plan edits are one LOCAL docs commit on top, not
  pushed (pushing would only redeploy Production for docs).
- **Preview:** branch `squares-rehearsal` = `main@92a4aea` + one empty commit `0524e9f` (pushed only to rebuild with
  the env vars; never merge it). Deploy `https://hightop-challenge-p3267il9b-andrewserulnecks-projects.vercel.app`,
  Ready. (`q3mluyuvh` is the same branch built BEFORE its env vars were added: ignore it.) To ship new code to it:
  `git push origin main:squares-rehearsal --force-with-lease`, then wait for the build.
- **Vercel env (added 2026-10-21 ~21:57Z):** Production `SQUARES_REHEARSAL_ENABLED=true` (in effect: deploy
  `6astjrbib` was built after it). Preview scoped to branch `squares-rehearsal`: `SQUARES_REHEARSAL_ENABLED=true`,
  `NEXT_PUBLIC_SQUARES_ENABLED=true`. `NEXT_PUBLIC_SQUARES_ENABLED` is NOT set in Production. Keep it that way
  until 6.9.
- **Database (production, shared):**
  - Rehearsal event `6f7c7584-d560-460c-8642-7336793d76d8`, `purpose = 'rehearsal'`, BDL game `1392321` (KC @ SEA,
    season 2026, week 7). Columns = KC (visitor, AFC), rows = SEA (NFC). Kickoff `2026-10-26T00:20Z`, lock
    `2026-10-25T23:50Z` (auto). `created_by = claude-6.7`. Production's cron stamped `feed_checked_at`
    `2026-10-21T22:00:43Z`, about a minute after the deploy: the switch-alone settlement gate works.
  - Test prize `0289f9d9-2885-4a6a-a3ad-cff08624516c` (definition `squares_challenge`, `game_winner`, gift card $10,
    moments q1/half/q3/final, quota 4, end date 2027-02-15, created as owner `64f046ff-a44f-47b4-acc1-94ff30288920`).
    **After the run, set it inactive** (as the 10.6 bracket prize was). Its end date covers the real Super Bowl at this
    (hidden) venue.
  - Players at `venue-hightop-test`: `bktrehearsal1` `72144672-7506-428c-9347-421c1c3c5411` and `bktrehearsal2`
    `221c4bfa-be33-4945-a8d0-c223836c2c5b` (accounts from 10.6, PIN `1066`), plus 44 new `users` rows
    `sqrehearsal01`–`sqrehearsal44` (no account, no PIN, no `auth.users` row; just claim holders; leave them). Each
    holds 2 squares, chosen at random: 92 claimed, open = 1, 39, 53, 54, 59, 64, 98, 99. So about 8% of moments will have
    no winner, which tests that path too.

### 3. Decisions (don't re-ask)
- Andrew, 2026-10-21: game = **KC @ SEA Sun Oct 25** (not December as the plan said; more slack before Jan 25).
  Push the 4 commits, Production `SQUARES_REHEARSAL_ENABLED`, and a `squares-rehearsal` Preview: "Yes, do all three".
- Fill most of the board with seeded players so every moment almost certainly has a winner (points, prize and Results
  get exercised), and leave 8 squares for Andrew.
- One prize paying all four moments, so the void + re-grade has a coupon to take back.

### 4. Files and how it was driven
No repo code changed in this phase. The driver is a tsx script that calls the real server code (no admin login),
counting balldontlie / supabase.co requests by wrapping `fetch`. It lives in the session scratchpad (gone after the
session), so it's copied in the appendix. Run from the repo root:
`SQUARES_REHEARSAL_ENABLED=true node --env-file=.env.local --conditions react-server --import tsx <script> <cmd> [json]`
(`prize` also needs `NEXT_PUBLIC_SQUARES_ENABLED=true` in front: `isSquaresPrizeOffered`). Commands used: `create`,
`prize`, `seed`, `overview`. For part 2: `overview`, `tick` (a session tick runs the same code as the cron;
prefer letting the cron drive), `admin '<json>'`.

### 5. Facts and traps found
- Claim guard at a REAL venue was not exercised live: the session's permission classifier refused a claim as a
  real player at a visible venue. The SQL proof (`npm run test:squares-sql`) covers `rehearsal_only`. Andrew can check
  it on the Preview: his God Mode account at a real venue opening `/squares` should get the rehearsal-only message.
- The cap holds: a third claim by `bktrehearsal1` answered `{"outcome":"cap_reached","myCells":[2,50]}`.
- Preview `GET /api/squares/score` → 200 with the event (`phase: "open"`). Production `/api/squares/score` → 404
  (public flag off), as intended. Preview `/squares` with signed cookies → 200.
- Requests measured during setup: create = 1 BDL + 4 DB; prize = 2 DB; seeding 92 claims = 186 DB (event read + RPC
  per claim).
- `vercel env rm` is denied to agents (CLAUDE.md), and `vercel env add` can't overwrite an existing value, so
  turning the switch off is Andrew's dashboard step. Ask him.
- If you push to `squares-rehearsal` before adding a branch-scoped env var, that build lacks it. Push an empty commit
  after adding the var.

### 6. Part 2 run sheet (all times Sun Oct 25 / Mon Oct 26)
1. Before 23:50Z: `overview`: `feedCheckedAt` refreshes hourly; kickoff unchanged.
2. 23:50Z–23:52Z: `drawnAt` set, `colDigits`/`rowDigits` each a permutation of 0–9; admin log has the draw.
3. From 00:20Z: `liveScore` updates each minute. At each quarter end: `moments[].graded` within ~2 min (6.5 rule,
   60 s hold). Check `squares_results` (4 rows per board, `credited_at` set, or none if the square was open),
   `seasonal_points_credits` (source squares, one per paid result), `users.points` +25/+25/+25/+50,
   `challenge_cycle_winners` for campaign `0289f9d9…` (one per paid moment, cycle key from
   `squaresPrizeCycleStart`), and the winner's coupon on the Preview's Redeem Prizes.
4. After the final: `completedAt` set; then the 3 h post-final watch, then idle (hourly settle at minute 0).
5. Results: as the owner on the Preview, Partner Dashboard → Results → the game card shows each moment's winner +
   prize. The API is `GET /api/owner/results?venueId=venue-hightop-test` (owner cookie needed).
6. TV: Preview `/api/venue-screen/state?venueId=venue-hightop-test` → `mode: "squares"` after the draw until kickoff
   + 7 h, with no user ids in it.
7. Void + re-grade (after the final, while the event is still current): pick a moment WITH a winner whose coupon is
   unused, e.g. `admin '{"action":"void_moment","moment":"q3","reason":"6.7 rehearsal void test"}'` (no scores, so it
   re-grades from the feed within minutes; with `colScore`+`rowScore` it re-grades at once). Expect: old credit
   reversed, `grade_no` 2 graded, corrected winner paid under key `board:q3:2`, old unused coupon withdrawn
   (`squares_withdraw_prize_coupons`) with a notice, `reopened_at` set. Same score = same winner, which is fine
   (the old one is reversed and repaid).
8. Requests vs §6: BDL ≈ 1 per cron minute from the draw to `completed_at`, then the post-final pace; count from the
   Vercel runtime logs for `/api/cron/pickem-settle` on Production (each tick report has `feedRequests`), or
   estimate from the timestamps and say which. §6 estimate: ~500 BDL for one evening.
9. After: set the prize inactive; ask Andrew to turn the Production switch off; leave the event un-archived until A8
   ("the next day the board still shows") is checked, then archive it (`admin '{"action":"archive","reason":"6.7 done"}'`)
   so nothing depends on 6.6.1's auto-archive on Feb 1.

### 7. Verified / not verified
- Verified: full `npm run test` 428 files / 5,244 passed / 13 skipped / 0 failed before the push; `npx tsc --noEmit`,
  `npm run lint`, `npm run build` clean. Production cron drives the event (stamp above). Event, prize, claims and
  cap read back from the database.
- Not verified: everything from the lock onwards (it hasn't happened yet); the real-venue claim guard live; the
  partner wizard on the Preview.

### 8. Open questions for Andrew
- None blocking. After the run: turn the Production switch off (or keep it on if another rehearsal is wanted).

### 9. First steps for part 2
Read this file, run `overview`, check 6.5 part 2's outcome, then follow the run sheet. Model: Opus 5.5 · high.

## Appendix — the driver script (`sq67.ts`)

```ts
const repo = "/Users/andrewserulneck/Documents/Trivia-Predictions";
const ACTOR = "claude-6.7";
const VENUE = "venue-hightop-test";
const GAME_ID = 1392321; // KC @ SEA, 2026-10-26T00:20Z
const OWNER = "64f046ff-a44f-47b4-acc1-94ff30288920";

const counts = { bdl: 0, supabase: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("balldontlie")) counts.bdl += 1;
  if (url.includes("supabase.co")) counts.supabase += 1;
  return realFetch(input, init);
}) as typeof fetch;

const main = async () => {
  const [cmd, arg] = process.argv.slice(2);
  const admin = await import(`${repo}/lib/squaresAdmin`);
  if (cmd === "create") {
    console.log(await admin.runSquaresAdminAction({ action: "create_from_game", gameId: GAME_ID }, ACTOR));
  } else if (cmd === "admin") {
    const parsed = admin.parseSquaresAdminAction(JSON.parse(arg));
    if ("error" in parsed) throw new Error(parsed.error);
    console.log(JSON.stringify(await admin.runSquaresAdminAction(parsed, ACTOR), null, 2));
  } else if (cmd === "overview") {
    console.log(JSON.stringify(await admin.getSquaresAdminOverview(), null, 2));
  } else if (cmd === "tick") {
    const { runSquaresTick } = await import(`${repo}/lib/squaresSettlement`);
    console.log(JSON.stringify(await runSquaresTick({ now: new Date() }), null, 2));
  } else if (cmd === "prize") {
    const { createReward } = await import(`${repo}/lib/rewards`);
    const reward = await createReward({
      venueId: VENUE, definitionId: "squares_challenge", winCondition: "game_winner",
      prize: { prizeKind: "gift_card", amount: 10 }, squaresMoments: ["q1", "half", "q3", "final"],
      minPlayers: null, createdByOwnerId: OWNER,
    } as Parameters<typeof createReward>[0]);
    console.log(JSON.stringify({ id: reward.id, createdAt: reward.createdAt }, null, 2));
  } else if (cmd === "seed") {
    // Inserts users sqrehearsal01–44 at VENUE (if missing), then 2 random claims each for them +
    // bktrehearsal1/2 through claimSquaresCell (lib/squaresBoard.ts). Already run; don't re-run.
  }
  console.log("requests:", counts);
};
main().catch((error) => { console.error(error); process.exit(1); });
```
