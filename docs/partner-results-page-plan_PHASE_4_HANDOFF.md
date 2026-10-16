# Partner Results page — Phase 4 handoff

Plan: `docs/partner-results-page-plan.md`. Phase 4 = the one-page Results screen (UI).

## Summary for Andrew (plain English)

- **What changed:** the **Results** menu row now opens the new single-timeline screen instead of the old two-tab
  "Game Results" sheet. You see one list of the venue's games, newest first (Month → Week → Day). Each game shows its
  winner; a reward won at a game is a 🎁 line on that game's card; a weekly reward is a row at the bottom of its
  week; a reward with no game that day is its own row. Tap a game for the **full** standings with a **Find a player**
  box. Tap a player for each question they answered (✓/✗, points, the question on one line, total = their score).
  Tap a reward for its history. Back (phone gesture or button) steps player → game → list → closes.
- **Checked:** unit and screen tests (all pass), and a real-browser pass on a phone-sized screen against fake data
  (screenshots looked right; every tap made exactly one request; Back and reload behaved). Typecheck, lint, the full
  test suite (4,771 pass) and the production build are clean.
- **Live?** No. Committed locally on `main`; **not pushed or deployed**. Until it is deployed, partners still see the
  old sheet.
- **Left:** your phone pass (new section **J** in `docs/partner-dashboard-app-redesign-device-checklist.md`), then
  Phase 5 (cleanup) once you confirm it is deployed and good.
- **Needs you:** (1) push/deploy when ready; (2) the phone pass; (3) the open Phase 2 question below.

## For the next agent (Phase 5)

### 1. Goal and scope
Phase 5 (plan §7): **only after Andrew confirms Phase 4 is deployed and fine on his phone.** Delete
`components/owner/history/GameResultsSheet.tsx` and its test `tests/components.owner-game-results-sheet.test.ts`, the old
`GET /api/owner/history?kind=games|rewards` and `/api/owner/history/games/…` routes (KEEP
`/api/owner/history/rewards/[rewardId]`, the new screen uses it), and the now-unused parts of `lib/ownerHistory.ts` /
`lib/ownerHistoryDisplay.ts` (the old `groupGameHistory`/`defaultOpenGroupKeys`/`OwnerGameHistoryRow` family; keep
what Results and rewards still import — grep before deleting). Update CLAUDE.md (short "Partner Results page" section
replacing the scattered Game Results notes), AGENTS.md ("Add a competition to Results" checklist), compare real usage with
plan §6. Plan names **Sonnet 5.5, effort medium**. Out of scope: new competitions, any behaviour change.

### 2. Starting state
- Branch `main`; Phase 4 is one local commit on top of Phase 3 (`f380237`) — see `git log -3`. **Not pushed, not
  deployed.** No migrations, no data changes (nothing touched production; the browser pass used fake routes).
- The working tree still has **other people's uncommitted changes** (Category Blitz, schedule rows,
  `lib/gameOnboarding.ts`, `tests/game-tutorial-once-a-day.test.ts`, …). Stage only your own files.
- The old `GameResultsSheet.tsx` is now **dead code** (nothing imports it) but still compiles and its test still passes.

### 3. Decisions already made (don't re-ask)
- Andrew's R1–R4 (plan §2); sheet id stays `history`; steps are `game`, `player`, `reward` (list = no step).
- No tabs, no filter chips. Competition label/unit only from `lib/results/competitions.ts`.
- Week-reward row sits **after the days** of its week (plan §4 wireframe); it is placed in the week group that contains the
  reward's own `date`.
- Search text lives in the sheet (kept when going to a player and back); it resets when a different game is opened.
- Tapping a reward from a game's screen/card opens the existing reward detail (all of that reward's cycles), unchanged from
  the old Rewards tab. It does not highlight the tapped cycle.

### 4. Files created / changed
New:
- `lib/results/resultsDisplay.ts` (pure, client-safe): `groupResultsTimeline(games, rewards, {byYear, completeFrom})` →
  Year→Month→Week→Day with `ResultsDayEntry` = game (+ its card rewards) or a reward row, plus `weekRewards`;
  `defaultOpenResultsKeys`, `groupCountLabel` ("3 games" / "1+ games" / "1 reward"), `scoreLabel`, `rewardWinnerInline`,
  `rewardWinnersLine`, `matchesPlayerSearch`, `rewardItemKey`. A reward naming a game not on the page becomes a day row
  (never dropped). `completeFrom` = the last page's `nextBefore`: groups starting before it show open-ended counts.
- `components/owner/results/`: `ResultsSheet.tsx` (state machine, URL step mirroring, fetching), `ResultsGameCard.tsx`,
  `ResultsRewardRow.tsx`, `GameStandingsScreen.tsx` (search + full standings + "Rewards won at this game"),
  `PlayerBreakdownScreen.tsx`, `RewardDetailScreen.tsx` (copy of the old reward detail), `resultsApi.ts` (URL builders,
  `getJson`, `pick*` parsers, `useLoaded` hook = one read per tap, `nonce` re-reads on every tap), `resultsUi.tsx` (shared
  classes, `GroupHeader`, `ShowMore`, `ListError`, `BARE_BUTTON_CLASS`).
- Tests: `tests/lib.results-display.test.ts` (7), `tests/components.owner-results-sheet.test.ts` (8).
Changed:
- `app/owner/dashboard/page.tsx`: `HistorySheetHost` renders `ResultsSheet` (import swapped).
- `lib/ownerHistoryDisplay.ts`: only added `export` to `MONTH_NAMES, dayMs, isoOf, DAY, mondayOf, lastDayOfMonth, weekRangeLabel`
  (so Results reuses them instead of copying). Nothing else changed.
- `tests/owner-menu-contract.test.ts`: points at `ResultsSheet`.
- `docs/partner-dashboard-app-redesign-device-checklist.md`: new section **J**.
- `docs/partner-results-page-plan.md`: status line.

### 5. Facts and traps
- **Global button CSS (`app/globals.css` ~L1037):** every bare `<button>` gets a 12%-white border, 12px radius and a 36px min
  height; on ≤380px phones left/right padding is forced with `!important`. A button INSIDE a bordered card/list therefore needs
  `BARE_BUTTON_CLASS` (`!border-0 !rounded-none [&:not(:disabled)]:!p-0 …`) with the padding on a child `div`. Without it the
  first browser pass showed double borders and a mis-aligned score. Plain `p-3`/`border-0` utilities lose to the global rule.
- The component test's `Host` fakes `useOwnerSheet`; `SlideSteps` plays a ~120 ms exit before the new step enters, so assert
  after Back with `findBy…`, not `getBy…`.
- A comment containing the text `router.push` fails `tests/owner-menu-contract.test.ts` (it greps the sheet source). Say "the
  router is never used for a step".
- A reward-only older week starts folded shut like any older week (only the newest year/month/week open).
- The registry contract test scans `components/owner/results/` for competition ids as string literals: none appear.
  Test fixtures use `"live_trivia"` only in test files.
- Browser testing recipe that worked (Andrew's `next dev` is on :3000, never touch it): `rsync -a` the repo into the
  scratchpad with anchored excludes (`/node_modules /.next /.git /.env* /native /docs /assets`), `cp -Rc node_modules`, run
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npx next dev --webpack -p 3107` in the clone
  (no `.env.local` ⇒ no real DB/Stripe), and drive `/owner/dashboard?sheet=history` with Playwright `page.route("**/api/**")`
  fakes (`/api/owner/dashboard` needs `{ok, venues:[{id,name}], venueId, schedules:{ok,items:[]}, competitions:{ok,items:[]},
  posAttentionVenueIds:[]}`). Kill only the PID you started; delete the clone.

### 6. Build / test
`npx tsc --noEmit` clean · `npm run lint` clean · `npm run test` **4,771 passed, 13 skipped, 0 failed** (includes the
text-size-floor, registry-contract, privacy-contract and owner-menu contracts) · `npm run build` succeeded. Run one after
another, never typecheck and build together.
Browser pass (390×844, fake data, 2026-10-16): timeline (2 months, a week row, a reward-only/day row, folded older week),
game screen (14 standings incl. a long username and a deleted player), search, player breakdown, reward detail. Requests
seen: exactly 1 timeline read on open, then 1 per tap (game, breakdown by `entry`, reward). Phone Back: player → game →
list; reward opened from a game goes back to the game; reload on `step=player` corrects to the list.
**Not verified:** a real partner session against the real routes/data (Phases 2–3 verified the routes on production
read-only); a real phone (Andrew's checklist J); the timeline with a large real history (paging was tested with fixtures).

### 7. Open questions for Andrew
1. (Phase 2, still open.) Single-night weekly rewards (General Saloon "Saturday" / "Sunday Challenge"): keep as a row at the
   end of the week (current), or put them on that night's game card when the night has exactly one game? One-rule change in
   `placeCycle` (`lib/results/rewardPlacement.ts`).
2. When to push/deploy Phase 4 (his call).

### 8. Recommended first steps for Phase 5
Wait for Andrew's "deployed and good". Then `git grep -n "GameResultsSheet\|ownerHistory\b\|OwnerGameHistoryRow\|groupGameHistory"`,
delete in that order (component+test → old routes+their tests → unused lib code), keep `/history/rewards/[rewardId]`, run
`tsc`, `lint`, `test`, `build`, then write the CLAUDE.md/AGENTS.md notes and compare real usage with plan §6.
