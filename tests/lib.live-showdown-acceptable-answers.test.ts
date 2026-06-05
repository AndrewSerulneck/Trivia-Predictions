import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { gradeWriteInAnswer, gradeWriteInAnswerWithVariants } from "@/lib/liveShowdownGrading";

vi.mock("server-only", () => ({}));

const require = createRequire(import.meta.url);
const { normalizeAndValidate } = require("../scripts/import-trivia-questions.cjs") as {
  normalizeAndValidate: (questions: unknown[]) => Array<{
    slug: string;
    options: string[];
    correct_answer: number;
    answer_format: string;
    question_pool: string;
  }>;
};

function liveQuestion(overrides: Record<string, unknown> = {}) {
  return {
    slug: "sample-live-question",
    question: "Which placeholder answer should pass?",
    answer: "This",
    category: "General",
    difficulty: "easy",
    __questionPool: "live_showdown",
    __answerFormat: "write_in",
    ...overrides,
  };
}

describe("live showdown acceptable answers", () => {
  it("accepts the canonical answer", async () => {
    await expect(gradeWriteInAnswerWithVariants("This", "This")).resolves.toBe(true);
  });

  it("accepts a secondary acceptable answer", async () => {
    await expect(
      gradeWriteInAnswerWithVariants("That", "This", undefined, undefined, ["That"])
    ).resolves.toBe(true);
  });

  it("keeps backward-compatible live JSON questions with no acceptableAnswers", () => {
    const [row] = normalizeAndValidate([liveQuestion()]);

    expect(row.options).toEqual(["This"]);
    expect(row.correct_answer).toBe(0);
    expect(row.answer_format).toBe("write_in");
    expect(row.question_pool).toBe("live_showdown");
  });

  it("drops empty, duplicate, and canonical duplicate acceptableAnswers during import", () => {
    const [row] = normalizeAndValidate([
      liveQuestion({
        acceptableAnswers: ["", "That", "that", " This ", "  That  ", "Another"],
      }),
    ]);

    expect(row.options).toEqual(["This", "That", "Another"]);
    expect(row.correct_answer).toBe(0);
  });

  it("rejects bare team-name subsets when the correct answer includes a required year", () => {
    expect(gradeWriteInAnswer("Dolphins", "1972 Dolphins")).toBe(false);
    expect(gradeWriteInAnswer("19 Dolphins", "1972 Dolphins")).toBe(false);
  });

  it("accepts year-preserving shorthand for year-specific team answers", () => {
    expect(gradeWriteInAnswer("2016 Warriors", "2016 Golden State Warriors")).toBe(true);
  });

  it("accepts explicit year-shorthand acceptable answers", async () => {
    await expect(
      gradeWriteInAnswerWithVariants("72 Dolphins", "1972 Dolphins", undefined, undefined, ["72 Dolphins"])
    ).resolves.toBe(true);
  });
});
