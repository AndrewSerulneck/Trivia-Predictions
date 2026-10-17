import { describe, expect, it } from "vitest";
import { CATEGORY_BLITZ_RULES, CATEGORY_BLITZ_TUTORIAL_CARDS } from "@/lib/categoryBlitzHowToPlay";
import { VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";

describe("Category Blitz how-to-play copy (docs/category-blitz-how-to-play-plan.md §3)", () => {
  it("has the intro + 7 cards with Andrew's exact text, in order", () => {
    expect(CATEGORY_BLITZ_TUTORIAL_CARDS.map((card) => card.art)).toEqual([
      "intro",
      "board",
      "answering",
      "timer",
      "unique",
      "duplicate",
      "alliteration",
      "majority",
    ]);
    expect(CATEGORY_BLITZ_TUTORIAL_CARDS.map((card) => [card.statement, card.detail].filter(Boolean).join(" "))).toEqual([
      "Here's how to play Category Blitz",
      "Each round, a letter and list of categories is randomly generated.",
      "Your job is to name something in each category that starts with that round's letter.",
      "Each round lasts 3 minutes! Your responses get graded when time runs out.",
      "Unique answers score points.",
      "No points for same answers!",
      "Bonus points are awarded for alliteration!",
      "Be careful! Some rounds are \"Majority Rules\" mode, where the point is to give the answer you think will be most popular in each category. The point is to try and predict what other people in the room will answer. Hope you're good at reading minds!",
    ]);
  });

  it("feeds the tutorial steps and the rules list from the one source", () => {
    const card = VENUE_GAME_CARD_BY_KEY["category-blitz"];
    expect(card.steps).toHaveLength(8);
    expect(card.steps.every((step) => step.stepLabel === undefined)).toBe(true);
    expect(card.steps.map((step) => step.heading)).toEqual(CATEGORY_BLITZ_TUTORIAL_CARDS.map((c) => c.statement));
    expect(card.rules).toBe(CATEGORY_BLITZ_RULES);
  });

  it("states the real scoring numbers in the rules list", () => {
    expect(CATEGORY_BLITZ_RULES).toHaveLength(7);
    expect(CATEGORY_BLITZ_RULES[3]).toContain("score 2 points");
    expect(CATEGORY_BLITZ_RULES[4]).toContain("+1 point");
    expect(CATEGORY_BLITZ_RULES[5]).toContain("Every 5th round is Majority Rules");
    expect(CATEGORY_BLITZ_RULES[6]).toContain("at least 3 players are in a round (2 in Majority Rules)");
  });

  it("keeps the step labels on the trivia games", () => {
    // The statement-layout games' no-label rule is owned by tests/tutorial-statement-layout-contract.test.ts.
    for (const key of ["speed-trivia", "live_trivia"] as const) {
      expect(VENUE_GAME_CARD_BY_KEY[key].steps.every((step) => typeof step.stepLabel === "string")).toBe(true);
    }
  });
});
