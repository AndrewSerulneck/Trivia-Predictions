# Pick 'Em plan: Phase 5 handoff (Prize wizard, partner + admin)

Plan: `docs/pickem-college-football-and-prize-plan.md`. Phase 5 built 2026-10-31.

## For Andrew (plain English)

**What changed**
- **Partners (and you in admin) can now create a Pick 'Em Prize.** A new "🎯 Pick 'Em" tile in Create Prize asks:
  1. **Which games count?** Whole sports (e.g. "All Soccer") or, after tapping "Leagues", single leagues (e.g. EPL).
     The NFL is never listed (it has its own prize).
  2. **When does it run?** One day (date picker), every week on one day (Mon–Sun chips), each Monday–Sunday week, or a
     date range. Days are the bar's own clock; a day that has passed is refused.
  3. **How is this prize won?** Most picks right (with "picks needed to be ranked"), Get N right (with how many winners),
     or X out of N (N picks each, 1–3 tiers, each with its own number of prizes). "Most picks right" is greyed out when
     only MMA/tennis are chosen (no score for the tiebreaker).
  4. Then the usual minimum-players question (most picks right only), the prize (one tab per tier, e.g. "12 right",
     "15 right", "18 right"), and Confirm with "What guests will see".
- **The pick-limit notice** shows on the X-out-of-N step and on Confirm: "Players at your bar will be limited to 20
  college football picks on Sat, Nov 7, so everyone plays the same 20."
- **A clash with another prize** (two "out of N" prizes on the same league and day) is refused by the server and shown in
  red on Confirm, naming the other prize.

**Is it live?** No. Nothing committed, pushed or deployed (main is frozen for App Store review).

**Before this can go live** you must apply the two unapplied migrations, in order: `20261031200417_pickem_prizes.sql`,
then `20261031203914_pickem_prize_awards.sql`. Without them, creating a Pick 'Em Prize fails on the live database.

**Cost:** one extra small request when a partner opens Create Prize (the tile's set-up check reads the bar's time zone,
cached). Nothing recurring.

**Players still can't see these prizes on the Pick 'Em screen.** That is Phase 6.

## For the next agent (Phase 6: player screens)

### 1. Goal and scope
Plan §7 "Phase 6" (Sonnet 5.5 · high): Prizes-tab cards from the templates, the slim prize line + "picks left" + the
limit-reached message on the Pick 'Em games list, the tiebreaker card for "most right" prizes (route
`/api/pickem/prize-tiebreaker` already exists, Phase 4b), and coupon text (wire Pick 'Em terms into
`attachRewardWinDescriptions`; `describeRewardWin` already supports it). Tokens only (light + dark); every closable popup
registers native Back. No new polling: data rides on the existing games response. Out of scope: the wizard (done), a
Results standings adapter (plan §8 Q3).

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). **Phases 1–5 are all uncommitted** in the working tree
  (Andrew hasn't asked for a commit). Nothing pushed or deployed. `main` stays frozen: never push `main`, never
  `supabase db push`, never change Production env until Andrew confirms App Store approval.
- Production DB: `20261031182914`, `20261031185853`, `20261031191250` applied (Andrew); `20261031200417`, `20261031203914`
  NOT applied. Phase 5 added no migration and read/changed no production data.

### 3. Decisions already made (don't re-ask)
- Plan §2 D1–D12 and §4; Andrew's 4a/4b answers in `…_PHASE_4B_HANDOFF.md` §3.
- Chosen in Phase 5 without asking:
  - **Step order:** `definition → games → when → terms ("How to win") → players (most right only) → prize → confirm`.
    `games`/`when` are new ids in `REWARD_WIZARD_STEPS` (so `?step=games|when` works in the Partner Dashboard sheet).
  - **Defaults:** nothing chosen on Games, When or How to win (Next stays off). Pre-filled numbers once a kind is chosen:
    min picks 5; target 10 with 1 winner; N = 20 with tier 1 = 12 right × 1. "Add a tier" suggests 3 more right than the
    last, capped at N; max 3 tiers; tiers 2–3 can be removed.
  - **Leagues UI:** a sport with >1 league has a "Leagues" button that opens its league chips. Tapping a league while the
    whole sport is on takes just that league out; choosing every league one by one becomes the whole sport (so future
    leagues are covered).
  - **Partner copy is NOT in the definition's `description`** (that set is what guests read, and
    `tests/lib.reward-description.test.ts` requires every guest template to name the prize). It is
    `PICKEM_PRIZE_PARTNER_COPY` in `lib/rewardDefinitions.ts`.
  - The overlap refusal is shown where every server error is shown: the red box on Confirm (the wizard does not pre-check
    D6 client-side — it has no list of the bar's other prizes).

### 4. Files created or changed
- **`lib/pickemPrizeWizard.ts`** (new, pure, client-safe): Games (`PickEmScopeDraft`, `togglePickEmScopeSport`,
  `togglePickEmScopeLeague`, `isPickEmScopeLeagueOn`, `pickemScopeFromDraft`); When (`PickEmWindowDraft`,
  `pickemWindowDraftFor`, `PICKEM_WINDOW_KINDS`, `PICKEM_WEEKDAY_CHIPS`, `pickemWindowFromDraft`); How to win
  (`PickEmTermsDraft`, `DEFAULT_PICKEM_TERMS_DRAFT`, `PICKEM_WIN_KINDS`, `nextPickEmTierDraft`, `pickemTermsFromDraft` →
  `validatePickEmPrizeTerms`, `pickemEngineTerms` = the same mapping as `createPickEmReward`); words
  (`pickemPickLimitNotice`, `describePickEmPrizeTermsForPartner`).
- **`lib/rewardWizardSteps.ts`**: steps `games`, `when`; `guardRewardWizardStep` takes optional
  `pickem: { scope, window, terms }` (null for every other prize → `games`/`when` land on `terms`; a later Pick 'Em step
  goes back to the first unanswered question).
- **`components/rewards/CreateRewardWizard.tsx`**: Pick 'Em state + branches (all gated on `isPickEmDefinition`); new
  submission fields `pickemScope`, `pickemWindow`, `pickemPickLimit`, `pickemTiers` (`{correct, quantity, prize}`, lowest
  first), `pickemMinPicks`; context DTO gains `pickem`; the prize step's tabs now cover places OR tiers
  (`prizeSlotCount`, `tierPrizeInputs`); the game picker never applies to Pick 'Em.
- **`lib/pickemPrizes.ts`**: `isPickEmPrizeOffered()` → `true`.
- **`lib/rewardDefinitions.ts`**: `PICKEM_PRIZE_PARTNER_COPY`; comment updated.
- The hosts (`lib/ownerRewardRequests.ts`, admin `ChallengesSection.tsx`) needed no change: both POST the whole
  submission, and both routes already pass the five `pickem*` fields and map `RewardConflictError` → 409 (Phase 4a).
- Tests: **`tests/lib.pickem-prize-wizard.test.ts`** (new, 11); **`tests/components.create-reward-wizard.test.ts`** (+5:
  offered + leagues, past day refused, X out of N end to end, most right + players + inline 409, get N right weekly);
  **`tests/lib.owner-reward-flow.test.ts`** (+2 guard tests); `tests/lib.pickem-prizes.test.ts` and
  `tests/lib.squares-prizes.test.ts` now expect the tile offered; the admin **definition** snapshot gained exactly one
  tile (🎯 Pick 'Em) — the terms/prize/confirm snapshots are unchanged.

### 5. Facts and traps
- `winCondition` state is set from the Pick 'Em "How to win" choice (most right → `game_winner`), which is what makes
  the existing `players` step appear. The submission takes win condition / threshold / quota from `pickemEngineTerms`.
- The wizard's "today" is `context.pickem.today` (the venue's), never the phone's.
- `describePickEmPrizeWindow` says "each week (Monday to Sunday)" — the partner sentences reuse it as-is.
- `npm run lint` still reports pre-existing errors in git-ignored `tmp/group-games-phase-4/release/`; use `npx eslint <files>`.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification
- `npx tsc --noEmit` clean; `npx eslint` on every changed file clean; `npm run build` passes.
- `npm run test`: 5,926 pass / 13 skipped / 4 fail — the same four date-based Prop Bingo star-index tripwires as Phases
  1–4b (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`), untouched.
- **Unverified:** no real browser or phone pass (jsdom tests drive the real component in the admin variant; the owner
  sheet uses the same markup with dark tokens). Not checked at 289 px: the 7 weekday chips (`grid-cols-7`, `!px-1`) and
  the tier rows (`grid-cols-[1fr_1fr_auto]`). Creating a prize against a real database is impossible until the 4a/4b
  migrations are applied. Add these to the Phase 7 device checklist.

### 7. Open questions for Andrew (none block Phase 6)
1. Still open from 4b: a player who reaches the top tier when its prizes are gone gets the next tier down (built) — or nothing?
2. Still open from 4b: archiving a prize mid-period pays nobody for that period (built). OK?

### 8. Recommended first steps for Phase 6 (Sonnet 5.5 · high)
1. Read `lib/rewardDescription.ts` (`describePickEmReward`, the Pick 'Em part of `describeRewardWin`) and
   `attachRewardWinDescriptions` in `lib/rewards.ts` — coupons still say "Won from: Pick 'Em Challenge".
2. Read `lib/pickemPrizeLimit.ts` and `GET /api/pickem/games` to add the prize line + picks left to the existing games
   response (one read, cached like the limit's 60 s cache — no new request from the screen).
3. Tiebreaker card: `GET/POST /api/pickem/prize-tiebreaker`; register native Back for any closable popup
   (`useNativeBackHandler`, list in `tests/native-back-review-fixes.test.ts`).
