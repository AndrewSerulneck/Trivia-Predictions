import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";

// Standing rule (docs/speed-trivia-backlog-and-quality-plan.md §7): the generator's categories are the
// player categories, never database inventory.
const generation = require(path.resolve("lib/speed-trivia-uniqueness/generation.cjs")) as {
  TOPICS: Record<string, string[]>;
  GENERATOR_CATEGORIES: readonly string[];
};

describe("Speed Trivia generator categories", () => {
  it("equals the player categories", () => {
    const player = TRIVIA_CATEGORIES.map(c => c.dbValue).sort();
    expect([...generation.GENERATOR_CATEGORIES].sort()).toEqual(player);
    expect(Object.keys(generation.TOPICS).sort()).toEqual(player);
  });
});
