"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getUserId, getVenueId } from "@/lib/storage";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import {
  selectLiveShowdownComment,
  type LiveShowdownCommentTrigger,
} from "@/lib/liveShowdownComments";

type Phase = "answering" | "rest_warning" | "mid_game_break" | "pre_game";

type LiveState = {
  isGameActive: boolean;
  activePhase: Phase;
  secondsRemaining: number;
  totalRounds: number;
  currentRound: number | null;
  currentQuestionIndex: number | null;
  revealedAnswer: string | null;
  scheduleId?: string;
  scheduleTitle?: string;
  scheduleTimezone?: string;
  currentRoundCategory?: string | null;
  upcomingRoundNumber?: number | null;
  upcomingRoundCategory?: string | null;
  nextSchedule?: {
    id: string;
    title: string;
    startTime: string;
    timezone: string;
    numRounds: number;
    firstRoundCategory?: string | null;
  } | null;
  activeQuestion: {
    questionId?: string;
    question: string;
    options: string[];
    category?: string | null;
  } | null;
};

type SubmissionResult = {
  isCorrect: boolean;
  forfeited?: boolean;
  submittedAnswer?: string;
};

type FeedbackState = "right" | "wrong" | "unsubmitted_late_joiner" | "unsubmitted_inactive";

const RULE_LINES = [
  "Players get 30 seconds to type their answers.",
  "There's 15 seconds between questions.",
  "Correct answers award +10 points.",
  "New players can join any time, but do not get points for questions they missed.",
  "Do not close your browser or switch tabs during live play.",
  "If you wish to leave the game, click 'Back to Home Page' any time.",
  "The user with the most points at the end wins a $25 gift certificate.",
];

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

export default function LiveShowdownPage() {
  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState("");
  const [submittedKey, setSubmittedKey] = useState("");
  const [forfeitKey, setForfeitKey] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultByKey, setResultByKey] = useState<Record<string, SubmissionResult>>({});
  const [rulesVisibleCount, setRulesVisibleCount] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [commentEventKey, setCommentEventKey] = useState("");
  const [commentText, setCommentText] = useState("");
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

  const activeKey = useMemo(() => {
    if (!state?.isGameActive || !state.scheduleId || !state.currentRound || !state.currentQuestionIndex) return "";
    return `${state.scheduleId}:${state.currentRound}:${state.currentQuestionIndex}`;
  }, [state]);
  const isPreGameLobby = Boolean(hasOnboarded && (!state?.isGameActive || state?.activePhase === "pre_game"));
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

  const fetchState = useCallback(async () => {
    try {
      const venueId = String(getVenueId() ?? "").trim();
      const query = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";
      const response = await fetch(`/api/trivia/live/state${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; state?: LiveState; error?: string };
      if (!payload.ok || !payload.state) throw new Error(payload.error || "Failed to sync live state.");
      setState(payload.state);
      setIsEngineReady(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync live state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
    const timer = window.setInterval(() => void fetchState(), 1000);
    return () => window.clearInterval(timer);
  }, [fetchState]);

  useEffect(() => {
    setAnswer("");
    setSubmitMessage("");
  }, [activeKey]);

  useEffect(() => {
    if (!state?.isGameActive || state.activePhase !== "answering" || !activeKey) return;
    setCommentEventKey("");
    setCommentText("");
  }, [activeKey, state?.activePhase, state?.isGameActive]);

  useEffect(() => {
    if (!spectatingBlockKey) return;
    if (!activeKey || activeKey === spectatingBlockKey) return;
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
      return;
    }

    if (joinedScheduleRef.current && joinedScheduleRef.current !== state.scheduleId) {
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
      joinedScheduleRef.current = state.scheduleId;
      setHasJoinedSession(true);
      setJoinState("active_participant");
    }
  }, [activeKey, hasOnboarded, isEngineReady, isSpectatingActiveBlock, state]);

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
      if (!state?.isGameActive || !state.scheduleId || !state.currentRound || !state.currentQuestionIndex) return;
      const userId = (getUserId() ?? "").trim();
      const venueId = (getVenueId() ?? "").trim();
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
          result?: { isCorrect: boolean; alreadySubmitted?: boolean };
        };
        if (!payload.ok || !payload.result) throw new Error(payload.error || "Submission failed.");

        const nextResult: SubmissionResult = {
          isCorrect: isForfeit ? false : Boolean(payload.result.isCorrect),
          forfeited: isForfeit,
          submittedAnswer,
        };
        setResultByKey((current) => ({ ...current, [activeKey]: nextResult }));

        if (isForfeit) {
          setSubmitMessage("Forfeited Question. No closing your browser or changing tabs during Live Trivia!");
        } else {
          setSubmitMessage("Answer locked in. Waiting for reveal.");
          setSubmittedKey(activeKey);
        }
      } catch (e) {
        setSubmitMessage(e instanceof Error ? e.message : "Submission failed.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeKey, state]
  );

  useEffect(() => {
    if (!state || !state.isGameActive || state.activePhase === "pre_game" || isPreGameLobby) return;
    if (!hasOnboarded || !isEngineReady || !hasJoinedSession || isSpectatingActiveBlock) return;
    if (state.activePhase !== "answering" || !activeKey) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    if (forfeitKey === activeKey) return;

    const triggerForfeit = () => {
      if (forfeitInFlight.current || forfeitKey === activeKey) return;
      forfeitInFlight.current = true;
      setForfeitKey(activeKey);
      void submit("__FORFEIT__", true).finally(() => {
        forfeitInFlight.current = false;
      });
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") triggerForfeit();
    };
    const onBlur = () => triggerForfeit();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [activeKey, forfeitKey, hasJoinedSession, hasOnboarded, isEngineReady, isPreGameLobby, isSpectatingActiveBlock, state, submit]);

  const goHome = useCallback(async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    const venueId = getVenueId()?.trim() ?? "";
    const fallbackPath = venueId ? `/venue/${encodeURIComponent(venueId)}` : "/";
    await navigateBackToVenue({
      venuePath: fallbackPath,
      fallbackNavigate: () => {
        window.location.href = fallbackPath;
      },
    });
  }, [isLeaving]);

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
      const isCorrect = Boolean(result.isCorrect);
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
  }, [commentEventKey, nextCommentEvent]);

  if (loading || !state) {
    return (
      <main className="min-h-[100dvh] bg-slate-950 p-4 text-white">
        {hasOnboarded ? "Loading Lobby..." : "Syncing Live Showdown..."}
      </main>
    );
  }

  const answering = state.isGameActive && state.activePhase === "answering";
  const restWarning = state.isGameActive && state.activePhase === "rest_warning";
  const pregameJoinWindowActive =
    !state.isGameActive && Boolean(state.nextSchedule) && state.secondsRemaining > 0 && state.secondsRemaining <= 120;
  const canJoinLobby = state.isGameActive || Boolean(state.nextSchedule);
  const locked = forfeitKey === activeKey || submittedKey === activeKey || !answering;
  const progressPct = answering ? Math.max(0, Math.min(100, (state.secondsRemaining / 30) * 100)) : 0;
  const currentResult = isSpectatingActiveBlock ? undefined : activeKey ? resultByKey[activeKey] : undefined;
  const unsubmittedIsInactive = Boolean(activeKey && participatingQuestionKeys[activeKey]);
  const feedbackState: FeedbackState = !currentResult
    ? unsubmittedIsInactive
      ? "unsubmitted_inactive"
      : "unsubmitted_late_joiner"
    : currentResult.isCorrect
    ? "right"
    : "wrong";
  const feedbackIsRight = feedbackState === "right";
  const feedbackLabel =
    feedbackState === "right"
      ? "RIGHT"
      : feedbackState === "wrong"
      ? "WRONG"
      : feedbackState === "unsubmitted_inactive"
      ? "NO ANSWER LOGGED"
      : "SKIPPED";
  const feedbackSubcopy =
    feedbackState === "right"
      ? "+10 points"
      : feedbackState === "wrong"
      ? "0 points"
      : feedbackState === "unsubmitted_inactive"
      ? "No answer logged, stay ready for the next one."
      : "Joining mid-round? Next question is coming right up!";

  return (
    <motion.main
      initial={{ opacity: 1, scale: 1 }}
      animate={isLeaving ? { opacity: 0, scale: 0.9, y: 22 } : { opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-[100dvh] bg-slate-950 p-4 text-white"
    >
      <button
        type="button"
        onClick={() => void goHome()}
        className="tp-clean-button fixed left-3 top-3 z-[1300] rounded-full border border-cyan-300/70 bg-cyan-100/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-cyan-100 hover:bg-cyan-100/20"
      >
        Back to Venue Home
      </button>

      <div className="mx-auto w-full max-w-md space-y-4 pt-12">
        <header className="rounded-2xl border border-cyan-400/60 bg-slate-900 p-4">
          <h1 className="text-3xl font-black tracking-wide text-cyan-300">Live Showdown</h1>
          <p className="mt-1 text-sm font-semibold text-slate-300">Synchronized venue trivia with live room energy.</p>
        </header>

        {!hasOnboarded ? (
          <>
            <section className="rounded-2xl border border-cyan-400/60 bg-slate-900 p-5">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Live Trivia Rules</p>
              <ul className="mt-3 space-y-2 text-lg font-semibold leading-snug text-slate-100">
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

            <section className="rounded-2xl border border-amber-400/60 bg-slate-900 p-4 text-center">
              <p className="text-xs uppercase tracking-[0.14em] text-amber-300">Live Trivia Status</p>
              {!state.isGameActive ? (
                <p className="mt-2 text-2xl font-black tabular-nums text-amber-200">
                  Next Live Trivia Showdown in {formatCountdown(state.secondsRemaining)}
                </p>
              ) : null}
              {pregameJoinWindowActive ? (
                <p className="mt-3 rounded-xl border-2 border-rose-300 bg-rose-500/20 p-3 text-sm font-black text-rose-100">
                  Live Trivia is starting in less than 2 minutes! Click 'Join Live Trivia' now to ensure you are placed in
                  the lobby and don't miss the first question.
                </p>
              ) : null}
              {!state.isGameActive ? (
                <p className="mt-2 text-sm font-semibold text-amber-100">
                  {state.nextSchedule
                    ? "Game has not started yet. Join goes live when the countdown hits 00:00:00."
                    : "No live session is scheduled for this venue yet."}
                </p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-emerald-200">Live game detected. You can join now.</p>
              )}
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
              className={`tp-clean-button w-full rounded-xl py-3 text-lg font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                pregameJoinWindowActive
                  ? "animate-pulse border-2 border-rose-300 bg-rose-300"
                  : "bg-cyan-400"
              }`}
            >
              Join Live Trivia!
            </button>
          </>
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
                  <p className="mt-2 text-4xl font-black tabular-nums text-amber-200">{formatCountdown(state.secondsRemaining)}</p>
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
              <ul className="mt-3 space-y-2 text-lg font-semibold leading-snug text-slate-100">
                {RULE_LINES.map((rule) => (
                  <li key={`lobby-${rule}`} className="rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-3">
                    {rule}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : isSpectatingActiveBlock || joinState === "spectating_active_block" ? (
          <section className="rounded-2xl border border-sky-400/60 bg-slate-900 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.14em] text-sky-300">Spectating Current Question</p>
            <p className="mt-3 text-lg font-black text-sky-100">
              Question in progress! You will automatically drop into the action on the next question.
            </p>
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
            <p className="mt-2 text-3xl font-extrabold tracking-tight leading-tight">
              {state.activeQuestion?.question ?? "Loading question..."}
            </p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-1 text-2xl font-black text-emerald-200">{state.secondsRemaining}s</p>
            <input
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
              className="tp-clean-button mt-3 w-full rounded-xl bg-emerald-500 py-3 text-2xl font-black text-slate-950 disabled:opacity-50"
            >
              Submit
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
          </section>
        ) : (
          <section className="rounded-2xl border border-fuchsia-400/60 bg-slate-900 p-4 text-center">
            <p className="text-base font-black uppercase tracking-[0.14em] text-fuchsia-300">Intermission</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-fuchsia-100">
              {typeof state.upcomingRoundNumber === "number"
                ? `Break time! Round ${state.upcomingRoundNumber} begins in ${formatMmSs(state.secondsRemaining)}.`
                : `Break time! Next round begins in ${formatMmSs(state.secondsRemaining)}.`}
            </p>
            {state.upcomingRoundCategory ? (
              <p className="mt-3 rounded-xl border border-amber-300/50 bg-amber-950/35 p-3 text-base font-bold text-amber-100">
                Up next category: {state.upcomingRoundCategory}
              </p>
            ) : null}
            {state.revealedAnswer ? (
              <p className="mt-3 rounded-xl border border-fuchsia-300/50 bg-fuchsia-950/40 p-3 text-sm font-semibold">
                Last answer: {state.revealedAnswer}
              </p>
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
    </motion.main>
  );
}
