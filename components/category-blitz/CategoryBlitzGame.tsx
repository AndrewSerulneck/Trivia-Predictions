"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { getUserId, getVenueId, getUsername } from "@/lib/storage";
import { useCategoryBlitzSession, type CategoryBlitzPhase } from "@/lib/categoryBlitzRealtime";
import { isCategoryBlitzTestModeEnabled, setCategoryBlitzTestMode } from "@/lib/categoryBlitzTestMode";
import { answerStartsWithLetter } from "@/lib/categoryBlitzShared";
import { CB_LETTER_BADGE_LAYOUT_ID, cbCategoryRowLayoutId } from "@/lib/categoryBlitzMotion";
import { EASE_SNAP } from "@/lib/motionEasing";
import { VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";
import { GameOnboardingCard } from "@/components/venue/GameIdentityPanel";
import GradingCascade, { type GradingAnswer } from "@/components/category-blitz/GradingCascade";
import RoundStartReveal from "@/components/category-blitz/RoundStartReveal";
import LiveLeaderboard from "@/components/category-blitz/LiveLeaderboard";
import ValidAnswerGlow from "@/components/category-blitz/ValidAnswerGlow";
import WrongLetterReject from "@/components/category-blitz/WrongLetterReject";
import TimerUrgency from "@/components/category-blitz/TimerUrgency";
import SubmitLockAnimation from "@/components/category-blitz/SubmitLockAnimation";
import NextRoundCountdown from "@/components/category-blitz/NextRoundCountdown";
import SessionCompleteFireworks from "@/components/category-blitz/SessionCompleteFireworks";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";
import DevAnimationPanel from "@/components/category-blitz/DevAnimationPanel";
import { RankBadge } from "@/components/trivia/RankBadge";
import type { CategoryBlitzRoundResults } from "@/types";

const LOBBY_TUTORIAL_ROTATE_MS = 6000;

const LETTER_GRADIENT =
  "bg-[linear-gradient(132deg,#10b981_0%,#22c55e_50%,#14b8a6_100%)]";
const BORDER_ACTIVE = "border-emerald-400/60";
const BORDER_CARD = "border-emerald-400/30";
const TEXT_ACCENT = "text-emerald-300";
const TEXT_LABEL = "text-emerald-300 tracking-[0.14em] uppercase font-black text-xs";

/** Matches RoundStartReveal's LAYOUT_MORPH_TRANSITION so the badge/row FLIP
 *  uses the same branded easing on both ends of the reveal → gameplay morph. */
const LAYOUT_MORPH_TRANSITION = { duration: 0.45, ease: EASE_SNAP } as const;

/** Fade-in for gameplay chrome that has no reveal counterpart (invite banner,
 *  header label, timer, progress bar) — delayed so it settles in just behind
 *  the badge/row morph instead of popping in the instant the reveal ends. */
const CHROME_ENTRANCE_TRANSITION = { duration: 0.3, ease: EASE_SNAP, delay: 0.12 } as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMmSs(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const REASON_LABEL: Record<string, string> = {
  wrong_letter: "wrong letter",
  invalid: "not valid",
  duplicate: "used by another player",
  pending: "scoring…",
  insufficient_players: "not enough players",
};

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

/**
 * Amber-tinted banner shown when fewer than 3 players are registered for this
 * session. The game works fully (answers are validated, revealed, etc.) but
 * points are only awarded once 3+ players participate — see Phase 1 scoring gate.
 */
function InviteBanner({ playerCount }: { playerCount?: number }) {
  if (playerCount === undefined || playerCount > 2) return null;

  const message =
    playerCount === 1
      ? "Playing solo — game works fully, but you need 3+ players to score points. Invite a friend!"
      : `Playing with ${playerCount} friends — game works fully, but you need 3+ players to score points. Invite a friend!`;

  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-center text-[0.65rem] font-semibold leading-snug text-amber-200/90">
      {message}
    </div>
  );
}

function LobbyScreen({
  username,
  lobbyCountdown,
  playerCount,
}: {
  username: string | null;
  lobbyCountdown: number | null;
  playerCount?: number;
}) {
  const steps = VENUE_GAME_CARD_BY_KEY["category-blitz"].steps;
  const [stepIndex, setStepIndex] = useState(0);

  // Auto-rotate the same rules cards shown before a player's first game, so
  // returning players who skip the tutorial (via the 7-day recency check)
  // still see the rules refreshed while they wait.
  useEffect(() => {
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, LOBBY_TUTORIAL_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [steps.length]);

  const isUrgent = lobbyCountdown != null && lobbyCountdown <= 10;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-4 py-6">
      <InviteBanner playerCount={playerCount} />
      <div className={`w-full max-w-sm rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-5 text-center`}>
        <p className={TEXT_LABEL}>You&apos;re in the lobby</p>
        {username ? <p className="mt-1 text-lg font-bold text-emerald-200">{username}</p> : null}
        {lobbyCountdown != null ? (
          <>
            <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Game starts in</p>
            <p
              className={`mt-1 font-black tabular-nums text-[2.6rem] leading-none ${
                isUrgent ? "animate-pulse text-rose-400" : TEXT_ACCENT
              }`}
            >
              {formatMmSs(lobbyCountdown)}
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-xl font-black text-white">Waiting for host</p>
            <p className="mt-2 text-sm text-emerald-100/80">
              The host will start a round shortly. Keep this screen open — the letter and categories will appear automatically.
            </p>
          </>
        )}
        <div className={`mt-4 inline-flex items-center gap-2 rounded-full border ${BORDER_ACTIVE} bg-emerald-950/30 px-3 py-1.5 text-xs font-black uppercase tracking-widest ${TEXT_ACCENT}`}>
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Ready
        </div>
      </div>

      <div className="relative h-60 w-full max-w-sm shrink-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 h-full w-full"
          >
            <GameOnboardingCard gameKey="category-blitz" step={steps[stepIndex]} stepIndex={stepIndex} className="h-full w-full" />
          </motion.div>
        </AnimatePresence>
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

/**
 * Final game-over screen: viewer's own score banner, a top-3 podium (plus a
 * pinned rank row if the viewer placed outside it), and a stats bar showing
 * final rank + rank movement across the session. Modeled on Live Trivia's
 * post-game podium block — see docs/category-blitz-scoring-and-bugfix-plan.md
 * Phase 5.
 */
function CompleteScreen({
  results,
  userId,
  rankGained,
}: {
  results: CategoryBlitzRoundResults | null;
  userId: string;
  rankGained: number | null;
}) {
  const standings = (results?.totals ?? []).slice().sort((a, b) => b.points - a.points);

  if (standings.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
          <p className={TEXT_LABEL}>Game over</p>
          <p className="mt-3 text-xl font-black text-white">The session has ended.</p>
          <p className="mt-2 text-sm text-slate-400">Thanks for playing!</p>
        </div>
      </div>
    );
  }

  const viewerRank = standings.findIndex((t) => t.userId === userId);
  const viewerEntry = viewerRank > -1 ? standings[viewerRank] : null;
  const viewerInPodium = viewerRank > -1 && viewerRank < 3;
  const podium = standings.slice(0, 3).map((entry, i) => ({ ...entry, rank: i + 1 }));
  const podiumOrder = [podium[1], podium[0], podium[2]];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-6">
      {/* Viewer's own final score */}
      <div className={`flex items-center gap-3 rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 px-4 py-4`}>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${LETTER_GRADIENT}`}>
          <span className="text-2xl leading-none">🏁</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={TEXT_LABEL}>{viewerRank === 0 ? "Game Over · Champion" : "Game Over"}</p>
          <p className="truncate text-lg font-black leading-tight text-white">{viewerEntry?.username ?? "You"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-3xl font-black tabular-nums leading-none ${TEXT_ACCENT}`}>
            {viewerEntry?.points ?? 0}
          </p>
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-600/80">Points</p>
        </div>
      </div>

      {/* Final standings podium */}
      <div className={`rounded-2xl border ${BORDER_CARD} bg-slate-900/70 px-4 py-4`}>
        <p className={`${TEXT_LABEL} mb-3`}>Final Standings</p>
        <div className="flex items-end justify-center gap-2">
          {podiumOrder.map((entry, slot) => {
            if (!entry) return <div key={`empty-${slot}`} className="flex-1" />;
            const isMe = entry.userId === userId;
            const cardClass =
              entry.rank === 1
                ? "min-h-36 border-emerald-400/60 bg-emerald-500/15"
                : entry.rank === 2
                ? "min-h-28 border-slate-600 bg-slate-800/50"
                : "min-h-24 border-slate-700 bg-slate-800/30";
            return (
              <div
                key={entry.userId}
                className={`flex flex-1 flex-col items-center justify-end gap-1.5 rounded-xl border px-2 pb-3 pt-3 text-center ${cardClass} ${
                  isMe ? "ring-2 ring-emerald-400" : ""
                }`}
              >
                <RankBadge rank={entry.rank} />
                <p className="w-full truncate text-xs font-bold text-slate-100">
                  {entry.username}
                  {isMe && <span className="ml-1 text-[9px] font-black uppercase text-emerald-400/80">you</span>}
                </p>
                <p className="text-lg font-black tabular-nums text-white">{entry.points}</p>
              </div>
            );
          })}
        </div>

        {!viewerInPodium && viewerEntry && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-2.5">
            <RankBadge rank={viewerRank + 1} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-emerald-100">
              {viewerEntry.username}
              <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400/70">you</span>
            </span>
            <span className="shrink-0 text-base font-black tabular-nums text-white">{viewerEntry.points}</span>
          </div>
        )}
      </div>

      {/* Stats bar: final rank + rank movement across the session */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center rounded-2xl border border-emerald-400/30 bg-emerald-600/15 py-3">
          <span className="text-xl font-black tabular-nums text-emerald-300">
            {rankGained != null
              ? rankGained > 0
                ? `▲ ${rankGained}`
                : rankGained < 0
                ? `▼ ${Math.abs(rankGained)}`
                : "—"
              : "—"}
          </span>
          <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-600">Rank Gained</span>
        </div>
        <div className="flex flex-col items-center rounded-2xl border border-cyan-400/30 bg-cyan-600/15 py-3">
          <span className="text-xl font-black tabular-nums text-cyan-300">
            {viewerRank > -1 ? `#${viewerRank + 1}` : "—"}
          </span>
          <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-cyan-600">Final Rank</span>
        </div>
      </div>

      <p className="pb-2 text-center text-xs text-slate-500">Thanks for playing! Your points have been awarded.</p>
    </div>
  );
}

// ── Results screen ────────────────────────────────────────────────────────────

function ResultsScreen({
  results,
  userId,
  nextRoundStartsIn,
  playerCount,
  leaderboardExiting = false,
}: {
  results: CategoryBlitzRoundResults;
  userId: string;
  nextRoundStartsIn: number | null;
  playerCount?: number;
  leaderboardExiting?: boolean;
}) {
  const standings = results.totals.slice().sort((a, b) => b.points - a.points);
  const top10 = standings.slice(0, 10);
  const viewerRank = standings.findIndex((t) => t.userId === userId);
  const viewerInTop10 = viewerRank > -1 && viewerRank < 10;
  const viewerEntry = viewerRank > -1 ? standings[viewerRank] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      <InviteBanner playerCount={playerCount} />
      <IntermissionStatus nextRoundStartsIn={nextRoundStartsIn} />

      {/* Live Leaderboard with count-up, rank reorder, and point-gain flash */}
      <div className={`rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-4`}>
        <p className={`${TEXT_LABEL} text-center`}>Leaderboard</p>
        <div className="mt-3">
          <LiveLeaderboard entries={results.totals} meId={userId} exiting={leaderboardExiting} />
        </div>
      </div>

      {/* Category breakdown — kept underneath the leaderboard */}
      <p className={`${TEXT_LABEL} mt-1`}>Letter: {results.letter}</p>
      <div className="space-y-2">
        {results.results.map((cat) => {
          const viewerAnswer = cat.answers.find((a) => a.userId === userId);
          const reason = viewerAnswer?.reason;
          return (
            <div
              key={cat.categoryIndex}
              className={`rounded-xl border ${
                reason === "correct"
                  ? "border-emerald-400/50 bg-emerald-950/40"
                  : reason === "wrong_letter" || reason === "invalid"
                  ? "border-rose-500/50 bg-rose-950/30"
                  : reason === "insufficient_players"
                  ? "border-amber-400/50 bg-amber-950/40"
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
                      reason === "correct"
                        ? "text-emerald-300"
                        : reason === "wrong_letter" || reason === "invalid"
                        ? "text-rose-400"
                        : reason === "insufficient_players"
                        ? "text-amber-300"
                        : "text-slate-400"
                    }`}>
                      {viewerAnswer.answer || <span className="italic opacity-50">no answer</span>}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm italic text-slate-600">no answer</p>
                  )}
                  {viewerAnswer && reason && reason !== "correct" ? (
                    <p className={`mt-0.5 text-[0.65rem] font-semibold ${
                      reason === "insufficient_players"
                        ? "text-amber-300/80"
                        : "text-rose-300/80"
                    }`}>
                      {REASON_LABEL[reason] ?? reason}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {reason === "correct" ? (
                    <span className="inline-flex items-center rounded-md border border-emerald-400/50 bg-emerald-500/20 px-2 py-0.5 text-[0.65rem] font-black text-emerald-300">
                      +2
                    </span>
                  ) : reason === "wrong_letter" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      wrong letter
                    </span>
                  ) : reason === "invalid" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      invalid
                    </span>
                  ) : reason === "duplicate" ? (
                    <span className="text-[0.65rem] font-black text-slate-500">dup</span>
                  ) : reason === "insufficient_players" ? (
                    <span className="inline-flex items-center rounded-md border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-black text-amber-300">
                      no contest
                    </span>
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
    </div>
  );
}

// ── Answering screen ──────────────────────────────────────────────────────────

type SubmitState = "idle" | "submitting" | "done" | "error";

/** Debounce delay before an in-progress answer is autosaved to the server. */
const AUTOSAVE_DEBOUNCE_MS = 600;

export function AnsweringScreen({
  letter,
  categories,
  roundId,
  timeRemaining,
  venueId,
  userId,
  isSpectating,
  playerCount,
}: {
  letter: string;
  categories: string[];
  roundId: string;
  timeRemaining: number;
  venueId: string;
  userId: string;
  isSpectating: boolean;
  playerCount?: number;
}) {
  const [answers, setAnswers] = useState<string[]>(() => Array(12).fill(""));
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const submittedRef = useRef(false);
  const timerWasZeroRef = useRef(false);
  // Per-category debounce timers + last-autosaved value, so a slow network or
  // dropped tab doesn't lose an answer that was typed but never manually
  // submitted — each field autosaves shortly after the user stops typing,
  // reusing the same per-category upsert the final submit already uses.
  const autosaveTimersRef = useRef<Array<number | null>>(Array(12).fill(null));
  const lastAutosavedRef = useRef<string[]>(Array(12).fill(""));

  const isExpired = timeRemaining <= 0;
  const isUrgent = timeRemaining > 0 && timeRemaining <= 30;
  const totalFilled = answers.filter((a) => a.trim().length > 0).length;

  const autosaveAnswer = useCallback(
    (categoryIndex: number, answer: string) => {
      if (!answer || lastAutosavedRef.current[categoryIndex] === answer) return;
      lastAutosavedRef.current[categoryIndex] = answer;
      void fetch(`/api/category-blitz/rounds/${roundId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, userId, categoryIndex, answer }),
      }).catch(() => {
        // Best-effort — if this fails, the final submit-on-expiry resends
        // every filled category anyway, so nothing is silently lost.
      });
    },
    [roundId, venueId, userId]
  );

  useEffect(() => {
    const timers = autosaveTimersRef.current;
    return () => {
      for (const t of timers) if (t !== null) window.clearTimeout(t);
    };
  }, []);

  const submitAnswers = useCallback(async () => {
    if (submittedRef.current || isSpectating) return;
    submittedRef.current = true;
    setSubmitState("submitting");
    setErrorMsg("");

    const timers = autosaveTimersRef.current;
    for (let i = 0; i < timers.length; i++) {
      if (timers[i] !== null) {
        window.clearTimeout(timers[i]!);
        timers[i] = null;
      }
    }

    try {
      const filled = answers
        .map((a, i) => ({ categoryIndex: i, answer: a.trim() }))
        .filter((e) => e.answer.length > 0);

      await Promise.all(
        filled.map(({ categoryIndex, answer }) =>
          fetch(`/api/category-blitz/rounds/${roundId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ venueId, userId, categoryIndex, answer }),
          })
        )
      );
      setSubmitState("done");
    } catch {
      submittedRef.current = false;
      setSubmitState("error");
      setErrorMsg("Submission failed. Please try again.");
    }
  }, [answers, roundId, venueId, userId, isSpectating]);

  const submitAnswersRef = useRef(submitAnswers);

  useEffect(() => {
    submitAnswersRef.current = submitAnswers;
  });

  // Auto-submit when timer hits zero — deferred so the effect doesn't trigger cascading state updates.
  useEffect(() => {
    if (!isExpired || timerWasZeroRef.current || submitState !== "idle" || isSpectating) return;
    timerWasZeroRef.current = true;
    const t = window.setTimeout(() => { void submitAnswersRef.current(); }, 0);
    return () => window.clearTimeout(t);
  }, [isExpired, submitState, isSpectating]);

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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {submitState === "submitting" && (
        <SubmitLockAnimation answersCount={totalFilled} />
      )}
      <motion.div
        className="shrink-0 px-4 pt-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={CHROME_ENTRANCE_TRANSITION}
      >
        <InviteBanner playerCount={playerCount} />
      </motion.div>
      {/* Sticky header — its bar (border/background/position) stays static so
          it doesn't shift the badge's projected target mid-morph; only the
          content INSIDE it (label, timer, progress) fades in, staggered
          slightly behind the badge/row morph so the handoff reads as one
          sequenced beat rather than shared elements morphing while
          everything else pops in instantly. */}
      <div className={`shrink-0 border-b ${BORDER_ACTIVE} bg-slate-950/90 px-4 py-3`}>
        <div className="flex items-center gap-3">
          {/* Letter badge — shares layoutId with the reveal badge so the
              round-start reveal morphs its big centered badge down into this
              header slot instead of cutting. */}
          <motion.div
            layoutId={CB_LETTER_BADGE_LAYOUT_ID}
            transition={{ layout: LAYOUT_MORPH_TRANSITION }}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${LETTER_GRADIENT} shadow-[0_0_18px_rgba(16,185,129,0.35)]`}
          >
            <span className="font-['Bree_Serif',_Nunito,_serif] text-4xl font-black leading-none text-slate-950">
              {letter}
            </span>
          </motion.div>
          <motion.div
            className="min-w-0 flex-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={CHROME_ENTRANCE_TRANSITION}
          >
            <p className={TEXT_LABEL}>Letter for this round</p>
            <p className="text-xs text-slate-400">
              {totalFilled}/{categories.length} filled
            </p>
          </motion.div>
          {/* Timer */}
          <motion.div
            className="shrink-0 text-right"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={CHROME_ENTRANCE_TRANSITION}
          >
            <TimerUrgency timeRemaining={timeRemaining} label={formatMmSs(timeRemaining)} />
            <p className="text-[0.6rem] font-black uppercase tracking-widest text-slate-500">remaining</p>
          </motion.div>
        </div>
        {/* Progress bar */}
        <motion.div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={CHROME_ENTRANCE_TRANSITION}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isUrgent ? "bg-rose-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.max(0, Math.min(100, (timeRemaining / 180) * 100))}%` }}
          />
        </motion.div>
      </div>

      {isSpectating && (
        <div className="shrink-0 border-b-2 border-amber-400/60 bg-amber-500/15 px-4 py-3 text-center">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300">
            You&apos;re spectating this round
          </p>
          <p className="mt-1 text-xs text-amber-100/80">
            You joined mid-round, so you can&apos;t play this one — you&apos;ll be able to play starting next round.
          </p>
        </div>
      )}

      {/* Categories grid */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-2">
          {categories.map((category, i) => {
            const filled = answers[i].trim().length > 0;
            const wrongLetter = filled && !answerStartsWithLetter(answers[i], letter);
            const inputRow = (
              <div
                className={`relative flex items-center gap-2 rounded-xl border ${
                  wrongLetter
                    ? "border-rose-500/70 bg-rose-950/30"
                    : filled
                    ? "border-emerald-400/50 bg-emerald-950/30"
                    : "border-slate-700/60 bg-slate-900/40"
                } px-3 py-2.5 ${isSpectating ? "opacity-50" : ""}`}
              >
                {/* Valid answer glow + checkmark pop feedback */}
                {!wrongLetter && filled ? (
                  <ValidAnswerGlow key={answers[i]} />
                ) : null}
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
                    disabled={isExpired || submitState !== "idle" || isSpectating}
                    onChange={(e) => {
                      const next = [...answers];
                      next[i] = e.target.value;
                      setAnswers(next);

                      const timers = autosaveTimersRef.current;
                      if (timers[i] !== null) window.clearTimeout(timers[i]!);
                      const trimmed = e.target.value.trim();
                      timers[i] = window.setTimeout(() => {
                        timers[i] = null;
                        autosaveAnswer(i, trimmed);
                      }, AUTOSAVE_DEBOUNCE_MS);
                    }}
                    placeholder={`${letter}…`}
                    className={`mt-0.5 w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-600 ${
                      wrongLetter ? "text-rose-300" : filled ? "text-emerald-200" : "text-white"
                    } disabled:opacity-50`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck={false}
                  />
                </div>
                {wrongLetter && (
                  <span className="shrink-0 text-[0.6rem] font-black uppercase tracking-widest text-rose-400">
                    wrong letter
                  </span>
                )}
              </div>
            );
            return (
              <motion.div
                key={i}
                layoutId={cbCategoryRowLayoutId(i)}
                transition={{ layout: LAYOUT_MORPH_TRANSITION }}
              >
                <WrongLetterReject shakeToken={wrongLetter ? answers[i] : null}>
                  {inputRow}
                </WrongLetterReject>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Autosave footnote — answers save as you type and are graded automatically when the timer ends. */}
      {submitState === "idle" && !isExpired && !isSpectating && (
        <div className="shrink-0 border-t border-emerald-400/20 px-4 py-3">
          {errorMsg && (
            <p className="mb-2 text-center text-xs font-semibold text-rose-400">{errorMsg}</p>
          )}
          <p className="text-center text-xs font-semibold uppercase tracking-[0.1em] text-emerald-300/70">
            Answers save automatically — graded when the timer runs out
          </p>
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
              void submitAnswers();
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

// ── Header ────────────────────────────────────────────────────────────────────

function Header({
  phase,
  error,
  onBack,
}: {
  phase?: CategoryBlitzPhase;
  error?: string | null;
  onBack?: () => void;
}) {
  return (
    <div className={`shrink-0 border-b ${BORDER_ACTIVE} bg-slate-950 px-4 py-3`}>
      <div className="flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to venue"
            className="tp-clean-button -ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-slate-300 transition-colors hover:text-white"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
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
          {phase === "lobby" ? "Lobby" : phase === "answering" ? "Round Active" : phase === "scoring" ? "Scoring" : phase === "results" ? "Results" : phase === "complete" ? "Game Over" : "Category Blitz"}
        </p>
        {error && (
          <span className="ml-auto text-[0.6rem] font-black uppercase tracking-widest text-rose-400">
            Reconnecting…
          </span>
        )}
      </div>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export function CategoryBlitzGame({ onBack }: { onBack?: () => void } = {}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [venueId, setVenueId] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    const hydrateId = window.setTimeout(() => {
      setVenueId(getVenueId() ?? "");
      setUsername(getUsername() ?? null);
      setUserId(getUserId() ?? "");
      setTestMode(isCategoryBlitzTestModeEnabled());
      setIsHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrateId);
  }, []);

  const toggleTestMode = useCallback(() => {
    setTestMode((prev) => {
      const next = !prev;
      setCategoryBlitzTestMode(next);
      return next;
    });
  }, []);

  const { phase, session, round, results, timeRemaining, nextRoundStartsIn, lobbyCountdown, error, errorEscalated, viewerRole, retry, markRevealDone } = useCategoryBlitzSession(
    isHydrated ? venueId : "",
    isHydrated ? userId : ""
  );
  const { triggerAnimation } = useAnimationTrigger();

  // Phase 5 stats bar: snapshot the viewer's rank the first time this session
  // produces results with them in it, so the game-over screen can show how far
  // they climbed/fell (rankGained = firstRank - finalRank, positive = climbed).
  // Keyed on session.id (not a plain boolean) so it resets cleanly if another
  // session starts in the same page lifetime. State (not a ref) because the
  // value feeds the render below — refs can't be read during render.
  const [firstRank, setFirstRank] = useState<{ sessionId: string; rank: number } | null>(null);
  if (results && userId && session?.id && firstRank?.sessionId !== session.id) {
    const standings = results.totals.slice().sort((a, b) => b.points - a.points);
    const rank = standings.findIndex((t) => t.userId === userId);
    if (rank !== -1) setFirstRank({ sessionId: session.id, rank: rank + 1 });
  }
  const rankGained = useMemo(() => {
    if (!results || !userId || !firstRank || firstRank.sessionId !== session?.id) return null;
    const standings = results.totals.slice().sort((a, b) => b.points - a.points);
    const finalRank = standings.findIndex((t) => t.userId === userId);
    if (finalRank === -1) return null;
    return firstRank.rank - (finalRank + 1);
  }, [results, userId, session?.id, firstRank]);

  // Round start reveal: play the letter drop + category cascade once per round
  // when we enter the answering phase, then transition to the answer input.
  const [revealedRoundId, setRevealedRoundId] = useState<string | null>(null);
  const showReveal = phase === "answering" && !!round && round.id !== revealedRoundId;

  // Live grading reveal: play the cascade once per round when its results land,
  // then hand off to the full ResultsScreen. Keyed on roundId so it fires for
  // each new round but not on the 15s intermission re-polls.
  const [gradedRoundId, setGradedRoundId] = useState<string | null>(null);

  // The viewer's OWN answers, one row per category they answered — the
  // emotionally relevant set to watch get graded. Memoized so the ~4x/sec
  // timer re-renders don't hand GradingCascade a fresh array and stall its
  // internal reveal timers.
  const gradingAnswers: GradingAnswer[] = useMemo(() => {
    if (!results || !userId) return [];
    return results.results.flatMap((cat) => {
      const mine = cat.answers.find((a) => a.userId === userId);
      if (!mine) return [];
      return [{
        category: cat.category,
        answer: mine.answer,
        reason: mine.reason,
        explanation: mine.explanation,
        points: mine.pointsAwarded,
      }];
    });
  }, [results, userId]);

  const showCascade =
    phase === "results" &&
    !!results &&
    results.roundId !== gradedRoundId &&
    gradingAnswers.length > 0;

  // Phase 4 ENTER transition: once the cascade finishes revealing every
  // answer, it plays its own exit animation (rows accelerate up/out, ACCEL
  // curve) for 200ms — during that same window ResultsScreen mounts
  // underneath and its leaderboard rows snap in (SNAP curve), so the handoff
  // reads as one coordinated beat instead of an abrupt cut. See
  // docs/category-blitz-scoring-and-bugfix-plan.md Phase 4.
  const [cascadeExiting, setCascadeExiting] = useState(false);
  useEffect(() => {
    if (!cascadeExiting) return;
    const id = window.setTimeout(() => {
      setGradedRoundId(results?.roundId ?? null);
      setCascadeExiting(false);
    }, 200);
    return () => window.clearTimeout(id);
  }, [cascadeExiting, results]);

  // Next-round countdown: a full-screen "get ready" beat for the final 5s of
  // intermission, after the grading cascade has finished. Keyed on roundId so
  // it plays once per round's intermission rather than retriggering on every
  // 250ms timer tick while nextRoundStartsIn sits at/under the threshold.
  const [countdownDoneRoundId, setCountdownDoneRoundId] = useState<string | null>(null);
  const NEXT_ROUND_COUNTDOWN_THRESHOLD_SECONDS = 5;

  // Memoized so the ~4x/sec timer re-renders don't hand NextRoundCountdown a
  // fresh onZero identity on every tick and stall its internal setTimeout
  // (same pattern as gradingAnswers above — see GradingCascade comment).
  const handleCountdownZero = useCallback(() => {
    setCountdownDoneRoundId(results?.roundId ?? null);
  }, [results]);
  const showNextRoundCountdown =
    phase === "results" &&
    !!results &&
    !showCascade &&
    nextRoundStartsIn !== null &&
    nextRoundStartsIn > 0 &&
    nextRoundStartsIn <= NEXT_ROUND_COUNTDOWN_THRESHOLD_SECONDS &&
    results.roundId !== countdownDoneRoundId;

  // Phase 4 EXIT transition: delay the countdown overlay's actual mount by
  // 200ms so the leaderboard's own exit animation (rows accelerate up/out,
  // triggered immediately below via `leaderboardExiting`) has time to play
  // before the overlay appears on top of it.
  const [countdownOverlayVisible, setCountdownOverlayVisible] = useState(false);
  useEffect(() => {
    if (!showNextRoundCountdown) return;
    const id = window.setTimeout(() => setCountdownOverlayVisible(true), 200);
    return () => {
      window.clearTimeout(id);
      setCountdownOverlayVisible(false);
    };
  }, [showNextRoundCountdown]);

  // True once the session is complete and the viewer placed first.
  const isChampion = useMemo(() => {
    if (!results || results.totals.length === 0) return false;
    const sorted = results.totals.slice().sort((a, b) => b.points - a.points);
    return sorted[0]?.userId === userId;
  }, [results, userId]);

  // The winner gets the same full-screen champion celebration Live Trivia
  // uses (fireworks + trophy + "CATEGORY BLITZ WINNER!") instead of the
  // smaller inline SessionCompleteFireworks overlay below — fired once per
  // session via the global animation trigger (see AnimationTriggerProvider,
  // mounted in app/layout.tsx).
  const championFiredSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "complete" || !session || !isChampion) return;
    if (championFiredSessionRef.current === session.id) return;
    championFiredSessionRef.current = session.id;
    triggerAnimation("CATEGORY_BLITZ_CHAMPION");
  }, [phase, session, isChampion, triggerAnimation]);

  // Game-over celebration: SessionCompleteFireworks holds itself on screen
  // briefly (see its own onDone timer) then reports back so it can be
  // unmounted, revealing the persistent podium/stats CompleteScreen beneath
  // it. Keyed on session.id so a later session's game-over plays again.
  // Skipped entirely for the champion, who gets the full-screen animation
  // above instead — CompleteScreen renders underneath either way.
  const [fireworksDoneSessionId, setFireworksDoneSessionId] = useState<string | null>(null);
  const fireworksDone = fireworksDoneSessionId === session?.id;

  if (!isHydrated) {
    return (
      <div
        className="flex flex-col overflow-hidden bg-slate-950 text-white"
        style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
      >
        <Header onBack={onBack} />
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
      <div
        className="flex flex-col overflow-hidden bg-slate-950 text-white"
        style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
      >
        <Header onBack={onBack} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
          <p className="text-sm text-slate-400">No venue session. Return to your venue page.</p>
        </div>
      </div>
    );
  }

  // Only take over the whole screen with a connection error when there's no
  // usable phase content yet (we've never successfully loaded a session), OR
  // once the failure has persisted long enough to call it a real outage
  // (errorEscalated) rather than a passing network blip — otherwise a single
  // dropped poll would wipe answers and scoring reasons off the screen during
  // intermission for no reason.
  if (error && (phase === "idle" || errorEscalated)) {
    return (
      <div
        className="flex flex-col overflow-hidden bg-slate-950 text-white"
        style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
      >
        <Header phase={phase} error={error} onBack={onBack} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl border border-rose-400/40 bg-slate-900 p-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-300">Connection error</p>
            <p className="mt-2 text-sm text-slate-400">{error}</p>
            {errorEscalated && (
              <>
                <p className="mt-2 text-xs text-slate-500">
                  This has been failing for a while — your game state may be stale.
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 w-full rounded-xl border border-rose-400/50 bg-rose-500/20 py-2.5 text-sm font-black uppercase tracking-wider text-rose-300"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col overflow-hidden bg-slate-950 text-white"
      style={{ height: "var(--tp-vh, 100dvh)", minHeight: "100dvh" }}
    >
      <Header phase={phase} error={error} onBack={onBack} />
      <button
        type="button"
        onClick={toggleTestMode}
        className={`fixed bottom-2 right-2 z-[999] rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
          testMode ? "bg-amber-400 text-slate-950" : "bg-slate-800/80 text-slate-400"
        }`}
      >
        Test mode: {testMode ? "on" : "off"}
      </button>
      {testMode && <DevAnimationPanel />}
      {countdownOverlayVisible && (
        <NextRoundCountdown
          secondsUntilNextRound={nextRoundStartsIn ?? 0}
          onZero={handleCountdownZero}
        />
      )}

      {/* Phase content */}
      {phase === "idle" && <IdleScreen venueId={venueId} />}
      {phase === "lobby" && <LobbyScreen username={username} lobbyCountdown={lobbyCountdown} playerCount={session?.playerCount} />}
      {phase === "answering" && round && (
        showReveal ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
            <RoundStartReveal
              letter={round.letter}
              categories={round.categories}
              onDone={() => {
                setRevealedRoundId(round.id);
                markRevealDone(round.id);
              }}
            />
          </div>
        ) : (
          <AnsweringScreen
            letter={round.letter}
            categories={round.categories}
            roundId={round.id}
            timeRemaining={timeRemaining}
            venueId={venueId}
            userId={userId}
            isSpectating={viewerRole === "spectator"}
            playerCount={session?.playerCount}
          />
        )
      )}
      {phase === "scoring" && <ScoringScreen />}
      {phase === "results" && results && userId && (
        showCascade ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-4">
            <GradingCascade
              answers={gradingAnswers}
              exiting={cascadeExiting}
              onComplete={() => setCascadeExiting(true)}
            />
          </div>
        ) : (
          <ResultsScreen
            results={results}
            userId={userId}
            nextRoundStartsIn={nextRoundStartsIn}
            playerCount={session?.playerCount}
            leaderboardExiting={showNextRoundCountdown}
          />
        )
      )}
      {phase === "complete" && (
        <>
          <AnimatePresence>
            {!fireworksDone && !isChampion && results && results.totals.length > 0 && (
              <SessionCompleteFireworks
                finalStandings={results.totals}
                onDone={() => setFireworksDoneSessionId(session?.id ?? null)}
              />
            )}
          </AnimatePresence>
          <CompleteScreen results={results} userId={userId} rankGained={rankGained} />
        </>
      )}
    </div>
  );
}
