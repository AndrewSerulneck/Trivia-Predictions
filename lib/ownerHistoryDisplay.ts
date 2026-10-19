// Shared wording, date and ordering rules for the Partner Dashboard's Results page
// (docs/partner-results-page-plan.md) and the reward-detail shapes it reads.
//
// Pure and client-safe (no Supabase, no `server-only`): lib/ownerHistory.ts builds the reward-detail
// shapes on the server; components/owner/results/ renders them.
//
// PRIVACY. A partner sees USERNAMES and points only — what the TV leaderboard already shows. No
// shape here has a player id, email or anything else about a player. A player who deleted their
// account is `username: null` ("Deleted player").

import { placeOrdinal } from "@/lib/rankedPlaceRewards";
import { SQUARES_PRIZE_DEFINITION_ID } from "@/lib/squaresPrizes";
import type { ChallengeWinCondition, CampaignRecurringType } from "@/types";

export type OwnerRewardCycleWinner = {
  place: number | null;
  username: string | null;
  points: number;
  prize: string;
  /** null = unknown: the winner deleted their account, and their coupon with it. */
  redeemed: boolean | null;
};

export type OwnerRewardCycle = {
  cycleStart: string;
  label: string;
  winners: OwnerRewardCycleWinner[];
  /** Why nobody won ("Only 2 players — the minimum was 4"), or null. */
  note: string | null;
};

export type OwnerRewardDetail = {
  rewardId: string;
  name: string;
  howWon: string;
  isActive: boolean;
  cycles: OwnerRewardCycle[];
  /** More cycles exist than were sent (the newest OWNER_REWARD_DETAIL_CYCLE_LIMIT are shown). */
  truncated: boolean;
};

/** A reward's detail shows its newest cycles only; a nightly reward would otherwise grow without bound. */
export const OWNER_REWARD_DETAIL_CYCLE_LIMIT = 52;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A games cursor: a venue-local date. Anything else is ignored (first page). */
export const parseGamesCursor = (raw: string | null | undefined): string | null => {
  const value = String(raw ?? "").trim();
  return DATE_PATTERN.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ? value : null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Fri, Oct 9" — the year is added only when it isn't `currentYear`. Never shifted by a timezone. */
export const formatOccurrenceDate = (date: string, currentYear: number): string => {
  if (!DATE_PATTERN.test(date)) return date;
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${MONTHS[month - 1]} ${day}${year === currentYear ? "" : `, ${year}`}`;
};

/** The venue-local YYYY-MM-DD of an instant. */
export const localDateOf = (instant: string | number, timeZone: string): string | null => {
  const ms = typeof instant === "number" ? instant : Date.parse(instant);
  if (!Number.isFinite(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(ms))
      .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return null;
  }
};

/**
 * A reward cycle's label, in the venue's timezone: "Week of Wed, Oct 7" (weekly), "Fri, Oct 9"
 * (daily), "October 2026" (monthly), "2026" (yearly). A one-time reward's cycle key is the epoch
 * sentinel, so it is labelled by when it was won ("Won Fri, Oct 9"), or "Won" when that is unknown.
 */
export const formatCycleLabel = (params: {
  cycleStart: string;
  recurringType: CampaignRecurringType | null | undefined;
  timeZone: string;
  happenedAt: string | null;
  currentYear: number;
}): string => {
  const { recurringType, timeZone, currentYear } = params;
  const startMs = Date.parse(params.cycleStart);
  const isOneTime = !recurringType || recurringType === "none" || !Number.isFinite(startMs) || startMs <= 0;
  if (isOneTime) {
    const won = params.happenedAt ? localDateOf(params.happenedAt, timeZone) : null;
    return won ? `Won ${formatOccurrenceDate(won, currentYear)}` : "Won";
  }
  const local = localDateOf(startMs, timeZone);
  if (!local) return params.cycleStart;
  const [year, month] = local.split("-").map(Number);
  if (recurringType === "monthly") return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1]} ${year}`;
  if (recurringType === "yearly") return String(year);
  if (recurringType === "daily") return formatOccurrenceDate(local, currentYear);
  return `Week of ${formatOccurrenceDate(local, currentYear)}`;
};

/** "How it's won", one short line for a partner. */
export const rewardHowWonLabel = (reward: {
  winCondition: ChallengeWinCondition;
  rewardDefinitionId?: string | null;
  pointsRequiredToWin: number;
  placeCount?: number;
}): string => {
  const isNFL = reward.rewardDefinitionId === "nfl_pickem_challenge";
  if (reward.rewardDefinitionId === SQUARES_PRIZE_DEFINITION_ID) return "Winning square";
  if (reward.winCondition === "ranked_places") {
    const places = Math.max(1, Math.round(Number(reward.placeCount) || 1));
    return places === 1 ? "Top player each week" : `Top ${places} players each week`;
  }
  if (reward.winCondition === "game_winner") return isNFL ? "Most picks right" : "Winner of the game";
  const target = Math.max(1, Math.round(Number(reward.pointsRequiredToWin) || 1)).toLocaleString("en-US");
  return isNFL ? `${target} picks right` : `Reach ${target} points`;
};

/** "Snooker", "Snooker & Kuch (tie)", "Snooker, Kuch & 1 more (tie)". */
export const winnersLabel = (usernames: ReadonlyArray<string | null>): string => {
  const names = usernames.map((name) => name ?? "Deleted player");
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]} (tie)`;
  return `${names[0]}, ${names[1]} & ${names.length - 2} more (tie)`;
};

/** "1st · Snooker" for a place, else the username alone. */
export const rewardWinnerLabel = (winner: { place: number | null; username: string | null }): string => {
  const name = winner.username ?? "Deleted player";
  return winner.place ? `${placeOrdinal(winner.place)} · ${name}` : name;
};

/**
 * A finished game's standings: scorers only (a player on 0 is counted in the player total, not
 * listed), best first, competition-ranked ("1, 2, 2, 4"). Within a tie, whoever got there first is
 * listed first. Each input row is kept whole (`row`) so a server caller can carry data that must
 * never reach the client (a user id) next to its rank.
 */
export const rankScorers = <T extends { points: number; reachedAt: string | null }>(
  totals: readonly T[],
): Array<{ rank: number; row: T }> => {
  const scorers = totals
    .filter((row) => Number(row.points) > 0)
    .map((row) => {
      const reachedMs = row.reachedAt ? Date.parse(row.reachedAt) : Number.NaN;
      return { row, reachedMs: Number.isFinite(reachedMs) ? reachedMs : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => b.row.points - a.row.points || (a.reachedMs === b.reachedMs ? 0 : a.reachedMs < b.reachedMs ? -1 : 1));
  const ranked: Array<{ rank: number; row: T }> = [];
  for (let i = 0; i < scorers.length; i += 1) {
    const { row } = scorers[i];
    const rank = i > 0 && scorers[i - 1].row.points === row.points ? ranked[i - 1].rank : i + 1;
    ranked.push({ rank, row });
  }
  return ranked;
};

/** "12 players". */
export const playerCountLabel = (count: number): string => `${count} player${count === 1 ? "" : "s"}`;

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const dayMs = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
export const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const DAY = 24 * 60 * 60 * 1000;

/** The Monday on or before `date`. */
export const mondayOf = (date: string): string => {
  const ms = dayMs(date);
  const weekday = new Date(ms).getUTCDay(); // 0 = Sunday
  return isoOf(ms - ((weekday + 6) % 7) * DAY);
};

export const lastDayOfMonth = (year: number, month: number): string => isoOf(Date.UTC(year, month, 0));

/** "Oct 12 – 18", "Sep 29 – 30", or "Oct 1" for a one-day stretch. */
export const weekRangeLabel = (start: string, end: string): string => {
  const [, startMonth, startDay] = start.split("-").map(Number);
  const [, , endDay] = end.split("-").map(Number);
  const month = MONTHS[startMonth - 1];
  return start === end ? `${month} ${startDay}` : `${month} ${startDay} – ${endDay}`;
};

/**
 * True when the venue's first game was more than a year before `today` (both YYYY-MM-DD). A null
 * or malformed first date is never "over a year".
 */
export const groupsByYear = (firstGameDate: string | null | undefined, today: string): boolean => {
  if (!firstGameDate || !DATE_PATTERN.test(firstGameDate) || !DATE_PATTERN.test(today)) return false;
  const [year, month, day] = today.split("-").map(Number);
  const yearAgo = `${year - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return firstGameDate < yearAgo;
};
