"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const BUTTON_POP_CLASS =
  "transition-all duration-150 transform active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
const BACK_TO_VENUE_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-blue-300 bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 active:scale-95 active:brightness-90";
const INCORRECT_EMOJIS = [
  "😢",
  "😞",
  "😔",
  "😟",
  "😕",
  "😖",
  "💔",
  "🙈",
  "😭",
  "🫠",
  "☔",
  "😩",
  "☹️",
  "🥺",
  "😥",
];
const CORRECT_POINT_PULSE_DURATION_MS = 900;
const RAIN_ITEM_COUNT = 14;
const RAIN_SIZE_OPTIONS = ["text-4xl", "text-5xl", "text-6xl", "text-7xl"];
const FIREWORK_ITEM_COUNT = RAIN_ITEM_COUNT;
const FIREWORK_BURST_DURATION_MIN_MS = 1500;
const FIREWORK_BURST_DURATION_MAX_MS = 2500;
const CORRECT_FEEDBACK_FLASH_DURATION_MS = 1300;
const INCORRECT_FEEDBACK_FLASH_DURATION_MS = 1300;
const FIREWORK_HIDE_DELAY_MS = 2700;
const RAIN_HIDE_DELAY_MS = 2700;

function triggerHaptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(pattern);
}

type FeedbackFlash = "correct" | "incorrect" | null;

type RainToken = {
  id: string;
  emoji: string;
  left: number;
  drift: number;
  delayMs: number;
  sizeClass: string;
  durationMs: number;
};

type FireworkToken = {
  id: string;
  emoji: string;
  left: number;
  top: number;
  burstX: number;
  burstY: number;
  delayMs: number;
  durationMs: number;
  sizeClass: string;
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomEmoji(list: readonly string[]) {
  return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? "🎉";
}

function createRainToken(pool: readonly string[], index = 0, total = RAIN_ITEM_COUNT): RainToken {
  const laneCount = Math.max(1, total);
  const laneWidth = 100 / laneCount;
  const laneLeft = laneWidth * index + laneWidth / 2;
  const jitter = (Math.random() - 0.5) * Math.min(5.5, laneWidth * 0.85);
  const boundedLeft = Math.max(3, Math.min(97, laneLeft + jitter));
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    emoji: randomEmoji(pool),
    left: boundedLeft,
    drift: randomInt(-48, 48),
    delayMs: randomInt(0, 250),
    durationMs: randomInt(1500, 2500),
    sizeClass: RAIN_SIZE_OPTIONS[randomInt(0, RAIN_SIZE_OPTIONS.length - 1)] ?? "text-5xl",
  };
}

function createFireworkToken(pool: readonly string[]): FireworkToken {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    emoji: randomEmoji(pool),
    left: randomInt(0, 95),
    top: randomInt(8, 30),
    burstX: randomInt(-48, 48),
    burstY: randomInt(55, 115),
    delayMs: randomInt(0, 180),
    durationMs: randomInt(FIREWORK_BURST_DURATION_MIN_MS, FIREWORK_BURST_DURATION_MAX_MS),
    sizeClass: RAIN_SIZE_OPTIONS[randomInt(0, RAIN_SIZE_OPTIONS.length - 1)] ?? "text-4xl",
  };
}

export function TriviaGame({ questions: initialQuestions = [] }: { questions?: TriviaQuestion[] }) {
  const router = useRouter();
  const gameRootRef = useRef<HTMLDivElement>(null);
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
  const [roundStartPoints, setRoundStartPoints] = useState<number | null>(null);
  const [rewardPulse, setRewardPulse] = useState("");
  const [showRewardPulse, setShowRewardPulse] = useState(false);
  const [feedbackFlash, setFeedbackFlash] = useState<FeedbackFlash>(null);
  const [rainEmojis, setRainEmojis] = useState<RainToken[]>([]);
  const [fireworks, setFireworks] = useState<FireworkToken[]>([]);

  const flashTimeoutRef = useRef<number | null>(null);
  const rainTimeoutRef = useRef<number | null>(null);
  const fireworkTimeoutRef = useRef<number | null>(null);
  const [currentUserPoints, setCurrentUserPoints] = useState<number | null>(null);

  const question = questions[index] ?? null;
  const finished = index >= questions.length;
  const accuracy = useMemo(() => {
    if (attempted === 0) return 0;
    return Math.round((correctAnswers / attempted) * 100);
  }, [attempted, correctAnswers]);
  const pointsWon = correctAnswers * POINTS_PER_CORRECT;
  const estimatedRoundTotal = useMemo(() => {
    if (roundTotalPoints !== null) {
      return roundTotalPoints;
    }
    if (currentUserPoints === null) {
      return null;
    }
    return currentUserPoints + pointsWon;
  }, [currentUserPoints, pointsWon, roundTotalPoints]);
  const roundDelta = useMemo(() => {
    if (roundStartPoints === null || estimatedRoundTotal === null) {
      return pointsWon;
    }
    return estimatedRoundTotal - roundStartPoints;
  }, [estimatedRoundTotal, pointsWon, roundStartPoints]);

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

  const loadCurrentUserPoints = useCallback(async () => {
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";
    if (!userId || !venueId) {
      setCurrentUserPoints(null);
      return null;
    }

    const response = await fetch(`/api/leaderboard?venue=${encodeURIComponent(venueId)}`, { cache: "no-store" });
    const payload = (await response.json()) as {
      ok: boolean;
      entries?: Array<{ userId: string; points: number }>;
    };
    if (!payload.ok) {
      setCurrentUserPoints(null);
      return null;
    }

    const currentUserEntry = (payload.entries ?? []).find((entry) => entry.userId === userId);
    if (!currentUserEntry) {
      setCurrentUserPoints(null);
      return null;
    }

    setCurrentUserPoints(currentUserEntry.points);
    setRoundStartPoints((previous) => previous ?? currentUserEntry.points);
    return currentUserEntry.points;
  }, []);

  const triggerPointsFlow = useCallback((optionIndex: number) => {
    if (typeof document === "undefined" || !gameRootRef.current) {
      return;
    }

    const source = gameRootRef.current.querySelector<HTMLElement>(
      `[data-answer-token="${question?.id}-${optionIndex}"]`
    );
    const destination = document.getElementById("tp-points-pill");
    if (!source || !destination) {
      return;
    }

    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent("tp:coin-flight", {
        detail: {
          sourceRect: {
            left: sourceRect.left,
            top: sourceRect.top,
            width: sourceRect.width,
            height: sourceRect.height,
          },
          sourceX: destinationRect.left + destinationRect.width / 2,
          sourceY: destinationRect.top + destinationRect.height / 2,
          delta: POINTS_PER_CORRECT,
          coins: 10,
        },
      })
    );
  }, [question?.id]);

  const triggerCelebration = useCallback(
    (isCorrect: boolean) => {
      setFeedbackFlash(isCorrect ? "correct" : "incorrect");
      if (isCorrect) {
        setFireworks([]);
        setRainEmojis([]);
      } else {
        setRainEmojis(Array.from({ length: RAIN_ITEM_COUNT }, (_, index) => createRainToken(INCORRECT_EMOJIS, index)));
        setFireworks([]);
      }

      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      if (fireworkTimeoutRef.current) {
        window.clearTimeout(fireworkTimeoutRef.current);
      }
      if (rainTimeoutRef.current) {
        window.clearTimeout(rainTimeoutRef.current);
      }

      flashTimeoutRef.current = window.setTimeout(() => {
        setFeedbackFlash(null);
      }, isCorrect ? CORRECT_FEEDBACK_FLASH_DURATION_MS : INCORRECT_FEEDBACK_FLASH_DURATION_MS);
      if (isCorrect) {
        fireworkTimeoutRef.current = window.setTimeout(() => {
          setFireworks([]);
        }, FIREWORK_HIDE_DELAY_MS);
      } else {
        rainTimeoutRef.current = window.setTimeout(() => {
          setRainEmojis([]);
        }, RAIN_HIDE_DELAY_MS);
      }
    },
    []
  );

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
        setRoundStartPoints(null);
        await loadQuota();
        const startingPoints = await loadCurrentUserPoints();
        setRoundStartPoints(startingPoints);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load trivia.");
      } finally {
        setLoadingQuestions(false);
      }
    };

    void loadQuestions();
  }, [loadQuota, loadCurrentUserPoints, router]);

  useEffect(() => {
    if (!isRoundStarted || finished || selectedAnswer !== null) {
      return;
    }

    setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
  }, [isRoundStarted, index, finished, selectedAnswer]);

  const chooseAnswer = useCallback(
    async (answerIndex: number) => {
      const submittingUserId = getUserId() ?? "";

      if (!question || isSubmitting || selectedAnswer !== null) {
        return;
      }

      setSelectedAnswer(answerIndex);
      setIsSubmitting(true);
      setFeedback("");
      setFeedbackKind(null);
      setRevealedCorrectAnswer(null);

      const localCorrectAnswer = question.correctAnswer;
      const localWasCorrect = answerIndex === localCorrectAnswer;
      setRevealedCorrectAnswer(localCorrectAnswer);
      const localOutcome: "correct" | "incorrect" | "timeout" =
        answerIndex < 0 ? "timeout" : localWasCorrect ? "correct" : "incorrect";

      if (answerIndex < 0) {
        setFeedback(`Time's up. Correct answer: ${question.options[localCorrectAnswer]}.`);
        setFeedbackKind("timeout");
        setRewardPulse("⚡ Time out, keep going");
        setShowRewardPulse(true);
      } else if (localWasCorrect) {
        setFeedback("Correct! +10 points added to your profile.");
        setFeedbackKind("correct");
        setRewardPulse("🎉 Correct +10");
        setShowRewardPulse(true);
        triggerHaptic([20, 50, 20]);
      } else {
        setFeedback(`Incorrect. Correct answer: ${question.options[localCorrectAnswer]}.`);
        setFeedbackKind("incorrect");
      }

      triggerCelebration(localOutcome === "correct");

      try {
        const response = await fetch("/api/trivia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: submittingUserId || undefined,
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
          void loadCurrentUserPoints();
          return;
        }

        const wasCorrect = payload.result.isCorrect;
        setAttempted((value) => value + 1);

        if (payload.result.correctAnswer !== localCorrectAnswer) {
          setRevealedCorrectAnswer(payload.result.correctAnswer);
        }

        if (wasCorrect) {
          setRewardPulse(payload.result.saved ? "🔥 +10 points saved" : "🔥 +10 points recorded");
          setShowRewardPulse(true);
          triggerHaptic([35, 35, 35]);
          setFeedback("Correct! +10 points added to your profile.");
          setFeedbackKind("correct");
          setCorrectAnswers((value) => value + 1);
          triggerPointsFlow(answerIndex);
          if (submittingUserId) {
            setCurrentUserPoints((value) => (value ?? 0) + POINTS_PER_CORRECT);
            window.dispatchEvent(
              new CustomEvent("tp:points-updated", {
                detail: { source: "trivia", delta: POINTS_PER_CORRECT },
              })
            );
          }
        } else {
          setFeedback(`Incorrect. Correct answer: ${question.options[payload.result.correctAnswer]}.`);
          setFeedbackKind("incorrect");
          setRewardPulse("🙌 Nice try");
          setShowRewardPulse(true);
          triggerHaptic([35, 35]);
        }

        if ((wasCorrect ? "correct" : "incorrect") !== localOutcome) {
          triggerCelebration(wasCorrect);
        }

        void loadQuota();
        void loadCurrentUserPoints();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Could not submit answer.");
        setFeedbackKind(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, loadQuota, loadCurrentUserPoints, question, selectedAnswer, triggerCelebration, triggerPointsFlow]
  );

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      if (rainTimeoutRef.current) {
        window.clearTimeout(rainTimeoutRef.current);
      }
      if (fireworkTimeoutRef.current) {
        window.clearTimeout(fireworkTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showRewardPulse) return;

    const timeout = window.setTimeout(() => {
      setShowRewardPulse(false);
      setRewardPulse("");
    }, CORRECT_POINT_PULSE_DURATION_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [showRewardPulse]);

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
    setFeedbackFlash(null);
    setRainEmojis([]);
    setFireworks([]);
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
      <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <div className="relative mx-auto h-20 w-20">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          <div className="absolute inset-2 flex items-center justify-center rounded-full bg-slate-900 text-xs font-black tracking-[0.2em] text-white">
            HC
          </div>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-900">Hightop Challenge</p>
          <p>Loading trivia questions...</p>
        </div>
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
    const totalAfterRound = roundTotalPoints ?? estimatedRoundTotal ?? currentUserPoints ?? 0;
    const roundGain = Math.max(0, roundDelta);
    return (
      <div className="flex h-full min-h-0 flex-col rounded-2xl border-4 border-slate-900 bg-gradient-to-br from-emerald-100 to-cyan-100 p-2 shadow-[5px_5px_0_#0f172a]">
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border-4 border-slate-900 bg-white p-2 shadow-[4px_4px_0_#0f172a]">
          <p className="mb-2 text-sm font-black tracking-wide text-emerald-800">Round complete 🎉</p>
          <div className="grid min-h-0 flex-1 gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border-4 border-slate-900 bg-slate-50 p-2 shadow-[3px_3px_0_#0f172a]">
              <p className="text-xs uppercase text-slate-500">Scoreboard</p>
              <p className="text-lg font-bold text-slate-900">
                {correctAnswers}/{attempted}
              </p>
              <p className="text-sm text-slate-600">{accuracy}% accuracy</p>
            </div>
            <div className="rounded-2xl border-4 border-slate-900 bg-slate-50 p-2 shadow-[3px_3px_0_#0f172a]">
              <p className="text-xs uppercase text-slate-500">Round reward</p>
              <p className="text-lg font-bold text-emerald-700">+{pointsWon} points</p>
              <p className="text-xs text-emerald-700">Fireworks unlocked: {correctAnswers}</p>
            </div>
            <div className="rounded-2xl border-4 border-slate-900 bg-slate-50 p-2 shadow-[3px_3px_0_#0f172a] sm:col-span-2">
              <p className="text-xs uppercase text-slate-500">Total points</p>
              <p className="text-xl font-bold text-slate-900">{totalAfterRound}</p>
              <p className="text-sm text-slate-600">Round gain: +{roundGain}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onMouseDown={() => triggerHaptic(14)}
          onClick={() => {
            if (venueId) {
              router.push(`/venue/${venueId}`);
              return;
            }
            router.push("/");
          }}
          className={`${BUTTON_POP_CLASS} ${BACK_TO_VENUE_CLASS} mt-2 w-full`}
        >
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs"
          >
            ←
          </span>
          Back to Venue Home Page
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
          onMouseDown={() => triggerHaptic(20)}
          onClick={() => {
            setIsRoundStarted(true);
            setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
            setRoundStartPoints(currentUserPoints ?? null);
          }}
          className={`${BUTTON_POP_CLASS} inline-flex min-h-[48px] w-full items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200`}
        >
          Yes, Start Trivia
        </button>
      </div>
    );
  }

  return (
    <div ref={gameRootRef} className="relative flex h-full min-h-0 flex-col gap-2 overflow-x-hidden overflow-y-hidden px-0.5">
      {feedbackFlash ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-10 ${
            feedbackFlash === "correct" ? "bg-emerald-500/35" : "bg-rose-500/35"
          } transition-opacity duration-300`}
        />
      ) : null}

      {rainEmojis.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          {rainEmojis.map((item) => (
            <span
              key={item.id}
              className={`absolute top-[-20px] animate-tp-rain ${item.sizeClass} font-black`}
              style={{
                left: `${item.left}%`,
                animationDelay: `${item.delayMs}ms`,
                animationDuration: `${item.durationMs}ms`,
                ["--rain-drift" as string]: `${item.drift}px`,
              }}
            >
              {item.emoji}
            </span>
          ))}
        </div>
      ) : null}

      {fireworks.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-30">
          {fireworks.map((item) => (
            <span
              key={item.id}
              className={`absolute top-[-20px] animate-tp-rain ${item.sizeClass} font-black text-emerald-500`}
              style={{
                left: `${item.left}%`,
                top: `${item.top}%`,
                animationDelay: `${item.delayMs}ms`,
                animationDuration: `${item.durationMs}ms`,
                ["--rain-drift" as string]: `${item.burstX}px`,
              }}
            >
              {item.emoji}
            </span>
          ))}
        </div>
      ) : null}

      {quota ? (
        <div className="space-y-1 rounded-xl border-2 border-slate-900 bg-cyan-100 p-1.5 shadow-[2px_2px_0_#0f172a] sm:rounded-2xl sm:border-4 sm:p-2 sm:shadow-[5px_5px_0_#0f172a]">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-700 sm:text-xs">
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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 sm:h-2">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${Math.min(100, (quota.questionsUsed / quota.limit) * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border-2 border-slate-900 bg-yellow-100 p-1.5 text-[11px] font-semibold text-slate-700 shadow-[2px_2px_0_#0f172a] sm:rounded-2xl sm:border-4 sm:p-2 sm:text-sm sm:shadow-[5px_5px_0_#0f172a]">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <span>
            Question {index + 1} of {questions.length}
          </span>
          <span className="font-semibold text-slate-800">{secondsRemaining}s</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 sm:mt-2 sm:h-2">
          <div
            className={`h-full rounded-full transition-all ${secondsRemaining <= 3 ? "bg-rose-500" : "bg-blue-600"}`}
            style={{ width: `${Math.max(0, (secondsRemaining / QUESTION_TIME_LIMIT_SECONDS) * 100)}%` }}
          />
        </div>
      </div>

      <div className="min-h-0 flex flex-1 flex-col gap-2.5 overflow-hidden sm:gap-3">
        {showRewardPulse ? (
          <div className="tp-pop-in rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-[11px] font-bold text-blue-700 sm:p-2 sm:text-sm">
            {rewardPulse}
          </div>
        ) : null}
        <h2 className="line-clamp-2 px-0.5 text-sm font-black leading-snug text-slate-900 sm:line-clamp-3 sm:text-lg">
          {question.question}
        </h2>
        <div className="grid min-h-0 flex-1 grid-cols-1 auto-rows-min gap-2.5 content-start sm:gap-3">
          {question.options.map((option, optionIndex) => {
            const selected = selectedAnswer === optionIndex;
            const isRevealedCorrect = revealedCorrectAnswer === optionIndex;
            const hasReveal = revealedCorrectAnswer !== null;
            const isSelectedWrong = hasReveal && selectedAnswer !== null && selected && !isRevealedCorrect;
            return (
              <button
                key={`${question.id}-${optionIndex}`}
                type="button"
                data-answer-token={`${question.id}-${optionIndex}`}
                onMouseDown={() => triggerHaptic()}
                onClick={() => {
                  void chooseAnswer(optionIndex);
                }}
                disabled={selectedAnswer !== null || isSubmitting || secondsRemaining <= 0}
                className={`${BUTTON_POP_CLASS} min-h-[34px] w-full rounded-xl border-2 px-2.5 py-1.5 text-left text-xs font-bold leading-snug shadow-[2px_2px_0_#0f172a] sm:min-h-[46px] sm:rounded-2xl sm:border-4 sm:px-3 sm:py-2 sm:text-sm sm:shadow-[4px_4px_0_#0f172a] ${
                  isRevealedCorrect
                    ? "border-slate-900 bg-emerald-500 text-white"
                    : isSelectedWrong
                    ? "border-slate-900 bg-rose-500 text-white"
                    : selected
                    ? "border-slate-900 bg-pink-500 text-white"
                    : "border-slate-900 bg-white text-slate-900 hover:bg-cyan-100"
                } disabled:opacity-80`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto space-y-2.5 pt-1">
        {feedback ? (
          <div
            className={`rounded-xl border-2 p-1.5 text-[11px] font-semibold leading-snug shadow-[2px_2px_0_#0f172a] sm:rounded-2xl sm:border-4 sm:p-2 sm:text-sm sm:shadow-[5px_5px_0_#0f172a] ${
              feedbackKind === "correct"
                ? "border-slate-900 bg-emerald-200 text-emerald-900"
                : feedbackKind === "incorrect" || feedbackKind === "timeout"
                ? "border-slate-900 bg-rose-200 text-rose-900"
                : "border-slate-900 bg-white text-slate-700"
            }`}
          >
            {feedback}
          </div>
        ) : null}

        <button
          type="button"
          onMouseDown={() => triggerHaptic(14)}
          onClick={nextQuestion}
          disabled={selectedAnswer === null || isSubmitting}
          className={`${BUTTON_POP_CLASS} inline-flex min-h-[36px] w-full items-center justify-center rounded-xl border-2 border-slate-900 bg-cyan-300 px-3 py-1.5 text-xs font-black text-slate-900 shadow-[2px_2px_0_#0f172a] sm:min-h-[46px] sm:rounded-2xl sm:border-4 sm:px-4 sm:py-2.5 sm:text-sm sm:shadow-[5px_5px_0_#0f172a] disabled:opacity-60`}
        >
          Next Question
        </button>
      </div>
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
