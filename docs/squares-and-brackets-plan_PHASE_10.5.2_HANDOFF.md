# Squares + Brackets plan — 10.5.2 handoff (2026-10-21)

Plan: `docs/squares-and-brackets-plan.md` (§4 10.5.2, findings §22 R2/R4/R5/R7, as-built §24).

## For Andrew (plain English)

- **What changed:** the final score of the March Madness championship can no longer vanish. Before, if the score
  feed had no final score and you typed one in, a sync that started a moment earlier could blank it again, and any
  later admin correction would then forget the total that the tiebreaker (and so the prizes) depends on. Now the
  score stays, and both the automatic sync and your corrections use the same rule for the total. Also: if you pick a
  champion that the stored score says lost, the admin panel refuses and asks for the corrected score; and if you fill
  only one of the two score boxes it says "Enter both scores, or neither" instead of quietly ignoring it.
- **Is it live?** No. Built and tested, **not committed, not deployed**, brackets are still switched off. It includes
  one small database change that is **not applied yet**.
- **Also done today, on your request:** 10.1's database change was already applied (checked). 10.2–10.5.1 were
  committed (`a9488db`), pushed and deployed to Production (Vercel deployment `hightop-challenge-bgmf8863g`, Ready;
  `https://hightopchallenge.com/info` answers 200). That push also shipped the 12 earlier local commits (Squares
  6.1–6.4, Brackets 7–9 and 10.1), all with their database changes already applied and their flags off. So the
  6.1 fix for the NFL Pick 'Em prize at Pacific Street is now live.
- **What needs you:** `supabase db push` for migration `20261021134157_bracket_feed_scores_keep.sql`, and a commit
  / deploy of 10.5.2 when you choose. The order doesn't matter (the app works with or without the database change).
- **What's left before the rehearsal (10.6):** 10.5.3 and 10.5.4 (both small).

## For the next agent

### 1. Next phase goal and scope
- **10.5.3** (Sonnet 5.5 · low): the TV follows a rehearsal `set_clock` at once (§4 10.5.3; `lib/bracketsTvRead.ts`
  caches tournament IDS, not records; don't add the offset to the revision).
- **10.5.4** (Sonnet 5.5 · low): a definite refusal isn't re-sent by a waiting caller (`refusedVersionRef` in
  `components/bracket/BracketEditor.tsx` `persist()`).
- Either order; they touch different files. Out of scope: the 10.6 rehearsal, the §7 "refuse picks of tipped games"
  option (b) (Andrew's call, 10.5 handoff §7), any change to Squares.

### 2. Starting state
- Branch `main`. Last commit `a9488db` (10.2–10.5.1), **pushed to `origin/main` and deployed to Production
  2026-10-21** (auto-deploy from the GitHub push; Vercel `hightop-challenge-bgmf8863g`, Ready).
- **10.5.2 is uncommitted** in the working tree: `lib/bracketsStore.ts`, `lib/bracketsSync.ts`, `lib/bracketsAdmin.ts`,
  `components/admin/sections/BracketsSection.tsx`, `supabase/migrations/20261021134157_bracket_feed_scores_keep.sql`
  (new), `scripts/test-brackets-sql.cjs`, `tests/brackets-sync.test.ts`, `tests/brackets-contract.test.ts`,
  `docs/squares-and-brackets-plan.md`, `CLAUDE.md` (one bullet), this handoff.
- **Other people's uncommitted work is also in the tree — do not commit it with brackets work:** `CLAUDE.md`'s POS
  hunk (heading "POS Rewards Integration (Square live; Toast is the PRIORITY…)"), `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts` (comment only), the deleted
  `design-system/project/public/info/*.png` and the untracked `design-system/project/public/info/New Folder With Items/`,
  and `tests/fixtures/squares/nfl-live-capture-1392308.json` (6.5's capture). I committed `a9488db` by staging only the
  bracket hunks of `CLAUDE.md` (`git diff` → drop the POS hunk → `git apply --cached --recount`); do the same.
- Database: migration `20261021035254` (10.1) is applied (in `supabase migration list`, and a no-op
  `bracket_save_feed_games(<zero uuid>, '[]')` returned 0). Migration `20261021134157` (10.5.2) is **NOT applied**.
  No data was changed today. No tournament exists until Mar 14, 2027.

### 3. Decisions already made
- Design as written in plan §4 10.5.2 (no deviation). `coalesce` in the SQL; one shared TS helper; 409 for a
  contradicting champion without scores; hint + disabled Override for half-entered scores; no "clear a score" control
  (enter the right one instead).
- "Strictly higher" means a tied stored score also refuses a no-score winner override (a final can't end tied).
- The 10.1 B1 test now flips the champion **with the swapped score** — that is the intended new behaviour, not a
  weakened test.

### 4. Files and how they fit
- `supabase/migrations/20261021134157_bracket_feed_scores_keep.sql` — `create or replace bracket_save_feed_games`, copied
  from `20261021035254` with `home_score = coalesce(v_g.home_score, g.home_score)` (same away). Same revoke/grant.
- `lib/bracketsStore.ts` — `recordedChampionshipTotal(games, tournament)`: `championshipTotal(games)` else, when
  `bracketWinnerSeats(games)[62] !== null`, `tournament.championshipTotal`. Now imports values from
  `lib/brackets/games.ts` (pure, no cycle).
- `lib/bracketsSync.ts` — `syncBracketTournament` uses it for `total` (`finalDecided` still used for `awaitingScore`).
- `lib/bracketsAdmin.ts` — `override_result`: new 409 before any write; records `total = recordedChampionshipTotal(fresh,
  tournament)` and the "Prizes need the final score" hint reads `total`. `championshipTotal` import removed.
- `components/admin/sections/BracketsSection.tsx` — `GameRow`: `scoresHalf`, the hint line, `|| scoresHalf` on the
  Override button's `disabled`.

### 5. Facts and traps
- The sync is hourly once a final is decided without a score (10.2), so a test tick 10 minutes later does nothing —
  tick at `men().next_sync_at` (see the new stale-run test).
- `tests/brackets-sync.test.ts`'s fake `bracket_save_feed_games` mirrors the SQL; it now coalesces scores too. Keep the
  fake and the migration in step; the real proof is `npm run test:brackets-sql`.
- Tests call `runBracketsAdminAction` with already-parsed actions (`scores: { home, away }`), not raw
  `homeScore`/`awayScore`.
- Don't run `npx tsc` and `npm run build` at the same time (`.next/types`).

### 6. Build / test / verify
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 428 files, **5,223 passed / 13 skipped** (+5 new);
  `npm run test:brackets-sql` passes (and fails on the new assertion with the migration left out — checked);
  replay `npx vitest run tests/brackets-sync.test.ts -t discovers` → 6,411 feed requests (unchanged).
- `npm run build` passed before the `a9488db` commit; not re-run for 10.5.2 (no route/page change).
- Not browser-tested: the admin panel hint (flag off; pinned by a source contract test). `/verify` wasn't run for the
  `a9488db` commit: it drives a venue game page in a browser, and `/bracket` 404s with the flag off.

### 7. Open questions / waiting on Andrew
- `supabase db push` for `20261021134157`; commit + deploy of 10.5.2.
- Still open from 10.5: whether `bracket_save_entry` should refuse changed picks of tipped games (option b).

### 8. Recommended first steps
1. Read plan §4 10.5.3 and 10.5.4, and §24.
2. Check `supabase migration list` for `20261021134157` (applied or not) and say so in your handoff.
3. Do 10.5.3 and 10.5.4 (Sonnet 5.5 · low each); then 10.6 needs everything through 10.5.4 deployed.
