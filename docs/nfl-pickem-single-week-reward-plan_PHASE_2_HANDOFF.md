# Single-week NFL reward — Phase 2 handoff (server: context, creation, resolver, accrual, won-lines)

Written 2026-10-12. Plan: `docs/nfl-pickem-single-week-reward-plan.md`. Previous note:
`docs/nfl-pickem-single-week-reward-plan_PHASE_1_HANDOFF.md`.

## For Andrew (plain English)

The server side of "Single week" is finished. The server can now:

- work out which NFL weeks a partner may choose (only weeks whose first game hasn't kicked off, no
  preseason, and only weeks that have games);
- create a Single-week reward safely. It refuses a week that has started, a week that doesn't
  exist, another season's week, a picks target higher than the number of games that week, and more
  than 1 prize for "most picks";
- pay the right guest for that week, then switch the reward off (one contest, one prize);
- count only that week's picks toward a picks target, Monday Night Football included;
- tell guests "Starts Thu, Nov 5" before the week begins, and "…in Week 9" on the won coupon.

Partners can't use it yet. There's no "Single week" button in the Create Reward screen until
Phase 4, and the guest wording is Phase 3's job. **Nothing is committed, pushed or deployed.** You
already applied the database change (`supabase db push`); I confirmed migration `20261012200725`
shows as applied on the live project. All checks pass: typecheck, lint, and 4,152 tests.

**One thing I changed that you didn't ask for (it fixes a real money bug):** the rewards engine
had no start date for one-off rewards. Without the fix, a "Week 9" picks-target reward made in Week 6
would have counted guests' Week 6–8 picks, and it would also have missed Monday Night Football
picks. Now the NFL sweep gives the engine the exact NFL week window (Tuesday to Tuesday). This only
applies to Single-week rewards. Every other reward behaves exactly as before.

**Two older issues I found but did not fix.** Fixing them would change how "Every week" and "Whole
season" work, which this plan rules out. They're listed in §7 for you to decide on.

---

## For the next agent (Phase 3 — guest and partner wording; plan says Sonnet 5.5, medium effort)

### 1. Goal and scope

Phase 3 of the plan (§4): single-week templates in `lib/rewardDefinitions.ts`
(`mostPicksSingleWeek`, `picksTargetSingleWeek`, `{week}` placeholder), the single-week branches
in `lib/rewardDescription.ts` (summary / when / fineprint / "ended" state / won-line), a review of
`describeNFLWeekScope`'s single-week sentences (Phase 1 already wrote them), the Partner Manual's
NFL rewards section, and any partner/admin reward-list label that names the scope.

**Out of scope:** the wizard UI (Phase 4), review/release (Phase 5), week ranges, editing an
existing reward's week, and changing "Every week"/"Whole season" behaviour (including the two
pre-existing issues in §7).

### 2. Starting state

- Branch `main`, last commit `44fbc62` (unchanged since Phase 1). **Phases 1 and 2 are both
  uncommitted**, mixed in with unrelated uncommitted work from other tasks. Do NOT revert, commit
  or bundle those other files: `components/fantasy/FantasyHome.tsx`, `components/join/JoinFlow.tsx`,
  `components/nfl-pickem/*.tsx` (3 files), `components/venue/GameIdentityPanel.tsx`,
  `lib/email/*`, `lib/themeTokens.ts`, `scripts/preview-partner-emails.cjs`,
  `tests/components.player-pending.test.ts`, `tests/lib.email.*`, `.vscode/`, `assets/email-src/`,
  `public/brand/email/`, `scripts/build-partner-email-assets.cjs`.
- **Database:** migration `supabase/migrations/20261012200725_nfl_week_scope_single_week.sql` IS
  applied to linked project `pkmxupsayzshvpirkaav`. I checked this read-only with
  `supabase migration list --linked`: local and remote both list `20261012200725`. No data was
  written in Phase 2. My only production access was one read-only `select` of `nfl_pickem_weeks`
  and the NFL `challenge_campaigns` rows, run from a temporary script (since deleted). The only NFL
  reward in production is one **weekly** most-picks reward (`ceceade0-…`, active).
- Nothing deployed. The DB constraint is live, so deploying this code is safe in either order now.

### 3. Decisions already made (don't re-ask)

D1–D5 as recorded in the plan §2 (Andrew chose every recommendation, 2026-10-12). Phase 2 took
these implementation decisions:

- **Selectable week = first kickoff not reached.** It uses `nfl_pickem_weeks.thursday_kickoff`
  (despite the name, it is the week's *earliest* kickoff). If that value is null or can't be parsed,
  it falls back to `week_start_date > today` on the Eastern calendar. It does **not** use `status`
  (see §5).
- **The client's week number is honoured only if it is on the server's freshly built list.** If it
  isn't, the request is refused with `NFL_SINGLE_WEEK_INVALID_MESSAGE` (a `RewardTermsError`, so
  the routes answer 400). The server never moves the request to a different week. A week from
  another season is refused the same way. The dates and game count always come from the server's
  row.
- **Stored engine shape** for a single-week reward: `recurringType "none"`, `scheduleType
  "single_day"`, Thursday-first all-7 `activeDays`, `startDate`/`endDate` = the week's stored
  `week_start_date`/`week_end_date` (Thu→Mon), quota 1 (most picks) or N (picks target).
- **Accrual uses the exact NFL week span** (Tue 05:00 UTC → next Tue 05:00 UTC, `nflWeekSpanMs`).
  This is the same span the leaderboard and the most-picks resolver read, so both win conditions
  count the same picks (§4, §5).
- A single-week reward is **resolved by that week's weekly contest**. It is never decided by the
  season contest or a neighbouring week, and it is spent (deactivated) after its award, like a
  season reward.

### 4. Files changed in Phase 2 and how they fit together

- `lib/nflPickEmRewardWeeks.ts` (client-safe):
  - new `NFLSelectableWeekSource` type, `formatNFLSelectableWeekLabel()`
    (`"Week 8 · Oct 29 – Nov 2"`; a postseason week keeps a stored `display_label`, e.g.
    `"Wild Card · Jan 14 – Jan 18"`);
  - new `buildNFLSelectableWeeks(weeks, now)`, the pure D1/D2 rule;
  - updated the `selectableWeeks` doc. The field is still optional in the type: an older server's
    response simply lacks it.
- `lib/rewards.ts`:
  - `resolveNFLSeasonContext` adds `selectableWeeks: buildNFLSelectableWeeks(weeks, now)` from the
    **same** `listNFLWeeks` read, so there is no new query. The context is still `null` when no weeks
    remain. When weeks remain but none are selectable, `selectableWeeks` is `[]`, and Phase 4 hides
    only the Single-week card.
  - `createReward` has a `single_week` branch. It looks up the requested week in
    `context.nflSeason.selectableWeeks`, then calls `deriveNFLWeekScopeTerms` with that week's
    dates, `gamesCount` and the picks-target `threshold`, which enforces the D3 cap (Phase 1 logic).
  - `attachRewardWinDescriptions`: for a single-week coupon, `nflWeekNumber = scope.week` with no
    week lookup. This is needed because a picks-target coupon's `cycle_start` is the one-off epoch
    `1970-01-01`, so the date can't be turned into a week.
  - `applyNFLRewardUpcomingState` needed no change: Phase 1's `resolveNFLRewardStartDate` already
    returns the campaign's own `startDate` for a single week.
- `lib/challengeCampaigns.ts` (engine; additive, off by default):
  - new exported type `CampaignAccrualWindow`;
  - new exported `isCampaignEligibleForAccrual(campaign, occurredAt, gameType, tz, window)`. With
    `window === null` it is exactly the old `isCampaignEligibleAtTime`. With a window, the window
    replaces the date, weekday and time-of-day checks; active, unresolved and game-type checks
    still apply. A NaN bound fails closed.
  - `applyChallengeCampaignPoints` takes an optional `accrualWindowFor(campaign)`. Only the NFL
    sweep passes it.
- `lib/nflPickEmRewardAccrual.ts`:
  - new exported `nflSingleWeekAccrualWindow(campaign)`. It returns `nflWeekSpanMs({weekStartDate:
    campaign.startDate})` for a single-week reward, `null` for any other reward, and NaN bounds if
    `startDate` is missing or malformed (fail closed);
  - the sweep passes it as `accrualWindowFor`.
- `lib/nflPickEmWinnerRewards.ts`:
  - new exported `isOneOffNFLReward(campaign)` (season or single_week);
  - new exported `nflRewardAppliesToWeek(campaign, week)` (a single week matches only its own
    season+week; other scopes return `true`, so their behaviour is unchanged);
  - `campaignCoversContest` maps `single_week` to the weekly contest with
    `week.weekNumber === scope.week`;
  - the spend/deactivate branch now runs on `isOneOffNFLReward(campaign)` instead of
    `contest.kind === "season"`;
  - comments on `campaignWasLiveForContest` were updated.
- `app/api/nfl-pickem/rewards/route.ts` (guest banner/leaderboard):
  - winner lookup and `hasActiveGameWinnerReward` are filtered with `nflRewardAppliesToWeek`;
  - without this, a non-recurring reward's single cycle key matches every week, so the Week 9
    winner would be marked on every week's leaderboard, and the past-week "no winner (too few
    pickers)" note would appear for weeks the reward never covered;
  - it also saves one `listChallengeCycleWinners` read per other-week single-week reward.
- Routes `app/api/owner/rewards/route.ts` and `app/api/admin/route.ts`: confirmed they only pass
  `nflWeekScope` through and map `RewardTermsError`. No change needed.
- Tests:
  - `tests/lib.nfl-pickem-reward-weeks.test.ts`: `buildNFLSelectableWeeks` and the label, using
    real 2026 production rows as fixtures;
  - `tests/lib.rewards-definitions.test.ts`: context includes `selectableWeeks` with one read, and
    a new "createReward — NFL single week" block covering success for both win conditions, a
    started/forged week, an unknown week, another season, preseason, 0 games, the D3 cap at 15 vs 14
    games, quantity 2, and client-sent dates being ignored;
  - `tests/lib.nfl-pickem-winner-rewards.test.ts`: 7 resolver cases (own week only, never the
    season contest, spent once, Pacific venue, created after kickoff, below minimum stays active,
    other season) plus helper tests;
  - `tests/lib.nfl-pickem-reward-accrual.test.ts`: the sweep passes the window. Its `@/lib/nflPickEm`
    mock now also returns the real `nflWeekSpanMs`;
  - **new** `tests/lib.nfl-single-week-accrual-window.test.ts`: runs the real engine predicate for
    the plan's step 4. It checks MNF in, the weeks before and after out, the half-open boundaries,
    and pins the two gaps the window closes;
  - `tests/lib.rewards-nfl-upcoming.test.ts`: single-week "Starts Thu, Nov 5", live once started,
    no season-opener fallback, and won-lines "in Week 9" for both win conditions with no week read.

### 5. Facts and traps discovered

- **`nfl_pickem_weeks.status` is unreliable.** `update_nfl_week_status()` tests `locked` before
  `complete`, so every week whose kickoff has passed stays `locked` forever. Production Weeks 1–5
  all read `locked`. Never use it to mean "finished" or "selectable".
- **Some weeks start on a Wednesday evening.** Production's stored first kickoffs for 2026 Week 1
  (`2026-09-10T00:20Z`) and Week 12 (`2026-11-26T01:00Z`) are Wednesday evenings Eastern, before
  the Thursday `week_start_date`. That is why accrual uses the Tuesday-anchored `nflWeekSpanMs`
  rather than `week_start_date` at local midnight.
- **Engine gaps for one-off single-day rewards** (`isCampaignEligibleAtTime`, single-day path):
  there is **no start-date bound**, and the end bound is `${endDate}T23:59:59.999Z` in UTC, which
  is earlier than Monday Night Football (Tue ~01:15 UTC). Single-week rewards avoid both through
  `accrualWindowFor`. Don't remove that argument from the sweep:
  `tests/lib.nfl-single-week-accrual-window.test.ts` pins both gaps.
- **The resolver's close check doesn't depend on the venue's timezone.** Both
  `getCampaignCloseTimestampMs` and the contest's `endMs` are end-of-day UTC on stored dates, so a
  Pacific venue passes for its own week (tested). The cycle key does use the venue's timezone
  (Thursday local midnight, e.g. `2026-11-05T08:00Z` in Los Angeles). The resolver and the guest
  route both derive it through `computeCycleStart`, so they agree.
- **A one-off reward's cycle key matches every week.** `nflWinnerCycleStart` for a non-recurring
  reward ignores which week you ask about. Any new per-week reader must filter with
  `nflRewardAppliesToWeek` first.
- **The `{week}` placeholder is a number.** `scope.week` is the NFL week number (1–30; postseason
  rows would be 19+). Phase 3's "Week {week}" wording reads oddly for a postseason week ("Week 19").
  No postseason rows are synced yet. If they appear, Phase 3/4 may prefer the selectable week's
  `label`.
- **What guests see now (until Phase 3):** `describeReward` / `lib/rewardDescription.ts` treat a
  single-week reward like the season branch, so the summary reads "…season…" with an empty
  `{fromWeek}`. The "Starts …" line and the won-line are already correct. The frozen `rules`
  snapshot written at creation uses the same composer, so it will also be wrong for any reward
  created before Phase 3 ships. No such rewards can exist yet, because the wizard has no card.
- PGlite for `npm run test:nfl-week-scope-sql` lives at
  `tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite` (override with `NFL_SCOPE_PGLITE_MODULE`).
- Don't run typecheck and build at the same time (`.next/types`). The dev server shares the
  production DB: never create a real reward from it, and never `pkill next-server`.
- **Cost:** no new queries, cron jobs or tables. `selectableWeeks` reuses the existing
  `listNFLWeeks` read. The accrual window is computed in memory. The guest route now makes *fewer*
  winner reads.

### 6. How to build, run and test, and what was verified

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (the only output is the usual Babel note about `lib/sportsBingo.ts`).
- `npm run test`: 345 files passed / 1 skipped; **4,152 tests passed, 13 skipped, 0 failed**
  (Phase 1 had 4,113).
- `npm run test:nfl-week-scope-sql`: passes.
- `tests/supabase-migration-grants-contract.test.ts`: passes.
- **Not verified:**
  - `npm run build` (not run; the changes are server logic and types; Phase 5 runs the full gates);
  - any real-database exercise of creation, accrual or resolution (no reward was created; by
    design);
  - `tests/api.nfl-pickem.test.ts` covers the guest route only as a live-server test that is
    environment-gated and skipped, so the route change is covered by the unit tests of
    `nflRewardAppliesToWeek`.

### 7. Open questions for Andrew (pre-existing, outside this plan; for Phase 5 to raise)

1. **"Every week" picks-target rewards credit a Wednesday-evening game to the previous week.**
   Weekly cycles start at Thursday 00:00 venue time, so a Wednesday 8 PM ET opener (2026 Weeks 1
   and 12, as stored) lands in the prior week's cycle. "Most picks" is unaffected, because it uses
   the Tuesday-anchored span. This changes how "Every week" behaves, so it's a separate decision.
2. **"Whole season" rewards have the same two engine gaps.** They have no start bound (harmless
   today, because they start at the current week and creation time already bars earlier games). Their
   end bound is UTC Monday, so a final week with a Monday night game would drop that game. Week 18
   has none; the postseason isn't synced. They could reuse `accrualWindowFor` with a season span if
   wanted.
3. (Known before Phase 2) The season number is the calendar year (`now.getFullYear()`), so from
   January 1 the reward context looks at the next season and offers nothing. Week 18 of 2026
   (Jan 7–11, 2027) can therefore only be picked while it is still 2026.

### 8. Recommended first steps for Phase 3

1. Read plan §4 Phase 3, then `lib/rewardDescription.ts` `describeNFLReward` (~line 455) and the
   won-line block (~line 580; the single-week won-line already works through `nflWeekNumber`, but
   give it an explicit branch so it doesn't depend on fall-through).
2. Add the two templates and the `{week}` placeholder to `lib/rewardDefinitions.ts`
   (`nfl_pickem_challenge.description`), update `tests/lib.rewards-definitions.test.ts`, then
   write the single-week summary/when/fineprint and an "ended" state (today on the Eastern calendar
   after the campaign's `endDate`).
3. Re-check `describeNFLWeekScope` wording, the Partner Manual (`grep -rn "Whole season" components
   lib docs`), and any reward-list scope label.
4. Run the gates, write `docs/nfl-pickem-single-week-reward-plan_PHASE_3_HANDOFF.md`, and update the
   plan's Status line.
