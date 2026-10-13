# NFL Pick 'Em reward — "Single week" option (plan)

**Status:** Phases 1–5 done 2026-10-12 (review fixes applied; all gates incl. build pass). **Uncommitted, not deployed**; migration `20261012200725` already applied. Decisions D1–D5 = the recommended answers (Andrew, 2026-10-12). Next: release (commit/push → deploy → live smoke test at `venue-hightop-test`), each step with Andrew's OK — read `docs/nfl-pickem-single-week-reward-plan_PHASE_5_HANDOFF.md`.

## 1. Goal

Today a partner creating an **NFL Pick 'Em Challenge** reward picks *How long it runs* from two
cards: **Every week** or **Whole season**. Add a third card, **Single week**, where the partner
chooses one specific NFL week (e.g. "Week 9 · Oct 29 – Nov 2"). The reward is one contest for
that week only — it starts when that week starts, is decided when that week's games are final,
and then ends on its own. Works for both win conditions:

- **Most correct picks** → 1 winner for that week (same 3-picker minimum + tiebreaker rules).
- **Picks target** → the first N guests to get X picks right *during that week* win.

Both hosts of the shared wizard get it (Partner Dashboard and admin Rewards), because
`components/rewards/CreateRewardWizard.tsx` is one component — do not fork it.

**Out of scope:** week *ranges* ("Weeks 12–16") stay rejected, as
`docs/nfl-pickem-reward-plan.md` decided; editing the week of an existing reward; changing how
"Every week" or "Whole season" behave; any repair of existing rewards.

## 2. Decisions for Andrew (**CONFIRMED 2026-10-12: Andrew chose all recommended answers**)

| # | Question | Recommended |
|---|----------|-------------|
| D1 | Which weeks can be picked? | Only weeks whose **first game hasn't kicked off yet**. The winner resolver already refuses to award a contest that started before the reward existed (`campaignWasLiveForContest`), so a started week would silently never pay a "most picks" winner. |
| D2 | Preseason / playoff weeks? | Every **regular-season and postseason** week that has games synced (`gamesCount > 0`); **no preseason** (matches the season reward's "regular season" wording). |
| D3 | Picks-target threshold larger than the week has games (e.g. "50 picks" in a 16-game week)? | **Refuse** with a clear message ("Week 9 has 14 games, so pick a target of 14 or fewer"). Today's "Every week" has the same hole; fixing that is a separate follow-up, not this plan. |
| D4 | Can a partner run several single-week rewards (Week 8 and Week 9) at once? | **Yes** — each is its own reward. |
| D5 | Card label + week picker wording | Card: **"Single week"** — "One contest for the NFL week you choose." Then a "Which week?" list showing `Week 9 · Oct 29 – Nov 2`. |

## 3. Design (how it fits the existing code)

**Stored shape** — `challenge_campaigns.nfl_week_scope` gains a third kind:
`{"kind": "single_week", "season": 2026, "week": 9}`.

**Engine terms** (derived, never trusted from the client, exactly like "Whole season"):
cadence `"none"`, `activeDays` = `NFL_REWARD_ACTIVE_DAYS` (Thursday first — unchanged rule),
`startDate` = that week's `week_start_date`, `endDate` = that week's `week_end_date`, quota =
1 for most-picks (refused, not clamped, if >1) or the partner's N for picks-target. With
cadence "none" and real dates, the engine already bounds point accrual to that week and closes
the reward after it — no change to `lib/nflPickEmRewardAccrual.ts` should be needed (verify with
a test, Phase 2).

**Winner resolution** (`lib/nflPickEmWinnerRewards.ts`): a `single_week` scope is covered by the
existing **weekly** contest whose `weekNumber === scope.week` (same standings, same
tiebreaker, same 3-picker minimum). Once awarded it is **spent** like a season reward
(`spentCampaignIds` + `isActive: false`). The cycle key still comes from `computeCycleStart`
(non-recurring → the campaign's `startDate`), so `app/api/nfl-pickem/rewards/route.ts`'s
`nflWinnerCycleStart` keeps finding the winner on that week's leaderboard.

**Which weeks are offered** — `NFLRewardSeasonContext` (client-safe, in
`lib/nflPickEmRewardWeeks.ts`) gains `selectableWeeks: Array<{ weekNumber, weekStartDate,
weekEndDate, label, gamesCount }>`, built by `resolveNFLSeasonContext` in `lib/rewards.ts` from
the `listNFLWeeks` read it **already does** — no new query. `createReward` re-validates the
submitted week against its own fresh copy of that list (like `validateGameWinnerSlots` does for
Live Trivia slots) and takes the dates from the server's row, never from the client.

**Cost:** zero new database reads per request, no new cron, no new table. The resolver loops
over the same contests it already builds. Net recurring cost change ≈ 0.

## 4. Phases

Each phase ends with a handoff note `docs/nfl-pickem-single-week-reward-plan_PHASE_<N>_HANDOFF.md`
and an update to the Status line above (global rule).

### Phase 1 — Stored shape, rules and migration · **Sonnet 5.5, medium effort**

1. New migration (`supabase migration new nfl_week_scope_single_week`): drop and re-add
   `challenge_campaigns_nfl_week_scope_shape` so it also accepts `kind = 'single_week'` with a
   numeric `week`; update the column comment. Never edit
   `20260727120000_rewards_nfl_week_scope.sql`. No new table → no grant needed, but run the
   grants contract test anyway.
2. `types/index.ts` — add `{ kind: "single_week"; season: number; week: number }` to `NFLWeekScope`.
3. **Two normalizers must both learn it** (trap: miss one and the reward reads back as "not an
   NFL reward"): `normalizeNFLWeekScope` in `lib/nflPickEmRewardWeeks.ts` *and* the private
   round-trip copy in `lib/challengeCampaigns.ts` (~line 420).
4. `lib/nflPickEmRewardWeeks.ts`: `NFL_REWARD_WEEK_SCOPE_KINDS` + `"single_week"`;
   `deriveNFLWeekScopeTerms` single-week branch (requires valid start/end dates, refuses
   otherwise); `resolveNFLRewardStartDate` (single week → campaign `startDate`);
   `NFLRewardSeasonContext.selectableWeeks` type; new message constants (invalid week, threshold
   too high per D3); update the header comment that says "There is no third shape".
5. Tests: extend `tests/lib.nfl-pickem-reward-weeks.test.ts` and
   `tests/lib.challenge-campaign-nfl-week-scope.test.ts`; add a PGlite or SQL-level check that the
   new constraint accepts the three valid shapes and rejects `single_week` without `week`.
6. **Do not `supabase db push`.** Andrew applies the migration (it must be live **before** any
   code that writes `single_week` is deployed — see §5).

### Phase 2 — Server: context, creation, resolver, won-lines · **Opus 5.5, high effort**

Money path (each winner is a real coupon), so highest care here.

1. `resolveNFLSeasonContext` (`lib/rewards.ts`): build `selectableWeeks` per D1/D2 from the
   existing `weeks` array (first kickoff = `thursdayKickoff`, fall back to `weekStartDate >
   today` in Eastern when null; verify what `status: "open"` means before relying on it).
   Note the context is `null` today when no weeks remain — keep that, and make the wizard hide
   only the Single-week card when `selectableWeeks` is empty.
2. `createReward`: accept `requested.kind === "single_week"`; look up `requested.week` in the
   server's `selectableWeeks` (refuse with a `RewardTermsError` if absent — stale tab, started
   week, wrong season); pass that week's dates to `deriveNFLWeekScopeTerms`; apply the D3
   threshold cap for picks-target. The owner route (`app/api/owner/rewards/route.ts`) and admin
   route (`app/api/admin/route.ts`) only pass `nflWeekScope` through — confirm no change needed.
3. Resolver (`lib/nflPickEmWinnerRewards.ts`): `campaignCoversContest` maps `single_week` →
   the weekly contest for that week number; mark spent + deactivate after award (reuse the
   season branch — generalise `contest.kind === "season"` to "the campaign is one-off").
   Check `campaignWasLiveForContest`'s close-date test (`contest.endMs > closeAtMs`): the week
   ends in Eastern time but the campaign's `endDate` closes in the venue's timezone — a
   Pacific/Mountain venue must not have its own week fail this check. Add a test for a
   Pacific venue.
4. Accrual: add a test proving a picks-target single-week reward counts picks only from that
   week (a pick the week before and after must not accrue).
5. Won-lines and upcoming state in `lib/rewards.ts` (~line 632, currently weekly-only week-number
   lookup) and `applyNFLRewardUpcomingState`: single week → "in Week 9" / "Starts Oct 29".
6. Tests: extend `tests/lib.nfl-pickem-winner-rewards.test.ts`,
   `tests/lib.nfl-pickem-reward-accrual.test.ts`, `tests/lib.rewards-nfl-upcoming.test.ts`, and
   the createReward tests (forged past week, unknown week, week from another season, threshold
   above game count, quantity >1 for most-picks).

### Phase 3 — Guest and partner wording · **Sonnet 5.5, medium effort**

1. `lib/rewardDefinitions.ts` (nfl_pickem_challenge `description`): add `mostPicksSingleWeek`
   ("Get the most NFL picks right in Week {week} and win {prize}.") and `picksTargetSingleWeek`
   ("Get {threshold} NFL picks right in Week {week} and win {prize}."); document `{week}` in the
   placeholder list; update `tests/lib.rewards-definitions.test.ts`.
2. `lib/rewardDescription.ts`: single-week summary / "when" / fineprint (tiebreaker = "Week 9's
   tiebreaker question"), the "ended" state once the week is over, and the won-line branch.
3. `describeNFLWeekScope` (confirm-screen readback) single-week sentences, keeping the 3-picker
   line.
4. Partner Manual NFL rewards section (find it with
   `grep -rn "Whole season" components lib docs`) and any partner/admin reward-list label that
   names the scope.
5. Tests: `tests/lib.reward-description.test.ts`, `tests/components.reward-descriptions-surfaces.test.ts`.

### Phase 4 — Create Reward wizard UI · **Sonnet 5.5, medium effort**

1. `components/rewards/CreateRewardWizard.tsx` (~line 948): third option card "Single week";
   grid becomes `sm:grid-cols-3` (check the 360 px phone width — likely stays one column there).
   Selecting it reveals a "Which week?" list of `selectableWeeks` (option cards or a native
   `<select>`; light owner sheet must use the `ht-light-surface` rules, no `!` utilities).
   Default to the first selectable week.
2. `nflScope` memo (~line 432) builds `{ kind: "single_week", season, week }`; terms preview
   (~line 448) passes that week's dates; "Winners" line → "1 winner for Week 9"; guest preview
   uses the Phase 3 composer; submit payloads (~lines 696, 769) unchanged in shape.
3. Picks-target threshold options above the chosen week's `gamesCount` are disabled with a
   one-line reason (D3) — server still refuses independently.
4. Text-size floor (12 px), both tones, admin snapshot tests: the admin host changes on purpose —
   update those snapshots deliberately and say so in the handoff.
5. Visual check from a **scratchpad clone with mocked routes** (never a real POST from a dev
   server — dev shares the production DB; never `pkill next-server`).

### Phase 5 — Review, release, docs · **Opus 5.5, high effort**

1. Run /code-review of Phases 1–4 (correctness of the money path first), fix findings.
2. Full gates: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build` (not
   typecheck and build at the same time).
3. Update `CLAUDE.md` (Rewards section says the week scope is "`weekly` or `season`, and only
   those two") and `docs/nfl-pickem-reward-plan.md` (record that single week was added
   2026-10 at Andrew's request; ranges still rejected).
4. Release order (Andrew runs or approves each): migration `db push` → commit/push → deploy →
   create a Single-week reward for an upcoming week at the hidden test venue
   `venue-hightop-test`, confirm it shows "Starts …" to guests, then archive it.

## 5. Traps and risks

- **Deploy order:** the widened DB constraint must be live before the new code ships, or the
  first Single-week creation fails the check constraint. The reverse (migration live, old code)
  is harmless.
- **Rollback:** if the code is rolled back after single-week rewards exist, old code reads them
  as "not an NFL reward" — they stop resolving and lose their description. Before a rollback,
  archive any live single-week rewards.
- **Started weeks:** never offer a week whose first game has kicked off (D1), or most-picks
  rewards for it silently never pay.
- **Two normalizers** (Phase 1 step 3) and **the Thursday-first `activeDays`** literal.
- **Working tree at plan time** has uncommitted edits in `components/nfl-pickem/*`,
  `components/join/JoinFlow.tsx`, the partner emails and others from other work — don't revert
  or bundle them; commit only this plan's files.
