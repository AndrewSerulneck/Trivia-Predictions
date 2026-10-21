// A weekly places reward's settled weeks as rows: who took each place, what they won, whether
// the coupon was redeemed, and why a week with no winner had none
// (docs/live-trivia-weekly-places-reward-plan.md §5e; Phase 8's Game Results reuses it).
//
// Pure and client-safe. Inputs come from the ledger (challenge_cycle_winners, `place` set) and
// challenge_cycle_settlements. The prize shown is the reward's CURRENT ladder entry for the place:
// the ledger stores only a gift-card amount, so a ladder edited after a week was paid reads as
// the new prize here (the coupon itself keeps what it was won with).

import { describeRewardPrize } from "@/lib/rewardDefinitions";
import { placeOrdinal } from "@/lib/rankedPlaceRewards";
import type { RewardPlacePrize } from "@/types";

export type RankedWinnerInput = {
  cycleStart: string;
  place?: number | null;
  winnerUsername: string | null;
  pointsEarned: number;
  prizeRedeemedAt: string | null;
};

export type RankedSettlementInput = {
  cycleStart: string;
  outcome: "awarded" | "no_scorers" | "below_minimum";
  participantCount: number;
  minPlayers: number | null;
};

export type RankedWeekWinnerRow = {
  place: number;
  /** Null = the player deleted their account. */
  username: string | null;
  points: number;
  prize: string;
  redeemedAt: string | null;
};

export type RankedWeekHistoryRow = {
  cycleStart: string;
  outcome: RankedSettlementInput["outcome"];
  participantCount: number | null;
  winners: RankedWeekWinnerRow[];
  /** Why nobody won ("Only 2 players — the minimum was 4"), or null when the week paid someone. */
  note: string | null;
};

const noteFor = (settlement: RankedSettlementInput, noScorersNote: string): string | null => {
  if (settlement.outcome === "no_scorers") return noScorersNote;
  if (settlement.outcome === "below_minimum") {
    const played = `${settlement.participantCount} player${settlement.participantCount === 1 ? "" : "s"}`;
    return settlement.minPlayers
      ? `Only ${played} — the minimum was ${settlement.minPlayers}.`
      : `Only ${played} — below the minimum.`;
  }
  return null;
};

/** Newest week first. A winner row with no settlement (never written by the RPC) still shows as awarded. */
export const buildRankedWeekHistory = (params: {
  winners: readonly RankedWinnerInput[];
  settlements: readonly RankedSettlementInput[];
  placePrizes: readonly RewardPlacePrize[] | null | undefined;
  /** What a cycle nobody scored in says; a March Madness bracket isn't a week. */
  noScorersNote?: string;
}): RankedWeekHistoryRow[] => {
  const noScorersNote = params.noScorersNote ?? "Nobody scored this week.";
  const prizeByPlace = new Map((params.placePrizes ?? []).map((prize) => [prize.place, describeRewardPrize(prize)]));
  const rows = new Map<number, RankedWeekHistoryRow>();

  for (const settlement of params.settlements) {
    const ms = Date.parse(settlement.cycleStart);
    if (!Number.isFinite(ms)) continue;
    rows.set(ms, {
      cycleStart: settlement.cycleStart,
      outcome: settlement.outcome,
      participantCount: settlement.participantCount,
      winners: [],
      note: noteFor(settlement, noScorersNote),
    });
  }
  for (const winner of params.winners) {
    const ms = Date.parse(winner.cycleStart);
    const place = Number(winner.place);
    if (!Number.isFinite(ms) || !Number.isInteger(place) || place < 1) continue;
    const row =
      rows.get(ms) ??
      ({ cycleStart: winner.cycleStart, outcome: "awarded", participantCount: null, winners: [], note: null } as RankedWeekHistoryRow);
    row.winners.push({
      place,
      username: winner.winnerUsername,
      points: winner.pointsEarned,
      prize: prizeByPlace.get(place) || "—",
      redeemedAt: winner.prizeRedeemedAt,
    });
    rows.set(ms, row);
  }
  for (const row of rows.values()) row.winners.sort((a, b) => a.place - b.place);
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) => row);
};

/** "1st · Snooker", used where a row is one line. */
export const rankedWinnerLabel = (winner: Pick<RankedWeekWinnerRow, "place" | "username">): string =>
  `${placeOrdinal(winner.place)} · ${winner.username ?? "Deleted player"}`;
