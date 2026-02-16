"use client";

import { useMemo, useState } from "react";
import { getUserId } from "@/lib/storage";
import type { TriviaQuestion } from "@/types";

type TriviaApiResponse = {
  ok: boolean;
  questions?: TriviaQuestion[];
  error?: string;
};

type SubmitResponse = {
  ok: boolean;
  result?: {
    isCorrect: boolean;
    correctAnswer: number;
    saved: boolean;
  };
  error?: string;
};

export function TriviaGame({ questions }: { questions: TriviaQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [attempted, setAttempted] = useState(0);

  const question = questions[index] ?? null;
  const finished = index >= questions.length;
  const accuracy = useMemo(() => {
    if (attempted === 0) return 0;
    return Math.round((correctAnswers / attempted) * 100);
  }, [attempted, correctAnswers]);

  const chooseAnswer = async (answerIndex: number) => {
    if (!question || isSubmitting || selectedAnswer !== null) {
      return;
    }

    setSelectedAnswer(answerIndex);
    setIsSubmitting(true);
    setFeedback("");

    try {
      const response = await fetch("/api/trivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getUserId() ?? undefined,
          questionId: question.id,
          answer: answerIndex,
          timeElapsed: 0,
        }),
      });

      const payload = (await response.json()) as SubmitResponse;
      if (!payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Failed to submit answer.");
      }

      const wasCorrect = payload.result.isCorrect;
      setAttempted((value) => value + 1);
      if (wasCorrect) {
        setCorrectAnswers((value) => value + 1);
        if (payload.result.saved) {
          window.dispatchEvent(
            new CustomEvent("tp:points-updated", {
              detail: { source: "trivia", delta: 10 },
            })
          );
        }
      }

      setFeedback(
        wasCorrect
          ? "Correct! +10 points added to your profile."
          : `Incorrect. Correct answer: ${question.options[payload.result.correctAnswer]}.`
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not submit answer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextQuestion = () => {
    setSelectedAnswer(null);
    setFeedback("");
    setIndex((value) => value + 1);
  };

  if (finished) {
    return (
      <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Round complete</p>
        <p>
          You answered {correctAnswers} of {attempted} correctly ({accuracy}%).
        </p>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No trivia questions available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Question {index + 1} of {questions.length}
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">{question.question}</h2>
        <div className="space-y-2">
          {question.options.map((option, optionIndex) => {
            const selected = selectedAnswer === optionIndex;
            return (
              <button
                key={`${question.id}-${optionIndex}`}
                type="button"
                onClick={() => {
                  void chooseAnswer(optionIndex);
                }}
                disabled={selectedAnswer !== null || isSubmitting}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  selected
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                } disabled:opacity-80`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {feedback}
        </div>
      )}

      <button
        type="button"
        onClick={nextQuestion}
        disabled={selectedAnswer === null || isSubmitting}
        className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Next Question
      </button>
    </div>
  );
}

export async function fetchTriviaQuestions(): Promise<TriviaQuestion[]> {
  const response = await fetch("/api/trivia", { method: "GET", cache: "no-store" });
  const payload = (await response.json()) as TriviaApiResponse;
  if (!payload.ok || !payload.questions) {
    throw new Error(payload.error ?? "Failed to load trivia.");
  }
  return payload.questions;
}
