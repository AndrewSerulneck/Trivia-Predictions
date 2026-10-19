# Squares + Brackets — Phase 7 handoff (March Madness bracket engine)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 7; as-built summary §14).
**Next:** Phase 8, bracket player screens (Sonnet 5.5 · high). Also open: finish 6.5 after the Oct 19 + Oct 22 NFL
games (`docs/squares-and-brackets-plan_PHASE_6.5_HANDOFF.md`), and 6.6's re-review (it can cover Phase 7 too).

## For Andrew (plain English)
- **What changed:** the behind-the-scenes engine for March Madness brackets. It finds both tournaments in the sports
  feed on Selection Sunday and opens the brackets. It locks them at the first tip-off (men's and women's separately)
  and opens the second-chance bracket when the Round of 32 ends. It scores every bracket as each game finishes and
  pays venue points at the end of each round. You also get an admin page ("Brackets", under Prizes & Events) to fix
  things: region names, an opening-round game the feed doesn't place, a wrong result, a lock time, and a
  "rehearsal" that replays last March on the hidden test venue. Players can't see any of it yet: Phase 8 builds
  their screens.
- **Live?** No. Nothing is committed, pushed or deployed. The new database tables are **not created yet**. The game's
  switch is off, so the website and the every-minute job do nothing with brackets.
- **Needs you:**
  1. Say whether to commit this work.
  2. Run `supabase db push` when you're ready (any time before Phase 8 testing, and before March 8 at the latest).
     It creates the bracket tables. It changes nothing that already exists.
- **Cost:** nothing until March 14, 2027 (and nothing at all while the switch is off). During the tournament, replaying
  both of last year's tournaments used **6,411 sports-feed requests in total**, inside the 6–8k estimate and the
  plan you already pay for. That's one tiny database read a minute while the window is open, plus a few calls each
  time a game finishes. No new subscriptions, no new scheduled jobs.
- **Two choices I made that you may want to change:**
  1. **Venue points arrive at the end of each round** (for example, Friday night for the Round of 64), not after each
     game. Bracket *scores* still update game by game.
  2. **A half-filled bracket still counts** for what it has. Phase 8's screen will push people to finish.

## For the next agent

### 1. Next phase goal and scope
Phase 8 (plan §4 "Phase 8"): route `/bracket`, the tournament switcher (Men's / Women's × Main / Second chance,
showing only open or graded ones), filling a bracket one region at a time on a phone, the Final Four, the
tiebreaker, then Save, with drafts saved each step. Also: the read-only view after lock with right/wrong marks and
"still alive", venue standings with "Find a player", and "Copy my picks from <Venue>". Same native / back-handler /
text-floor / statement-layout rules as Phase 3. The pre-open teaser state (Phase 1: the card shows from Mar 1 and
links to `/bracket`).
**Phase 8 builds screens only, on the API below.** Don't change the rules: they live in `lib/brackets/` and in SQL.
**Out of scope:** Prizes / Results / TV (Phase 9), flag on (Phase 10).

### 2. Starting state
- Branch `main`, last commit `c43fa66` (Squares 6.4). **Nothing from Phase 7 is committed** (nor 6.5's interim
  handoff + plan status edits). Andrew's own unrelated uncommitted edits are still in the tree: `CLAUDE.md` (his POS
  hunk; I only appended one bullet at the very end), `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`. Don't commit, revert or `git checkout` those.
  Stage only the paths in §4 when Andrew says so.
- **Migration `supabase/migrations/20261019203858_brackets_engine.sql` is NOT applied** to linked project
  `pkmxupsayzshvpirkaav`. Until it is: the admin Brackets panel returns 500 (tables missing), and every player route
  404s anyway (flag off). The cron gate is pure and does zero I/O while the flag is off and the rehearsal switch is
  unset, so production is unaffected.
- No database writes, deploys or env changes. `NEXT_PUBLIC_BRACKETS_ENABLED` and `BRACKETS_REHEARSAL_ENABLED` are
  absent from Vercel (= off).
- **Unrelated background processes (6.5):** PID 10301 / 10302 record two NFL games
  (`scripts/capture-nfl-live-game.cjs`). Leave them running.

### 3. Decisions already made (don't re-ask)
Andrew's decisions are plan §1 (1–15). Decided in Phase 7 (by me, within the plan's remit):
- **Picks are seats** (see `lib/brackets/tree.ts` header). A valid bracket = every later pick equals one of its two
  feeding picks (main) or one of the two actual Round-of-32 winners (second chance's Sweet 16). Opening-round seats
  need no special case: picking the seat = picking whoever wins that opener (ESPN's convention, plan §3).
- **Tables differ from the §4 proposal:** one `bracket_tournaments` row per real tournament (gender, season,
  purpose). The four brackets are 2 tournaments × `bracket_entries.kind` (`main` | `second`), so one feed read
  serves both kinds. `bracket_rounds` holds the per-round `grade_no` and paid marker.
- **Venue points per entry per round,** when the whole round is decided. Key `${entryId}:r${round}:${gradeNo}` =
  `bracketCreditKey`, points = correct × round points ÷ 10 (`bracketRoundVenuePoints`). This follows the Phase 1
  row-count note. Scores (bracket points) update per game.
- **Corrections are never automatic.** Once a slot has a winner, a feed record that disagrees only writes
  `bracket_games.mismatch_note` and logs `feed_mismatch`. An admin uses `override_result`. Same stance as Squares
  and Bingo.
- **An admin correction in a complete round spends the old key for EVERY entry that scores that round:** reversed if
  paid, burned if not. Burning only the paid ones would let a payment that is running at that moment pay an entry
  that had 0 correct before the correction under the old key AND the new one. The cost is ≤ 1 burned ledger row per
  entry per corrected round, and corrections are rare.
- **Partial brackets are scored and paid for what they have** (no "complete or nothing" rule). Standings list
  entries with ≥ 1 pick. Ranking: score, then |tiebreaker − championship total| once the final is known (a missing
  tiebreaker sorts last), then earliest `submitted_at` (= last save).
- **Rehearsals built in now** (lessons of Squares §13 F4/F5): `purpose = 'rehearsal'` takes entries only at hidden
  venues (`bracket_save_entry` → `rehearsal_only`), and a `clock_offset_seconds` replay clock (the tournament's
  now = real now − offset). The sync masks the feed to that moment (`maskBracketFeedAt`: not tipped = scheduled;
  tipped < 150 min = in progress; later-round teams and filled opener seats hidden until decided).
  `BRACKETS_REHEARSAL_ENABLED` (server-only, one reader `isBracketsRehearsalEnabled()`) drives rehearsals **on its
  own**, so Production's cron can run a replay with the public flag off. Discovery never runs in rehearsal mode.
- **Discovery** (live mode only): every 10 cron minutes, for a gender with no current live tournament this season,
  and only if that tournament was never created before (archived counts). So an archived tournament is never
  re-created (Squares §13 F4).
- **Locks:** auto = earliest Round-of-64 tip (main) and earliest Sweet 16 tip (second). The sync follows the feed
  until the lock passes, then never moves it. An admin may move a lock only before that bracket's first game tips
  (`kindHasStarted`). `null` = back to following the feed.
- **Archive:** a live tournament can't be archived from Mar 1 (teaser) through the window unless it is complete.
  Players' screens read it.
- **Player API built now** (engine, not UI, like Squares Phase 2).

### 4. Files created or changed
New:
- `lib/brackets/tree.ts`: slot/seat math, kinds, genders, `slotsOfKind`, `childSlots`, `parentOf`,
  `seatRangeOfSlot`, `regionOfSlot`, `emptyPicks`.
- `lib/brackets/picks.ts`: `choosableSeats`, `bracketPicksProblem`, `setBracketPick` (clears the later picks that had
  advanced the replaced team), `bracketPickCount`, `isBracketComplete`, `copyableBracketPicks`,
  `BRACKET_TIEBREAKER_MAX` (400).
- `lib/brackets/scoring.ts`: `bracketRoundCorrect`, `bracketScore`, `bracketMaxScore`, `isSeatAlive`,
  `bracketMaxPossible`, `isBracketRoundComplete`, `kindScoresRound`, `bracketCreditKey`, `bracketRoundVenuePoints`,
  `rankBracketEntries`.
- `lib/brackets/games.ts`: feed + stored shapes, `teamFromFeed`, `feedWinnerSide` (final AND the winner has more
  points), `maskBracketFeedAt` (replay), `mergeBracketFeed` (keeps admin teams/links, never flips a decided result),
  `linkOpeners` (by team id, else by elimination), `bracketWinnerSeats`, `championshipTotal`, `autoBracketLocks`,
  `hasFullField`, `isSweetSixteenSet`, `bracketKindPhase` (`not_open` | `open` | `locked` | `complete`),
  `nextBracketSyncAt`, `roundsChangedBetween`.
- `supabase/migrations/20261019203858_brackets_engine.sql`: helpers (`bracket_slot_round`, `bracket_picks_problem`,
  `bracket_round_correct`, `bracket_score_of`, `bracket_region_names_valid`), the five tables (RLS forced,
  service_role grants only), a trigger creating 6 `bracket_rounds` rows per tournament, and the RPCs
  `bracket_save_entry` and `bracket_record_results` (service_role execute only).
- `lib/bracketsStore.ts` (server-only): row mapping, reads, `saveBracketGames` (one upsert), `recordBracketResults`
  (ONLY caller of the results RPC), `logBracketsAdmin`, `tournamentNowMs`.
- `lib/bracketsFeed.ts` (server-only): `fetchBracketFeed(gender, season)`, one request (`per_page=100`).
- `lib/bracketsSync.ts` (server-only): `bracketsSyncMode` / `isBracketsSyncActive` (pure gate),
  `bracketsFeedSeason()` (= 2026), `syncBracketTournament` (also `dryRun`), `payCompleteBracketRounds` (ONLY payer;
  keyset pages of 1,000 entries; marks a round paid only at an unchanged `grade_no`), `runBracketsTick`.
- `lib/bracketsEntries.ts` (server-only): `getBracketsView`, `saveBracketEntry` (ONLY caller of the save RPC),
  `copyBracketEntry`, `getBracketStandings`, `parseBracketPicks`, `parseBracketTiebreaker`, `BRACKET_SAVE_STATUS`.
- `lib/bracketsAdmin.ts` (server-only): `parseBracketsAdminAction`, `getBracketsAdminOverview`,
  `runBracketsAdminAction`, `bracketProblems`, `kindHasStarted`.
- Routes: `app/api/bracket/{state,entry,copy,standings}/route.ts`, `app/api/admin/brackets/route.ts`.
- `components/admin/sections/BracketsSection.tsx`: the admin panel.
- `scripts/test-brackets-sql.cjs` + npm `test:brackets-sql`: PGlite proof.
- Tests: `tests/brackets-engine.test.ts` (26: tree, both 2026 fixtures, pick rules, scoring, merge, pace),
  `tests/brackets-sync.test.ts` (4: minute-by-minute 2027 replay through `runBracketsTick` against an in-memory DB),
  `tests/brackets-contract.test.ts` (19: one writer each, SQL mirrors, gate, 404s, privacy, admin parsing).

Changed: `app/api/cron/pickem-settle/route.ts` (bracket tick after Squares, behind the pure gate; `brackets` in the
JSON). `lib/seasonalGames.ts` (`isBracketsRehearsalEnabled`). Admin registration: `adminSectionMeta.ts`
(`"brackets"`, Prizes & Events, migrated, not mobile), `adminSectionComponents.tsx`, `AdminShell.tsx`.
`package.json` (script). `CLAUDE.md` (one bullet at the end). Plan: status line, Phase 7 "Built" line, new §14.

### 5. API for Phase 8 (all 404 while `NEXT_PUBLIC_BRACKETS_ENABLED` is off; `userId` bound to the signed session)
- `GET /api/bracket/state?venueId=&userId=` → `{ ok, tournaments: BracketTournamentView[] }`
  (`lib/bracketsEntries.ts`). Each view has `id, gender, season (feed season; display season + 1), rehearsal,
  regionNames[4] (null = "Region n"), winnerSeats[63], championshipTotal, games[]` (round 0–6, location, slot, tipAt,
  status, home/away `{name, abbreviation, seed}` or null, scores, winnerSide, `feedsSeat` for openers) and
  `kinds.main` / `kinds.second` = `{ phase, lockAt, mine, copyFrom[] }`. `mine` = `{picks[63], tiebreaker, pickCount,
  score, maxPossible, savedAt}`.
- `POST /api/bracket/entry { venueId, userId, tournamentId, kind, picks[63], tiebreaker }` → 200 `saved`; 409
  `not_open` / `locked`; 400 `invalid_picks` (with `problem`) / `invalid_tiebreaker`; 403 `wrong_venue` /
  `rehearsal_only` / `user_not_found`; 404 `no_tournament`; 503 unavailable.
- `POST /api/bracket/copy { venueId, userId, tournamentId, kind, fromVenueId }` → same as save, plus 404 `no_source`
  and 409 `source_invalid`.
- `GET /api/bracket/standings?venueId=&tournamentId=&kind=&userId=` → `{ standings: [{rank, username, score,
  maxPossible, pickCount, mine}], championshipTotal }`. Usernames only. Never another player's picks.
- Building a seat's label: seat `s` is round-1 slot `floor(s/2)`, `home` if even. Its team is that game's
  home/away team. If null, find the opener with `feedsSeat === s` and show "A / B". Use `choosableSeats` /
  `setBracketPick` for every tap, and `isSeatAlive` / `bracketMaxPossible` for the after-lock view. Region `i` =
  round-1 locations `8i+1 … 8i+8` (`regionOfSlot`).

### 6. Facts and traps
- **Arg order differs:** TS `bracketRoundCorrect(picks, winnerSeats, kind)` vs SQL
  `bracket_round_correct(picks, kind, winner_seats)`. I got this wrong once in a test fake.
- Feed: `/bracket` pages at 25 without `per_page`; `season` = the year the season started; a loser's `winner` is null;
  `seed` is a string. The 2027 field has 12 opening-round games per tournament, and how an unplayed opener shows in
  round 1 is unknown until Selection Sunday. The engine accepts a missing team. The admin panel lists "Round-of-64
  seats with no team" and unlinked openers under **problems**, with Link / Set team controls.
- `mergeBracketFeed` keeps a stored team when the feed's is missing, so moving a rehearsal clock BACKWARDS doesn't
  hide teams or undo results (the admin message says so). Move it forwards.
- The sync fills only undecided slots. If the stored winners and the games disagree (an override whose results RPC
  failed after the game row was written), the sync leaves them and reports `needsAdmin` +
  `[Brackets] results-need-admin`. Re-applying the override fixes it.
- PostgREST timestamps come back `+00:00`; compare with `Date.parse` (`sameInstant` in the sync), never strings.
- `npm run test` has one flaky test unrelated to this work: `tests/lib.sportsBingo.nfl-star-tilt.test.ts`
  ("star share > 0.3" on random sampling). It failed once at 0.296 and passed 3/3 on re-run.
- The `.next/types/routes.d 2.ts` "Duplicate identifier" tsc line is an iCloud duplicate file inside `.next/`, not
  code. Ignore it, or delete that one generated file.
- Andrew's `next dev` may be running. `npm run build` in place was fine. Don't run typecheck and build at the same
  time.

### 7. Build / run / test (all run 2026-10-19, all green)
- `npx tsc --noEmit`: clean (apart from the iCloud duplicate above). `npm run lint`: clean.
- `npm run test`: 421 files, **5,094 pass / 13 skipped (environment-gated) / 0 fail** (one earlier run hit the flaky
  Bingo test above). Then the three bracket test files again after the last edit: 49/49.
- `npm run test:brackets-sql`, `npm run test:squares-sql`, `npm run test:seasonal-points-sql`: pass.
- `npm run build`: passes, 213 pages; the five new routes are listed.
- **Not verified:** the migration on the real database (not applied); the admin panel in a browser; the real 2027
  feed (empty until Selection Sunday); concurrency under real load (PGlite is one connection — the guarantees rest on
  `FOR SHARE` / `FOR UPDATE` on the tournament row and the ledger's unique key).
- **Cost (measured in `tests/brackets-sync.test.ts`):** both tournaments = 6,411 feed requests (plan §6: 6–8k). DB:
  one small tournaments read per cron minute in the window (≈ 1,440/day, ≈ 34k over 24 days), zero outside. Per
  feed read: 1 games read, ≤ 1 upsert, ≤ 1 results RPC, ≤ 1 rounds read, 1 tournament update. Paying a round at
  20k entries: ≈ 20 entry pages + 40 credit calls, once.

### 8. Open questions for Andrew
- Commit Phase 7 (and the 6.5 interim docs)?
- Apply migration `20261019203858` (`supabase db push`).
- The two judgment calls in the summary: points at the end of each round, and partial brackets count.

### 9. Recommended first steps for Phase 8
1. Read plan §3 (Brackets), §14, and this handoff's §5. Read `lib/brackets/*.ts` headers.
2. Test the UI against mocked routes in a scratchpad clone, or after the migration with a **rehearsal** tournament at
   hidden venue `venue-hightop-test`. Admin → Brackets → Create: men's, feed season 2025, Rehearsal, replay time
   2026-03-15 12:00 ET; with `BRACKETS_REHEARSAL_ENABLED` on wherever the cron runs. Never test against the shared
   production DB at a real venue.
3. Build `/bracket` on `GET /api/bracket/state` (one call per open; no polling), with saves via
   `POST /api/bracket/entry` on each step.
Model: Sonnet 5.5, effort high (plan §4).
