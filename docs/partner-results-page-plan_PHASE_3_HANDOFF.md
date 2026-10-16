# Partner Results page — Phase 3 handoff

Plan: `docs/partner-results-page-plan.md`. Phase 3 = full standings, "rewards won at this game", player breakdown
(server only).

## Summary for Andrew (plain English)

- **What changed:** the server can now answer the two questions the new Results screen will ask:
  1. **"Show me this game."** Every player who scored (not just the top 10), best first, plus any reward won at that
     game.
  2. **"Show me this player's game."** Each question they answered, round by round: right or wrong, the points, and
     the question itself (so a partner can find "the one about Elvis"). It **never** shows what the player typed.
- **Checked on real data (read-only):** for every game at Garden State Bar and General Saloon (14 games, 24 players),
  each player's question-by-question points add up **exactly** to their score in the standings, and no reply contains
  a player's internal id.
- **Speed:** the player lookup takes about 2 ms on the live database using an index that already exists, so **no
  database change is needed**.
- **Live?** No. Committed locally on `main`; not pushed or deployed. Nothing a partner sees has changed (no screen
  calls these addresses yet; the screen is Phase 4).
- **Left:** Phase 4 (the new one-page Results screen) and Phase 5 (cleanup).
- **Needs you (not blocking):** the Phase 2 question is still open — see "Open questions" below.

## For the next agent (Phase 4)

### 1. Goal and scope
Phase 4 (plan §7): the one-page Results UI in `components/owner/results/` (`ResultsSheet`, `ResultsGameCard`,
`ResultsRewardRow`, `GameStandingsScreen` with search, `PlayerBreakdownScreen`), replacing the tabs; steps `game` /
`player` / `reward` on sheet id `history`; component tests; a browser check from a scratchpad clone with mocked routes;
a device-checklist section. Plan names **Claude Sonnet 5.5, effort high**.
Out of scope: deleting the old Game Results sheet/routes (Phase 5), other competitions, any server change beyond a bug
fix.

### 2. Starting state
- Branch `main`. Phase 3 is one local commit on top of Phase 2 (`01c1809`); see `git log -3`. **Not pushed, not
  deployed.** No migrations, no data changes. Production was only read (`SELECT` / `EXPLAIN` inside a `READ ONLY`
  transaction).
- The working tree still holds **other people's uncommitted changes** (Category Blitz, schedule rows,
  `lib/gameOnboarding.ts`, `tests/game-tutorial-once-a-day.test.ts`, …). Never stage them: `git add <your files>` only.

### 3. Decisions already made (don't re-ask)
- Andrew's R1–R4 (plan §2). Sheet id stays `history`. Phase 2's placement and paging rules stand.
- **Breakdown rows = the questions the player answered**, as plan §1 says ("each question they answered"). Unanswered
  questions are not listed (a 14-round game has 210 questions; most players answer a few dozen), so `outcome: "none"`
  in `ResultsBreakdownRow` is never produced by Live Trivia today. Rows are ordered by round, then question.
- **Question text** is cut to 160 characters server-side (whitespace collapsed, `…`); the UI shows one line of it.
- **Tokens** (plan §5d, built as specified plus a domain prefix): `entry` = first 22 chars of base64url
  HMAC-SHA256(`SESSION_SECRET`, `"results-entry:v1|venueId|competitionId|gameKey|userId"`). The prefix keeps it apart
  from the `tp_sess` cookie's use of the same secret. The `gameKey` inside is the adapter's canonical key.
  A **deleted player** (no username) and a **0-point player** get no token; a game still being played lists nobody and
  its breakdown is a 404.
- **No new index**: measured on production (§6). Plan §5d's optional migration was not written.

### 4. Files created / changed
New:
- `lib/results/entryToken.ts` (`server-only`): `resultsEntryTokensEnabled`, `makeResultsEntryTokens(scope, userIds)`,
  `isResultsEntryToken`, `findResultsEntry(scope, candidates, entry)` (constant-time compare per candidate).
- `lib/results/pathParams.ts` (pure): `decodeResultsPathParam` — decodes an encoded path segment once; a broken escape
  becomes `""` (→ 404, never a 500).
- `app/api/owner/results/games/[competition]/[gameKey]/route.ts` → `getResultsGameScreen` →
  `{ ok, game, standings, rewards }`.
- `app/api/owner/results/games/[competition]/[gameKey]/breakdown/route.ts` (`?venueId&entry`) →
  `getResultsBreakdown` → `{ ok, rows, total }`.
- `tests/results-privacy-contract.test.ts` (17 tests; real adapter + tokens + reward source + ownerResults against a
  fake DB that returns WHOLE rows incl. `user_id` and the typed answer).
- `scripts/check-results-breakdown.cjs` (`npm run results:check-breakdown -- <venueId> …`) and
  `scripts/explain-results-breakdown.sql` (`npm run results:explain-breakdown`). Both read-only.
Changed:
- `lib/results/adapters/liveTrivia.ts`: `venueGame` (venue-scoped key → schedule, else 404), `gameTotals`;
  `getStandings` now ranks with `rankScorers`, loads names only for the listed rows and adds tokens; new
  `getBreakdown`.
- `lib/results/ownerResults.ts`: `getResultsGameScreen` and `getResultsBreakdown` (generic; never name a competition).
- `lib/results/types.ts`: `ResultsGameScreen` (= detail + `rewards`); `getBreakdown` now takes `nowMs`.
- `lib/results/playerNames.ts`: `loadUsernames` reads in chunks of `USERNAME_CHUNK` = 100 ids (parallel).
- `lib/ownerHistoryDisplay.ts`: new generic `rankScorers<T>` (same order and cut as before, keeps the input row);
  `rankGameStandings` is now a map over it (output unchanged).
- Tests: `tests/api.owner.results.test.ts` (+ both routes, + path decoding), `tests/lib.results-sources.test.ts`
  (+ 250-scorer chunking), `tests/results-registry-contract.test.ts` (breakdown check tightened to
  `Boolean(adapter.getBreakdown) === hasBreakdown`; the "never names a competition id" scan now also covers
  `entryToken.ts`, `pathParams.ts` and every file under `app/api/owner/results/`).
- `package.json`: the two scripts above.

**API for Phase 4** (all `GET`, all need `venueId` the partner controls; all `Cache-Control: no-store`):
- `/api/owner/results?venueId&before` → `{ ok, games, rewards, nextBefore, firstGameDate? }` (Phase 2).
- `/api/owner/results/games/${competitionId}/${encodeURIComponent(gameKey)}?venueId` →
  `{ ok, game: ResultsGameRow, standings: ResultsStanding[], rewards: ResultsRewardItem[] }`. `rewards` = only items
  with `attach.kind === "game"` for this game, i.e. exactly what the timeline put on this card. Empty while playing.
- `…/breakdown?venueId&entry=<standing.entry>` → `{ ok, rows: ResultsBreakdownRow[], total }`. 404 for a bad / other
  game's token; 503 when the server has no `SESSION_SECRET` (then every `entry` is null too, so the UI must render a
  standings row with `entry: null` as not tappable — that also covers "Deleted player").
- Reward detail: unchanged `GET /api/owner/history/rewards/[rewardId]`.

### 5. Facts and traps
- `live_showdown_answers.question_id` is a FK to `trivia_questions.slug`; slugs run **up to 192 chars** (avg question
  105 chars, max 299). An `in()` over a player's slugs would pass the URL limit, so the question text is **embedded**
  (`question:trivia_questions(question)`), one read. Verified on production (no blank question text).
- The totals RPC sums **every** answer row of the (schedule, date) per user, and the breakdown reads the same rows,
  so the totals agree by construction; a mismatch logs `[Results] breakdown-total-mismatch` (never seen).
- Live Trivia points today: right = 10, wrong = 0 (all 599 production rows).
- `supabase db query --linked` runs SQL on production through the Management API. `CREATE TEMP VIEW` is refused in a
  `READ ONLY` transaction; the EXPLAIN script uses scalar subqueries instead. Output contains plans only.
- `tests/lib.sportsBingo.nfl-star-tilt.test.ts` failed once in the full run under load and passes alone (12/12); it is
  unrelated to this work.
- Run TS scripts that import `@/lib/...` with `node --env-file=.env.local --conditions react-server --import tsx`.
  For `results:check-breakdown`, pass any throwaway `SESSION_SECRET=` on the command line (an environment value wins
  over `.env.local`; tokens only round-trip inside the process). Never print env values.

### 6. Build / test
`npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` **4,755 passed, 13 skipped, 1 failed** (the unrelated
Sports Bingo star-tilt test above, which passes alone); `npm run build` succeeded and lists
`/api/owner/results/games/[competition]/[gameKey]` and `…/breakdown`. Typecheck and build were run one after the other.
Production (read-only, 2026-10-16):
- `SESSION_SECRET=throwaway npm run results:check-breakdown -- venue-garden-state-bar venue-riverside`: 14 games, 24
  tappable players, every breakdown total = standings score, no UUID other than the game's own schedule id in any
  response. No reward is attached to a game card yet (production has only weekly rewards → week rows).
- `npm run results:explain-breakdown`: Index Scan on `live_showdown_answers_occurrence_unique` with
  `schedule_id`, `occurrence_date` **and** `user_id` as index conditions + one `idx_trivia_questions_slug` lookup per
  answer; 1.9 ms execution. Same plan with sequential scans disabled.
**Cost as built (on demand only):** game screen ≈ schedules + totals RPC + usernames (1 per 100 scorers) + venue tz
(cached) + one games page per competition for that day (schedules + summary RPC + winners' names) + ledger +
settlements (+ campaigns + names when rows exist): ~9–11 small reads, more than plan §6's estimate because the rewards
are placed with the same rules as the timeline. Breakdown = schedules + totals RPC + one answers read (3 reads).
**Not verified:** the routes through a real partner session (no UI calls them yet; same `withOwnerVenue` gate as the
other routes, covered by `tests/api.owner.results.test.ts`).

### 7. Open questions for Andrew
1. (From Phase 2, still open.) Single-night weekly rewards (General Saloon "Saturday" / "Sunday Challenge"): keep them
   as a row at the end of the week (current, per plan), or put them on that night's game card when the night has
   exactly one game? A one-rule change in `placeCycle` (`lib/results/rewardPlacement.ts`). Note: most of those wins came
   from nights with no Live Trivia game, so they'd mostly stay rows either way.

### 8. Recommended first steps for Phase 4
Read plan §4/§5f and this note; read `components/owner/history/GameResultsSheet.tsx` (today's sheet, steps and
`nav.correctStep()`), `lib/useOwnerSheet.ts`, `HistorySheetHost` in `app/owner/dashboard/page.tsx`, and
`groupGameHistory` in `lib/ownerHistoryDisplay.ts` (to generalise to `ResultsGameRow`). Build against the three routes
above with mocked fetches. Labels/units only from `lib/results/competitions.ts`; no competition id in any component
(the registry contract test scans `components/owner/results/`). Sonnet 5.5, effort high.
