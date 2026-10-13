# Single-week NFL reward — Phase 1 handoff

## For Andrew (plain English)
Phase 1 is finished and invisible to guests and partners. The database rule and the code now *understand*
a third kind of NFL Pick 'Em reward ("Single week" — one chosen week, e.g. Week 9), but nothing can
create or run one yet; that is Phases 2–4. All your "Decisions for Andrew" answers were set to my
recommendations. **Nothing is committed, pushed, deployed or applied to Supabase.** One thing needs you
before the later phases ship: apply the new migration (`supabase db push`, which asks you first). It
is safe to apply any time (existing rewards are unaffected) and it must be live before the code that
creates single-week rewards is deployed. Checks: typecheck, lint and the full test suite (4,113 tests)
pass, plus a database-level test of the new rule.

## For the next agent (Phase 2 — server money path; plan says Opus 5.5, high effort)

**1. Goal/scope.** Do Phase 2 of `docs/nfl-pickem-single-week-reward-plan.md` §4 (selectableWeeks in
`resolveNFLSeasonContext`, `createReward` single_week branch, winner resolver, accrual test, won-lines /
upcoming state). Out of scope: wording (Phase 3), wizard UI (Phase 4), review/release (Phase 5), week
ranges, editing existing rewards.

**2. Starting state.** Branch `main`, last commit `44fbc62`. Phase 1 is **uncommitted**, alongside
unrelated uncommitted work from others (components/nfl-pickem/*, JoinFlow, partner emails,
`lib/themeTokens.ts`, `tests/components.player-pending.test.ts`, `.vscode/`, `assets/email-src/`…) —
do NOT revert or bundle those. Phase 1 files only: `supabase/migrations/20261012200725_nfl_week_scope_single_week.sql`,
`types/index.ts`, `lib/challengeCampaigns.ts`, `lib/nflPickEmRewardWeeks.ts`, `package.json` (one script
line), `scripts/test-nfl-week-scope-sql.cjs`, `tests/lib.nfl-pickem-reward-weeks.test.ts`,
`tests/lib.challenge-campaign-nfl-week-scope.test.ts`, the plan and this note. Migration NOT applied to
Supabase (`pkmxupsayzshvpirkaav`); no `db push` was run; no data touched.

**3. Decisions (Andrew picked all recommendations):** D1 only weeks whose first game hasn't kicked off;
D2 regular + postseason weeks with `gamesCount > 0`, no preseason; D3 refuse a picks-target above the
week's game count; D4 several single-week rewards at once allowed; D5 card "Single week" — "One contest
for the NFL week you choose.", list "Which week?" as `Week 9 · Oct 29 – Nov 2`.

**4. What was built (all in Phase 1):**
- Migration widens `challenge_campaigns_nfl_week_scope_shape` to accept `{kind:"single_week",season,week}`
  (drop + re-add; idempotent; comment updated). Original migration untouched.
- `NFLWeekScope` (types/index.ts) gained `{ kind: "single_week"; season; week }`.
- Both normalizers learned it: `normalizeNFLWeekScope` (`lib/nflPickEmRewardWeeks.ts`, validates week 1–30)
  and the private copy in `lib/challengeCampaigns.ts`.
- `lib/nflPickEmRewardWeeks.ts`: `NFL_REWARD_WEEK_SCOPE_KINDS` + `single_week`; new exported type
  `NFLRewardSelectableWeek` and **optional** `NFLRewardSeasonContext.selectableWeeks?` (Phase 2 fills it);
  `deriveNFLWeekScopeTerms` single-week branch = cadence `"none"`, Thursday-first activeDays, quota 1
  (most-picks, >1 refused) or N, `startDate`/`endDate` taken from `opts.startDate/endDate` (pass the
  week's `week_start_date`/`week_end_date`), and new opts `gamesCount` + `threshold` → refuses a
  picks-target above `gamesCount` via `nflSingleWeekThresholdTooHighMessage(week, gamesCount)` (D3).
  Pass BOTH or the cap is skipped. New `NFL_SINGLE_WEEK_INVALID_MESSAGE` (use for stale/started/unknown
  week). `NFL_WEEK_SCOPE_INVALID_MESSAGE` wording now mentions single week.
  `resolveNFLRewardStartDate` single_week → campaign `startDate` only (no season-first fallback).
  `describeNFLWeekScope` has single-week sentences (so Phase 3 step 3 is partly done; Phase 3 should
  review the wording).
- `scripts/test-nfl-week-scope-sql.cjs` + `npm run test:nfl-week-scope-sql`: PGlite test of the
  constraint (rejects `single_week` before the migration, accepts all 3 shapes + null after, rejects
  missing/string week, unknown kinds).

**5. Facts and traps.**
- Safe-by-inertness: the winner resolver (`lib/nflPickEmWinnerRewards.ts` ~line 304) does
  `if (scope.kind !== contest.kind) return false` and contest kinds are only `weekly|season`, so an
  existing/forged single_week reward simply never matches a contest today. Phase 2 must add the mapping
  (single_week → weekly contest with `week.weekNumber === scope.week`) AND the spent/deactivate branch
  (~line 678 `contest.kind === "season"`), plus check `campaignCoversContest` season-only line ~307.
  Note the scope key at ~555/562 is `${contest.kind}:${week.id}`.
- Also review `lib/rewards.ts` (week-number lookup ~632, `applyNFLRewardUpcomingState`,
  `resolveNFLSeasonContext`, `createReward`), `lib/rewardDescription.ts`, `lib/rewardTerms.ts`,
  `app/api/nfl-pickem/rewards/route.ts` — all mention the scope; tsc raised no errors (no exhaustive
  switches), so find them by grep, not by compiler.
- `scripts/test-*.cjs` need PGlite, which isn't a dependency: it lives at
  `tmp/bingo-phase4-pg/node_modules/@electric-sql/pglite` (default path in my script, relative to repo
  root; override with `NFL_SCOPE_PGLITE_MODULE`).
- Don't run typecheck and build concurrently (`.next/types`).
- Dev server shares the production DB; never create a real reward from it. Never `pkill next-server`.

**6. Verified:** `npx tsc --noEmit` clean; `npx eslint` on touched files clean; `npm run test` 344 files /
4,113 passed / 13 skipped; `npm run test:nfl-week-scope-sql` passes; grants contract test passes (no new
table). Not verified: the migration against real Supabase; `npm run build` (not run — types only changed).

**7. Open questions:** none for Andrew except applying the migration (he approves `db push`).

**8. First steps for Phase 2:** read plan §3–4; verify what `status: "open"` means in `listNFLWeeks` and
how `thursdayKickoff` is stored; build `selectableWeeks` (label like `Week 9 · Oct 29 – Nov 2`, Eastern
dates); wire `createReward` (re-derive from server list; pass dates, `gamesCount`, `threshold` into
`deriveNFLWeekScopeTerms`; map failures to `RewardTermsError`); then resolver + tests incl. the
Pacific-venue close-date case and the accrual-bounds test. Write `…_PHASE_2_HANDOFF.md` and update the
plan's Status line when done.
