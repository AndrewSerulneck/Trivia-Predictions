import { describe, expect, it } from "vitest";

const { normalizeAndValidate } = require("../scripts/import-trivia-questions.cjs");

describe("import-trivia-questions", () => {
  it("normalizes Speed Trivia review candidates into pending_review anytime_blitz rows", () => {
    const rows = normalizeAndValidate(
      [
        {
          question: "Which novel begins with the line 'Call me Ishmael'?",
          options: ["Moby-Dick", "The Odyssey", "The Great Gatsby", "Dracula"],
          correctAnswer: 0,
          category: "Literary Landscapes",
          difficulty: "medium",
        },
      ],
      {
        questionPool: "anytime_blitz",
        answerFormat: "multiple_choice",
        status: "pending_review",
      }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      question: "Which novel begins with the line 'Call me Ishmael'?",
      options: ["Moby-Dick", "The Odyssey", "The Great Gatsby", "Dracula"],
      correct_answer: 0,
      category: "Literary Landscapes",
      difficulty: "medium",
      question_pool: "anytime_blitz",
      answer_format: "multiple_choice",
      status: "pending_review",
      slug: "which-novel-begins-with-the-line-call-me-ishmael",
    });
  });

  it("rejects a live-trivia answer format for Speed Trivia imports", () => {
    expect(() =>
      normalizeAndValidate(
        [
          {
            question: "Who wrote Hamlet?",
            answer: "William Shakespeare",
            category: "Literature",
          },
        ],
        {
          questionPool: "anytime_blitz",
          answerFormat: "write_in",
          status: "pending_review",
        }
      )
    ).toThrow("Speed Trivia rows must use question_pool=anytime_blitz and answer_format=multiple_choice.");
  });
});
