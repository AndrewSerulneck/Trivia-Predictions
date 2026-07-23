import "server-only";

import { createChallengeCampaign } from "@/lib/challengeCampaigns";
import {
  listAdminLiveShowdownSchedules,
  type AdminLiveShowdownSchedule,
} from "@/lib/liveShowdownAdmin";
import { getTimeZoneParts } from "@/lib/categoryBlitzScheduleTime";
import { isRewardsEnabled } from "@/lib/rewardsFlags";
import {
  getRewardDefinition,
  isSupportedRewardCadence,
  isValidRewardThreshold,
  renderRewardRequirement,
  type RewardDefinitionId,
} from "@/lib/rewardDefinitions";
import type {
  CampaignRecurringType,
  ChallengeCampaign,
  ChallengeWinCondition,
  RewardDiscountKind,
  RewardMenuItem,
  RewardPrizeKind,
} from "@/types";

// ── Rewards (Phase 4) ───────────────────────────────────────────────────────
// Rewards are pre-set, constrained challenges a venue offers its guests. Like
// owner Competitions (lib/ownerCompetitions.ts), this is a thin definition +
// gating boundary over the existing challenge_campaigns engine — NOT a new
// engine. The caller never sends raw engine fields; it picks a definition (the
// client-safe registry in lib/rewardDefinitions.ts), a cadence, a prize, and a
// quantity, which are expanded into the full createChallengeCampaign input here.
//
// The Live Trivia Challenge gates on the venue already having Live Trivia
// scheduled (source of truth: the `trivia_schedules` table, read via
// lib/liveShowdownAdmin.listAdminLiveShowdownSchedules). The venue's schedule
// also drives which cadence options are offered and the weekday anchor a weekly
// reward's cycle math needs.

export {
  REWARD_DEFINITIONS,
  getRewardDefinition,
  renderRewardRequirement,
  isSupportedRewardCadence,
  SUPPORTED_REWARD_CADENCES,
  type RewardDefinition,
  type RewardDefinitionId,
} from "@/lib/rewardDefinitions";

// Live Trivia admin schedules are read across ALL venues then filtered here (a
// venue won't have hundreds of upcoming schedules). Mirrors lib/ownerSchedule.ts.
const LIVE_TRIVIA_SCHEDULE_FETCH_LIMIT = 200;
const WINNER_QUOTA_CAP = 100;

const VALID_MENU_ITEMS: readonly RewardMenuItem[] = [
  "whole_order",
  "appetizer",
  "entree",
  "dessert",
  "wine_bottle",
  "other",
];

// Sentinel messages the route layer maps to specific HTTP statuses (mirrors the
// OWNER_COMPETITION_* pattern in lib/ownerCompetitions.ts).
export const REWARD_UNKNOWN_DEFINITION_MESSAGE = "Unknown reward type.";
export const REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE =
  "Schedule Live Trivia to create a Live Trivia reward.";
export const REWARD_UNSUPPORTED_CADENCE_MESSAGE =
  "That competition cadence isn't available for this reward.";
export const REWARD_INVALID_THRESHOLD_MESSAGE = "Enter a valid points target.";
export const REWARD_THRESHOLD_NOT_MULTIPLE_OF_TEN_MESSAGE =
  "Custom target must be a multiple of 10.";
export const REWARD_GAME_WINNER_UNSUPPORTED_MESSAGE =
  "This reward can't be offered to the winner of the game.";
export const REWARD_GAME_WINNER_DISABLED_MESSAGE =
  "Winner-of-the-game rewards aren't available yet.";
export const REWARD_INVALID_QUANTITY_MESSAGE =
  "Enter how many of this prize are available.";
export const REWARD_INVALID_PRIZE_MESSAGE = "Choose a valid prize for this reward.";

/** A schedule counts as recurring if it repeats at all (a type or specific days). */
function isRecurringSchedule(schedule: AdminLiveShowdownSchedule): boolean {
  return schedule.recurringType !== "none" || schedule.recurringDays.length > 0;
}

/**
 * The weekday key(s) a schedule runs on — the anchor a weekly reward's
 * computeCycleStart needs. Prefer explicit recurring_days; otherwise fall back
 * to the weekday of the schedule's start_time in its own timezone.
 */
function scheduleWeekdays(schedule: AdminLiveShowdownSchedule): string[] {
  if (schedule.recurringDays.length > 0) return [...schedule.recurringDays];
  const parsed = Date.parse(schedule.startTime);
  if (!Number.isFinite(parsed)) return [];
  return [getTimeZoneParts(new Date(parsed), schedule.timezone).weekday];
}

/** All Live Trivia schedules for one venue (source of truth: trivia_schedules). */
export async function getVenueLiveTriviaSchedules(
  venueId: string,
): Promise<AdminLiveShowdownSchedule[]> {
  const vid = String(venueId ?? "").trim();
  if (!vid) return [];
  const all = await listAdminLiveShowdownSchedules(LIVE_TRIVIA_SCHEDULE_FETCH_LIMIT);
  return all.filter((schedule) => schedule.venueId === vid);
}

export type RewardCreationContext = {
  definitionId: RewardDefinitionId;
  /** Whether the reward's required game is scheduled at this venue at all. */
  scheduled: boolean;
  /** Whether any qualifying schedule recurs (unlocks the recurring cadence). */
  hasRecurringSchedule: boolean;
  /** The weekday keys the required game runs on (weekly-cycle anchor). */
  scheduleDays: string[];
  /** The venue's schedule timezone, if any schedule exists. */
  timezone: string | null;
  /** Cadences the wizard may offer, already intersected with what the engine supports. */
  allowedCadences: CampaignRecurringType[];
};

/**
 * Resolve whether a reward definition can be created at a venue and which cadence
 * options to offer, by reading the venue's schedule for the definition's required
 * live game. Blocks (empty allowedCadences + scheduled=false) when the game isn't
 * scheduled — the UI turns that into the "schedule it first" message + link.
 */
export async function resolveRewardCreationContext(
  venueId: string,
  definitionId: string,
): Promise<RewardCreationContext> {
  const definition = getRewardDefinition(definitionId);
  if (!definition) throw new Error(REWARD_UNKNOWN_DEFINITION_MESSAGE);

  const schedules =
    definition.requiresScheduledGame === "live_trivia"
      ? await getVenueLiveTriviaSchedules(venueId)
      : [];

  const scheduled = schedules.length > 0;
  const hasRecurringSchedule = schedules.some(isRecurringSchedule);
  const scheduleDays = Array.from(new Set(schedules.flatMap(scheduleWeekdays)));
  const timezone = schedules[0]?.timezone ?? null;

  // A one-off reward is always possible once the game is scheduled; a recurring
  // (weekly) reward only when the schedule itself recurs AND resolves to at
  // least one weekday anchor. A recurring schedule with no resolvable weekday
  // (scheduleWeekdays returns []) would otherwise expand into activeDays: []
  // downstream, which computeCycleStart silently treats as the epoch sentinel
  // — the reward would quietly behave like a one-time reward instead of a
  // weekly one. Treat that combination as unscheduled/non-recurring instead.
  const allowedCadences: CampaignRecurringType[] = [];
  if (scheduled) {
    allowedCadences.push("none");
    if (hasRecurringSchedule && scheduleDays.length > 0) allowedCadences.push("weekly");
  }

  return {
    definitionId: definition.id,
    scheduled,
    hasRecurringSchedule,
    scheduleDays,
    timezone,
    allowedCadences: allowedCadences.filter((cadence) => isSupportedRewardCadence(cadence)),
  };
}

// Discriminated prize input — the wizard sends one of these shapes.
export type RewardPrizeInput =
  | {
      prizeKind: "menu_item";
      menuItem: RewardMenuItem;
      menuItemName?: string | null;
      discountKind: RewardDiscountKind;
      discountValue: number;
    }
  | { prizeKind: "gift_card"; amount: number };

type NormalizedRewardPrize = {
  prizeKind: RewardPrizeKind;
  prizeMenuItem: RewardMenuItem | null;
  prizeMenuItemName: string | null;
  prizeDiscountKind: RewardDiscountKind | null;
  prizeDiscountValue: number | null;
  prizeGiftCertificateAmount: number | null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Validate the prize input and normalize it into engine (createChallengeCampaign) fields. */
function normalizeRewardPrize(prize: RewardPrizeInput | undefined): NormalizedRewardPrize {
  if (!prize) throw new Error(REWARD_INVALID_PRIZE_MESSAGE);

  if (prize.prizeKind === "gift_card") {
    const amount = Number(prize.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
    return {
      prizeKind: "gift_card",
      prizeMenuItem: null,
      prizeMenuItemName: null,
      prizeDiscountKind: null,
      prizeDiscountValue: null,
      prizeGiftCertificateAmount: round2(amount),
    };
  }

  if (prize.prizeKind === "menu_item") {
    if (!VALID_MENU_ITEMS.includes(prize.menuItem)) throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
    if (prize.discountKind !== "dollar" && prize.discountKind !== "percent") {
      throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
    }
    const discountValue = Number(prize.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
    }
    if (prize.discountKind === "percent" && discountValue > 100) {
      throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
    }
    const menuItemName =
      prize.menuItem === "other" ? String(prize.menuItemName ?? "").trim() : null;
    if (prize.menuItem === "other" && !menuItemName) throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
    return {
      prizeKind: "menu_item",
      prizeMenuItem: prize.menuItem,
      prizeMenuItemName: menuItemName,
      prizeDiscountKind: prize.discountKind,
      prizeDiscountValue: prize.discountKind === "dollar" ? round2(discountValue) : Math.round(discountValue),
      prizeGiftCertificateAmount: null,
    };
  }

  throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
}

export type CreateRewardParams = {
  venueId: string;
  definitionId: string;
  /** Must be one of the resolveRewardCreationContext allowedCadences for this venue. */
  cadence: CampaignRecurringType;
  /**
   * How the reward is won. "game_winner" awards the top scorer(s) of a finished
   * Live Trivia game and ignores `threshold` / `winnerQuota` entirely.
   */
  winCondition?: ChallengeWinCondition;
  /** Points target to win. Ignored when winCondition is "game_winner". */
  threshold: number;
  /** How many of this prize are available per cycle (the "quantity" step). */
  winnerQuota: number;
  prize: RewardPrizeInput;
  /** Stamp the creating owner (null/absent = admin-created). */
  createdByOwnerId?: string | null;
};

/**
 * Create a Reward — validate the chosen definition, cadence, threshold, quantity,
 * and prize against the venue's schedule, then expand into the challenge_campaigns
 * engine. Throws a sentinel message the route maps to 400/409. Assumes venue
 * ownership/authorization is already verified by the caller (as with owner
 * Competitions).
 *
 * Engine mapping:
 *   - weekly reward → single_day + recurringType "weekly", anchored on the day(s)
 *     the required game runs, so the multi-winner quota resets each week
 *     (computeCycleStart is weekly-anchored on activeDays[0]).
 *   - one-off reward → single_day + recurringType "none" (the one-time engine
 *     path; resolves once the quota is filled).
 */
export async function createReward(params: CreateRewardParams): Promise<ChallengeCampaign> {
  const definition = getRewardDefinition(params.definitionId);
  if (!definition) throw new Error(REWARD_UNKNOWN_DEFINITION_MESSAGE);

  const venueId = String(params.venueId ?? "").trim();
  if (!venueId) throw new Error(REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE);

  const context = await resolveRewardCreationContext(venueId, definition.id);
  if (!context.scheduled) throw new Error(REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE);

  const cadence = params.cadence ?? "none";
  if (!context.allowedCadences.includes(cadence)) {
    throw new Error(REWARD_UNSUPPORTED_CADENCE_MESSAGE);
  }

  const winCondition: ChallengeWinCondition =
    params.winCondition === "game_winner" ? "game_winner" : "points_threshold";
  if (winCondition === "game_winner" && !definition.supportsGameWinner) {
    throw new Error(REWARD_GAME_WINNER_UNSUPPORTED_MESSAGE);
  }
  if (winCondition === "game_winner" && !isRewardsEnabled()) {
    throw new Error(REWARD_GAME_WINNER_DISABLED_MESSAGE);
  }

  // A game-winner reward has no points target. points_required_to_win is NOT
  // NULL, so we write the sentinel 1 — it is never evaluated, because
  // recordChallengeProgress skips game_winner campaigns entirely and the
  // resolver cron is the only thing that awards them.
  const isGameWinner = winCondition === "game_winner";
  const threshold = isGameWinner ? 1 : Math.round(Number(params.threshold));
  if (!isGameWinner) {
    if (!Number.isFinite(threshold) || threshold < 1) throw new Error(REWARD_INVALID_THRESHOLD_MESSAGE);
    if (!isValidRewardThreshold(threshold)) throw new Error(REWARD_THRESHOLD_NOT_MULTIPLE_OF_TEN_MESSAGE);
  }

  // A game has exactly one first place, so a game-winner reward is always
  // quantity 1 — the wizard doesn't even ask. (Ties are handled at resolution
  // time by lib/liveTriviaWinnerRewards.ts, which widens the quota to the tie
  // count so co-winners are all honored.)
  const winnerQuota = isGameWinner ? 1 : Math.round(Number(params.winnerQuota));
  if (!isGameWinner && (!Number.isFinite(winnerQuota) || winnerQuota < 1 || winnerQuota > WINNER_QUOTA_CAP)) {
    throw new Error(REWARD_INVALID_QUANTITY_MESSAGE);
  }

  const prize = normalizeRewardPrize(params.prize);
  const isRecurring = cadence !== "none";

  // Defense in depth against the allowedCadences gate above: a weekly reward
  // must never expand with activeDays: [] — computeCycleStart silently treats
  // that as the epoch sentinel, so the quota would never reset.
  if (isRecurring && context.scheduleDays.length === 0) {
    throw new Error(REWARD_UNSUPPORTED_CADENCE_MESSAGE);
  }

  return createChallengeCampaign({
    name: definition.name,
    rules: renderRewardRequirement(definition, threshold, winCondition),
    winCondition,
    // CRITICAL: non-empty venue_ids so the reward is scoped to this venue. Empty
    // venue_ids would make the engine treat it as a global campaign (see
    // campaignMatchesVenue in lib/challengeCampaigns.ts).
    venueIds: [venueId],
    gameTypes: [definition.gameType],
    challengeMode: definition.challengeMode,
    pointsRequiredToWin: threshold,
    scheduleType: "single_day",
    recurringType: cadence,
    // Weekly rewards anchor on the day(s) the game runs so the cycle resets each
    // week; one-off rewards need no day restriction.
    activeDays: isRecurring ? context.scheduleDays : [],
    winnerQuota,
    rewardDefinitionId: definition.id,
    prizeKind: prize.prizeKind,
    prizeMenuItem: prize.prizeMenuItem,
    prizeMenuItemName: prize.prizeMenuItemName,
    prizeDiscountKind: prize.prizeDiscountKind,
    prizeDiscountValue: prize.prizeDiscountValue,
    prizeGiftCertificateAmount: prize.prizeGiftCertificateAmount,
    createdByOwnerId: params.createdByOwnerId ?? null,
  });
}
