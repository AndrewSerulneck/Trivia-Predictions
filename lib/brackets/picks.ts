// March Madness brackets — the pick rules (docs/squares-and-brackets-plan.md, Phase 7). Pure,
// client-safe: Phase 8's screens call these, and the save path re-checks with the same function
// (bracket_save_entry in SQL re-checks it a third time, so a hand-made request can't store a
// bracket that couldn't happen).
//
// A bracket is an array of 63 seats or nulls (lib/brackets/tree.ts): picks[slot] = the seat whose
// team wins that slot. A draft may have nulls anywhere; a pick must follow from the picks below it:
//   - in the kind's first round, it is one of the two teams actually in that game (round 1: the
//     game's two seats; second chance's Sweet 16: the two Round-of-32 winners);
//   - in a later round, it is the pick of one of the two games feeding it.
// So a valid bracket can never advance a team it eliminated earlier.

import {
  BRACKET_BASE_ROUND,
  BRACKET_SLOT_COUNT,
  childSlots,
  isBracketSeat,
  parentOf,
  roundOfSlot,
  seatsOfRound1Slot,
  slotCoversSeat,
  slotsOfKind,
  type BracketKind,
} from "@/lib/brackets/tree";

export type BracketPicks = ReadonlyArray<number | null>;
/** The actual winning seat of each slot (null = not decided), from bracket_tournaments.winner_seats. */
export type BracketWinnerSeats = ReadonlyArray<number | null>;

const at = (list: ReadonlyArray<number | null>, index: number): number | null => list[index] ?? null;

/** The seats a player may pick for `slot` right now. Empty when the games below aren't picked/decided yet. */
export const choosableSeats = (
  picks: BracketPicks,
  slot: number,
  kind: BracketKind,
  winnerSeats: BracketWinnerSeats,
): number[] => {
  const round = roundOfSlot(slot);
  const base = BRACKET_BASE_ROUND[kind];
  if (round < base) return [];
  if (round === 1) return seatsOfRound1Slot(slot);
  const children = childSlots(slot);
  if (!children) return [];
  const source = round === base ? winnerSeats : picks;
  return children.map((child) => at(source, child)).filter((seat): seat is number => seat !== null);
};

/** Why `picks` is not a storable bracket of `kind`, or null when it is (drafts with gaps are fine). */
export const bracketPicksProblem = (
  picks: unknown,
  kind: BracketKind,
  winnerSeats: BracketWinnerSeats,
): string | null => {
  if (!Array.isArray(picks) || picks.length !== BRACKET_SLOT_COUNT) return `picks must be an array of ${BRACKET_SLOT_COUNT}`;
  const inKind = new Set(slotsOfKind(kind));
  for (let slot = 0; slot < BRACKET_SLOT_COUNT; slot += 1) {
    const pick: unknown = picks[slot];
    if (pick === null) continue;
    if (!inKind.has(slot)) return `slot ${slot} is not part of this bracket`;
    if (!isBracketSeat(pick) || !slotCoversSeat(slot, pick)) return `slot ${slot}: seat ${String(pick)} can't play there`;
    if (!choosableSeats(picks as BracketPicks, slot, kind, winnerSeats).includes(pick)) {
      return `slot ${slot}: seat ${pick} doesn't follow from the picks before it`;
    }
  }
  return null;
};

/**
 * Pick `seat` (or clear with null) for `slot`. Returns the new bracket, or null when that seat
 * can't be picked there now. A change clears every later pick that had advanced the team it
 * replaces (ESPN's behaviour), so the result is always valid.
 */
export const setBracketPick = (
  picks: BracketPicks,
  slot: number,
  seat: number | null,
  kind: BracketKind,
  winnerSeats: BracketWinnerSeats,
): Array<number | null> | null => {
  if (seat !== null && !choosableSeats(picks, slot, kind, winnerSeats).includes(seat)) return null;
  if (roundOfSlot(slot) < BRACKET_BASE_ROUND[kind]) return null;
  const next = Array.from({ length: BRACKET_SLOT_COUNT }, (_, i) => at(picks, i));
  const old = next[slot];
  next[slot] = seat;
  if (old === null || old === seat) return next;
  for (let up = parentOf(slot); up && next[up.slot] === old; up = parentOf(up.slot)) next[up.slot] = null;
  return next;
};

/** Picks made, out of the kind's slots. */
export const bracketPickCount = (picks: BracketPicks, kind: BracketKind): number =>
  slotsOfKind(kind).filter((slot) => at(picks, slot) !== null).length;

export const isBracketComplete = (picks: BracketPicks, kind: BracketKind): boolean =>
  bracketPickCount(picks, kind) === slotsOfKind(kind).length;

/**
 * "Copy my picks from <Venue>": the source entry's picks when they are valid here (same tournament
 * and kind, so they always are unless an admin has since corrected a result the second-chance
 * bracket starts from), else null.
 */
export const copyableBracketPicks = (
  source: BracketPicks,
  kind: BracketKind,
  winnerSeats: BracketWinnerSeats,
): Array<number | null> | null =>
  bracketPicksProblem(source, kind, winnerSeats) === null ? Array.from(source, (seat) => seat ?? null) : null;

/** Tiebreaker: the championship game's total points. Mirrors the SQL check. */
export const BRACKET_TIEBREAKER_MAX = 400;

export const isBracketTiebreaker = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= BRACKET_TIEBREAKER_MAX;
