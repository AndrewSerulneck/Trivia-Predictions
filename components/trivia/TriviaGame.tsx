"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  isAdminBypass?: boolean;
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

const QUESTION_TIME_LIMIT_SECONDS = 10;
const POINTS_PER_CORRECT = 10;

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
  const [feedbackKind, setFeedbackKind] = useState<"correct" | "incorrect" | "timeout" | null>(null);
  const [revealedCorrectAnswer, setRevealedCorrectAnswer] = useState<number | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [isRoundStarted, setIsRoundStarted] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(QUESTION_TIME_LIMIT_SECONDS);
  const [roundTotalPoints, setRoundTotalPoints] = useState<number | null>(null);

  const question = questions[index] ?? null;
  const finished = index >= questions.length;
  const accuracy = useMemo(() => {
    if (attempted === 0) return 0;
    return Math.round((correctAnswers / attempted) * 100);
  }, [attempted, correctAnswers]);
  const pointsWon = correctAnswers * POINTS_PER_CORRECT;

  const loadQuota = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const loadQuestions = async () => {
      const userId = getUserId() ?? "";
      const venueId = getVenueId() ?? "";
      if (!userId || !venueId) {
        router.replace("/");
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
        setFeedbackKind(null);
        setRevealedCorrectAnswer(null);
        await loadQuota();
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load trivia.");
      } finally {
        setLoadingQuestions(false);
      }
    };

    void loadQuestions();
  }, [loadQuota, router]);

  useEffect(() => {
    if (!isRoundStarted || finished || selectedAnswer !== null) {
      return;
    }

    setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
  }, [isRoundStarted, index, finished, selectedAnswer]);

  const chooseAnswer = useCallback(async (answerIndex: number) => {
    if (!question || isSubmitting || selectedAnswer !== null) {
      return;
    }

    setSelectedAnswer(answerIndex);
    setIsSubmitting(true);
    setFeedback("");
    setFeedbackKind(null);
    setRevealedCorrectAnswer(null);

    // Optimistic reveal for smoother UX while server save runs.
    const localCorrectAnswer = question.correctAnswer;
    const localWasCorrect = answerIndex === localCorrectAnswer;
    setRevealedCorrectAnswer(localCorrectAnswer);
    if (answerIndex < 0) {
      setFeedback(`Time's up. Correct answer: ${question.options[localCorrectAnswer]}.`);
      setFeedbackKind("timeout");
    } else if (localWasCorrect) {
      setFeedback("Correct! +10 points added to your profile.");
      setFeedbackKind("correct");
    } else {
      setFeedback(`Incorrect. Correct answer: ${question.options[localCorrectAnswer]}.`);
      setFeedbackKind("incorrect");
    }

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
        setFeedbackKind(null);
        setRevealedCorrectAnswer(payload.result.correctAnswer);
        void loadQuota();
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

      if (payload.result.correctAnswer !== localCorrectAnswer) {
        setRevealedCorrectAnswer(payload.result.correctAnswer);
        if (answerIndex < 0) {
          setFeedback(`Time's up. Correct answer: ${question.options[payload.result.correctAnswer]}.`);
          setFeedbackKind("timeout");
        } else if (wasCorrect) {
          setFeedback("Correct! +10 points added to your profile.");
          setFeedbackKind("correct");
        } else {
          setFeedback(`Incorrect. Correct answer: ${question.options[payload.result.correctAnswer]}.`);
          setFeedbackKind("incorrect");
        }
      }
      void loadQuota();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not submit answer.");
      setFeedbackKind(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, loadQuota, question, selectedAnswer]);

  useEffect(() => {
    if (!isRoundStarted || finished || selectedAnswer !== null || isSubmitting) {
      return;
    }

    if (secondsRemaining <= 0) {
      void chooseAnswer(-1);
      return;
    }

    const timer = window.setTimeout(() => {
      setSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isRoundStarted, finished, selectedAnswer, isSubmitting, secondsRemaining, chooseAnswer]);

  const nextQuestion = () => {
    setSelectedAnswer(null);
    setFeedback("");
    setFeedbackKind(null);
    setRevealedCorrectAnswer(null);
    setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
    setIndex((value) => value + 1);
  };

  useEffect(() => {
    if (!finished) {
      return;
    }

    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) {
      setRoundTotalPoints(null);
      return;
    }

    const loadTotalPoints = async () => {
      const response = await fetch(`/api/leaderboard?venue=${encodeURIComponent(venueId)}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        entries?: Array<{ userId: string; points: number }>;
      };
      if (!payload.ok) {
        return;
      }
      const currentUserEntry = (payload.entries ?? []).find((entry) => entry.userId === userId);
      if (currentUserEntry) {
        setRoundTotalPoints(currentUserEntry.points);
      }
    };

    void loadTotalPoints();
  }, [finished]);

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
    const venueId = getVenueId() ?? "";
    return (
      <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">Round complete</p>
        <p>
          Final score: {correctAnswers}/{attempted} ({accuracy}%)
        </p>
        <p>Points won this round: +{pointsWon}</p>
        <p>
          Total points after round:{" "}
          {roundTotalPoints === null ? "Updating..." : roundTotalPoints}
        </p>
        <button
          type="button"
          onClick={() => {
            if (venueId) {
              router.push(`/venue/${venueId}`);
              return;
            }
            router.push("/");
          }}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
        >
          Back to Venue Page
        </button>
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

  if (!isRoundStarted) {
    return (
      <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Ready to start trivia?</p>
        <p>You will have 10 seconds to answer each question once the round begins.</p>
        <button
          type="button"
          onClick={() => {
            setIsRoundStarted(true);
            setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
          }}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
        >
          Yes, Start Trivia
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {quota ? (
        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>Trivia Progress This Hour</span>
            {quota.isAdminBypass ? (
              <span>Unlimited (Admin)</span>
            ) : (
              <span>
                {quota.questionsUsed}/{quota.limit}
              </span>
            )}
          </div>
          {!quota.isAdminBypass ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${Math.min(100, (quota.questionsUsed / quota.limit) * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <div className="flex items-center justify-between gap-3">
          <span>
            Question {index + 1} of {questions.length}
          </span>
          <span className="font-semibold text-slate-800">{secondsRemaining}s</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${
              secondsRemaining <= 3 ? "bg-rose-500" : "bg-blue-600"
            }`}
            style={{ width: `${Math.max(0, (secondsRemaining / QUESTION_TIME_LIMIT_SECONDS) * 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">{question.question}</h2>
        <div className="space-y-2">
          {question.options.map((option, optionIndex) => {
            const selected = selectedAnswer === optionIndex;
            const isRevealedCorrect = revealedCorrectAnswer === optionIndex;
            const hasReveal = revealedCorrectAnswer !== null;
            const isSelectedWrong = hasReveal && selectedAnswer !== null && selected && !isRevealedCorrect;
            return (
              <button
                key={`${question.id}-${optionIndex}`}
                type="button"
                onClick={() => {
                  void chooseAnswer(optionIndex);
                }}
                disabled={selectedAnswer !== null || isSubmitting || secondsRemaining <= 0}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  isRevealedCorrect
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : isSelectedWrong
                    ? "border-rose-600 bg-rose-600 text-white"
                    : selected
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
        <div
          className={`rounded-md border p-3 text-sm ${
            feedbackKind === "correct"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : feedbackKind === "incorrect" || feedbackKind === "timeout"
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
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
