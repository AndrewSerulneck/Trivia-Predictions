"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { getVenueId } from "@/lib/storage";
import { readWarmTriviaCache } from "@/lib/warmupCache";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
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
  quota?: TriviaQuota | null;
  error?: string;
};

const QUESTION_TIME_LIMIT_SECONDS = 15;
const POINTS_PER_CORRECT = 10;
const QUESTIONS_PER_ROUND = 15;
const ROUND_LIMIT_PER_WINDOW = 3;
const PRE_ROUND_COUNTDOWN_START = 3;
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
const TRIVIA_ROUND_END_REASON_KEY = "tp:trivia-round-ended-reason";
const TRIVIA_LIVE_PREVIEW_STORAGE_KEY = "tp:trivia:live-preview:v1";
const TRIVIA_LIVE_PREVIEW_MAX_AGE_MS = 60 * 60 * 1000;

type TriviaLivePreviewSnapshot = {
  updatedAt: number;
  isRoundStarted: boolean;
  questionId: string;
  questionIndex: number;
  totalQuestions: number;
  secondsRemaining: number;
  correctAnswers: number;
  attempted: number;
  questionText: string;
  questions: TriviaQuestion[];
  userId: string;
  venueId: string;
};

type RecoveredRoundState = {
  questions: TriviaQuestion[];
  nextIndex: number;
  correctAnswers: number;
  attempted: number;
  message: string;
};

function triggerHaptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  navigator.vibrate(pattern);
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
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

function normalizeTriviaQuestion(value: unknown): TriviaQuestion | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TriviaQuestion>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const question = typeof candidate.question === "string" ? candidate.question.trim() : "";
  const options = Array.isArray(candidate.options) ? candidate.options.filter((item): item is string => typeof item === "string") : [];
  const correctAnswerRaw = Number(candidate.correctAnswer);
  const correctAnswer = Number.isFinite(correctAnswerRaw) ? Math.floor(correctAnswerRaw) : -1;
  if (!id || !question || options.length < 2 || correctAnswer < 0 || correctAnswer >= options.length) {
    return null;
  }

  return {
    id,
    question,
    options,
    correctAnswer,
    category: typeof candidate.category === "string" ? candidate.category : undefined,
    difficulty: typeof candidate.difficulty === "string" ? candidate.difficulty : undefined,
  };
}

function createRainToken(pool: readonly string[], index = 0, total = RAIN_ITEM_COUNT): RainToken {
  const laneCount = Math.max(1, total);
  const spreadMin = 10;
  const spreadMax = 90;
  const spreadWidth = spreadMax - spreadMin;
  const laneWidth = spreadWidth / laneCount;
  const laneLeft = spreadMin + laneWidth * index + laneWidth / 2;
  const jitter = (Math.random() - 0.5) * Math.min(2.4, laneWidth * 0.45);
  const boundedLeft = Math.max(spreadMin, Math.min(spreadMax, laneLeft + jitter));
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
  const [preRoundCountdown, setPreRoundCountdown] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(QUESTION_TIME_LIMIT_SECONDS);
  const [roundTotalPoints, setRoundTotalPoints] = useState<number | null>(null);
  const [roundStartPoints, setRoundStartPoints] = useState<number | null>(null);
  const [rewardPulse, setRewardPulse] = useState("");
  const [showRewardPulse, setShowRewardPulse] = useState(false);
  const [feedbackFlash, setFeedbackFlash] = useState<FeedbackFlash>(null);
  const [rainEmojis, setRainEmojis] = useState<RainToken[]>([]);
  const [fireworks, setFireworks] = useState<FireworkToken[]>([]);
  const [quotaSecondsRemaining, setQuotaSecondsRemaining] = useState(0);
  const [roundEndedMessage, setRoundEndedMessage] = useState("");
  const [isPreparingNextRound, setIsPreparingNextRound] = useState(false);
  const roundCompletionHandledRef = useRef(false);
  const backgroundRoundExitRef = useRef(false);

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
  const triviaQuotaLocked = Boolean(quota && !quota.isAdminBypass && quota.questionsRemaining <= 0);
  const upcomingRoundNumber = useMemo(() => {
    const used = Math.max(0, quota?.questionsUsed ?? 0);
    const derivedRound = Math.floor(used / QUESTIONS_PER_ROUND) + 1;
    return Math.min(ROUND_LIMIT_PER_WINDOW, Math.max(1, derivedRound));
  }, [quota?.questionsUsed]);

  const loadQuota = useCallback(async (): Promise<TriviaQuota | null> => {
    const userId = getUserId() ?? "";
    if (!userId) {
      setQuota(null);
      return null;
    }
    const response = await fetch(`/api/trivia/quota?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
    const payload = (await response.json()) as { ok: boolean; quota?: TriviaQuota | null };
    if (payload.ok) {
      const nextQuota = payload.quota ?? null;
      setQuota(nextQuota);
      return nextQuota;
    }
    return null;
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

  const clearLivePreviewSnapshot = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.sessionStorage.removeItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY);
    } catch {
      // Ignore storage write failures.
    }
    try {
      window.localStorage.removeItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY);
    } catch {
      // Ignore storage write failures.
    }
  }, []);

  const forfeitQuestion = useCallback(async (questionId: string, secondsLeft?: number) => {
    const userId = getUserId() ?? "";
    if (!userId || !questionId) {
      return;
    }
    const boundedSeconds = Number.isFinite(secondsLeft ?? NaN)
      ? Math.max(0, Math.min(QUESTION_TIME_LIMIT_SECONDS, Math.floor(secondsLeft ?? 0)))
      : 0;
    const elapsed = Math.max(0, QUESTION_TIME_LIMIT_SECONDS - boundedSeconds);

    await fetch("/api/trivia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        userId,
        questionId,
        answer: -1,
        timeElapsed: elapsed,
      }),
    }).catch(() => {
      // Best effort: if this fails we still continue loading trivia.
    });
  }, []);

  const recoverInterruptedQuestion = useCallback(async (): Promise<RecoveredRoundState | null> => {
    if (typeof window === "undefined") {
      return null;
    }

    const readSnapshot = (): TriviaLivePreviewSnapshot | null => {
      const parse = (raw: string | null): TriviaLivePreviewSnapshot | null => {
        if (!raw) {
          return null;
        }
        try {
          const parsed = JSON.parse(raw) as Partial<TriviaLivePreviewSnapshot>;
          if (!parsed.isRoundStarted || typeof parsed.questionId !== "string" || !parsed.questionId.trim()) {
            return null;
          }
          if (!Number.isFinite(Number(parsed.updatedAt ?? 0))) {
            return null;
          }

          const parsedQuestions = Array.isArray(parsed.questions)
            ? parsed.questions
                .map((item) => normalizeTriviaQuestion(item))
                .filter((item): item is TriviaQuestion => Boolean(item))
            : [];
          if (parsedQuestions.length === 0) {
            return null;
          }

          const rawQuestionIndex = Number(parsed.questionIndex ?? 0);
          const questionIndex = Number.isFinite(rawQuestionIndex) ? Math.floor(rawQuestionIndex) : 0;
          if (questionIndex < 1 || questionIndex > parsedQuestions.length) {
            return null;
          }
          const questionId = String(parsed.questionId).trim();
          if (!questionId || parsedQuestions[questionIndex - 1]?.id !== questionId) {
            return null;
          }

          return {
            updatedAt: Number(parsed.updatedAt),
            isRoundStarted: true,
            questionId,
            questionIndex,
            totalQuestions: parsedQuestions.length,
            secondsRemaining: Number(parsed.secondsRemaining ?? 0),
            correctAnswers: Number(parsed.correctAnswers ?? 0),
            attempted: Number(parsed.attempted ?? 0),
            questionText: String(parsed.questionText ?? ""),
            questions: parsedQuestions,
            userId: String(parsed.userId ?? ""),
            venueId: String(parsed.venueId ?? ""),
          };
        } catch {
          return null;
        }
      };

      const localRaw = window.localStorage.getItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY);
      const localParsed = parse(localRaw);
      if (localParsed) {
        return localParsed;
      }
      const sessionRaw = window.sessionStorage.getItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY);
      return parse(sessionRaw);
    };

    const snapshot = readSnapshot();
    if (!snapshot) {
      clearLivePreviewSnapshot();
      return null;
    }

    const currentUserId = (getUserId() ?? "").trim();
    const currentVenueId = (getVenueId() ?? "").trim();
    const ageMs = Date.now() - snapshot.updatedAt;
    if (
      !currentUserId ||
      !currentVenueId ||
      snapshot.userId !== currentUserId ||
      snapshot.venueId !== currentVenueId ||
      ageMs < 0 ||
      ageMs > TRIVIA_LIVE_PREVIEW_MAX_AGE_MS
    ) {
      clearLivePreviewSnapshot();
      return null;
    }

    await forfeitQuestion(snapshot.questionId, snapshot.secondsRemaining);
    clearLivePreviewSnapshot();

    const forfeitedQuestionNumber = Math.max(1, Math.floor(snapshot.questionIndex));
    const nextIndex = Math.min(snapshot.questions.length, Math.max(0, forfeitedQuestionNumber));
    const attemptedAfterForfeit = Math.min(
      snapshot.questions.length,
      Math.max(0, Math.floor(snapshot.attempted)) + 1
    );
    const safeCorrectAnswers = Math.min(
      attemptedAfterForfeit,
      Math.max(0, Math.floor(snapshot.correctAnswers))
    );
    const message =
      nextIndex < snapshot.questions.length
        ? `Question ${forfeitedQuestionNumber} was forfeited after the session was interrupted. Continuing on question ${nextIndex + 1}.`
        : `Question ${forfeitedQuestionNumber} was forfeited after the session was interrupted. This round is complete.`;

    return {
      questions: snapshot.questions,
      nextIndex,
      correctAnswers: safeCorrectAnswers,
      attempted: attemptedAfterForfeit,
      message,
    };
  }, [clearLivePreviewSnapshot, forfeitQuestion]);

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

  const resetRoundState = useCallback(() => {
    setIndex(0);
    setSelectedAnswer(null);
    setIsSubmitting(false);
    setFeedback("");
    setFeedbackKind(null);
    setRevealedCorrectAnswer(null);
    setCorrectAnswers(0);
    setAttempted(0);
    setIsRoundStarted(false);
    setPreRoundCountdown(null);
    setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
    setRoundTotalPoints(null);
    setRoundStartPoints(null);
    setRewardPulse("");
    setShowRewardPulse(false);
    setFeedbackFlash(null);
    setRainEmojis([]);
    setFireworks([]);
    roundCompletionHandledRef.current = false;
    backgroundRoundExitRef.current = false;
  }, []);

  const loadRoundQuestions = useCallback(
    async (options: { showLoading?: boolean; useWarmCache?: boolean } = {}) => {
      const { showLoading = true, useWarmCache = true } = options;
      const userId = getUserId() ?? "";
      const venueId = getVenueId() ?? "";
      if (!userId || !venueId) {
        router.replace("/");
        return;
      }

      const warmSnapshot = useWarmCache ? readWarmTriviaCache(userId, venueId) : null;
      const hasWarmQuestions = Boolean(warmSnapshot?.questions && warmSnapshot.questions.length > 0);

      if (showLoading) {
        setLoadingQuestions(true);
      }
      setLoadError("");

      if (hasWarmQuestions && warmSnapshot) {
        setQuestions(warmSnapshot.questions);
        resetRoundState();
        if (warmSnapshot.quota) {
          setQuota({
            limit: warmSnapshot.quota.limit,
            questionsUsed: warmSnapshot.quota.questionsUsed,
            questionsRemaining: warmSnapshot.quota.questionsRemaining,
            windowSecondsRemaining: warmSnapshot.quota.windowSecondsRemaining,
            isAdminBypass: warmSnapshot.quota.isAdminBypass,
          });
        }
        if (showLoading) {
          setLoadingQuestions(false);
        }
      }

      try {
        const items = await fetchTriviaQuestions(userId);
        setQuestions(items);
        resetRoundState();
        await loadQuota();
        const startingPoints = await loadCurrentUserPoints();
        setRoundStartPoints(startingPoints);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load trivia.");
      } finally {
        if (showLoading && !hasWarmQuestions) {
          setLoadingQuestions(false);
        }
      }
    },
    [loadCurrentUserPoints, loadQuota, resetRoundState, router]
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrapRound = async () => {
      const recoveredInterruptedQuestion = await recoverInterruptedQuestion();
      if (cancelled) {
        return;
      }

      if (recoveredInterruptedQuestion) {
        setLoadError("");
        setQuestions(recoveredInterruptedQuestion.questions);
        setIndex(recoveredInterruptedQuestion.nextIndex);
        setSelectedAnswer(null);
        setIsSubmitting(false);
        setFeedback("");
        setFeedbackKind(null);
        setRevealedCorrectAnswer(null);
        setCorrectAnswers(recoveredInterruptedQuestion.correctAnswers);
        setAttempted(recoveredInterruptedQuestion.attempted);
        setIsRoundStarted(recoveredInterruptedQuestion.nextIndex < recoveredInterruptedQuestion.questions.length);
        setPreRoundCountdown(null);
        setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
        setRoundEndedMessage(recoveredInterruptedQuestion.message);
        setRoundTotalPoints(null);
        setRewardPulse("");
        setShowRewardPulse(false);
        setFeedbackFlash(null);
        setRainEmojis([]);
        setFireworks([]);
        roundCompletionHandledRef.current = false;
        backgroundRoundExitRef.current = false;

        await loadQuota();
        const startingPoints = await loadCurrentUserPoints();
        if (!cancelled) {
          setRoundStartPoints(startingPoints);
          setLoadingQuestions(false);
        }
        return;
      }

      await loadRoundQuestions({ showLoading: true, useWarmCache: true });
    };

    void bootstrapRound();

    return () => {
      cancelled = true;
    };
  }, [loadCurrentUserPoints, loadQuota, loadRoundQuestions, recoverInterruptedQuestion]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const endedReason = window.sessionStorage.getItem(TRIVIA_ROUND_END_REASON_KEY);
    if (!endedReason) {
      return;
    }
    window.sessionStorage.removeItem(TRIVIA_ROUND_END_REASON_KEY);
    setRoundEndedMessage(endedReason);
    resetRoundState();
  }, [resetRoundState]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const endRoundForBackgrounding = () => {
      if (backgroundRoundExitRef.current) {
        return;
      }
      if (!isRoundStarted || preRoundCountdown !== null || finished) {
        return;
      }
      backgroundRoundExitRef.current = true;

      const activeQuestionId = selectedAnswer === null ? question?.id ?? "" : "";
      const activeQuestionNumber = Math.max(1, index + 1);
      const didForfeit = Boolean(activeQuestionId);

      if (didForfeit) {
        void forfeitQuestion(activeQuestionId, secondsRemaining);
      }

      const reason = didForfeit
        ? `Question ${activeQuestionNumber} was forfeited because the browser was minimized or closed during active play.`
        : "Round ended because the browser was minimized or left during active play.";
      try {
        window.sessionStorage.setItem(TRIVIA_ROUND_END_REASON_KEY, reason);
      } catch {
        // Ignore storage write failures.
      }
      setRoundEndedMessage(reason);
      window.setTimeout(() => {
        backgroundRoundExitRef.current = false;
      }, 800);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        endRoundForBackgrounding();
      }
    };

    const handlePageHide = () => {
      endRoundForBackgrounding();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [
    finished,
    forfeitQuestion,
    index,
    isRoundStarted,
    preRoundCountdown,
    question?.id,
    secondsRemaining,
    selectedAnswer,
  ]);

  useEffect(() => {
    if (!isRoundStarted || finished || selectedAnswer !== null) {
      return;
    }

    setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
  }, [isRoundStarted, index, finished, selectedAnswer]);

  useEffect(() => {
    if (preRoundCountdown === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (preRoundCountdown <= 0) {
        setPreRoundCountdown(null);
        return;
      }
      setPreRoundCountdown((value) => (value === null ? null : value - 1));
    }, preRoundCountdown <= 0 ? 550 : 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [preRoundCountdown]);

  useEffect(() => {
    if (!triviaQuotaLocked) {
      setQuotaSecondsRemaining(0);
      return;
    }

    setQuotaSecondsRemaining(Math.max(0, Math.floor(quota?.windowSecondsRemaining ?? 0)));
  }, [quota?.windowSecondsRemaining, triviaQuotaLocked]);

  useEffect(() => {
    if (!triviaQuotaLocked || quotaSecondsRemaining <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setQuotaSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [triviaQuotaLocked, quotaSecondsRemaining]);

  useEffect(() => {
    if (!triviaQuotaLocked || quotaSecondsRemaining > 0) {
      return;
    }

    void loadQuota();
  }, [triviaQuotaLocked, quotaSecondsRemaining, loadQuota]);

  const chooseAnswer = useCallback(
    async (answerIndex: number) => {
      const submittingUserId = getUserId() ?? "";

      if (triviaQuotaLocked) {
        setFeedback(`Trivia limit reached. You can play again in ${formatCountdown(quotaSecondsRemaining)}.`);
        setFeedbackKind(null);
        return;
      }

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
          if (payload.quota) {
            setQuota(payload.quota);
          }
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
        const message = error instanceof Error ? error.message : "Could not submit answer.";
        setFeedback(message);
        setFeedbackKind(null);
        void loadQuota();
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      loadQuota,
      loadCurrentUserPoints,
      question,
      quotaSecondsRemaining,
      selectedAnswer,
      triggerCelebration,
      triggerPointsFlow,
      triviaQuotaLocked,
    ]
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
    if (!isRoundStarted || preRoundCountdown !== null || finished || selectedAnswer !== null || isSubmitting || triviaQuotaLocked) {
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
  }, [isRoundStarted, preRoundCountdown, finished, selectedAnswer, isSubmitting, secondsRemaining, chooseAnswer, triviaQuotaLocked]);

  const nextQuestion = () => {
    if (triviaQuotaLocked) {
      setFeedback(`Trivia limit reached. You can play again in ${formatCountdown(quotaSecondsRemaining)}.`);
      setFeedbackKind(null);
      return;
    }

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

  const startNextRound = useCallback(async () => {
    setIsPreparingNextRound(true);
    setRoundEndedMessage("");
    try {
      await loadRoundQuestions({ showLoading: true, useWarmCache: false });
    } finally {
      setIsPreparingNextRound(false);
    }
  }, [loadRoundQuestions]);

  useEffect(() => {
    if (!finished) {
      roundCompletionHandledRef.current = false;
      return;
    }

    if (!roundCompletionHandledRef.current && typeof window !== "undefined") {
      roundCompletionHandledRef.current = true;
      const userId = getUserId() ?? "anon";
      const venueId = getVenueId() ?? "global";
      const storageKey = `tp:trivia-round-count:${venueId}:${userId}`;
      let roundNumber = 1;
      try {
        const prior = Number.parseInt(window.sessionStorage.getItem(storageKey) ?? "0", 10);
        const next = Math.max(0, Number.isFinite(prior) ? prior : 0) + 1;
        window.sessionStorage.setItem(storageKey, String(next));
        roundNumber = next;
      } catch {
        roundNumber = 1;
      }

      window.dispatchEvent(
        new CustomEvent("tp:trivia-round-complete", {
          detail: {
            roundNumber: Math.min(3, Math.max(1, roundNumber)),
          },
        })
      );
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!isRoundStarted || preRoundCountdown !== null || finished || !question || selectedAnswer !== null || isSubmitting) {
      clearLivePreviewSnapshot();
      return;
    }

    const currentUserId = (getUserId() ?? "").trim();
    const currentVenueId = (getVenueId() ?? "").trim();
    if (!currentUserId || !currentVenueId) {
      clearLivePreviewSnapshot();
      return;
    }

    const payload: TriviaLivePreviewSnapshot = {
      updatedAt: Date.now(),
      isRoundStarted: true,
      questionId: question.id,
      questionIndex: index + 1,
      totalQuestions: questions.length,
      secondsRemaining,
      correctAnswers,
      attempted,
      questionText: question.question,
      questions,
      userId: currentUserId,
      venueId: currentVenueId,
    };
    const serialized = JSON.stringify(payload);

    try {
      window.sessionStorage.setItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage write failures.
    }
    try {
      window.localStorage.setItem(TRIVIA_LIVE_PREVIEW_STORAGE_KEY, serialized);
    } catch {
      // Ignore storage write failures.
    }
  }, [
    attempted,
    clearLivePreviewSnapshot,
    correctAnswers,
    finished,
    index,
    isSubmitting,
    isRoundStarted,
    preRoundCountdown,
    question,
    questions,
    secondsRemaining,
    selectedAnswer,
  ]);

  const returnToVenueHome = useCallback(() => {
    const venueId = getVenueId()?.trim() ?? "";
    if (!venueId) {
      router.push("/");
      return;
    }

    const targetPath = `/venue/${encodeURIComponent(venueId)}`;
    void runVenueGameReturnTransition({
      gameKey: "trivia",
      navigate: () =>
        navigateBackToVenue({
          venuePath: targetPath,
          fallbackNavigate: () => {
            router.push(targetPath);
          },
        }),
    });
  }, [router]);

  if (loadingQuestions) {
    return (
      <div className="space-y-4 rounded-md border border-cyan-200/45 bg-slate-950/35 p-5 text-sm text-cyan-50 backdrop-blur-sm">
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
    const totalAfterRound = roundTotalPoints ?? estimatedRoundTotal ?? currentUserPoints ?? 0;
    const roundGain = Math.max(0, roundDelta);
    return (
      <div className="flex h-full min-h-0 flex-col rounded-2xl border-2 border-cyan-200/55 bg-slate-950/35 p-2 shadow-[0_10px_28px_rgba(15,23,42,0.45)] backdrop-blur-sm">
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-cyan-100/45 bg-slate-900/35 p-2">
          <p className="mb-2 text-sm font-black tracking-wide text-emerald-200">Round complete 🎉</p>
          <div className="grid min-h-0 flex-1 gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-cyan-200/55 bg-cyan-900/35 p-2">
              <p className="text-xs uppercase text-cyan-100/90">Scoreboard</p>
              <p className="text-lg font-bold text-cyan-50">
                {correctAnswers}/{attempted}
              </p>
              <p className="text-sm text-cyan-100">{accuracy}% accuracy</p>
            </div>
            <div className="rounded-2xl border border-cyan-200/55 bg-cyan-900/35 p-2">
              <p className="text-xs uppercase text-cyan-100/90">Round reward</p>
              <p className="text-lg font-bold text-emerald-700">+{pointsWon} points</p>
              <p className="text-xs text-cyan-100">Keep the streak going in your next round.</p>
            </div>
            <div className="rounded-2xl border border-cyan-200/55 bg-cyan-900/35 p-2 sm:col-span-2">
              <p className="text-xs uppercase text-cyan-100/90">Total points</p>
              <p className="text-xl font-bold text-cyan-50">{totalAfterRound}</p>
              <p className="text-sm text-cyan-100">Round gain: +{roundGain}</p>
            </div>
          </div>
        </div>
        <div className="mt-2 grid gap-2">
          <button
            type="button"
            onMouseDown={() => triggerHaptic(14)}
            onClick={() => {
              void startNextRound();
            }}
            disabled={isPreparingNextRound || triviaQuotaLocked}
            className={`${BUTTON_POP_CLASS} inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-emerald-300 bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 disabled:opacity-60`}
          >
            {isPreparingNextRound
              ? "Loading next round..."
              : triviaQuotaLocked
                ? `Next round unlocks in ${formatCountdown(quotaSecondsRemaining)}`
                : "Start Next Round"}
          </button>
          <button
            type="button"
            onMouseDown={() => triggerHaptic(14)}
            onClick={returnToVenueHome}
            className={`${BUTTON_POP_CLASS} ${BACK_TO_VENUE_CLASS} w-full`}
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
      </div>
    );
  }

  if (!question) {
    return (
      <div className="rounded-md border border-cyan-200/45 bg-slate-950/35 p-4 text-sm text-cyan-50 backdrop-blur-sm">
        No new trivia questions available right now.
      </div>
    );
  }

  if (!isRoundStarted) {
    return (
      <div className="space-y-2 rounded-md border border-cyan-200/45 bg-slate-950/38 p-3 text-base text-cyan-50 backdrop-blur-sm sm:space-y-3 sm:p-4">
        {roundEndedMessage ? (
          <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {roundEndedMessage}
          </p>
        ) : null}
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-100">
          Round {upcomingRoundNumber} of {ROUND_LIMIT_PER_WINDOW}
        </p>
        <p className="text-lg font-semibold text-yellow-200">Ready to start trivia?</p>
        {triviaQuotaLocked ? (
          <p>
            Trivia limit reached. You can start another round in{" "}
            <span className="font-bold">{formatCountdown(quotaSecondsRemaining)}</span>.
          </p>
        ) : (
          <p>You will have 15 seconds to answer each question once the round begins.</p>
        )}
        <button
          type="button"
          onMouseDown={() => triggerHaptic(20)}
          onClick={() => {
            setRoundEndedMessage("");
            setIsRoundStarted(true);
            setPreRoundCountdown(PRE_ROUND_COUNTDOWN_START);
            setSecondsRemaining(QUESTION_TIME_LIMIT_SECONDS);
            setRoundStartPoints(currentUserPoints ?? null);
          }}
          disabled={triviaQuotaLocked}
          className={`${BUTTON_POP_CLASS} inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-blue-700 px-3 py-2 text-base font-semibold text-white shadow-sm shadow-blue-200 sm:min-h-[50px] sm:px-4 sm:py-2`}
        >
          {triviaQuotaLocked ? `Locked ${formatCountdown(quotaSecondsRemaining)}` : "Yes, Start Trivia"}
        </button>
        <button
          type="button"
          onMouseDown={() => triggerHaptic(14)}
          onClick={returnToVenueHome}
          className={`${BUTTON_POP_CLASS} ${BACK_TO_VENUE_CLASS} w-full`}
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

  if (preRoundCountdown !== null) {
    return (
      <div className="space-y-3 rounded-2xl border-2 border-cyan-200/55 bg-slate-950/38 p-4 text-center text-cyan-50 shadow-[0_12px_28px_rgba(15,23,42,0.45)] backdrop-blur-sm">
        <p className="text-sm font-black uppercase tracking-[0.12em] text-cyan-100">Get Ready</p>
        <p className="text-2xl font-black text-yellow-200 sm:text-3xl">
          Round {upcomingRoundNumber}
        </p>
        <p
          key={`count-${preRoundCountdown}`}
          className="animate-tp-countdown-pop text-6xl font-black leading-none text-cyan-100 sm:text-7xl"
        >
          {preRoundCountdown > 0 ? preRoundCountdown : "START!"}
        </p>
      </div>
    );
  }

  return (
    <div ref={gameRootRef} className="relative flex h-full min-h-0 flex-col gap-2 overflow-x-hidden overflow-y-auto px-0.5 pb-1">
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
                marginLeft: "-0.5em",
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

      <div className="rounded-xl border-2 border-cyan-200/55 bg-slate-900/45 p-1.5 text-cyan-50 shadow-[2px_2px_0_#0f172a] sm:rounded-2xl sm:border-4 sm:p-2 sm:shadow-[5px_5px_0_#0f172a]">
        <div className="flex items-center justify-between gap-2 text-sm font-black uppercase tracking-[0.08em]">
          <span>Round {upcomingRoundNumber} of {ROUND_LIMIT_PER_WINDOW}</span>
          <span>{quota?.isAdminBypass ? "Admin Unlimited" : "Live Round"}</span>
        </div>
        {triviaQuotaLocked ? (
          <p className="mt-1 text-sm font-semibold text-rose-200">
            Limit reached. Next round unlocks in {formatCountdown(quotaSecondsRemaining)}.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border-2 border-slate-900 bg-yellow-100 p-1.5 text-sm font-semibold text-slate-700 shadow-[2px_2px_0_#0f172a] sm:rounded-2xl sm:border-4 sm:p-2 sm:shadow-[5px_5px_0_#0f172a]">
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

      <div className="min-h-0 flex flex-1 flex-col gap-2 overflow-y-auto sm:gap-3">
        {showRewardPulse ? (
          <div className="tp-pop-in rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-sm font-bold text-blue-700 sm:p-2">
            {rewardPulse}
          </div>
        ) : null}
        <h2 className="px-0.5 text-base font-black leading-snug text-white [text-shadow:0_1px_0_rgba(2,6,23,0.7),0_0_12px_rgba(255,255,255,0.24)] sm:text-xl">
          {question.question}
        </h2>
        <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto pr-0.5 sm:gap-3">
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
                disabled={selectedAnswer !== null || isSubmitting || secondsRemaining <= 0 || triviaQuotaLocked}
                className={`${BUTTON_POP_CLASS} min-h-[56px] w-full rounded-xl border-2 px-2.5 py-2 text-left text-[15px] font-bold leading-snug shadow-[2px_2px_0_#0f172a] sm:min-h-[64px] sm:rounded-2xl sm:border-4 sm:px-3 sm:py-2.5 sm:text-base sm:shadow-[4px_4px_0_#0f172a] ${
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

      <div className="mt-auto space-y-1.5 pt-0.5 sm:space-y-2.5 sm:pt-1">
        {feedback ? (
          <div
            className={`rounded-xl border-2 p-1.5 text-sm font-semibold leading-snug shadow-[2px_2px_0_#0f172a] sm:rounded-2xl sm:border-4 sm:p-2 sm:shadow-[5px_5px_0_#0f172a] ${
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
          disabled={selectedAnswer === null || isSubmitting || triviaQuotaLocked}
          className={`${BUTTON_POP_CLASS} inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border-2 border-slate-900 bg-cyan-300 px-3 py-2 text-base font-black text-slate-900 shadow-[2px_2px_0_#0f172a] sm:min-h-[50px] sm:rounded-2xl sm:border-4 sm:px-4 sm:py-2.5 sm:shadow-[5px_5px_0_#0f172a] disabled:opacity-60`}
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
