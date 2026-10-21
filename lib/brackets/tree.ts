// March Madness brackets — the shape of the bracket (docs/squares-and-brackets-plan.md, Phase 7).
// Pure, client-safe. Every other bracket module, the SQL in 20261019*_brackets_engine.sql and the
// Phase 8 screens use these numbers, so the tree has exactly one definition.
//
// Rounds: 1 = Round of 64, 2 = Round of 32, 3 = Sweet 16, 4 = Elite Eight, 5 = Final Four,
// 6 = championship. Round 0 is the opening round ("First Four"; 12 games in 2027), which is not a
// pick: an opening-round winner fills a round-1 seat.
//
// The feed's (round, bracket_location) is the tree (plan §8, proven by
// tests/brackets-feed-fixture.test.ts): round r location k is fed by round r-1 locations 2k-1
// (its HOME team) and 2k (its AWAY team).
//
// SLOTS: the 63 games, numbered 0–62 round by round: round 1 = 0–31, round 2 = 32–47,
// round 3 = 48–55, round 4 = 56–59, round 5 = 60–61, championship = 62.
// SEATS: the 64 round-1 positions, 0–63: round-1 location k has home seat 2(k-1) and away seat
// 2(k-1)+1. A pick is the SEAT whose team the player says wins that slot — so a bracket is one
// array of 63 seats, a pick on an opening-round seat means "whoever wins that opener" (ESPN's
// convention), and grading is `pick === winning seat`.
// Slot s of round r covers a contiguous run of 2^r seats; region i (0–3) = seats 16i … 16i+15 =
// round-1 locations 8i+1 … 8i+8 (plan §8).

export const BRACKET_ROUNDS = [1, 2, 3, 4, 5, 6] as const;
export type BracketRound = (typeof BRACKET_ROUNDS)[number];

export const BRACKET_SLOT_COUNT = 63;
export const BRACKET_SEAT_COUNT = 64;
export const BRACKET_REGION_COUNT = 4;

/** Games per round, round 1 → 6. */
export const BRACKET_GAMES_PER_ROUND: Record<BracketRound, number> = { 1: 32, 2: 16, 3: 8, 4: 4, 5: 2, 6: 1 };

/** First slot of each round. */
const ROUND_OFFSET: Record<BracketRound, number> = { 1: 0, 2: 32, 3: 48, 4: 56, 5: 60, 6: 62 };

/**
 * The two kinds of entry. `main` = all 63 picks, locked at the first Round-of-64 tip. `second` =
 * the second-chance bracket: the 15 picks from the Sweet 16 on, opened when the Round of 32 ends and
 * locked at the first Sweet 16 tip. Must match bracket_entries.kind.
 */
export const BRACKET_KINDS = ["main", "second"] as const;
export type BracketKind = (typeof BRACKET_KINDS)[number];

/** The first round a kind picks. */
export const BRACKET_BASE_ROUND: Record<BracketKind, BracketRound> = { main: 1, second: 3 };

export const BRACKET_GENDERS = ["men", "women"] as const;
export type BracketGender = (typeof BRACKET_GENDERS)[number];

export const isBracketRound = (value: unknown): value is BracketRound =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;

export const isBracketSlot = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < BRACKET_SLOT_COUNT;

export const isBracketSeat = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < BRACKET_SEAT_COUNT;

export const isBracketKind = (value: unknown): value is BracketKind =>
  value === "main" || value === "second";

export const isBracketGender = (value: unknown): value is BracketGender =>
  value === "men" || value === "women";

/** The slot of (round, location). Null when the location is out of range for the round. */
export const slotOf = (round: number, location: number): number | null => {
  if (!isBracketRound(round)) return null;
  if (!Number.isInteger(location) || location < 1 || location > BRACKET_GAMES_PER_ROUND[round]) return null;
  return ROUND_OFFSET[round] + location - 1;
};

export const roundOfSlot = (slot: number): BracketRound => {
  if (slot >= 62) return 6;
  if (slot >= 60) return 5;
  if (slot >= 56) return 4;
  if (slot >= 48) return 3;
  if (slot >= 32) return 2;
  return 1;
};

/** The feed's bracket_location (1-based) of a slot. */
export const locationOfSlot = (slot: number): number => slot - ROUND_OFFSET[roundOfSlot(slot)] + 1;

/** Every slot of one round, in location order. */
export const slotsOfRound = (round: BracketRound): number[] =>
  Array.from({ length: BRACKET_GAMES_PER_ROUND[round] }, (_, i) => ROUND_OFFSET[round] + i);

/** The slots a kind picks, in order. */
export const slotsOfKind = (kind: BracketKind): number[] =>
  BRACKET_ROUNDS.filter((round) => round >= BRACKET_BASE_ROUND[kind]).flatMap(slotsOfRound);

/** The two slots feeding a slot of round ≥ 2: [home child, away child]. Null for round 1. */
export const childSlots = (slot: number): [number, number] | null => {
  const round = roundOfSlot(slot);
  if (round === 1) return null;
  const location = locationOfSlot(slot);
  const below = (round - 1) as BracketRound;
  return [ROUND_OFFSET[below] + 2 * location - 2, ROUND_OFFSET[below] + 2 * location - 1];
};

/** The slot a slot's winner plays in next, and which side it takes there. Null for the championship. */
export const parentOf = (slot: number): { slot: number; side: "home" | "away" } | null => {
  const round = roundOfSlot(slot);
  if (round === 6) return null;
  const location = locationOfSlot(slot);
  const above = (round + 1) as BracketRound;
  return { slot: ROUND_OFFSET[above] + Math.ceil(location / 2) - 1, side: location % 2 === 1 ? "home" : "away" };
};

/** The seats whose teams can reach a slot: [first, last], inclusive. */
export const seatRangeOfSlot = (slot: number): [number, number] => {
  const round = roundOfSlot(slot);
  const width = 2 ** round;
  const location = locationOfSlot(slot);
  return [(location - 1) * width, location * width - 1];
};

export const slotCoversSeat = (slot: number, seat: number): boolean => {
  const [first, last] = seatRangeOfSlot(slot);
  return seat >= first && seat <= last;
};

/** A round-1 slot's two seats: [home, away]. */
export const seatsOfRound1Slot = (slot: number): [number, number] => [2 * slot, 2 * slot + 1];

/** The round-1 slot a seat plays in, and which side. */
export const round1SlotOfSeat = (seat: number): { slot: number; side: "home" | "away" } => ({
  slot: Math.floor(seat / 2),
  side: seat % 2 === 0 ? "home" : "away",
});

/** Region index 0–3 of a seat. */
export const regionOfSeat = (seat: number): number => Math.floor(seat / 16);

/** Region index 0–3 of a slot of rounds 1–4; null for the Final Four and championship. */
export const regionOfSlot = (slot: number): number | null =>
  roundOfSlot(slot) >= 5 ? null : regionOfSeat(seatRangeOfSlot(slot)[0]);

/** An empty 63-pick array. */
export const emptyPicks = (): Array<number | null> => Array.from({ length: BRACKET_SLOT_COUNT }, () => null);

/**
 * A stored 63-seat array (an entry's picks, a tournament's winner seats) as exactly 63 seats or
 * nulls — the ONE normalizer every reader uses (plan 10.4, §17 B9). Missing, short or non-array
 * values read as nulls.
 */
export const bracketSeatList = (value: unknown): Array<number | null> =>
  Array.from({ length: BRACKET_SLOT_COUNT }, (_, i) => {
    const seat = Array.isArray(value) ? value[i] : null;
    return seat === null || seat === undefined ? null : Number(seat);
  });
