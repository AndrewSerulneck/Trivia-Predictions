# Squares + Brackets — Phase 4 handoff (Squares Prizes + Results page)

**Date:** 2026-10-19 (Mon, ~09:30 ET). **Plan:** `docs/squares-and-brackets-plan.md` (§4 Phase 4, §12 as built).
**Next:** Phase 5 (Squares TV view), Sonnet 5.5 · medium.

## For Andrew (plain English)

- **What changed:** a partner can now offer a Prize for Super Bowl Squares. In "Create Prize" they pick **Super Bowl
  Squares**, tick which moments pay (end of Q1, halftime, end of Q3, final — any mix), pick the prize, and confirm.
  There's no points target and no "minimum players" question. At each ticked moment, whoever holds that venue's winning
  square gets the prize as an ordinary coupon in their Prize wallet ("You held the winning Super Bowl square at
  halftime"). If nobody holds the winning square, nobody gets that one, the same as the points rule you chose.
- **Results page:** Super Bowl Squares now appears on the Partner Dashboard's Results page as one game card per season
  (for example "Super Bowl Squares · Patriots vs Seahawks"), with the winners, how many players held squares, and each
  moment's Prize listed on the card. Tapping it shows who won points, with usernames and points only.
- **Is it live?** No. The Squares switch is still off, so partners don't see the Squares option and Results shows
  nothing for it. **The database change is applied** (you approved it), and Phase 4 is committed locally on `main`.
  Nothing is pushed or deployed.
- **Scoring corrections (your choice, 2026-10-19: "take back if unused"):** if an admin voids and re-grades a quarter,
  the corrected winner gets the prize. The first winner's coupon is taken back if it hasn't been used yet, and they get
  a short notice explaining the score correction. A coupon that was already used is kept (the guest already has it).
- **Needs you:** nothing. You approved applying the database change and committing; see §2 for what was done.
- **Cost:** close to zero. The every-minute Squares job does two tiny extra database reads per run during the game
  window (normally they find nothing). When a quarter is graded, it does one prize lookup plus one award per venue that
  has a winner and a Prize for that quarter. Results is read only when a partner opens it: one extra read when the venue
  has no Squares board, four when it does. No new cron, no new subscription.

---

## For the next agent

### 1. Next phase goal and scope
**Phase 5 — Squares TV view (plan §4):** during the event window the venue screen shows the grid, digits, live score,
leading square and moment winners; it replaces the idle attract screen; scheduled Live Trivia still wins. Reuse the
existing screen status polling, no new per-TV request loop (plan §6). Read `lib/squaresView.ts` (all screen rules) and
`lib/squaresScore.ts` (the CDN-cached shared score) first, and follow `components/venue-screen/*` conventions (inline
`style` allowed there for dynamic values, `lib/venueScreenBrand.ts` tokens).
**Out of scope for Phase 5:** prizes (done here), turning the flag on, the rehearsal (Phase 6), Brackets.

### 2. Starting state
- Branch `main`. Phase 4 is ONE local commit right after `0565068` (Phase 3); see `git log --oneline -3`. Nothing
  pushed or deployed.
- **Uncommitted, NOT mine — don't touch or stage:** `docs/pos-rewards-integration-plan.md`,
  `docs/rewards-trust-and-pos-roadmap.md`, `lib/pos/providers.ts`, and the first `CLAUDE.md` hunk (Andrew's POS/Toast
  note near "POS Rewards Integration"). `CLAUDE.md` also holds my two Phase 4 edits (the Results "Registered:" line and
  the "Squares Prizes + Results" bullet). Stage mine only with a hunk patch (`git diff -U3 CLAUDE.md`, keep the
  Squares/Results hunks, `git apply --cached`).
- **Database:** migration `20261019131139_squares_prizes.sql` was **APPLIED** to `pkmxupsayzshvpirkaav` on 2026-10-19
  ~09:37 ET with `supabase db push` (Andrew's explicit OK; the dry run listed only this file). Before: read-only, all
  10 `challenge_campaigns` rows' game types were inside the new allowed list. After, verified read-only: 10 rows read,
  `squares_moments` exists (none set), `squares_results.prize_checked_at` and `prize_withdrawn_at` exist, and
  `squares_withdraw_prize_coupons` answers (called with a venue/user that match nothing: `{0, 0}`, changed nothing).
  No data written. Do not reapply or edit it.
- Flags: `NEXT_PUBLIC_SQUARES_ENABLED`, `SQUARES_REHEARSAL_ENABLED` absent (off).
- **Phase 0 live capture still running** (checked 09:28 ET): PIDs 71943 (game 1392308, WSH @ SF, kickoff
  2026-10-20T00:15Z) and 71944 (1392309, NE @ CHI, 2026-10-23T00:15Z) → `tests/fixtures/squares/nfl-live-capture-<id>.json`.
  The Phase 2 handoff §8 step 1 (read the capture, fix `quartersFinishedFromStatus`, record the real status strings in
  plan §8) is STILL TO DO. Prize timing depends on it (a moment's prize is awarded when the moment is graded).

### 3. Decisions made (don't re-ask)
Andrew's plan §1 (1–15). Mine, within the plan's remit:
- **Storage of "which moments pay":** a new column `challenge_campaigns.squares_moments text[]`, deliberately NOT in
  `CAMPAIGN_SELECT_COLUMNS`. Only Squares code selects it (`listActiveSquaresPrizeCampaigns`, `loadSquaresPrizeMoments`),
  so a deploy that runs ahead of the migration leaves every other prize read untouched. It is written only when set.
- **One cycle per moment.** `squaresPrizeCycleStart(kickoffAt, moment, gradeNo)` = kickoff floored to the minute +
  moment position (1–4) **seconds** + grade_no **milliseconds**. `award_cycle_winner(..., quota 1)` then gives exactly
  one coupon per moment per prize. One player can win several moments (the ledger is unique per cycle). The moment is
  read back from the key (`squaresPrizeMomentOf`) for the coupon's wording and the Results label. Kickoff never changes
  after the draw, and prizes are only awarded after it.
- **Void + re-grade (Andrew, 2026-10-19: "take back if unused"):** new grade = new cycle → the corrected winner is paid
  by `awardSquaresPrizes`. `withdrawVoidedSquaresPrizes` then calls RPC `squares_withdraw_prize_coupons(venue, cycle,
  user)` for each voided winning result that was already checked for prizes. In one transaction, under each Squares
  prize's `award_cycle_winner` lock for that cycle, it deletes the UNREDEEMED coupon(s)
  (`challenge_campaign_redemptions`) and their ledger rows (`challenge_cycle_winners`). A redeemed coupon (including one
  turned into a Square gift card, which counts as redeemed) is kept. A guest redeeming at the same instant is
  serialised by the row (conditional update vs conditional delete). Then it sends a notice
  (`squaresPrizeWithdrawnMessage`, best-effort) and stamps `squares_results.prize_withdrawn_at`. A voided row not yet
  checked for prizes is skipped: if an award for it is mid-flight it will stamp it, and the next run withdraws. The
  admin void now always runs `settleSquaresWinners` (re-grade or not), and its message counts coupons taken back.
  `pos_reward_applications.redemption_id` is `ON DELETE SET NULL`, so a deleted coupon never blocks.
- **Which prizes pay a result** (`squaresPrizeCoversEvent` + the list query): active (archiving stops a prize), at the
  board's venue, covering that moment, `created_at` **before the lock**, and not closed before kickoff (an old season's
  prize never pays a new season's game). Prizes are **never auto-deactivated**: the venue hub shows inactive prizes
  anyway, and deactivating would block a later void + re-grade.
- **Gate:** offered in the wizard while `isSquaresPrizeOffered(now)` (flag on and Eastern date ≤ Feb 15, 2027). The
  server additionally refuses once the event's `drawn_at` is set or `lock_at` has passed, and fails closed if the event
  read fails (`resolveSquaresPrizeContext` in `lib/rewards.ts`; refusal → 409, the same as the NFL season message).
- **Prize shape:** one-off (`recurring_type 'none'`), `winner_quota` = moments chosen, `active_days []`,
  `points_required_to_win` 1 (sentinel), `end_date` = `SEASONAL_GAME_WINDOWS.squares.closesAfter` (2027-02-15),
  `game_types ['squares']`. `createSquaresReward` refuses (400, `RewardTermsError`): any win condition but
  `game_winner`, a minimum, a place ladder, or no / unknown moments.
- **Wizard:** Squares skips "How is this prize won?" and the points target. Its terms step is "Which moments pay a
  prize?" with four chips, **nothing pre-selected** (Next stays off until one is picked; same spirit as the Players step
  D1). `offersMinPlayers` is false for Squares, so the Players step never shows. Confirm shows "Pays at" and
  `describeSquaresPrizeTerms`.
- **`'squares'` is a valid campaign game type but NOT part of the "every game" default** (`ALL_GAMES_DEFAULT` in
  `lib/challengeCampaigns.ts`). Squares points are seasonal credits that never accrue to a campaign, and keeping it out
  means an admin-created campaign with no game types still inserts before the migration is applied.
- **Venue Prizes panel:** for a Squares prize, the snapshot counts **every** ledger row (not only the latest cycle's),
  so a guest who won Q1 still sees their coupon after someone else wins the final, and "All 2 claimed" works.
- **Results:** `squares` registered with label `SQUARES_GAME_NAME`, `hasBreakdown: false` (no entry tokens at all). One
  game per season per venue, `gameKey` = event id, listed only once kickoff has passed, `inProgress` until the event is
  `completed_at` (names nobody while in progress, like Live Trivia). Score = venue points paid at that venue
  (unvoided `squares_results`); "players" = distinct claimants. **Inert with the flag off** (no read, 404s), which also
  means turning the flag off after a season hides past Squares games on Results; revisit in Phase 11 if the flag is
  ever turned off.

### 4. Files created or changed
New:
- `supabase/migrations/20261019131139_squares_prizes.sql`. Game types constraint, `squares_moments` +
  `squares_moments_valid(text[])` (a function, because a CHECK can't hold a subquery), `squares_results.prize_checked_at`
  + `squares_results_prize_unchecked_idx`, `squares_results.prize_withdrawn_at` + `squares_results_prize_withdraw_idx`,
  RPC `squares_withdraw_prize_coupons(text, timestamptz, uuid)` (service_role only).
- `lib/squaresPrizes.ts` (pure, client-safe): `SQUARES_PRIZE_DEFINITION_ID`, messages, `normalizeSquaresMoments`,
  `describeSquaresPrizeMoments`, `describeSquaresPrizeTerms`, `isSquaresPrizeOffered`, `squaresPrizeCycleStart`,
  `squaresPrizeMomentOf`, `SQUARES_PRIZE_MOMENT_PHRASES`.
- `lib/squaresPrizeAwards.ts` (server-only): `awardSquaresPrizes(event, report, now)`, `squaresPrizeCoversEvent`,
  `withdrawVoidedSquaresPrizes(event, report, now)`, `squaresPrizeWithdrawnMessage`.
- `lib/results/adapters/squares.ts`: `squaresResultsAdapter` (`listGames`, `getStandings`).
- Tests: `tests/lib.squares-prizes.test.ts` (17), `tests/lib.squares-prize-awards.test.ts` (17),
  `tests/lib.results-squares-adapter.test.ts` (8); added cases in `tests/components.create-reward-wizard.test.ts` (+3)
  and `tests/lib.rewards-cycle-snapshot.test.ts` (+2); Phase 4 checks appended to `scripts/test-squares-sql.cjs`.
Changed:
- `lib/rewardDefinitions.ts`: the definition, the `super_bowl_squares` description shape, `offeredRewardDefinitions()`.
- `lib/rewardDescription.ts`: `describeSquaresReward` + the win line (`squaresMoments` in the input type).
- `lib/rewards.ts`: `RewardSquaresContext`, the Squares context branch, `createSquaresReward`,
  `REWARD_SQUARES_UNAVAILABLE_MESSAGE` / `REWARD_SQUARES_WIN_CONDITION_MESSAGE`, and `attachRewardDescriptions` loading
  moments (`loadSquaresMoments`, cached 10 min with `cachedReads`), attaching `squaresMoments` to each Squares prize.
- `lib/challengeCampaigns.ts`: `'squares'` in `VALID_GAME_TYPES` (+ `ALL_GAMES_DEFAULT`), the `squaresMoments` insert,
  the snapshot's Squares branch, `listActiveSquaresPrizeCampaigns`, `loadSquaresPrizeMoments`.
- `lib/squaresSettlement.ts`: `settleSquaresWinners` (points, then prizes, then withdrawals) replaces the bare
  `payUnpaidSquaresResults` calls. `lib/squaresAdmin.ts` uses it for admin grade and after every void.
- `lib/results/competitions.ts`, `lib/results/adapters/index.ts`, `lib/results/rewardPlacement.ts` (the Squares rule:
  the game card on the cycle's local date, labelled with the moment, else a day row).
- `lib/results/resultsDisplay.ts` (`rewardTitleAt`), `components/owner/results/ResultsGameCard.tsx` and
  `GameStandingsScreen.tsx` (a repeated prize's lines name their cycle), `tests/lib.results-display.test.ts`.
- `lib/ownerHistoryDisplay.ts` (`rewardHowWonLabel` → "Winning square"), `lib/ownerRewardDisplay.ts`
  (`rewardTermsText` → `describeSquaresPrizeTerms`; the Live Trivia sentence would have been wrong).
- `components/rewards/CreateRewardWizard.tsx` (the Squares branches; `notScheduledIsNFL` renamed
  `notScheduledHasNoLink`), routes `app/api/owner/rewards/route.ts` and `app/api/admin/route.ts` (`squaresMoments`,
  409), `components/admin/sections/SquaresSection.tsx` (void copy), `types/index.ts` (`ChallengeCampaign.squaresMoments`),
  `lib/venueGameCards.ts` (`SQUARES_EVENT_NAME = "Super Bowl"`), `tests/squares-settlement.test.ts` (fake `.returns()`),
  `tests/results-privacy-contract.test.ts` (adapter added to the scanned files), `CLAUDE.md`, `AGENTS.md`, the plan.

### 5. Facts and traps
- **The literal "Super Bowl Squares" may appear in code only in `lib/venueGameCards.ts`** (`tests/seasonal-games.test.ts`).
  I tripped it once with an error message. Build copy from `SQUARES_GAME_NAME` / `SQUARES_EVENT_NAME`.
- PostgreSQL rejects a subquery inside a CHECK constraint: use an immutable SQL function (and grant it to `service_role`).
- `squares_results` rows embed their venue through `board:squares_boards(venue_id)` (many-to-one, so an object).
- The Results registry contract test runs every adapter under mocks with no flag: the Squares adapter must keep
  returning an empty page with the flag off, or `tests/results-registry-contract.test.ts` breaks.
- The settlement test's in-memory query builder needed a `returns()` method. Any new chained call in the settlement path
  needs the same there.
- `components/owner/results/*` now pulls `lib/venueGameCards.ts` (~12 KB source) through `competitions.ts` for the
  label, and so does the wizard through `rewardDefinitions.ts`. Not measured; small. `scripts/measure-owner-load.cjs` if
  it matters.
- A Squares prize card on the venue hub after the game: if a moment had no winner the card keeps "1 of N prizes left"
  (the quota can't fill). Partners can archive it; worth a look in the Phase 6 device pass.
- **iCloud duplicates generated files** (`.next/types/routes.d 2.ts`, `validator 2.ts`, `package 2.json`), which breaks
  `tsc` ("Duplicate identifier 'LayoutProps'"). They're generated, so delete them: `find .next/types -name "* 2*" -delete`.
- Playwright in the scratchpad: the cached browsers are `chromium_headless_shell-1234`; pass its `executablePath`
  instead of `npx playwright install`.
- Prize coupons expire 7 days after they are won (the shared `PRIZE_EXPIRY_MS`), so Feb 14 wins expire Feb 21.

### 6. Build / run / test (all 2026-10-19, all green)
- `npx tsc --noEmit` clean. `npm run lint` exit 0. `npm run test`: 415 files, **4,986 pass / 13 skipped / 0 fail**.
  `npm run build` passes. `npm run test:squares-sql` passes (now including the Phase 4 migration checks).
- **Browser check (2026-10-19, `/verify` before the commit):** a scratchpad copy of the repo on port 3100 with
  `NEXT_PUBLIC_SQUARES_ENABLED=true`, a dummy Supabase URL, and every `/api/**` faked in Playwright (no production call
  possible). At 350 px and 289 px: Partner Dashboard → Offer Prizes → "+ Offer another prize" → Super Bowl Squares →
  moments → prize → Confirm → Create, then Results → the Squares game → its screen. No sideways scroll, no text under
  12 px, no page errors; the POST body was exactly `{venueId, definitionId: "squares_challenge", cadence: "none",
  winCondition: "game_winner", threshold: 1, winnerQuota: 2, prize, squaresMoments: ["half","final"]}`. Found and fixed:
  the two Squares prize lines on the Results card were truncated identically ("Super Bowl Squares Challen…"), so
  `rewardTitleAt` (`lib/results/resultsDisplay.ts`, generic: it never names a competition) now shows a repeated prize's
  cycle label: "🎁 Halftime → ann" on the card, "Halftime · Super Bowl Squares Challenge" on the game screen. The copy and
  the server were removed afterwards (only my port-3100 process was stopped).
- **Not verified:** a real award end to end (no event exists yet;
  Phase 6 rehearsal on `venue-hightop-test` should create a Squares prize there and watch a coupon appear); the wizard
  and Results card on a real phone (browser-checked only, above); never call the real create route from a dev server,
  since dev shares the production DB.

### 7. Open questions for Andrew
None. Answered 2026-10-19: apply the migration (yes), void rule ("take back if unused"), commit Phase 4 (yes, local only).

### 8. Recommended first steps for Phase 5
1. If the capture files exist, do the quarter-rule check first (Phase 2 handoff §8.1). The TV view shows moment winners.
2. Read `components/venue-screen/VenueScreenClient.tsx` (how the screen picks a mode and polls) and plan §6's
   no-new-polling rule, then reuse `GET /api/squares/score` (CDN-cached) plus a board read only when the revision changes.
3. Don't touch the prize code. The TV can list moment winners from the board payload (`squaresMomentRows`).
Model: Sonnet 5.5, effort medium (plan §4).
