"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useRouter } from "next/navigation";
import { getUserId } from "@/lib/storage";
import { getVenueId } from "@/lib/storage";
import { readWarmTriviaCache } from "@/lib/warmupCache";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import { canAdvanceToNextTriviaQuestion } from "@/lib/triviaRoundProgress";
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
    pointsAwarded?: number;
    multiplierApplied?: number;
  };
  quota?: TriviaQuota | null;
  error?: string;
};

const QUESTION_TIME_LIMIT_SECONDS = 15;
const POINTS_PER_CORRECT = 2;
const QUESTIONS_PER_ROUND = 15;
const ROUND_LIMIT_PER_WINDOW = 3;
const PRE_ROUND_COUNTDOWN_START = 3;
const BUTTON_POP_CLASS =
  "transition-all duration-150 transform active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300";
const ANSWER_LETTERS = ["A", "B", "C", "D"] as const;
const BACK_TO_VENUE_CLASS =
  "tp-exit-pill tp-clean-button inline-flex items-center justify-center gap-2 px-4 text-sm font-black";
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
const TRIVIA_ROUND_ENDED_ACTIVE_KEY = "tp:trivia:round-ended-active:v1";
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

type AnswerButtonProps = {
  option: string;
  optionIndex: number;
  questionId: string;
  letter: string;
  selected: boolean;
  isRevealedCorrect: boolean;
  isSelectedWrong: boolean;
  locked: boolean;
  onChoose: (index: number) => void;
};

function AnswerButton({
  option,
  optionIndex,
  questionId,
  letter,
  selected,
  isRevealedCorrect,
  isSelectedWrong,
  locked,
  onChoose,
}: AnswerButtonProps) {
  const controls = useAnimationControls();

  useEffect(() => {
    void controls.set({ scale: 1, filter: "none" });
  }, [controls, questionId]);

  useEffect(() => {
    if (isRevealedCorrect) {
      let active = true;
      const seq = async () => {
        await controls.start({
          scale: 1.05,
          filter: "drop-shadow(0 0 14px rgba(52,211,153,0.9))",
          transition: { type: "spring", stiffness: 400, damping: 30 },
        });
        if (!active) return;
        await controls.start({
          scale: 1,
          filter: "drop-shadow(0 0 6px rgba(52,211,153,0.55))",
          transition: { type: "spring", stiffness: 400, damping: 30 },
        });
      };
      void seq();
      return () => {
        active = false;
      };
    }
    if (isSelectedWrong) {
      void controls.start({
        filter: "drop-shadow(0 0 12px rgba(251,113,133,0.85))",
        transition: { type: "spring", stiffness: 400, damping: 30 },
      });
      return;
    }
    void controls.start({
      scale: 1,
      filter: "none",
      transition: { duration: 0.1 },
    });
  }, [controls, isRevealedCorrect, isSelectedWrong]);

  const buttonClass = isRevealedCorrect
    ? "border-[#34d399] bg-emerald-500/20 text-[#a7f3d0]"
    : isSelectedWrong
    ? "border-[#fb7185] bg-rose-500/[18%] text-[#fecdd3]"
    : selected
    ? "border-[#facc15] bg-[#facc15] text-[#0a0a0f]"
    : "border-[rgba(250,204,21,0.30)] bg-[#0a0a0f] text-[#f8fafc] enabled:hover:border-[rgba(250,204,21,0.6)]";

  const chipClass = isRevealedCorrect
    ? "bg-[#34d399] text-[#052e16]"
    : isSelectedWrong
    ? "bg-[#fb7185] text-[#4c0519]"
    : selected
    ? "bg-[rgba(10,10,15,0.85)] text-[#facc15]"
    : "bg-[#facc15] text-[#0a0a0f]";

  return (
    <motion.button
      type="button"
      data-answer-token={`${questionId}-${optionIndex}`}
      animate={controls}
      whileTap={{ scale: 0.96, transition: { duration: 0.06 } }}
      onMouseDown={() => triggerHaptic()}
      onClick={() => onChoose(optionIndex)}
      disabled={locked}
      className={`grid grid-cols-[26px_1fr_auto] items-center gap-2.5 rounded-[14px] border-2 p-3 text-left leading-snug transition-colors duration-[80ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 disabled:opacity-80 ${buttonClass}`}
    >
      <span
        className={`inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] font-black text-[14px] ${chipClass}`}
      >
        {letter}
      </span>
      <span className="text-[13px] font-extrabold">{option}</span>
      {isRevealedCorrect ? (
        <span className="text-[14px] font-black text-[#34d399]">✓</span>
      ) : (
        <span aria-hidden="true" className="w-0" />
      )}
    </motion.button>
  );
}

export function TriviaGame({ questions: initialQuestions = [] }: { questions?: TriviaQuestion[] }) {
  const router = useRouter();
  const gameRootRef = useRef<HTMLDivElement>(null);
  const nextQuestionButtonRef = useRef<HTMLButtonElement>(null);
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
  const [roundPointsAwarded, setRoundPointsAwarded] = useState(0);

  const question = questions[index] ?? null;
  const finished = index >= questions.length;
  const accuracy = useMemo(() => {
    if (attempted === 0) return 0;
    return Math.round((correctAnswers / attempted) * 100);
  }, [attempted, correctAnswers]);
  // Use server-confirmed points when available; fall back to base rate optimistically
  const pointsWon = roundPointsAwarded > 0 ? roundPointsAwarded : correctAnswers * POINTS_PER_CORRECT;
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
        ? `Question ${forfeitedQuestionNumber} was forfeited because the window was closed during active play. Continuing on question ${nextIndex + 1}.`
        : `Question ${forfeitedQuestionNumber} was forfeited because the window was closed during active play. This round is complete.`;

    return {
      questions: snapshot.questions,
      nextIndex,
      correctAnswers: safeCorrectAnswers,
      attempted: attemptedAfterForfeit,
      message,
    };
  }, [clearLivePreviewSnapshot, forfeitQuestion]);

  const triggerPointsFlow = useCallback((optionIndex: number, points: number) => {
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
          delta: points,
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

      if (didForfeit) {
        setRoundEndedMessage(
          `Question ${activeQuestionNumber} was forfeited because the window was closed during active play.`
        );
      }
      window.setTimeout(() => {
        backgroundRoundExitRef.current = false;
      }, 800);
    };

    const handlePageHide = () => {
      endRoundForBackgrounding();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
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
    if (selectedAnswer === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      nextQuestionButtonRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }, 40);
    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedAnswer, feedback]);

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
        setFeedback(`Correct! +${POINTS_PER_CORRECT} points added to your profile.`);
        setFeedbackKind("correct");
        setRewardPulse(`🎉 Correct +${POINTS_PER_CORRECT}`);
        setShowRewardPulse(true);
        triggerHaptic([20, 50, 20]);
        // Note: optimistic feedback uses base points; updated below once server confirms
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
        const pointsAwarded = Math.max(0, Number(payload.result.pointsAwarded ?? POINTS_PER_CORRECT));
        const multiplierApplied = Number(payload.result.multiplierApplied ?? 1);
        const challengeActive = multiplierApplied > 1;
        setAttempted((value) => value + 1);

        if (payload.result.correctAnswer !== localCorrectAnswer) {
          setRevealedCorrectAnswer(payload.result.correctAnswer);
        }

        if (wasCorrect) {
          const savedLabel = payload.result.saved ? "saved" : "recorded";
          setRewardPulse(
            challengeActive
              ? `⚡ ${multiplierApplied}x Challenge! +${pointsAwarded} pts ${savedLabel}`
              : `🔥 +${pointsAwarded} pts ${savedLabel}`
          );
          setShowRewardPulse(true);
          triggerHaptic([35, 35, 35]);
          setFeedback(
            challengeActive
              ? `Correct! +${pointsAwarded} points (${multiplierApplied}x Challenge multiplier active).`
              : `Correct! +${pointsAwarded} points added to your profile.`
          );
          setFeedbackKind("correct");
          setCorrectAnswers((value) => value + 1);
          setRoundPointsAwarded((value) => value + pointsAwarded);
          triggerPointsFlow(answerIndex, pointsAwarded);
          if (submittingUserId) {
            setCurrentUserPoints((value) => (value ?? 0) + pointsAwarded);
            window.dispatchEvent(
              new CustomEvent("tp:points-updated", {
                detail: { source: "speed-trivia", delta: pointsAwarded, multiplier: multiplierApplied },
              })
            );
            if (challengeActive) {
              window.dispatchEvent(
                new CustomEvent("tp:success-particles", {
                  detail: { source: "trivia-challenge", color: "gold", multiplier: multiplierApplied },
                })
              );
            }
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
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(TRIVIA_ROUND_ENDED_ACTIVE_KEY, "0");
      } catch {
        // Ignore storage failures.
      }
    }
    setIsPreparingNextRound(true);
    setRoundEndedMessage("");
    setRoundPointsAwarded(0);
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
      try {
        window.sessionStorage.setItem(TRIVIA_ROUND_ENDED_ACTIVE_KEY, "1");
      } catch {
        // Ignore storage failures.
      }
      const userId = getUserId() ?? "anon";
      const venueId = getVenueId() ?? "global";
      const storageKey = `tp:trivia-round-count:${venueId}:${userId}`;
      let roundNumber = 1;
      try {
        const prior = Number.parseInt(window.sessionStorage.getItem(storageKey) ?? "0", 10);
        const next = Math.max(0, Number.isFinite(prior) ? prior : 0) + 1;
        window.sessionStorage.setItem(storageKey, String(next));
        roundNumber = ((next - 1) % 3) + 1;
      } catch {
        roundNumber = 1;
      }
      const safeRoundNumber = Number.parseInt(String(roundNumber), 10);
      const canonicalRoundNumber = Number.isFinite(safeRoundNumber)
        ? Math.min(3, Math.max(1, safeRoundNumber))
        : 1;

      window.dispatchEvent(
        new CustomEvent("tp:trivia-round-complete", {
          detail: {
            roundNumber: canonicalRoundNumber,
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
    if (!finished) {
      try {
        window.sessionStorage.setItem(TRIVIA_ROUND_ENDED_ACTIVE_KEY, "0");
      } catch {
        // Ignore storage failures.
      }
    }
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
      gameKey: "speed-trivia",
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
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-transparent">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-[rgba(250,204,21,0.2)] border-t-[#facc15]" />
          <div className="absolute inset-2 flex items-center justify-center rounded-full bg-[#0f0f17] font-black tracking-[0.2em] text-[#facc15] text-[11px]">
            HC
          </div>
        </div>
        <p className="font-black tracking-[0.06em] text-[#facc15] text-[14px]">Loading Trivia...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-transparent p-4">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-[12px] text-rose-400">
          {loadError}
        </div>
      </div>
    );
  }

  if (finished) {
    const totalAfterRound = roundTotalPoints ?? estimatedRoundTotal ?? currentUserPoints ?? 0;
    const roundGain = Math.max(0, roundDelta);
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between gap-2 px-3.5"
            style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: "12px" }}
          >
            <button
              type="button"
              onMouseDown={() => triggerHaptic(14)}
              onClick={returnToVenueHome}
              className="tp-exit-pill tp-clean-button inline-flex items-center gap-1.5 px-3 font-black text-[12px]"
            >
              ← Venue
            </button>
            <div
              className="font-black uppercase tracking-[0.06em] text-[#facc15] text-[17px]"
              style={{ textShadow: "0 1px 0 #000, 0 0 14px rgba(250,204,21,0.5)" }}
            >
              Speed Trivia
            </div>
            <div className="flex items-center gap-1 rounded-[10px] border border-[rgba(250,204,21,0.4)] bg-[#0a0a0f] px-2.5 py-1.5 font-mono font-black tracking-[0.04em] text-[#facc15] text-[10px]">
              <span className="text-[rgba(250,204,21,0.7)] text-[8px]">WINDOW</span>
              {formatCountdown(quota?.windowSecondsRemaining ?? 0)}
            </div>
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5">
            <div className="pt-2 pb-4">
              <p className="font-black uppercase tracking-[0.16em] text-[#84cc16] text-[10.5px]">Round Complete 🎉</p>
              <h1 className="mt-1 font-black text-white text-[22px]">Nice work!</h1>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.08)] p-3">
                <div className="font-black uppercase tracking-[0.14em] text-[#84cc16] text-[10px]">Score</div>
                <div className="mt-0.5 font-mono font-black text-[#facc15] text-[20px]">{correctAnswers}/{attempted}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{accuracy}% accuracy</div>
              </div>
              <div className="rounded-xl border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.08)] p-3">
                <div className="font-black uppercase tracking-[0.14em] text-[#84cc16] text-[10px]">Points Earned</div>
                <div className="mt-0.5 font-mono font-black text-[#facc15] text-[20px]">+{pointsWon}</div>
                {roundPointsAwarded > correctAnswers * POINTS_PER_CORRECT ? (
                  <span className="mt-0.5 inline-flex items-center rounded-full border border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.15)] px-2 py-px font-black uppercase tracking-[0.1em] text-[#facc15] text-[9px]">
                    ⚡ Challenge Bonus
                  </span>
                ) : null}
              </div>
              <div className="col-span-2 rounded-xl border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.08)] p-3">
                <div className="font-black uppercase tracking-[0.14em] text-[#84cc16] text-[10px]">Total Points</div>
                <div className="mt-0.5 font-mono font-black text-[#facc15] text-[20px]">{totalAfterRound}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">+{roundGain} this round</div>
              </div>
            </div>

            <div className="flex-1" />

            {/* Action buttons */}
            <div
              className="grid gap-2 pt-4"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
            >
              <button
                type="button"
                onMouseDown={() => triggerHaptic(14)}
                onClick={() => { void startNextRound(); }}
                disabled={isPreparingNextRound || triviaQuotaLocked}
                className={`${BUTTON_POP_CLASS} w-full rounded-[14px] bg-[#facc15] py-3.5 font-black uppercase tracking-[0.04em] text-[#0a0a0f] text-[14px] disabled:opacity-50`}
                style={{ boxShadow: "0 0 0 1px rgba(250,204,21,0.3), 0 10px 24px rgba(250,204,21,0.3)" }}
              >
                {isPreparingNextRound
                  ? "Loading next round..."
                  : triviaQuotaLocked
                  ? `Unlocks in ${formatCountdown(quotaSecondsRemaining)}`
                  : "Start Next Round"}
              </button>
              <button
                type="button"
                onMouseDown={() => triggerHaptic(14)}
                onClick={returnToVenueHome}
                className={`${BUTTON_POP_CLASS} ${BACK_TO_VENUE_CLASS} w-full`}
              >
                <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">←</span>
                Back to Venue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-transparent p-4">
        <div className="rounded-xl border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.05)] p-4 text-[12px] text-[#facc15]">
          No new trivia questions available right now.
        </div>
      </div>
    );
  }

  if (!isRoundStarted) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between gap-2 px-3.5"
            style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: "12px" }}
          >
            <button
              type="button"
              onMouseDown={() => triggerHaptic(14)}
              onClick={returnToVenueHome}
              className="tp-exit-pill tp-clean-button inline-flex items-center gap-1.5 px-3 font-black text-[12px]"
            >
              ← Venue
            </button>
            <div
              className="font-black uppercase tracking-[0.06em] text-[#facc15] text-[17px]"
              style={{ textShadow: "0 1px 0 #000, 0 0 14px rgba(250,204,21,0.5)" }}
            >
              Speed Trivia
            </div>
            <div className="flex items-center gap-1 rounded-[10px] border border-[rgba(250,204,21,0.4)] bg-[#0a0a0f] px-2.5 py-1.5 font-mono font-black tracking-[0.04em] text-[#facc15] text-[10px]">
              <span className="text-[rgba(250,204,21,0.7)] text-[8px]">WINDOW</span>
              {formatCountdown(quota?.windowSecondsRemaining ?? 0)}
            </div>
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col justify-center px-3.5">
            {roundEndedMessage ? (
              <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5">
                <p className="text-[12px] font-extrabold text-rose-400">{roundEndedMessage}</p>
              </div>
            ) : null}

            <div className="mb-6">
              <p className="font-black uppercase tracking-[0.16em] text-[#84cc16] text-[10.5px]">
                Round {upcomingRoundNumber} of {ROUND_LIMIT_PER_WINDOW}
              </p>
              <h1 className="mt-1 font-black text-white text-[24px]">Ready to start trivia?</h1>
              {triviaQuotaLocked ? (
                <p className="mt-2 text-[13px] text-rose-300">
                  Trivia limit reached. Play again in{" "}
                  <span className="font-black">{formatCountdown(quotaSecondsRemaining)}</span>.
                </p>
              ) : (
                <p className="mt-2 text-[13px] text-slate-400">
                  You have {QUESTION_TIME_LIMIT_SECONDS} seconds to answer each question.
                </p>
              )}
            </div>

            <div
              className="grid gap-2"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
            >
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
                className={`${BUTTON_POP_CLASS} w-full rounded-[14px] bg-[#facc15] py-3.5 font-black uppercase tracking-[0.04em] text-[#0a0a0f] text-[14px] disabled:opacity-50`}
                style={{ boxShadow: "0 0 0 1px rgba(250,204,21,0.3), 0 10px 24px rgba(250,204,21,0.3)" }}
              >
                {triviaQuotaLocked ? `Locked · ${formatCountdown(quotaSecondsRemaining)}` : "Yes, Start Trivia"}
              </button>
              <button
                type="button"
                onMouseDown={() => triggerHaptic(14)}
                onClick={returnToVenueHome}
                className={`${BUTTON_POP_CLASS} ${BACK_TO_VENUE_CLASS} w-full`}
              >
                <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">←</span>
                Back to Venue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (preRoundCountdown !== null) {
    return (
      <div className="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden bg-transparent text-center">
        <div className="relative z-10 px-6">
          <p className="font-black uppercase tracking-[0.12em] text-[#84cc16] text-[11px]">Get Ready</p>
          <p className="mt-1 font-black text-white text-[24px]">Round {upcomingRoundNumber}</p>
          <p
            key={`count-${preRoundCountdown}`}
            className="animate-tp-countdown-pop mt-3 font-black leading-none text-[#facc15] text-[72px]"
            style={{ textShadow: "0 0 30px rgba(250,204,21,0.6)" }}
          >
            {preRoundCountdown > 0 ? preRoundCountdown : "GO!"}
          </p>
        </div>
      </div>
    );
  }

  const timerDashOffset = Math.max(
    0,
    176 * (1 - secondsRemaining / QUESTION_TIME_LIMIT_SECONDS)
  );

  return (
    <div
      ref={gameRootRef}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent"
    >
      {/* Feedback flash overlay */}
      {feedbackFlash ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${
            feedbackFlash === "correct" ? "bg-emerald-500/35" : "bg-rose-500/35"
          }`}
        />
      ) : null}

      {/* Rain emojis */}
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

      {/* Fireworks */}
      {fireworks.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-30">
          {fireworks.map((item) => (
            <span
              key={item.id}
              className={`absolute animate-tp-rain ${item.sizeClass} font-black text-emerald-500`}
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

      {/* Main layout */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">

        {/* ─── Custom header ─── */}
        <div
          className="flex shrink-0 items-center justify-between gap-2 px-3.5"
          style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: "12px" }}
        >
          <button
            type="button"
            onMouseDown={() => triggerHaptic(14)}
            onClick={returnToVenueHome}
            className="tp-exit-pill tp-clean-button inline-flex items-center gap-1.5 px-3 font-black text-[12px]"
          >
            ← Venue
          </button>
          <div
            className="font-black uppercase tracking-[0.06em] text-[#facc15] text-[17px]"
            style={{ textShadow: "0 1px 0 #000, 0 0 14px rgba(250,204,21,0.5)" }}
          >
            Speed Trivia
          </div>
          <div
            className="flex items-center gap-1 rounded-[10px] border border-[rgba(250,204,21,0.4)] bg-[#0a0a0f] px-2.5 py-1.5 font-mono font-black tracking-[0.04em] text-[#facc15] text-[10px]"
          >
            <span className="text-[rgba(250,204,21,0.7)] text-[8px]">WINDOW</span>
            {formatCountdown(quota?.windowSecondsRemaining ?? 0)}
          </div>
        </div>

        {/* ─── Round + question counter + pip strip ─── */}
        <div className="flex shrink-0 items-center justify-between px-3.5">
          <div className="flex gap-2 font-black uppercase tracking-[0.16em] text-[10.5px]">
            <span className="text-[#84cc16]">Round {upcomingRoundNumber} / {ROUND_LIMIT_PER_WINDOW}</span>
            <span className="text-white/20">·</span>
            <span className="text-[#facc15]">Q {index + 1} / {questions.length}</span>
          </div>
          <div className="flex gap-[3px]">
            {Array.from({ length: questions.length }).map((_, i) => (
              <span
                key={i}
                className={`block h-1 w-2 rounded-sm ${
                  i < index ? "bg-[#84cc16]" : i === index ? "bg-[#facc15]" : "bg-white/10"
                }`}
              />
            ))}
          </div>
        </div>

        {triviaQuotaLocked ? (
          <p className="px-3.5 pt-1 text-[11px] font-black text-rose-300">
            Limit reached. Unlocks in {formatCountdown(quotaSecondsRemaining)}.
          </p>
        ) : null}

        {/* ─── Scrollable game area ─── */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={question.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className="flex flex-col"
            >
              {/* Question card with SVG timer ring */}
              <div className="px-3.5 pt-3.5">
                <div
                  className="relative overflow-hidden rounded-[18px] border-2 border-[rgba(250,204,21,0.55)] bg-[#0f0f17] p-4"
                  style={{ boxShadow: "0 0 0 4px rgba(250,204,21,0.1), 0 12px 30px rgba(0,0,0,0.6)" }}
                >
                  {/* Decorative corner ring */}
                  <div className="pointer-events-none absolute -right-7 -top-7 h-[110px] w-[110px] rounded-full border-[5px] border-[rgba(250,204,21,0.18)]" />

                  <div className="relative z-10 flex items-center gap-3">
                    {/* SVG timer ring */}
                    <div className="relative h-16 w-16 shrink-0">
                      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(250,204,21,0.18)" strokeWidth="5" />
                        <circle
                          cx="32" cy="32" r="28"
                          fill="none"
                          stroke={secondsRemaining <= 3 ? "#fb7185" : "#facc15"}
                          strokeWidth="5"
                          strokeDasharray="176"
                          strokeDashoffset={timerDashOffset}
                          strokeLinecap="round"
                          transform="rotate(-90 32 32)"
                        />
                      </svg>
                      <div
                        className="absolute inset-0 flex items-center justify-center font-mono font-black text-[#facc15] text-[20px]"
                        style={{ textShadow: "0 0 12px rgba(250,204,21,0.7)" }}
                      >
                        {secondsRemaining}
                        <span className="ml-px text-[9px] font-black text-[rgba(250,204,21,0.7)]">s</span>
                      </div>
                    </div>

                    {/* Question text */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        {question.category ? (
                          <span className="font-black uppercase tracking-[0.14em] text-[#84cc16] text-[10px]">
                            {question.category}
                          </span>
                        ) : null}
                        {question.difficulty ? (
                          <span className="rounded-full border border-[rgba(250,204,21,0.4)] px-1.5 py-px font-black uppercase tracking-[0.1em] text-[#facc15] text-[8px]">
                            {question.difficulty}
                          </span>
                        ) : null}
                      </div>
                      <h2
                        className="font-black leading-[1.15] text-white text-[17px]"
                        style={{ textShadow: "0 1px 0 #000" }}
                      >
                        {question.question}
                      </h2>
                    </div>
                  </div>
                </div>
              </div>

              {/* Answer buttons 2×2 grid */}
              <div
                className="grid grid-cols-2 gap-2 px-3.5 pt-3.5"
                style={{ pointerEvents: selectedAnswer !== null ? "none" : undefined }}
              >
                {question.options.map((option, optionIndex) => {
                  const isSelected = selectedAnswer === optionIndex;
                  const isRevealedCorrect = revealedCorrectAnswer === optionIndex;
                  const hasReveal = revealedCorrectAnswer !== null;
                  const isSelectedWrong = hasReveal && selectedAnswer !== null && isSelected && !isRevealedCorrect;
                  return (
                    <AnswerButton
                      key={`${question.id}-${optionIndex}`}
                      option={option}
                      optionIndex={optionIndex}
                      questionId={question.id}
                      letter={ANSWER_LETTERS[optionIndex] ?? String.fromCharCode(65 + optionIndex)}
                      selected={isSelected}
                      isRevealedCorrect={isRevealedCorrect}
                      isSelectedWrong={isSelectedWrong}
                      locked={selectedAnswer !== null || isSubmitting || secondsRemaining <= 0 || triviaQuotaLocked}
                      onChoose={(idx) => { void chooseAnswer(idx); }}
                    />
                  );
                })}
              </div>

              {/* Feedback bar */}
              {feedback ? (
                <div className="px-3.5 pt-3.5">
                  <div
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 ${
                      feedbackKind === "correct"
                        ? "border border-emerald-300/40 bg-emerald-500/10"
                        : feedbackKind === "incorrect" || feedbackKind === "timeout"
                        ? "border border-rose-400/40 bg-rose-500/10"
                        : "border border-white/10 bg-white/5"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[12px] font-extrabold leading-snug ${
                          feedbackKind === "correct"
                            ? "text-[#6ee7b7]"
                            : feedbackKind === "incorrect" || feedbackKind === "timeout"
                            ? "text-rose-300"
                            : "text-slate-300"
                        }`}
                      >
                        {feedback}
                      </div>
                      {feedbackKind === "correct" ? (
                        <div className="mt-0.5 text-[10px] font-extrabold text-slate-400">added to your profile</div>
                      ) : null}
                    </div>
                    {feedbackKind === "correct" ? (
                      <span className="shrink-0 whitespace-nowrap font-black text-[#fde68a] text-[11px]">
                        🔥 +{POINTS_PER_CORRECT} pts
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Mini scoreboard */}
              <div className="grid grid-cols-2 gap-2 px-3.5 pt-2 pb-3">
                <div className="rounded-xl border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.08)] p-3">
                  <div className="font-black uppercase tracking-[0.14em] text-[#84cc16] text-[10px]">Correct</div>
                  <div className="mt-0.5 font-mono font-black text-[#facc15] text-[14px]">{correctAnswers} / {attempted}</div>
                </div>
                <div className="rounded-xl border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.08)] p-3">
                  <div className="font-black uppercase tracking-[0.14em] text-[#84cc16] text-[10px]">Accuracy</div>
                  <div className="mt-0.5 font-mono font-black text-[#facc15] text-[14px]">{accuracy}%</div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ─── Next question button ─── */}
        <div
          className="z-40 shrink-0 px-3.5 pt-3"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
        >
          <button
            ref={nextQuestionButtonRef}
            type="button"
            onMouseDown={() => triggerHaptic(14)}
            onClick={nextQuestion}
            disabled={!canAdvanceToNextTriviaQuestion({ selectedAnswer, isSubmitting })}
            className={`${BUTTON_POP_CLASS} w-full rounded-[14px] bg-[#facc15] py-3.5 font-black uppercase tracking-[0.04em] text-[#0a0a0f] text-[14px] disabled:opacity-50`}
            style={{ boxShadow: "0 0 0 1px rgba(250,204,21,0.3), 0 10px 24px rgba(250,204,21,0.3)" }}
          >
            Next Question →
          </button>
        </div>

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
