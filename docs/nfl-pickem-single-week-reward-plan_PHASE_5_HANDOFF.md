# Single-week NFL reward — Phase 5 handoff (review, gates, docs; release pending)

Written 2026-10-12. Plan: `docs/nfl-pickem-single-week-reward-plan.md`. Previous: `…_PHASE_4_HANDOFF.md`.

## For Andrew (plain English)

The "Single week" NFL reward has been reviewed, four problems found in the review are fixed, and every
check passes: typecheck, lint, 4,161 tests, the database-rule test and a full production build.

**It is not live yet.** Nothing is committed, pushed or deployed. The database change is already live
(you applied it earlier). What's left is the release, and each step needs your OK:

1. **Commit and push** this plan's files only. The other uncommitted work in the folder (emails,
   JoinFlow and others) stays out. Pushing deploys the site.
2. After the deploy, on the live site, open the hidden test venue `venue-hightop-test` → Offer
   Rewards → NFL Pick 'Em Challenge → **Single week**. Pick an upcoming week, create the reward,
   check that guests see "Starts …", then archive it.

**One small behaviour change from the review.** Most weeks can still be picked until their first game
kicks off. But in weeks that open on a Wednesday night (Week 1, and Thanksgiving week, Week 12),
the list of games we store can miss an earlier Wednesday-afternoon game. If someone created a
"most picks" reward after that game had started, the prize would silently never be awarded. So
those weeks now drop off the list at the start of their week (Monday night, midnight Eastern)
rather than at their first game. For Week 12 this year, partners can pick it until 12:00 AM on
Tuesday, Nov 24, instead of 8 PM on Wednesday, Nov 25. Tell me if you'd rather keep the later
cutoff and accept that risk.

**Five questions for you, none blocking the release** (details in §7 below): three older issues
from Phase 2, plus two from the review.

## For the next agent (release steps; then maintenance)

### 1. Goal and scope

All that's left of the plan is plan §4 Phase 5 step 4, the release. Each step needs Andrew's OK:
commit/push → deploy → live smoke test at `venue-hightop-test` → archive the test reward. The
migration is already applied. Out of scope: week ranges, editing a reward's week, and the open
questions in §7. Those change "Every week" or "Whole season" behaviour, or are new product decisions.

### 2. Starting state

- Branch `main`, last commit `44fbc62`. Phases 1–5 are **uncommitted**.
- **Commit only these files:**
  - `supabase/migrations/20261012200725_nfl_week_scope_single_week.sql`
  - `types/index.ts`
  - `lib/challengeCampaigns.ts`, `lib/nflPickEmRewardWeeks.ts`, `lib/rewards.ts`,
    `lib/nflPickEmRewardAccrual.ts`, `lib/nflPickEmWinnerRewards.ts`
  - `app/api/nfl-pickem/rewards/route.ts`
  - `lib/rewardDefinitions.ts`, `lib/rewardDescription.ts`, `lib/partnerManual.ts`
  - `components/rewards/CreateRewardWizard.tsx`
  - `package.json` (one script line, `test:nfl-week-scope-sql`), `scripts/test-nfl-week-scope-sql.cjs`
  - Tests: `tests/lib.nfl-pickem-reward-weeks.test.ts`,
    `tests/lib.challenge-campaign-nfl-week-scope.test.ts`, `tests/lib.rewards-definitions.test.ts`,
    `tests/lib.nfl-pickem-winner-rewards.test.ts`, `tests/lib.nfl-pickem-reward-accrual.test.ts`,
    `tests/lib.nfl-single-week-accrual-window.test.ts`, `tests/lib.rewards-nfl-upcoming.test.ts`,
    `tests/lib.reward-description.test.ts`, `tests/components.create-reward-wizard.test.ts`
  - Docs: `CLAUDE.md`, `docs/nfl-pickem-reward-plan.md`, `docs/nfl-pickem-single-week-reward-plan.md`,
    and the five `…_PHASE_<N>_HANDOFF.md` notes
- **Not this plan's files; leave them out:** `components/fantasy/FantasyHome.tsx`,
  `components/join/JoinFlow.tsx`, `components/nfl-pickem/*.tsx`, `components/venue/GameIdentityPanel.tsx`,
  `lib/email/*`, `lib/themeTokens.ts`, `scripts/preview-partner-emails.cjs`,
  `tests/components.player-pending.test.ts`, `tests/lib.email.*`, `.vscode/`, `assets/email-src/`,
  `public/brand/email/`, `scripts/build-partner-email-assets.cjs`.
  - **Trap:** before committing, run `git diff` on each file in the commit list and confirm every hunk
    belongs to this plan. Phases 1–4 recorded those files as this plan's only, but other work could
    touch them later. Stage with `git add <paths>`, never `git add -A`.
- Database: migration `20261012200725` was applied to `pkmxupsayzshvpirkaav` and confirmed by
  Phase 2 (`supabase migration list --linked`). No data was written in any phase. Production has one
  NFL reward, a weekly most-picks reward (`ceceade0-…`).
- Deploy order is safe either way now, because the widened constraint is live.

### 3. Decisions already made

- D1–D5 (plan §2), plus the implementation decisions in the Phase 2 and Phase 4 handoffs.
- **Phase 5:** a week whose stored `thursday_kickoff` falls on a UTC Thursday closes for selection at
  its Tue 05:00 UTC span start (`selectableUntilMs` in `lib/nflPickEmRewardWeeks.ts`). Every other
  week closes at its stored kickoff. This is stricter than D1, never looser. I chose it because the
  sync stores the earliest *UTC-Thursday* game, which is not always the week's first game. Andrew can
  reverse it (see §7.5).
- The browser visual check was **not done**; see §6.

### 4. Review: findings and what was done

I ran `/code-review high` on the plan's files. It reported 9 findings:

| # | Finding | Verdict | Action |
|---|---------|---------|--------|
| 1 | Single-week matched by week number alone; a preseason Week N could collide | **Refuted.** `UNIQUE (season, week_number)` exists (restored by `20260728120000_nfl_pickem_weeks_unique_constraint.sql`), so two rows can't share a week number in one season | none |
| 2 | `thursday_kickoff` isn't always the first kickoff, so a started week could be offered | **Confirmed** (`syncNFLWeeks` ~`lib/nflPickEm.ts:2330`, `scripts/resync-nfl-weeks.cjs:203`) | `selectableUntilMs`, plus 2 tests in `tests/lib.nfl-pickem-reward-weeks.test.ts` (Week 12 rewritten; Christmas-Wednesday case added) |
| 3 | `nflSingleWeekAccrualWindow` used the strict normalizer while the engine loads leniently, so an odd stored week got no window and fell back to the leaky date gates | **Confirmed** (fails open only for hand-written rows) | It now checks the raw `kind`; a test was added in `tests/lib.nfl-single-week-accrual-window.test.ts` |
| 4 | A season reward's winner is marked on every week's leaderboard (one-off cycle key) | Pre-existing "Whole season" behaviour | Not changed; §7.4 |
| 5 | The banner keeps showing a single-week reward on every week, and one that never awards stays `is_active` forever | Pre-existing pattern for every one-off reward. The guest card already reads "Week N has ended." | Not changed; §7.4 |
| 6 | Two predicates decide a single-week reward's week | Valid (maintainability) | `campaignCoversContest` now calls `nflRewardAppliesToWeek` |
| 7 | Two scope normalizers | Accepted by design (plan Phase 1 step 3); the money effect is covered by fix 3 | none |
| 8 | CLAUDE.md said "weekly or season, only those two" | Valid | CLAUDE.md Rewards bullet updated |
| 9 | Wizard's Winners line could read "for the season" for single week | Valid (cosmetic) | The fallback is now "for that week"; "season" only for the season scope |

Not acted on: the Phase 4 note that the default target of 10 can be disabled-but-selected on a short
week. The red D3 message blocks Next until the partner picks a lower target, which is acceptable.

### 5. Facts and traps

- Everything in the Phase 2 handoff §5 still holds:
  - `status` is unreliable.
  - Some weeks open on a Wednesday.
  - The engine's single-day path has no start bound and ends at UTC Monday.
  - A one-off reward's cycle key matches every week.
- `thursday_kickoff`:
  - On a UTC Thursday, it is "the earliest UTC-Thursday game", **not** necessarily the week's first.
  - On any other UTC day, it is the true first game.
  - Thursday Night Football at 8:15 PM ET is UTC **Friday**, so ordinary weeks take the fallback
    branch and store their true first game.
- The admin snapshot tests didn't change, because they render with no `selectableWeeks`.
- Rollback (plan §5): archive any live single-week rewards before rolling the code back.

### 6. Build, run, test, and what was verified

- All passed after the fixes, run one at a time (never typecheck and build together):
  - `npx tsc --noEmit`: clean.
  - `npm run lint`: clean (only the usual `lib/sportsBingo.ts` Babel note).
  - `npm run test`: 345 files passed, 1 skipped; **4,161 tests passed, 13 skipped, 0 failed**.
  - `npm run test:nfl-week-scope-sql`: passes.
  - `npm run build`: succeeded.
- **Not verified:**
  - The on-screen check of the wizard: 360 px width, both tones, the 12 px floor by eye. No phase
    did it. The text-size contract test and the component tests pass. Andrew's live smoke test
    (release step 2) is the first real look. Check the third card and the "Which week?" select on
    a phone then.
  - Any real creation, accrual or award. That is by design; the dev server shares production.
  - `/verify` before the commit. The skill covers venue game pages, and this change is the reward
    wizard plus server logic. The guest-facing parts are the reward card wording and the NFL page
    banner, which `/verify` could drive on the NFL Pick 'Em page if wanted.

### 7. Open questions for Andrew (none block the release)

1. (Phase 2) **"Every week" picks-target rewards credit a Wednesday-evening game to the previous
   week.** Weekly cycles start at Thursday 00:00 venue time.
2. (Phase 2) **"Whole season" rewards have the engine's two date gaps.** They have no start bound,
   and the UTC-Monday end would drop a final-week Monday night game. Harmless today.
3. (Phase 2) **The season number is the calendar year.** From Jan 1 the reward context looks at
   next season, so Week 18 of 2026 can only be picked during 2026.
4. (Review) **Leftover display, pre-existing for one-off rewards:**
   - A season reward's winner shows on every week's leaderboard.
   - A single-week reward with no winner (under 3 pickers, or the picks-target quota not filled)
     stays active and visible, reading "Week N has ended.", until the partner archives it.
   - Auto-archiving after the week is possible. It must wait for the resolver's 48-hour no-final
     deadline and any pending tiebreaker, or it would cancel a real payout. So it's a separate,
     careful change.
5. (Review) **Keep the stricter cutoff for Wednesday-night weeks** (above), or go back to the
   stored kickoff and accept the rare never-paid risk?

### 8. Recommended next steps

1. Ask Andrew to approve commit + push. Then stage only the §2 list, commit with the repo's
   attribution lines, and push. Vercel deploys from `main`.
2. Confirm the deploy is live (e.g. `vercel ls` or the dashboard). Then Andrew runs the live smoke
   test at `venue-hightop-test` and archives the reward.
3. Record the release (commit hash, deploy, smoke-test result) on the plan's Status line.
4. Model and effort: any model at medium effort is fine for the release; it is mechanical.
