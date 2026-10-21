# Squares + Brackets plan — Phase 9 handoff (bracket Prizes, Results, TV)

Date: 2026-10-20. Plan: `docs/squares-and-brackets-plan.md` (§4 Phase 9, as-built §16).

## For Andrew (plain English)

- **What changed:** March Madness now has everything around the game itself:
  - **Prizes.** A partner can offer 1st / 2nd / 3rd place prizes for the brackets they choose (men's, women's, or either
    second chance), with the usual "minimum players" step. The winners are paid automatically once the championship
    game is graded.
  - **Results.** Each bracket a venue played shows up on the partner Results page with full standings. Tapping a player
    shows each of their picks, right or wrong.
  - **TV.** During the tournament, the venue TV's idle screen shows the venue's top 10, today's games, and the biggest
    upset busting brackets at that venue. A live Trivia or Category Blitz game still takes over the TV as before.
  - As you decided, **the bracket screen itself shows no Prize line.** Prizes appear only on the Prizes tab and on Results.
- **Is it live?** The database change (migration `20261019213121`) is **applied to production** (2026-10-20, checked).
  The code is **committed on your Mac only, not pushed or deployed**. Everything is behind `NEXT_PUBLIC_BRACKETS_ENABLED`,
  which is off, so players and partners see nothing new.
- **What's left:** Phase 10: a code review of Phases 7–9, a full rehearsal of the 2026 tournament on the test venue, your
  phone pass, then the flag goes on by Mon Mar 8, 2027. Squares 6.5 is still parked until the Oct 22 game is recorded.
- **Needs you:** push + deploy when you're ready. Order doesn't matter now, because the migration is already applied.

## For the next agent

### 1. Next phase: goal and scope
Phase 10 (Opus 5.5 · high): run `/code-review high` on Phases 7–9 and fix the findings, replay the 2026 tournament
(men's + women's, main + second chance) on `venue-hightop-test` with the replay clock, then help Andrew through device
checklist section B and the flag-on (by Mon Mar 8, 2027). Squares sub-phases 6.5–6.9 are separate. 6.5 is parked:
`docs/squares-and-brackets-plan_PHASE_6.5_HANDOFF.md`.
Out of scope: changing any bracket scoring rule, adding a Prize line to the bracket screen (Andrew said no), and real
POS redemption for bracket prizes (they are ordinary coupons).

### 2. Starting state
- Branch `main`. Phases 7 + 8 = commit `baeb6e4`. Phase 9 = the commit after it (`feat(brackets): plan phase 9 …`).
  Nothing pushed or deployed.
- Migrations: `20261019203858` (Phase 7) and `20261019213121` (Phase 9) are **both applied** to linked project
  `pkmxupsayzshvpirkaav`. Phase 9 was verified on 2026-10-20 through PostgREST:
  `bracket_tournaments.prizes_settled_at`, `challenge_campaigns.bracket_keys` and `rpc bracket_venue_games` all
  answer. There is no data yet: 0 tournaments and 0 bracket prizes.
- Flags: `NEXT_PUBLIC_BRACKETS_ENABLED` off and `BRACKETS_REHEARSAL_ENABLED` unset.
- Not part of Phase 9 and left uncommitted on purpose (another session's work):
  - POS/Toast doc edits (`docs/pos-rewards-integration-plan.md`, `docs/rewards-trust-and-pos-roadmap.md`,
    `lib/pos/providers.ts` comment, and the POS hunk of `CLAUDE.md`);
  - the `design-system/project/public/info/` image move;
  - `tests/fixtures/squares/nfl-live-capture-1392308.json` (a 6.5 capture).

### 3. Decisions already made (don't re-ask)
- **No Prize line on the bracket screen** (Andrew, 2026-10-19). Prizes only on the Prizes tab and Results.
- Prizes are places only (1st / 2nd / 3rd ladder), per bracket the partner chooses; nothing is pre-selected.
- A bracket that has locked can't be added to a new prize. The wizard greys it out and the server refuses it with 409
  `REWARD_BRACKET_LOCKED_MESSAGE`.
- Settled once, after the championship and after every round's venue points are paid. **A later admin correction does
  not change settled prizes.** The admin panel's override confirm and tournament card say so; a wrong award is a manual fix.
- Results placement: a week row in the week the prize was settled, labelled with the bracket ("Men's bracket").

### 4. Files
- `supabase/migrations/20261019213121_bracket_prizes.sql`: game type, `bracket_keys` + `bracket_keys_valid`,
  `prizes_settled_at`, `bracket_venue_games`.
- `lib/bracketPrizes.ts` (pure LEAF, imported by the registry): keys, labels, `isBracketPrizeOffered`,
  `bracketPrizeCycleStart` / `bracketPrizeKeyOfCycle` (cycle key = tournament `created_at` minute + key position 1–4 in
  seconds; the ONE key).
- `lib/bracketPrizeTerms.ts`: the partner's terms sentence. It is a separate file so the leaf has no import cycle.
- `lib/bracketPrizeAwards.ts` (server): `settleBracketPrizes(tournament, winnerSeats, total, now)`,
  `bracketPrizeCoversBracket`, `bracketRealLockMs`. Ranks with `rankBracketEntries`, then calls
  `awardRankedCyclePlaces`. Safe to repeat, because the RPC answers `already_resolved`.
- `lib/bracketsSync.ts`: calls it once `allPaid && !prizesSettled && conflict < 0`, stamps `prizes_settled_at`, and
  keeps the 2-minute pace until stamped. `lib/bracketsStore.ts`: `prizesSettledAt` in `TOURNAMENT_COLUMNS`.
- `lib/rewardDefinitions.ts` (`bracket_challenge`, `offeredRewardDefinitions`), `lib/rewardDescription.ts`
  (`{brackets}` / `{bracket}`), `lib/rewards.ts` (`resolveBracketPrizeContext`, createReward validation,
  `loadBracketKeys` cached), `lib/challengeCampaigns.ts` (`listActiveBracketPrizeCampaigns`, `loadBracketPrizeKeys`,
  insert writes `bracket_keys` only when set), `components/rewards/CreateRewardWizard.tsx` (bracket chips + places
  terms step), both reward routes (409 mapping), `components/venue/venueHubShared.tsx` ("Bracket prizes for the top N").
- Results: `lib/results/competitions.ts` (`bracket`, `hasBreakdown: true`), `lib/results/adapters/bracket.ts`,
  `lib/results/adapters/index.ts`, `lib/results/rewardPlacement.ts`, `lib/ownerHistory*.ts`,
  `lib/ownerRewardDisplay.ts`, `lib/rankedWeekHistory.ts` (`noScorersNote`).
- TV: `lib/bracketsTv.ts` (pure payload), `lib/bracketsTvRead.ts` (server, caches),
  `components/venue-screen/BracketTvScreen.tsx`, `lib/venueScreen.ts` (mode `bracket`), `lib/venueScreenBrand.ts`
  (orange theme), `lib/venueScreenTiming.ts` (30 s poll), `app/api/venue-screen/state/route.ts` (CDN 15 s like idle),
  `components/venue-screen/VenueScreenClient.tsx` (title "March Madness", transition key `br:<tournament>:<kind>`,
  burn-in shift).
- Admin: `components/admin/sections/BracketsSection.tsx` (prize settled line, override warning).
- `lib/seasonalGames.ts`: `isBracketsServerLive` (flag AND (window open OR rehearsal switch)).

### 5. Facts and traps
- `bracket_keys` is deliberately NOT in `CAMPAIGN_SELECT_COLUMNS`. Only `listActiveBracketPrizeCampaigns` and
  `loadBracketPrizeKeys` select it by name. Don't add it to the shared select.
- `TOURNAMENT_COLUMNS` now names `prizes_settled_at`. That is safe because the migration is applied, but never
  roll back the column.
- **The TV and the sync use different gates.** The sync runs with the rehearsal switch alone. The TV read and Results
  need the public flag (`isBracketsServerLive`) or, for Results, the rehearsal switch. So a Production rehearsal
  (switch only) costs the TVs nothing; only a Preview with the flag on shows the TV.
- A rehearsal tournament's locks are compared in REAL time for prizes (lock + `clockOffsetSeconds`). The TV and the
  payload use the tournament's own clock (`tournamentNowMs`).
- A prize created after a bracket locked is never paid for that bracket, even if the server check were bypassed.
  `bracketPrizeCoversBracket` re-checks it.
- `tests/prize-sweep-ownership-contract.test.ts` lists `lib/bracketPrizeAwards.ts`: it pays only `bracket_challenge`.
- The new TV test builds its "today" from the 2026 men's fixture (one minute after the last first-round tip), so the
  upset and today's-games assertions use real data, not hand-made games.

### 6. Build / run / test (all run 2026-10-20, all green)
`npx tsc --noEmit` · `npm run lint` · `npm run test` (428 files, 5,195 pass, 13 skipped) ·
`npm run test:brackets-sql` · `npm run test:squares-sql` · `npm run build`. Don't run tsc at the same time as build.
Phase 9 tests: `tests/lib.bracket-prizes.test.ts`, `tests/lib.bracket-prize-awards.test.ts`,
`tests/lib.results-bracket-adapter.test.ts`, `tests/bracket-tv.test.ts` (new: payload, screen selection, cost gates,
render), plus the additions to `tests/components.create-reward-wizard.test.ts` and `tests/brackets-sync.test.ts`.
**Unverified:** nothing ran end to end against real data (no tournament exists until Selection Sunday 2027). The
Phase 10 rehearsal is where prizes, Results and the TV get exercised together. No device pass of the wizard's bracket
step, the Results bracket screens or the TV view has been done yet.

### 7. Open questions for Andrew
None blocking. Push + deploy whenever convenient.

### 8. Recommended first steps for Phase 10 (Opus 5.5 · high)
1. `/code-review high` on `baeb6e4` plus the Phase 9 commit.
2. Create a rehearsal tournament for the 2026 season on `venue-hightop-test` (admin panel, replay clock). On a Preview,
   set `BRACKETS_REHEARSAL_ENABLED` + `NEXT_PUBLIC_BRACKETS_ENABLED`, create a bracket prize at that venue, fill brackets,
   run the replay to the end, and check: points are paid per round, `prizes_settled_at` is stamped, coupons appear in
   the wallet, Results lists the bracket with a breakdown, and the TV shows the bracket mode.
3. Archive the rehearsal tournament before the flag goes on in Production.
