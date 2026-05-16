"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserId } from "@/lib/storage";

type Phase = "answering" | "rest_warning" | "mid_game_break";

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
  nextSchedule?: { title: string; startTime: string; timezone: string } | null;
  activeQuestion: {
    question: string;
    options: string[];
  } | null;
};

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  const forfeitInFlight = useRef(false);

  const activeKey = useMemo(() => {
    if (!state?.isGameActive || !state.scheduleId || !state.currentRound || !state.currentQuestionIndex) return "";
    return `${state.scheduleId}:${state.currentRound}:${state.currentQuestionIndex}`;
  }, [state]);

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch("/api/trivia/live/state", { cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; state?: LiveState; error?: string };
      if (!payload.ok || !payload.state) throw new Error(payload.error || "Failed to sync live state.");
      setState(payload.state);
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

  const submit = useCallback(
    async (submittedAnswer: string, isForfeit = false) => {
      if (!state?.isGameActive || !state.scheduleId || !state.currentRound || !state.currentQuestionIndex) return;
      const userId = (getUserId() ?? "").trim();
      if (!userId) {
        setSubmitMessage("Join a venue first.");
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await fetch("/api/trivia/live/submit-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            scheduleId: state.scheduleId,
            roundNumber: state.currentRound,
            questionIndex: state.currentQuestionIndex,
            submittedAnswer,
          }),
        });
        const payload = (await response.json()) as { ok: boolean; error?: string; result?: { isCorrect: boolean } };
        if (!payload.ok) throw new Error(payload.error || "Submission failed.");
        if (isForfeit) {
          setSubmitMessage("Forfeited Question - Anti-Cheat Triggered");
        } else {
          setSubmitMessage("Answer Locked In - Waiting for Room");
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
    if (!state?.isGameActive || state.activePhase !== "answering" || !activeKey) return;
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
  }, [activeKey, forfeitKey, state, submit]);

  if (loading || !state) {
    return <main className="min-h-[100dvh] bg-slate-950 text-white p-4">Syncing Live Showdown...</main>;
  }

  const answering = state.isGameActive && state.activePhase === "answering";
  const locked = forfeitKey === activeKey || submittedKey === activeKey || !answering;
  const progressPct = answering ? Math.max(0, Math.min(100, (state.secondsRemaining / 30) * 100)) : 0;

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-white p-4">
      <div className="mx-auto w-full max-w-md space-y-4">
        <header className="rounded-2xl border border-cyan-400/60 bg-slate-900 p-4">
          <h1 className="text-2xl font-black tracking-wide text-cyan-300">Live Showdown</h1>
          <p className="mt-1 text-xs text-slate-300">Synchronized bar trivia. 30s answer windows. Stay on this screen.</p>
        </header>

        {!state.isGameActive ? (
          <section className="rounded-2xl border border-amber-400/60 bg-slate-900 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.14em] text-amber-300">Next Show Starts In</p>
            <p className="mt-2 text-4xl font-black text-amber-200 tabular-nums">{formatCountdown(state.secondsRemaining)}</p>
          </section>
        ) : answering ? (
          <section className="rounded-2xl border border-emerald-400/60 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-emerald-300">Round {state.currentRound} · Question {state.currentQuestionIndex}</p>
            <p className="mt-2 text-lg font-bold">{state.activeQuestion?.question ?? "Loading question..."}</p>
            <div className="mt-3 h-3 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-1 text-sm font-semibold text-emerald-200">{state.secondsRemaining}s</p>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={locked || isSubmitting}
              placeholder="Type your answer..."
              className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-lg"
            />
            <button
              type="button"
              disabled={locked || isSubmitting || answer.trim().length === 0}
              onClick={() => void submit(answer)}
              className="tp-clean-button mt-3 w-full rounded-xl bg-emerald-500 py-3 text-lg font-black text-slate-950 disabled:opacity-50"
            >
              Submit
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-fuchsia-400/60 bg-slate-900 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.14em] text-fuchsia-300">{state.activePhase === "mid_game_break" ? "Mid-Game Break" : "Get Ready"}</p>
            <p className="mt-2 text-4xl font-black tabular-nums text-fuchsia-200">{state.secondsRemaining}s</p>
            {state.revealedAnswer ? (
              <p className="mt-3 rounded-xl border border-fuchsia-300/50 bg-fuchsia-950/40 p-3 text-lg font-bold">Answer: {state.revealedAnswer}</p>
            ) : null}
            <p className="mt-3 animate-pulse text-xl font-black text-amber-300">GET READY</p>
          </section>
        )}

        {submitMessage ? (
          <div className="rounded-xl border border-cyan-400/50 bg-cyan-950/40 p-3 text-sm font-semibold">{submitMessage}</div>
        ) : null}
        {error ? <div className="rounded-xl border border-rose-400/50 bg-rose-950/40 p-3 text-sm">{error}</div> : null}
      </div>

      {forfeitKey === activeKey ? (
        <div className="fixed inset-0 z-[1200] bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500 bg-rose-950 p-6 text-center">
            <p className="text-2xl font-black text-rose-200">Forfeited Question</p>
            <p className="mt-2 text-sm font-semibold text-rose-100">Anti-Cheat Triggered</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
