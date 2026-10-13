# Single-week NFL reward — Phase 4 handoff (Create Reward wizard UI)

Written 2026-10-12. Plan: `docs/nfl-pickem-single-week-reward-plan.md`. Previous: `…_PHASE_3_HANDOFF.md`.

## For Andrew (plain English)

The Create Reward screen now has a third card, **Single week**, next to "Every week" and "Whole season". Tapping
it shows a "Which week?" dropdown (e.g. "Week 9 · Nov 5 – Nov 9"). For a "picks target" reward, targets bigger
than that week's number of games are greyed out with a one-line reason. "Most correct picks" says "1 winner for
Week 9". The card only appears when the server offers at least one not-yet-started week.

It is **not live**: nothing is committed, pushed or deployed (Phases 1–4 are all uncommitted). Typecheck, lint and
all 4,159 tests pass. **I did not do the on-screen check** in a browser (see §6) — the Phase 5 reviewer or you
should. Nothing needs you yet.

## For the next agent (Phase 5 — review, release, docs; plan says Opus 5.5, high effort)

1. **Goal/scope:** plan §4 Phase 5: independent review of Phases 1–4 (money path first), full gates, update
   `CLAUDE.md` (Rewards section says scope is "`weekly` or `season`, and only those two") and
   `docs/nfl-pickem-reward-plan.md`, then the release order. Out of scope: week ranges.
2. **Starting state:** branch `main`, last commit `44fbc62`. Phases 1–4 uncommitted, mixed with unrelated work
   (listed in the Phase 2 handoff §2 — commit only this plan's files). Migration `20261012200725` is applied to
   production. No data written.
3. **Decisions:** D1–D5 (plan §2). Phase 4: the week picker is a native `<select>` styled with the wizard's
   existing `s.input` (no new CSS); the card is hidden when `selectableWeeks` is empty/absent; only the week
   NUMBER is sent (`{kind:"single_week", season, week}`) — the server re-reads dates.
4. **Files changed (Phase 4):**
   - `components/rewards/CreateRewardWizard.tsx` — state `nflWeekNumber`; `selectedWeek` (first selectable week by
     default); `nflScope` memo builds `single_week`; `nflTermsResult` passes the week's dates, `gamesCount` and
     `effectiveThreshold` (so D3's refusal shows inline and blocks Next); `effectiveThreshold` was moved up above
     it (it was declared later — using it earlier would be a use-before-define); third option card + "Which week?"
     select; winners line "1 winner for Week N"; picks-target chips above `gamesCount` are `disabled` with a
     help line; the 3-picker notice says "week" for single-week (only "season" says season).
   - `tests/components.create-reward-wizard.test.ts` — 3 new tests (card hidden with no weeks; submits chosen week
     number, default first week; chips/help text for a 6-game week).
5. **Facts/traps:** the default threshold (10) is greater than a short week's game count, so on such a week the
   default chip is disabled-but-selected and the red D3 message blocks Next until the partner picks a lower
   target — acceptable, but a reviewer may prefer auto-snapping to the largest allowed option. The admin snapshot
   tests did not change (they render with no `selectableWeeks`, so the markup is identical). The grid goes
   `sm:grid-cols-3` only when the card shows.
6. **Verified:** `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 345 files / 4,159 passed,
   13 skipped, 0 failed. **Not done:** `npm run build`; the plan's visual check from a scratchpad clone with mocked
   routes (360 px width, light + dark tone, 12 px text floor by eye — the text-size contract test passes).
7. **Open questions for Andrew:** the three pre-existing issues in the Phase 2 handoff §7 remain for Phase 5.
8. **First steps:** read plan §4 Phase 5 and §5; run the review; do the browser check from a scratchpad clone
   (never a real POST from the dev server; never `pkill next-server`); then gates, docs, and release order
   (Andrew approves `db push`-equivalents, commit/push and deploy).
