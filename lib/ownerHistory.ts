import "server-only";

import { listChallengeCampaignsByIds } from "@/lib/challengeCampaigns";
import {
  OWNER_GAME_STANDINGS_LIMIT,
  OWNER_HISTORY_PAGE_SIZE,
  OWNER_REWARD_DETAIL_CYCLE_LIMIT,
  formatCycleLabel,
  parseGamesCursor,
  parseRewardsCursor,
  rewardHowWonLabel,
  rewardsCursor,
  type OwnerGameDetail,
  type OwnerGameHistoryPage,
  type OwnerGameHistoryRow,
  type OwnerRewardCycle,
  type OwnerRewardDetail,
  type OwnerRewardHistoryPage,
  type OwnerRewardHistoryRow,
} from "@/lib/ownerHistoryDisplay";
import { buildRankedWeekHistory } from "@/lib/rankedWeekHistory";
import { liveTriviaGameKey, liveTriviaResultsAdapter, parseLiveTriviaGameKey } from "@/lib/results/adapters/liveTrivia";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";
import { loadUsernames } from "@/lib/results/playerNames";
import type { ResultsGameRow } from "@/lib/results/types";
import { describeRewardPrize } from "@/lib/rewardDefinitions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign } from "@/types";

// Game Results on the Partner Dashboard (docs/live-trivia-weekly-places-reward-plan.md §5f, Phase 8).
// Read-only. The routes (app/api/owner/history/**) check the owner controls `venueId` BEFORE calling
// anything here; every function below also scopes every read to that one venue (its own schedules,
// ledger rows with venue_id = venueId), so a reward shared with another venue never leaks that
// venue's winners.
//
// The Games half now lives in the Results page's Live Trivia adapter
// (lib/results/adapters/liveTrivia.ts, docs/partner-results-page-plan.md Phase 2); the two game
// functions below are thin wrappers that keep the old routes' shapes until Phase 5 deletes them.
//
// COST (plan §6): only on demand (a partner opening the sheet), no cron, no polling. A list page is
// one schedules read + one RPC + one usernames read (games), or one RPC (paged in SQL) + one read of
// that page's rewards by id + one usernames read (rewards). A detail is 3–5 bounded reads.
//
// PRIVACY: usernames and points only, never a player id (lib/ownerHistoryDisplay.ts).

/** The history RPCs aren't deployed yet (migration 20261014213000): the route answers 503. */
export { ResultsUnavailableError as OwnerHistoryUnavailableError };
/** The game / reward isn't this venue's: the route answers 404. */
export { ResultsNotFoundError as OwnerHistoryNotFoundError };

const client = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

const currentYearIn = (timeZone: string, nowMs: number): number => {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date(nowMs)));
  } catch {
    return new Date(nowMs).getUTCFullYear();
  }
};

// ── Games (wrappers over the Live Trivia Results adapter) ─────────────────────────────

const toOwnerGameRow = (game: ResultsGameRow): OwnerGameHistoryRow => {
  const key = parseLiveTriviaGameKey(game.gameKey);
  return {
    scheduleId: key?.scheduleId ?? "",
    occurrenceDate: game.date,
    scheduleName: game.title,
    playerCount: game.playerCount,
    inProgress: game.inProgress,
    topPoints: game.topScore,
    winners: game.winners,
  };
};

/** One page of the venue's past Live Trivia games, newest first (`before` = a date cursor). */
export const listOwnerGameHistory = async (params: {
  venueId: string;
  before?: string | null;
  nowMs?: number;
}): Promise<OwnerGameHistoryPage> => {
  const before = parseGamesCursor(params.before);
  const page = await liveTriviaResultsAdapter.listGames({
    venueId: params.venueId,
    before,
    limit: OWNER_HISTORY_PAGE_SIZE,
    nowMs: params.nowMs ?? Date.now(),
    withFirstGameDate: !before,
  });
  const games = page.games.map(toOwnerGameRow);
  const nextBefore = page.exhausted ? null : games[games.length - 1]?.occurrenceDate ?? null;
  return page.firstGameDate === undefined ? { games, nextBefore } : { games, nextBefore, firstGameDate: page.firstGameDate };
};

/** One past game's final standings (top 10 + ties). Throws NotFound for another venue's schedule. */
export const getOwnerGameDetail = async (params: {
  venueId: string;
  scheduleId: string;
  occurrenceDate: string;
  nowMs?: number;
}): Promise<OwnerGameDetail> => {
  const detail = await liveTriviaResultsAdapter.getStandings({
    venueId: params.venueId,
    gameKey: liveTriviaGameKey(params.scheduleId, params.occurrenceDate),
    nowMs: params.nowMs ?? Date.now(),
    limit: OWNER_GAME_STANDINGS_LIMIT,
  });
  const key = parseLiveTriviaGameKey(detail.game.gameKey);
  return {
    scheduleId: key?.scheduleId ?? params.scheduleId,
    occurrenceDate: detail.game.date,
    scheduleName: detail.game.title,
    playerCount: detail.game.playerCount,
    inProgress: detail.game.inProgress,
    standings: detail.standings.map((row) => ({ rank: row.rank, username: row.username, points: row.score })),
  };
};

// ── Rewards ────────────────────────────────────────────────────────────────────────────

type RewardSummaryRpcRow = {
  challenge_id: string;
  last_cycle_start: string;
  last_activity_at: string;
  cycle_count: number | string;
  last_winners: Array<{ user_id: string | null; place: number | null; points: number | null }> | null;
};

const howWonFor = (campaign: ChallengeCampaign): string =>
  rewardHowWonLabel({
    winCondition: campaign.winCondition,
    rewardDefinitionId: campaign.rewardDefinitionId,
    pointsRequiredToWin: campaign.pointsRequiredToWin,
    placeCount: campaign.placePrizes?.length ?? campaign.winnerQuota,
  });

const isCampaignActive = (campaign: ChallengeCampaign): boolean => campaign.isActive && !campaign.winnerUserId;

/**
 * One page of the rewards that have ever paid (or settled a week) at this venue, most recent
 * activity first. The RPC finds them from this venue's own ledger and settlements and pages in SQL
 * (keyset on last activity + id), so an old reward never drops out of a capped list and a page
 * costs the same however long the history is.
 */
export const listOwnerRewardHistory = async (params: {
  venueId: string;
  before?: string | null;
  nowMs?: number;
}): Promise<OwnerRewardHistoryPage> => {
  const nowMs = params.nowMs ?? Date.now();
  const cursor = parseRewardsCursor(params.before);
  const { data, error } = await client().rpc("challenge_reward_history_summaries", {
    p_venue_id: params.venueId,
    p_before_at: cursor?.at ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: OWNER_HISTORY_PAGE_SIZE,
  });
  if (error) {
    if (isMissingFunction(error, "challenge_reward_history_summaries")) {
      console.error("[OwnerHistory] rpc-missing challenge_reward_history_summaries");
      throw new ResultsUnavailableError("Past rewards aren't available yet.");
    }
    throw new Error(`challenge_reward_history_summaries RPC failed: ${error.message}`);
  }

  // The RPC returns one row past the page when another page exists.
  const all = ((data ?? []) as RewardSummaryRpcRow[]).filter((row) => Number.isFinite(Date.parse(row.last_activity_at)));
  const pageRows = all.slice(0, OWNER_HISTORY_PAGE_SIZE);
  const lastRow = pageRows[pageRows.length - 1];
  // The cursor carries the RPC's own timestamp text (microseconds intact), so the next page starts
  // exactly after this row, never skipping a row a few microseconds older.
  const nextBefore =
    all.length > pageRows.length && lastRow
      ? rewardsCursor({ lastActivityAt: lastRow.last_activity_at, rewardId: lastRow.challenge_id })
      : null;
  if (pageRows.length === 0) return { rewards: [], nextBefore: null };

  const campaigns = await listChallengeCampaignsByIds(pageRows.map((row) => row.challenge_id));
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const timeZone = await getVenueTimezone(params.venueId);
  const currentYear = currentYearIn(timeZone, nowMs);
  const shown = pageRows.filter((row) => byId.has(row.challenge_id));
  const names = await loadUsernames(shown.flatMap((row) => (row.last_winners ?? []).map((w) => w.user_id)));
  const rewards: OwnerRewardHistoryRow[] = shown.map((row) => {
    const campaign = byId.get(row.challenge_id) as ChallengeCampaign;
    return {
      rewardId: campaign.id,
      name: campaign.name,
      howWon: howWonFor(campaign),
      isActive: isCampaignActive(campaign),
      lastActivityAt: new Date(Date.parse(row.last_activity_at)).toISOString(),
      lastCycleLabel: formatCycleLabel({
        cycleStart: row.last_cycle_start,
        recurringType: campaign.recurringType,
        timeZone,
        happenedAt: row.last_activity_at,
        currentYear,
      }),
      cycleCount: Number(row.cycle_count) || 0,
      lastWinners: (row.last_winners ?? []).map((winner) => ({
        place: winner.place ?? null,
        username: winner.user_id ? names.get(winner.user_id) ?? null : null,
        points: Number(winner.points) || 0,
      })),
    };
  });
  return { rewards, nextBefore };
};

type LedgerRow = {
  cycle_start: string;
  winner_user_id: string | null;
  points_earned: number | null;
  finalized_at: string | null;
  place: number | null;
};

type SettlementRow = {
  cycle_start: string;
  outcome: "awarded" | "no_scorers" | "below_minimum";
  participant_count: number | null;
  min_players: number | null;
  settled_at: string | null;
};

/**
 * One reward's history at this venue: each cycle, newest first, with winners (by place for a
 * weekly places reward), their prize, whether the coupon was redeemed, and why a week paid nobody.
 * The newest OWNER_REWARD_DETAIL_CYCLE_LIMIT cycles only. Throws NotFound for a reward that isn't
 * this venue's.
 */
export const getOwnerRewardDetail = async (params: {
  venueId: string;
  rewardId: string;
  nowMs?: number;
}): Promise<OwnerRewardDetail> => {
  const nowMs = params.nowMs ?? Date.now();
  const [campaign] = await listChallengeCampaignsByIds([params.rewardId]);
  if (!campaign) throw new ResultsNotFoundError("That reward wasn't found.");
  // This venue's reward: offered here (or everywhere), or one that has paid here (a reward can stop
  // being offered at a venue after it paid there). Every read below is scoped to venue_id anyway.
  const offeredHere = campaign.venueIds.length === 0 || campaign.venueIds.includes(params.venueId);
  const db = client();

  // Newest cycles first. Settlements exist only for weekly places rewards (one row per week, so the
  // limit is in cycles); a ledger cycle can have several winners, so read a few extra rows and cut
  // on cycles below.
  const ledgerLimit = OWNER_REWARD_DETAIL_CYCLE_LIMIT * Math.max(1, Math.min(10, campaign.winnerQuota || 1)) + 1;
  const [ledger, settlements] = await Promise.all([
    db
      .from("challenge_cycle_winners")
      .select("cycle_start, winner_user_id, points_earned, finalized_at, place")
      .eq("challenge_id", campaign.id)
      .eq("venue_id", params.venueId)
      .order("cycle_start", { ascending: false })
      .limit(ledgerLimit)
      .returns<LedgerRow[]>(),
    campaign.winCondition === "ranked_places"
      ? db
          .from("challenge_cycle_settlements")
          .select("cycle_start, outcome, participant_count, min_players, settled_at")
          .eq("challenge_id", campaign.id)
          .eq("venue_id", params.venueId)
          .order("cycle_start", { ascending: false })
          .limit(OWNER_REWARD_DETAIL_CYCLE_LIMIT + 1)
          .returns<SettlementRow[]>()
      : Promise.resolve({ data: [] as SettlementRow[], error: null }),
  ]);
  if (ledger.error) throw new Error(ledger.error.message ?? "Failed to load the reward's winners.");
  if (settlements.error) throw new Error(settlements.error.message ?? "Failed to load the reward's weeks.");

  const ledgerRows = ledger.data ?? [];
  const settlementRows = settlements.data ?? [];
  if (!offeredHere && ledgerRows.length === 0 && settlementRows.length === 0) {
    throw new ResultsNotFoundError("That reward wasn't found.");
  }
  // When the ledger read hit its limit, its oldest cycle may be only partly read, and any older
  // cycle not read at all: keep only cycles strictly newer than the last ledger row read.
  const ledgerCut = ledgerRows.length >= ledgerLimit ? Date.parse(ledgerRows[ledgerRows.length - 1].cycle_start) : null;
  const cycleKeys = [...new Set([...ledgerRows, ...settlementRows].map((row) => Date.parse(row.cycle_start)))]
    .filter((key) => Number.isFinite(key) && (ledgerCut === null || key > ledgerCut))
    .sort((a, b) => b - a);
  const kept = new Set(cycleKeys.slice(0, OWNER_REWARD_DETAIL_CYCLE_LIMIT));
  const truncated = cycleKeys.length > kept.size || ledgerCut !== null;
  const keptLedger = ledgerRows.filter((row) => kept.has(Date.parse(row.cycle_start)));
  const keptSettlements = settlementRows.filter((row) => kept.has(Date.parse(row.cycle_start)));

  // Redeemed or not: the coupon row for (winner, cycle). Bounded by the kept cycles' range.
  const redeemed = new Set<string>();
  const winnerIds = keptLedger.flatMap((row) => (row.winner_user_id ? [row.winner_user_id] : []));
  if (winnerIds.length > 0 && kept.size > 0) {
    const oldest = new Date(Math.min(...kept)).toISOString();
    const { data, error } = await db
      .from("challenge_campaign_redemptions")
      .select("winner_user_id, cycle_start, prize_redeemed_at")
      .eq("challenge_id", campaign.id)
      .eq("venue_id", params.venueId)
      .gte("cycle_start", oldest)
      .in("winner_user_id", [...new Set(winnerIds)])
      .returns<Array<{ winner_user_id: string; cycle_start: string; prize_redeemed_at: string | null }>>();
    if (error) throw new Error(error.message ?? "Failed to load the reward's coupons.");
    for (const row of data ?? []) {
      if (row.prize_redeemed_at) redeemed.add(`${row.winner_user_id}|${Date.parse(row.cycle_start)}`);
    }
  }
  const names = await loadUsernames(winnerIds);
  const timeZone = await getVenueTimezone(params.venueId);
  const currentYear = currentYearIn(timeZone, nowMs);
  const happenedAt = new Map<number, string | null>();
  for (const row of [...keptLedger, ...keptSettlements]) {
    const key = Date.parse(row.cycle_start);
    const at = "finalized_at" in row ? row.finalized_at : row.settled_at;
    const prev = happenedAt.get(key) ?? null;
    if (at && (!prev || Date.parse(at) > Date.parse(prev))) happenedAt.set(key, at);
  }
  const labelFor = (cycleStart: string): string =>
    formatCycleLabel({
      cycleStart,
      recurringType: campaign.recurringType,
      timeZone,
      happenedAt: happenedAt.get(Date.parse(cycleStart)) ?? null,
      currentYear,
    });

  let cycles: OwnerRewardCycle[];
  if (campaign.winCondition === "ranked_places") {
    // The weekly places rows (who took each place, the place's prize, why a week paid nobody) have one
    // home, shared with the admin Rewards panel.
    const weeks = buildRankedWeekHistory({
      winners: keptLedger.map((row) => ({
        cycleStart: row.cycle_start,
        place: row.place,
        winnerUsername: row.winner_user_id ? names.get(row.winner_user_id) ?? null : null,
        pointsEarned: Number(row.points_earned) || 0,
        prizeRedeemedAt: null,
      })),
      settlements: keptSettlements.map((row) => ({
        cycleStart: row.cycle_start,
        outcome: row.outcome,
        participantCount: Number(row.participant_count) || 0,
        minPlayers: row.min_players ?? null,
      })),
      placePrizes: campaign.placePrizes,
    });
    // Redeemed is keyed by player, which the week rows (usernames only) no longer carry: look it up
    // by (cycle, place) from the ledger instead. A deleted player's coupon is gone with their account,
    // so whether they redeemed it is unknown (null), never "not redeemed".
    const redeemedByPlace = new Map<string, boolean | null>(
      keptLedger.map((row) => [
        `${Date.parse(row.cycle_start)}|${row.place}`,
        row.winner_user_id ? redeemed.has(`${row.winner_user_id}|${Date.parse(row.cycle_start)}`) : null,
      ]),
    );
    cycles = weeks.map((week) => ({
      cycleStart: week.cycleStart,
      label: labelFor(week.cycleStart),
      note: week.note,
      winners: week.winners.map((winner) => ({
        place: winner.place,
        username: winner.username,
        points: winner.points,
        prize: winner.prize,
        redeemed: redeemedByPlace.get(`${Date.parse(week.cycleStart)}|${winner.place}`) ?? null,
      })),
    }));
  } else {
    const prize = describeRewardPrize(campaign) || "Prize";
    const byCycle = new Map<number, OwnerRewardCycle>();
    for (const row of keptLedger) {
      const key = Date.parse(row.cycle_start);
      const cycle = byCycle.get(key) ?? { cycleStart: row.cycle_start, label: labelFor(row.cycle_start), winners: [], note: null };
      cycle.winners.push({
        place: null,
        username: row.winner_user_id ? names.get(row.winner_user_id) ?? null : null,
        points: Number(row.points_earned) || 0,
        prize,
        redeemed: row.winner_user_id ? redeemed.has(`${row.winner_user_id}|${key}`) : null,
      });
      byCycle.set(key, cycle);
    }
    cycles = [...byCycle.entries()].sort((a, b) => b[0] - a[0]).map(([, cycle]) => cycle);
  }

  return {
    rewardId: campaign.id,
    name: campaign.name,
    howWon: howWonFor(campaign),
    isActive: isCampaignActive(campaign),
    cycles,
    truncated,
  };
};
