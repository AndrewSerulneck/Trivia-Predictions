import { createHash } from "node:crypto";

// D31 (Phase 4c.6): Speed Trivia shows each question's options in one fixed, shuffled order, so the stored slot
// (the writers put the right answer in C on 43% of questions) tells a player nothing. The order is seeded by the
// question id, so the same question always shows the same order on every server, refresh and resumed round.
// Knowing the order doesn't reveal the answer, so no secret is needed. `perm[shown]` is the stored index.

const MASK_64 = (1n << 64n) - 1n;

// An option that only makes sense after the others ("All of the above", "Both Steel and Kevlar") stays last.
const PINNED_LAST_OPTION = /^(?:(?:all|none) of (?:the above|these|them)|all (?:three|four)|both|neither)\b/i;

export const isPinnedLastOption = (option: string): boolean => PINNED_LAST_OPTION.test(option.trim());

const seedFor = (questionId: string): bigint =>
  createHash("sha256").update(questionId, "utf8").digest().readBigUInt64BE(0);

// SplitMix64: small, fast and well mixed; the modulo bias for a range of 4 out of 2^64 is negligible.
const nextRandom = (state: { s: bigint }): bigint => {
  state.s = (state.s + 0x9e3779b97f4a7c15n) & MASK_64;
  let z = state.s;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
  return z ^ (z >> 31n);
};

/**
 * A permutation of `0..count-1` from a seeded Fisher–Yates. Indexes in `pinnedLast` keep their relative order
 * at the end; the rest are shuffled in front of them.
 */
export const optionOrder = (questionId: string, count: number, pinnedLast: readonly number[] = []): number[] => {
  const size = Math.max(0, Math.floor(count));
  const pinned = new Set(pinnedLast.filter((index) => Number.isInteger(index) && index >= 0 && index < size));
  const free = Array.from({ length: size }, (_, index) => index).filter((index) => !pinned.has(index));
  const state = { s: seedFor(questionId) };
  for (let index = free.length - 1; index > 0; index -= 1) {
    const swap = Number(nextRandom(state) % BigInt(index + 1));
    [free[index], free[swap]] = [free[swap], free[index]];
  }
  return [...free, ...[...pinned].sort((a, b) => a - b)];
};

/** The shown order for a stored question: `optionOrder` with "All of the above"-style options kept last. */
export const questionOptionOrder = (questionId: string, options: readonly string[]): number[] =>
  optionOrder(
    questionId,
    options.length,
    options.flatMap((option, index) => (isPinnedLastOption(option) ? [index] : []))
  );

/** Shown index → stored index. A time-out (-1) or an index outside the options is returned unchanged. */
export const storedIndexFor = (perm: readonly number[], shown: number): number =>
  Number.isInteger(shown) && shown >= 0 && shown < perm.length ? perm[shown] : shown;

/** Stored index → shown index (-1 when the stored index isn't an option). */
export const shownIndexFor = (perm: readonly number[], stored: number): number => perm.indexOf(stored);
