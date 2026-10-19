# Squares + Brackets — Phase 0 handoff (data spike)

**Date:** 2026-10-19 (Mon, ~00:45 ET). **Plan:** `docs/squares-and-brackets-plan.md`. **Next:** Phase 1 (shared
foundation), Opus 5.5 · high.

## For Andrew (plain English)

- **What changed:** nothing in the live app. I saved real copies of the data feeds (last season's Super Bowl and both
  2026 March Madness brackets) so later phases can be tested against them, wrote a test that proves how the bracket
  feed fits together, and put your seven answers into the plan.
- **One thing still running:** a small script is watching tonight's Monday Night Football game (Commanders at 49ers,
  8:15 PM ET) once a minute, and Thursday night's game (Patriots at Bears) the same way, to learn how the feed reports
  quarter breaks. It needs your Mac **awake and online** during those games. About 250 requests per game on the
  data plan you already pay for. Nothing else is needed from you.
- **Two surprises:** (1) Both 2027 tournaments grow to **76 teams**, so there are 12 opening-round games, not 4.
  Bracket filling still has 63 picks, but up to 12 first-round spots show "Team A / Team B" on Selection Sunday.
  (2) The women's bracket locks a day later than the men's (first tip Fri Mar 19 vs Thu Mar 18).
- **Not live, nothing committed or pushed.** Nothing needs you.

---

## For the next agent

### 1. Next phase goal and scope
Phase 1 — shared foundation (plan §4 "Phase 1"): `lib/seasonalGames.ts` (card windows as plain dates + the two
flag readers), game keys/cards/order for `squares` and `bracket`, the bracket teaser card from Mar 1 (decision 12),
`lib/seasonalPoints.ts` + migration with `credit_seasonal_points` and its unique `(source, source_key)` ledger,
account-deletion handling, grants, `ChallengeGameType` values, legal rules copy.
**Out of scope:** any Squares/Brackets tables, RPCs, screens, cron hooks (Phases 2+). Don't run `supabase db push`
(Andrew's call).

### 2. Starting state
- Branch `main`, last commit `b5c1778`. **Nothing from Phase 0 is committed.** The working tree also has Andrew's
  own unrelated uncommitted edits (`CLAUDE.md`, `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`) — don't commit, revert or `git checkout` those.
  The plan file itself (`docs/squares-and-brackets-plan.md`) was untracked before Phase 0 and still is.
- No database writes, no migrations, no deploys, no env changes.
- **Background processes (detached with `nohup`, survive this session):**
  - PID 71943: `scripts/capture-nfl-live-game.cjs 1392308` (WSH @ SF, kickoff 2026-10-20T00:15Z). Starts polling at
    00:05Z, stops 10 polls after `status_state = final` or after 7 h. Writes
    `tests/fixtures/squares/nfl-live-capture-1392308.json`; log `.scratch/nfl-live-capture-1392308.log`.
  - PID 71944: same for `1392309` (NE @ CHI, kickoff 2026-10-23T00:15Z).
  - If the Mac slept or the file is missing/short, re-run against any upcoming game (ids from
    `/nfl/v1/games?seasons[]=2026`), e.g. Sunday Oct 25 1 PM ET games 1392311–1392317.

### 3. Decisions already made (don't re-ask)
All in plan §1. Andrew's 2026-10-19 answers are decisions 9–15: real names for now (keep names in one copy file);
Prizes for free games are legal everywhere they operate; Squares 25/25/25/50, Brackets ÷10; windows Squares
Feb 1–15 and Brackets Mar 14–Apr 6 with a teaser from Mar 1; **2 squares per player**; **empty winning square =
nobody wins**; **every square's owner is visible to everyone** (players and partners).
Decided in Phase 0 (by me, per the plan's remit):
- **Region names = admin entry on Selection Sunday**, fallback "Region 1–4". Not derived from round-4 site: women's
  regionals put two regions in one city (2026: Fort Worth ×2, Sacramento ×2).
- **Final Four pairings come from the tree itself** (no admin input).
- **Squares axes by `conference`** (AFC columns, NFC rows), never home/away.

### 4. Files created / changed
- `scripts/capture-squares-brackets-fixtures.cjs` — one-off read-only fetcher (140 requests). Re-run with
  `node --env-file=.env.local scripts/capture-squares-brackets-fixtures.cjs`; overwrites the fixtures below.
- `scripts/capture-nfl-live-game.cjs <gameId>` — live poller described in §2. Stores deduped records
  (`snapshots[]` with `firstSeen`, `lastSeen`, `polls`, `game`) plus `errors[]`.
- `tests/fixtures/squares/nfl-postseason-2025.json` — all 13 games of the 2025 postseason (Super Bowl LX = `week 5`,
  id 1341307, SEA 29 – NE 13; includes two OT games, ids in file).
- `tests/fixtures/squares/nfl-postseason-2026-preseason-snapshot.json` — `[]` (2026 postseason rows don't exist yet).
- `tests/fixtures/brackets/{ncaab,ncaaw}-bracket-season-2025.json` — the full 67-game 2026 tournaments.
- `tests/fixtures/brackets/{ncaab,ncaaw}-games-season-2025.json` — `/games/{id}` for each of those 67 ids (half
  scores `home_score_h1/h2`, `period`, `period_detail`).
- `tests/fixtures/brackets/{ncaab,ncaaw}-bracket-season-2026-preseason-snapshot.json` — `[]` today.
- `tests/brackets-feed-fixture.test.ts` — 14 assertions pinning the facts in §5. Runs under `npm run test`.
- `docs/squares-and-brackets-plan.md` — status line, Andrew's answers (§1 #9–15), 2027 dates table, rule edits
  (cap 2, nobody-wins, axes by conference, per-gender lock, 12 openers), §7 closed, new §8 findings.

### 5. Facts and traps
- **Bracket tree:** round r location k ← round r-1 locations 2k-1 (always the **home** team) and 2k (**away**), for
  rounds 2–6, both tournaments, 0 mismatches. Regions = round-1 locations 1–8/9–16/17–24/25–32, each in seed order
  1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15. A 63-slot tree is just `(round, location)`; no lookup table needed.
- **Opening round = `round: 0`**, locations 1–4 in 2026 (will be 1–12 in 2027 — assume nothing about the count).
  Winners land in the **away** slot of a round-1 game; which one is not derivable from the location (men's 1→21,
  2→29, 3→25, 4→9). Match by team id. Pre-game representation in round 1 still unknown → engine must accept an
  empty/placeholder team and Phase 7 needs the admin fix-up.
- **`/bracket` paginates at 25** — send `per_page=100`. **`/games` ignores `game_ids[]`/`ids[]`** (returns
  everything) — use `/games/{id}`. Bracket `game_id` == `/games` id.
- Loser `winner` is `null`, not `false`. `seed` is a **string**. Status strings: `Final`, `Final/OT`, `Final/2OT`
  (`status_state: final`, `status: post`).
- `season=2025` = the 2026 tournament; the 2027 tournament is `season=2026` (empty today).
- Opening round finished before the first round-1 tip in both 2026 tournaments; the women's last opener was only ~14 h
  before. Lock times per tournament (2026): men's first R64 2026-03-19T16:15Z, women's 2026-03-20T15:30Z; Sweet 16
  first tip men's 2026-03-26T23:10Z, women's 2026-03-27T18:30Z.
- **NFL:** scoreless quarter = `null` in the finished 2025 postseason records but `0` in a fresh 2026 final
  (id 1392307). Treat both as 0 **only after** the game is past that quarter. Quarters + OT sum to the final in all 13
  postseason games. Fields include `status_state` (`scheduled`, `final` seen; live values pending the capture),
  `status` (display text, e.g. "10/19 - 8:15 PM EDT"), `updated_at`, team `conference`. `/nfl/v1/games/{id}` works.
- Super Bowl home team was the AFC (NE) in Feb 2026; it alternates — never use home/away for axes.
- 2027 dates (NCAA.com + Super Bowl LXI pages, checked 2026-10-19): Super Bowl Feb 14 (SoFi). Selection Sunday Mar 14.
  Men's: openers Mar 16–17 (Dayton + a TBA second site), R64 Mar 18–19, R32 Mar 20–21, S16 Mar 25–26, E8 Mar 27–28,
  FF Apr 3, final Apr 5 (Detroit). Women's: openers Mar 17–18, R64 Mar 19–20, FF Apr 2, final Apr 4 (Columbus).
  NFL feed: 2026 regular season ends Jan 10, 2027 (week 18).
- Tooling: `.env.local` can't be read (hook); load it only via `node --env-file=.env.local`. A command starting with
  `cut … .env.local` was denied this session — don't need it.

### 6. Build / run / test
- `npx vitest run tests/brackets-feed-fixture.test.ts` → 14 pass (verified). ESLint on the three new files: clean.
  `tsc` reported nothing for the new test (full-repo typecheck/build not run — no app code changed).
- Unverified: the live capture (pending tonight/Thursday).

### 7. Open questions for Andrew
None.

### 8. Recommended first steps
1. Check `tests/fixtures/squares/nfl-live-capture-1392308.json` exists and has `status_state` values across the
   game (and `errors` is short). Write down in plan §8: the `status_state`/`status` strings at each quarter break,
   when `q1..q4` turn from `null` to numbers, and whether a scoreless live quarter shows `0` or `null`. That fixes
   Phase 2's quarter-confirmation rule; Phase 1 doesn't depend on it.
2. Decide whether to commit Phase 0 (fixtures + scripts + test + plan docs) — ask Andrew before committing, and stage
   only these paths.
3. Start Phase 1 by reading `lib/venueGameCards.ts`, `components/venue/VenueHubClient.tsx`
   (`VENUE_HUB_GAME_ORDER`), the `claim_pickem_points` migration, `delete_player_account` (latest migration that
   replaces it) and `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`.
Model: Opus 5.5, effort high (plan §4).
