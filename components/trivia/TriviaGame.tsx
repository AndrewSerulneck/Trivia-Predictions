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
  "transition-all duration-150 transform active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
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
  selected,
  isRevealedCorrect,
  isSelectedWrong,
  locked,
  onChoose,
}: AnswerButtonProps) {
  const controls = useAnimationControls();

  // Instantly reset scale + filter whenever the question changes.
  useEffect(() => {
    void controls.set({ scale: 1, filter: "none" });
  }, [controls, questionId]);

  // Spring-driven scale and drop-shadow effects only — color is handled by CSS classes
  // to keep background-color out of the animation engine and avoid layout conflicts.
  useEffect(() => {
    if (isRevealedCorrect) {
      let active = true;
      const seq = async () => {
        // 1 → 1.05 pop with green glow
        await controls.start({
          scale: 1.05,
          filter: "drop-shadow(0 0 14px rgba(16,185,129,0.9))",
          transition: { type: "spring", stiffness: 400, damping: 30 },
        });
        if (!active) return;
        // Settle back to 1 with a softer persistent glow
        await controls.start({
          scale: 1,
          filter: "drop-shadow(0 0 6px rgba(16,185,129,0.55))",
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
        filter: "drop-shadow(0 0 12px rgba(239,68,68,0.85))",
        transition: { type: "spring", stiffness: 400, damping: 30 },
      });
      return;
    }
    // Clear lingering effects on deselect / question reset
    void controls.start({
      scale: 1,
      filter: "none",
      transition: { duration: 0.1 },
    });
  }, [controls, isRevealedCorrect, isSelectedWrong]);

  return (
    <motion.button
      type="button"
      data-answer-token={`${questionId}-${optionIndex}`}
      animate={controls}
      // whileTap is additive on top of controls — springs back automatically
      whileTap={{ scale: 0.96, transition: { duration: 0.06 } }}
      onMouseDown={() => triggerHaptic()}
      onClick={() => onChoose(optionIndex)}
      disabled={locked}
      className={`min-h-[56px] w-full rounded-xl border-2 px-2.5 py-2 text-left text-[15px] font-bold leading-snug transition-colors duration-[80ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:min-h-[64px] sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-base disabled:opacity-80 ${
        isRevealedCorrect
          ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
          : isSelectedWrong
          ? "border-rose-400 bg-rose-500/20 text-rose-200"
          : selected
          ? "border-blue-400 bg-blue-950/40 text-blue-100"
          : "border-slate-700 bg-slate-800/80 text-slate-100 enabled:hover:border-blue-500/60 enabled:hover:bg-slate-800"
      }`}
    >
      {option}
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
      <div className="space-y-4 rounded-md border border-cyan-200/45 bg-slate-950/35 p-5 text-sm text-cyan-50 backdrop-blur-sm">
        <div className="relative mx-auto h-20 w-20">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-ht-border-soft border-t-ht-fg-primary" />
          <div className="absolute inset-2 flex items-center justify-center rounded-full bg-slate-900 text-xs font-black tracking-[0.2em] text-white">
            HC
          </div>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-ht-fg-primary">Hightop Challenge</p>
          <p>Loading trivia questions...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-ht-md border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-400">
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
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-emerald-400">+{pointsWon} points</p>
                {roundPointsAwarded > correctAnswers * POINTS_PER_CORRECT ? (
                  <span className="inline-flex items-center rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 border border-amber-400/40">
                    ⚡ Challenge
                  </span>
                ) : null}
              </div>
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
            className={`${BUTTON_POP_CLASS} inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-emerald-500/40 bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/40 disabled:opacity-60`}
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
          <p className="rounded-ht-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-400">
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
          className={`${BUTTON_POP_CLASS} inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-blue-400/60 bg-blue-500 px-3 py-2 text-base font-black text-white sm:min-h-[50px] sm:px-4 sm:py-2`}
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
      <div className="space-y-3 rounded-2xl border border-blue-400/40 bg-slate-900 p-4 text-center shadow-[0_12px_28px_rgba(15,23,42,0.45)]">
        <p className="text-sm font-black uppercase tracking-[0.12em] text-blue-300">Get Ready</p>
        <p className="text-2xl font-black text-blue-100 sm:text-3xl">
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
    <div
      ref={gameRootRef}
      className="relative flex h-full min-h-0 flex-col gap-2 overflow-hidden px-0.5"
    >
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

      <div className="rounded-xl border border-blue-400/40 bg-slate-900 p-1.5 text-blue-200 sm:rounded-2xl sm:p-2">
        <div className="flex items-center justify-between gap-2 text-sm font-black uppercase tracking-[0.08em]">
          <span>Round {upcomingRoundNumber} of {ROUND_LIMIT_PER_WINDOW}</span>
          <span>{quota?.isAdminBypass ? "Admin Unlimited" : "Live Round"}</span>
        </div>
        {triviaQuotaLocked ? (
          <p className="mt-1 text-sm font-semibold text-rose-300">
            Limit reached. Next round unlocks in {formatCountdown(quotaSecondsRemaining)}.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-blue-400/40 bg-slate-900 p-1.5 sm:rounded-2xl sm:p-2">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <span className="text-sm font-black tabular-nums text-blue-200">Q {index + 1}/{questions.length}</span>
          <span className={`text-5xl font-black tabular-nums leading-none ${secondsRemaining <= 3 ? "text-rose-400" : "text-blue-200"}`}>
            {secondsRemaining}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800 sm:mt-2 sm:h-2">
          <div
            className={`h-full rounded-full transition-all duration-300 ${secondsRemaining <= 3 ? "bg-rose-500" : "bg-blue-400"}`}
            style={{ width: `${Math.max(0, (secondsRemaining / QUESTION_TIME_LIMIT_SECONDS) * 100)}%` }}
          />
        </div>
      </div>

      {/* relative + overflow-y-auto — the popLayout exit uses position:absolute so no height jitter */}
      <div className="relative min-h-0 flex flex-1 flex-col overflow-y-auto pr-0.5">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={question.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
            className="flex flex-col gap-2 pb-2 sm:gap-3"
          >
            <div className="min-h-[1.5rem] sm:min-h-[1.75rem]">
              {showRewardPulse ? (
                <p className="tp-pop-in px-0.5 text-sm font-black text-cyan-100">{rewardPulse}</p>
              ) : null}
            </div>
            <h2 className="px-0.5 text-base font-black leading-snug text-white [text-shadow:0_1px_0_rgba(2,6,23,0.7),0_0_12px_rgba(255,255,255,0.24)] sm:text-xl">
              {question.question}
            </h2>
            {/* pointer-events:none fires the instant selectedAnswer is set — no re-render lag */}
            <div
              className="grid grid-cols-1 gap-2 sm:gap-3"
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
                    selected={isSelected}
                    isRevealedCorrect={isRevealedCorrect}
                    isSelectedWrong={isSelectedWrong}
                    locked={selectedAnswer !== null || isSubmitting || secondsRemaining <= 0 || triviaQuotaLocked}
                    onChoose={(idx) => { void chooseAnswer(idx); }}
                  />
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="z-40 mt-auto shrink-0 space-y-1.5 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 sm:space-y-2">
        <div className="relative h-10 sm:h-11">
          {feedback ? (
            <p
              className={`absolute inset-x-0 top-0 overflow-hidden text-ellipsis whitespace-nowrap px-0.5 text-sm font-black leading-snug ${
                feedbackKind === "correct"
                  ? "text-emerald-200"
                  : feedbackKind === "incorrect" || feedbackKind === "timeout"
                  ? "text-rose-200"
                  : "text-cyan-100"
              }`}
            >
              {feedback}
            </p>
          ) : null}
        </div>

        <button
          ref={nextQuestionButtonRef}
          type="button"
          onMouseDown={() => triggerHaptic(14)}
          onClick={nextQuestion}
          disabled={!canAdvanceToNextTriviaQuestion({ selectedAnswer, isSubmitting })}
          className={`${BUTTON_POP_CLASS} inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-blue-400/60 bg-blue-500 px-3 py-2 text-base font-black text-white sm:min-h-[50px] sm:rounded-2xl sm:px-4 sm:py-2.5 disabled:opacity-60`}
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
