# Share to social: Phase 3 handoff (end-of-flow prompt)

**For Andrew:** after you **schedule a new game** or **create a new prize**, the confirmation message at the bottom
of the dashboard now has a **"Share to social →"** link. Tap it and Share to social opens already on that game (or
on the game your new prize is for, with the prize ticked). Edits and cancels don't show it. If you got there from
the prize wizard's "Schedule Live Trivia" link, the message keeps its existing "Now offer a prize for it →" link
instead (that one wins). **One deviation from the plan to approve:** the plan said a "final screen" with Share to
social + Done. I used the existing confirmation message instead, because it is the dashboard's own pattern, needs
no new screen or history step, and cannot break the Back gesture. It stays up 10 seconds; the dashboard's
"Share to social" row is always there afterwards. Say so if you want a real final screen. Built and tested, **not
committed, pushed or live**; nobody has tried it in a browser. No server, database, env or cost change.

## For the next agent

### 1. Next phase
Phase 4 (Meta setup: docs, screencast script, privacy text, deauthorize/data-deletion callback routes; plan §5, §7;
Sonnet 5.5 medium, review the callbacks at high). Mostly Andrew's work; Phases 5–7 need Meta approval. Out of scope
here: anything that publishes. Also still open before any deploy: `/code-review high` (plan §5.1), Andrew trying
Reels on a phone, music picks, the 48 h Content ID test (Phase 2 handoff §7).

### 2. Starting state
Branch `after-app-review`, last commit `5fd76ed9`; **nothing of Phases 0–3 is committed**. Main is frozen (App
Store review): never push main, `supabase db push` or change Production env. No migration, env, cron or deploy.

### 3. Decisions
- All of D1–D25 stand. **New (my call, within D5):** the prompt is the confirmation toast's action, not a new
  sheet step. Focus is passed to the sheet as a **prop held in dashboard state**, not as `?scheduleId=` /
  `?rewardId=` URL params (plan §4.4 mentioned params); a reload therefore opens the first game. Cheaper and avoids
  stale-id URLs; deep links aren't needed yet.
- Toast priority: `offerReward` (existing) > Share to social. Only one action fits the toast.

### 4. Files changed (all uncommitted)
- `lib/promo/promoSubjects.ts`: `PromoFocus` (`{scheduleId?, rewardId?}`) and `promoFocusOption(options, prizes,
  focus)` (pure). A schedule id picks its option; a prize id picks the first option whose `prizesForGame` includes
  it (honours prizes pinned to one scheduled game); otherwise null.
- `components/owner/social/ShareToSocialSheet.tsx`: new optional `focus` prop; `option = picked ?? focusOption ??
  first`. Resolved reactively, so if the list refetch lands after the tap the sheet corrects itself. The sheet still
  resets on close; the dashboard clears focus when the Entry row is used.
- `components/owner/schedule/ScheduleGameFlow.tsx`: `ScheduleChange.shareScheduleId` (set only for a NEW game
  whose type has a design, from `reply.schedule.id`).
- `components/owner/rewards/RewardsFlow.tsx`: `RewardsChange.shareRewardId`, via a `createdRewardId` ref filled in
  the `onSubmit` wrapper (so `CreateRewardWizard` is NOT forked) and used in `onCreated`; only when the
  definition's `gameType` has a design (`promoGameForPrizeGameType`).
- `lib/ownerRewardRequests.ts`: `submitReward` now also returns `rewardId` (from `POST /api/owner/rewards`
  `{ok, reward}`); the wizard ignores it.
- `app/owner/dashboard/page.tsx`: `ToastState.share`, `socialFocus` state, the toast action, `focus` passed to the
  sheet, Entry row clears focus.
- `lib/promo/promoCopy.ts`: `afterCreateAction: "Share to social →"`.
- Tests: `tests/lib.promo.test.ts` (+4 `promoFocusOption`), `tests/components.share-to-social-sheet.test.ts` (+1
  focus), `tests/owner-dashboard-contract.test.ts` (+1 pinning the rules above).

### 5. Facts and traps
- `ToastState` action: `DashboardToast` accepts one action only.
- The create-schedule reply is `{ ok, schedule }` (a single object); the rewards reply is `{ ok, reward }`.
- Pick 'Em/Squares/Bracket prizes are created through the same wizard, so they get the prompt too, if their prize
  game has a design (all six do).
- Known, not ours: 4 stale sports-bingo snapshot tests fail; `npm run lint` errors are only in git-ignored `tmp/`.

### 6. Verified / not
Verified: `npx tsc --noEmit` clean; eslint clean on touched files; `npm run test`: 480 files pass, only the 4 stale
bingo snapshots fail. **Not verified:** the flow in a real browser (create a game, tap the link, see the right game
selected; create a prize, same). Not run: `npm run build` this phase (no build-affecting change beyond Phase 2's pass).

### 7. Open questions for Andrew
1. OK with the toast instead of a full final screen (and 10 s duration)?
2. Everything in the Phase 2 handoff §7 is still open.

### 8. First steps for Phase 4
Read plan §4.6, §7 and §9; Phase 4 is checklists and copy, not publishing code. Don't start Phase 5 before Meta
approval is in sight. Run `/code-review high` on Phases 1–3 before asking Andrew to deploy.
