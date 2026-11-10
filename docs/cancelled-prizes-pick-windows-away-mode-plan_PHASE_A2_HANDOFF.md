# Phase A2 handoff: cancelling Live Trivia retires the prizes that relied on it

Plan: `docs/cancelled-prizes-pick-windows-away-mode-plan.md`. Phase A2 done 2026-11-09 by Claude Opus 5.5 (high effort),
as the plan's table names. In the same session, Phase A1 was committed and deployed at Andrew's request.

## For Andrew (plain English)

- **A1 is live.** Players no longer see ended prizes on Venue Home. It was committed as `f14c2449` and deployed to production
  on 2026-11-09. Pacific Street's public prize list is now empty, and Garden State Bar's is unchanged. The push also
  published your two waiting native-app commits (version 2.0.0, iOS location text). They only change files inside
  `native/`, so the website is unaffected.
- **What A2 changes:** when a partner or admin cancels, edits or moves a Live Trivia game, the prizes that depended on it
  (weekly 1st/2nd/3rd, "get N points", and older "win any game" prizes) are now ended automatically once the bar has **no Live
  Trivia game left** for them. First, any week or game already played is paid out, so nobody loses a prize they earned.
  Prizes already won stay in players' wallets. The partner sees one sentence after saving, e.g. "1 prize was retired
  because no Live Trivia games are left for it."
- **Never touched:** prizes that count several games (Riverside's three), prizes shared by more than one bar, and
  prizes pinned to specific games (those were already handled).
- **Your data today:** I re-checked production. Nothing would be ended right now (Garden State Bar's weekly prize still has
  its Wed/Thu/Fri game). No clean-up was needed and **no data was changed**.
- **Is it live?** No. A2 is **not committed or deployed**. It ships with Phase R or sooner if you ask.
- **Still needs you:** the `VENUE_PRESENCE_ENFORCEMENT` value (for Phase C1; how to find it is in §7 below).

## For the next agent (Phase A3: warn before cancel)

### 1. Next phase goal and scope
Phase A3 per the plan: a **dry-run** of the cascade (same function, no writes) behind
`GET /api/owner/schedule/[id]/cancel-impact` (owner auth + venue check first), mirrored on the admin route, and one line in
the in-sheet Cancel game confirmation (`components/owner/schedule/ScheduleStepScreens.tsx`), e.g. "Also ends: $50 gift card
for the winner." Shown only when something would end; the same for an edit that would end or shrink a prize. Copy minimal;
check at 350 px. Out of scope: C/B phases, any data change.

### 2. Starting state
- Branch `main`. **Committed + pushed + deployed:** `f14c2449` "Venue Home: hide retired prizes the viewer didn't win (Phase A1)"
  (plus the plan doc and the Phase 0 / A1 handoffs). Vercel production deployment
  `hightop-challenge-11enrbp22-andrewserulnecks-projects.vercel.app` is Ready. `origin/main` = `f14c2449`.
- **Uncommitted (A2):**
  - new `lib/liveTriviaScheduleSlots.ts`
  - new `tests/lib.reward-cascade-no-games-left.test.ts` (21 tests)
  - modified `lib/rewardGameSlotCascade.ts`, `lib/rewards.ts`, `lib/liveShowdownAdmin.ts`, `tests/lib.reward-slot-cascade.test.ts`
  - modified plan doc (status line + Standing rules) and this new handoff.
- Not mine, leave alone: `assets/app-store/google-play-screenshots-2026-11-09/`, `assets/app-store/venue-home-screenshots-2026-11-09/`, `output/`.
- No data changed, no migration, no env var. The production check was select-only (script:
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/16485af1-a092-45e5-a507-f3686e80abbc/scratchpad/a2-orphan-check.mts`,
  scratchpad, may be gone). No undo log needed.

### 3. Decisions already made
- Plan D1–D5, §4 defaults, Phase 0 P1–P4, A1's rule. Andrew (2026-11-09): commit and deploy A1 now (done). He doesn't
  know where to read `VENUE_PRESENCE_ENFORCEMENT` (instructions given; see §7).
- A2 rules, made in this phase from the code. They are now a Standing rule in the plan:
  - **Candidate:** active, winner null, `venue_ids` exactly `[this venue]`, game types Live Trivia **only** (all
    `live-trivia`, or empty with `reward_definition_id = live_trivia_challenge`), and not a slot-pinned `game_winner`. That
    covers `ranked_places`, `points_threshold`, and `game_winner` with null slots. `isRule4Candidate`.
  - **Has a game left** (`prizeHasGameLeft`, against the venue's live-or-upcoming games after the change):
    weekly places / every-game winner: any game (P2: every game counts toward the week); weekly places **pinned** to
    games: any of its pinned `{scheduleId, weekday}` slots still exists; points target: a game on one of its
    `active_days` (empty = any day). Points accrue only on `active_days` (`isCampaignEligibleAtTime`,
    `lib/challengeCampaigns.ts` ~l.950), which answers the P2 open point.
  - **Settle, then retire.** Both payout sweeps only pay active prizes (`listActiveRankedPlaceCampaigns`,
    `isLiveTriviaGameWinnerCampaign`). Before retiring a places or winner prize, the cascade runs the same idempotent sweeps
    the 5-minute cron runs (`resolveRankedPlaceRewards` / `resolveGameWinnerRewards`), so a partly played week (e.g. an
    earlier one-off at a one-off-only bar) is paid. If the sweep throws, or reports an error scoped to that prize,
    `schedules`/`settlements`, or a game at this venue, the prize is **kept active** and the report gets an error. A points
    target needs no settle (it pays as points accrue).
  - **Fail open:** schedule read fails → nothing retired, error per candidate. Retire = `is_active = false` only.

### 4. Files and how they fit
- `lib/liveTriviaScheduleSlots.ts` (new, pure leaf): `hasLiveOrUpcomingOccurrence`, `rewardRecurringType`,
  `toGameScheduleShapes`, `liveOrUpcomingGameSlots(schedules, now)`. These were **moved out of `lib/rewards.ts`**, which now
  imports them (behavior unchanged; `toGameScheduleShapes` is re-exported from `lib/rewards.ts`). The reason is that the cascade
  can't import `lib/rewards.ts` (`rewards → liveShowdownAdmin → cascade` cycle). It inlines `coerceRecurringType` as
  `windowRecurringType` for the same reason (`lib/ownerSchedule.ts` imports `liveShowdownAdmin`).
- `lib/rewardGameSlotCascade.ts`: header rule 4; `GameSlotCascadeReport.retiredNoGamesLeft: string[]`;
  `cascadeReportHasChanges` and `describeCascadeReport` include it ("N prize(s) was/were retired because no Live Trivia games are
  left for it/them."). After the rules 1–3 loop, `applyScheduleChangeToGameWinnerRewards` calls
  `retireLiveTriviaPrizesWithNoGamesLeft` → `isRule4Candidate` → one lazy `listVenueLiveShowdownSchedules([venueId], now)`
  (dynamic `import("@/lib/liveShowdownAdmin")`; only when a candidate exists; rows filtered to this venue) →
  `liveOrUpcomingGameSlots` → `prizeHasGameLeft` → `settleBeforeRetiring` (dynamic imports of the two sweeps) →
  `updateChallengeCampaign({ id, isActive: false })`. New optional param `now?: Date` (tests).
- `lib/liveShowdownAdmin.ts`: the transfer branch of `updateAdminLiveShowdownSchedule` also merges
  `transferCascade.retiredNoGamesLeft`. The delete and edit funnels are unchanged; they already call the cascade with the
  post-change state, and rule 4 reads the schedule **after** the write.
- UI: unchanged. `rewardNotice` in `app/api/owner/schedule/[id]/route.ts` (l.66, l.139) and `app/api/admin/route.ts` (l.1309,
  l.1865) already show `describeCascadeReport`, so the new sentence reaches owner and admin automatically.

### 5. Facts and traps
- **For A3's dry-run:** rule 4 has side effects beyond `updateChallengeCampaign`. It runs the **payout sweeps**. A dry-run
  must skip `settleBeforeRetiring` *and* the writes, and report would-be retirements. Thread a `dryRun` flag through
  `applyScheduleChangeToGameWinnerRewards` (rules 1–3 write via `updateChallengeCampaign` too). A dry-run *before* a delete must
  also simulate the change. The schedule read returns the venue's current schedules, so drop the schedule being cancelled
  (delete) or substitute its edited form (edit) before `liveOrUpcomingGameSlots`. Today rule 4 reads after the write, so
  it needs neither.
- A transfer (admin moves a schedule to another venue) runs the cascade twice: once for the new venue and once for the old
  one, with `survivingWeekdays: []`.
- `listChallengeCampaigns({ venueId })` may include campaigns for other venues or global ones. That's why the candidate check
  requires `venueIds` to be exactly `[venueId]`.
- `npx tsc --noEmit` prints errors from `.next/types/* 2.ts` Finder duplicates; filter with `grep -v "^\.next/"` (A1 §5).
- `tests/prizes-wording-contract.test.ts` flags any new on-screen-ish string containing "reward". Error messages count, which
  is why it says "Failed to retire prize."
- Running TS from a scratchpad script against production: `node --env-file=.env.local node_modules/.bin/tsx --tsconfig tsconfig.json <file>.mts`.
  Use a `.mts` file (top-level await), and import repo `.ts` modules with dynamic `import()` by absolute path and the `.default` fallback.
- Cost: rule 4 adds **nothing** for venues without a candidate prize. With one, it adds one `trivia_schedules` read per partner
  Live Trivia edit/delete/transfer (a few a day). The sweeps run only when a places/winner prize is about to be retired (rare),
  and each one equals one of the cron's 288 daily runs.

### 6. Build / run / test
- `npx vitest run tests/lib.reward-cascade-no-games-left.test.ts tests/lib.reward-slot-cascade.test.ts` (21 + 27 tests).
- Full: `npm run test` → **495 files passed, 1 skipped; 6,539 tests passed, 13 skipped** (2026-11-09).
- `npx tsc --noEmit` clean outside `.next/`; `npx eslint` on changed files clean.
- Production orphan re-check (select-only): 7 active unwon prizes, 1 rule-4 candidate (Garden State Bar `677a214c-…`),
  remaining slots Wed/Thu/Fri on schedule `78a0e374-…` → KEEP. Nothing to retire.
- A1 live check: `GET https://play.hightopchallenge.com/api/challenge-campaigns?venueId=venue-pacific-street&includeInactive=true`
  → `[]`; Garden State Bar → its active `ranked_places` prize plus a won-out points prize (inactive, kept by design).
- **Not run:** `npm run build` (Andrew's dev server owns `.next`; Phase R must run it, mainly to confirm the bundler accepts the
  cascade's dynamic `import("@/lib/liveShowdownAdmin")` of its own caller). Not browser-tested, and no real cancel was run
  against production (it would write live data). The partner notice reuses the existing `rewardNotice` path.

### 7. Open questions for Andrew
- **`VENUE_PRESENCE_ENFORCEMENT` (blocks C1, not A3).** How to find it: Vercel dashboard → project **hightop-challenge** →
  Settings → Environment Variables → search `VENUE_PRESENCE_ENFORCEMENT` → the **Production** row → click the eye icon (or
  "…" → Edit) to show the value. `true`/`1`/`yes`/`on` = on; `false`/`0`/`no`/`off`, blank or anything else = off. If the
  value can't be shown (marked Sensitive), Andrew can just say which he wants and set it again.
- Whether to commit/deploy A2 now or with Phase R.
- Plan Q1–Q4 still open (only Q1 blocks anything: B3).

### 8. Recommended first steps for Phase A3 (Opus 5.5, medium effort)
1. Read `lib/rewardGameSlotCascade.ts` end to end (rules 1–4) and both test files.
2. Add `dryRun` to `applyScheduleChangeToGameWinnerRewards`: no `updateChallengeCampaign`, no `settleBeforeRetiring`, and a
   simulated post-change schedule list for rule 4 (see §5). Report would-be outcomes with campaign names (one extra read of
   names, or reuse `campaigns`, which already has `name`).
3. Build `GET /api/owner/schedule/[id]/cancel-impact` (owner auth + venue check first, like the existing `[id]` route) and the
   admin mirror. Then add the one line to the Cancel game confirmation in `ScheduleStepScreens.tsx`, checked at 350 px.
