import { describe, expect, it } from "vitest";

import { canAdvanceToNextTriviaQuestion } from "@/lib/triviaRoundProgress";

describe("trivia round progress gating", () => {
  it("allows advancing after an answer even when round quota is exhausted", () => {
    const canAdvance = canAdvanceToNextTriviaQuestion({
      selectedAnswer: 2,
      isSubmitting: false,
    });

    expect(canAdvance).toBe(true);
  });

  it("blocks advancing before an answer is selected", () => {
    const canAdvance = canAdvanceToNextTriviaQuestion({
      selectedAnswer: null,
      isSubmitting: false,
    });

    expect(canAdvance).toBe(false);
  });

  it("blocks advancing while submission is in-flight", () => {
    const canAdvance = canAdvanceToNextTriviaQuestion({
      selectedAnswer: 1,
      isSubmitting: true,
    });

    expect(canAdvance).toBe(false);
  });
});

