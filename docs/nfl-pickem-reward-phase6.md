# Phase 6 — Points-target accrual

Read `docs/nfl-pickem-reward-plan.md` first — findings #1 and #7 are the whole
substance of this phase.

**The problem:** NFL Pick 'Em never feeds the challenge-campaign engine.
`applyChallengeCampaignPoints` is called from `lib/pickem.ts`, `lib/trivia.ts`,
`lib/fantasy.ts`, `lib/sportsBingo.ts`, `lib/liveShowdownSubmission.ts` and
`lib/liveShowdownEngine.ts` — **never** from `lib/nflPickEm.ts`. Without this
phase, a points-target NFL reward can be created but can never be won.

## Decide the integration point FIRST

NFL picks live in `pickem_picks` alongside daily Pick 'Em and are settled by the
**shared** `settlePendingPickEmPicks` (`lib/pickem.ts:2169`), which selects
pending picks with `starts_at <= now` across all sports and writes
`status` / `reward_points`.

Two options. **Prefer B unless you find a concrete reason not to**, and record the
decision and reasoning in the run log:

- **A — inline branch** inside `settlePendingPickEmPicks`: after a row settles,
  if `sport_slug === 'nfl'` and `status === 'won'`, call
  `applyChallengeCampaignPoints`. Fewer moving parts, but edits the hot path that
  daily Pick 'Em depends on.
- **B — separate NFL sweep** (`accrueNFLPickEmChallengePoints` in a new
  `lib/nflPickEmRewardAccrual.ts`), invoked right after `settlePendingPickEmPicks`
  in `app/api/cron/pickem-settle/route.ts`. Reads settled-but-not-yet-accrued NFL
  picks and applies them. Leaves daily Pick 'Em's settlement completely
  untouched, and is independently testable and re-runnable.

## The accrual unit

The plan's locked decision is **correct picks**, not points. NFL picks are worth a
flat 10 (`PICKEM_REWARD_POINTS` in `lib/nflPickEm.ts:170`, no bonus tiers), so:

```
basePoints passed to applyChallengeCampaignPoints = number of newly-settled WON picks
```

i.e. **1 per correct pick**, not 10. The campaign's `pointsRequiredToWin` is the
partner's "get N picks right" threshold, so the two must be in the same unit.
Comment this explicitly — the flat-10 `reward_points` column sitting right there
makes 10 the tempting wrong answer.

Note `applyChallengeCampaignPoints` applies `campaign.pointMultiplier`; rewards are
created with the default multiplier of 1, so this is a no-op today. Do not special-case it.

## Idempotency — mandatory

`applyChallengeCampaignPoints` **accumulates** (`nextProgress = existing + increment`),
so double-counting a pick directly inflates a guest toward a real prize. The cron
runs repeatedly and the sweep window overlaps.

Add a durable marker. Preferred: a new nullable column
`pickem_picks.challenge_accrued_at timestamptz` via **one new migration**
(`supabase/migrations/20260727120200_nfl_pickem_challenge_accrual.sql`), set in the
same pass that accrues. Select only `sport_slug = 'nfl' AND status = 'won' AND
challenge_accrued_at IS NULL`. Do **not** reuse `reward_claimed_at` — that is the
player-facing claim flow and means something different.

Group by `(user_id, venue_id)` and make **one** `applyChallengeCampaignPoints`
call per group per sweep, then stamp the marker on those rows. If the stamp write
fails, log it and do not retry the accrual in the same run.

## Scope gating — do NOT hand-roll it

Resist writing "is this pick inside the campaign's NFL week scope?" logic here.
The engine already answers it:

- `isCampaignEligibleAtTime` checks `gameTypes.includes("nfl-pickem")`,
  `activeDays` (all seven, per Phase 3), and `endDate`.
- `computeCycleStart` puts the accrual in the right weekly cycle, anchored on
  Thursday via `activeDays[0]`.
- A `season` reward's `startDate`/`endDate` (Phase 4) bound it.

The one thing to get right is **`occurredAt`**: pass the **pick's own game
kickoff (`starts_at`)**, not `new Date()`. A Sunday-afternoon game settled by a
Monday-morning cron must land in Sunday's NFL week, not Monday's. Since NFL weeks
run Thu→Wed and Monday is still the same NFL week, this rarely differs — but a
late-Wednesday cron settling a Monday-night game would cross the boundary and
credit the wrong week.

## Guard against retroactive wins

A partner creating a points-target reward mid-week must not instantly award guests
for picks that settled before the reward existed. `isCampaignEligibleAtTime` does
not check `createdAt`. Filter settled picks to those whose `starts_at` is at or
after the campaign's `created_at` — mirroring the reasoning in
`campaignWasLiveForOccurrence` (`lib/liveTriviaWinnerRewards.ts`), which exists for
exactly this failure mode. If that filter is impractical inside
`applyChallengeCampaignPoints`'s interface, do the filtering in the sweep before
calling it, and say so in the run log.

## Tests

New `tests/lib.nfl-pickem-reward-accrual.test.ts`:

- A won NFL pick accrues **1** point per correct pick, not 10.
- Running the sweep twice accrues once (idempotency marker works).
- A lost/pending/push pick accrues nothing.
- Daily Pick 'Em picks (`sport_slug !== 'nfl'`) are untouched by the NFL sweep,
  and daily Pick 'Em's own accrual still fires as before — **assert this
  explicitly**, it is the main regression risk.
- Picks whose `starts_at` predates the campaign's `created_at` do not accrue.
- `occurredAt` is the pick's `starts_at`, not now.
- Venue scoping: a user's picks at venue A never accrue to a campaign at venue B.

## Constraints

- No `any`. Absolute `@/` imports. `import "server-only"` in the new lib module.
- One new migration only; do not modify existing ones.
- Do not touch `proxy.ts`, `lib/supabaseAdmin.ts`, or `vercel.json` (the existing
  `pickem-settle` cron entry already fires this — no new cron needed).

## Acceptance

- `npm run build` and `npm test` pass.
- Against the Phase 0 seed: create a points-target NFL reward, run the settle
  cron, and confirm `challenge_campaign_progress` shows correct-pick counts (not
  ×10) for the seeded users, and that a guest crossing the threshold receives a
  coupon.
- Re-running the cron does not change the progress numbers.
