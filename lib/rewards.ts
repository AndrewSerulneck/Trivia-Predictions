import "server-only";

import { createChallengeCampaign } from "@/lib/challengeCampaigns";
import {
  listAdminLiveShowdownSchedules,
  type AdminLiveShowdownSchedule,
} from "@/lib/liveShowdownAdmin";
import { getCurrentOrNextScheduleWindow } from "@/lib/categoryBlitzScheduleTime";
import { liveTriviaDurationMinutes } from "@/lib/liveTriviaShared";
import { coerceRecurringType } from "@/lib/ownerSchedule";
import {
  getRewardDefinition,
  isSupportedRewardCadence,
  isValidRewardThreshold,
  renderRewardRequirement,
  rewardThresholdStepMessage,
  type RewardDefinitionId,
} from "@/lib/rewardDefinitions";
import {
  allowedPeriodsFor,
  cadenceForPeriod,
  periodForCadence,
  summarizeRewardSchedules,
  validateRewardTerms,
  type RewardScheduleFacts,
  type RewardScheduleShape,
} from "@/lib/rewardTerms";
import {
  enumerateGameSlots,
  scheduleRunWeekdays,
  validateGameWinnerSlots,
  type RewardGameScheduleShape,
  type RewardGameSlot,
} from "@/lib/rewardGameSlots";
import {
  NFL_WEEK_SCOPE_INVALID_MESSAGE,
  REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE,
  deriveNFLWeekScopeTerms,
  normalizeNFLWeekScope,
  resolveNFLRewardStartDate,
  type NFLRewardSeasonContext,
  type NFLRewardWeekScope,
  type NFLWeekScopeTerms,
} from "@/lib/nflPickEmRewardWeeks";
import { getSeasonFirstWeekStartDate, listNFLWeeks } from "@/lib/nflPickEm";
import { getLocalDateKey } from "@/lib/timezone";
import type {
  CampaignRecurringType,
  ChallengeCampaign,
  ChallengeGameWinnerSlot,
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
//
// The NFL Pick 'Em Challenge is the second gate shape: it hangs off the NFL
// season calendar (`nfl_pickem_weeks`), which no venue controls. It therefore
// takes NONE of the schedule-shaped machinery above — no schedule shapes, no
// terms sentence, no game slots. Its cadence, quota, activeDays and date bounds
// are derived from a week SCOPE by lib/nflPickEmRewardWeeks.ts, exactly the way a
// slot selection derives them for a Live Trivia game-winner reward. The two paths
// meet again only at the shared prize normalization + createChallengeCampaign
// call at the bottom of createReward.

export {
  REWARD_DEFINITIONS,
  getRewardDefinition,
  renderRewardRequirement,
  isSupportedRewardCadence,
  SUPPORTED_REWARD_CADENCES,
  type RewardDefinition,
  type RewardDefinitionId,
} from "@/lib/rewardDefinitions";

export { REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE };

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
// REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE (the NFL equivalent, mapped to 409 by
// the routes) now lives in lib/nflPickEmRewardWeeks.ts and is re-exported above
// — that module is client-safe, so the wizard's "not available" block can use
// the exact same string.
export const REWARD_UNSUPPORTED_CADENCE_MESSAGE =
  "That competition cadence isn't available for this reward.";
export const REWARD_INVALID_THRESHOLD_MESSAGE = "Enter a valid points target.";
// A threshold that misses the definition's step is no longer one fixed string —
// the step is per-definition (10 for Live Trivia points, 1 for NFL correct
// picks), so the message is composed by rewardThresholdStepMessage and raised as
// a RewardTermsError, which every route already maps to 400 by TYPE.
export const REWARD_GAME_WINNER_UNSUPPORTED_MESSAGE =
  "This reward can't be offered to the winner of the game.";
export const REWARD_INVALID_QUANTITY_MESSAGE =
  "Enter how many of this prize are available.";
export const REWARD_INVALID_PRIZE_MESSAGE = "Choose a valid prize for this reward.";

/**
 * A terms-sentence violation ("you run 1 game a week, you can't promise 2
 * rewards a week"). Its message is composed from the venue's own numbers rather
 * than drawn from a fixed set, so routes detect it by type instead of by string
 * equality — every one of these is a 400, never a 500.
 */
export class RewardTermsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardTermsError";
  }
}

/** A schedule counts as recurring if it repeats at all (a type or specific days). */
function isRecurringSchedule(schedule: AdminLiveShowdownSchedule): boolean {
  return schedule.recurringType !== "none" || schedule.recurringDays.length > 0;
}

/**
 * The weekday key(s) a schedule actually runs on. Two jobs: it anchors a weekly
 * reward's computeCycleStart (activeDays[0]), and it becomes the reward's
 * `activeDays`, which isCampaignEligibleAtTime uses to gate whether points may
 * accrue at all on a given day.
 *
 * That second job is why the recurrence type has to be honored rather than just
 * falling back to the start_time weekday:
 *   - daily — the game runs EVERY weekday. Anchoring on start_time's weekday
 *     would restrict a daily reward to one day in seven, leaving it dead the
 *     other six while its quota reset daily.
 *   - monthly / yearly — the occurrence lands on a different weekday from period
 *     to period, so no single weekday is right. Return none, meaning "no day
 *     restriction"; these cadences are calendar-anchored and never read
 *     activeDays for their cycle boundary anyway, and `gameTypes` already
 *     confines accrual to Live Trivia play.
 *   - weekly / one-off — explicit recurring_days when present, else the weekday
 *     of start_time, which is exactly right for a schedule that repeats weekly.
 */
function scheduleWeekdays(schedule: AdminLiveShowdownSchedule): string[] {
  // Delegates to lib/rewardGameSlots.ts so the picker, a reward's activeDays,
  // and the schedule-change cascade all read a schedule's days the same way.
  // NOT coerceRecurringType — that narrows to CategoryBlitzRecurringType
  // ("none" | "daily" | "weekly") and silently collapses monthly/yearly to
  // "none". trivia_schedules.recurring_type allows all five, and
  // AdminLiveShowdownSchedule.recurringType is already typed as all five.
  return scheduleRunWeekdays(schedule);
}

/**
 * Whether a schedule has a game that is live right now or still has a future
 * occurrence ahead of it. A one-off schedule is a single occurrence — once its
 * window ends the game no longer exists, even though its `trivia_schedules` row
 * is never deleted. Reuses the same occurrence-window math the owner schedule
 * page uses to bucket a schedule as "Upcoming" vs. "Past"
 * (getCurrentOrNextScheduleWindow), so "scheduled" here means the exact same
 * thing it means to the partner looking at their own schedule.
 */
function hasLiveOrUpcomingOccurrence(schedule: AdminLiveShowdownSchedule, now: Date): boolean {
  const startMs = Date.parse(schedule.startTime);
  if (!Number.isFinite(startMs)) return false;
  const windowMinutes = liveTriviaDurationMinutes(schedule.numRounds);
  const endTime = new Date(startMs + windowMinutes * 60_000).toISOString();
  const window = getCurrentOrNextScheduleWindow(
    {
      startTime: schedule.startTime,
      endTime,
      timezone: schedule.timezone,
      recurringType: coerceRecurringType(schedule.recurringType),
      recurringDays: schedule.recurringDays,
      windowMinutes,
    },
    now,
  );
  return window !== null;
}

/**
 * Live-or-upcoming Live Trivia schedules for one venue (source of truth:
 * trivia_schedules, filtered to occurrences that haven't already ended — see
 * hasLiveOrUpcomingOccurrence).
 */
export async function getVenueLiveTriviaSchedules(
  venueId: string,
  now: Date = new Date(),
): Promise<AdminLiveShowdownSchedule[]> {
  const vid = String(venueId ?? "").trim();
  if (!vid) return [];
  const all = await listAdminLiveShowdownSchedules(LIVE_TRIVIA_SCHEDULE_FETCH_LIMIT);
  return all.filter(
    (schedule) => schedule.venueId === vid && hasLiveOrUpcomingOccurrence(schedule, now),
  );
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
  /**
   * The venue's schedules reduced to what the terms sentence needs — every
   * period/quantity rule is derived from this by lib/rewardTerms.ts, on the client
   * (to hide impossible options) and here (to refuse them). Sending the shapes
   * rather than a pre-computed answer keeps the two sides on one implementation.
   */
  scheduleShapes: RewardScheduleShape[];
  /**
   * The individual games a game-winner reward can be pinned to — the picker's
   * options, and the set createReward re-validates a submitted selection
   * against. Empty for a venue with no live-or-upcoming game.
   */
  gameSlots: RewardGameSlot[];
  /**
   * Present only for definitions whose gate is the NFL season rather than a venue
   * schedule (today: nfl_pickem_challenge). null for every other definition, and
   * for an NFL reward when the season has no current-or-future weeks loaded.
   */
  nflSeason: NFLRewardSeasonContext | null;
};

/** The reward definition whose gate is the NFL season calendar, not a venue schedule. */
const NFL_REWARD_DEFINITION_ID = "nfl_pickem_challenge";

/**
 * The NFL calendar is published in US Eastern time and the leaderboard's week
 * list is still built in that zone (isNFLWeekStarted), so "which week are we in"
 * has to be asked in the same zone or a reward created late on a Wednesday night
 * would start a week early. (The PICKING surface no longer consults a timezone —
 * it rolls over at a fixed Tue 05:00 UTC; see nflWeekSpanMs in lib/nflPickEm.ts.)
 */
const NFL_SEASON_TIMEZONE = "America/New_York";

/**
 * What a reward creator needs to know about the season: which week it would start
 * from and where the season ends.
 *
 * The season number matches how the rest of NFL Pick 'Em resolves it
 * (app/api/nfl-pickem/weeks/route.ts) — the calendar year — so a reward can never
 * be pinned to a different season than the one the game page is showing.
 *
 * "Current, else next" falls straight out of `weekEndDate >= today`: a week that
 * hasn't ended yet is either the one being played or a future one, and the weeks
 * come back ordered by week_number.
 */
async function resolveNFLSeasonContext(now: Date): Promise<NFLRewardSeasonContext | null> {
  const season = now.getFullYear();
  // includeComplete: true — a finished week still has to count toward the
  // season's end date, and dropping them would make the LAST week of the season
  // look like the end of the calendar the moment it finals.
  const weeks = await listNFLWeeks(season, true);
  if (weeks.length === 0) return null;

  const today = getLocalDateKey(now, NFL_SEASON_TIMEZONE);
  const remaining = weeks.filter((week) => week.weekEndDate >= today);
  if (remaining.length === 0) return null;

  const fromWeek = remaining[0];
  const seasonEndDate = weeks.reduce(
    (latest, week) => (week.weekEndDate > latest ? week.weekEndDate : latest),
    weeks[0].weekEndDate,
  );

  return {
    season,
    fromWeek: fromWeek.weekNumber,
    fromWeekStartDate: fromWeek.weekStartDate,
    seasonEndDate,
    weeksRemaining: remaining.length,
  };
}

/**
 * Attach `upcomingStartDate` to any NFL Pick 'Em reward whose first covered NFL
 * week has not started yet, so the venue Rewards panel can say "Starts Sept 10"
 * instead of rendering a live-looking progress bar on something unwinnable for
 * weeks (docs/nfl-pickem-week1-early-access-plan.md, locked decisions).
 *
 * Set ONLY when the date is genuinely in the future — a campaign already in
 * season, or any non-NFL reward, comes back untouched. Costs zero queries when
 * the venue has no NFL rewards, and one cheap indexed read per distinct season
 * otherwise (never listNFLWeeks, which writes via update_nfl_week_status).
 */
export async function attachNFLRewardUpcomingState<
  T extends Pick<ChallengeCampaign, "nflWeekScope" | "startDate">,
>(campaigns: T[], now: Date = new Date()): Promise<Array<T & { upcomingStartDate?: string }>> {
  const nflCampaigns = campaigns.filter((campaign) => normalizeNFLWeekScope(campaign.nflWeekScope));
  if (nflCampaigns.length === 0) return campaigns;

  const seasons = new Set<number>();
  for (const campaign of nflCampaigns) {
    const scope = normalizeNFLWeekScope(campaign.nflWeekScope);
    if (scope) seasons.add(scope.season);
  }

  const firstWeekBySeason = new Map<number, string | null>();
  await Promise.all(
    [...seasons].map(async (season) => {
      firstWeekBySeason.set(season, await getSeasonFirstWeekStartDate(season));
    }),
  );

  const today = getLocalDateKey(now, NFL_SEASON_TIMEZONE);

  return campaigns.map((campaign) => {
    const scope = normalizeNFLWeekScope(campaign.nflWeekScope);
    if (!scope) return campaign;

    const startDate = resolveNFLRewardStartDate(scope, {
      campaignStartDate: campaign.startDate ?? null,
      seasonFirstWeekStartDate: firstWeekBySeason.get(scope.season) ?? null,
    });

    // Calendar-date strings compare correctly lexicographically in YYYY-MM-DD.
    if (!startDate || startDate <= today) return campaign;
    return { ...campaign, upcomingStartDate: startDate };
  });
}

/**
 * How a schedule really recurs, for reward purposes.
 *
 * A schedule with explicit recurring_days repeats weekly even when its
 * recurring_type column says "none" — the same reading isRecurringSchedule uses.
 * monthly/yearly are collapsed to "none" too: enumerateScheduleOccurrences
 * (lib/liveShowdownEngine.ts) — the single source of truth for when a
 * schedule's games actually happen — treats both as a single fixed start,
 * same as a one-off. There is no cron or admin flow that ever advances one
 * forward, so counting it as real recurrence here would lock a reward
 * ("1 every month") against a game that only ever plays once. The
 * owner-facing scheduler (app/owner/schedule/page.tsx) already hides
 * Monthly/Yearly for this exact reason.
 */
function rewardRecurringType(schedule: AdminLiveShowdownSchedule): CampaignRecurringType {
  const declared = schedule.recurringType;
  if (declared === "none" && schedule.recurringDays.length > 0) return "weekly";
  if (declared === "monthly" || declared === "yearly") return "none";
  return declared;
}

/** Reduce a venue's live-or-upcoming schedules to the terms-sentence inputs. */
function toScheduleShapes(schedules: AdminLiveShowdownSchedule[]): RewardScheduleShape[] {
  return schedules.map((schedule) => ({
    recurringType: rewardRecurringType(schedule),
    // A weekly schedule with no explicit recurring_days still runs once a week —
    // on the weekday of its own start_time (see scheduleWeekdays).
    weekdayCount: Math.max(1, scheduleWeekdays(schedule).length),
  }));
}

/**
 * Reduce the same schedules to the game-picker inputs: same recurrence reading,
 * but keyed by schedule id and carrying the weekdays themselves, because a
 * game-winner reward is pinned to individual `{scheduleId, weekday}` slots
 * rather than to a count. See lib/rewardGameSlots.ts.
 */
export function toGameScheduleShapes(
  schedules: AdminLiveShowdownSchedule[],
): RewardGameScheduleShape[] {
  return schedules.map((schedule) => ({
    scheduleId: schedule.id,
    title: schedule.title,
    recurringType: rewardRecurringType(schedule),
    weekdays: scheduleWeekdays(schedule),
    startTime: schedule.startTime,
    timezone: schedule.timezone,
  }));
}

/**
 * The individual Live Trivia games at a venue that a game-winner reward can be
 * pinned to. Same schedule source as the terms sentence
 * (getVenueLiveTriviaSchedules), so the picker can never offer a game the venue
 * doesn't actually have live or upcoming.
 */
export async function getVenueGameSlots(
  venueId: string,
  now: Date = new Date(),
): Promise<RewardGameSlot[]> {
  return enumerateGameSlots(toGameScheduleShapes(await getVenueLiveTriviaSchedules(venueId, now)));
}

/** The terms facts for a context DTO, on either side of the wire. */
export function rewardScheduleFacts(context: {
  scheduleShapes?: RewardScheduleShape[];
}): RewardScheduleFacts {
  return summarizeRewardSchedules(context.scheduleShapes ?? []);
}

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

  // ── NFL branch ────────────────────────────────────────────────────────────
  // Gated on the season calendar, so none of the venue-schedule fields below
  // apply: no shapes for the terms sentence (the scope replaces it), no game
  // slots (there is no venue-scheduled game to pin to), no schedule timezone.
  // scheduleDays stays empty on purpose — a weekly NFL reward's activeDays come
  // from NFL_REWARD_ACTIVE_DAYS via deriveNFLWeekScopeTerms, never from here.
  if (definition.id === NFL_REWARD_DEFINITION_ID) {
    const nflSeason = await resolveNFLSeasonContext(new Date());
    return {
      definitionId: definition.id,
      scheduled: nflSeason !== null,
      // The NFL season itself is the recurrence — every week is another contest.
      hasRecurringSchedule: nflSeason !== null,
      scheduleDays: [],
      timezone: null,
      // Exactly the two week-scope shapes: "weekly" and season-long ("none").
      allowedCadences: nflSeason ? ["none", "weekly"] : [],
      scheduleShapes: [],
      gameSlots: [],
      nflSeason,
    };
  }

  const schedules =
    definition.requiresScheduledGame === "live_trivia"
      ? await getVenueLiveTriviaSchedules(venueId)
      : [];

  const scheduled = schedules.length > 0;
  const hasRecurringSchedule = schedules.some(isRecurringSchedule);
  const scheduleDays = Array.from(new Set(schedules.flatMap(scheduleWeekdays)));
  const timezone = schedules[0]?.timezone ?? null;
  const scheduleShapes = toScheduleShapes(schedules);

  // A one-off reward is always possible once the game is scheduled. Recurring
  // periods come from the venue's actual schedule via lib/rewardTerms.ts — this
  // is the permissive (points-target) set; a game-winner reward narrows it
  // further, which validateRewardTerms enforces at creation.
  //
  // A weekly reward additionally needs at least one resolvable weekday anchor: a
  // recurring schedule whose weekday can't be resolved (scheduleWeekdays returns
  // []) would expand into activeDays: [], which computeCycleStart silently
  // treats as the epoch sentinel — the reward would quietly behave like a
  // one-time reward instead of a weekly one.
  const allowedCadences: CampaignRecurringType[] = ["none"];
  if (scheduled) {
    for (const period of allowedPeriodsFor(
      summarizeRewardSchedules(scheduleShapes),
      "points_threshold",
    )) {
      if (period === "weekly" && scheduleDays.length === 0) continue;
      allowedCadences.push(cadenceForPeriod(period));
    }
  }

  return {
    definitionId: definition.id,
    scheduled,
    hasRecurringSchedule,
    scheduleDays,
    timezone,
    allowedCadences: scheduled
      ? allowedCadences.filter((cadence) => isSupportedRewardCadence(cadence))
      : [],
    scheduleShapes,
    gameSlots: enumerateGameSlots(toGameScheduleShapes(schedules)),
    nflSeason: null,
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
  /**
   * How many of this prize are available per cycle — the [N] in the wizard's
   * terms sentence ("I want to make [N] of these rewards available every
   * [period]" for points-target, "give out" for game-winner).
   * For a game-winner reward this must equal the venue's real games in that
   * period exactly (see lib/rewardTerms.ts's lockedQuantityFor); it is not merely
   * a cap, because the resolver awards every finished game's winner regardless.
   */
  winnerQuota: number;
  prize: RewardPrizeInput;
  /**
   * Game-winner rewards: the exact scheduled games this reward is offered at.
   * When present, it REPLACES `cadence` and `winnerQuota` — both are derived
   * from the selection here, never taken from the client (see below). Absent
   * keeps the legacy period-based path, where the reward awards at every game.
   */
  gameWinnerSlots?: ChallengeGameWinnerSlot[] | null;
  /**
   * NFL Pick 'Em rewards: whether the reward runs every NFL week or once for the
   * rest of the season. Like `gameWinnerSlots`, it REPLACES `cadence` (and, for a
   * week winner, `winnerQuota`). Only its `kind` is honored — the season and
   * `fromWeek` are re-derived from the server's own reading of nfl_pickem_weeks,
   * so a client can't backdate the reward over weeks that already played.
   */
  nflWeekScope?: NFLRewardWeekScope | null;
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
 *   - slot-pinned game-winner reward → the same two shapes, except the cadence,
 *     quota and activeDays all come from the picked games rather than from the
 *     client (see the slot block below).
 */
export async function createReward(params: CreateRewardParams): Promise<ChallengeCampaign> {
  const definition = getRewardDefinition(params.definitionId);
  if (!definition) throw new Error(REWARD_UNKNOWN_DEFINITION_MESSAGE);

  // Which "you can't create this yet" message applies — see
  // REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE for why they must stay distinct.
  const isNFLReward = definition.id === NFL_REWARD_DEFINITION_ID;
  const unavailableMessage = isNFLReward
    ? REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE
    : REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE;

  const venueId = String(params.venueId ?? "").trim();
  if (!venueId) throw new Error(unavailableMessage);

  const context = await resolveRewardCreationContext(venueId, definition.id);
  if (!context.scheduled) throw new Error(unavailableMessage);

  const winCondition: ChallengeWinCondition =
    params.winCondition === "game_winner" ? "game_winner" : "points_threshold";
  if (winCondition === "game_winner" && !definition.supportsGameWinner) {
    throw new Error(REWARD_GAME_WINNER_UNSUPPORTED_MESSAGE);
  }

  // ── Slot-pinned game-winner rewards ───────────────────────────────────────
  // When the partner picked specific games, that selection IS the terms: the
  // cadence and the quota are DERIVED from it here and the client's own values
  // for both are discarded. Nothing — least of all whether a slot recurs — is
  // taken on trust, because every unit of quota is a real coupon at a real game
  // (docs/rewards-game-winner-picker-plan.md Phase 3). A selection is only
  // honored for game_winner; a points-target reward keeps the terms sentence.
  const slotSelection =
    !isNFLReward &&
    winCondition === "game_winner" &&
    params.gameWinnerSlots !== undefined &&
    params.gameWinnerSlots !== null
      ? validateGameWinnerSlots(context.gameSlots, params.gameWinnerSlots)
      : null;
  if (slotSelection && !slotSelection.ok) throw new RewardTermsError(slotSelection.message);
  const slots = slotSelection?.ok ? slotSelection.value : null;

  // ── NFL week-scoped rewards ───────────────────────────────────────────────
  // The scope IS the terms, the same way a slot selection is above. The client
  // picks only the SHAPE ("every week" vs "the rest of the season"); the season
  // and the starting week are re-read from context.nflSeason, because a
  // client-supplied fromWeek in the past would let a partner backdate a reward
  // over already-played weeks and mint prizes for contests nobody knew were
  // running. The dates handed to the derivation are the server's too — the whole
  // point of deriveNFLWeekScopeTerms refusing a dateless season scope is that
  // recurringType "none" with no startDate never closes.
  let nflTerms: NFLWeekScopeTerms | null = null;
  let nflWeekScope: NFLRewardWeekScope | null = null;
  if (isNFLReward) {
    const requested = normalizeNFLWeekScope(params.nflWeekScope);
    if (!requested) throw new RewardTermsError(NFL_WEEK_SCOPE_INVALID_MESSAGE);
    const season = context.nflSeason;
    if (!season) throw new Error(REWARD_NFL_SEASON_UNAVAILABLE_MESSAGE);

    nflWeekScope =
      requested.kind === "weekly"
        ? { kind: "weekly", season: season.season }
        : { kind: "season", season: season.season, fromWeek: season.fromWeek };

    const derived = deriveNFLWeekScopeTerms(nflWeekScope, {
      winCondition,
      quantity: Math.round(Number(params.winnerQuota)),
      startDate: season.fromWeekStartDate,
      endDate: season.seasonEndDate,
    });
    if (!derived.ok) throw new RewardTermsError(derived.message);
    nflTerms = derived.terms;
  }

  const cadence = nflTerms ? nflTerms.cadence : slots ? slots.terms.cadence : params.cadence ?? "none";
  if (!isSupportedRewardCadence(cadence)) {
    throw new Error(REWARD_UNSUPPORTED_CADENCE_MESSAGE);
  }

  // A game-winner reward has no points target. points_required_to_win is NOT
  // NULL, so we write the sentinel 1 — it is never evaluated, because
  // recordChallengeProgress skips game_winner campaigns entirely and the
  // resolver cron is the only thing that awards them.
  const isGameWinner = winCondition === "game_winner";
  const threshold = isGameWinner ? 1 : Math.round(Number(params.threshold));
  if (!isGameWinner) {
    if (!Number.isFinite(threshold) || threshold < 1) throw new Error(REWARD_INVALID_THRESHOLD_MESSAGE);
    if (!isValidRewardThreshold(threshold, definition)) {
      throw new RewardTermsError(rewardThresholdStepMessage(definition));
    }
  }

  // ── The terms sentence is the contract ────────────────────────────────────
  // "I want to make [N] of these rewards available every [period]." The period
  // IS the campaign's recurrence and N IS the winner quota, so both are validated here
  // against the venue's real schedule — the wizard hides impossible combinations,
  // but it is never the only gate (docs/rewards-terms-sentence-plan.md §1d).
  //
  // For a game-winner reward N is locked to the games in the period rather than
  // chosen: each game produces one winner, so N games = N prizes. It is still
  // range-checked here because the client computed it.
  //
  // A slot-pinned reward skips the sentence entirely — its selection already
  // answers "how many, how often", and the period rules it would be judged
  // against (exactGameCountForPeriod) are exactly what the picker replaces.
  //
  // An NFL reward skips it for a stronger reason still: validateRewardTerms
  // judges a proposal against the venue's LIVE TRIVIA schedule, and an NFL reward
  // has none. Its quota is already range-checked inside deriveNFLWeekScopeTerms
  // (1…REWARD_MAX_QUANTITY for a picks target, exactly 1 for a week winner —
  // refused, never clamped).
  const winnerQuota = nflTerms
    ? nflTerms.quota
    : slots
      ? slots.terms.quota
      : Math.round(Number(params.winnerQuota));
  if (!slots && !nflTerms) {
    const termsError = validateRewardTerms(rewardScheduleFacts(context), {
      winCondition,
      period: periodForCadence(cadence),
      quantity: winnerQuota,
    });
    if (termsError) throw new RewardTermsError(termsError);
  }
  if (!Number.isFinite(winnerQuota) || winnerQuota < 1 || winnerQuota > WINNER_QUOTA_CAP) {
    throw new Error(REWARD_INVALID_QUANTITY_MESSAGE);
  }

  const prize = normalizeRewardPrize(params.prize);
  const isRecurring = cadence !== "none";
  // A slot-pinned reward is live on the weekdays it was pinned to — NOT on every
  // weekday the venue runs a game, which is what context.scheduleDays would say.
  // These become activeDays, the accrual/eligibility gate, so widening them here
  // would re-open the games the partner deliberately left out.
  //
  // An NFL reward's days come from the scope for BOTH cadences, including the
  // season-long one ("none"): activeDays is also the accrual gate, and an NFL
  // week settles Thu/Sun/Mon, so all seven days must be present either way.
  const activeDays = nflTerms
    ? nflTerms.activeDays
    : isRecurring
      ? slots
        ? slots.terms.weekdays
        : context.scheduleDays
      : [];

  // Defense in depth: a WEEKLY reward must never expand with activeDays: [] —
  // computeCycleStart anchors the weekly cycle on activeDays[0] and silently
  // treats an empty list as the epoch sentinel, so the quota would never reset.
  // Daily/monthly/yearly cycles are calendar-anchored and don't need the anchor
  // (their activeDays only restrict which days points may accrue on).
  if (cadence === "weekly" && activeDays.length === 0) {
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
    activeDays,
    winnerQuota,
    // A season-long NFL reward needs real bounds: with recurringType "none" and
    // no startDate, computeCycleStart returns the epoch sentinel and
    // getCampaignCloseTimestampMs returns null — the reward would never close and
    // never award. A weekly scope leaves both null so the weekly cycle math owns
    // the boundaries (deriveNFLWeekScopeTerms drops any dates for that kind).
    ...(nflTerms?.startDate ? { startDate: nflTerms.startDate } : {}),
    ...(nflTerms?.endDate ? { endDate: nflTerms.endDate } : {}),
    // null (absent selection) keeps the legacy "award at every game" behavior.
    gameWinnerSlots: slots ? slots.slots : null,
    // Read back by Phase 7's resolver to know which weeks this reward covers.
    nflWeekScope,
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
