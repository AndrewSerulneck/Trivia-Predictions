import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isPinnedLastOption,
  optionOrder,
  questionOptionOrder,
  shownIndexFor,
  storedIndexFor,
} from "@/lib/triviaOptionOrder";

// D31 (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c.6): one fixed, shuffled order per Speed question.

// Synthetic uuid-shaped ids, never production ones: with the algorithm public, a fixture of real ids and their
// stored answers would publish the answers.
const fixtureId = (index: number): string => {
  const hex = createHash("sha256").update(`option-order-fixture-${index}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const isPermutation = (perm: number[], count: number): boolean =>
  perm.length === count && [...perm].sort((a, b) => a - b).every((value, index) => value === index);

describe("optionOrder", () => {
  it("gives the same id the same order", () => {
    const id = fixtureId(1);
    expect(optionOrder(id, 4)).toEqual(optionOrder(id, 4));
    expect(questionOptionOrder(id, ["a", "b", "c", "d"])).toEqual(optionOrder(id, 4));
  });

  it("always returns a permutation", () => {
    for (let index = 0; index < 500; index += 1) {
      for (const count of [2, 3, 4, 5]) {
        expect(isPermutation(optionOrder(fixtureId(index), count), count)).toBe(true);
      }
    }
    expect(optionOrder("x", 0)).toEqual([]);
  });

  it("uses every order of four options", () => {
    const seen = new Set(Array.from({ length: 2000 }, (_, index) => optionOrder(fixtureId(index), 4).join("")));
    expect(seen.size).toBe(24);
  });

  it("spreads the right answer evenly across the shown slots (production's stored mix: 17/32/43/9%)", () => {
    // The 2,524 active questions on 2026-11-16 held the right answer in stored slots A–D 419 / 800 / 1,077 / 228 times.
    const storedMix = [419, 800, 1077, 228];
    const stored = storedMix.flatMap((count, slot) => Array.from({ length: count }, () => slot));
    const shown = [0, 0, 0, 0];
    stored.forEach((slot, index) => {
      shown[shownIndexFor(optionOrder(fixtureId(index), 4), slot)] += 1;
    });
    for (const count of shown) {
      expect(count / stored.length).toBeGreaterThanOrEqual(0.22);
      expect(count / stored.length).toBeLessThanOrEqual(0.28);
    }
  });

  it("keeps an 'All of the above'-style option last and shuffles the rest", () => {
    const options = ["Climate change", "Sea Peoples invasions", "Economic collapse", "All of the above"];
    const orders = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const perm = questionOptionOrder(fixtureId(index), options);
      expect(perm[3]).toBe(3);
      orders.add(perm.join(""));
    }
    expect(orders.size).toBe(6);
    // Not last in storage: it still goes last.
    expect(questionOptionOrder(fixtureId(7), ["None of these", "a", "b", "c"]).at(-1)).toBe(0);
  });

  it("pins only options that lean on the others", () => {
    for (const option of ["All of the above", "none of the above", "All of them", "Both Steel and Kevlar", "Neither can travel in a vacuum", "All three", "None of these"]) {
      expect(isPinnedLastOption(option)).toBe(true);
    }
    for (const option of ["Ball", "Bothell", "All Saints", "Allentown", "Nonesuch", "Mars"]) {
      expect(isPinnedLastOption(option)).toBe(false);
    }
  });
});

describe("index mapping", () => {
  const perm = [2, 0, 3, 1];

  it("maps shown to stored and back", () => {
    for (let shown = 0; shown < 4; shown += 1) {
      expect(shownIndexFor(perm, storedIndexFor(perm, shown))).toBe(shown);
    }
    expect(storedIndexFor(perm, 0)).toBe(2);
    expect(shownIndexFor(perm, 2)).toBe(0);
  });

  it("leaves a time-out and an out-of-range pick unchanged", () => {
    expect(storedIndexFor(perm, -1)).toBe(-1);
    expect(storedIndexFor(perm, 7)).toBe(7);
    expect(storedIndexFor(perm, 1.5)).toBe(1.5);
    expect(shownIndexFor(perm, 9)).toBe(-1);
  });
});
