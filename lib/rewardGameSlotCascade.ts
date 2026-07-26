import "server-only";

// ── Schedule-change cascade for slot-pinned rewards ─────────────────────────
//
// A game-winner reward can be pinned to specific scheduled games
// (challenge_campaigns.game_winner_slots — see lib/rewardGameSlots.ts). Those
// pins point at rows in trivia_schedules, which partners edit and delete freely,
// so a reward can outlive the game it was offered at. This module is what keeps
// the two in step: when a schedule is deleted, or shrinks to fewer weekdays,
// every reward pinned to a game that no longer exists is pruned.
//
// Two rules, both from docs/rewards-game-winner-picker-plan.md:
//
//  1. PARTIAL LOSS SHRINKS THE REWARD, IT DOESN'T KILL IT. A reward covering
//     Tuesday and Thursday whose Thursday game is cancelled survives as a
//     Tuesday reward with its quota reduced to 1. Only when its LAST slot is
//     gone is the reward retired.
//
//  2. ALREADY-WON PRIZES ARE NEVER TOUCHED. Retiring a reward means
//     `is_active = false` — NEVER a DELETE. challenge_campaign_redemptions
//     cascades on challenge_id (supabase/migrations/20260509024500_…sql), so
//     deleting a campaign destroys coupons players already won, including
//     unredeemed ones sitting in a wallet right now.
//
//  3. A RECURRENCE CHANGE RETIRES THE REWARD RATHER THAN RE-DERIVING IT.
//     Weekdays are not the only thing a reward's terms depend on: a reward
//     pinned to a WEEKLY Tuesday game promises "1 winner every week", and the
//     same Tuesday game switched to a ONE-OFF can never honor that — the reward
//     would sit "In Progress" forever waiting on a game that will not run again.
//     The reverse is just as wrong: a one-off reward is spent at its first
//     resolved game, so promoting its game to weekly would award once and then
//     look broken. Silently rewriting cadence/quota under a partner would also
//     change terms they already advertised to players, so the reward is retired
//     and the partner is told (see GameSlotCascadeReport) to re-create it
//     deliberately.
//
// Creating a new schedule is deliberately NOT a cascade: the picker's "any game"
// checkbox snapshots today's schedule, so a game added later does not start
// awarding on an existing reward.

import { listChallengeCampaigns, updateChallengeCampaign } from "@/lib/challengeCampaigns";
import {
  normalizeGameWinnerSlots,
  weekdaysForSlots,
  type StoredGameWinnerSlot,
} from "@/lib/rewardGameSlots";

export type GameSlotCascadeReport = {
  /** Campaigns that lost some slots but kept at least one. */
  pruned: Array<{ campaignId: string; remainingSlots: number }>;
  /** Campaigns retired (is_active = false) because their last slot went away. */
  deactivated: string[];
  /**
   * Campaigns retired because the schedule's RECURRENCE changed under them
   * (rule 3 below), not because their games were cancelled. Kept separate from
   * `deactivated` so the partner-facing notice can say which thing happened —
   * "the game you pinned this to no longer runs on that day" and "the game you
   * pinned this to changed how often it repeats" are different surprises.
   */
  retiredForRecurrenceChange: string[];
  errors: Array<{ campaignId: string; message: string }>;
};

const emptyReport = (): GameSlotCascadeReport => ({
  pruned: [],
  deactivated: [],
  retiredForRecurrenceChange: [],
  errors: [],
});

/** True when the report contains anything a partner should be told about. */
export function cascadeReportHasChanges(report: GameSlotCascadeReport): boolean {
  return (
    report.pruned.length > 0 ||
    report.deactivated.length > 0 ||
    report.retiredForRecurrenceChange.length > 0
  );
}

/**
 * Turn a report into the one-line notice the partner sees after editing or
 * deleting a game, or null when nothing about their rewards changed. Lives here
 * rather than in either host's UI so the admin and owner surfaces can't drift
 * into describing the same consequence differently.
 *
 * Deliberately counts rather than names the rewards: the cascade works from
 * campaign ids, and a name would need another round trip for a message whose
 * job is to prompt the partner to go look at their Rewards list.
 */
export function describeCascadeReport(report: GameSlotCascadeReport): string | null {
  const parts: string[] = [];
  const plural = (count: number) => (count === 1 ? "reward" : "rewards");

  const retired = report.deactivated.length;
  if (retired > 0) {
    parts.push(
      `${retired} ${plural(retired)} pinned to this game ${retired === 1 ? "was" : "were"} retired because the game no longer runs.`,
    );
  }

  const recurrence = report.retiredForRecurrenceChange.length;
  if (recurrence > 0) {
    parts.push(
      `${recurrence} ${plural(recurrence)} pinned to this game ${recurrence === 1 ? "was" : "were"} retired because how often the game repeats changed. Re-create ${recurrence === 1 ? "it" : "them"} to match the new schedule.`,
    );
  }

  const pruned = report.pruned.length;
  if (pruned > 0) {
    parts.push(
      `${pruned} ${plural(pruned)} now ${pruned === 1 ? "covers" : "cover"} fewer games.`,
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * The only two recurrences a game-winner reward can express: it either repeats
 * (cadence "weekly", one prize per pinned game per week) or it is a single dated
 * game (cadence "none", worth exactly 1). See deriveGameWinnerTerms.
 */
export type CascadeRecurrence = "weekly" | "none";

/**
 * Reduce a raw `trivia_schedules.recurring_type` to what a reward can express,
 * using the SAME reading as lib/rewards.ts's rewardRecurringType so the cascade
 * and the creation path can never disagree about what a schedule is:
 *
 *   - daily / weekly            → "weekly" (it genuinely repeats)
 *   - monthly / yearly          → "none": the engine
 *     (enumerateScheduleOccurrences) runs these exactly once at start_time and
 *     nothing advances them forward, so they are single dated games
 *   - none, but with explicit recurring_days → "weekly"
 *   - none                      → "none"
 */
export function rewardCascadeRecurrence(schedule: {
  recurringType: string | null | undefined;
  recurringDays?: readonly string[] | null;
}): CascadeRecurrence {
  const type = String(schedule.recurringType ?? "").trim().toLowerCase();
  if (type === "daily" || type === "weekly") return "weekly";
  if (type === "monthly" || type === "yearly") return "none";
  const days = (schedule.recurringDays ?? []).filter((day) => String(day ?? "").trim() !== "");
  return days.length > 0 ? "weekly" : "none";
}

/**
 * How a campaign's own persisted recurrence reads as a cascade recurrence.
 * `recurringType` on a slot-pinned reward is only ever "weekly" or "none"
 * (deriveGameWinnerTerms produces nothing else), but daily is folded into
 * "weekly" so a legacy row can't be mistaken for a one-off and retired.
 */
function campaignRecurrence(recurringType: string | null | undefined): CascadeRecurrence {
  const type = String(recurringType ?? "").trim().toLowerCase();
  return type === "none" || type === "" ? "none" : "weekly";
}

/**
 * Reconcile every slot-pinned reward at a venue against a schedule that just
 * changed.
 *
 * `survivingWeekdays` is the weekdays the schedule still runs on AFTER the
 * change — pass `[]` when the schedule was deleted outright. Slots pointing at
 * this schedule on any other weekday are pruned; slots on OTHER schedules are
 * never touched, which is what keeps two games that share a weekday independent.
 *
 * `survivingRecurrence` is how the schedule repeats AFTER the change, already
 * reduced to what a reward can express: "weekly" for anything that genuinely
 * repeats, "none" for a single dated game, and `null` when the schedule is gone
 * (a delete, or a transfer away from this venue) — in which case there is no
 * recurrence left to disagree with and only the weekday pruning applies. Pass
 * it through `rewardCascadeRecurrence` so this reading can never drift from the
 * engine's.
 *
 * Best-effort by design: one campaign's failure is collected into the report
 * rather than thrown, because the schedule change itself has already happened
 * and must not appear to fail.
 */
export async function applyScheduleChangeToGameWinnerRewards(params: {
  scheduleId: string;
  /** The venue the schedule belongs to. Nothing to do without one — see below. */
  venueId: string | null;
  survivingWeekdays: readonly string[];
  survivingRecurrence?: CascadeRecurrence | null;
}): Promise<GameSlotCascadeReport> {
  const report = emptyReport();
  const scheduleId = String(params.scheduleId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  // Rewards are always created against a venue (createReward writes a non-empty
  // venue_ids), and campaigns are found by venue — a schedule with no venue
  // could never have been offered as a reward's game.
  if (!scheduleId || !venueId) return report;

  const surviving = new Set(
    (params.survivingWeekdays ?? []).map((day) => String(day ?? "").trim().toLowerCase()),
  );

  const campaigns = await listChallengeCampaigns({ venueId });
  for (const campaign of campaigns) {
    if (!campaign.isActive || campaign.winCondition !== "game_winner") continue;
    // null = "award at every game": a legacy reward is not pinned to this
    // schedule, so a schedule change can't shrink it. Leaving it alone is the
    // same reversibility the null value buys everywhere else.
    const slots = normalizeGameWinnerSlots(campaign.gameWinnerSlots);
    if (slots === null) continue;

    // Does this reward actually point at the schedule that changed? A reward
    // pinned only to OTHER games is none of this change's business, including
    // for the recurrence check below.
    const pinnedToThisSchedule = slots.some((slot) => slot.scheduleId === scheduleId);

    const remaining: StoredGameWinnerSlot[] = slots.filter(
      (slot) => slot.scheduleId !== scheduleId || surviving.has(slot.weekday),
    );

    // Rule 3: the schedule still runs, but not the way this reward's terms
    // promise. Retire it rather than rewriting cadence/quota underneath the
    // partner. Checked before the weekday pruning below because a recurrence
    // flip can leave every weekday intact (weekly Tue → one-off Tue) and would
    // otherwise slip through as "nothing changed".
    if (
      pinnedToThisSchedule &&
      params.survivingRecurrence != null &&
      remaining.length > 0 &&
      campaignRecurrence(campaign.recurringType) !== params.survivingRecurrence
    ) {
      try {
        await updateChallengeCampaign({ id: campaign.id, isActive: false });
        report.retiredForRecurrenceChange.push(campaign.id);
      } catch (error) {
        report.errors.push({
          campaignId: campaign.id,
          message: error instanceof Error ? error.message : "Failed to update reward.",
        });
      }
      continue;
    }

    if (remaining.length === slots.length) continue;

    try {
      if (remaining.length === 0) {
        // Retired, not deleted — rule 2. game_winner_slots is left as-is so the
        // record of what this reward covered survives with it.
        await updateChallengeCampaign({ id: campaign.id, isActive: false });
        report.deactivated.push(campaign.id);
        continue;
      }

      await updateChallengeCampaign({
        id: campaign.id,
        gameWinnerSlots: remaining,
        // One prize per remaining game — the same derivation createReward used.
        winnerQuota: remaining.length,
        // activeDays must follow the slots: they gate which days the reward is
        // live and anchor the weekly cycle (activeDays[0]). Leaving a cancelled
        // game's weekday behind would keep the reward "on" on a night the venue
        // no longer plays. Re-anchoring can shift the current cycle boundary,
        // which is the correct consequence of the schedule actually changing.
        activeDays: weekdaysForSlots(remaining),
      });
      report.pruned.push({ campaignId: campaign.id, remainingSlots: remaining.length });
    } catch (error) {
      report.errors.push({
        campaignId: campaign.id,
        message: error instanceof Error ? error.message : "Failed to update reward.",
      });
    }
  }

  return report;
}

/**
 * Fire-and-report wrapper for the callers inside lib/liveShowdownAdmin.ts. The
 * schedule write has already committed by the time this runs, so a cascade
 * failure is logged and swallowed rather than surfaced as a failed delete/edit —
 * the partner's change DID happen, and re-reporting it as an error would invite
 * a retry that deletes something else.
 */
export async function cascadeScheduleChangeToRewards(params: {
  scheduleId: string;
  venueId: string | null;
  survivingWeekdays: readonly string[];
  survivingRecurrence?: CascadeRecurrence | null;
}): Promise<GameSlotCascadeReport> {
  try {
    const report = await applyScheduleChangeToGameWinnerRewards(params);
    for (const failure of report.errors) {
      console.error(
        `[rewards] failed to prune game-winner slots for campaign ${failure.campaignId}: ${failure.message}`,
      );
    }
    return report;
  } catch (error) {
    console.error(
      `[rewards] game-winner slot cascade failed for schedule ${params.scheduleId}:`,
      error instanceof Error ? error.message : error,
    );
    return emptyReport();
  }
}
