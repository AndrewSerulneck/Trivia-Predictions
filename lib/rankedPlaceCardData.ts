import "server-only";

// ── The Rewards card's data for a weekly places reward ──────────────────────────────────
//
// For each active "ranked_places" reward on a venue, build the RankedPlaceCardState the
// player's Rewards card shows (lib/rankedPlaceCard.ts): the viewer's live rank this week, or
// how the week ended. docs/live-trivia-weekly-places-reward-plan.md §5e and §6.
//
// ONE SOURCE OF TRUTH. The week and its games come from planCurrentRankedWeek and the order
// from orderWeekStandings / rankWeekPlaces — the same functions the weekly resolver pays
// from — so "you're 2nd" on the card is exactly the place the resolver would pay.
//
// COST (§6). The Rewards route is polled every 30 s per player, so nothing here may scale with
// players. The expensive part — one schedules read, one settlement read, one aggregate
// totals RPC (and, once settled, one winners read) — is a "board" cached per reward on this
// server instance for LIVE_BOARD_TTL_MS (SETTLED_BOARD_TTL_MS once the week is settled, which can
// never change again). Concurrent requests share one in-flight build. A player's own rank is
// then a lookup in the cached standings, with no query. Boards never outlive their week.
//
// PRIVACY. The cached board holds player ids so it can find the viewer; the state it hands out
// holds only the viewer's own rank and points plus winners' usernames.
//
// A failure here never fails the Rewards route: the card falls back to the reward's description.

import {
  listChallengeCycleSettlements,
  listRankedCycleWinners,
  type ChallengeCycleSettlementRecord,
} from "@/lib/challengeCampaigns";
import { loadLiveTriviaSchedulesForVenues } from "@/lib/liveShowdownEngine";
import {
  planCurrentRankedWeek,
  rankedRewardConfigError,
  SETTLED_WEEK_MATCH_TOLERANCE_MS,
  type RankedWeekGame,
} from "@/lib/liveTriviaRankedRewards";
import { loadLiveTriviaWeekTotals } from "@/lib/liveTriviaWeekTotals";
import type { RankedPlaceCardState } from "@/lib/rankedPlaceCard";
import { orderWeekStandings, rankWeekPlaces } from "@/lib/rankedPlaceRewards";
import { REWARD_WEEKDAY_LABEL, weekdayForOccurrenceDate } from "@/lib/rewardGameSlots";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a live (unsettled) board is reused. The plan's §6 figure. */
export const LIVE_BOARD_TTL_MS = 60 * 1000;
/** A settled week is final, so its board can be kept much longer. */
export const SETTLED_BOARD_TTL_MS = 10 * 60 * 1000;
/**
 * A board is never kept past this long after its week began. A week is 7 days, or 7 days less an
 * hour across a spring-forward change, so two hours early is always safely inside the week and
 * the next week's first request builds a fresh board.
 */
const BOARD_MAX_AGE_MS = 7 * DAY_MS - 2 * 60 * 60 * 1000;

type BoardGame = Pick<RankedWeekGame, "startMs" | "endMs" | "occurrenceDate">;

type RankedWeekBoard = {
  weekStartMs: number;
  weekStart: string;
  placeCount: number;
  minPlayers: number | null;
  games: BoardGame[];
  countsForReward: boolean;
  settlement: ChallengeCycleSettlementRecord | null;
  /** Settled + awarded: the week's winners with their ids (ids stay server-side). */
  winners: Array<{ place: number; userId: string | null; username: string | null }>;
  /** Live: scorers in standing order. Empty once settled. */
  standings: Array<{ userId: string; totalPoints: number }>;
  participantCount: number;
};

type BoardCacheEntry = { expiresAtMs: number; board: Promise<RankedWeekBoard> };

const boardCache = new Map<string, BoardCacheEntry>();

/** Test hook: forget every cached board. */
export const clearRankedPlaceBoardCache = (): void => boardCache.clear();

const weekdayName = (occurrenceDate: string): string | null => {
  const weekday = weekdayForOccurrenceDate(occurrenceDate);
  return weekday ? REWARD_WEEKDAY_LABEL[weekday] : null;
};

const buildBoard = async (campaign: ChallengeCampaign, venueId: string, nowMs: number): Promise<RankedWeekBoard> => {
  const [schedules, timezone] = await Promise.all([
    loadLiveTriviaSchedulesForVenues([venueId]),
    getVenueTimezone(venueId),
  ]);
  const week = planCurrentRankedWeek({ campaign, venueId, schedules, timezone, nowMs });
  const placeCount = campaign.placePrizes?.length ?? 0;
  const minPlayers = campaign.minPlayers ?? null;
  const board: RankedWeekBoard = {
    weekStartMs: week.cycleStart.getTime(),
    weekStart: week.cycleStart.toISOString(),
    placeCount,
    minPlayers,
    games: week.games.map(({ startMs, endMs, occurrenceDate }) => ({ startMs, endMs, occurrenceDate })),
    countsForReward: week.countsForReward,
    settlement: null,
    winners: [],
    standings: [],
    participantCount: 0,
  };
  if (!week.countsForReward) return board;

  // Settled? One read of this reward's settlements, matched with the resolver's own tolerance.
  const settlements = await listChallengeCycleSettlements({
    challengeIds: [campaign.id],
    cycleStartFrom: new Date(board.weekStartMs - SETTLED_WEEK_MATCH_TOLERANCE_MS),
  });
  board.settlement =
    settlements.find(
      (row) => Math.abs(Date.parse(row.cycleStart) - board.weekStartMs) < SETTLED_WEEK_MATCH_TOLERANCE_MS,
    ) ?? null;

  if (board.settlement) {
    board.participantCount = board.settlement.participantCount;
    if (board.settlement.outcome === "awarded") {
      const winners = await listRankedCycleWinners({
        challengeId: campaign.id,
        cycleStart: week.cycleStart,
        toleranceMs: SETTLED_WEEK_MATCH_TOLERANCE_MS,
      });
      board.winners = winners.map((winner) => ({
        place: winner.place,
        userId: winner.winnerUserId,
        username: winner.username,
      }));
    }
    return board;
  }

  // Live: this week's scores so far. Only games that have started can have answers.
  const started = week.games.filter((game) => game.startMs <= nowMs);
  if (started.length === 0) return board;
  const totals = await loadLiveTriviaWeekTotals(started);
  board.participantCount = rankWeekPlaces({ totals, placeCount, minPlayers: null }).participantCount;
  board.standings = orderWeekStandings(totals).map((row) => ({ userId: row.userId, totalPoints: row.totalPoints }));
  return board;
};

const getBoard = (campaign: ChallengeCampaign, venueId: string, nowMs: number): Promise<RankedWeekBoard> => {
  const cached = boardCache.get(campaign.id);
  if (cached && cached.expiresAtMs > nowMs) return cached.board;

  const board = buildBoard(campaign, venueId, nowMs);
  const entry: BoardCacheEntry = { expiresAtMs: nowMs + LIVE_BOARD_TTL_MS, board };
  boardCache.set(campaign.id, entry);
  board.then(
    (built) => {
      // Reaching the settled state, or a week with nothing to settle, lets the board live longer.
      const final = built.settlement !== null;
      const ttl = final ? SETTLED_BOARD_TTL_MS : LIVE_BOARD_TTL_MS;
      entry.expiresAtMs = Math.min(nowMs + ttl, built.weekStartMs + BOARD_MAX_AGE_MS);
    },
    () => {
      // A failed build is never cached: the next request retries.
      if (boardCache.get(campaign.id) === entry) boardCache.delete(campaign.id);
    },
  );
  return board;
};

/** The card state for one viewer from a (possibly cached) board. Pure. */
export const rankedCardStateFromBoard = (
  board: RankedWeekBoard,
  viewerUserId: string | null,
  nowMs: number,
): RankedPlaceCardState => {
  const base: Omit<RankedPlaceCardState, "phase"> = {
    weekStart: board.weekStart,
    placeCount: board.placeCount,
    minPlayers: board.minPlayers,
    participantCount: board.participantCount,
    gamesLeft: 0,
    lastGameDay: null,
    viewer: null,
    outcome: null,
    settledMinPlayers: null,
    winners: [],
    viewerPlace: null,
  };

  if (board.games.length === 0) return { ...base, phase: "no_games" };
  if (!board.countsForReward) return { ...base, phase: "not_live" };

  if (board.settlement) {
    return {
      ...base,
      phase: "settled",
      outcome: board.settlement.outcome,
      settledMinPlayers: board.settlement.minPlayers,
      winners: board.winners.map(({ place, username }) => ({ place, username })),
      viewerPlace: viewerUserId
        ? board.winners.find((winner) => winner.userId === viewerUserId)?.place ?? null
        : null,
    };
  }

  const left = board.games.filter((game) => game.endMs > nowMs);
  const lastGame = board.games.reduce((a, b) => (b.endMs > a.endMs ? b : a));
  const index = viewerUserId ? board.standings.findIndex((row) => row.userId === viewerUserId) : -1;
  return {
    ...base,
    phase: "live",
    gamesLeft: left.length,
    lastGameDay: weekdayName(lastGame.occurrenceDate),
    viewer: viewerUserId
      ? { rank: index >= 0 ? index + 1 : null, points: index >= 0 ? board.standings[index].totalPoints : 0 }
      : null,
  };
};

/**
 * Attach `rankedPlaces` to every ranked-places card in a venue's Rewards list. Cards of any
 * other kind are returned untouched, and a venue with no ranked reward costs nothing. A
 * reward whose card state can't be built (read failure, misconfigured row) is returned
 * without `rankedPlaces`, which the panel renders as the reward's description alone.
 */
export const attachRankedPlaceCards = async <T extends ChallengeCampaign>(
  campaigns: readonly T[],
  venueId: string,
  viewerUserId: string | null,
  nowMs: number = Date.now(),
): Promise<Array<T & { rankedPlaces?: RankedPlaceCardState }>> => {
  const cleanVenueId = String(venueId ?? "").trim();
  const ranked = campaigns.filter(
    (campaign) =>
      campaign.winCondition === "ranked_places" &&
      campaign.isActive &&
      !campaign.winnerUserId &&
      campaign.venueIds.includes(cleanVenueId),
  );
  if (ranked.length === 0) return [...campaigns];

  const states = new Map<string, RankedPlaceCardState>();
  await Promise.all(
    ranked.map(async (campaign) => {
      if (rankedRewardConfigError(campaign)) return;
      try {
        const board = await getBoard(campaign, cleanVenueId, nowMs);
        states.set(campaign.id, rankedCardStateFromBoard(board, viewerUserId, nowMs));
      } catch (error) {
        console.error("[RankedCard] state-failed", {
          campaignId: campaign.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
  return campaigns.map((campaign) => {
    const state = states.get(campaign.id);
    return state ? { ...campaign, rankedPlaces: state } : campaign;
  });
};
