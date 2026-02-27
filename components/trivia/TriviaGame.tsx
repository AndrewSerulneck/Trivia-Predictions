"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { getVenueId } from "@/lib/storage";
import type { TriviaQuestion } from "@/types";

type TriviaApiResponse = {
  ok: boolean;
  questions?: TriviaQuestion[];
  error?: string;
};

type TriviaQuota = {
  limit: number;
  questionsUsed: number;
  questionsRemaining: number;
  windowSecondsRemaining: number;
};

type SubmitResponse = {
  ok: boolean;
  result?: {
    isCorrect: boolean;
    correctAnswer: number;
    saved: boolean;
    alreadyAnswered?: boolean;
  };
  error?: string;
};

export function TriviaGame({ questions: initialQuestions = [] }: { questions?: TriviaQuestion[] }) {
  const router = useRouter();
  const [questions, setQuestions] = useState<TriviaQuestion[]>(initialQuestions);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [quota, setQuota] = useState<TriviaQuota | null>(null);
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

  const loadQuota = async () => {
    const userId = getUserId() ?? "";
    if (!userId) {
      setQuota(null);
      return;
    }
    const response = await fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
    const payload = (await response.json()) as { ok: boolean; quota?: TriviaQuota | null };
    if (payload.ok) {
      setQuota(payload.quota ?? null);
    }
  };

  useEffect(() => {
    const loadQuestions = async () => {
      const userId = getUserId() ?? "";
      const venueId = getVenueId() ?? "";
      if (!userId || !venueId) {
        router.replace("/join");
        return;
      }
      setLoadingQuestions(true);
      setLoadError("");
      try {
        const items = await fetchTriviaQuestions(userId);
        setQuestions(items);
        setIndex(0);
        setSelectedAnswer(null);
        setFeedback("");
        await loadQuota();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load trivia.");
      } finally {
        setLoadingQuestions(false);
      }
    };

    void loadQuestions();
  }, [router]);

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

      if (payload.result.alreadyAnswered) {
        setFeedback("You already answered this question earlier. Skipping scoring.");
        await loadQuota();
        return;
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
      await loadQuota();
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

  if (loadingQuestions) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Loading trivia questions...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
        {loadError}
      </div>
    );
  }

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
        No new trivia questions available right now.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {quota ? (
        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>Trivia Progress This Hour</span>
            <span>
              {quota.questionsUsed}/{quota.limit}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${Math.min(100, (quota.questionsUsed / quota.limit) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}
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

export async function fetchTriviaQuestions(userId?: string): Promise<TriviaQuestion[]> {
  const query = new URLSearchParams();
  if (userId) {
    query.set("userId", userId);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/trivia${suffix}`, { method: "GET", cache: "no-store" });
  const payload = (await response.json()) as TriviaApiResponse;
  if (!payload.ok || !payload.questions) {
    throw new Error(payload.error ?? "Failed to load trivia.");
  }
  return payload.questions;
}
