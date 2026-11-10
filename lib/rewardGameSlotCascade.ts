import "server-only";

// ── Schedule-change cascade for Live Trivia rewards ──────────────────────────
//
// A game-winner reward can be pinned to specific scheduled games
// (challenge_campaigns.game_winner_slots — see lib/rewardGameSlots.ts). Those
// pins point at rows in trivia_schedules, which partners edit and delete freely,
// so a reward can outlive the game it was offered at. This module is what keeps
// the two in step: when a schedule is deleted, or shrinks to fewer weekdays,
// every reward pinned to a game that no longer exists is pruned.
//
// Rules 1–3 from docs/rewards-game-winner-picker-plan.md, rule 4 from
// docs/cancelled-prizes-pick-windows-away-mode-plan.md:
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
//  4. A LIVE TRIVIA PRIZE NOT TIED TO ONE GAME ENDS WHEN THE VENUE HAS NO GAME
//     LEFT FOR IT (docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase A2,
//     Andrew's D1). Rules 1–3 only see slot-pinned game-winner prizes. A weekly
//     places prize, a points target or a legacy "every game" winner prize has no
//     pins to prune, so after any change the venue's remaining Live Trivia games
//     are read ONCE (only when such a prize exists) and the prize is retired when
//     none is left that it could count:
//       - weekly places / "every game" winner: no live or upcoming game at all
//         (every game counts toward the week; active_days only anchors it);
//       - weekly places pinned to games: none of its pinned games is left;
//       - points target: no game left on any of its active_days (points accrue
//         only on those days — isCampaignEligibleAtTime).
//     Only prizes whose games are Live Trivia ONLY, at this one venue: a legacy
//     multi-game leaderboard or a multi-venue prize is never retired by one
//     venue's Live Trivia.
//
// SETTLE BEFORE THE CHANGE (Phase R1): a cancel deletes the game's answers and
// an edit rewrites its schedule, so after the write nothing can score or even
// find a game already played. settleVenueBeforeScheduleChange therefore runs
// FIRST, while the schedule and its answers still exist: a dry run of these
// rules finds the game-winner / weekly-places prizes the change ends or shrinks,
// the payout sweeps run for THIS venue only, and a weekly places prize about to
// be retired mid-week has its week closed on the nights already played (Q5). A
// payout that can't be confirmed refuses the change (ScheduleChangeSettlementError,
// Q6). The cascade after the write changes a places/winner prize (rules 1–4) only
// if the pre-change step confirmed it (`settledCampaignIds`); any other stays
// active with a report error (a second edit landed in between).
//
// PAY THE EARLY CLOSE AFTER THE WRITE (Phase R7): the pre-change step only RANKS a
// week it would close early (planRankedWeekEarlyClose, while the answers exist) and
// writes nothing. The plan rides to the cascade after the write (`weekCloses`), which
// pays it (payPlannedWeekClose) and only then retires the prize. A failed write
// therefore pays nothing; a plan for a prize the real run keeps is dropped and the
// cron pays that week as usual. The settle reads the venue's campaigns and schedules
// ONCE and hands them to the dry run and both sweeps (`preloaded` / PayoutSweepScope).
//
// DRY RUN (Phase A3): previewScheduleChangeToRewards runs the SAME rules with no
// writes and no payout sweeps, against a simulated post-change schedule list, so
// the partner is warned before confirming. The real run and the preview can't
// drift because they are one code path (runCascade).
//
// Creating a new schedule is deliberately NOT a cascade: the picker's "any game"
// checkbox snapshots today's schedule, so a game added later does not start
// awarding on an existing reward.

import { listChallengeCampaigns, updateChallengeCampaign } from "@/lib/challengeCampaigns";
import type { AdminLiveShowdownSchedule } from "@/lib/liveShowdownAdmin";
import type { TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import type { RankedWeekClosePlan } from "@/lib/liveTriviaRankedRewards";
import { liveOrUpcomingGameSlots } from "@/lib/liveTriviaScheduleSlots";
import { LIVE_TRIVIA_REWARD_DEFINITION_ID } from "@/lib/rewardDefinitions";
import {
  normalizeGameWinnerSlots,
  slotKey,
  weekdaysForSlots,
  type RewardGameSlot,
  type StoredGameWinnerSlot,
} from "@/lib/rewardGameSlots";
import type { ChallengeCampaign } from "@/types";

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
  /**
   * Rule 4: Live Trivia prizes not tied to one game (weekly places, points target,
   * legacy "every game"), retired because the venue has no Live Trivia game left
   * that they could count.
   */
  retiredNoGamesLeft: string[];
  errors: Array<{ campaignId: string; message: string }>;
};

export const emptyCascadeReport = (): GameSlotCascadeReport => ({
  pruned: [],
  deactivated: [],
  retiredForRecurrenceChange: [],
  retiredNoGamesLeft: [],
  errors: [],
});

/** True when the report contains anything a partner should be told about. */
export function cascadeReportHasChanges(report: GameSlotCascadeReport): boolean {
  return (
    report.pruned.length > 0 ||
    report.deactivated.length > 0 ||
    report.retiredForRecurrenceChange.length > 0 ||
    report.retiredNoGamesLeft.length > 0
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
 * job is to prompt the partner to go look at their Prizes list.
 */
export function describeCascadeReport(report: GameSlotCascadeReport): string | null {
  const parts: string[] = [];
  const plural = (count: number) => (count === 1 ? "prize" : "prizes");

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

  const noGames = report.retiredNoGamesLeft.length;
  if (noGames > 0) {
    parts.push(
      `${noGames} ${plural(noGames)} ${noGames === 1 ? "was" : "were"} retired because no Live Trivia games are left for ${noGames === 1 ? "it" : "them"}.`,
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
export type ScheduleChangeParams = {
  scheduleId: string;
  /** The venue the schedule belongs to. Nothing to do without one — see below. */
  venueId: string | null;
  survivingWeekdays: readonly string[];
  survivingRecurrence?: CascadeRecurrence | null;
  /** Clock for rule 4's "which games are left" (tests); defaults to now. */
  now?: Date;
  /**
   * Places / winner prizes settleVenueBeforeScheduleChange confirmed as paid up
   * before the write. A real run changes such a prize (rules 1–4) only when it is
   * in this set; omitted = none (points targets don't need it).
   */
  settledCampaignIds?: ReadonlySet<string>;
  /**
   * Weeks settleVenueBeforeScheduleChange ranked for an early close (R7), by prize
   * id. Rule 4 pays one just before it retires that prize; any other is dropped.
   */
  weekCloses?: ReadonlyMap<string, RankedWeekClosePlan>;
};

/** Rows the settle already read for this venue, so the dry run reads nothing (R7). */
type PreloadedVenueRows = {
  campaigns: readonly ChallengeCampaign[];
  schedules: readonly TriviaScheduleRow[];
};

/**
 * A dry run's stand-in for the schedule write that hasn't happened yet: rule 4
 * reads the venue's CURRENT schedules, so the one being changed is dropped
 * (`schedule: null`, a cancel or a move away) or replaced by its edited form.
 * Only the fields an edit can change; the rest come from the stored row.
 */
export type DryRunScheduleChange = {
  schedule: Pick<
    AdminLiveShowdownSchedule,
    "startTime" | "timezone" | "recurringType" | "recurringDays" | "numRounds" | "venueId"
  > | null;
};

export async function applyScheduleChangeToGameWinnerRewards(
  params: ScheduleChangeParams,
): Promise<GameSlotCascadeReport> {
  return (await runCascade(params, null)).report;
}

/** What a schedule change WOULD do to prizes, by name. Nothing is written or paid. */
export type ScheduleChangePreview = {
  /** Prizes that would end (retired by any rule). */
  ending: string[];
  /** Prizes that would keep going with fewer games. */
  shrinking: string[];
};

/**
 * Dry run of applyScheduleChangeToGameWinnerRewards (Phase A3): the same rules,
 * with no campaign writes and no payout sweeps. A would-be rule 4 retirement is
 * listed even though the real run may keep it active when a payout can't be
 * confirmed — the warning errs toward telling the partner.
 */
export const previewScheduleChangeToRewards = async (
  params: ScheduleChangeParams & DryRunScheduleChange,
): Promise<ScheduleChangePreview> => {
  const { report, campaigns } = await runCascade(params, { schedule: params.schedule });
  const names = new Map(campaigns.map((campaign) => [campaign.id, campaign.name.trim() || "Prize"]));
  const nameOf = (id: string) => names.get(id) ?? "Prize";
  return {
    ending: [...report.deactivated, ...report.retiredForRecurrenceChange, ...report.retiredNoGamesLeft].map(nameOf),
    shrinking: report.pruned.map((entry) => nameOf(entry.campaignId)),
  };
};

/** Merge previews (an admin move touches two venues). */
export const mergeScheduleChangePreviews = (...previews: ScheduleChangePreview[]): ScheduleChangePreview => {
  return {
    ending: previews.flatMap((preview) => preview.ending),
    shrinking: previews.flatMap((preview) => preview.shrinking),
  };
};

/** The one warning line shown before a cancel or edit is confirmed, or null. */
export const describeScheduleChangePreview = (preview: ScheduleChangePreview): string | null => {
  const parts: string[] = [];
  if (preview.ending.length > 0) parts.push(`Also ends: ${preview.ending.join(", ")}.`);
  if (preview.shrinking.length > 0) parts.push(`Covers fewer games: ${preview.shrinking.join(", ")}.`);
  return parts.length > 0 ? parts.join(" ") : null;
};

const runCascade = async (
  params: ScheduleChangeParams,
  dryRun: DryRunScheduleChange | null,
  preloaded?: PreloadedVenueRows,
): Promise<{ report: GameSlotCascadeReport; campaigns: readonly ChallengeCampaign[] }> => {
  const report = emptyCascadeReport();
  const scheduleId = String(params.scheduleId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  // Rewards are always created against a venue (createReward writes a non-empty
  // venue_ids), and campaigns are found by venue — a schedule with no venue
  // could never have been offered as a reward's game.
  if (!scheduleId || !venueId) return { report, campaigns: [] };
  // A dry run takes every branch but writes nothing.
  const write = async (input: Parameters<typeof updateChallengeCampaign>[0]): Promise<void> => {
    if (!dryRun) await updateChallengeCampaign(input);
  };

  const surviving = new Set(
    (params.survivingWeekdays ?? []).map((day) => String(day ?? "").trim().toLowerCase()),
  );

  // Defence in depth (R7): a real run touches a game-winner prize only when the
  // pre-change settle confirmed it, so a dry run and a real run that disagree can't
  // end or shrink a prize whose games were never paid.
  const settled = params.settledCampaignIds ?? new Set<string>();
  const unsettled = (campaign: ChallengeCampaign): boolean => {
    if (dryRun || settled.has(campaign.id)) return false;
    report.errors.push({ campaignId: campaign.id, message: NOT_RETIRED_UNSETTLED_MESSAGE });
    return true;
  };

  const campaigns = preloaded?.campaigns ?? (await listChallengeCampaigns({ venueId }));
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
      if (unsettled(campaign)) continue;
      try {
        await write({ id: campaign.id, isActive: false });
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
    if (unsettled(campaign)) continue;

    try {
      if (remaining.length === 0) {
        // Retired, not deleted — rule 2. game_winner_slots is left as-is so the
        // record of what this reward covered survives with it.
        await write({ id: campaign.id, isActive: false });
        report.deactivated.push(campaign.id);
        continue;
      }

      await write({
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

  await retireLiveTriviaPrizesWithNoGamesLeft({
    venueId,
    scheduleId,
    campaigns,
    report,
    now: params.now ?? new Date(),
    dryRun,
    settled,
    weekCloses: params.weekCloses,
    preloadedSchedules: preloaded?.schedules,
  });

  return { report, campaigns };
};

// ── Rule 4 ──────────────────────────────────────────────────────────────────

const LIVE_TRIVIA_GAME_TYPE = "live-trivia";

/**
 * A prize rule 4 looks after: active, at exactly this venue, counting Live Trivia
 * ONLY (Phase 0's P1: a multi-game legacy leaderboard is not a Live Trivia prize),
 * and not a slot-pinned game-winner prize (rules 1–3 own those).
 */
export const isRule4Candidate = (campaign: ChallengeCampaign, venueId: string): boolean => {
  if (!campaign.isActive || campaign.winnerUserId) return false;
  if (campaign.venueIds.length !== 1 || campaign.venueIds[0] !== venueId) return false;
  const gameTypes = campaign.gameTypes ?? [];
  const liveTriviaOnly =
    gameTypes.every((type) => type === LIVE_TRIVIA_GAME_TYPE) &&
    (gameTypes.length > 0 || campaign.rewardDefinitionId === LIVE_TRIVIA_REWARD_DEFINITION_ID);
  if (!liveTriviaOnly) return false;
  if (campaign.winCondition === "game_winner") {
    return normalizeGameWinnerSlots(campaign.gameWinnerSlots) === null;
  }
  return campaign.winCondition === "ranked_places" || campaign.winCondition === "points_threshold";
};

/**
 * Does this prize still have a Live Trivia game it could count? `remaining` is the
 * venue's live-or-upcoming games AFTER the change (liveOrUpcomingGameSlots). Pure.
 */
export const prizeHasGameLeft = (
  campaign: ChallengeCampaign,
  remaining: readonly RewardGameSlot[],
): boolean => {
  if (campaign.winCondition === "points_threshold") {
    const days = new Set(campaign.activeDays.map((day) => String(day ?? "").trim().toLowerCase()));
    return days.size === 0 ? remaining.length > 0 : remaining.some((slot) => days.has(slot.weekday));
  }
  const pins = normalizeGameWinnerSlots(campaign.gameWinnerSlots);
  if (campaign.winCondition === "ranked_places" && pins !== null) {
    const left = new Set(remaining.map(slotKey));
    return pins.some((pin) => left.has(slotKey(pin)));
  }
  return remaining.length > 0;
};

const failureMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Pay a week the settle ranked for an early close. False when the award fails: the
 * prize then stays active, and the log line carries the whole plan so the week can be
 * paid by hand (after a delete its answers are gone).
 */
const payWeekClose = async (plan: RankedWeekClosePlan, now: Date): Promise<boolean> => {
  try {
    const { payPlannedWeekClose } = await import("@/lib/liveTriviaRankedRewards");
    await payPlannedWeekClose(plan, now);
    return true;
  } catch (error) {
    console.error("[RankedReward] early-close-award-failed", {
      campaignId: plan.campaignId,
      venueId: plan.venueId,
      cycleStart: plan.cycleStart.toISOString(),
      participantCount: plan.participantCount,
      gameCount: plan.gameCount,
      places: plan.places.map((place) => ({ place: place.place, userId: place.userId, totalPoints: place.totalPoints })),
      message: failureMessage(error, "Failed to award the week."),
    });
    return false;
  }
};

/**
 * The venue's schedules as they WILL be after the change a dry run previews: the
 * changed schedule dropped, then re-added in its edited form if it stays here. An
 * edited row the read didn't return (an ended one-off) is built from the edit.
 */
export const simulateScheduleChange = (
  stored: readonly AdminLiveShowdownSchedule[],
  scheduleId: string,
  venueId: string,
  dryRun: DryRunScheduleChange,
): AdminLiveShowdownSchedule[] => {
  const others = stored.filter((schedule) => schedule.id !== scheduleId);
  const edit = dryRun.schedule;
  if (!edit || String(edit.venueId ?? "").trim() !== venueId) return others;
  const base: AdminLiveShowdownSchedule = stored.find((schedule) => schedule.id === scheduleId) ?? {
    id: scheduleId,
    title: "",
    startTime: edit.startTime,
    timezone: edit.timezone,
    recurringType: edit.recurringType,
    recurringDays: edit.recurringDays,
    numRounds: edit.numRounds,
    venueId,
    intermissionAdDelaySeconds: 0,
    lobbyAdEnabled: true,
    createdAt: "",
    updatedAt: "",
  };
  return [...others, { ...base, ...edit, id: scheduleId, venueId }];
};

/**
 * Rule 4 (see the header). One trivia_schedules read, and only when the venue has
 * a candidate prize. A failed read retires nothing: a prize kept live by mistake
 * is recoverable; one ended by our own outage is not.
 */
const retireLiveTriviaPrizesWithNoGamesLeft = async (params: {
  venueId: string;
  scheduleId: string;
  campaigns: readonly ChallengeCampaign[];
  report: GameSlotCascadeReport;
  now: Date;
  dryRun: DryRunScheduleChange | null;
  settled: ReadonlySet<string>;
  weekCloses?: ReadonlyMap<string, RankedWeekClosePlan>;
  /** The settle's one schedules read (R7); omitted = read them here. */
  preloadedSchedules?: readonly TriviaScheduleRow[];
}): Promise<void> => {
  const { venueId, scheduleId, report, now, dryRun } = params;
  const candidates = params.campaigns.filter((campaign) => isRule4Candidate(campaign, venueId));
  if (candidates.length === 0) return;

  let remaining: RewardGameSlot[];
  try {
    // Lazy: lib/liveShowdownAdmin.ts is this module's caller.
    const admin = await import("@/lib/liveShowdownAdmin");
    const stored = (
      params.preloadedSchedules
        ? admin.venueSchedulesFromRows(params.preloadedSchedules, [venueId], now)
        : await admin.listVenueLiveShowdownSchedules([venueId], now)
    ).filter((schedule) => schedule.venueId === venueId);
    const schedules = dryRun ? simulateScheduleChange(stored, scheduleId, venueId, dryRun) : stored;
    remaining = liveOrUpcomingGameSlots(schedules, now);
  } catch (error) {
    const message = failureMessage(error, "Failed to read the venue's Live Trivia games.");
    for (const campaign of candidates) report.errors.push({ campaignId: campaign.id, message });
    return;
  }

  const orphaned = candidates.filter((campaign) => !prizeHasGameLeft(campaign, remaining));
  if (orphaned.length === 0) return;
  if (dryRun) {
    // No payout sweeps and no writes: report what the real run would retire.
    report.retiredNoGamesLeft.push(...orphaned.map((campaign) => campaign.id));
    return;
  }

  // A prize that pays after games retires only if settleVenueBeforeScheduleChange
  // confirmed it beforehand. The only payment here is a week that step ranked for an
  // early close (R7): paid now, once the change has really happened, then retired.
  for (const campaign of orphaned) {
    if (campaign.winCondition !== "points_threshold" && !params.settled.has(campaign.id)) {
      report.errors.push({ campaignId: campaign.id, message: NOT_RETIRED_UNSETTLED_MESSAGE });
      continue;
    }
    const plan = params.weekCloses?.get(campaign.id);
    if (plan && !(await payWeekClose(plan, now))) {
      report.errors.push({ campaignId: campaign.id, message: NOT_RETIRED_UNSETTLED_MESSAGE });
      continue;
    }
    try {
      // Retired, never deleted (rule 2): coupons already won stay in wallets.
      await updateChallengeCampaign({ id: campaign.id, isActive: false });
      report.retiredNoGamesLeft.push(campaign.id);
    } catch (error) {
      report.errors.push({ campaignId: campaign.id, message: failureMessage(error, "Failed to retire prize.") });
    }
  }
};

// ── Settle before the change (Phase R1) ─────────────────────────────────────

/** What the partner sees when a change is refused because a payout couldn't be confirmed (Q6). */
export const SCHEDULE_CHANGE_SETTLEMENT_MESSAGE = "Couldn't pay this game's prizes first. Try again.";

const NOT_RETIRED_UNSETTLED_MESSAGE = "Not retired: its payout wasn't confirmed before the change.";

/**
 * A schedule change refused because a prize it would end or shrink couldn't be
 * confirmed as paid first. Thrown BEFORE anything is written, so a retry is safe.
 * The owner and admin routes answer 409 with the message.
 */
export class ScheduleChangeSettlementError extends Error {
  readonly failures: ReadonlyArray<{ campaignId: string; message: string }>;

  constructor(failures: ReadonlyArray<{ campaignId: string; message: string }>) {
    super(SCHEDULE_CHANGE_SETTLEMENT_MESSAGE);
    this.name = "ScheduleChangeSettlementError";
    this.failures = failures;
  }
}

export const isScheduleChangeSettlementError = (error: unknown): error is ScheduleChangeSettlementError =>
  error instanceof ScheduleChangeSettlementError ||
  (error instanceof Error && error.name === "ScheduleChangeSettlementError");

/** A change that hasn't been written yet: what the cascade will be told, plus the dry run's stand-in. */
export type PendingScheduleChange = Pick<ScheduleChangeParams, "survivingWeekdays" | "survivingRecurrence"> &
  DryRunScheduleChange;

const paysAfterGames = (campaign: ChallengeCampaign): boolean =>
  campaign.winCondition === "game_winner" || campaign.winCondition === "ranked_places";

/**
 * Does a payout sweep's error `scope` leave this prize unconfirmed? Its own id, a
 * whole-sweep failure, or a game at this venue (`<scheduleId>@<date>`, matched
 * against the venue's schedules BEFORE the change, so the one being changed counts).
 */
const scopeBlocks = (scope: string, campaignId: string, venueScheduleIds: ReadonlySet<string>): boolean => {
  if (scope === campaignId || scope.startsWith(`${campaignId}@`) || scope.startsWith(`${campaignId}:`)) return true;
  if (scope === "schedules" || scope === "settlements") return true;
  const at = scope.indexOf("@");
  return at > 0 && venueScheduleIds.has(scope.slice(0, at));
};

/** What the pre-change step hands the cascade after the write. */
export type ScheduleChangeSettlement = {
  /** Places / winner prizes the change ends or shrinks, confirmed as paid up (rules 1–4 may change them). */
  settledCampaignIds: Set<string>;
  /** Weeks ranked for an early close, by prize id; paid only when rule 4 really retires the prize (R7). */
  weekCloses: Map<string, RankedWeekClosePlan>;
};

/**
 * Pay what's owed at ONE venue before its schedule changes (Phase R1, R7). Called by
 * lib/liveShowdownAdmin.ts before trivia_session_questions, live_showdown_answers
 * or trivia_schedules is touched (for a move, once per venue). Reads the venue's
 * prizes ONCE and, when it has a game-winner or weekly-places prize, its schedules
 * ONCE; both feed every step below (R7: no step reads them again):
 *   (a) the A3 dry run (runCascade, never a second rule set) finds the prizes the
 *       change would end or shrink;
 *   (b) the payout sweeps run for this venue only (games ended in the last 6 hours,
 *       finished weeks) for every active game-winner / weekly-places prize, ended by
 *       the change or not: a delete takes the schedule's answers;
 *   (c) a weekly places prize the change would RETIRE has its current week RANKED on
 *       the nights already played (planRankedWeekEarlyClose, Q5). Nothing is paid:
 *       the plan is returned in `weekCloses` and paid after the write by rule 4.
 * Throws ScheduleChangeSettlementError when a payout or plan can't be confirmed (Q6).
 * A venue with no game-winner or weekly-places prize costs one read and never refuses.
 */
export const settleVenueBeforeScheduleChange = async (params: {
  venueId: string | null;
  scheduleId: string;
  change: PendingScheduleChange;
  nowMs: number;
}): Promise<ScheduleChangeSettlement> => {
  const settledCampaignIds = new Set<string>();
  const weekCloses = new Map<string, RankedWeekClosePlan>();
  const venueId = String(params.venueId ?? "").trim();
  const scheduleId = String(params.scheduleId ?? "").trim();
  if (!venueId || !scheduleId) return { settledCampaignIds, weekCloses };
  const { nowMs, change } = params;

  const refuse = (failures: Array<{ campaignId: string; message: string }>): never => {
    console.error("[RewardCascade] schedule-change-refused", { venueId, scheduleId, failures });
    throw new ScheduleChangeSettlementError(failures);
  };

  let campaigns: ChallengeCampaign[];
  try {
    campaigns = await listChallengeCampaigns({ venueId });
  } catch (error) {
    // Can't tell what the change ends, so can't tell it owes nothing.
    return refuse([{ campaignId: "*", message: failureMessage(error, "Failed to read the venue's prizes.") }]);
  }
  // Every places/winner prize at the venue, not only those the change ends: a delete takes the
  // schedule's answers with it, and an edit moves the start time the sweep enumerates games from,
  // so a game that ended minutes ago would never be paid (Phase R's second review, findings 1–2).
  const atVenue = campaigns.filter((campaign) => campaign.isActive && paysAfterGames(campaign));
  if (atVenue.length === 0) return { settledCampaignIds, weekCloses };

  let schedules: TriviaScheduleRow[];
  try {
    const { loadLiveTriviaSchedulesForVenues } = await import("@/lib/liveShowdownEngine");
    schedules = await loadLiveTriviaSchedulesForVenues([venueId]);
  } catch (error) {
    return refuse([{ campaignId: "*", message: failureMessage(error, "Failed to read the venue's Live Trivia games.") }]);
  }
  const preloaded: PreloadedVenueRows = { campaigns, schedules };

  let report: GameSlotCascadeReport;
  try {
    ({ report } = await runCascade(
      {
        scheduleId,
        venueId,
        survivingWeekdays: change.survivingWeekdays,
        survivingRecurrence: change.survivingRecurrence,
        now: new Date(nowMs),
      },
      { schedule: change.schedule },
      preloaded,
    ));
  } catch (error) {
    return refuse([{ campaignId: "*", message: failureMessage(error, "Failed to read the venue's prizes.") }]);
  }

  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const payable = (ids: readonly string[]): ChallengeCampaign[] => [
    ...new Map(
      ids.flatMap((id) => {
        const campaign = byId.get(id);
        return campaign && paysAfterGames(campaign) ? [[id, campaign] as const] : [];
      }),
    ).values(),
  ];
  // A failed rule-4 read in the dry run hides whether a places/winner prize ends.
  const unreadable = payable(report.errors.map((error) => error.campaignId));
  if (unreadable.length > 0) {
    return refuse(
      unreadable.map((campaign) => ({
        campaignId: campaign.id,
        message: report.errors.find((error) => error.campaignId === campaign.id)?.message ?? "Unreadable.",
      })),
    );
  }
  const ending = [...report.deactivated, ...report.retiredForRecurrenceChange, ...report.retiredNoGamesLeft];
  const affected = payable([...ending, ...report.pruned.map((entry) => entry.campaignId)]);
  const affectedIds = new Set(affected.map((campaign) => campaign.id));

  const failures = new Map<string, string>();
  const failAll = (list: readonly ChallengeCampaign[], message: string) => {
    for (const campaign of list) if (!failures.has(campaign.id)) failures.set(campaign.id, message);
  };

  const venueScheduleIds = new Set([scheduleId, ...schedules.map((row) => row.id)]);
  // A prize the change ends is blocked by an error on any of the venue's games; one it leaves
  // running only by an error on the game being changed (the only one whose answers or times move).
  const changedScheduleIds = new Set([scheduleId]);
  const scope = { venueIds: [venueId], campaigns, schedules };
  const matchErrors = (list: readonly ChallengeCampaign[], errors: ReadonlyArray<{ scope: string; message: string }>) => {
    for (const campaign of list) {
      const ids = affectedIds.has(campaign.id) ? venueScheduleIds : changedScheduleIds;
      const failure = errors.find((error) => scopeBlocks(error.scope, campaign.id, ids));
      if (failure) failures.set(campaign.id, failure.message);
    }
  };

  const winners = atVenue.filter((campaign) => campaign.winCondition === "game_winner");
  if (winners.length > 0) {
    try {
      const { resolveGameWinnerRewards } = await import("@/lib/liveTriviaWinnerRewards");
      matchErrors(winners, (await resolveGameWinnerRewards(nowMs, scope)).errors);
    } catch (error) {
      failAll(winners, failureMessage(error, "Failed to pay game winners."));
    }
  }

  const ranked = atVenue.filter((campaign) => campaign.winCondition === "ranked_places");
  if (ranked.length > 0) {
    try {
      const { isLiveTriviaRankedCampaign, planRankedWeekEarlyClose, rankedRewardConfigError, resolveRankedPlaceRewards } =
        await import("@/lib/liveTriviaRankedRewards");
      // The sweep never pays a places prize it doesn't own or can't read (an admin-edited
      // row): nothing is owed, so it neither blocks the change nor gets a week closed.
      const owed = ranked.filter(
        (campaign) => isLiveTriviaRankedCampaign(campaign) && rankedRewardConfigError(campaign) === null,
      );
      if (owed.length > 0) matchErrors(owed, (await resolveRankedPlaceRewards(nowMs, scope)).errors);
      const retiring = new Set(ending);
      for (const campaign of owed) {
        if (!retiring.has(campaign.id) || failures.has(campaign.id)) continue;
        try {
          const early = await planRankedWeekEarlyClose({ campaign, schedules, nowMs });
          if (early.outcome === "planned") weekCloses.set(campaign.id, early.plan);
        } catch (error) {
          failures.set(campaign.id, failureMessage(error, "Failed to rank this week."));
        }
      }
    } catch (error) {
      failAll(ranked, failureMessage(error, "Failed to pay weekly places."));
    }
  }

  if (failures.size > 0) {
    return refuse([...failures].map(([campaignId, message]) => ({ campaignId, message })));
  }
  for (const campaign of affected) settledCampaignIds.add(campaign.id);
  return { settledCampaignIds, weekCloses };
};

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
  /** From settleVenueBeforeScheduleChange, run before the write. */
  settledCampaignIds?: ReadonlySet<string>;
  /** From settleVenueBeforeScheduleChange: early closes rule 4 pays before retiring (R7). */
  weekCloses?: ReadonlyMap<string, RankedWeekClosePlan>;
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
    return emptyCascadeReport();
  }
}
