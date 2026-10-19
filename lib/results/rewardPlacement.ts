// Where each reward cycle sits on the Results timeline (docs/partner-results-page-plan.md §5b).
//
// Pure and client-safe: one function from (ledger rows + settlements + campaign terms + venue
// timezone + the page's games) to ResultsRewardItem[]. lib/results/rewardSource.ts does the reads.
//
// | Reward                                              | Placed on                                   |
// |-----------------------------------------------------|---------------------------------------------|
// | Live Trivia game_winner (cycle_start = game start)  | that game's card (same start instant; else  |
// |                                                     | the date's only Live Trivia game); else a   |
// |                                                     | day row                                     |
// | points_threshold, daily cadence                     | the day's game card when the day has        |
// |                                                     | exactly one game, else a day row            |
// | ranked_places / weekly cadence (incl. weeks that    | a week row, dated on the cycle's last game  |
// | paid nobody)                                        | day (its last active day)                   |
// | NFL Pick 'Em (weekly / single week / season)        | a week row in the week it was finalized     |
// | Super Bowl Squares (one cycle per moment)           | that season's Squares game card (the game's |
// |                                                     | date), labelled with the moment; else a day |
// |                                                     | row on that date                            |
// | monthly / yearly / one-off, or no cycle date        | a day row on the day it was finalized       |
//
// DATES. Every date is venue-local; a pinned game-winner reward is dated in its games' own zone
// when they share one (as lib/rewards.ts does). Dates are YYYY-MM-DD strings and are shifted by whole
// days only, so a DST change never moves one. An item is NEVER dated after it happened: its date is
// the earlier of its rule's date and the day it was finalized (a weekly points reward reached on
// Saturday is dated Saturday, not the cycle's last day).
//
// THE PAGING CONTRACT (lib/results/rewardSource.ts relies on it): an item's date is either within
// [cycle date − 1 day, cycle date + 7 days], or it is its finalized/settled date. Keep it that way
// when adding a rule, or the window reads in rewardSource.ts miss rows.
//
// Nothing is dropped: a cycle that fits no rule becomes a day row on the day it was finalized.

import {
  formatCycleLabel,
  formatOccurrenceDate,
  localDateOf,
  rewardHowWonLabel,
} from "@/lib/ownerHistoryDisplay";
import { buildRankedWeekHistory } from "@/lib/rankedWeekHistory";
import { SQUARES_PRIZE_DEFINITION_ID, squaresPrizeMomentOf } from "@/lib/squaresPrizes";
import { SQUARES_MOMENT_LABELS } from "@/lib/squaresView";
import type { ResultsGameRow, ResultsRewardAttach, ResultsRewardItem, ResultsRewardWinner } from "@/lib/results/types";
import type { ChallengeCampaign } from "@/types";

/** The Live Trivia competition id, as lib/results/competitions.ts registers it. */
const LIVE_TRIVIA = "live_trivia";
const NFL_DEFINITION_ID = "nfl_pickem_challenge";
/** The Super Bowl Squares competition id, as lib/results/competitions.ts registers it. */
const SQUARES = "squares";

export type PlacementLedgerRow = {
  challengeId: string;
  cycleStart: string;
  finalizedAt: string | null;
  place: number | null;
  /** Null = the winner deleted their account. */
  username: string | null;
  points: number;
};

export type PlacementSettlementRow = {
  challengeId: string;
  cycleStart: string;
  outcome: "awarded" | "no_scorers" | "below_minimum";
  participantCount: number;
  minPlayers: number | null;
  settledAt: string | null;
};

export type PlacementCampaign = Pick<
  ChallengeCampaign,
  | "id"
  | "name"
  | "winCondition"
  | "rewardDefinitionId"
  | "recurringType"
  | "scheduleType"
  | "activeDays"
  | "endDay"
  | "endTime"
  | "pointsRequiredToWin"
  | "placePrizes"
  | "winnerQuota"
  | "gameWinnerSlots"
>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const dateMs = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

/** `date` moved by whole days. */
export const addDays = (date: string, days: number): string => new Date(dateMs(date) + days * DAY_MS).toISOString().slice(0, 10);

const weekdayOf = (date: string): (typeof WEEKDAYS)[number] => WEEKDAYS[new Date(dateMs(date)).getUTCDay()];

/** The Monday on or before `date` (the Results weeks run Monday–Sunday, as groupGameHistory's do). */
export const mondayOf = (date: string): string => addDays(date, -((new Date(dateMs(date)).getUTCDay() + 6) % 7));

const minDate = (a: string, b: string | null): string => (b !== null && b < a ? b : a);

const normalizeWeekday = (value: unknown): (typeof WEEKDAYS)[number] | null => {
  const key = String(value ?? "").trim().toLowerCase().slice(0, 3);
  return (WEEKDAYS as readonly string[]).includes(key) ? (key as (typeof WEEKDAYS)[number]) : null;
};

/** Minutes after midnight of an "HH:MM[:SS]" time, or null. */
const minutesOf = (time: string | null | undefined): number | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? "").trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** A close at or before this time belongs to the night before (a bar night runs past midnight). */
const AFTER_MIDNIGHT_CLOSE_MINUTES = 6 * 60;

/**
 * The days a weekly cycle's games can fall on. A multi-day campaign runs from its first active day
 * to its end day (an end day closing by 6 AM is the night before's tail, so it doesn't count); any
 * other campaign runs on its active days.
 */
const cycleGameDays = (campaign: PlacementCampaign): Set<(typeof WEEKDAYS)[number]> => {
  const days = (campaign.activeDays ?? []).map(normalizeWeekday).filter((day): day is (typeof WEEKDAYS)[number] => day !== null);
  const first = days[0];
  const end = normalizeWeekday(campaign.endDay);
  if (campaign.scheduleType === "multi_day" && first && end) {
    const span: Array<(typeof WEEKDAYS)[number]> = [];
    for (let i = WEEKDAYS.indexOf(first), n = 0; n < 7; i = (i + 1) % 7, n += 1) {
      span.push(WEEKDAYS[i]);
      if (WEEKDAYS[i] === end) break;
    }
    const closeMinutes = minutesOf(campaign.endTime);
    if (span.length > 1 && closeMinutes !== null && closeMinutes <= AFTER_MIDNIGHT_CLOSE_MINUTES) span.pop();
    return new Set(span);
  }
  return new Set(days);
};

/**
 * A weekly cycle's last game day: the latest date within the 7 days from `cycleDate` that falls on
 * one of the cycle's game days (Wed/Thu/Fri starting Wed Oct 7 → Fri Oct 9). With no days known,
 * the cycle's seventh day.
 */
export const weeklyCycleLastDay = (cycleDate: string, campaign: PlacementCampaign): string => {
  const days = cycleGameDays(campaign);
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(cycleDate, offset);
    if (days.has(weekdayOf(date))) return date;
  }
  return addDays(cycleDate, 6);
};

const isEpoch = (cycleStart: string): boolean => {
  const ms = Date.parse(cycleStart);
  return !Number.isFinite(ms) || ms <= DAY_MS;
};

const isNFL = (campaign: PlacementCampaign): boolean => campaign.rewardDefinitionId === NFL_DEFINITION_ID;

/** The one zone every pinned game's schedule shares, else the venue's. */
const gameWinnerZone = (campaign: PlacementCampaign, venueTimeZone: string, scheduleZones: ReadonlyMap<string, string>): string => {
  const zones = new Set(
    (campaign.gameWinnerSlots ?? [])
      .map((slot) => scheduleZones.get(slot.scheduleId))
      .filter((zone): zone is string => Boolean(zone)),
  );
  return zones.size === 1 ? [...zones][0] : venueTimeZone;
};

type Cycle = {
  campaign: PlacementCampaign;
  cycleStart: string;
  ledger: PlacementLedgerRow[];
  settlement: PlacementSettlementRow | null;
};

/** When the cycle last happened (latest finalized / settled instant), or null. */
const happenedAtOf = (cycle: Cycle): string | null =>
  [...cycle.ledger.map((row) => row.finalizedAt), cycle.settlement?.settledAt ?? null]
    .filter((at): at is string => Boolean(at) && Number.isFinite(Date.parse(String(at))))
    .reduce<string | null>((latest, at) => (latest === null || Date.parse(at) > Date.parse(latest) ? at : latest), null);

type Placement = { date: string; attach: ResultsRewardAttach; label: string | null };

const weekPlacement = (date: string): Placement => ({ date, attach: { kind: "week", weekStart: mondayOf(date) }, label: null });
const dayPlacement = (date: string): Placement => ({ date, attach: { kind: "day", date }, label: null });

const gameAttach = (game: ResultsGameRow): ResultsRewardAttach => ({ kind: "game", competitionId: game.competitionId, gameKey: game.gameKey });

/** The cycle's place on the timeline, or null when it can't be dated at all (never in practice). */
const placeCycle = (
  cycle: Cycle,
  context: {
    venueTimeZone: string;
    scheduleZones: ReadonlyMap<string, string>;
    gamesByDate: ReadonlyMap<string, ResultsGameRow[]>;
    currentYear: number;
  },
): Placement | null => {
  const { campaign, cycleStart } = cycle;
  const { venueTimeZone, gamesByDate } = context;
  const happenedAt = happenedAtOf(cycle);
  const happenedDate = happenedAt ? localDateOf(happenedAt, venueTimeZone) : null;
  const finalizedFallback = (): Placement | null => (happenedDate ? dayPlacement(happenedDate) : null);

  // NFL Pick 'Em follows the NFL week, not a venue game: the week it was finalized.
  if (isNFL(campaign)) return happenedDate ? weekPlacement(happenedDate) : null;

  // Super Bowl Squares: each moment is its own cycle, keyed on the kickoff minute
  // (lib/squaresPrizes.ts), so its date IS the game's date — on the Squares game card.
  if (campaign.rewardDefinitionId === SQUARES_PRIZE_DEFINITION_ID) {
    const gameDate = isEpoch(cycleStart) ? null : localDateOf(cycleStart, venueTimeZone);
    if (!gameDate) return finalizedFallback();
    const moment = squaresPrizeMomentOf(cycleStart);
    const label = moment ? SQUARES_MOMENT_LABELS[moment] : formatOccurrenceDate(gameDate, context.currentYear);
    const game = (gamesByDate.get(gameDate) ?? []).find((candidate) => candidate.competitionId === SQUARES);
    return game ? { date: gameDate, attach: gameAttach(game), label } : { ...dayPlacement(gameDate), label };
  }

  if (campaign.winCondition === "game_winner") {
    if (isEpoch(cycleStart)) return finalizedFallback();
    const zone = gameWinnerZone(campaign, venueTimeZone, context.scheduleZones);
    const gameDate = localDateOf(cycleStart, zone);
    if (!gameDate) return finalizedFallback();
    const sameDay = (gamesByDate.get(gameDate) ?? []).filter((game) => game.competitionId === LIVE_TRIVIA);
    const startMs = Date.parse(cycleStart);
    const game =
      sameDay.find((candidate) => candidate.startsAt !== null && Date.parse(candidate.startsAt) === startMs) ??
      (sameDay.length === 1 ? sameDay[0] : null);
    const label = formatOccurrenceDate(gameDate, context.currentYear);
    return game ? { date: gameDate, attach: gameAttach(game), label } : { ...dayPlacement(gameDate), label };
  }

  const cycleDate = isEpoch(cycleStart) ? null : localDateOf(cycleStart, venueTimeZone);
  const recurring = campaign.recurringType;

  if (campaign.winCondition === "ranked_places" || (recurring === "weekly" && cycleDate)) {
    if (!cycleDate) return finalizedFallback();
    return weekPlacement(minDate(weeklyCycleLastDay(cycleDate, campaign), happenedDate));
  }

  if (recurring === "daily" && cycleDate) {
    const date = minDate(cycleDate, happenedDate);
    const games = gamesByDate.get(date) ?? [];
    return games.length === 1 ? { date, attach: gameAttach(games[0]), label: null } : dayPlacement(date);
  }

  // Monthly, yearly, one-off — or a cycle with no usable start.
  return finalizedFallback() ?? (cycleDate ? dayPlacement(cycleDate) : null);
};

const winnersOf = (cycle: Cycle): { winners: ResultsRewardWinner[]; note: string | null } => {
  if (cycle.campaign.winCondition === "ranked_places") {
    const [week] = buildRankedWeekHistory({
      winners: cycle.ledger.map((row) => ({
        cycleStart: cycle.cycleStart,
        place: row.place,
        winnerUsername: row.username,
        pointsEarned: row.points,
        prizeRedeemedAt: null,
      })),
      settlements: cycle.settlement
        ? [
            {
              cycleStart: cycle.cycleStart,
              outcome: cycle.settlement.outcome,
              participantCount: cycle.settlement.participantCount,
              minPlayers: cycle.settlement.minPlayers,
            },
          ]
        : [],
      placePrizes: cycle.campaign.placePrizes,
    });
    return {
      winners: (week?.winners ?? []).map((winner) => ({ place: winner.place, username: winner.username, points: winner.points })),
      note: week?.note ?? null,
    };
  }
  const winners = [...cycle.ledger]
    .sort((a, b) => (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER) || b.points - a.points)
    .map((row) => ({ place: row.place, username: row.username, points: row.points }));
  return { winners, note: null };
};

/**
 * Every cycle in the rows given, placed and labelled, newest first. Rows of a campaign not in
 * `campaigns` (deleted between reads) are skipped. The caller filters the result to its page's dates.
 */
export const placeRewards = (params: {
  ledger: readonly PlacementLedgerRow[];
  settlements: readonly PlacementSettlementRow[];
  campaigns: readonly PlacementCampaign[];
  venueTimeZone: string;
  /** schedule id → timezone, for pinned game-winner rewards' schedules (may be empty). */
  scheduleZones?: ReadonlyMap<string, string>;
  /** The page's games: a reward won at one of them sits on its card. */
  games: readonly ResultsGameRow[];
  currentYear: number;
}): ResultsRewardItem[] => {
  const campaignById = new Map(params.campaigns.map((campaign) => [campaign.id, campaign]));
  const cycles = new Map<string, Cycle>();
  const cycleFor = (challengeId: string, cycleStart: string): Cycle | null => {
    const campaign = campaignById.get(challengeId);
    const ms = Date.parse(cycleStart);
    if (!campaign || !Number.isFinite(ms)) return null;
    const key = `${challengeId}|${ms}`;
    const existing = cycles.get(key);
    if (existing) return existing;
    const cycle: Cycle = { campaign, cycleStart, ledger: [], settlement: null };
    cycles.set(key, cycle);
    return cycle;
  };
  for (const row of params.ledger) cycleFor(row.challengeId, row.cycleStart)?.ledger.push(row);
  for (const row of params.settlements) {
    const cycle = cycleFor(row.challengeId, row.cycleStart);
    if (cycle) cycle.settlement = row;
  }

  const gamesByDate = new Map<string, ResultsGameRow[]>();
  for (const game of params.games) {
    if (!DATE_PATTERN.test(game.date)) continue;
    gamesByDate.set(game.date, [...(gamesByDate.get(game.date) ?? []), game]);
  }
  const context = {
    venueTimeZone: params.venueTimeZone,
    scheduleZones: params.scheduleZones ?? new Map<string, string>(),
    gamesByDate,
    currentYear: params.currentYear,
  };

  const items: ResultsRewardItem[] = [];
  for (const cycle of cycles.values()) {
    const placement = placeCycle(cycle, context);
    if (!placement) {
      console.warn("[Results] reward-cycle-undated", { rewardId: cycle.campaign.id, cycleStart: cycle.cycleStart });
      continue;
    }
    const { campaign } = cycle;
    const { winners, note } = winnersOf(cycle);
    items.push({
      rewardId: campaign.id,
      name: campaign.name,
      howWon: rewardHowWonLabel({
        winCondition: campaign.winCondition,
        rewardDefinitionId: campaign.rewardDefinitionId,
        pointsRequiredToWin: campaign.pointsRequiredToWin,
        placeCount: campaign.placePrizes?.length ?? campaign.winnerQuota,
      }),
      cycleStart: cycle.cycleStart,
      cycleLabel:
        placement.label ??
        formatCycleLabel({
          cycleStart: cycle.cycleStart,
          recurringType: campaign.recurringType,
          timeZone: params.venueTimeZone,
          happenedAt: happenedAtOf(cycle),
          currentYear: params.currentYear,
        }),
      date: placement.date,
      attach: placement.attach,
      winners,
      note,
    });
  }
  return items.sort(
    (a, b) =>
      (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
      Date.parse(b.cycleStart) - Date.parse(a.cycleStart) ||
      (a.rewardId < b.rewardId ? -1 : a.rewardId > b.rewardId ? 1 : 0),
  );
};
