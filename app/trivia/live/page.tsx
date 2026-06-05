"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { getUserId, getVenueId, getUsername } from "@/lib/storage";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import {
  resolveLiveTriviaVenueContext,
  type LiveTriviaVenueSource,
} from "@/lib/liveTriviaClientState";
import {
  selectLiveShowdownComment,
  type LiveShowdownCommentTrigger,
} from "@/lib/liveShowdownComments";
import { ReadyPrompt } from "@/components/trivia/ReadyPrompt";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";

type Phase = "answering" | "rest_warning" | "mid_game_break" | "pre_game";

type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  roundPoints: Record<number, number>;
  totalPoints: number;
  pointsThisRound: number;
};

type ViewerRoundSummary = {
  roundNumber: number;
  category: string | null;
  correctCount: number;
  totalAnswered: number;
  points: number;
};

type LiveState = {
  isGameActive: boolean;
  activePhase: Phase;
  secondsRemaining: number;
  totalRounds: number;
  currentRound: number | null;
  currentQuestionIndex: number | null;
  revealedAnswer: string | null;
  emceeAnnouncement: string | null;
  viewerResult?: {
    userId: string;
    scheduleId: string;
    roundNumber: number;
    questionIndex: number;
    submittedAnswer: string;
    isCorrect: boolean;
    pointsAwarded: number;
    pendingClosestGuess: boolean;
  } | null;
  scheduleId?: string;
  scheduleTitle?: string;
  scheduleTimezone?: string;
  venueName?: string | null;
  intermissionAdDelaySeconds?: number;
  lobbyAdEnabled?: boolean;
  currentRoundCategory?: string | null;
  upcomingRoundNumber?: number | null;
  upcomingRoundCategory?: string | null;
  leaderboard?: LeaderboardEntry[] | null;
  viewerRank?: number | null;
  viewerRoundByRound?: ViewerRoundSummary[] | null;
  nextSchedule?: {
    id: string;
    title: string;
    startTime: string;
    timezone: string;
    numRounds: number;
    intermissionAdDelaySeconds?: number;
    lobbyAdEnabled?: boolean;
    firstRoundCategory?: string | null;
  } | null;
  activeQuestion: {
    questionId?: string;
    question: string;
    options: string[];
    category?: string | null;
    isClosestGuess?: boolean;
  } | null;
};

type PopupAd = {
  id: string;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  advertiserName: string;
};

type SubmissionResult = {
  isCorrect: boolean;
  forfeited?: boolean;
  submittedAnswer?: string;
  pendingClosestGuess?: boolean;
};

type FeedbackState =
  | "right"
  | "wrong"
  | "pending_closest_guess"
  | "unsubmitted_late_joiner"
  | "unsubmitted_inactive";

const RULE_LINES = [
  "30 seconds to type your answer.",
  "15 seconds between questions.",
  "Correct answers award +10 points.",
  "If the answer is a number, and no one gets it right, the closest guess wins 10 points.",
  "New players can join any time.",
  "Do not close your browser or switch tabs during live play.",
  "If you wish to leave the game, click 'Back to Home Page' any time.",
  "Click 'Join Live Trivia!' to enter the lobby."
];

const QUESTIONS_PER_ROUND = 15;
const SHOULD_DEBUG_LIVE_TRIVIA = process.env.NODE_ENV !== "production";

function debugLiveTrivia(message: string, details: Record<string, unknown>) {
  if (!SHOULD_DEBUG_LIVE_TRIVIA) return;
  console.info(`[live-trivia][live-page] ${message}`, details);
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toLiveIntermissionVariant(roundNumber: number): number {
  const safeRound = Math.max(1, Math.floor(roundNumber));
  return ((safeRound - 1) % 12) + 1;
}

// Derives each player's rank change vs the standings as of the previous round
// (positive = moved up). Computed from the displayed entries' round points, so it
// is approximate when players sit outside the returned set.
function computeRankMovement(entries: LeaderboardEntry[]): Map<string, number> {
  const previousRankByUser = new Map<string, number>();
  const previousStandings = entries
    .map((entry) => ({ userId: entry.userId, previousTotal: entry.totalPoints - entry.pointsThisRound }))
    .sort((a, b) => b.previousTotal - a.previousTotal);

  let previousPoints: number | null = null;
  let previousRank = 0;
  previousStandings.forEach((entry, index) => {
    const rank = previousPoints !== null && entry.previousTotal === previousPoints ? previousRank : index + 1;
    previousPoints = entry.previousTotal;
    previousRank = rank;
    previousRankByUser.set(entry.userId, rank);
  });

  const movement = new Map<string, number>();
  for (const entry of entries) {
    const before = previousRankByUser.get(entry.userId);
    if (before != null) movement.set(entry.userId, before - entry.rank);
  }
  return movement;
}

const RankBadge = ({ rank }: { rank: number }) => {
  const palette =
    rank === 1
      ? "bg-amber-400 text-slate-900"
      : rank === 2
      ? "bg-slate-300 text-slate-900"
      : rank === 3
      ? "bg-amber-700 text-amber-50"
      : "bg-slate-700 text-slate-300";
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm font-black tabular-nums ${palette}`}
    >
      {rank}
    </span>
  );
};

export default function LiveShowdownPage() {
  const searchParams = useSearchParams();
  const { triggerAnimation } = useAnimationTrigger();
  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [submittedKey, setSubmittedKey] = useState("");
  const [forfeitKey, setForfeitKey] = useState("");
  // Retain the last known leaderboard so the post-game screen can show Final
  // Standings even after the engine stops returning leaderboard data.
  const [savedLeaderboard, setSavedLeaderboard] = useState<typeof state extends null ? never : NonNullable<typeof state>["leaderboard"]>(null);
  const [savedViewerRank, setSavedViewerRank] = useState<number | null>(null);
  const [savedViewerRoundByRound, setSavedViewerRoundByRound] = useState<typeof state extends null ? never : NonNullable<typeof state>["viewerRoundByRound"]>(null);
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultByKey, setResultByKey] = useState<Record<string, SubmissionResult>>({});
  const [rulesVisibleCount, setRulesVisibleCount] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [commentEventKey, setCommentEventKey] = useState("");
  const [commentText, setCommentText] = useState("");
  const [popupAd, setPopupAd] = useState<PopupAd | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [hasJoinedSession, setHasJoinedSession] = useState(false);
  const [joinState, setJoinState] = useState<"pending_onboarding" | "spectating_active_block" | "active_participant">(
    "pending_onboarding"
  );
  const [spectatingBlockKey, setSpectatingBlockKey] = useState("");
  const [participatingQuestionKeys, setParticipatingQuestionKeys] = useState<Record<string, true>>({});
  const forfeitInFlight = useRef(false);
  const joinedScheduleRef = useRef("");
  const intermissionAdKeyRef = useRef("");
  const intermissionAdTimerRef = useRef<number | null>(null);
  const lobbyAdKeyRef = useRef("");
  // Refs used by the stable forfeit listener so it never re-mounts and never
  // clears the 2-second grace timer when the 1-second poll fires a re-render.
  const forfeitKeyRef = useRef("");
  const activeKeyRef = useRef("");
  const submitRef = useRef<(submittedAnswer: string, isForfeit?: boolean) => Promise<void>>(
    () => Promise.resolve()
  );
  const forfeitEligibleRef = useRef(false);
  // Tracks whether the user is in any spectating state so submit() and the
  // forfeit path can gate on it without reading React state from a stale closure.
  const spectatingRef = useRef(false);
  const [fetchFailureCategory, setFetchFailureCategory] = useState<
    "missing_venue" | "network" | "non_ok_payload" | "missing_fields" | "invalid_date" | null
  >(null);
  const venueIdFromUrl = String(searchParams?.get("venueId") ?? "").trim();
  const storedVenueId = String(getVenueId() ?? "").trim();
  const venueContext = resolveLiveTriviaVenueContext({
    routeVenueId: venueIdFromUrl,
    storedVenueId,
  });
  const resolvedVenueId = venueContext.venueId;
  const resolvedVenueSource: LiveTriviaVenueSource = venueContext.source;
  const answerInputRef = useRef<HTMLInputElement>(null);

  const activeKey = useMemo(() => {
    if (!state?.isGameActive || !state.scheduleId || !state.currentRound || !state.currentQuestionIndex) return "";
    return `${state.scheduleId}:${state.currentRound}:${state.currentQuestionIndex}`;
  }, [state]);

  const isPostGame = Boolean(
    hasOnboarded &&
    !state?.isGameActive &&
    Object.keys(participatingQuestionKeys).length > 0
  );

  const postGameStats = useMemo(() => {
    const keys = Object.keys(participatingQuestionKeys);
    if (keys.length === 0) return null;
    let correct = 0;
    let streak = 0;
    let bestStreak = 0;
    const byRound: Record<number, { correct: number; total: number }> = {};
    for (const key of keys) {
      const parts = key.split(":");
      const round = Number(parts[parts.length - 2]);
      const result = resultByKey[key];
      const isCorrect = Boolean(result?.isCorrect) && !result?.forfeited;
      if (isCorrect) { correct++; streak++; bestStreak = Math.max(bestStreak, streak); }
      else { streak = 0; }
      if (Number.isFinite(round)) {
        byRound[round] = byRound[round] ?? { correct: 0, total: 0 };
        byRound[round].total++;
        if (isCorrect) byRound[round].correct++;
      }
    }
    return {
      total: keys.length,
      correct,
      correctRate: keys.length > 0 ? Math.round((correct / keys.length) * 100) : 0,
      bestStreak,
      byRound,
    };
  }, [participatingQuestionKeys, resultByKey]);

  // Rank movement is only meaningful once at least one full round precedes the
  // round that just completed.
  const rankMovement = useMemo(() => {
    if ((state?.currentRound ?? 0) < 2) return new Map<string, number>();
    return computeRankMovement(state?.leaderboard ?? []);
  }, [state?.leaderboard, state?.currentRound]);
  const viewerId = (getUserId() ?? "").trim();

  // Post-game standings derived from the venue leaderboard + viewer recap.
  // Falls back to the last saved leaderboard when state no longer carries live data.
  const postGameLeaderboard = useMemo(() => {
    const board = (state?.leaderboard && state.leaderboard.length > 0 ? state.leaderboard : savedLeaderboard) ?? null;
    if (!board || board.length === 0) return null;

    const champion = board[0] ?? null;
    const podium = board.slice(0, 3);

    const rounds = (state?.viewerRoundByRound ?? savedViewerRoundByRound) ?? [];
    const totalCorrect = rounds.reduce((sum, round) => sum + round.correctCount, 0);
    const totalAnswered = rounds.reduce((sum, round) => sum + round.totalAnswered, 0);
    const correctRate = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    // Rank gained = standings as of round 1 vs. final rank (positive = climbed).
    // Approximate: round-1 standing is computed among the returned (top) entries.
    let rankGained: number | null = null;
    const finalRank = (state?.viewerRank ?? savedViewerRank) ?? null;
    const viewerEntry = viewerId ? board.find((entry) => entry.userId === viewerId) : null;
    if (finalRank != null && viewerEntry) {
      const viewerRoundOne = viewerEntry.roundPoints[1] ?? 0;
      const aheadAtRoundOne = board.filter((entry) => (entry.roundPoints[1] ?? 0) > viewerRoundOne).length;
      rankGained = aheadAtRoundOne + 1 - finalRank;
    }

    // Viewer's total score: prefer leaderboard entry; fall back to summing round-by-round.
    const viewerScore =
      viewerEntry?.totalPoints ??
      rounds.reduce((sum, r) => sum + r.points, 0);

    const isChampion = Boolean(viewerId && champion?.userId === viewerId);

    return { champion, podium, totalCorrect, totalAnswered, correctRate, rankGained, viewerEntry, viewerScore, isChampion };
  }, [state?.leaderboard, state?.viewerRoundByRound, state?.viewerRank, viewerId, savedLeaderboard, savedViewerRank, savedViewerRoundByRound]);

  const isPreGameLobby = Boolean(hasOnboarded && !isPostGame && (!state?.isGameActive || state?.activePhase === "pre_game"));
  const isSpectatingActiveBlock = Boolean(
    hasOnboarded &&
      spectatingBlockKey &&
      state?.isGameActive &&
      activeKey &&
      spectatingBlockKey === activeKey
  );

  useEffect(() => {
    setForfeitKey("");
    setSubmitMessage("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("live_showdown_forfeited");
      window.localStorage.removeItem("liveTriviaForfeit");
      window.localStorage.removeItem("tp_live_showdown_forfeit");
    }
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    debugLiveTrivia("resolved_venue_context", {
      resolvedVenueId: resolvedVenueId || null,
      source: resolvedVenueSource,
      routeVenueId: venueIdFromUrl || null,
      storedVenueId: storedVenueId || null,
    });
  }, [resolvedVenueId, resolvedVenueSource, storedVenueId, venueIdFromUrl]);

  const fetchState = useCallback(async () => {
    let failureReason: "missing_venue" | "network" | "non_ok_payload" | "missing_fields" | "invalid_date" | null = null;
    if (!resolvedVenueId) {
      setState(null);
      setLoading(false);
      failureReason = "missing_venue";
      setFetchFailureCategory(failureReason);
      setError("Venue session not found. Return to your venue page and rejoin Live Trivia.");
      debugLiveTrivia("state_fetch_skipped", {
        reason: failureReason,
        resolvedVenueId: null,
      });
      return;
    }

    try {
      const userId = String(getUserId() ?? "").trim();
      const params = new URLSearchParams();
      if (resolvedVenueId) params.set("venueId", resolvedVenueId);
      if (userId) params.set("userId", userId);
      const query = params.size > 0 ? `?${params.toString()}` : "";
      const response = await fetch(`/api/trivia/live/state${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; state?: LiveState; error?: string };
      if (!payload.ok) {
        failureReason = "non_ok_payload";
        setFetchFailureCategory(failureReason);
        debugLiveTrivia("state_fetch_failed", {
          reason: failureReason,
          resolvedVenueId,
          ok: payload.ok,
          error: payload.error ?? null,
        });
        throw new Error(payload.error || "Failed to sync live state.");
      }
      if (!payload.state) {
        failureReason = "missing_fields";
        setFetchFailureCategory(failureReason);
        debugLiveTrivia("state_fetch_failed", {
          reason: failureReason,
          resolvedVenueId,
          ok: payload.ok,
        });
        throw new Error("Live Trivia state response is missing required data.");
      }
      const nextStartTimeRaw = String(payload.state.nextSchedule?.startTime ?? "").trim();
      if (nextStartTimeRaw && !Number.isFinite(Date.parse(nextStartTimeRaw))) {
        failureReason = "invalid_date";
        setFetchFailureCategory(failureReason);
        debugLiveTrivia("state_fetch_failed", {
          reason: failureReason,
          resolvedVenueId,
          nextStartTime: nextStartTimeRaw,
        });
        throw new Error("Live Trivia schedule data is invalid. Please retry from your venue page.");
      }

      debugLiveTrivia("state_summary", {
        ok: payload.ok,
        resolvedVenueId,
        source: resolvedVenueSource,
        isGameActive: payload.state.isGameActive,
        hasNextSchedule: Boolean(payload.state.nextSchedule),
        nextStartTime: nextStartTimeRaw || null,
      });

      setState(payload.state);
      setFetchFailureCategory(null);
      const viewerResult = payload.state.viewerResult;
      if (
        viewerResult &&
        viewerResult.scheduleId &&
        Number.isFinite(viewerResult.roundNumber) &&
        Number.isFinite(viewerResult.questionIndex)
      ) {
        const viewerKey = `${viewerResult.scheduleId}:${viewerResult.roundNumber}:${viewerResult.questionIndex}`;
        setResultByKey((current) => ({
          ...current,
          [viewerKey]: {
            isCorrect: Boolean(viewerResult.isCorrect),
            submittedAnswer: viewerResult.submittedAnswer,
            pendingClosestGuess: Boolean(viewerResult.pendingClosestGuess),
          },
        }));
      }
      setIsEngineReady(true);
      setError("");
    } catch (e) {
      const reason = failureReason ?? "network";
      setFetchFailureCategory(reason);
      debugLiveTrivia("state_fetch_failed", {
        reason,
        resolvedVenueId: resolvedVenueId || null,
        error: e instanceof Error ? e.message : "unknown",
      });
      setError(e instanceof Error ? e.message : "Failed to sync live state.");
    } finally {
      setLoading(false);
    }
  }, [resolvedVenueId, resolvedVenueSource]);

  const loadPopupAd = useCallback(async (options: { displayTrigger: "on-load" | "round-end"; roundNumber?: number }) => {
    const venueId = resolvedVenueId;
    const params = new URLSearchParams({
      slot: "popup-on-entry",
      pageKey: "live-trivia",
      adType: "popup",
      displayTrigger: options.displayTrigger,
    });
    if (venueId) {
      params.set("venueId", venueId);
    }
    if (Number.isFinite(options.roundNumber)) {
      params.set("roundNumber", String(Math.floor(Number(options.roundNumber))));
    }
    const response = await fetch(`/api/ads/slot?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json()) as {
      ok: boolean;
      ad?: PopupAd | null;
      error?: string;
    };
    if (!payload.ok) {
      throw new Error(payload.error ?? "Failed to load ad slot.");
    }
    return payload.ad ?? null;
  }, [resolvedVenueId]);

  // When the game is inactive (idle / upcoming), poll infrequently — the
  // countdown is kept smooth by a local ticker below, not by server fetches.
  // When a game is active, poll every 1 second for live game state.
  const isGameActive = Boolean(state?.isGameActive);
  useEffect(() => {
    void fetchState();
    const intervalMs = isGameActive ? 1000 : 15_000;
    const timer = window.setInterval(() => void fetchState(), intervalMs);
    return () => window.clearInterval(timer);
  }, [fetchState, isGameActive]);

  // Local countdown state: derives secondsRemaining from the known
  // nextSchedule.startTime so the countdown stays smooth between server fetches.
  const [localSecondsRemaining, setLocalSecondsRemaining] = useState<number>(0);

  // Seed localSecondsRemaining from the server state whenever it arrives.
  useEffect(() => {
    if (!state) return;
    if (state.isGameActive) {
      // Active game: local countdown not used for pre-game display, no seeding needed.
      return;
    }
    const startTimeRaw = state.nextSchedule?.startTime ?? "";
    if (!startTimeRaw) {
      setLocalSecondsRemaining(state.secondsRemaining);
      return;
    }
    const startMs = Date.parse(startTimeRaw);
    if (!Number.isFinite(startMs)) {
      setLocalSecondsRemaining(state.secondsRemaining);
      return;
    }
    setLocalSecondsRemaining(Math.max(0, Math.ceil((startMs - Date.now()) / 1000)));
  }, [state]);

  // Tick the local countdown every second when no game is active so the
  // display stays smooth even with the 15-second server poll.
  useEffect(() => {
    if (isGameActive) return;
    const ticker = window.setInterval(() => {
      setLocalSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(ticker);
  }, [isGameActive]);

  // When the countdown reaches zero and the game still hasn't started (because
  // the main polling interval is slow at 15s during pre-game), switch to
  // aggressive 1-second fetches for up to 10 seconds so lobby players see the
  // first question within ~1 second of game start rather than up to 15 seconds.
  useEffect(() => {
    if (isGameActive) return;
    if (localSecondsRemaining > 10) return;
    if (!state?.nextSchedule) return;

    void fetchState();
    let elapsed = 0;
    const booster = window.setInterval(() => {
      elapsed += 1;
      if (elapsed >= 10) {
        window.clearInterval(booster);
        return;
      }
      void fetchState();
    }, 1000);
    return () => window.clearInterval(booster);
  }, [fetchState, isGameActive, localSecondsRemaining, state?.nextSchedule]);

  useEffect(() => {
    setAnswer("");
    setSubmitMessage("");
  }, [activeKey]);

  // Clear forfeit as soon as the answering phase ends (answer is revealed).
  // This unlocks the screen and dismisses the forfeit modal during rest_warning,
  // rather than making the user wait until the next question arrives.
  useEffect(() => {
    if (state?.isGameActive && state.activePhase !== "answering") {
      setForfeitKey("");
    }
  }, [state?.activePhase, state?.isGameActive]);

  // Persist leaderboard data so the post-game screen can display Final Standings
  // even after the engine stops returning live leaderboard state.
  useEffect(() => {
    if (state?.leaderboard && state.leaderboard.length > 0) {
      setSavedLeaderboard(state.leaderboard);
    }
    if (state?.viewerRank != null) setSavedViewerRank(state.viewerRank);
    if (state?.viewerRoundByRound && state.viewerRoundByRound.length > 0) {
      setSavedViewerRoundByRound(state.viewerRoundByRound);
    }
  }, [state?.leaderboard, state?.viewerRank, state?.viewerRoundByRound]);

  // Auto-focus the answer input whenever a new question becomes active.
  // If the input isn't rendered (non-answering phase), the ref is null and this is a no-op.
  useEffect(() => {
    if (!activeKey) return;
    const frame = requestAnimationFrame(() => {
      answerInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeKey]);

  useEffect(() => {
    if (!state?.isGameActive || state.activePhase !== "answering" || !activeKey) return;
    setCommentEventKey("");
    setCommentText("");
  }, [activeKey, state?.activePhase, state?.isGameActive]);

  useEffect(() => {
    if (!spectatingBlockKey) return;
    // Keep spectating only while the exact same question is still active.
    // When activeKey goes empty (mid_game_break, game over, etc.) OR a new
    // question arrives, exit spectating so the correct screen can render.
    if (activeKey && activeKey === spectatingBlockKey) return;
    setSpectatingBlockKey("");
    setJoinState("active_participant");
  }, [activeKey, spectatingBlockKey]);

  useEffect(() => {
    if (!hasOnboarded || !hasJoinedSession) return;
    if (!state?.isGameActive || state.activePhase !== "answering" || !activeKey || isSpectatingActiveBlock) return;
    setParticipatingQuestionKeys((current) => {
      if (current[activeKey]) return current;
      return { ...current, [activeKey]: true };
    });
  }, [activeKey, hasJoinedSession, hasOnboarded, isSpectatingActiveBlock, state]);

  useEffect(() => {
    if (!state?.isGameActive || !state.scheduleId) {
      joinedScheduleRef.current = "";
      setHasJoinedSession(false);
      setForfeitKey("");
      intermissionAdKeyRef.current = "";
      lobbyAdKeyRef.current = "";
      if (intermissionAdTimerRef.current !== null) {
        window.clearTimeout(intermissionAdTimerRef.current);
        intermissionAdTimerRef.current = null;
      }
      return;
    }

    if (joinedScheduleRef.current && state.scheduleId && joinedScheduleRef.current !== state.scheduleId) {
      // A genuinely new game started — clear prior session so keys don't bleed across games.
      joinedScheduleRef.current = "";
      setHasJoinedSession(false);
      setParticipatingQuestionKeys({});
    }

    if (
      hasOnboarded &&
      !isSpectatingActiveBlock &&
      isEngineReady &&
      state.activePhase === "answering" &&
      activeKey &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    ) {
      if (joinedScheduleRef.current !== state.scheduleId) {
        setParticipatingQuestionKeys({});
      }
      joinedScheduleRef.current = state.scheduleId;
      setHasJoinedSession(true);
      setJoinState("active_participant");
    }
  }, [activeKey, hasOnboarded, isEngineReady, isSpectatingActiveBlock, state]);

  useEffect(() => {
    if (!state?.isGameActive || state.activePhase !== "mid_game_break" || !state.scheduleId || !state.currentRound) {
      if (intermissionAdTimerRef.current !== null) {
        window.clearTimeout(intermissionAdTimerRef.current);
        intermissionAdTimerRef.current = null;
      }
      return;
    }
    if (state.currentRound >= state.totalRounds) {
      return;
    }

    const currentRound = Number(state.currentRound);
    if (!Number.isFinite(currentRound) || currentRound < 1) {
      return;
    }
    const adEventKey = `${state.scheduleId}:${currentRound}`;
    if (intermissionAdKeyRef.current === adEventKey) {
      return;
    }

    const delaySeconds = Math.max(
      0,
      Math.min(300, Math.floor(Number(state.intermissionAdDelaySeconds ?? 10)))
    );

    intermissionAdKeyRef.current = adEventKey;
    intermissionAdTimerRef.current = window.setTimeout(() => {
      const variantRound = toLiveIntermissionVariant(currentRound);
      window.dispatchEvent(
        new CustomEvent("tp:trivia-round-banner", {
          detail: { pageKey: "live-trivia", roundNumber: variantRound },
        })
      );
      void loadPopupAd({ displayTrigger: "round-end", roundNumber: variantRound })
        .then((ad) => {
          if (ad) {
            setPopupAd(ad);
          }
        })
        .catch(() => undefined);
    }, delaySeconds * 1000);

    return () => {
      if (intermissionAdTimerRef.current !== null) {
        window.clearTimeout(intermissionAdTimerRef.current);
        intermissionAdTimerRef.current = null;
      }
    };
  }, [
    loadPopupAd,
    state?.activePhase,
    state?.currentRound,
    state?.intermissionAdDelaySeconds,
    state?.isGameActive,
    state?.scheduleId,
    state?.totalRounds,
  ]);

  useEffect(() => {
    if (!hasOnboarded || state?.isGameActive || !state?.nextSchedule?.id) {
      return;
    }
    if (state.nextSchedule.lobbyAdEnabled === false) {
      return;
    }

    const nextScheduleKey = state.nextSchedule.id;
    if (lobbyAdKeyRef.current === nextScheduleKey) {
      return;
    }

    lobbyAdKeyRef.current = nextScheduleKey;
    void loadPopupAd({ displayTrigger: "on-load" })
      .then((ad) => {
        if (ad) {
          setPopupAd(ad);
        }
      })
      .catch(() => undefined);
  }, [hasOnboarded, loadPopupAd, state?.isGameActive, state?.nextSchedule]);

  useEffect(() => {
    if (!hasOnboarded) {
      setRulesVisibleCount(0);
      setParticipatingQuestionKeys({});
      const id = window.setInterval(() => {
        setRulesVisibleCount((current) => {
          if (current >= RULE_LINES.length) return current;
          return current + 1;
        });
      }, 900);
      return () => window.clearInterval(id);
    }
    setRulesVisibleCount(0);
    return undefined;
  }, [hasOnboarded]);

  const submit = useCallback(
    async (submittedAnswer: string, isForfeit = false) => {
      // Explicit spectator guard — do not submit answers or forfeits on behalf of spectators.
      // This is intentional, not just inferred from disabled button state.
      if (spectatingRef.current) return;
      if (!state?.isGameActive || !state.scheduleId || !state.currentRound || !state.currentQuestionIndex) return;
      const userId = (getUserId() ?? "").trim();
      const venueId = resolvedVenueId;
      if (!userId) {
        setSubmitMessage("Join a venue first.");
        return;
      }
      if (!venueId) {
        setSubmitMessage("Venue session not found. Rejoin your venue.");
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await fetch("/api/trivia/live/submit-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            venueId,
            scheduleId: state.scheduleId,
            roundNumber: state.currentRound,
            questionIndex: state.currentQuestionIndex,
            submittedAnswer,
          }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          result?: { isCorrect: boolean; alreadySubmitted?: boolean; pendingClosestGuess?: boolean };
        };
        if (!payload.ok || !payload.result) throw new Error(payload.error || "Submission failed.");

        const nextResult: SubmissionResult = {
          isCorrect: isForfeit ? false : Boolean(payload.result.isCorrect),
          forfeited: isForfeit,
          submittedAnswer,
          pendingClosestGuess: Boolean(payload.result.pendingClosestGuess),
        };
        setResultByKey((current) => ({ ...current, [activeKey]: nextResult }));

        if (isForfeit) {
          setSubmitMessage("Forfeited Question. No closing your browser or changing tabs during Live Trivia!");
        } else {
          setSubmittedKey(activeKey);
        }
      } catch (e) {
        setSubmitMessage(e instanceof Error ? e.message : "Submission failed.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeKey, resolvedVenueId, state, triggerAnimation]
  );

  // Keep refs in sync so the stable forfeit listener always reads the freshest
  // values without re-mounting (and cancelling the grace timer) on every 1-second poll.
  useEffect(() => { forfeitKeyRef.current = forfeitKey; }, [forfeitKey]);
  useEffect(() => { activeKeyRef.current = activeKey; }, [activeKey]);
  useEffect(() => { submitRef.current = submit; }, [submit]);
  useEffect(() => {
    // Covers both the narrow isSpectatingActiveBlock window (activeKey matches) and
    // the joinState that persists briefly after activeKey goes empty.
    spectatingRef.current = isSpectatingActiveBlock || joinState === "spectating_active_block";
  }, [isSpectatingActiveBlock, joinState]);
  useEffect(() => {
    forfeitEligibleRef.current =
      Boolean(state?.isGameActive) &&
      state?.activePhase === "answering" &&
      Boolean(activeKey) &&
      hasOnboarded &&
      isEngineReady &&
      hasJoinedSession &&
      !isSpectatingActiveBlock &&
      joinState !== "spectating_active_block" &&
      !isPreGameLobby &&
      forfeitKey !== activeKey;
  }, [activeKey, forfeitKey, hasJoinedSession, hasOnboarded, isEngineReady, isPreGameLobby, isSpectatingActiveBlock, joinState, state]);

  // Stable visibilitychange listener — registered once on mount, never torn down
  // by poll cycles. All live values are read from refs so the 2-second grace timer
  // survives re-renders triggered by the 1-second state poll.
  useEffect(() => {
    let forfeitTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerForfeit = () => {
      const key = activeKeyRef.current;
      if (forfeitInFlight.current || forfeitKeyRef.current === key || !key) return;
      forfeitInFlight.current = true;
      setForfeitKey(key);
      void submitRef.current("__FORFEIT__", true).finally(() => {
        forfeitInFlight.current = false;
      });
    };

    const scheduleForfeit = () => {
      if (forfeitTimer !== null || forfeitInFlight.current) return;
      // 2-second grace — accidental notification-shade swipes won't immediately forfeit.
      forfeitTimer = setTimeout(() => {
        forfeitTimer = null;
        if (forfeitEligibleRef.current) triggerForfeit();
      }, 2000);
    };

    const cancelForfeit = () => {
      if (forfeitTimer !== null) {
        clearTimeout(forfeitTimer);
        forfeitTimer = null;
      }
    };

    const onVisibility = () => {
      if (!forfeitEligibleRef.current) {
        cancelForfeit();
        return;
      }
      if (document.visibilityState !== "visible") {
        scheduleForfeit();
      } else {
        cancelForfeit();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelForfeit();
    };
  }, []);

  const goHome = useCallback(async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    const venueId = resolvedVenueId;
    const fallbackPath = venueId ? `/venue/${encodeURIComponent(venueId)}` : "/";
    await navigateBackToVenue({
      venuePath: fallbackPath,
      fallbackNavigate: () => {
        window.location.href = fallbackPath;
      },
    });
  }, [isLeaving, resolvedVenueId]);

  const nextCommentEvent = useMemo((): { key: string; trigger: LiveShowdownCommentTrigger } | null => {
    if (!hasOnboarded) return null;
    if (isSpectatingActiveBlock) return null;
    if (!state) return null;

    if (!state.isGameActive) {
      return {
        key: `pregame:${state.nextSchedule?.id ?? "none"}`,
        trigger: "pregame_intro",
      };
    }

    if (state.activePhase === "answering" && state.currentQuestionIndex === 1 && state.scheduleId && state.currentRound) {
      return {
        key: `round_start:${state.scheduleId}:${state.currentRound}`,
        trigger: "round_start",
      };
    }

    if (state.activePhase === "rest_warning" && activeKey) {
      const result = resultByKey[activeKey];
      if (!result) {
        const wasParticipatingForThisQuestion = Boolean(participatingQuestionKeys[activeKey]);
        return {
          key: `answer_eval:${activeKey}:${wasParticipatingForThisQuestion ? "inactive" : "late_joiner"}`,
          trigger: wasParticipatingForThisQuestion ? "answer_unsubmitted_inactive" : "answer_unsubmitted_late_joiner",
        };
      }
      if (result.pendingClosestGuess) {
        return {
          key: `answer_eval:${activeKey}:closest_guess_pending`,
          trigger: "closest_guess_pending",
        };
      }
      const isCorrect = Boolean(result.isCorrect);

      // Final question of the game takes priority
      if (state.currentRound === state.totalRounds && state.currentQuestionIndex === 15) {
        return {
          key: `answer_eval:${activeKey}:final_question`,
          trigger: "game_final_question",
        };
      }

      // Scoring streak: 3+ correct in a row within the round
      if (isCorrect && state.scheduleId && state.currentRound && state.currentQuestionIndex) {
        let streak = 0;
        for (let qi = state.currentQuestionIndex; qi >= 1; qi--) {
          const r = resultByKey[`${state.scheduleId}:${state.currentRound}:${qi}`];
          if (!r?.isCorrect) break;
          streak++;
        }
        if (streak >= 3) {
          return {
            key: `answer_eval:${activeKey}:streak:${streak}`,
            trigger: "scoring_streak",
          };
        }
      }

      return {
        key: `answer_eval:${activeKey}:${isCorrect ? "correct" : "incorrect"}`,
        trigger: isCorrect ? "answer_correct" : "answer_incorrect",
      };
    }

    if (state.activePhase === "mid_game_break" && state.scheduleId && state.currentRound) {
      return {
        key: `round_break:${state.scheduleId}:${state.currentRound}`,
        trigger: "round_break",
      };
    }

    return null;
  }, [activeKey, hasOnboarded, isSpectatingActiveBlock, participatingQuestionKeys, resultByKey, state]);

  useEffect(() => {
    if (!nextCommentEvent) return;
    if (nextCommentEvent.key === commentEventKey) return;

    setCommentEventKey(nextCommentEvent.key);
    setCommentText(
      selectLiveShowdownComment({
        trigger: nextCommentEvent.trigger,
        eventKey: nextCommentEvent.key,
      })
    );
    if (nextCommentEvent.trigger === "scoring_streak") {
      triggerAnimation("LIVE_TRIVIA_STREAK");
    } else if (
      nextCommentEvent.trigger === "answer_correct" ||
      nextCommentEvent.trigger === "answer_incorrect"
    ) {
      if (correctWrongFiredForKeyRef.current !== activeKey) {
        correctWrongFiredForKeyRef.current = activeKey ?? null;
        triggerAnimation(
          nextCommentEvent.trigger === "answer_correct" ? "LIVE_TRIVIA_CORRECT" : "LIVE_TRIVIA_WRONG"
        );
      }
    }
  }, [commentEventKey, nextCommentEvent, triggerAnimation]);

  const correctWrongFiredForKeyRef = useRef<string | null>(null);

  const prevPhaseRef = useRef<Phase | null>(null);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state?.activePhase ?? null;
    if (prev && prev !== "mid_game_break" && state?.activePhase === "mid_game_break") {
      triggerAnimation("LIVE_TRIVIA_ROUND_BREAK");
    }
  }, [state?.activePhase, triggerAnimation]);

  if (loading) {
    return (
      <main
        className="flex flex-col bg-slate-950 p-4 text-white overflow-hidden"
        style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
      >
        {hasOnboarded ? "Loading Lobby..." : "Syncing Live Showdown..."}
      </main>
    );
  }

  if (!state) {
    const missingVenue = fetchFailureCategory === "missing_venue";
    return (
      <main
        className="flex flex-col bg-slate-950 p-4 text-white overflow-hidden"
        style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
      >
        <div className="mx-auto flex h-full w-full max-w-md items-center justify-center">
          <section className="w-full rounded-2xl border border-rose-400/40 bg-slate-900 p-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-300">Live Trivia Unavailable</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {error || "Unable to load the Live Trivia lobby right now."}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {missingVenue
                ? "Rejoin your venue from the venue page, then open Live Trivia again."
                : "Try syncing again. If this keeps happening, go back to your venue page and retry."}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void fetchState();
                }}
                className="tp-clean-button rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-cyan-200"
              >
                Retry Sync
              </button>
              <button
                type="button"
                onClick={() => void goHome()}
                className="tp-clean-button tp-exit-pill inline-flex items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.08em]"
              >
                <span aria-hidden="true">←</span>
                Back
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const answering = state.isGameActive && state.activePhase === "answering";
  const restWarning = state.isGameActive && state.activePhase === "rest_warning";
  // Pre-game countdown uses the locally-ticked value so the display is smooth
  // even when the server is only polled every 15 seconds.
  const preGameSecondsRemaining = state.isGameActive ? state.secondsRemaining : localSecondsRemaining;
  const pregameJoinWindowActive =
    !state.isGameActive && Boolean(state.nextSchedule) && preGameSecondsRemaining > 0 && preGameSecondsRemaining <= 120;
  const canJoinLobby = state.isGameActive || Boolean(state.nextSchedule);
  const joinButtonShouldPulse = state.isGameActive || pregameJoinWindowActive;
  const locked = forfeitKey === activeKey || submittedKey === activeKey || !answering;
  const progressPct = answering ? Math.max(0, Math.min(100, (state.secondsRemaining / 30) * 100)) : 0;
  const currentResult = isSpectatingActiveBlock ? undefined : activeKey ? resultByKey[activeKey] : undefined;
  const unsubmittedIsInactive = Boolean(activeKey && participatingQuestionKeys[activeKey]);
  const feedbackState: FeedbackState = !currentResult
    ? unsubmittedIsInactive
      ? "unsubmitted_inactive"
      : "unsubmitted_late_joiner"
    : currentResult.pendingClosestGuess
    ? "pending_closest_guess"
    : currentResult.isCorrect
    ? "right"
    : "wrong";
  const showGameStartPrompt = Boolean(
    hasOnboarded &&
    !state.isGameActive &&
    state.nextSchedule &&
    preGameSecondsRemaining <= 10
  );
  const showRoundStartPrompt = Boolean(
    hasOnboarded &&
    state.isGameActive &&
    state.activePhase === "mid_game_break" &&
    state.upcomingRoundNumber &&
    state.secondsRemaining > 0 &&
    state.secondsRemaining <= 5
  );
  const showReadyPrompt = showGameStartPrompt || showRoundStartPrompt;
  const feedbackLabel =
    feedbackState === "right"
      ? "RIGHT"
      : feedbackState === "wrong"
      ? "WRONG"
      : feedbackState === "pending_closest_guess"
      ? "CLOSEST GUESS SCORING"
      : feedbackState === "unsubmitted_inactive"
      ? "NO ANSWER LOGGED"
      : "SKIPPED";
  const feedbackSubcopy =
    feedbackState === "right"
      ? "+10 points"
      : feedbackState === "wrong"
      ? "0 points"
      : feedbackState === "pending_closest_guess"
      ? (state.emceeAnnouncement ? "See emcee announcement below." : "Evaluating closest numeric guess...")
      : feedbackState === "unsubmitted_inactive"
      ? "No answer logged, stay ready for the next one."
      : "Joining mid-round? Next question is coming right up!";

  return (
    <motion.main
      initial={{ opacity: 1, scale: 1 }}
      animate={isLeaving ? { opacity: 0, scale: 0.85, y: -60 } : { opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col overflow-hidden bg-slate-950 text-white touch-none"
      style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
    >
      <div className="mx-auto w-full max-w-md flex-1 min-h-0 overflow-y-auto touch-pan-y space-y-4 px-4 pt-4 pb-4">
        <header className="rounded-2xl border border-cyan-400/60 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void goHome()}
              disabled={isLeaving}
              aria-label="Back to venue"
              className="tp-exit-pill tp-clean-button inline-flex h-9 w-9 shrink-0 items-center justify-center text-lg disabled:opacity-50"
            >
              ←
            </button>
            <h1 className="text-3xl font-black tracking-wide text-cyan-300">Live Showdown</h1>
          </div>
        </header>


        {!hasOnboarded ? (
          <>
            <section className="rounded-2xl border border-amber-400/60 bg-slate-900 p-4 text-center">
              <p className="text-xs uppercase tracking-[0.14em] text-amber-300">Live Trivia Status</p>
              {!state.isGameActive ? (
                <p className="mt-2 text-2xl font-black tabular-nums text-amber-200">
                  Next Live Trivia Showdown in {formatCountdown(preGameSecondsRemaining)}
                </p>
              ) : null}
              {!state.isGameActive && !state.nextSchedule ? (
                <p className="mt-2 text-sm font-semibold text-amber-100">No live session is scheduled for this venue yet.</p>
              ) : null}
              {state.isGameActive ? (
                <p className="mt-2 text-sm font-semibold text-emerald-200">Live game detected. You can join now.</p>
              ) : null}
              {state.nextSchedule?.firstRoundCategory ? (
                <p className="mt-3 rounded-xl border border-amber-300/50 bg-amber-950/30 p-2 text-sm font-semibold text-amber-100">
                  Opening category preview: {state.nextSchedule.firstRoundCategory}
                </p>
              ) : null}
            </section>

            <button
              type="button"
              disabled={!canJoinLobby}
              onClick={() => {
                setHasOnboarded(true);
                if (state.isGameActive && state.activePhase === "answering" && activeKey) {
                  setSpectatingBlockKey(activeKey);
                  setHasJoinedSession(false);
                  setJoinState("spectating_active_block");
                } else {
                  setJoinState("active_participant");
                }
              }}
              className={`tp-clean-button w-full rounded-xl py-10 text-3xl font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                joinButtonShouldPulse ? "animate-pulse border-2 border-rose-300 bg-rose-300" : "bg-cyan-400"
              }`}
            >
              Join Live Trivia!
            </button>

            <section className="rounded-2xl border border-cyan-400/60 bg-slate-900 p-5">
              <p className="text-sm font-black uppercase tracking-[0.14em] text-cyan-300">Live Trivia Rules</p>
              <ul className="mt-3 space-y-2 text-xl font-semibold leading-snug text-slate-100">
                {RULE_LINES.map((rule, index) => {
                  const visible = index < rulesVisibleCount;
                  return (
                    <li
                      key={rule}
                      className={`rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-3 transition-all duration-500 ${
                        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                      }`}
                    >
                      {rule}
                    </li>
                  );
                })}
              </ul>
            </section>

            <button
              type="button"
              disabled={!canJoinLobby}
              onClick={() => {
                setHasOnboarded(true);
                if (state.isGameActive && state.activePhase === "answering" && activeKey) {
                  setSpectatingBlockKey(activeKey);
                  setHasJoinedSession(false);
                  setJoinState("spectating_active_block");
                } else {
                  setJoinState("active_participant");
                }
              }}
              className={`tp-clean-button w-full rounded-xl py-10 text-3xl font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                joinButtonShouldPulse ? "animate-pulse border-2 border-rose-300 bg-rose-300" : "bg-cyan-400"
              }`}
            >
              Join Live Trivia!
            </button>
          </>
        ) : isPostGame && postGameStats ? (
          /* ── Post-game results screen ── */
          (() => {
            const viewerUsername = getUsername() ?? "—";
            return (
              <div className="space-y-3">
                {state.leaderboard && state.leaderboard.length > 0 && postGameLeaderboard ? (
                  <>
                    {/* Section 1 — Game Over banner (viewer's own stats) */}
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-400/35 bg-gradient-to-br from-[#1c1400] to-[#2d1f00] px-4 py-4">
                      <div
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-900 via-amber-700 to-amber-500 text-2xl"
                        aria-hidden="true"
                      >
                        ⭐
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-500">
                          {postGameLeaderboard.isChampion ? "Game Over · Champion" : "Game Over"}
                        </p>
                        <p className="truncate text-xl font-black leading-tight text-white">{viewerUsername}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {state.venueName ?? state.scheduleTitle ?? "Live Showdown"}
                          {state.totalRounds
                            ? ` · ${state.totalRounds * QUESTIONS_PER_ROUND} questions · ${state.totalRounds} round${
                                state.totalRounds !== 1 ? "s" : ""
                              }`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-3xl font-black tabular-nums leading-none text-amber-300">
                          {postGameLeaderboard.viewerScore}
                        </p>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-600">Points</p>
                      </div>
                    </div>

                    {/* Section 2 — Final standings podium (left = 2nd, center = 1st, right = 3rd) */}
                    <div className="rounded-2xl border border-slate-700/70 bg-slate-900 px-4 py-4">
                      <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Final Standings</p>
                      <div className="flex items-end justify-center gap-2">
                        {[postGameLeaderboard.podium[1], postGameLeaderboard.podium[0], postGameLeaderboard.podium[2]].map(
                          (entry, slot) => {
                            if (!entry) return <div key={`empty-${slot}`} className="flex-1" />;
                            const isFirst = entry.rank === 1;
                            return (
                              <div
                                key={entry.userId}
                                className={`flex flex-1 flex-col items-center rounded-xl border px-2 py-3 text-center ${
                                  isFirst ? "border-amber-400/60 bg-amber-500/10 pb-6" : "border-slate-700 bg-slate-800/50"
                                }`}
                              >
                                <RankBadge rank={entry.rank} />
                                <p className="mt-2 w-full truncate text-xs font-bold text-slate-100">{entry.username}</p>
                                <p className="mt-0.5 text-lg font-black tabular-nums text-white">{entry.totalPoints}</p>
                              </div>
                            );
                          }
                        )}
                      </div>
                      {/* Viewer row — shown only when viewer is not in the top 3 */}
                      {state.viewerRank != null && state.viewerRank > 3 && (
                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2.5">
                          <RankBadge rank={state.viewerRank} />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">{viewerUsername}</span>
                          <span className="shrink-0 text-base font-black tabular-nums text-white">
                            {postGameLeaderboard.viewerScore}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Section 3 — Your round-by-round */}
                    {state.viewerRoundByRound && state.viewerRoundByRound.length > 0 ? (
                      <div className="rounded-2xl border border-slate-700/70 bg-slate-900 px-4 py-4">
                        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Your Round-by-Round{state.viewerRank ? ` · #${state.viewerRank}` : ""}
                        </p>
                        <div className="space-y-4">
                          {state.viewerRoundByRound.map((round) => {
                            const pct = (round.correctCount / QUESTIONS_PER_ROUND) * 100;
                            const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-cyan-500" : "bg-rose-500";
                            return (
                              <div key={round.roundNumber}>
                                <div className="mb-1.5 flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-black text-slate-200">Round {round.roundNumber}</p>
                                    {round.category ? (
                                      <p className="truncate text-[11px] text-slate-500">{round.category}</p>
                                    ) : null}
                                  </div>
                                  <span className="shrink-0 text-xl font-black tabular-nums text-slate-100">{round.points}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <p className="mt-1 text-[11px] text-slate-600">
                                  {round.correctCount} of {QUESTIONS_PER_ROUND} correct
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {/* Section 4 — Stats bar */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col items-center rounded-2xl border border-emerald-400/30 bg-emerald-600/15 py-3">
                        <span className="text-xl font-black tabular-nums text-emerald-300">
                          {postGameLeaderboard.rankGained != null
                            ? postGameLeaderboard.rankGained > 0
                              ? `+${postGameLeaderboard.rankGained}`
                              : `${postGameLeaderboard.rankGained}`
                            : "—"}
                        </span>
                        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600">Rank Gained</span>
                      </div>
                      <div className="flex flex-col items-center rounded-2xl border border-cyan-400/30 bg-cyan-600/15 py-3">
                        <span className="text-xl font-black tabular-nums text-cyan-300">{postGameLeaderboard.correctRate}%</span>
                        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-600">Correct Rate</span>
                      </div>
                      <div className="flex flex-col items-center rounded-2xl border border-amber-400/30 bg-amber-900/20 py-3">
                        <span className="text-xl font-black tabular-nums text-amber-300">×{postGameStats.bestStreak}</span>
                        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-600">Best Streak</span>
                      </div>
                    </div>

                    {/* Section 5 — Back to venue */}
                    <button
                      type="button"
                      onClick={() => void goHome()}
                      className="w-full rounded-2xl bg-rose-500 px-4 py-3.5 text-sm font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-rose-400"
                    >
                      ← Back to Venue
                    </button>
                  </>
                ) : (
                  <>
                    {/* No venue standings available — fall back to individual stats. */}
                    {/* Section 1 — Game Over banner (viewer's own stats) */}
                    <div
                      className="flex items-center gap-3 rounded-2xl px-4 py-4"
                      style={{ background: "linear-gradient(135deg, #1c1400, #2d1f00)", border: "1px solid rgba(251,191,36,0.35)" }}
                    >
                      <div
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                        style={{ background: "linear-gradient(135deg, #78350f, #b45309, #f59e0b)", border: "2px solid rgba(251,191,36,0.5)" }}
                        aria-hidden="true"
                      >
                        ⭐
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-500">Game Over</p>
                        <p className="truncate text-xl font-black leading-tight text-white">{viewerUsername}</p>
                        <p className="truncate text-[11px] text-slate-500">
                          {state.venueName ?? state.scheduleTitle ?? "Live Showdown"}
                          {state.totalRounds
                            ? ` · ${state.totalRounds * QUESTIONS_PER_ROUND} questions · ${state.totalRounds} round${
                                state.totalRounds !== 1 ? "s" : ""
                              }`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-3xl font-black tabular-nums leading-none text-amber-300">
                          {postGameStats.correct * 10}
                        </p>
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-600">Points</p>
                      </div>
                    </div>

                    {/* Round-by-round breakdown */}
                    {Object.keys(postGameStats.byRound).length > 0 ? (
                      <div
                        className="rounded-2xl px-4 py-4"
                        style={{ background: "#111827", border: "1px solid rgba(51,65,85,0.7)" }}
                      >
                        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Your Round-by-Round
                        </p>
                        <div className="space-y-4">
                          {Object.entries(postGameStats.byRound)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([roundNum, data]) => {
                              const score = data.correct * 10;
                              const pct = data.total > 0 ? (data.correct / data.total) * 100 : 0;
                              const barBg =
                                pct >= 70
                                  ? "linear-gradient(90deg, #10b981, #34d399)"
                                  : pct >= 40
                                  ? "linear-gradient(90deg, #0891b2, #22d3ee)"
                                  : "linear-gradient(90deg, #be123c, #f43f5e)";
                              return (
                                <div key={roundNum}>
                                  <div className="mb-1.5 flex items-baseline justify-between">
                                    <span className="text-sm font-black text-slate-200">Round {roundNum}</span>
                                    <span className="text-xl font-black tabular-nums text-slate-100">{score}</span>
                                  </div>
                                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                                    <div
                                      className="h-full rounded-full transition-all duration-700"
                                      style={{ width: `${pct}%`, background: barBg }}
                                    />
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-600">
                                    {data.correct} of {data.total} correct
                                  </p>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ) : null}

                    {/* Stat pills */}
                    <div className="grid grid-cols-3 gap-2">
                      <div
                        className="flex flex-col items-center rounded-2xl py-3"
                        style={{ background: "rgba(5,150,105,0.15)", border: "1px solid rgba(52,211,153,0.3)" }}
                      >
                        <span className="text-xl font-black tabular-nums text-emerald-300">{postGameStats.correctRate}%</span>
                        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600">Correct Rate</span>
                      </div>
                      <div
                        className="flex flex-col items-center rounded-2xl py-3"
                        style={{ background: "rgba(8,145,178,0.15)", border: "1px solid rgba(34,211,238,0.3)" }}
                      >
                        <span className="text-xl font-black tabular-nums text-cyan-300">{postGameStats.total}</span>
                        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-600">Answered</span>
                      </div>
                      <div
                        className="flex flex-col items-center rounded-2xl py-3"
                        style={{ background: "rgba(120,53,15,0.2)", border: "1px solid rgba(251,191,36,0.3)" }}
                      >
                        <span className="text-xl font-black tabular-nums text-amber-300">×{postGameStats.bestStreak}</span>
                        <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-600">Best Streak</span>
                      </div>
                    </div>

                    {/* Back to venue */}
                    <button
                      type="button"
                      onClick={() => void goHome()}
                      className="w-full rounded-2xl bg-rose-500 px-4 py-3.5 text-sm font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-rose-400"
                    >
                      ← Back to Venue
                    </button>
                  </>
                )}
              </div>
            );
          })()
        ) : isPreGameLobby ? (
          <>
            <section className="rounded-2xl border-2 border-cyan-300 bg-cyan-500/15 p-4 text-center">
              <p className="text-sm font-black uppercase tracking-[0.14em] text-cyan-100">Welcome to the Live Showdown Lobby!</p>
              <p className="mt-2 text-sm font-semibold text-cyan-100/95">
                You are checked in. Keep this tab open and review the rules while the game clock counts down.
              </p>
            </section>

            <section className="rounded-2xl border border-amber-400/60 bg-slate-900 p-4 text-center">
              {state.nextSchedule ? (
                <>
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-300">Next Live Trivia Showdown In</p>
                  <p className="mt-2 text-4xl font-black tabular-nums text-amber-200">{formatCountdown(preGameSecondsRemaining)}</p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-300">Live Trivia Status</p>
                  <p className="mt-2 text-lg font-black text-amber-100">No Live Trivia is currently scheduled for this venue.</p>
                </>
              )}
              {state.nextSchedule?.firstRoundCategory ? (
                <p className="mt-3 rounded-xl border border-amber-300/50 bg-amber-950/30 p-2 text-sm font-semibold text-amber-100">
                  Opening category preview: {state.nextSchedule.firstRoundCategory}
                </p>
              ) : null}
            </section>

            <section className="rounded-2xl border border-cyan-400/60 bg-slate-900 p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Lobby Rules</p>
              <ul className="mt-3 space-y-2 text-xl font-semibold leading-snug text-slate-100">
                {RULE_LINES.map((rule) => (
                  <li key={`lobby-${rule}`} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-3">
                    {rule}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : isSpectatingActiveBlock || joinState === "spectating_active_block" ? (
          <section className="rounded-2xl border border-sky-400/60 bg-slate-900 p-4">
            {/* Explanation banner — tells the late joiner exactly why they can't play */}
            <div className="mb-3 rounded-xl border border-sky-400/40 bg-sky-950/40 p-3 text-center">
              <p className="text-xs uppercase tracking-[0.14em] text-sky-300">You Joined Mid-Game</p>
              <p className="mt-1 text-sm font-semibold text-sky-100/90">
                You joined while a question was in progress, so you&apos;re spectating this one.
                You&apos;ll be able to answer starting with the next question.
              </p>
            </div>

            {state.activeQuestion ? (
              <>
                <p className="text-base font-black uppercase tracking-[0.14em] text-slate-400">
                  Round {state.currentRound} · Question {state.currentQuestionIndex}
                </p>
                {state.currentRoundCategory ? (
                  <p className="mt-1 text-base font-bold uppercase tracking-[0.1em] text-slate-400/80">
                    Category: {state.currentRoundCategory}
                  </p>
                ) : null}
                {state.activeQuestion.isClosestGuess ? (
                  <p className="mt-2 inline-block rounded-lg border border-amber-400/40 bg-amber-950/30 px-2 py-1 text-sm font-black uppercase tracking-wide text-amber-300/70">
                    🎯 Closest Guess — nearest answer wins 10 points
                  </p>
                ) : null}
                <p className="mt-2 text-3xl font-extrabold tracking-tight leading-tight text-slate-300">
                  {state.activeQuestion.question}
                </p>

                {/* Phase-aware lower section */}
                {restWarning && state.revealedAnswer ? (
                  /* Answer has been revealed — show it clearly */
                  <div className="mt-4 rounded-xl border border-emerald-400/50 bg-emerald-950/40 p-4 text-center">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-400">Answer Revealed</p>
                    <p className="mt-2 text-3xl font-black text-emerald-200">{state.revealedAnswer}</p>
                    <p className="mt-2 text-sm font-semibold text-emerald-300/70">
                      Next question in {state.secondsRemaining}s
                    </p>
                  </div>
                ) : (
                  /* Answering phase — show the live countdown and locked input */
                  <>
                    <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-sky-600 transition-all duration-700" style={{ width: `${progressPct}%` }} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-sky-400/70">
                      Answer period — {state.secondsRemaining}s remaining
                    </p>
                    <input
                      value=""
                      disabled
                      readOnly
                      placeholder="Answer input disabled for this question"
                      className="mt-3 w-full cursor-not-allowed rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-3 text-xl font-semibold text-slate-500 opacity-50"
                    />
                    <button
                      type="button"
                      disabled
                      className="tp-clean-button mt-3 w-full cursor-not-allowed rounded-xl bg-slate-700 py-3 text-2xl font-black text-slate-500 opacity-50"
                    >
                      Submit
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm font-semibold text-sky-300/70">Syncing question from server…</p>
            )}
          </section>
        ) : answering ? (
          <section className="rounded-2xl border border-emerald-400/60 bg-slate-900 p-4">
            <p className="text-base font-black uppercase tracking-[0.14em] text-emerald-300">
              Round {state.currentRound} · Question {state.currentQuestionIndex}
            </p>
            {state.currentRoundCategory ? (
              <p className="mt-1 text-base font-bold uppercase tracking-[0.1em] text-emerald-100/90">
                Category: {state.currentRoundCategory}
              </p>
            ) : null}
            {state.activeQuestion?.isClosestGuess ? (
              <p className="mt-2 inline-block rounded-lg border border-amber-400/60 bg-amber-950/40 px-2 py-1 text-sm font-black uppercase tracking-wide text-amber-200">
                🎯 Closest Guess — nearest answer wins 10 points
              </p>
            ) : null}
            <p className="mt-2 text-3xl font-extrabold tracking-tight leading-tight">
              {state.activeQuestion?.question ?? "Question loading…"}
            </p>
            {!state.activeQuestion ? (
              <p className="mt-1 text-sm text-slate-400">Hang tight — syncing question from server.</p>
            ) : null}
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-1 text-2xl font-black text-emerald-200">{state.secondsRemaining}s</p>
            <input
              ref={answerInputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={locked || isSubmitting}
              placeholder="Type your answer..."
              className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-2xl font-semibold"
            />
            <button
              type="button"
              disabled={locked || isSubmitting || answer.trim().length === 0}
              onClick={() => void submit(answer)}
              className={`tp-clean-button mt-3 w-full rounded-xl py-3 text-2xl font-black text-slate-950 ${
                submittedKey === activeKey
                  ? "cursor-default bg-emerald-600"
                  : "bg-emerald-500 disabled:opacity-50"
              }`}
            >
              {submittedKey === activeKey ? "Answer Locked!" : isSubmitting ? "Submitting..." : "Submit"}
            </button>
          </section>
        ) : restWarning ? (
          <section className="rounded-2xl border border-fuchsia-400/60 bg-slate-900 p-4 text-center">
            <p className="text-base font-black uppercase tracking-[0.14em] text-fuchsia-300">Answer Reveal</p>
            <p className="mt-2 text-5xl font-black tabular-nums text-fuchsia-200">{state.secondsRemaining}s</p>
            <div
              className={`mt-3 rounded-xl border p-3 text-center ${
                feedbackState === "right"
                  ? "border-emerald-300/70 bg-emerald-500/20 text-emerald-100"
                  : feedbackState === "wrong"
                  ? "border-rose-300/70 bg-rose-500/20 text-rose-100"
                  : "border-sky-300/70 bg-sky-500/20 text-sky-100"
              }`}
            >
              <p className="text-4xl font-black tracking-wide">{feedbackLabel}</p>
              <p className="text-xl font-bold">{feedbackSubcopy}</p>
              {!currentResult ? <p className="mt-1 text-xs">Question expired.</p> : null}
            </div>
            {state.revealedAnswer ? (
              <p className="mt-3 rounded-xl border border-fuchsia-300/50 bg-fuchsia-950/40 p-3 text-2xl font-extrabold tracking-tight">
                Correct Answer: {state.revealedAnswer}
              </p>
            ) : null}
            {state.emceeAnnouncement ? (
              <p className="mt-3 rounded-xl border border-amber-300/70 bg-amber-950/50 p-3 text-base font-bold text-amber-100">
                Emcee: {state.emceeAnnouncement}
              </p>
            ) : null}
          </section>
        ) : (
          /* ── Round break / intermission ── */
          <section className="space-y-4">
            {/* Header: round label + title + break countdown (no card border — sits on page bg) */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-fuchsia-400">
                  {typeof state.currentRound === "number" && state.totalRounds
                    ? `Round ${state.currentRound} of ${state.totalRounds} · Intermission`
                    : "Intermission"}
                </p>
                <p className="mt-1 text-[1.75rem] font-black leading-tight text-white">
                  Next round begins in
                </p>
              </div>
              <div className="shrink-0 pt-0.5 text-right">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-500">Break</p>
                <p className="text-3xl font-black tabular-nums leading-none text-amber-300">
                  {formatMmSs(state.secondsRemaining)}
                </p>
              </div>
            </div>

            {/* Round category tabs */}
            {(typeof state.currentRound === "number" || typeof state.upcomingRoundNumber === "number") ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {typeof state.currentRound === "number" ? (
                  <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
                    R{state.currentRound}
                    {state.currentRoundCategory ? <span className="ml-1 text-slate-500">· {state.currentRoundCategory}</span> : null}
                  </div>
                ) : null}
                {typeof state.upcomingRoundNumber === "number" ? (
                  <div
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-fuchsia-200"
                    style={{ borderColor: "rgba(168,85,247,0.6)", background: "rgba(88,28,135,0.35)" }}
                  >
                    R{state.upcomingRoundNumber}
                    {state.upcomingRoundCategory ? <span className="ml-1">· {state.upcomingRoundCategory} ↑</span> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Divider */}
            <div className="h-px w-full bg-slate-800" />

            {/* Last revealed answer */}
            {state.revealedAnswer ? (
              <div
                className="rounded-xl px-4 py-3 text-sm font-bold"
                style={{ background: "rgba(112,26,117,0.25)", border: "1px solid rgba(192,38,211,0.3)", color: "#f0abfc" }}
              >
                Correct answer: <span className="font-black">{state.revealedAnswer}</span>
              </div>
            ) : null}

            {/* Emcee announcement */}
            {state.emceeAnnouncement ? (
              <div
                className="rounded-xl px-4 py-3 text-sm font-bold"
                style={{ background: "rgba(120,53,15,0.3)", border: "1px solid rgba(245,158,11,0.35)", color: "#fde68a" }}
              >
                {state.emceeAnnouncement}
              </div>
            ) : null}

            {/* In-game leaderboard (this game only, not lifetime venue points) */}
            {state.leaderboard && state.leaderboard.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Leaderboard</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">This game only</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                        <th className="px-3 py-2">Rank</th>
                        <th className="px-3 py-2">Player</th>
                        {Array.from({ length: state.currentRound ?? 0 }, (_, i) => (
                          <th key={i + 1} className="px-2 py-2 text-right tabular-nums">
                            R{i + 1}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.leaderboard.slice(0, 10).map((player) => {
                        const isViewer = Boolean(viewerId) && player.userId === viewerId;
                        const movement = rankMovement.get(player.userId) ?? 0;
                        return (
                          <tr
                            key={player.userId}
                            className={`border-t border-slate-800 ${
                              isViewer ? "bg-fuchsia-950/30 ring-1 ring-inset ring-fuchsia-500/50" : ""
                            }`}
                          >
                            <td className="px-3 py-2.5">
                              <RankBadge rank={player.rank} />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-100">{player.username}</span>
                                {isViewer ? (
                                  <span className="rounded bg-fuchsia-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                                    You
                                  </span>
                                ) : null}
                                {movement > 0 ? (
                                  <span className="text-[10px] font-black tabular-nums text-emerald-400">▲{movement}</span>
                                ) : movement < 0 ? (
                                  <span className="text-[10px] font-black tabular-nums text-rose-400">
                                    ▼{Math.abs(movement)}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            {Array.from({ length: state.currentRound ?? 0 }, (_, i) => {
                              const roundNumber = i + 1;
                              return (
                                <td key={roundNumber} className="px-2 py-2.5 text-right tabular-nums text-slate-400">
                                  {player.roundPoints[roundNumber] ?? 0}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-right">
                              <span className="text-lg font-black tabular-nums text-white">{player.totalPoints}</span>
                              {player.pointsThisRound > 0 ? (
                                <span className="ml-1 text-xs font-black tabular-nums text-emerald-400">
                                  +{player.pointsThisRound}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Viewer outside the top 10 — minimal rank row (full row data not in state) */}
                {state.viewerRank && state.viewerRank > 10 ? (
                  <div className="flex items-center gap-2 border-t border-slate-800 bg-fuchsia-950/30 px-3 py-2.5 ring-1 ring-inset ring-fuchsia-500/50">
                    <RankBadge rank={state.viewerRank} />
                    <span className="rounded bg-fuchsia-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                      You
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      You&apos;re ranked #{state.viewerRank} this game
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        )}

        {hasOnboarded && commentText ? (
          <div className="rounded-xl border border-cyan-400/50 bg-cyan-950/30 p-3 text-sm font-semibold text-cyan-100">
            {commentText}
          </div>
        ) : null}

        {hasOnboarded && submitMessage ? (
          <div className="rounded-xl border border-cyan-400/50 bg-cyan-950/40 p-3 text-sm font-semibold">{submitMessage}</div>
        ) : null}
        {error ? <div className="rounded-xl border border-rose-400/50 bg-rose-950/40 p-3 text-sm">{error}</div> : null}
      </div>


      {hasOnboarded && Boolean(forfeitKey) && Boolean(activeKey) && forfeitKey === activeKey ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500 bg-rose-950 p-6 text-center">
            <p className="text-2xl font-black text-rose-200">Forfeited Question</p>
            <p className="mt-2 text-sm font-semibold text-rose-100">
              Forfeited Question. No closing your browser or changing tabs during Live Trivia!
            </p>
          </div>
        </div>
      ) : null}

      <ReadyPrompt
        type={showGameStartPrompt ? "game_start" : "round_start"}
        roundNumber={showRoundStartPrompt ? (state.upcomingRoundNumber ?? undefined) : undefined}
        category={showRoundStartPrompt ? (state.upcomingRoundCategory ?? null) : null}
        secondsRemaining={preGameSecondsRemaining}
        isVisible={showReadyPrompt}
      />

      {popupAd ? (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-cyan-300/60 bg-slate-950 p-4 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-200">Sponsor Spotlight</p>
            <button
              type="button"
              onClick={() => setPopupAd(null)}
              className="absolute right-8 top-6 rounded border border-slate-500 px-2 py-0.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Close
            </button>
            <a href={popupAd.clickUrl} target="_blank" rel="noreferrer noopener" className="mt-3 block">
              <img
                src={popupAd.imageUrl}
                alt={popupAd.altText || popupAd.advertiserName}
                className="h-auto w-full rounded-xl border border-slate-700 object-contain"
              />
            </a>
            <p className="mt-2 text-center text-xs text-slate-300">{popupAd.advertiserName}</p>
          </div>
        </div>
      ) : null}
    </motion.main>
  );
}
