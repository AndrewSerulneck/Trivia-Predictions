# Squares + Brackets — Phase 8 handoff (March Madness bracket player screens)

**Date:** 2026-10-19. **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 8; as-built summary §15).
**Next:** Phase 9, bracket Prizes + Results + TV (9a Opus 5.5 · high, 9b Sonnet 5.5 · medium). Also still open: finish 6.5
after the Oct 19 + Oct 22 NFL games (`docs/squares-and-brackets-plan_PHASE_6.5_HANDOFF.md`), and 6.6's re-review, which
should now cover Phases 7 and 8.

## For Andrew (plain English)
- **What changed:** players now have a March Madness screen. They pick Men's or Women's (and Bracket or Second chance
  once that opens), then fill out a bracket on their phone: one region at a time, then the Final Four, then a tiebreaker
  and Save. Choosing a later-round winner only offers the two teams they already picked, and changing an early pick
  clears the later picks that depended on it. A half-filled bracket is saved every time they move to the next step (and
  when they leave), so nothing is lost. If they filled one out at another bar they get a "Copy my picks from <bar>"
  button. After the games lock they see their bracket with Right / Wrong / Still alive on every pick, their score and
  the best they can still reach, and the venue's standings with a "Find a player" box. The three tutorial cards got art.
- **Live?** No. Nothing is committed, pushed or deployed, and the switch (`NEXT_PUBLIC_BRACKETS_ENABLED`) is still off, so
  nobody sees a card or the page. No new database changes in this phase.
- **I looked at it** in a phone-size browser (350 px and 289 px wide, fake data from last year's real tournament): no
  sideways scrolling, no text under 12 px, the tutorial art fits, the fill-out and results screens read well. A real phone
  pass is still yours (the new items are at the top of section B in `docs/squares-and-brackets-device-checklist.md`).
- **Cost:** the screen never polls. It asks the server for the brackets once when opened, once more if someone comes back
  to a tab they left for 5+ minutes (and only while something can still change), once at the moment a bracket locks, and
  once after a copy. Saving sends one small request per step (about 6 for a whole bracket). Standings load when that tab
  opens. Rough size at 100 venues: ~5 small database reads per open and ~8 KB sent per open (compressed); well inside
  today's usage. Measure the real number during the Phase 10 rehearsal.
- **Needs you:** (1) say whether to commit Phases 7 + 8; (2) run `supabase db push` for the Phase 7 migration before any
  rehearsal (it is still not applied); (3) the phone pass whenever a rehearsal exists.

## For the next agent

### 1. Next phase goal and scope
**Phase 9 (plan §4):**
- **9a (Opus 5.5 · high) — Prizes + Results.** A reward definition for ranked places 1st / 2nd / 3rd per tournament at
  the venue, using the existing `players` (minimum players) wizard step, resolved when that tournament's final is graded.
  Register `bracket` in `lib/results/competitions.ts` (`hasBreakdown: true`: a player's picks right/wrong), one adapter
  under `lib/results/adapters/` + a line in `adapters/index.ts`, and a placement rule in `lib/results/rewardPlacement.ts`
  (the plan says: week row of the final). Follow `AGENTS.md` "Add a reward" / "Add a competition to Results", and
  `docs/squares-and-brackets-plan.md` §12 (Squares did the same). `challenge_campaigns_game_types_valid` + `VALID_GAME_TYPES`
  do not accept `bracket` yet (plan §9: only `game_sessions_type_valid` does) — a NEW migration. Every prize sweep must pay
  only its own `rewardDefinitionId` (`tests/prize-sweep-ownership-contract.test.ts`, plan 6.1) — a new sweep that calls
  `awardCycleWinner` / `awardRankedCyclePlaces` fails that test until it is added.
- **9b (Sonnet 5.5 · medium) — TV view** in the tournament window: venue top 10, today's games, the biggest upset busting
  brackets. Same no-new-polling rule as Squares Phase 5 (`lib/squaresTv*.ts`, inside the existing `/api/venue-screen/state`
  poll; replaces the IDLE screen only).
**Out of scope:** the flag going on / rehearsal / launch (Phase 10), any change to the bracket rules or engine, and the
Phase 8 screens except for a small Prize line on the screen if Andrew wants one (keep it minimal, plan §1 design rule).

### 2. Starting state
- Branch `main`, last commit `c43fa66` (Squares 6.4). **Nothing from Phases 7 or 8 is committed** (nor the 6.5 interim
  handoff). Andrew's unrelated edits are in the tree and must not be committed, reverted or `git checkout`'d by you:
  `CLAUDE.md` (his POS hunk; my bullets for Phases 7 and 8 are at the very end), `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`. Stage only your own paths when Andrew says to commit
  (for CLAUDE.md use a hunk patch: `git diff -U3 CLAUDE.md`, keep the bracket hunks, `git apply --cached`).
- **Migration `supabase/migrations/20261019203858_brackets_engine.sql` is NOT applied** to `pkmxupsayzshvpirkaav`. Until it
  is: the admin Brackets panel 500s, and the player routes 404 anyway (flag off).
- No database writes, deploys or env changes were made in Phase 8. `NEXT_PUBLIC_BRACKETS_ENABLED` and
  `BRACKETS_REHEARSAL_ENABLED` are absent from Vercel (= off).
- Background processes that are not yours (6.5): PIDs 10301/10302/10304/10305 are NFL live-game recorders
  (`scripts/capture-nfl-live-game.cjs`). Leave them running.
- The scratchpad clone and the :3100 dev server I used for browser checks are gone (I killed only the PID listening on
  :3100). Andrew's own `next dev` on :3000 was not running when I checked, but do not assume it won't be.

### 3. Decisions already made (don't re-ask)
Andrew's plan §1 (1–15) and the Phase 7 decisions (handoff §3). Phase 8 choices, mine, within the plan's remit:
- **Switcher = two chip rows** (Tournament: Men's / Women's; Bracket: Bracket / Second chance), each shown only when
  there is a choice, listing only brackets whose phase is open, locked or complete. Default selection: an open bracket the
  player has not finished, else any open one, else the first main (`defaultBracketKey`).
- **Fill-out layout:** a game = two side-by-side tap targets (seed + name, up to 3 lines); step chips with `done/total`
  and a check; sticky Back / Next from the shared `WizardFooter` (the navigation tripwire forbids hand-rolled step
  buttons). Second chance = one grouped "Sweet 16 & Elite Eight" step instead of four 3-pick steps.
- **No clear-a-pick tap:** tapping the picked team does nothing; pick the other team to change. (Keeps taps safe.)
- **Partial saves allowed** and Save is always enabled except for an invalid tiebreaker (Phase 7: partial counts).
- **Drafts:** saved on step change / tab hidden / leaving; never on a tap (cost + battery). A half-typed or invalid
  tiebreaker never blocks the picks: they are sent with the last saved guess.
- **While filling out the page hides the switcher and headline** (only a small "Men's bracket · 2026" line), so the games
  are near the top of a phone screen.
- **After the lock, no editor and no Standings before it:** open = summary + editor; locked/complete = My bracket +
  Standings tabs (standings before the lock would be a list of zeros).
- **App-bar label** is `BRACKET_SHORT_NAME = "Bracket"` (`lib/venueGameCards.ts`): "Brackets" and "March Madness"
  truncated beside the points pill at 350 px. At 289 px even the short name truncates to "BR…" (same shared-bar
  behaviour as Squares; left alone).
- **"Rehearsal" tag** next to the title when the tournament is a rehearsal (so Andrew can tell on his phone).
- A copy over existing picks asks first ("This replaces the N picks you have here").

### 4. Files created or changed
New:
- `lib/bracketsView.ts` — pure, client-safe. `BRACKET_ROUND_NAMES`, labels (`bracketGenderLabel`, `bracketKindLabel`,
  `bracketOptionLabel`, `bracketRegionName`, `bracketDisplayYear` = feed season + 1), `selectableBrackets`,
  `defaultBracketKey`, `bracketSwitcher`, `bracketKeyFor`, `bracketSeatTeams` (64 seats → name/seed/`pending`/`tbd`),
  `bracketSteps` / `bracketStepProgress` / `bracketProgressLine`, `bracketMatchupSides`, `bracketPickState` /
  `bracketPickCounts` / `bracketChampionPick`, `bracketHeadline` / `formatBracketLock`, `bracketSaveMessage`,
  `withSavedEntry`, `BRACKET_STATE_STALE_MS`, `bracketStateCanChange`, `filterBracketStandings`.
- `app/bracket/page.tsx` (flag-gated `notFound()`), `components/bracket/`: `BracketGame.tsx` (identity, switcher,
  modes `home | edit | bracket | standings`, copy, exit-with-save), `BracketEditor.tsx` (steps, drafts, tiebreaker,
  `WizardFooter`), `BracketMatchups.tsx` (edit + review rendering), `BracketReview.tsx`, `BracketStandings.tsx`,
  `BracketStepChips.tsx`, `useBracketData.ts` (state read, `save`, `copy`, lock timer, stale-return read).
- Tests: `tests/brackets-view.test.ts` (25), `tests/bracket-screen.test.ts` (20, jsdom, fake network + fake timers),
  `tests/bracket-screen-contract.test.ts` (10), fixture helper `tests/fixtures/brackets/view.ts` (builds the
  `GET /api/bracket/state` view from the saved 2026 feeds; `makeTournament`, `entryOf`, `replayGames`).
Changed:
- `components/venue/GameIdentityPanel.tsx` — `BracketIllustration` (+ dispatch line). `components/venue/AppBar.tsx` +
  `lib/venueGameCards.ts` — `BRACKET_SHORT_NAME`. `components/auth/AuthNavigationGuard.tsx` (`/bracket` is an in-session
  route), `lib/analytics.ts` (`gameTypeForPath` → `bracket`), `lib/venueGameTransition.ts` (comment only).
- Docs: `CLAUDE.md` (one bullet at the end), plan status line + Phase 8 "Built" line + §15,
  `docs/squares-and-brackets-device-checklist.md` (section B: Phase 8 phone items).
- No change to any `lib/brackets/*`, `lib/bracketsEntries.ts`, route, SQL or cron.

### 5. Facts and traps
- **The global button CSS beats Tailwind utilities.** `app/globals.css` gives every `button:not(:disabled)` a 1 px border,
  12 px radius, weight 600, `min-height: 36px`, and ≤380 px side padding, all stronger than a utility class. Hence
  `!rounded-… !border-0 !font-black !px-…` on the bracket buttons. Cells that must stay small can't be buttons (Squares).
- **`rem` is 13 px on phones ≤ 380 px**, so `-mx-2` is 6.5 px there. The `WizardFooter` is full-bleed with
  `-mx-2 !max-w-none` (a global `max-width: 100%` stops negative margins widening an element without `!max-w-none`).
- **The "Tournament" / "Bracket" chip containers are `role="group"`.** Tests that look for matchups must use
  `li[role="group"]` (or the matchup's aria-label), not `getAllByRole("group")[0]`.
- **A seat can be "TBD".** Until the engine links an opening-round game to the round-1 seat it fills (feed shows a team, or
  an admin links it in Admin → Brackets → problems), that seat reads "TBD" and is still pickable. Linked + undecided reads
  "A / B"; decided shows the winner. `tests/brackets-view.test.ts` pins all three with the 2026 data masked at Selection
  Sunday (a feed with hidden opener teams does NOT link by itself).
- **The editor keeps its own copy of the picks** (initialised from the held entry when it mounts). A copy bumps
  `copyNonce` (the editor's `key`) so it remounts with the copied picks; a save does not remount it.
- **`mine.score` stays at its last server value after a save** (open phase: 0). After the lock the score comes from the
  state read, never from the client.
- **`GET /api/bracket/state` payload ≈ 35–40 KB uncompressed for two tournaments** (all ≈ 160 games). Fine at one read per
  open; if Phase 9 or 10 shows it hot, trim `games` to what the screen uses (round/slot/teams/winnerSide/feedsSeat).
- **`getBracketStandings` selects `picks` (63 ints per row, ≤ 1,000 rows) only to compute `maxPossible`.** Cheap at real
  venue sizes (tens of entries). If a venue ever has hundreds, store `max_possible` instead.
- `npm run test` has one known flaky test unrelated to this work (`tests/lib.sportsBingo.nfl-star-tilt.test.ts`, random
  sampling); it passed on all runs today. The `.next/types/routes.d 2.ts` "Duplicate identifier" line in tsc is an iCloud
  duplicate inside `.next/` — ignore it. Don't run `tsc` and `next build` at the same time.
- Browser testing recipe (worked): clone with `rsync -a --delete` using ANCHORED excludes (`/node_modules /.next /.git
  /native /docs /tests /.env*`), `cp -cR` node_modules, run `next dev -p 3100` with `NEXT_PUBLIC_BRACKETS_ENABLED=true`
  and a dummy `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, cookies `tp_user_id` + `tp_venue_id`, and `page.route` mocks for
  `/api/bracket/*` (state JSON made from `tests/fixtures/brackets/view.ts` with `npx tsx`). The tutorial's last button
  is the play label ("Fill out my bracket"); the first card's buttons are Back / Next. Kill only the PID on :3100.

### 6. Build / run / test (all run 2026-10-19, all green)
- `npx tsc --noEmit`: clean (apart from the iCloud duplicate). `npm run lint`: clean.
- `npm run test`: 424 files, **5,150 pass / 13 skipped (environment-gated) / 0 fail**. The three new bracket test files are
  55 of those.
- `npm run build`: passes, 214 pages; `/bracket` is listed (static, prerendered with the flag off → 404 page; **flip the
  flag, THEN redeploy**, like every `NEXT_PUBLIC_*`).
- Browser (Chromium, 350×740 and 289×568, mocked data from the 2026 men's/women's fixtures): no horizontal scroll and no
  text under 12 px on any of: tutorial ×3, summary, editor (region, Final Four, Finish), locked review, standings, search,
  women's complete bracket, and a Selection-Sunday state. Screenshots were in the scratchpad (not kept).
- **Not verified:** the screens against the real routes/database (the migration is not applied); a physical phone or the
  native app (Android Back is unit-tested only); Face-ID / keyboard behaviour of the tiebreaker field on a real phone; a
  real 2027 feed; the "A / B" seat in a browser screenshot (unit-tested only); `GET /api/bracket/state` timing under load.

### 7. Open questions for Andrew
- Commit Phases 7 + 8 (and the 6.5 interim docs)?
- Apply migration `20261019203858` (`supabase db push`).
- Phase 9: does he want a Prize line on the bracket screen itself, or Prizes only on the Prizes tab / Results (Squares
  shows none on the board)?

### 8. Recommended first steps for Phase 9
1. Read plan §1, §4 Phase 9, §12 (Squares Prizes as built) and §14–15; `AGENTS.md` "Add a reward" and "Add a competition to
   Results"; `lib/rewardDefinitions.ts`, `lib/squaresPrizes.ts` + `lib/squaresPrizeAwards.ts` (the closest precedent),
   `lib/results/adapters/squares.ts`, `lib/results/rewardPlacement.ts` header, `tests/prize-sweep-ownership-contract.test.ts`.
2. Decide the cycle key: one cycle per (tournament, kind, place) resolved by the final's grade; reuse
   `award_ranked_cycle_places`-style RPCs where possible (see `lib/liveTriviaRankedRewards.ts`). The ranking function is
   `rankBracketEntries` (`lib/brackets/scoring.ts`); venue standings = `getBracketStandings` in `lib/bracketsEntries.ts`.
3. Results' breakdown for a bracket = the player's picks right/wrong. `entry` tokens are HMAC'd (`lib/results/entryToken.ts`);
   never expose a user id (`tests/results-privacy-contract.test.ts`).
4. For 9b, copy the Squares TV pattern (`lib/squaresTvRead.ts` → `lib/squaresTv.ts` → `SquaresTvScreen.tsx`).
Model: Opus 5.5 · high for 9a, Sonnet 5.5 · medium for 9b (plan §4).
