import "server-only";

import { listChallengeCampaignsByIds } from "@/lib/challengeCampaigns";
import {
  OWNER_REWARD_DETAIL_CYCLE_LIMIT,
  formatCycleLabel,
  rewardHowWonLabel,
  type OwnerRewardCycle,
  type OwnerRewardDetail,
} from "@/lib/ownerHistoryDisplay";
import { BRACKET_PRIZE_DEFINITION_ID, BRACKET_PRIZE_NO_SCORERS_NOTE, bracketPrizeKeyLabel, bracketPrizeKeyOfCycle } from "@/lib/bracketPrizes";
import { buildRankedWeekHistory } from "@/lib/rankedWeekHistory";
import { ResultsNotFoundError } from "@/lib/results/errors";
import { loadUsernames } from "@/lib/results/playerNames";
import { describeRewardPrize } from "@/lib/rewardDefinitions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueTimezone } from "@/lib/timezone";
import type { ChallengeCampaign } from "@/types";

// One reward's history on the Partner Dashboard's Results page (docs/partner-results-page-plan.md).
// Read-only. The route (app/api/owner/history/rewards/[rewardId]) checks the owner controls `venueId`
// BEFORE calling anything here, and every read below is scoped to that one venue (ledger rows with
// venue_id = venueId; a reward that isn't this venue's throws ResultsNotFoundError, a 404), so a reward shared with another venue never leaks that venue's winners.
// The timeline, standings and breakdown live in lib/results/.
//
// COST: on demand only (a partner tapping a reward): 3–5 bounded reads, no cron, no polling.
//
// PRIVACY: usernames and points only, never a player id (lib/ownerHistoryDisplay.ts).

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

const howWonFor = (campaign: ChallengeCampaign): string =>
  rewardHowWonLabel({
    winCondition: campaign.winCondition,
    rewardDefinitionId: campaign.rewardDefinitionId,
    pointsRequiredToWin: campaign.pointsRequiredToWin,
    placeCount: campaign.placePrizes?.length ?? campaign.winnerQuota,
  });

const isCampaignActive = (campaign: ChallengeCampaign): boolean => campaign.isActive && !campaign.winnerUserId;

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
  if (!campaign) throw new ResultsNotFoundError("That prize wasn't found.");
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
  if (ledger.error) throw new Error(ledger.error.message ?? "Failed to load the prize's winners.");
  if (settlements.error) throw new Error(settlements.error.message ?? "Failed to load the prize's weeks.");

  const ledgerRows = ledger.data ?? [];
  const settlementRows = settlements.data ?? [];
  if (!offeredHere && ledgerRows.length === 0 && settlementRows.length === 0) {
    throw new ResultsNotFoundError("That prize wasn't found.");
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
    if (error) throw new Error(error.message ?? "Failed to load the prize's coupons.");
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
  const isBracketPrize = campaign.rewardDefinitionId === BRACKET_PRIZE_DEFINITION_ID;
  const labelFor = (cycleStart: string): string => {
    const label = formatCycleLabel({
      cycleStart,
      recurringType: campaign.recurringType,
      timeZone,
      happenedAt: happenedAt.get(Date.parse(cycleStart)) ?? null,
      currentYear,
    });
    // A March Madness prize has one cycle per bracket: name the bracket ("Men's bracket · Won Mon, Apr 5").
    const key = isBracketPrize ? bracketPrizeKeyOfCycle(cycleStart) : null;
    return key ? `${bracketPrizeKeyLabel(key)} · ${label}` : label;
  };

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
      ...(isBracketPrize ? { noScorersNote: BRACKET_PRIZE_NO_SCORERS_NOTE } : {}),
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
