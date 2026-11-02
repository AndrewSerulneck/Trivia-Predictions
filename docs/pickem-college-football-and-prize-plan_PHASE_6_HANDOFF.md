# Pick 'Em plan: Phase 6 handoff (player screens for the Prize)

Plan: `docs/pickem-college-football-and-prize-plan.md`. Phase 6 built 2026-10-31.

## For Andrew (plain English)

**What changed (players now see the Pick 'Em Prize):**
- **A slim prize line on the Pick 'Em games list**, for any of the bar's prizes that cover the games shown, e.g.
  "Prize today: 12, 15 or 18 of 20 right · 14 picks left", "Prize this week: get 10 picks right", or
  "Prize today: most picks right · make 5 or more to qualify".
- **When a player has used all their picks** for an "X out of N" prize, the line adds the reason ("This bar's prize counts your
  first 20 college football picks today, and you've already used all 20."). Games they haven't picked are greyed out and tapping
  one shows that message; a pick they already made can still be changed or cleared.
- **The tiebreaker question** ("How many total points will be scored in Bulldogs at Tigers?") appears as a card on the Pick 'Em
  screen for a "most picks right" prize that runs today. The player types a number 0–400 and Saves; it locks when that game starts.
- **The coupon in the prize wallet** now says what it was won for: "You got 15 of 20 college football picks right on Sat, Nov 7"
  (or "most … right", "got 10 … right"), instead of "Won from: Pick 'Em Challenge".
- **The Prizes tab already described Pick 'Em prizes** (Phase 4a wired it); nothing to change there.

**Your two Phase 4b answers are recorded** as plan decisions D13 (next tier down when the top is gone) and D14 (archiving mid-period
pays nobody that period). Both were already how it is built.

**Is it live?** No. Nothing committed, pushed or deployed (main is frozen for App Store review). Migrations `20261031200417` and
`20261031203914` are still NOT applied — apply them, in that order, before this code is deployed (the games list is safe without
them: a missing column is logged and the prize line just doesn't appear, but a partner can't create a prize and nothing can pay).

**Cost:** no new request from the phone, no new cron. The games list does one small read of the bar's prizes at most once a minute per
server (the same cached read the pick limit already uses) and, only for a signed-in player with an "X out of N" prize covering the
shown games, one indexed count of their picks. The tiebreaker card makes one request when it appears and one per Save.

**Still unverified:** no real phone or browser pass (jsdom only). Please add to the Phase 7 device checklist: the prize line and the
greyed-out games at 289 px and 350 px, the tiebreaker card in light and dark theme, and a real coupon text.

## For the next agent (Phase 7: review + fixes)

### 1. Goal and scope
Plan §7 "Phase 7" (Opus 5.5 · xhigh review, then fixes as sub-phases 7.1, 7.2 … — no in-place patches): review all of Phases 1–6 as one
change, write findings into the plan (new section), and write Andrew's phone checklist at
`docs/pickem-college-football-and-prize-device-checklist.md` (a college Saturday in spread and winner modes, the NFL signpost, a
tiered prize end-to-end on the hidden test venue `venue-hightop-test`, the overlap refusal, plus the unverified items below).
Out of scope: a Pick 'Em standings view in Partner Results (plan §8 Q3), NBA/WNBA spreads (§8 Q1).

### 2. Starting state
- Branch `after-app-review`, last commit `407e4da2` (unrelated). **Phases 1–6 are all uncommitted** in the working tree (Andrew has not
  asked for a commit). Nothing pushed or deployed. `main` stays frozen: never push `main`, never `supabase db push`, never change
  Production env until Andrew confirms App Store approval.
- Production DB: `20261031182914`, `20261031185853`, `20261031191250` applied (Andrew); `20261031200417`, `20261031203914` NOT applied.
  Phase 6 added no migration and read/changed no production data.

### 3. Decisions already made (don't re-ask)
- Plan §2 D1–D14 and §4 (D13/D14 = Andrew's 4b answers, 2026-10-31).
- Chosen in Phase 6 without asking:
  - **Which prizes show:** every ACTIVE Pick 'Em Prize at the venue whose scope covers a shown game AND whose period (of that game's
    venue-local day) has not ended. If shown games fall in several periods, the earliest running one is used.
  - **Wording:** "Prize {when}: …" with `when` from `describePickEmPrizePeriodPhrase` (today / this week / on Sat, Nov 7 / from Nov 1 to
    Nov 30). It does not name the prize itself (a $20 card) — the Prizes tab does.
  - **Picks left** is shown only for "X out of N" prizes and only when signed in; "Get N right" / "most right" show no progress.
  - **The limit blocks only a game with no pick yet** (`pickLimitReached`), in the prize's scope and period; the server's own refusal
    (Phase 4a) is unchanged and still the authority (the screen is a courtesy).
  - **The tiebreaker card shows only when the prize's period contains the venue's today** (`hasTiebreaker`), because the route answers for
    today's period only, and only while the viewer is on today's list. It is an inline card, not a popup → no native Back registration.
  - **Coupon text** needed no new wording: `describeRewardWin` already handled Pick 'Em (Phase 4a); the gap was that the wallet never
    passed the prize's terms. It now does (below).

### 4. Files created or changed
- **`lib/pickemPrizeLine.ts`** (new, pure, client-safe): `PickEmGamePrize` (the id-free record on the games response),
  `pickemPrizeLineText`.
- **`lib/pickemGamePrizes.ts`** (new, server-only): `loadPickEmGamePrizes({ games, venueId, userId, now })` → `PickEmGamePrize[]`;
  mutates `pickLimitReached` on games. Never throws (logs `[PickEmPrize] game-prizes-failed`, returns `[]`).
- **`lib/pickemPrizeLimit.ts`**: `activePrizes` → exported `activePickEmPrizes` (the same 60 s per-instance cache the limit uses);
  the count query is now `countPickEmPicksInPrizePeriod` (returns `null` on a failed read), used by the limit check and the games list.
  Behaviour of `checkPickEmPrizePickLimit` unchanged (its tests are untouched and pass).
- **`lib/pickemPrizes.ts`**: new `describePickEmPrizePeriodPhrase`; `pickemPickLimitMessage` now uses it (same words).
- **`lib/pickem.ts`**: `listPickEmGames` returns `prizes` (skipped for `skipLines` and for NFL); `PickEmGame.pickLimitReached`.
- **`components/pickem/PickEmGameList.tsx`**: `prizes` state from the games response, the prize-lines block (`data-testid="pickem-prize-lines"`),
  `limitReached` blocking next to `lineComingSoon` (shared `blockedMessage`), tiebreaker cards.
- **`components/pickem/PickEmPrizeTiebreakerCard.tsx`** (new): mirrors `NFLTiebreakerCard` against `/api/pickem/prize-tiebreaker`, 0–400.
- **`lib/challengeCampaigns.ts`** (`listChallengeCampaignWinsForUser`) + **`types/index.ts`** (`ChallengeCampaignWinTerms`): the wallet
  adds the five `pickem*` terms to `rewardTerms` via `loadPickEmPrizeTerms` (one read, only when a wallet coupon's campaign is a
  Pick 'Em Prize; never throws).
- Tests: `tests/lib.pickem-game-prizes.test.ts` (18), `tests/components.pickem-prize-screen.test.ts` (9, jsdom, renders the real
  list), `tests/lib.rewards-cycle-snapshot.test.ts` (+3). Docs: plan status line + D13/D14, `CLAUDE.md` Pick 'Em section bullet.

### 5. Facts and traps
- `loadPickEmPrizeTerms` only accepts UUID campaign ids (`CAMPAIGN_ID_PATTERN`); test fixtures with ids like `camp-1` get no terms.
- Tests that `vi.mock("@/lib/pickemPrizeLimit")` with only `checkPickEmPrizePickLimit` (e.g. `tests/lib.pickem-college-spreads.test.ts`)
  still pass because `loadPickEmGamePrizes` catches the missing export; a new such test would log `[PickEmPrize] game-prizes-failed`.
- The tiebreaker route resolves TODAY's period at call time; a prize shown for a past day of a running week never gets a card.
- The games response changed shape (added `prizes`); old app builds ignore it. `PickEmGame.pickLimitReached` is optional.
- `npm run lint` still reports pre-existing errors in git-ignored `tmp/group-games-phase-4/release/`; use `npx eslint <files>`.
- Typecheck and build must not run at the same time (`.next/types`).

### 6. Build / test / verification
- `npx tsc --noEmit` clean; `npx eslint` on every changed file clean; `npm run build` passes.
- `npm run test`: all pass except the same four date-based Prop Bingo star-index tripwires as Phases 1–5
  (`tests/lib.sportsBingo.{nfl,mlb}-star-index*.test.ts`), untouched.
- **Unverified:** no real browser/phone; no run against a real database (4a/4b migrations unapplied); the light-theme look of the
  prize line and tiebreaker card (tokens copied from the NFL card, `ht-pickem-accent`, `ht-fg-muted`, `ht-loss-fg`, `ht-gain-fg`);
  the layout at 289 px.

### 7. Open questions for Andrew
None blocking. Open from the plan §8: NBA/WNBA spreads later? (Q1) A Pick 'Em standings view in Partner Results? (Q3, default no.)

### 8. Recommended first steps for Phase 7 (Opus 5.5 · xhigh)
1. `git diff --stat` and read all seven handoffs; review as one change, hunting money paths first: `pay_pickem_points`,
   `award_pickem_tier_prize`, the pick-limit race (fails open by design), cycle-key/period maths across DST, and the two unapplied
   migrations against the deploy order.
2. Run the SQL proofs: `npm run test:pickem-points-sql test:pickem-lines-sql test:pickem-prizes-sql test:pickem-prize-awards-sql`.
3. Write findings as plan §N and fix phases 7.1…; write the device checklist; carry forward the "Not checked at 289 px" items from the
   Phase 5 and Phase 6 handoffs.
