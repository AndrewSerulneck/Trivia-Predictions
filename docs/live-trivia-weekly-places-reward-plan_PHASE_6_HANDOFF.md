# Live Trivia Weekly Places Reward — Phase 6 handoff (2026-10-14)

Plan: `docs/live-trivia-weekly-places-reward-plan.md`. Phase 6 = the Create Reward wizard. This note is for
whoever does **Phase 8** (Past Winners) or **Phase 7** (first live week, docs, cost check).

## For Andrew (plain English)

- **What changed:** when you (or a partner) create a Live Trivia reward, there is now a third way to win:
  **"Top players this week (1st, 2nd, 3rd)"**. You choose 1, 2 or 3 places, then pick a prize for each place
  (tabs: 1st place / 2nd place / 3rd place, with a "Same prize as 1st place" button). There is also a new,
  optional **Minimum players** choice ("pay out only if at least N players took part", 2–100, off by default); it
  also shows up for the existing "Winner of the game" option, but not for a points target.
- **Where:** the same wizard in the Partner Dashboard (Menu → Rewards) and in Admin → Rewards.
- **Only shown when it can work:** a venue with no repeating Live Trivia game doesn't see the new choice. Nothing
  else about the existing wizard changed (the old snapshots of it pass untouched).
- **Is it live?** **No.** It is committed on a branch (`live-trivia-ranked-places-phase6`) and **not pushed**.
  Pushing to `main` deploys it, and the plan says it then appears for **every** partner with no on/off switch (your
  answer D10). Say the word and I'll push.
- **One thing differs from the plan:** the plan said a reward created mid-week should say "Starts next Wednesday".
  Your later rule (D8) is that the week it is created in counts, so the wizard says "Starts right away. Created
  mid-week, this week still counts … as long as this week's last game hasn't finished. If it has, it starts next
  week." This is exactly how Garden State Bar's reward behaves.
- **Needs you:** a phone check of the new steps — section **C** of `docs/reward-descriptions-device-checklist.md`.
  Please don't *finish* creating a reward at a real venue to test; dev and the live site share one database.
- **Not checked:** I did not run this in a real browser or phone (only automated tests and a clean build).
- **Also this session (already done, before Phase 6):** the backfill was applied (13 coupons, $320) and the
  "1st place wins …" wording is on `main` (commit `fdd62bc`). Details in the Phase 5 handoff addendum.

## For the next agent

### 1. Goal and scope

Phase 6 is **done in code, not deployed**. Next is whichever of these Andrew picks: **Phase 8** (Past Winners on the
Partner Dashboard; plan §5f/§7; Phase 8 deploy was approved by Andrew on 2026-10-14) or **Phase 7** (watch Garden
State Bar's first live week, add the CLAUDE.md/AGENTS.md "Weekly places rewards" section, cost check — note the
first live week settles after **Fri 2026-10-16**'s game ends, ≈ 2026-10-17T01:25Z, on the next
`/api/cron/resolve-live-trivia-winners` sweep).
Out of scope here: anything in Phases 7/8; pinning a ranked reward to chosen games in the wizard (the server accepts
it; the wizard always counts every repeating game — add only if Andrew asks).

### 2. Starting state

- Branch `live-trivia-ranked-places-phase6`, worktree
  `/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/561b22f3-a53c-433f-a52a-b213008642cd/scratchpad/ranked-p6`
  (node_modules symlinked to the main checkout's), based on `origin/main` `fdd62bc`. One commit with the code, tests,
  checklist section and this note. **Not pushed.** Andrew's main checkout
  (`/Users/andrewserulneck/Documents/Trivia-Predictions`) is on `category-blitz-scoring-cadence` with lots of
  unrelated uncommitted work: never commit there, never `git checkout --` there.
- **No migration, no production data written in Phase 6.** (Earlier today, Phase 5: reward row
  `677a214c-b859-4c17-8e4d-9889574516e1` created; backfill applied — 13 coupons / 10 settlements; its `rules` text
  updated to the "1st place wins" wording. See the Phase 5 handoff addendum.)

### 3. Decisions already made (don't re-ask)

Plan §2 D1–D12 hold. Phase 6 choices:
- **No new wizard step ids.** `REWARD_WIZARD_STEPS` is unchanged, because the Rewards sheet mirrors steps into `?step=`
  and pins them. The minimum-players control lives in the Terms step; per-place prizes are tabs inside the Prize step.
- **Offered iff** the definition `supportsRankedPlaces` AND the venue has ≥ 1 recurring game slot
  (`context.gameSlots.some(recurring)`) — the same two facts `createReward` re-checks. That is also why the existing
  admin snapshots (a venue with no game slots) are byte-identical.
- **Minimum players** is offered for ranked and Live Trivia "Winner of the game"; never for points target or NFL.
  Default when switched on: 4. Only sent when set (`minPlayers` key absent otherwise).
- **"Starts" copy** follows D8, not the plan's old "Starts next Wednesday" line (see above).
- Defaults: 3 places selected; every place starts as the wizard's usual default prize (50% off an appetizer).

### 4. Files created or changed

- `lib/rewardPrizeDraft.ts` (new, pure/client-safe): `PrizeDraft` (one prize as typed), `DEFAULT_PRIZE_DRAFT`,
  `derivePrizeFromDraft(draft, {posConnected, posIntegrations})` → `{prize, asksPosValue, asksPosDelivery,
  posValueCents, posValueInvalid}` (the wizard's old prize logic, moved verbatim so one-prize and per-place paths
  derive the same way), `placePrizeFromInput(place, prize)` → stored `RewardPlacePrize`, `parseMinPlayersInput`.
- `components/rewards/CreateRewardWizard.tsx`: the 9 prize `useState`s became `drafts: PrizeDraft[]` (index 0 = THE
  prize of every non-ranked reward) + `patchDraft` + `activePlace`; new state `placeCount`, `minPlayersOn`,
  `minPlayersText`. Derived: `rankedNights`/`rankedOffered`, `isRanked`, `editIndex`, `placePrizeInputs`,
  `placePrizes`, `offersMinPlayers`, `minPlayers(Error)`, `firstInvalidPosPlace`. `CreateRewardSubmission` gained
  optional `placePrizes` and `minPlayers`. Terms step: third chip + ranked section + minimum control. Prize step: tab
  row + "Same prize as 1st place". Confirm: per-place rows, minimum row, guest preview with the ladder, restated terms
  via `describeRankedTerms`. The gift-card amount label is now linked to its input (`htmlFor`).
- No route/host changes needed: both hosts `JSON.stringify` the whole submission and both routes already forwarded
  `placePrizes`/`minPlayers` (Phase 3).
- Tests: `tests/components.create-reward-wizard.test.ts` (+11, "weekly places"; snapshots untouched),
  `tests/lib.reward-prize-draft.test.ts` (8). Docs: checklist §C, plan status, this note.

### 5. Facts and traps

- A ranked submission sends `winCondition "ranked_places"`, `cadence "weekly"`, `winnerQuota` = place count,
  `prize` = the 1st place prize (the server ignores it), `placePrizes` 1st-first. `createReward` re-derives
  everything else; nothing is trusted.
- `validateRewardTerms`/`allowedPeriodsFor` treat `ranked_places` like a points target; the wizard ignores
  `termsError` when ranked. Don't "fix" that by feeding them the ranked condition.
- The Rewards sheet's DiscardGuard marks the flow dirty past the `definition` step; unchanged.
- Dev shares the production DB: never submit the wizard against a real venue from a dev server.
- `.next` in the worktree is ignored; `npm run build` ran fine from the worktree.

### 6. Build / run / test

- `npx tsc --noEmit` clean · `npm run lint` clean · `npx vitest run`: **380 files passed, 1 skipped; 4,479 tests
  passed, 13 env-gated skips** · `npm run build` succeeded.
- **Verified:** wizard behavior in jsdom (offered/not offered, nights text, places, tabs, same-as-1st, per-place
  prizes incl. a menu item, naming the failing place, minimum on/off/out-of-range, minimum for game-winner and not for
  points target, submission bodies). **Not verified:** a real browser/phone render, the layout of the three-choice
  row and tabs on a small phone, and a real submission against the server (no safe venue; the server side was
  covered by Phase 3's tests).

### 7. Open questions for Andrew

1. **Push Phase 6 to `main` (deploys it to every partner, no switch — D10)?** — blocking deploy.
2. Phone check (checklist §C) when convenient.

### 8. Recommended next steps

Push on Andrew's go-ahead (`git push origin HEAD:main` from the worktree), then watch the Vercel deploy reach Ready.
Next phase: **Phase 8** (Claude Sonnet 5.5, high) from a fresh worktree of `origin/main`, or **Phase 7** after
Friday's game. Both read the plan + Phase 4/5/6 handoffs first.
