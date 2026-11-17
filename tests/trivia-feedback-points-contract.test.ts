import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The green feedback chip shows the points the server awarded (a 2x Challenge gives more than the base 2).
const source = readFileSync("components/trivia/TriviaGame.tsx", "utf8");

describe("Speed Trivia feedback chip", () => {
  it("shows the awarded points, not the base constant", () => {
    expect(source).toContain("🔥 +{feedbackPoints} pts");
    expect(source).not.toContain("🔥 +{POINTS_PER_CORRECT} pts");
    expect(source).toContain("setFeedbackPoints(pointsAwarded);");
  });
});
