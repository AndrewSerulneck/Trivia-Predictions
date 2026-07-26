# Rewards — Brief for the Next Code Review

Paste this doc's path into a fresh chat and ask for `/code-review`. It exists so that chat
doesn't have to re-derive context from scratch.

## What's in the working tree right now

Nothing is committed — `git status` on `main` shows the full stack of uncommitted Rewards work,
layered across three efforts that landed in sequence in this same working tree:

1. **Rewards terms-sentence rebuild** — `docs/rewards-terms-sentence-plan.md`
2. **Rewards game-winner slot picker** — `docs/rewards-game-winner-picker-plan.md`
3. **This session's code-review fixes on top of (2)** — `docs/rewards-slot-picker-review-fixes-plan.md`,
   all 6 phases done + browser-verified 2026-07-26

The review should treat the whole diff (`git diff HEAD`) as the unit of work — `/code-review`
with no arguments reviews the working tree, which is exactly this.

## Key files touched

- `lib/rewardGameSlots.ts` — slot model (`{scheduleId, weekday}`), enumeration, terms derivation
- `lib/rewardGameSlotCascade.ts` — reconciles pinned rewards when a schedule changes/deletes
- `lib/rewardTerms.ts` — the terms-sentence validation/copy
- `lib/rewards.ts`, `lib/rewardDefinitions.ts` — reward creation, cadence/context resolution
- `lib/challengeCampaigns.ts` — core campaign CRUD, including the new archive-vs-delete split
  (`deleteChallengeCampaign(id, { mode })`) and the redemption-snapshot columns
- `lib/liveShowdownAdmin.ts`, `lib/ownerSchedule.ts` — schedule CRUD, now returning a
  `rewardCascade` report
- `components/rewards/CreateRewardWizard.tsx` — shared wizard, `variant: "admin" | "owner"`
- `app/owner/competitions/page.tsx` — Partner Dashboard Rewards list + the new remove dialog
  (Archive / Delete anyway)
- `app/owner/schedule/page.tsx` — Live Games list + the new amber "rewards affected" notice
- `components/admin/sections/ChallengesSection.tsx` — admin equivalent of both of the above
- `components/prizes/PrizeWalletPanel.tsx` — player wallet, now tolerates a coupon whose reward
  was deleted (detached history)
- Two new migrations, already **applied** to the linked Supabase project:
  - `supabase/migrations/20260726120000_rewards_detachable_redemptions.sql` — makes
    `challenge_campaign_redemptions.challenge_id` nullable with `on delete set null` (was
    `cascade`), adds award-time snapshot columns (`reward_name`, prize fields)
  - `supabase/migrations/20260726120100_award_cycle_winner_prize_snapshot.sql` — updates the
    `award_cycle_winner` RPC to write that snapshot atomically at award time

## Flags — currently OFF

`NEXT_PUBLIC_REWARDS_ENABLED` and `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` are both unset in
`.env.local` as of this writing. All of the above is inert in production until both are set.
Verification this session ran with both forced on via the dev server's process env, never
written to `.env.local`.

## Known, deliberate deviation from the original plan

Monthly/yearly Live Trivia schedules do **not** actually recur — `enumerateScheduleOccurrences`
(`lib/liveShowdownEngine.ts`) runs them once at `start_time` and nothing advances them forward.
So "support monthly rewards" was implemented as: pinnable as a single dated game, not as a
recurring monthly cadence. A reviewer flagging "monthly rewards don't actually repeat monthly" is
describing intended behavior, not a bug — see `docs/rewards-slot-picker-review-fixes-plan.md`'s
"Status" section for the full reasoning.

## What to ask the review to focus on

- The archive-vs-delete split in `deleteChallengeCampaign` and its two API routes
  (`app/api/owner/competitions/[id]/route.ts`, `app/api/admin/route.ts`) — this is the one
  irreversible/destructive path in the diff.
- The schedule-change cascade's recurrence-reconciliation logic in
  `lib/rewardGameSlotCascade.ts` — new since the last review pass.
- Whether the redemption snapshot (written in `lib/challengeCampaigns.ts` and the
  `award_cycle_winner` RPC) can ever drift from the live campaign in a way that misleads a player
  in `/redeem-prizes`.
