import "server-only";

import { computeUpcomingCycleStart, createChallengeCampaign } from "@/lib/challengeCampaigns";
import {
  listScheduleTimezones,
  listVenueLiveShowdownSchedules,
  type AdminLiveShowdownSchedule,
} from "@/lib/liveShowdownAdmin";
import { getCurrentOrNextScheduleWindow } from "@/lib/categoryBlitzScheduleTime";
import { liveTriviaDurationMinutes } from "@/lib/liveTriviaShared";
import { coerceRecurringType } from "@/lib/ownerSchedule";
import {
  getRewardDefinition,
  isSupportedRewardCadence,
  isValidRewardThreshold,
  rewardThresholdStepMessage,
  type RewardDefinitionId,
} from "@/lib/rewardDefinitions";
import {
  allowedPeriodsFor,
  cadenceForPeriod,
  deriveRewardTerms,
  periodForCadence,
  summarizeRewardSchedules,
  validateRewardTerms,
  type RewardScheduleFacts,
  type RewardScheduleShape,
} from "@/lib/rewardTerms";
import {
  enumerateGameSlots,
  normalizeGameWinnerSlots,
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
  nflRewardUpcomingStartDate,
  type NFLRewardSeasonContext,
  type NFLRewardWeekScope,
  type NFLWeekScopeTerms,
} from "@/lib/nflPickEmRewardWeeks";
import { listNFLSeasonWeekDates, listNFLWeeks, type NFLWeekDates } from "@/lib/nflPickEm";
import { POS_VALUE_MAX_CENTS } from "@/lib/pos/prizeValue";
import { describeReward, describeRewardWin, type RewardDescription } from "@/lib/rewardDescription";
import { getLocalDateKey, getVenueTimezone } from "@/lib/timezone";
import type {
  CampaignRecurringType,
  ChallengeCampaign,
  ChallengeCampaignWin,
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
// lib/liveShowdownAdmin.listVenueLiveShowdownSchedules). The venue's schedule
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
  const all = await listVenueLiveShowdownSchedules([vid], now);
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
    seasonFirstWeekStartDate: seasonFirstWeekStartDate(weeks),
    seasonEndDate,
    weeksRemaining: remaining.length,
  };
}

// ── Description read cache (docs/reward-descriptions-review-fixes-plan.md F3 / D2) ──
//
// The venue page re-fetches its rewards every 30 seconds per player
// (VenueHubClient), and every fetch used to re-read the venue's Live Trivia
// schedule and the NFL season's weeks to word the cards: one player for an hour
// = 120 + 120 reads, 30 players = 3,600 + 3,600. Neither changes minute to
// minute, so the polled guest route (`cachedReads: true`) reuses a recent read
// per server instance instead — about 12 + 6 reads an hour per instance however
// many players. The trade-off Andrew accepted: after a partner changes a game
// time, guest cards can show the old time for up to 5 minutes. The admin and
// partner lists always read fresh (and refresh the cache as they go), so a
// partner never sees their own edit lag.
//
// Only successes are kept. A failed schedule read, or a season with no weeks
// (listNFLSeasonWeekDates answers [] on a read error), is dropped so the next
// poll retries — a failure must degrade to "no time", never stick. Concurrent
// misses share one in-flight read. Expiry uses Date.now(), so tests drive it with
// fake timers (same pattern as lib/timezone.ts).

/** How long an instance reuses a venue's Live Trivia schedule rows for reward wording. */
export const REWARD_SCHEDULE_CACHE_TTL_MS = 5 * 60_000;
/** How long an instance reuses an NFL season's week dates for reward wording. */
export const REWARD_NFL_WEEKS_CACHE_TTL_MS = 10 * 60_000;

type ReadCacheEntry<V> = { value: Promise<V>; expiresAtMs: number };

const venueScheduleCache = new Map<string, ReadCacheEntry<AdminLiveShowdownSchedule[]>>();
const nflSeasonWeeksCache = new Map<number, ReadCacheEntry<NFLWeekDates[]>>();

/** Test hook: forget every cached schedule and NFL season read. */
export function clearRewardDescriptionCaches(): void {
  venueScheduleCache.clear();
  nflSeasonWeeksCache.clear();
}

/**
 * `load()` through `cache`: reuse an unexpired entry when `reuse` is true, else
 * read and store the result for `ttlMs` — unless the read throws or `keep`
 * rejects the value, in which case the entry is dropped and the next call reads.
 */
function readThroughCache<K, V>(
  cache: Map<K, ReadCacheEntry<V>>,
  key: K,
  ttlMs: number,
  reuse: boolean,
  load: () => Promise<V>,
  keep: (value: V) => boolean = () => true,
): Promise<V> {
  const nowMs = Date.now();
  const cached = cache.get(key);
  if (reuse && cached && cached.expiresAtMs > nowMs) return cached.value;

  for (const [staleKey, entry] of cache) {
    if (entry.expiresAtMs <= nowMs) cache.delete(staleKey);
  }
  const entry: ReadCacheEntry<V> = { value: load(), expiresAtMs: nowMs + ttlMs };
  cache.set(key, entry);
  const forget = () => {
    if (cache.get(key) === entry) cache.delete(key);
  };
  entry.value.then((value) => {
    if (!keep(value)) forget();
  }, forget);
  return entry.value;
}

/** Every week of each distinct season the campaigns' NFL scopes name — one read per season. */
async function loadNFLSeasonWeekDates(
  campaigns: ReadonlyArray<Pick<ChallengeCampaign, "nflWeekScope">>,
  cachedReads = false,
): Promise<Map<number, NFLWeekDates[]>> {
  const seasons = new Set<number>();
  for (const campaign of campaigns) {
    const scope = normalizeNFLWeekScope(campaign.nflWeekScope);
    if (scope) seasons.add(scope.season);
  }
  const spansBySeason = new Map<number, NFLWeekDates[]>();
  await Promise.all(
    [...seasons].map(async (season) => {
      spansBySeason.set(
        season,
        await readThroughCache(
          nflSeasonWeeksCache,
          season,
          REWARD_NFL_WEEKS_CACHE_TTL_MS,
          cachedReads,
          () => listNFLSeasonWeekDates(season),
          (weeks) => weeks.length > 0,
        ),
      );
    }),
  );
  return spansBySeason;
}

/** YYYY-MM-DD of a season's earliest week_start_date, or null when none are synced. */
const seasonFirstWeekStartDate = (spans: readonly NFLWeekDates[] | undefined): string | null =>
  spans && spans.length > 0
    ? spans.reduce((earliest, week) => (week.weekStartDate < earliest ? week.weekStartDate : earliest), spans[0].weekStartDate)
    : null;

/** YYYY-MM-DD of a season's latest week_end_date, or null when none are synced. */
const seasonLastWeekEndDate = (spans: readonly NFLWeekDates[] | undefined): string | null =>
  spans && spans.length > 0
    ? spans.reduce((latest, week) => (week.weekEndDate > latest ? week.weekEndDate : latest), spans[0].weekEndDate)
    : null;

/**
 * Attach `upcomingStartDate` to any NFL Pick 'Em reward whose first covered NFL
 * week has not started yet, so the venue Rewards panel can say "Starts Sept 10"
 * instead of rendering a live-looking progress bar on something unwinnable for
 * weeks (docs/nfl-pickem-week1-early-access-plan.md, locked decisions).
 *
 * Set ONLY when the date is genuinely in the future — a campaign already in
 * season, or any non-NFL reward, comes back untouched. The rule itself is
 * nflRewardUpcomingStartDate (lib/nflPickEmRewardWeeks.ts), shared with the
 * Create Reward wizard's guest preview. Only attachRewardDescriptions calls
 * this, from its own single nfl_pickem_weeks read.
 */
function applyNFLRewardUpcomingState<T extends Pick<ChallengeCampaign, "nflWeekScope" | "startDate">>(
  campaigns: T[],
  spansBySeason: Map<number, NFLWeekDates[]>,
  now: Date,
): Array<T & { upcomingStartDate?: string }> {
  return campaigns.map((campaign) => {
    const scope = normalizeNFLWeekScope(campaign.nflWeekScope);
    if (!scope) return campaign;

    const upcomingStartDate = nflRewardUpcomingStartDate(
      scope,
      {
        campaignStartDate: campaign.startDate ?? null,
        seasonFirstWeekStartDate: seasonFirstWeekStartDate(spansBySeason.get(scope.season)),
      },
      now,
    );
    return upcomingStartDate ? { ...campaign, upcomingStartDate } : campaign;
  });
}

/**
 * Each venue's live-or-upcoming Live Trivia games as description slot facts, from
 * ONE venue-filtered trivia_schedules read. Returns null when the read fails —
 * the composer then states no time at all ("Check the Live Trivia schedule…")
 * rather than a stale or invented one, and the page still loads.
 *
 * With `cachedReads`, the raw schedule rows may come from the cache (keyed by
 * the sorted venue ids); the "still on" filter and slot list below are always
 * recomputed against `now`, so a game that just ended drops off at once.
 */
async function loadVenueGameSlots(
  venueIds: readonly string[],
  now: Date,
  cachedReads = false,
): Promise<Map<string, RewardGameSlot[]> | null> {
  let schedules: AdminLiveShowdownSchedule[];
  try {
    const sortedIds = [...new Set(venueIds)].sort();
    schedules = await readThroughCache(
      venueScheduleCache,
      sortedIds.join(","),
      REWARD_SCHEDULE_CACHE_TTL_MS,
      cachedReads,
      () => listVenueLiveShowdownSchedules(sortedIds, now),
    );
  } catch (error) {
    console.error("[RewardDescriptions] schedule-read-failed", error);
    return null;
  }
  const byVenue = new Map<string, AdminLiveShowdownSchedule[]>(venueIds.map((id) => [id, []]));
  for (const schedule of schedules) {
    // Same "is this game still on" reading the reward picker uses
    // (getVenueLiveTriviaSchedules), so a description never names a game the
    // partner's own schedule page files under "Past".
    if (!schedule.venueId || !hasLiveOrUpcomingOccurrence(schedule, now)) continue;
    byVenue.get(schedule.venueId)?.push(schedule);
  }
  return new Map(
    [...byVenue].map(([venueId, venueSchedules]) => [
      venueId,
      enumerateGameSlots(toGameScheduleShapes(venueSchedules)),
    ]),
  );
}

/**
 * Attach the guest-facing `description` (lib/rewardDescription.ts — when, how
 * often, what to do, what you win) to every campaign, plus NFL rewards'
 * `upcomingStartDate` (applyNFLRewardUpcomingState, from the same read).
 *
 * `venueId` is the venue being viewed; pass null for a cross-venue list (the
 * admin Rewards list's "All venues"), and each campaign is described against its
 * own first venue.
 *
 * Cost (docs/reward-descriptions-plan.md Phase 2): no per-campaign queries.
 *  - trivia_schedules: ONE read, venue-filtered, only when a Live Trivia reward
 *    is present.
 *  - nfl_pickem_weeks: ONE read per distinct season (in practice one), only when
 *    an NFL reward is present — the same read the upcoming state needs.
 *  - With `cachedReads` (the guest route, polled every 30 s per player), both of
 *    the above are reused per server instance for 5 / 10 minutes — see the
 *    description read cache above. Admin and partner lists leave it off.
 *  - venues.timezone: only when a recurring reward's quota is filled this cycle
 *    (the "Next contest starts …" line), and cached per server instance for
 *    10 minutes by getVenueTimezone (lib/timezone.ts) — the snapshot path has
 *    usually warmed it already.
 * A failed read degrades the wording, never the response.
 */
export async function attachRewardDescriptions<T extends ChallengeCampaign>(
  campaigns: T[],
  venueId: string | null,
  now: Date = new Date(),
  { cachedReads = false }: { cachedReads?: boolean } = {},
): Promise<Array<T & { upcomingStartDate?: string; description: RewardDescription }>> {
  if (campaigns.length === 0) return [];
  const viewedVenueId = String(venueId ?? "").trim() || null;
  const venueOf = (campaign: ChallengeCampaign): string | null =>
    viewedVenueId ?? (String(campaign.venueIds?.[0] ?? "").trim() || null);

  const hasNFL = campaigns.some((campaign) => normalizeNFLWeekScope(campaign.nflWeekScope));
  const scheduleVenueIds = [
    ...new Set(
      campaigns
        .filter((campaign) => {
          const definition = campaign.rewardDefinitionId
            ? getRewardDefinition(campaign.rewardDefinitionId)
            : null;
          return definition?.requiresScheduledGame === "live_trivia";
        })
        .map(venueOf)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const timezoneVenueIds = [
    ...new Set(
      campaigns
        .filter(
          (campaign) =>
            campaign.rewardDefinitionId &&
            campaign.quotaRemaining === 0 &&
            campaign.recurringType &&
            campaign.recurringType !== "none",
        )
        .map(venueOf)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [spansBySeason, slotsByVenue, timezoneByVenue] = await Promise.all([
    hasNFL ? loadNFLSeasonWeekDates(campaigns, cachedReads) : Promise.resolve(new Map<number, NFLWeekDates[]>()),
    scheduleVenueIds.length > 0 ? loadVenueGameSlots(scheduleVenueIds, now, cachedReads) : Promise.resolve(null),
    Promise.all(
      timezoneVenueIds.map(async (id) => {
        try {
          return [id, await getVenueTimezone(id)] as const;
        } catch (error) {
          console.error("[RewardDescriptions] timezone-read-failed", error);
          return [id, null] as const;
        }
      }),
    ).then((entries) => new Map<string, string | null>(entries)),
  ]);

  const withUpcoming: Array<T & { upcomingStartDate?: string }> = hasNFL
    ? applyNFLRewardUpcomingState(campaigns, spansBySeason, now)
    : campaigns;

  return withUpcoming.map((campaign) => {
    const campaignVenueId = venueOf(campaign);
    const timezone = campaignVenueId ? timezoneByVenue.get(campaignVenueId) ?? null : null;
    const scope = normalizeNFLWeekScope(campaign.nflWeekScope);
    const slots = campaignVenueId && slotsByVenue ? slotsByVenue.get(campaignVenueId) ?? null : null;
    const nextCycleStart = timezone ? computeUpcomingCycleStart(campaign, now, timezone)?.toISOString() ?? null : null;
    const description = describeReward(
      {
        ...campaign,
        schedule: slots ? { slots } : null,
        nfl: scope
          ? {
              upcomingStartDate: campaign.upcomingStartDate ?? null,
              seasonEndDate: seasonLastWeekEndDate(spansBySeason.get(scope.season)),
            }
          : null,
        timezone,
        nextCycleStart,
      },
      now,
    );
    return { ...campaign, description };
  });
}

/**
 * Attach `winDescription` — the past-tense "what you won it for" line
 * (describeRewardWin: "You got the most NFL picks right in Week 5", "You won
 * Live Trivia on Tue, Oct 7") — to each prize-wallet coupon. A coupon whose
 * reward was deleted, or was never definition-based, gets null and keeps
 * "Won from: {challengeName}".
 *
 * A Live Trivia game win is dated in its GAME's timezone — the schedule its
 * pinned slots point at — because cycle_start is the game's start instant and an
 * 11:30 PM Central game read in another zone lands on the wrong day. No pinned
 * slots, an unreadable schedule, or slots on schedules in different zones → the
 * venue's zone; describeRewardWin then defaults to America/New_York, never UTC.
 *
 * Cost: nothing at all when no coupon is definition-based. Otherwise one
 * venues.timezone read (getVenueTimezone, cached 10 minutes); only when a Live
 * Trivia game-winner coupon has pinned slots, ONE trivia_schedules read for all
 * their schedules; and only for weekly NFL coupons, one nfl_pickem_weeks read
 * per distinct season to turn the cycle start into a week number. No per-coupon
 * queries.
 */
export async function attachRewardWinDescriptions<T extends ChallengeCampaignWin>(
  wins: T[],
  venueId: string,
): Promise<Array<T & { winDescription: string | null }>> {
  const describable = (win: T) => {
    const id = win.rewardTerms?.rewardDefinitionId;
    return id ? getRewardDefinition(id) !== null : false;
  };
  if (!wins.some(describable)) return wins.map((win) => ({ ...win, winDescription: null }));

  const weeklyNFL = wins.filter(
    (win) => describable(win) && normalizeNFLWeekScope(win.rewardTerms?.nflWeekScope)?.kind === "weekly",
  );
  const gameSlotsOf = (win: T) => {
    const terms = win.rewardTerms;
    if (!terms || !describable(win) || terms.winCondition !== "game_winner") return [];
    const definition = getRewardDefinition(terms.rewardDefinitionId ?? "");
    if (!definition || definition.description.calendar === "nfl_season") return [];
    return normalizeGameWinnerSlots(terms.gameWinnerSlots) ?? [];
  };
  const scheduleIds = wins.flatMap((win) => gameSlotsOf(win).map((slot) => slot.scheduleId));
  const [timezone, weeksBySeason, scheduleZones] = await Promise.all([
    getVenueTimezone(venueId).catch((error: unknown) => {
      console.error("[RewardDescriptions] timezone-read-failed", error);
      return null;
    }),
    weeklyNFL.length > 0
      ? loadNFLSeasonWeekDates(weeklyNFL.map((win) => ({ nflWeekScope: win.rewardTerms?.nflWeekScope ?? null })))
      : Promise.resolve(new Map<number, NFLWeekDates[]>()),
    scheduleIds.length > 0
      ? listScheduleTimezones(scheduleIds).catch((error: unknown) => {
          console.error("[RewardDescriptions] schedule-timezone-read-failed", error);
          return new Map<string, string>();
        })
      : Promise.resolve(new Map<string, string>()),
  ]);

  /** The one zone every pinned game's schedule shares, else the venue's. */
  const winTimezone = (win: T): string | null => {
    const zones = new Set(
      gameSlotsOf(win)
        .map((slot) => scheduleZones.get(slot.scheduleId))
        .filter((zone): zone is string => Boolean(zone)),
    );
    return zones.size === 1 ? [...zones][0] : timezone;
  };

  return wins.map((win) => {
    const terms = win.rewardTerms;
    if (!terms || !describable(win)) return { ...win, winDescription: null };

    // A weekly NFL cycle starts on its week's first day in the venue's zone
    // (nflWinnerCycleStart), so the week is the one whose dates contain it.
    let nflWeekNumber: number | null = null;
    const scope = normalizeNFLWeekScope(terms.nflWeekScope);
    const cycleMs = Date.parse(String(win.cycleStart ?? ""));
    if (scope?.kind === "weekly" && Number.isFinite(cycleMs) && cycleMs > 0) {
      const day = getLocalDateKey(new Date(cycleMs), timezone || NFL_SEASON_TIMEZONE);
      nflWeekNumber =
        weeksBySeason.get(scope.season)?.find((week) => week.weekStartDate <= day && day <= week.weekEndDate)
          ?.weekNumber ?? null;
    }

    return {
      ...win,
      winDescription: describeRewardWin(
        { ...terms, rules: win.challengeRules },
        { cycleStart: win.cycleStart ?? null, timezone: winTimezone(win), nflWeekNumber },
      ),
    };
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
      /**
       * POS plan Phase 1: what a percent-off prize is worth at the register, in cents
       * (lib/pos/prizeValue.ts). The wizard sends it only when the venue has a POS
       * connected; ignored for dollar-off prizes, whose discount already is the value.
       */
      posValueCents?: number | null;
    }
  | { prizeKind: "gift_card"; amount: number };

type NormalizedRewardPrize = {
  prizeKind: RewardPrizeKind;
  prizeMenuItem: RewardMenuItem | null;
  prizeMenuItemName: string | null;
  prizeDiscountKind: RewardDiscountKind | null;
  prizeDiscountValue: number | null;
  prizeGiftCertificateAmount: number | null;
  prizePosValueCents: number | null;
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
      prizePosValueCents: null,
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
    // Optional "value at the register" — kept only where it means something (percent off).
    // A value that is present but out of range is refused, never silently dropped.
    let prizePosValueCents: number | null = null;
    if (prize.discountKind === "percent" && prize.posValueCents !== undefined && prize.posValueCents !== null) {
      const cents = Number(prize.posValueCents);
      if (!Number.isInteger(cents) || cents < 1 || cents > POS_VALUE_MAX_CENTS) {
        throw new Error(REWARD_INVALID_PRIZE_MESSAGE);
      }
      prizePosValueCents = cents;
    }
    return {
      prizeKind: "menu_item",
      prizeMenuItem: prize.menuItem,
      prizeMenuItemName: menuItemName,
      prizeDiscountKind: prize.discountKind,
      prizeDiscountValue: prize.discountKind === "dollar" ? round2(discountValue) : Math.round(discountValue),
      prizeGiftCertificateAmount: null,
      prizePosValueCents,
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

  // cadence / activeDays / winnerQuota come from ONE shared derivation
  // (lib/rewardTerms.ts) — the same one the wizard previews and submits with.
  // An NFL scope or a picked-games selection IS the terms; only the terms
  // sentence uses the client's cadence and N, and both are validated below.
  // activeDays rules (slot-pinned = the pinned weekdays only, never every day the
  // venue plays; NFL = all seven days for both cadences) live on deriveRewardTerms.
  const { cadence, activeDays, winnerQuota } = deriveRewardTerms({
    nflTerms,
    pickedSlots: slots ? slots.terms : null,
    sentenceCadence: params.cadence ?? "none",
    sentenceQuantity: Math.round(Number(params.winnerQuota)),
    scheduleDays: context.scheduleDays,
  });
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
    // A frozen fallback snapshot of the guest-facing Line 1 — every reader that
    // can, composes the description fresh at read time (attachRewardDescriptions);
    // this is only what an old client or a raw `rules` reader sees.
    rules: describeReward(
      {
        rules: "",
        recurringType: cadence,
        activeDays,
        winnerQuota,
        pointsRequiredToWin: threshold,
        winCondition,
        rewardDefinitionId: definition.id,
        gameWinnerSlots: slots ? slots.slots : null,
        nflWeekScope,
        ...prize,
        schedule: { slots: context.gameSlots },
      },
      new Date(),
    ).summary,
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
    prizePosValueCents: prize.prizePosValueCents,
    createdByOwnerId: params.createdByOwnerId ?? null,
  });
}
