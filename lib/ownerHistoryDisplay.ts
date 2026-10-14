// Past Winners on the Partner Dashboard (docs/live-trivia-weekly-places-reward-plan.md §5f, Phase 8):
// the wire shapes the sheet reads, plus the pure rules for wording and ordering them.
//
// Pure and client-safe (no Supabase, no `server-only`): lib/ownerHistory.ts builds these shapes on
// the server and components/owner/history/PastWinnersSheet.tsx renders them.
//
// PRIVACY. A partner sees USERNAMES and points only — what the TV leaderboard already shows. No
// shape here has a player id, email or anything else about a player. A player who deleted their
// account is `username: null` ("Deleted player").

import { placeOrdinal } from "@/lib/rankedPlaceRewards";
import type { ChallengeWinCondition, CampaignRecurringType } from "@/types";

/** One past Live Trivia game, as a row of the Games list. */
export type OwnerGameHistoryRow = {
  scheduleId: string;
  /** Venue-local date, YYYY-MM-DD. */
  occurrenceDate: string;
  scheduleName: string;
  /** Everyone who answered at least one question, scored or not. */
  playerCount: number;
  /** The game hasn't finished yet: no winner is named. */
  inProgress: boolean;
  /** The top score; 0 when nobody scored. */
  topPoints: number;
  /** Everyone on the top score (a tie lists them all); empty when nobody scored. */
  winners: Array<string | null>;
};

export type OwnerGameHistoryPage = { games: OwnerGameHistoryRow[]; nextBefore: string | null };

/** One reward that has paid (or settled) at least once at this venue, as a row of the Rewards list. */
export type OwnerRewardHistoryRow = {
  rewardId: string;
  name: string;
  howWon: string;
  isActive: boolean;
  /** When anything last happened (a winner, or a week settled with nobody). ISO. */
  lastActivityAt: string;
  /** "Week of Oct 7", "Fri, Oct 9", … the latest cycle, in the venue's timezone. */
  lastCycleLabel: string;
  cycleCount: number;
  /** The latest cycle's winners, place-ordered; empty when that cycle had nobody. */
  lastWinners: Array<{ place: number | null; username: string | null; points: number }>;
};

export type OwnerRewardHistoryPage = { rewards: OwnerRewardHistoryRow[]; nextBefore: string | null };

export type OwnerGameStanding = { rank: number; username: string | null; points: number };

export type OwnerGameDetail = {
  scheduleId: string;
  occurrenceDate: string;
  scheduleName: string;
  playerCount: number;
  inProgress: boolean;
  /** Scorers only, best first; the top 10 plus anyone tied with 10th. */
  standings: OwnerGameStanding[];
};

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

/** Rows per page, both lists (plan §5f). */
export const OWNER_HISTORY_PAGE_SIZE = 20;
/** A game's standings: the top 10, plus anyone tied with 10th. */
export const OWNER_GAME_STANDINGS_LIMIT = 10;
/** A reward's detail shows its newest cycles only; a nightly reward would otherwise grow without bound. */
export const OWNER_REWARD_DETAIL_CYCLE_LIMIT = 52;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A games cursor: a venue-local date. Anything else is ignored (first page). */
export const parseGamesCursor = (raw: string | null | undefined): string | null => {
  const value = String(raw ?? "").trim();
  return DATE_PATTERN.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ? value : null;
};

/**
 * A rewards cursor: `<last activity timestamp>_<reward id>`, the last row of the previous page. The
 * timestamp is the database's own text (microseconds intact) and goes back to the RPC as-is.
 */
export const rewardsCursor = (row: Pick<OwnerRewardHistoryRow, "lastActivityAt" | "rewardId">): string =>
  `${row.lastActivityAt}_${row.rewardId}`;

const CURSOR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

export const parseRewardsCursor = (raw: string | null | undefined): { at: string; id: string } | null => {
  const value = String(raw ?? "").trim();
  const split = value.lastIndexOf("_");
  if (split <= 0) return null;
  const at = value.slice(0, split);
  const id = value.slice(split + 1);
  return CURSOR_TIMESTAMP.test(at) && Number.isFinite(Date.parse(at)) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? { at, id }
    : null;
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
 * listed first. Keeps the top `limit` plus anyone tied with the last kept row.
 */
export const rankGameStandings = (
  totals: ReadonlyArray<{ username: string | null; points: number; reachedAt: string | null }>,
  limit: number = OWNER_GAME_STANDINGS_LIMIT,
): OwnerGameStanding[] => {
  const scorers = totals
    .filter((row) => Number(row.points) > 0)
    .map((row) => {
      const reachedMs = row.reachedAt ? Date.parse(row.reachedAt) : Number.NaN;
      return { ...row, reachedMs: Number.isFinite(reachedMs) ? reachedMs : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => b.points - a.points || (a.reachedMs === b.reachedMs ? 0 : a.reachedMs < b.reachedMs ? -1 : 1));
  const ranked: OwnerGameStanding[] = [];
  for (let i = 0; i < scorers.length; i += 1) {
    const row = scorers[i];
    const rank = i > 0 && scorers[i - 1].points === row.points ? ranked[i - 1].rank : i + 1;
    if (i >= limit && rank !== ranked[limit - 1]?.rank) break;
    ranked.push({ rank, username: row.username, points: row.points });
  }
  return ranked;
};

/** "12 players". */
export const playerCountLabel = (count: number): string => `${count} player${count === 1 ? "" : "s"}`;
