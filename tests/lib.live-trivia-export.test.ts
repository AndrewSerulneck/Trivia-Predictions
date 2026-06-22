import { describe, expect, it } from "vitest";
import {
  buildFallbackLiveTriviaExportQuestion,
  normalizeConvertedLiveTriviaExportQuestion,
  sanitizeAcceptableAnswers,
} from "@/lib/liveTriviaExport";

describe("live trivia export conversion", () => {
  it("sanitizes acceptable answers against the canonical answer", () => {
    expect(sanitizeAcceptableAnswers(["", "UK", "uk", " United Kingdom ", "Britain"], "United Kingdom")).toEqual([
      "UK",
      "Britain",
    ]);
  });

  it("builds a fallback live export question from a speed-trivia row", () => {
    const converted = buildFallbackLiveTriviaExportQuestion({
      id: "row-1",
      slug: "industrial-revolution-origin",
      question: "In which country did the Industrial Revolution begin?",
      options: ["France", "Great Britain", "Germany", "Italy"],
      correctAnswer: 1,
      answer: "Great Britain",
      category: "History",
      difficulty: "easy",
    });

    expect(converted).toMatchObject({
      sourceId: "row-1",
      slug: "industrial-revolution-origin",
      question: "In which country did the Industrial Revolution begin?",
      answer: "Great Britain",
      answer_format: "write_in",
      category: "History",
      difficulty: "easy",
    });
  });

  it("normalizes converted output and removes duplicate alternates", () => {
    const converted = normalizeConvertedLiveTriviaExportQuestion(
      {
        slug: "uk-prime-minister",
        question: "Who was the UK prime minister during most of World War II",
        answer: "Winston Churchill",
        acceptableAnswers: ["Churchill", "Winston Churchill", " churchill "],
        category: "History",
        difficulty: "medium",
      },
      {
        id: "row-2",
        slug: "uk-prime-minister",
        question: "Who served as Britain's wartime prime minister during most of WWII?",
        options: ["Neville Chamberlain", "Winston Churchill", "Clement Attlee", "Harold Macmillan"],
        correctAnswer: 1,
        answer: "Winston Churchill",
        category: "History",
        difficulty: "medium",
      }
    );

    expect(converted.question.endsWith("?")).toBe(true);
    expect(converted.acceptableAnswers).toEqual(["Churchill"]);
    expect(converted.answer_format).toBe("write_in");
  });
});
