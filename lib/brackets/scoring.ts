// March Madness brackets — scoring, standings and the venue-points keys
// (docs/squares-and-brackets-plan.md, Phase 7). Pure, client-safe.
//
// Points per correct pick by round: BRACKET_ROUND_POINTS (lib/seasonalPoints.ts, 10/20/40/80/160/320;
// the second-chance bracket uses the same values from the Sweet 16 on). bracket_record_results in
// SQL computes the stored score with the same rule; tests/brackets-engine.test.ts pins them equal.
//
// Venue points (Andrew, decision 11: bracket points ÷ 10) are paid per entry per ROUND, once every
// game of that round is final — at most 6 ledger rows per entry (Phase 1 handoff's row-count trap):
// key `${entryId}:r${round}:${gradeNo}`. gradeNo is the round's bracket_rounds.grade_no, bumped
// when an admin corrects a result in a round that was already complete, so the re-grade pays under
// new keys while the old ones stay spent (same as Squares' board:moment:grade_no).

import { BRACKET_ROUND_POINTS, bracketVenuePoints } from "@/lib/seasonalPoints";
import type { BracketPicks, BracketWinnerSeats } from "@/lib/brackets/picks";
import {
  BRACKET_BASE_ROUND,
  BRACKET_ROUNDS,
  roundOfSlot,
  slotCoversSeat,
  slotsOfKind,
  slotsOfRound,
  type BracketKind,
  type BracketRound,
} from "@/lib/brackets/tree";

export const bracketRoundPoints = (round: BracketRound): number => BRACKET_ROUND_POINTS[round - 1];

const at = (list: ReadonlyArray<number | null>, index: number): number | null => list[index] ?? null;

/** Correct picks per round (index 0 = round 1). Rounds before the kind's first are always 0. */
export const bracketRoundCorrect = (picks: BracketPicks, winnerSeats: BracketWinnerSeats, kind: BracketKind): number[] => {
  const counts = BRACKET_ROUNDS.map(() => 0);
  for (const slot of slotsOfKind(kind)) {
    const winner = at(winnerSeats, slot);
    if (winner !== null && at(picks, slot) === winner) counts[roundOfSlot(slot) - 1] += 1;
  }
  return counts;
};

export const bracketScoreFromRoundCorrect = (roundCorrect: readonly number[]): number =>
  BRACKET_ROUNDS.reduce((sum, round) => sum + (roundCorrect[round - 1] ?? 0) * bracketRoundPoints(round), 0);

export const bracketScore = (picks: BracketPicks, winnerSeats: BracketWinnerSeats, kind: BracketKind): number =>
  bracketScoreFromRoundCorrect(bracketRoundCorrect(picks, winnerSeats, kind));

/** Highest score a kind can reach (main 1,920; second chance 1,280). */
export const bracketMaxScore = (kind: BracketKind): number =>
  slotsOfKind(kind).reduce((sum, slot) => sum + bracketRoundPoints(roundOfSlot(slot)), 0);

/** Is `seat`'s team still in the tournament? (It hasn't lost a decided game.) */
export const isSeatAlive = (seat: number, winnerSeats: BracketWinnerSeats): boolean =>
  winnerSeats.every((winner, slot) => winner === null || winner === undefined || !slotCoversSeat(slot, seat) || winner === seat);

/** Score so far plus every undecided pick whose team is still alive ("max possible"). */
export const bracketMaxPossible = (picks: BracketPicks, winnerSeats: BracketWinnerSeats, kind: BracketKind): number =>
  slotsOfKind(kind).reduce((sum, slot) => {
    const pick = at(picks, slot);
    if (pick === null) return sum;
    const winner = at(winnerSeats, slot);
    const points = bracketRoundPoints(roundOfSlot(slot));
    if (winner !== null) return winner === pick ? sum + points : sum;
    return isSeatAlive(pick, winnerSeats) ? sum + points : sum;
  }, 0);

/** Every game of `round` has a winner. */
export const isBracketRoundComplete = (round: BracketRound, winnerSeats: BracketWinnerSeats): boolean =>
  slotsOfRound(round).every((slot) => at(winnerSeats, slot) !== null);

/** Does this kind of entry score in `round`? */
export const kindScoresRound = (kind: BracketKind, round: BracketRound): boolean => round >= BRACKET_BASE_ROUND[kind];

export const bracketCreditKey = (entryId: string, round: BracketRound, gradeNo: number): string =>
  `${entryId}:r${round}:${gradeNo}`;

/** Venue points one entry earns for one round (0 = no credit row). */
export const bracketRoundVenuePoints = (round: BracketRound, correct: number): number =>
  bracketVenuePoints(Math.max(0, correct) * bracketRoundPoints(round));

// ── Standings ────────────────────────────────────────────────────────────────────────────────
// Plan §3: points, then tiebreaker distance (|guess − championship total|; only once the final is
// known, and a missing guess sorts last), then earliest submit.

export type BracketStandingInput = {
  entryId: string;
  score: number;
  tiebreaker: number | null;
  /** ISO time the entry was last saved. */
  submittedAt: string;
};

export type BracketStanding<T extends BracketStandingInput> = T & { rank: number; tiebreakDistance: number | null };

export const rankBracketEntries = <T extends BracketStandingInput>(
  entries: readonly T[],
  championshipTotal: number | null,
): Array<BracketStanding<T>> => {
  const distance = (entry: T): number | null =>
    championshipTotal === null || entry.tiebreaker === null ? null : Math.abs(entry.tiebreaker - championshipTotal);
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (championshipTotal !== null) {
      const da = distance(a);
      const db = distance(b);
      if (da !== db) return da === null ? 1 : db === null ? -1 : da - db;
    }
    const ta = Date.parse(a.submittedAt);
    const tb = Date.parse(b.submittedAt);
    if (ta !== tb) return ta - tb;
    return a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0;
  });
  return sorted.map((entry, index) => ({ ...entry, rank: index + 1, tiebreakDistance: distance(entry) }));
};
