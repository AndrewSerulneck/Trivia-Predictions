# Partner Dashboard "Results" page — plan

**Status (2026-10-16):** Phases 1–5 done and committed locally, not pushed (latest handoff:
`docs/partner-results-page-plan_PHASE_5_HANDOFF.md`). Phase 5 (cleanup) is its own commit and must be pushed
only AFTER Phase 4 is live. Next: Andrew's phone pass + deploy, then the usage comparison (§6).
Each phase ends with a handoff note `docs/partner-results-page-plan_PHASE_<N>_HANDOFF.md` (global CLAUDE.md
rule); update this line to point at the latest one.

## 1. Plain-English summary (for Andrew)

Today the Partner Dashboard's **Game Results** sheet says "Game Results" twice and splits into two tabs, **Live
Trivia games** and **Rewards**. This plan turns it into one page called **Results**: a single timeline of the
venue's games, newest first, where each game shows who won it and any reward won that night. Weekly rewards show
at the end of their week. Tapping a game shows the **full** standings (not just the top 10) with a search box.
Tapping a player shows each question they answered, whether they got it right, and the points it earned, so a
partner can settle "I scored more than that" on the spot.

It is built so that adding another competition later (NFL Pick 'Em, Category Blitz, Bingo…) is **one registry
entry plus one adapter file**. The timeline, standings screen, search, player breakdown and reward matching are
shared, so a new competition gets all of them without new screens.

## 2. Andrew's decisions (2026-10-16 — do not re-ask)

| # | Question | Answer |
|---|----------|--------|
| R1 | Dispute detail on a game | **Full standings + username search + per-player breakdown**: each question shows right/wrong and points. **Never the player's typed answer.** |
| R2 | Competitions in this plan | **Live Trivia only for now**, but adding more must be "as easy and smooth as possible". That means a registry + adapter seam, proven by a test fixture adapter (§5c). |
| R3 | Layout | **One timeline** (Month → Week → Day, as today). Each game card shows the winner and the rewards won at that game. Weekly rewards appear as a row at the end of their week. **No tabs, no filter chips.** |
| R4 | Name | **"Results"** for the menu row and the sheet title. |

Earlier decisions still in force (from `docs/live-trivia-weekly-places-reward-plan.md`): read-only (no editing or
re-awarding from this screen), no CSV export, partners see **usernames and points only**, and **never a player id**.
D12 ("no Category Blitz in Game Results") still stands. R2 only makes it cheap to change later.

## 3. Where things stand today (verified 2026-10-16)

- Live on `origin/main` (commits `615758a`, `e4e4cce`, `6012e2e`). Migration `20261014213000_owner_past_winners_summaries.sql`
  is applied.
- UI: `components/owner/history/GameResultsSheet.tsx`, a dark `OwnerSheet` at `?sheet=history[&step=game|reward]`,
  hosted by `HistorySheetHost` in `app/owner/dashboard/page.tsx`. The menu row is in
  `components/owner/menu/ownerMenuItems.ts` (`id: "history"`, label "Game Results", hint "Games & rewards history").
- **Duplicate title:** `OwnerSheet title="Game Results"` *and* `<StepHeading hint={venue.name}>Game results</StepHeading>`
  in `renderList()`.
- Server: `lib/ownerHistory.ts` (`listOwnerGameHistory`, `getOwnerGameDetail`, `listOwnerRewardHistory`,
  `getOwnerRewardDetail`). Pure shapes and rules: `lib/ownerHistoryDisplay.ts`. Owner + venue gate:
  `lib/ownerHistoryRoute.ts` (`withOwnerVenue`). Routes: `app/api/owner/history/**`.
- Standings are cut to the top 10 plus ties by `rankGameStandings(…, OWNER_GAME_STANDINGS_LIMIT)`. The server
  **already loads every player's total** for the game (`loadLiveTriviaWeekTotals`, one RPC), so showing the
  full list adds no reads. It only adds a larger usernames read (one `in()` over the game's scorers).
- Per-question data lives in `live_showdown_answers`: `schedule_id, occurrence_date, round_number, question_index,
  user_id, question_id → trivia_questions(slug), is_correct, points_awarded, answered_at, submitted_answer`. It is unique on
  `(schedule_id, occurrence_date, round_number, question_index, user_id)` and indexed by `idx_lsa_occurrence (schedule_id, occurrence_date)`.
- How a reward relates to a game:
  - `challenge_cycle_winners.cycle_start` for a Live Trivia **game_winner** reward = the game's start instant
    (`lib/rewards.ts` ~line 639).
  - A **daily** cycle = one venue-local day.
  - **ranked_places** (Top players this week) and **weekly** cycles = one week. Weeks that paid nobody are rows in
    `challenge_cycle_settlements`.
  - **NFL Pick 'Em** rewards follow the NFL week (`nfl_pickem_weeks`), not a venue game.
  - Indexes: `idx_challenge_cycle_winners_venue (venue_id, challenge_id, cycle_start desc)` and
    `idx_challenge_cycle_settlements_venue (venue_id, settled_at desc)`.
- **Usernames are not guaranteed unique**: `users` is unique per `(username, venue_id)`. So a username cannot
  identify a player for the breakdown. See §5d.
- Tests that pin today's behaviour: `tests/components.owner-game-results-sheet.test.ts`,
  `tests/lib.owner-history-display.test.ts`, `tests/lib.owner-history.test.ts`, `tests/api.owner.history.test.ts`,
  `tests/owner-menu-contract.test.ts`, and the SQL check `npm run test:owner-history-sql`.

## 4. What the partner sees (target)

```
Results                                   [x]      ← OwnerSheet title, once
Garden State Bar                                   ← muted venue line (not a second title)

October 2026                         6 games
  Week of Oct 12                     3 games
   FRI, OCT 16
   ┌───────────────────────────────────────┐
   │ Live Trivia · Friday Night Trivia   › │      ← competition label from the registry
   │ 24 players                            │
   │ 🏆 bobby_t · 1,240 pts                │
   │ 🎁 Free appetizer → bobby_t           │      ← rewards won AT this game
   └───────────────────────────────────────┘
   TUE, OCT 13
   ┌───────────────────────────────────────┐
   │ Live Trivia · Tuesday Trivia        › │
   │ 18 players · 🏆 kate99 · 980 pts      │
   └───────────────────────────────────────┘
   ┌───────────────────────────────────────┐
   │ 🎁 Top players this week            › │      ← week-level reward row, end of week
   │ 1st bobby_t · 2nd kate99 · 3rd ann_g  │
   └───────────────────────────────────────┘
                 Show more
```

- **Tap a game → game screen:** date + game name heading, player count. A **"Find a player"** search box
  (client-side filter over the loaded list, case-insensitive). **Full** ranked standings (scorers only,
  competition-ranked, as today). Then a short **"Rewards won at this game"** section when there are any; each
  one opens that reward's detail. "Playing now" keeps today's rule: no standings until the game ends.
- **Tap a player → player screen:** "bobby_t · #1 · 1,240 pts", then one row per question, grouped by round:
  `R1 · Q3  ✓  100 pts` or `R2 · Q1  ✗  0 pts`. Each row carries the question text, truncated to one line, so the
  partner can match "the one about Elvis". **Never** the player's own typed answer (R1). The bottom line is the
  sum, which must equal the standings total. A **"Deleted player"** row is not tappable.
- **Tap a reward (from a game card, the game screen, or a week row) → reward screen:** today's reward detail,
  unchanged (cycles, winners by place, prize, Redeemed / Not redeemed yet, why a week paid nobody).
- A reward with no matching game on the timeline (for example an NFL Pick 'Em weekly reward, or a game_winner
  cycle whose game row is missing) appears as its own reward row on its day or at the end of its week. It is
  never dropped.
- Empty state: "No results yet. Games you run here will show up after they're played."
- Follow the design rule (CLAUDE.md "minimal and simple"): one accent, no decorative borders beyond the existing
  row style, text ≥ 12px (`text-caption`/`text-footnote`, never `text-[11px]`).

## 5. Architecture

### 5a. The competition registry (the "easy to add more" seam)

- **`lib/results/competitions.ts`** (pure, client-safe). It is the one list of competitions that appear on
  Results, e.g. `{ id: "live_trivia", label: "Live Trivia", scoreUnit: "pts", hasBreakdown: true }`. The UI reads
  labels, units and capabilities **only** from here, and never branches on `"live_trivia"`.
- **`lib/results/types.ts`** (pure). These are the generic wire shapes every competition must produce:
  - `ResultsGameRow`: `competitionId`, `gameKey` (opaque string the adapter can parse back), `date` (venue-local
    YYYY-MM-DD), `title`, `playerCount`, `inProgress`, `winners[]`, `topScore`.
  - `ResultsStandings`: `ResultsStanding[]` = `{ rank, username | null, score, entry | null }`.
  - `ResultsBreakdown`: `{ rows: [{ group, label, detail, outcome: "right" | "wrong" | "none", points }], total }`.
  - `ResultsRewardItem`: a reward cycle placed on the timeline, `{ rewardId, name, attach: { kind: "game", gameKey } | { kind: "day", date } | { kind: "week", weekStart }, winners[] }`.
- **`lib/results/adapters/<competition>.ts`** (`server-only`). Each competition implements one interface:
  ```ts
  type ResultsAdapter = {
    id: ResultsCompetitionId;
    listGames(p: { venueId: string; before: string | null; limit: number; nowMs: number }): Promise<{ games: ResultsGameRow[]; exhausted: boolean }>;
    getStandings(p: { venueId: string; gameKey: string; nowMs: number }): Promise<ResultsGameDetail>;      // throws NotFound for another venue's game
    getBreakdown?(p: { venueId: string; gameKey: string; entry: string }): Promise<ResultsBreakdown>;      // optional
  };
  ```
  `lib/results/adapters/index.ts` maps id → adapter. **Adding a competition = one entry in `competitions.ts` +
  one adapter file + one line in `adapters/index.ts`** (+ its reward-matching rule in §5b if it has rewards). A
  contract test fails if those three disagree.
- **Live Trivia adapter** wraps today's `lib/ownerHistory.ts` functions (moved, not rewritten): the
  `live_trivia_occurrence_summaries` RPC, `loadLiveTriviaWeekTotals`, and `rankGameStandings` without the
  limit. `gameKey` = `"<scheduleId>:<YYYY-MM-DD>"`.
- **Timeline merge** (`lib/results/timeline.ts`, server). It asks every registered adapter for a page, merges by
  date newest-first, and keeps whole dates (a page never splits a date, the same rule as today's RPC). The cursor
  is a date. Rewards for the page's date window come from §5b. Once every game source is exhausted, the rewards
  source keeps paging by date on its own, so a stretch with rewards but no games (NFL-only weeks) still appears.
  Write this merge as pure functions with tests. Paging bugs here would silently hide results.

### 5b. Placing rewards on the timeline (pure, the riskiest logic)

`lib/results/rewardPlacement.ts`: one pure function from (ledger rows + settlements + campaign terms + venue
timezone + the page's games) to `ResultsRewardItem[]`:

| Reward | Placed on |
|---|---|
| Live Trivia `game_winner` (cycle_start = game start) | the game card with the same schedule (when pinned) and the same venue-local date |
| `points_threshold`, daily cadence | the day's game card when the day has exactly one game, else a day row |
| `ranked_places` / weekly cadence (incl. settled-with-nobody weeks) | a week row at the end of that week's group |
| NFL Pick 'Em (weekly / single week / season) | a week row in the week the cycle was finalized/settled |
| monthly / yearly / one-off, or no matching game | a row on the day it was finalized |

All dates are venue-local (`getVenueTimezone`, or the schedule's own zone for pinned game_winner rewards, exactly as
`lib/rewards.ts` does). The same Mon–Sun week rule as `groupGameHistory`. Before coding, Phase 2 **checks every row
against real production data read-only** (`node --env-file=.env.local …`, memory: query production, don't ask).
Garden State Bar's first ranked week settles after the 2026-10-16 game.

### 5c. Proving the seam

`tests/results-registry-contract.test.ts` registers a **fixture adapter** ("Test Cup", in the test file only) and
asserts the timeline, standings, search and breakdown render it with **no** UI changes. It also checks that
`competitions.ts` ↔ `adapters/index.ts` agree, and that no component under `components/owner/results/` names a
competition id. AGENTS.md gets a short "Add a competition to Results" checklist (Phase 5).

### 5d. Player breakdown without exposing a player id

- Standings rows carry `entry`, an **opaque token** = HMAC-SHA256(`SESSION_SECRET`, `venueId|competitionId|gameKey|userId`),
  base64url, truncated to 22 chars. It is never a user id, and a token works only for that venue and game.
- `GET …/breakdown?entry=` re-runs the game's totals read (one RPC, as for standings), finds the participant whose
  HMAC matches, then reads that player's rows for that game: `live_showdown_answers` filtered on
  `schedule_id, occurrence_date, user_id`, at most ~15 questions × rounds, plus one `trivia_questions` read by slug
  for question text. Select `is_correct, points_awarded, round_number, question_index, question_id` only. **Do not
  select `submitted_answer`** (R1). A contract test pins this.
- No `SESSION_SECRET` → `entry: null` everywhere and the breakdown route returns 503 (fails closed, the same pattern
  as account deletion). A token that matches nobody → 404.
- If the per-user filter turns out slow on `idx_lsa_occurrence`, Phase 3 may add a new migration with an index on
  `(schedule_id, occurrence_date, user_id)`. It must grant nothing new (indexes need no grants). **Applying it is
  Andrew's go-ahead only** (`supabase db push`).

### 5e. Routes

All routes go through `withOwnerVenue` (owner auth + the venue is theirs, BEFORE any read). Responses are
`Cache-Control: no-store`.
- `GET /api/owner/results?venueId&before` → `{ games, rewards, nextBefore, firstGameDate? }`, one round trip per page.
- `GET /api/owner/results/games/[competition]/[gameKey]?venueId` → standings + rewards won at that game.
- `GET /api/owner/results/games/[competition]/[gameKey]/breakdown?venueId&entry` → breakdown.
- Reward detail keeps `GET /api/owner/history/rewards/[rewardId]` (unchanged).
- The old `GET /api/owner/history?kind=…` and `/history/games/…` routes stay live until Phase 5. A phone with the
  old page still open must keep working across the deploy.

### 5f. URL and sheet id

Keep the sheet id **`history`** (`lib/ownerSheetParams.ts`). Renaming it would break any open or bookmarked URL
and buys nothing, since partners never see it. Steps: `game`, `player`, `reward`. The selection lives in memory.
A reload on a step whose data is gone corrects with `nav.correctStep()` (as today). Never `router.push` a step.

## 6. Cost (CLAUDE.md "cost-conscious engineering")

On demand only: nothing runs while the sheet is closed. No cron, no polling, no new external API spend.

| Action | Today | After |
|---|---|---|
| Open the page (1st page) | games tab: ~3 reads; rewards tab: ~3 more if opened | ~6–7 bounded reads in **one** request (per competition: schedules + summary RPC; rewards: ledger + settlements by venue and date window + campaigns by id; one usernames read) |
| Open a game | 3–5 reads, top 10 names | same reads; the usernames read covers every scorer (tens to low hundreds of ids) + rewards for that game (1 small indexed read) |
| Open a player | n/a | totals RPC + ≤ ~75 answer rows + ≤ ~75 question rows (3 reads) |

At Garden State Bar's volume (a handful of partner opens a week) this is negligible. At 100 venues × 10 opens a
day × ~10 reads ≈ 10k tiny indexed reads/day, still noise next to gameplay. Phase 5 compares real usage after
release.

## 7. Phases

Every phase: read this file + the previous handoff and follow CLAUDE.md (no `any`, `@/` imports, Tailwind only,
text ≥ 12px, `.env.local` append-only, never edit an existing migration, new migrations follow the grants
checklist). Run `npx tsc --noEmit`, `npm run lint` and `npm run test`, and `npm run build` at the end (never typecheck and
build at the same time). The working tree has **other people's uncommitted changes** (Category Blitz, schedule
rows). Stage only your own files. **Commit only; pushing / deploying / `supabase db push` is Andrew's call.**

### Phase 1 — Quick fixes: one title, rename to "Results"
**Model: Claude Sonnet 5.5 · Effort: low**
- Remove the in-sheet `StepHeading` "Game results"; keep the venue name as one muted line under the sheet title.
- Sheet title "Results". Menu row label "Results", hint "Games, winners & rewards"
  (`ownerMenuItems.ts`, `tests/owner-menu-contract.test.ts`).
- Rename the tab "Live Trivia games" to "Games". The tabs disappear in Phase 4; this is just the interim wording.
- Update the copy in the comments/docs that say "Game Results", and the matching tests.
- Ships alone. It is a small, visible win while the rest is built.

### Phase 2 — Registry, Live Trivia adapter, reward placement, timeline API (server only)
**Model: Claude Opus 5.5 · Effort: high** (timezone/date matching and paging merge correctness)
- §5a, §5b, §5c (registry + fixture contract test), and `GET /api/owner/results` (§5e).
- Move the Live Trivia logic out of `lib/ownerHistory.ts` into the adapter. Keep the old functions as thin
  wrappers so the old routes keep working.
- Verify the placement rules against production data, read-only. Record the findings in the handoff.
- Pure-function tests: page merge (whole dates, multiple sources, exhausted sources, rewards-only stretches),
  every placement row in §5b including DST weeks and late-night games crossing midnight UTC.
- No UI change. Nothing user-visible ships in this phase.

### Phase 3 — Full standings, rewards-at-this-game, player breakdown (server only)
**Model: Claude Opus 5.5 · Effort: high** (privacy boundary + an opaque-token scheme)
- The full standings (drop the limit for Results; the old route keeps top 10), `entry` tokens, and the breakdown route (§5d).
- Contract tests: no user id in any Results response (scan the JSON), `submitted_answer` is never selected, and a
  token from venue A or game A fails on B. The breakdown total must equal the standings total.
- Measure the breakdown query on production (`EXPLAIN` via a read-only script). Add the index migration only if
  needed, and ask before applying it.

### Phase 4 — The one-page Results UI
**Model: Claude Sonnet 5.5 · Effort: high** (largest UI change; existing primitives only)
- Replace the tabs with the timeline (§4), in a new `components/owner/results/` (`ResultsSheet`, `ResultsGameCard`,
  `ResultsRewardRow`, `GameStandingsScreen` with search, `PlayerBreakdownScreen`). Reuse `OwnerSheet`, `SlideSteps`,
  `GroupHeader` grouping (`groupGameHistory`, generalised to `ResultsGameRow`), `HightopLoader` and `WizardFooter`.
- Render competition labels and units only from the registry. The search box is a plain input inside the dark
  sheet (match the existing dark form styling, ≥ 44px tap target).
- Steps `game` / `player` / `reward` with the phone's Back stepping back (`useOwnerSheet`). Update `HistorySheetHost`.
- Component tests (replace `components.owner-game-results-sheet.test.ts`): one request per page, the detail fetches only
  on tap, search filters, a deleted player is not tappable, a reward with no game still renders, the reload correction.
- Browser-check from a scratchpad clone with mocked routes (CLAUDE.md: never against Andrew's dev server, never
  `pkill`). Add a section to `docs/partner-dashboard-app-redesign-device-checklist.md` for Andrew's phone pass.

### Phase 5 — Cleanup, docs, release check
**Model: Claude Sonnet 5.5 · Effort: medium**
- After Andrew confirms Phase 4 is deployed: delete `GameResultsSheet.tsx`, the old `kind=games|rewards` and
  `/history/games/…` routes, and the now-unused parts of `lib/ownerHistory.ts`. Keep the reward detail route.
  Leave the two SQL functions in place (they power the adapter).
- CLAUDE.md: replace the scattered Game Results notes with a short "Partner Results page" section.
  AGENTS.md: the "Add a competition to Results" checklist (registry entry, adapter, placement rule, contract test).
- Compare real Supabase/Vercel usage against §6 and report any material difference.

## 8. Out of scope

Adding NFL Pick 'Em, Category Blitz or any other competition (R2: later, via the seam). Showing a player's typed
answers. Editing scores, re-awarding or voiding prizes. CSV export. Live (in-progress) standings. Admin-side changes.

## 9. Open questions

None blocking. Phase 2 may surface reward rows that don't fit §5b. If so, the agent places them as a day row
(never dropped) and lists them in the handoff for Andrew.
