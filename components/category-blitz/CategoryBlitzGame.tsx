"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUserId, getVenueId, getUsername } from "@/lib/storage";
import { useCategoryBlitzSession } from "@/lib/categoryBlitzRealtime";
import type { CategoryBlitzRoundResults } from "@/types";

const LETTER_GRADIENT =
  "bg-[linear-gradient(132deg,#10b981_0%,#22c55e_50%,#14b8a6_100%)]";
const BORDER_ACTIVE = "border-emerald-400/60";
const BORDER_CARD = "border-emerald-400/30";
const TEXT_ACCENT = "text-emerald-300";
const TEXT_LABEL = "text-emerald-300 tracking-[0.14em] uppercase font-black text-xs";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Idle / complete screens ───────────────────────────────────────────────────

function formatIdleCountdown(seconds: number): string {
  if (seconds <= 0) return "Starting soon";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `0:${String(s).padStart(2, "0")}`;
}

function IdleScreen({ venueId }: { venueId: string | null }) {
  const [nextWindowAtMs, setNextWindowAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!venueId) return;
    void fetch(`/api/category-blitz/sessions?venueId=${encodeURIComponent(venueId)}`)
      .then((r) => r.json())
      .then((json: { ok: boolean; nextWindowAt?: string | null }) => {
        if (json.nextWindowAt) setNextWindowAtMs(new Date(json.nextWindowAt).getTime());
      })
      .catch(() => undefined);
  }, [venueId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const countdownSeconds =
    nextWindowAtMs != null
      ? Math.max(0, Math.floor((nextWindowAtMs - nowMs) / 1000))
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
      <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
        <p className={TEXT_LABEL}>Category Blitz</p>
        {countdownSeconds != null ? (
          <>
            <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Next game in</p>
            <p className="mt-1 font-black tabular-nums text-emerald-300 text-[2.8rem] leading-none">
              {formatIdleCountdown(countdownSeconds)}
            </p>
            <p className="mt-3 text-sm text-slate-400">One letter · 12 categories · 3 minutes</p>
          </>
        ) : (
          <>
            <p className="mt-3 text-xl font-black text-white">No game is running right now.</p>
            <p className="mt-2 text-sm text-slate-400">Check back later for the next session.</p>
          </>
        )}
      </div>
    </div>
  );
}

function LobbyScreen({ username }: { username: string | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
      <div className={`w-full max-w-sm rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-6 text-center`}>
        <p className={TEXT_LABEL}>Waiting for host</p>
        <p className="mt-3 text-2xl font-black text-white">You&apos;re in the lobby!</p>
        {username ? <p className="mt-1 text-lg font-bold text-emerald-200">{username}</p> : null}
        <p className="mt-3 text-sm text-emerald-100/80">
          The host will start a round shortly. Keep this screen open — the letter and categories will appear automatically.
        </p>
        <div className={`mt-4 inline-flex items-center gap-2 rounded-full border ${BORDER_ACTIVE} bg-emerald-950/30 px-3 py-1.5 text-xs font-black uppercase tracking-widest ${TEXT_ACCENT}`}>
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Ready
        </div>
      </div>
    </div>
  );
}

function ScoringScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
      <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
        <p className={TEXT_LABEL}>Scoring in progress</p>
        <p className="mt-3 text-xl font-black text-white">Checking answers…</p>
        <p className="mt-2 text-sm text-slate-400">Unique answers score 2 pts. Duplicates cancel.</p>
        <div className="mt-4 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-400/40 border-t-emerald-400" />
        </div>
      </div>
    </div>
  );
}

function IntermissionStatus({
  nextRoundStartsIn,
  compact = false,
}: {
  nextRoundStartsIn: number | null;
  compact?: boolean;
}) {
  if (nextRoundStartsIn == null) {
    return (
      <div className={`rounded-2xl border ${BORDER_CARD} bg-slate-900/60 ${compact ? "px-3 py-2" : "p-4"} text-center`}>
        <p className={TEXT_LABEL}>Status</p>
        <p className={`mt-2 font-black text-white ${compact ? "text-sm" : "text-lg"}`}>Waiting for next round</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 ${compact ? "px-3 py-2" : "p-4"} text-center`}>
      <p className={TEXT_LABEL}>Next round starts in</p>
      <p className={`mt-1 font-black tabular-nums ${TEXT_ACCENT} ${compact ? "text-xl" : "text-4xl"}`}>
        {formatMmSs(nextRoundStartsIn)}
      </p>
      {!compact ? <p className="mt-2 text-xs text-emerald-100/70">Results stay visible until the next letter drops.</p> : null}
    </div>
  );
}

function CompleteScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
      <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
        <p className={TEXT_LABEL}>Game over</p>
        <p className="mt-3 text-xl font-black text-white">The session has ended.</p>
        <p className="mt-2 text-sm text-slate-400">Thanks for playing! Your points have been awarded.</p>
      </div>
    </div>
  );
}

// ── Results screen ────────────────────────────────────────────────────────────

function ResultsScreen({
  results,
  userId,
  nextRoundStartsIn,
}: {
  results: CategoryBlitzRoundResults;
  userId: string;
  nextRoundStartsIn: number | null;
}) {
  const viewerTotal = results.totals.find((t) => t.userId === userId)?.points ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      <IntermissionStatus nextRoundStartsIn={nextRoundStartsIn} />

      {/* Score banner */}
      <div className={`rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-4 text-center`}>
        <p className={TEXT_LABEL}>Your score this round</p>
        <p className={`mt-1 text-5xl font-black tabular-nums ${TEXT_ACCENT}`}>{viewerTotal}</p>
        <p className="text-sm text-emerald-100/60">points</p>
      </div>

      {/* Category breakdown */}
      <p className={`${TEXT_LABEL} mt-1`}>Letter: {results.letter}</p>
      <div className="space-y-2">
        {results.results.map((cat) => {
          const viewerAnswer = cat.answers.find((a) => a.userId === userId);
          return (
            <div
              key={cat.categoryIndex}
              className={`rounded-xl border ${
                viewerAnswer?.isUnique
                  ? "border-emerald-400/50 bg-emerald-950/40"
                  : viewerAnswer
                  ? "border-slate-600 bg-slate-800/40"
                  : "border-slate-700/50 bg-slate-900/30"
              } p-3`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400">
                    {cat.category}
                  </p>
                  {viewerAnswer ? (
                    <p className={`mt-0.5 truncate text-sm font-bold ${
                      viewerAnswer.isUnique && viewerAnswer.isValid !== false
                        ? "text-emerald-300"
                        : viewerAnswer.isUnique && viewerAnswer.isValid === false
                        ? "text-rose-400"
                        : "text-slate-400"
                    }`}>
                      {viewerAnswer.answer || <span className="italic opacity-50">no answer</span>}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm italic text-slate-600">no answer</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {viewerAnswer?.isUnique && viewerAnswer.isValid !== false ? (
                    <span className="inline-flex items-center rounded-md border border-emerald-400/50 bg-emerald-500/20 px-2 py-0.5 text-[0.65rem] font-black text-emerald-300">
                      +2
                    </span>
                  ) : viewerAnswer?.isUnique && viewerAnswer.isValid === false ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      invalid
                    </span>
                  ) : viewerAnswer && viewerAnswer.isUnique === false ? (
                    <span className="text-[0.65rem] font-black text-slate-500">dup</span>
                  ) : null}
                </div>
              </div>
              {/* Other answers */}
              {cat.answers.filter((a) => a.userId !== userId).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {cat.answers
                    .filter((a) => a.userId !== userId)
                    .map((a) => (
                      <span
                        key={a.userId}
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold ${
                          a.isUnique
                            ? "border-emerald-700/50 text-emerald-400/70"
                            : "border-slate-700 text-slate-600"
                        }`}
                      >
                        {a.answer}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Leaderboard */}
      {results.totals.length > 0 && (
        <>
          <p className={`${TEXT_LABEL} mt-2`}>Round leaderboard</p>
          <div className="space-y-1.5">
            {results.totals
              .slice()
              .sort((a, b) => b.points - a.points)
              .map((entry, i) => (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    entry.userId === userId
                      ? `border-emerald-400/50 bg-emerald-950/40`
                      : "border-slate-700/50 bg-slate-900/30"
                  }`}
                >
                  <span className="w-5 text-center text-xs font-black text-slate-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">
                    {entry.username}
                    {entry.userId === userId ? (
                      <span className={`ml-1 text-[0.6rem] font-black uppercase tracking-widest ${TEXT_ACCENT}`}> you</span>
                    ) : null}
                  </span>
                  <span className={`text-base font-black tabular-nums ${entry.userId === userId ? TEXT_ACCENT : "text-slate-300"}`}>
                    {entry.points}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Answering screen ──────────────────────────────────────────────────────────

type SubmitState = "idle" | "submitting" | "done" | "error";

function AnsweringScreen({
  letter,
  categories,
  roundId,
  timeRemaining,
  venueId,
}: {
  letter: string;
  categories: string[];
  roundId: string;
  timeRemaining: number;
  venueId: string;
}) {
  const [answers, setAnswers] = useState<string[]>(() => Array(12).fill(""));
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const submittedRef = useRef(false);
  const timerWasZeroRef = useRef(false);

  const isExpired = timeRemaining <= 0;
  const isUrgent = timeRemaining > 0 && timeRemaining <= 30;
  const totalFilled = answers.filter((a) => a.trim().length > 0).length;

  const submitAnswers = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitState("submitting");
    setErrorMsg("");

    try {
      const filled = answers
        .map((a, i) => ({ categoryIndex: i, answer: a.trim() }))
        .filter((e) => e.answer.length > 0);

      await Promise.all(
        filled.map(({ categoryIndex, answer }) =>
          fetch(`/api/category-blitz/rounds/${roundId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ venueId, categoryIndex, answer }),
          })
        )
      );
      setSubmitState("done");
    } catch {
      submittedRef.current = false;
      setSubmitState("error");
      setErrorMsg("Submission failed. Please try again.");
    }
  }, [answers, roundId, venueId]);

  const submitAnswersRef = useRef(submitAnswers);

  useEffect(() => {
    submitAnswersRef.current = submitAnswers;
  });

  // Auto-submit when timer hits zero — deferred so the effect doesn't trigger cascading state updates.
  useEffect(() => {
    if (!isExpired || timerWasZeroRef.current || submitState !== "idle") return;
    timerWasZeroRef.current = true;
    const t = window.setTimeout(() => { void submitAnswersRef.current(); }, 0);
    return () => window.clearTimeout(t);
  }, [isExpired, submitState]);

  if (submitState === "done") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <div className={`w-full max-w-sm rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-6 text-center`}>
          <p className={TEXT_LABEL}>Answers submitted</p>
          <p className="mt-3 text-xl font-black text-white">
            {totalFilled === 0 ? "No answers recorded." : `${totalFilled} answer${totalFilled !== 1 ? "s" : ""} submitted!`}
          </p>
          <p className="mt-2 text-sm text-emerald-100/70">Waiting for scoring…</p>
          <div className="mt-4 flex justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-400/40 border-t-emerald-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Sticky header */}
      <div className={`shrink-0 border-b ${BORDER_ACTIVE} bg-slate-950/90 px-4 py-3`}>
        <div className="flex items-center gap-3">
          {/* Letter badge */}
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${LETTER_GRADIENT} shadow-[0_0_18px_rgba(16,185,129,0.35)]`}
          >
            <span
              className="text-4xl font-black leading-none text-slate-950"
              style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
            >
              {letter}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className={TEXT_LABEL}>Letter for this round</p>
            <p className="text-xs text-slate-400">
              {totalFilled}/{categories.length} filled
            </p>
          </div>
          {/* Timer */}
          <div className="shrink-0 text-right">
            <p
              className={`text-3xl font-black tabular-nums leading-none ${
                isUrgent ? "animate-pulse text-rose-400" : TEXT_ACCENT
              }`}
            >
              {formatMmSs(timeRemaining)}
            </p>
            <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-500">remaining</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isUrgent ? "bg-rose-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.max(0, Math.min(100, (timeRemaining / 180) * 100))}%` }}
          />
        </div>
      </div>

      {/* Categories grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-2">
          {categories.map((category, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-xl border ${
                answers[i].trim()
                  ? "border-emerald-400/50 bg-emerald-950/30"
                  : "border-slate-700/60 bg-slate-900/40"
              } px-3 py-2.5`}
            >
              <span className="w-5 shrink-0 text-center text-[0.65rem] font-black text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.68rem] font-black uppercase tracking-widest text-slate-400">
                  {category}
                </p>
                <input
                  type="text"
                  value={answers[i]}
                  disabled={isExpired || submitState !== "idle"}
                  onChange={(e) => {
                    const next = [...answers];
                    next[i] = e.target.value;
                    setAnswers(next);
                  }}
                  placeholder={`${letter}…`}
                  className={`mt-0.5 w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-600 ${
                    answers[i].trim() ? "text-emerald-200" : "text-white"
                  } disabled:opacity-50`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="words"
                  spellCheck={false}
                />
              </div>
              {answers[i].trim() && (
                <span className="shrink-0 text-emerald-400/70">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit button */}
      {submitState === "idle" && !isExpired && (
        <div className="shrink-0 border-t border-emerald-400/20 px-4 py-3">
          {errorMsg && (
            <p className="mb-2 text-center text-xs font-semibold text-rose-400">{errorMsg}</p>
          )}
          <button
            type="button"
            onClick={() => void submitAnswers()}
            disabled={submitState !== "idle" || totalFilled === 0}
            className={`w-full rounded-xl py-3.5 text-sm font-black uppercase tracking-[0.1em] text-slate-950 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${LETTER_GRADIENT}`}
          >
            Submit Answers ({totalFilled}/{categories.length})
          </button>
        </div>
      )}

      {submitState === "submitting" && (
        <div className="shrink-0 border-t border-emerald-400/20 px-4 py-4 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400/40 border-t-emerald-400" />
            <p className="text-sm font-bold text-emerald-300">Submitting…</p>
          </div>
        </div>
      )}

      {submitState === "error" && (
        <div className="shrink-0 border-t border-rose-400/20 px-4 py-3">
          <p className="mb-2 text-center text-xs font-semibold text-rose-400">{errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              submittedRef.current = false;
              setSubmitState("idle");
            }}
            className="w-full rounded-xl border border-rose-400/50 bg-rose-500/20 py-3 text-sm font-black text-rose-300"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export function CategoryBlitzGame() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [venueId, setVenueId] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const hydrateId = window.setTimeout(() => {
      setVenueId(getVenueId() ?? "");
      setUsername(getUsername() ?? null);
      setUserId(getUserId() ?? "");
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrateId);
  }, []);

  const { phase, round, results, timeRemaining, nextRoundStartsIn, error } = useCategoryBlitzSession(isHydrated ? venueId : "");

  if (!isHydrated) {
    return (
      <div
        className="flex flex-col overflow-hidden bg-slate-950 text-white"
        style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
      >
        <div className={`shrink-0 border-b ${BORDER_ACTIVE} bg-slate-950 px-4 py-3`}>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-slate-600" />
            <p className={`text-[0.7rem] font-black uppercase tracking-[0.16em] ${TEXT_ACCENT}`}>
              Category Blitz
            </p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
          <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
            <p className={TEXT_LABEL}>Loading game status</p>
            <p className="mt-3 text-sm text-slate-400">Checking your venue session and current schedule…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!venueId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
        <p className="text-sm text-slate-400">No venue session. Return to your venue page.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-2xl border border-rose-400/40 bg-slate-900 p-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-300">Connection error</p>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden bg-slate-950 text-white"
      style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
    >
      {/* Header bar */}
      <div className={`shrink-0 border-b ${BORDER_ACTIVE} bg-slate-950 px-4 py-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                phase === "answering"
                  ? "animate-pulse bg-emerald-400"
                  : phase === "lobby"
                  ? "animate-pulse bg-amber-400"
                  : phase === "results" || phase === "scoring"
                  ? "bg-cyan-400"
                  : "bg-slate-600"
              }`}
            />
            <p className={`text-[0.7rem] font-black uppercase tracking-[0.16em] ${TEXT_ACCENT}`}>
              {phase === "idle" ? "Category Blitz" : phase === "lobby" ? "Lobby" : phase === "answering" ? "Round Active" : phase === "scoring" ? "Scoring" : phase === "results" ? "Results" : "Game Over"}
            </p>
          </div>
          {(phase === "results" || phase === "scoring") && (
            <div className="text-right">
              <p className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-slate-500">Next Round</p>
              <p className={`text-sm font-black tabular-nums ${TEXT_ACCENT}`}>
                {nextRoundStartsIn != null ? formatMmSs(nextRoundStartsIn) : "Waiting"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Phase content */}
      {phase === "idle" && <IdleScreen venueId={venueId} />}
      {phase === "lobby" && <LobbyScreen username={username} />}
      {phase === "answering" && round && (
        <AnsweringScreen
          letter={round.letter}
          categories={round.categories}
          roundId={round.id}
          timeRemaining={timeRemaining}
          venueId={venueId}
        />
      )}
      {phase === "scoring" && <ScoringScreen />}
      {phase === "results" && results && (
        <ResultsScreen results={results} userId={userId} nextRoundStartsIn={nextRoundStartsIn} />
      )}
      {phase === "complete" && <CompleteScreen />}
    </div>
  );
}
