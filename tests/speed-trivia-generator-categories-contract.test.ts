import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRIVIA_CATEGORIES } from "@/lib/triviaCategories";

// Standing rule (docs/speed-trivia-backlog-and-quality-plan.md §7): the writer's categories are the player
// categories, never database inventory. (Moved from the deleted Gemini generator, Phase 4f.1.)
const categories = require(path.resolve("lib/question-writer/speedCategories.cjs")) as {
  SPEED_CATEGORIES: readonly string[];
  DATED_CATEGORIES: readonly string[];
};

describe("Speed Trivia writer categories", () => {
  it("equals the player categories", () => {
    const player = TRIVIA_CATEGORIES.map(c => c.dbValue).sort();
    expect([...categories.SPEED_CATEGORIES].sort()).toEqual(player);
  });
  it("treats only Current Events as dated", () => {
    expect(categories.DATED_CATEGORIES).toEqual(["Current Events"]);
    expect(categories.SPEED_CATEGORIES).toContain("Current Events");
  });
});
