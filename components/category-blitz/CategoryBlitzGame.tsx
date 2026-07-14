"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { getUserId, getVenueId, getUsername } from "@/lib/storage";
import { useScheduleUpdatedFlash } from "@/lib/hooks/useScheduleUpdatedBroadcast";
import ScheduleUpdatedToast from "@/components/ui/ScheduleUpdatedToast";
import { useCategoryBlitzSession, type CategoryBlitzPhase } from "@/lib/categoryBlitzRealtime";
import { isCategoryBlitzTestModeEnabled, setCategoryBlitzTestMode } from "@/lib/categoryBlitzTestMode";
import { answerStartsWithLetter, lobbyDwellSeconds } from "@/lib/categoryBlitzShared";
import { CB_LETTER_BADGE_LAYOUT_ID, cbCategoryRowLayoutId } from "@/lib/categoryBlitzMotion";
import { EASE_SNAP } from "@/lib/motionEasing";
import { VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";
import { type GradingAnswer } from "@/components/category-blitz/GradingCascade";
import RevealSequence from "@/components/category-blitz/RevealSequence";
import RoundStartReveal, { ROUND_START_REVEAL_MAX_MS } from "@/components/category-blitz/RoundStartReveal";
import LiveLeaderboard from "@/components/category-blitz/LiveLeaderboard";
import ValidAnswerGlow from "@/components/category-blitz/ValidAnswerGlow";
import WrongLetterReject from "@/components/category-blitz/WrongLetterReject";
import TimerUrgency from "@/components/category-blitz/TimerUrgency";
import SubmitLockAnimation from "@/components/category-blitz/SubmitLockAnimation";
import IntermissionStatus from "@/components/category-blitz/IntermissionStatus";
import SessionCompleteFireworks from "@/components/category-blitz/SessionCompleteFireworks";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";
import { useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import DevAnimationPanel from "@/components/category-blitz/DevAnimationPanel";
import { RankBadge } from "@/components/trivia/RankBadge";
import { StoryShareLauncher } from "@/components/social-share/StoryShareLauncher";
import { buildCategoryBlitzStorySharePayload } from "@/lib/socialShare/storyPayloads";
import { GAME_THEME } from "@/lib/themeTokens";
import { MODE_CONFIG, getModeFlipTakeoverVariant } from "@/lib/categoryBlitzModes";
import type { CategoryBlitzRoundResults, CategoryBlitzMode } from "@/types";


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
  too_obscure: "only you said this",
  moderated: "flagged",
  pending: "scoring…",
  insufficient_players: "not enough players",
};

/**
 * "Blend In!" (reverse) results card glow — a matched answer glows brighter
 * the more players hit it (docs/category-blitz-mode-b-plan.md Phase 5:
 * "consensus made visible"). `points` is exactly the matching-player count
 * (reverseRoundPoints is the identity function), so it doubles as the glow
 * tier lookup with no separate count needed. Tiers are static Tailwind
 * literals — never interpolated — per lib/themeTokens.ts's scanning rule.
 */
function reverseMatchGlow(points: number): { card: string; badge: string } {
  if (points >= 5) {
    return {
      card: "border-amber-300/70 bg-fuchsia-900/50 shadow-[0_0_22px_rgba(245,158,11,0.55)]",
      badge: "border-amber-300/60 bg-amber-400/20 text-amber-200",
    };
  }
  if (points >= 3) {
    return {
      card: "border-fuchsia-400/60 bg-fuchsia-900/40 shadow-[0_0_14px_rgba(217,70,239,0.4)]",
      badge: "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-200",
    };
  }
  // points === 2 (minimum for "correct" — a match, no glow yet)
  return {
    card: "border-fuchsia-400/40 bg-fuchsia-950/30",
    badge: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-300",
  };
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

/**
 * Fetch the venue's next scheduled Category Blitz window (or null if none is
 * scheduled), matching the main session hook's testMode param (see
 * lib/categoryBlitzRealtime.ts) so this poll and the hook's poll never
 * disagree on which round-duration regime is active. Shared by the idle
 * lobby's "next game in" countdown and the game-over screen's "next game"
 * messaging (Phase 4) so both read the same field the same way.
 */
async function fetchCategoryBlitzNextWindowAt(venueId: string): Promise<number | null> {
  const testModeParam = isCategoryBlitzTestModeEnabled() ? "&testMode=1" : "";
  try {
    const res = await fetch(`/api/category-blitz/sessions?venueId=${encodeURIComponent(venueId)}${testModeParam}`);
    const json = (await res.json()) as { ok: boolean; nextWindowAt?: string | null };
    return json.nextWindowAt ? new Date(json.nextWindowAt).getTime() : null;
  } catch {
    return null;
  }
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

/**
 * Compact bullet list of the game's rules (VENUE_GAME_CARD_BY_KEY["category-blitz"].rules),
 * shown underneath the status card so players can review the rules without
 * having to click through the tutorial slides.
 */
function RulesList() {
  const rules = VENUE_GAME_CARD_BY_KEY["category-blitz"].rules.map((rule) => rule.replace(/^\s*-\s*/, "").trim());
  return (
    <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-4`}>
      <p className={`${TEXT_LABEL} mb-2`}>Gameplay</p>
      <div className="space-y-1.5">
        {rules.map((rule) => (
          <p key={rule} className="text-sm leading-snug text-slate-300">
            • {rule}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Combined pre-game screen for both the "idle" (no active session) and
 * "lobby" (session exists, waiting for host/countdown) phases — the ONLY
 * screen a player lands on before a round starts. Shows the rules as a quick
 * reference; the illustrated tutorial slides only run once, before this
 * lobby, as an overlay on the venue home screen (VenueHubClient) — they must
 * not reappear here. The status card up top reflects whichever of the three
 * pre-game states applies: no game scheduled, a scheduled game counting down
 * to its lobby window, or an open lobby counting down to round start.
 */
function LobbyScreen({
  phase,
  venueId,
  username,
  lobbyCountdown,
  playerCount,
  testMode,
}: {
  phase: "idle" | "lobby";
  venueId: string | null;
  username: string | null;
  lobbyCountdown: number | null;
  playerCount?: number;
  testMode: boolean;
}) {
  const [nextWindowAtMs, setNextWindowAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const refetchNextWindow = useCallback(() => {
    if (phase !== "idle" || !venueId) return;
    void fetchCategoryBlitzNextWindowAt(venueId).then((ms) => setNextWindowAtMs(ms));
  }, [phase, venueId]);

  useEffect(() => {
    refetchNextWindow();
  }, [refetchNextWindow]);

  // An admin creating/editing/deleting a schedule broadcasts "schedule_updated"
  // on this venue's session channel (see lib/categoryBlitzSchedules.ts) — refetch
  // immediately instead of leaving this countdown stuck on whatever was
  // scheduled when this screen first mounted.
  const scheduleJustUpdated = useScheduleUpdatedFlash(
    phase === "idle" && venueId ? `category-blitz-session:${venueId}` : null,
    refetchNextWindow,
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Single continuous target covering both the wait for the schedule window
  // to open AND the lobby dwell after it, so the on-screen countdown never
  // resets partway through. `lobbyCountdown` (from the session hook, once
  // the DB row's `starts_at` is known) is authoritative and takes over the
  // instant it's available; `roundStartAtMs` (computed client-side from the
  // schedule) covers every moment before that, including the entire idle
  // phase where no session row exists yet.
  const roundStartAtMs = nextWindowAtMs != null ? nextWindowAtMs + lobbyDwellSeconds(testMode) * 1000 : null;

  const countdownSeconds =
    lobbyCountdown != null
      ? lobbyCountdown
      : roundStartAtMs != null
        ? Math.max(0, Math.floor((roundStartAtMs - nowMs) / 1000))
        : null;

  const isUrgent = countdownSeconds != null && countdownSeconds <= 10;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto overscroll-contain px-4 py-6">
      {phase === "lobby" ? <InviteBanner playerCount={playerCount} /> : null}

      {phase === "lobby" ? (
        <div className={`w-full max-w-sm rounded-2xl border-2 ${BORDER_ACTIVE} bg-emerald-500/10 p-5 text-center`}>
          <p className={TEXT_LABEL}>You&apos;re in the lobby</p>
          {username ? <p className="mt-1 text-lg font-bold text-emerald-200">{username}</p> : null}
          {countdownSeconds != null ? (
            <>
              <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Game starts in</p>
              <p
                className={`mt-1 font-black tabular-nums text-[2.6rem] leading-none ${
                  isUrgent ? "animate-pulse text-rose-400" : TEXT_ACCENT
                }`}
              >
                {formatMmSs(countdownSeconds)}
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
      ) : (
        <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
          <p className={TEXT_LABEL}>Category Blitz</p>
          <div className="mt-2 flex justify-center">
            <ScheduleUpdatedToast show={scheduleJustUpdated} />
          </div>
          {countdownSeconds != null ? (
            <>
              <p className="mt-3 text-sm font-black uppercase tracking-widest text-slate-400">Game starts in</p>
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
      )}

      <RulesList />
    </div>
  );
}

function ScoringScreen({ mode = "standard" }: { mode?: CategoryBlitzMode }) {
  const theme = GAME_THEME[MODE_CONFIG[mode].themeKey];
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
      <div className={`w-full max-w-sm rounded-2xl border ${theme.borderCard} bg-slate-900/70 p-6 text-center`}>
        <p className={theme.textLabel}>Scoring in progress</p>
        <p className="mt-3 text-xl font-black text-white">Checking answers…</p>
        <p className="mt-2 text-sm text-slate-400">{MODE_CONFIG[mode].rule}</p>
        <div className="mt-4 flex justify-center">
          <div className={`h-6 w-6 animate-spin rounded-full border-2 ${theme.spinnerRing}`} />
        </div>
      </div>
    </div>
  );
}

/**
 * Steps the viewer's venue-wide point TOTAL (users.points — the same number
 * shown on the venue leaderboard) from its pre-session value up to its
 * post-session value, mirroring Speed Trivia's "Total Points" count-up
 * (components/trivia/TriviaGame.tsx ~line 1267). This is deliberately a
 * different number from `viewerEntry.points` in CompleteScreen (that's this
 * session's own cumulative score) — it's the running account total climbing
 * by however much this game just added to it.
 */
function useTotalPointsCountUp(totalBefore: number | null, totalAfter: number | null) {
  const [displayTotal, setDisplayTotal] = useState<number | null>(null);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (totalBefore === null || totalAfter === null) return;
    setDisplayTotal(totalBefore);
    setPulsing(false);

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));
    };

    const diff = totalAfter - totalBefore;
    const DURATION_MS = 800;
    const steps = Math.min(Math.max(Math.abs(diff), 1), 30);
    const stepMs = DURATION_MS / steps;
    // Pause 400ms so the player registers the "before" total, then count up.
    for (let i = 1; i <= steps; i++) {
      schedule(() => {
        const progress = i / steps;
        setDisplayTotal(i === steps ? totalAfter : Math.round(totalBefore + diff * progress));
      }, 400 + stepMs * i);
    }
    schedule(() => setPulsing(true), 400 + DURATION_MS + 80);
    schedule(() => setPulsing(false), 400 + DURATION_MS + 480);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [totalBefore, totalAfter]);

  return { displayTotal, pulsing };
}

/**
 * Final game-over screen: viewer's own score banner, a top-3 podium (plus a
 * pinned rank row if the viewer placed outside it), a stats bar showing
 * final rank + rank movement across the session, and a count-up of the
 * viewer's venue point total climbing by whatever this game just added to
 * it. Modeled on Live Trivia's post-game podium block — see
 * docs/category-blitz-scoring-and-bugfix-plan.md Phase 5.
 */
/**
 * "Next game" messaging shown on the game-over screen: a live countdown to
 * the venue's next scheduled window, or an explicit "nothing scheduled"
 * message. `info === null` means the fetch hasn't resolved yet — render
 * nothing rather than flash an incorrect "no game" before it lands.
 */
function NextGameStatus({ info }: { info: { nextWindowAtMs: number | null } | null }) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!info || info.nextWindowAtMs == null) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [info]);

  if (!info) return null;

  const countdownSeconds =
    info.nextWindowAtMs != null ? Math.max(0, Math.floor((info.nextWindowAtMs - nowMs) / 1000)) : null;

  return (
    <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-4 text-center`}>
      <p className={TEXT_LABEL}>Next Game</p>
      {countdownSeconds != null ? (
        <p className="mt-1 font-black tabular-nums text-emerald-300 text-2xl leading-none">
          {formatIdleCountdown(countdownSeconds)}
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-400">No further games are scheduled. Check back later!</p>
      )}
    </div>
  );
}

function CompleteScreen({
  results,
  userId,
  venueId,
  username,
  rankGained,
  venuePointsBefore,
  venuePointsAfter,
  nextWindowInfo,
}: {
  results: CategoryBlitzRoundResults | null;
  userId: string;
  venueId: string;
  username: string | null;
  rankGained: number | null;
  /** Viewer's venue-wide point total captured before this session started, or null if unavailable. */
  venuePointsBefore: number | null;
  /** Viewer's venue-wide point total captured once the session completed, or null if unavailable. */
  venuePointsAfter: number | null;
  /** Next scheduled window for this venue, or null while still loading. See NextGameStatus. */
  nextWindowInfo: { nextWindowAtMs: number | null } | null;
}) {
  const { displayTotal: totalPointsDisplay, pulsing: totalPointsPulsing } = useTotalPointsCountUp(
    venuePointsBefore,
    venuePointsAfter
  );
  const totalPointsGain =
    venuePointsBefore !== null && venuePointsAfter !== null ? venuePointsAfter - venuePointsBefore : null;
  const standings = (results?.totals ?? []).slice().sort((a, b) => b.points - a.points);

  if (!results || standings.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <div className={`w-full max-w-sm rounded-2xl border ${BORDER_CARD} bg-slate-900/70 p-6 text-center`}>
          <p className={TEXT_LABEL}>Game over</p>
          <p className="mt-3 text-xl font-black text-white">The session has ended.</p>
          <p className="mt-2 text-sm text-slate-400">Thanks for playing!</p>
        </div>
        <NextGameStatus info={nextWindowInfo} />
      </div>
    );
  }

  const viewerRank = standings.findIndex((t) => t.userId === userId);
  const viewerEntry = viewerRank > -1 ? standings[viewerRank] : null;
  const viewerInPodium = viewerRank > -1 && viewerRank < 3;
  const podium = standings.slice(0, 3).map((entry, i) => ({ ...entry, rank: i + 1 }));
  const podiumOrder = [podium[1], podium[0], podium[2]];
  const viewerAnswers = results.results
    .map((category) => category.answers.find((answer) => answer.userId === userId) ?? null)
    .filter((answer): answer is NonNullable<typeof answer> => answer !== null);
  const correctAnswers = viewerAnswers.filter((answer) => answer.reason === "correct").length;
  const correctRate = viewerAnswers.length > 0 ? Math.round((correctAnswers / viewerAnswers.length) * 100) : null;
  const storySharePayload = viewerEntry
    ? buildCategoryBlitzStorySharePayload({
        venueId: venueId || "unknown-venue",
        venueName: null,
        userId: userId || "unknown-user",
        username: viewerEntry.username || username || "Player",
        finalRank: viewerRank + 1,
        finalPoints: viewerEntry.points,
        correctRate,
        isChampion: viewerRank === 0,
      })
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-6">
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

      {/* Venue point total count-up — mirrors Speed Trivia's "Total Points" card */}
      {totalPointsDisplay !== null && (
        <div
          className={`rounded-2xl border-2 bg-emerald-500/10 px-4 py-3 text-center transition-all duration-300 ${
            totalPointsPulsing ? "border-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.35)]" : BORDER_ACTIVE
          }`}
        >
          <p className={TEXT_LABEL}>Your Total Points</p>
          <p
            className={`mt-1 font-black tabular-nums text-3xl leading-none transition-transform duration-150 ${TEXT_ACCENT} ${
              totalPointsPulsing ? "scale-110" : "scale-100"
            }`}
          >
            {totalPointsDisplay}
          </p>
          {totalPointsGain !== null && (
            <p className="mt-0.5 text-xs text-slate-400">+{totalPointsGain} this game</p>
          )}
        </div>
      )}

      {storySharePayload ? (
        <StoryShareLauncher
          payload={storySharePayload}
          title={viewerRank === 0 ? "Share the champion shot" : "Share your blitz run"}
          buttonLabel="Create story"
          className="border-emerald-300/30 bg-emerald-300/[0.08]"
        />
      ) : null}

      <NextGameStatus info={nextWindowInfo} />

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
  const isReverse = results.mode === "reverse";
  const theme = GAME_THEME[MODE_CONFIG[results.mode].themeKey];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
      <InviteBanner playerCount={playerCount} />
      {/* The reveal journey (RevealSequence) just animated the leaderboard a
          beat earlier, then settled here — so the countdown "drops in" above a
          leaderboard that's already at rest (settled: no replayed count-up). */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: EASE_SNAP }}
      >
        <IntermissionStatus nextRoundStartsIn={nextRoundStartsIn} />
      </motion.div>

      {/* Live Leaderboard — rendered settled so it doesn't replay the count-up /
          reorder it just performed inside RevealSequence. */}
      <div className={`rounded-2xl border-2 ${theme.borderActive} ${theme.bgTint} p-4`}>
        <p className={`${theme.textLabel} text-center`}>Leaderboard</p>
        <div className="mt-3">
          <LiveLeaderboard entries={results.totals} meId={userId} exiting={leaderboardExiting} settled />
        </div>
      </div>

      {/* Category breakdown — kept underneath the leaderboard */}
      <p className={`${theme.textLabel} mt-1`}>Letter: {results.letter}</p>
      <div className="space-y-2">
        {results.results.map((cat) => {
          const viewerAnswer = cat.answers.find((a) => a.userId === userId);
          const reason = viewerAnswer?.reason;
          // Reverse "correct" (matched the crowd) glows brighter the more
          // players hit it — consensus made visible (Phase 5). Standard mode
          // and every other reason keep the flat per-reason card look.
          const glow = isReverse && reason === "correct" && viewerAnswer
            ? reverseMatchGlow(viewerAnswer.pointsAwarded)
            : null;
          return (
            <div
              key={cat.categoryIndex}
              className={`rounded-xl border ${
                glow
                  ? glow.card
                  : reason === "correct"
                  ? "border-emerald-400/50 bg-emerald-950/40"
                  : reason === "too_obscure"
                  ? "border-slate-600 bg-slate-800/40"
                  : reason === "wrong_letter" || reason === "invalid" || reason === "moderated"
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
                        ? (isReverse ? "text-fuchsia-200" : "text-emerald-300")
                        : reason === "too_obscure"
                        ? "text-slate-300"
                        : reason === "wrong_letter" || reason === "invalid" || reason === "moderated"
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
                    <div>
                      <p className={`mt-0.5 text-[0.65rem] font-semibold ${
                        reason === "insufficient_players"
                          ? "text-amber-300/80"
                          : reason === "too_obscure"
                          ? "text-slate-400"
                          : "text-rose-300/80"
                      }`}>
                        {REASON_LABEL[reason] ?? reason}
                      </p>
                      {viewerAnswer.explanation && (
                        <p className="mt-0.5 text-[0.6rem] leading-snug text-slate-500">
                          {viewerAnswer.explanation}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {reason === "correct" ? (
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[0.65rem] font-black ${
                      glow ? glow.badge : "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                    }`}>
                      +{viewerAnswer?.pointsAwarded ?? 0}
                    </span>
                  ) : reason === "too_obscure" ? (
                    <span className="inline-flex items-center rounded-md border border-slate-600 bg-slate-700/30 px-2 py-0.5 text-[0.65rem] font-black text-slate-300">
                      +{viewerAnswer?.pointsAwarded ?? 0}
                    </span>
                  ) : reason === "wrong_letter" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      wrong letter
                    </span>
                  ) : reason === "invalid" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      invalid
                    </span>
                  ) : reason === "moderated" ? (
                    <span className="inline-flex items-center rounded-md border border-rose-400/50 bg-rose-500/20 px-2 py-0.5 text-[0.65rem] font-black text-rose-400">
                      flagged
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
                            ? (isReverse ? "border-fuchsia-700/50 text-fuchsia-400/70" : "border-emerald-700/50 text-emerald-400/70")
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
  mode = "standard",
}: {
  letter: string;
  categories: string[];
  roundId: string;
  timeRemaining: number;
  venueId: string;
  userId: string;
  isSpectating: boolean;
  playerCount?: number;
  /** Round mode — flips the whole board's accent/background to the "Blend In!"
   *  color world for the round's duration. Defaults to "standard" so callers
   *  mid-migration (or a round with no mode yet) render the familiar look. */
  mode?: CategoryBlitzMode;
}) {
  const theme = GAME_THEME[MODE_CONFIG[mode].themeKey];
  const venuePresence = useVenuePresence();
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
      if (venuePresence.isInteractionBlocked || !answer || lastAutosavedRef.current[categoryIndex] === answer) return;
      lastAutosavedRef.current[categoryIndex] = answer;
      void fetch(`/api/category-blitz/rounds/${roundId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, userId, categoryIndex, answer }),
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as unknown;
          venuePresence.capturePresenceFailure(payload);
        })
        .catch(() => {
          // Best-effort — if this fails, the final submit-on-expiry resends
          // every filled category anyway, so nothing is silently lost.
        });
    },
    [roundId, venueId, userId, venuePresence]
  );

  useEffect(() => {
    const timers = autosaveTimersRef.current;
    return () => {
      for (const t of timers) if (t !== null) window.clearTimeout(t);
    };
  }, []);

  // On-screen keyboards resize the visual viewport (--tp-vh, ViewportHeightSync)
  // rather than push content up, so a focused input near the bottom of the
  // list can end up hidden behind the keyboard even though the game
  // container itself shrank correctly. Wait for that resize (or a fallback
  // timeout, for keyboards that don't fire visualViewport resize) and then
  // scroll the field into view within its own scroll container.
  const scrollFocusCleanupRef = useRef<(() => void) | null>(null);

  const handleAnswerInputFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
    scrollFocusCleanupRef.current?.();

    const target = event.currentTarget;
    let settled = false;
    const scrollIntoView = () => {
      if (settled) return;
      settled = true;
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };

    const viewport = window.visualViewport;
    const onViewportResize = () => {
      // ViewportHeightSync debounces --tp-vh updates ~120ms behind the
      // resize event — wait for that so the scroll container has already
      // taken on its new (keyboard-adjusted) height before we scroll it.
      window.setTimeout(scrollIntoView, 150);
    };
    viewport?.addEventListener("resize", onViewportResize, { once: true });
    const fallbackTimer = window.setTimeout(scrollIntoView, 400);

    scrollFocusCleanupRef.current = () => {
      viewport?.removeEventListener("resize", onViewportResize);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    return () => {
      scrollFocusCleanupRef.current?.();
    };
  }, []);

  const submitAnswers = useCallback(async () => {
    if (submittedRef.current || isSpectating || venuePresence.isInteractionBlocked) return;
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

      const responses = await Promise.all(
        filled.map(({ categoryIndex, answer }) =>
          fetch(`/api/category-blitz/rounds/${roundId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ venueId, userId, categoryIndex, answer }),
          })
        )
      );
      for (const response of responses) {
        const payload = (await response.json().catch(() => null)) as unknown;
        const presenceFailure = venuePresence.capturePresenceFailure(payload);
        if (presenceFailure) {
          throw new Error(presenceFailure.userMessage);
        }
        if (!response.ok) {
          throw new Error("Submission failed.");
        }
      }
      setSubmitState("done");
    } catch (error) {
      submittedRef.current = false;
      setSubmitState("error");
      setErrorMsg(error instanceof Error ? error.message : "Submission failed. Please try again.");
    }
  }, [answers, roundId, venueId, userId, isSpectating, venuePresence]);

  const submitAnswersRef = useRef(submitAnswers);

  useEffect(() => {
    submitAnswersRef.current = submitAnswers;
  });

  // Auto-submit when timer hits zero — deferred so the effect doesn't trigger cascading state updates.
  useEffect(() => {
    if (!isExpired || timerWasZeroRef.current || submitState !== "idle" || isSpectating || venuePresence.isInteractionBlocked) return;
    timerWasZeroRef.current = true;
    const t = window.setTimeout(() => { void submitAnswersRef.current(); }, 0);
    return () => window.clearTimeout(t);
  }, [isExpired, submitState, isSpectating, venuePresence.isInteractionBlocked]);

  if (submitState === "done") {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <div className={`w-full max-w-sm rounded-2xl border-2 ${theme.borderActive} ${theme.bgTint} p-6 text-center`}>
          <p className={theme.textLabel}>Answers submitted</p>
          <p className="mt-3 text-xl font-black text-white">
            {totalFilled === 0 ? "No answers recorded." : `${totalFilled} answer${totalFilled !== 1 ? "s" : ""} submitted!`}
          </p>
          <p className={`mt-2 text-sm ${theme.textSoft}`}>Waiting for scoring…</p>
          <div className="mt-4 flex justify-center">
            <div className={`h-5 w-5 animate-spin rounded-full border-2 ${theme.spinnerRing}`} />
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
      <div className={`shrink-0 border-b ${theme.borderActive} bg-slate-950/90 px-4 py-3`}>
        <div className="flex items-center gap-3">
          {/* Letter badge — shares layoutId with the reveal badge so the
              round-start reveal morphs its big centered badge down into this
              header slot instead of cutting. */}
          <motion.div
            layoutId={CB_LETTER_BADGE_LAYOUT_ID}
            transition={{ layout: LAYOUT_MORPH_TRANSITION }}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${theme.letterGradient} ${theme.letterGlow}`}
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
            <p className={theme.textLabel}>{MODE_CONFIG[mode].rule}</p>
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
              isUrgent ? "bg-rose-500" : theme.progressFill
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
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
                    ? `${theme.filledBorder} ${theme.filledBg}`
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
                    onFocus={handleAnswerInputFocus}
                    placeholder={`${letter}…`}
                    className={`mt-0.5 w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-600 ${
                      wrongLetter ? "text-rose-300" : filled ? theme.filledText : "text-white"
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
        <div className={`shrink-0 border-t ${theme.borderSoft} px-4 py-3`}>
          {errorMsg && (
            <p className="mb-2 text-center text-xs font-semibold text-rose-400">{errorMsg}</p>
          )}
          <p className={`text-center text-xs font-semibold uppercase tracking-[0.1em] ${theme.textAccentSoft}`}>
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
              : phase === "results" || phase === "scoring" || phase === "reveal"
              ? "bg-cyan-400"
              : "bg-slate-600"
          }`}
        />
        <p className={`text-[0.7rem] font-black uppercase tracking-[0.16em] ${TEXT_ACCENT}`}>
          {phase === "lobby" ? "Lobby" : phase === "answering" ? "Round Active" : phase === "scoring" ? "Scoring" : phase === "reveal" ? "Revealing" : phase === "results" ? "Results" : phase === "complete" ? "Game Over" : "Category Blitz"}
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

  const { phase, session, round, results, timeRemaining, nextRoundStartsIn, lobbyCountdown, error, errorEscalated, viewerRole, retry, markRevealDone, markResultsRevealDone, dismissComplete } = useCategoryBlitzSession(
    isHydrated ? venueId : "",
    isHydrated ? userId : ""
  );
  const { triggerAnimation } = useAnimationTrigger();

  // Turning the toggle on force-converts the live auto session to test mode —
  // see the effect below (keyed on session.id), which handles both this and
  // the already-on-at-load case.
  const toggleTestMode = useCallback(() => {
    setTestMode((prev) => {
      const next = !prev;
      setCategoryBlitzTestMode(next);
      return next;
    });
  }, []);

  // Dev-only: force the current wait (answer timer, intermission, or lobby
  // dwell) to elapse immediately instead of watching real-time countdowns.
  // Visibility here is purely a UX convenience — the actual safety boundary
  // is server-side (skipRound rejects anything but a session whose own
  // test_mode DB column is true), so gating on session.testMode (server
  // truth) rather than just the local toggle avoids showing a button that
  // would just 403 against a real session.
  const [isSkippingRound, setIsSkippingRound] = useState(false);

  // If test mode is already on (persisted from a prior visit) when a
  // non-test auto session comes into view, force-convert it once so the
  // Skip-round button appears without the tester having to re-toggle. Keyed on
  // session.id so it fires at most once per session; the flipped column
  // arrives on the next poll.
  const convertedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!testMode || !session?.id || session.source !== "auto" || session.testMode) return;
    if (!["lobby", "active"].includes(session.status)) return;
    if (convertedSessionRef.current === session.id) return;
    convertedSessionRef.current = session.id;
    void fetch(`/api/category-blitz/sessions/${session.id}/enable-test-mode`, { method: "POST" }).catch(() => {
      // Best-effort dev tooling — poll keeps showing current state on failure.
    });
  }, [testMode, session?.id, session?.source, session?.testMode, session?.status]);

  const canSkipRound = testMode && !!session?.testMode && (session?.status === "lobby" || session?.status === "active");
  const skipRound = useCallback(() => {
    if (!session?.id || isSkippingRound) return;
    setIsSkippingRound(true);
    void fetch(`/api/category-blitz/sessions/${session.id}/skip-round`, { method: "POST" })
      .then((res) => {
        // Don't wait for the 15s fallback poll (or a realtime push that may
        // lag) to reflect the skip — the endpoint has already advanced the
        // server state by the time it responds, so reload immediately for a
        // snappy, near-instant transition. Only on success; a failed skip left
        // the state unchanged, so a reload would just re-show the same thing.
        if (res.ok) retry();
      })
      .catch(() => {
        // Best-effort — the realtime subscription/poll will simply keep
        // showing the current state if this fails, same as any other
        // dropped dev-tooling request.
      })
      .finally(() => setIsSkippingRound(false));
  }, [session, isSkippingRound, retry]);

  // The round in play right now drives the whole page's ambient color world
  // (§4c) — "Blend In!" for the round's full duration (answering → scoring →
  // reveal → results), falling back to "standard" once nothing round-scoped
  // is active (lobby/idle/complete keep the default look). `results` (the
  // just-scored round) takes over from `round` once the round itself is
  // superseded by the next one's realtime payload but its results are still
  // on screen.
  const isRoundScopedPhase = phase === "answering" || phase === "scoring" || phase === "reveal" || phase === "results";
  const activeMode: CategoryBlitzMode =
    (isRoundScopedPhase ? round?.mode ?? results?.mode : undefined) ?? "standard";
  const pageTheme = GAME_THEME[MODE_CONFIG[activeMode].themeKey];

  // An admin ending a session (or one ending with no completed round) lands
  // here with no standings to show — CompleteScreen's bare "session has
  // ended" fallback (no podium, no next-game info). Without this, that
  // screen would sit for up to RECENTLY_COMPLETED_GRACE_MS (3 minutes, see
  // lib/categoryBlitz.ts) before the server stops re-delivering the
  // completed session and the client falls back to idle. Fast-path it to 3
  // seconds instead. Only applies to the empty fallback — a session that
  // completed with real standings keeps them on screen (see Phase 3/4:
  // points count-up + next-game messaging) until the player navigates away
  // or the grace window naturally lapses.
  const hasCompleteStandings = phase === "complete" && !!results && results.totals.length > 0;
  useEffect(() => {
    if (phase !== "complete" || hasCompleteStandings) return;
    const t = window.setTimeout(() => { dismissComplete(); }, 3000);
    return () => window.clearTimeout(t);
  }, [phase, hasCompleteStandings, dismissComplete]);

  // Venue point total count-up (CompleteScreen's "Your Total Points" card):
  // snapshot the viewer's venue-wide leaderboard total (users.points, the
  // same number /api/leaderboard and TriviaGame's own count-up read) once
  // when a new session first appears, before any of its rounds have scored,
  // then again once the session completes and its points have been awarded
  // (lib/categoryBlitz.ts awardCategoryBlitzPoints writes into that same
  // column). Both snapshots are keyed by session.id so a second session in
  // the same page lifetime gets its own before/after pair.
  const fetchVenuePoints = useCallback(async (): Promise<number | null> => {
    if (!venueId || !userId) return null;
    try {
      const res = await fetch(`/api/leaderboard?venue=${encodeURIComponent(venueId)}&userId=${encodeURIComponent(userId)}`);
      const json = (await res.json()) as { ok: boolean; entries?: { userId: string; points: number }[] };
      if (!json.ok) return null;
      const entry = (json.entries ?? []).find((e) => e.userId === userId);
      return entry ? entry.points : null;
    } catch {
      return null;
    }
  }, [venueId, userId]);

  const [venuePointsBefore, setVenuePointsBefore] = useState<{ sessionId: string; points: number } | null>(null);
  const [venuePointsAfter, setVenuePointsAfter] = useState<{ sessionId: string; points: number } | null>(null);

  useEffect(() => {
    if (!session?.id || phase === "complete" || venuePointsBefore?.sessionId === session.id) return;
    let cancelled = false;
    void fetchVenuePoints().then((points) => {
      if (cancelled || points === null) return;
      setVenuePointsBefore({ sessionId: session.id, points });
    });
    return () => { cancelled = true; };
  }, [session?.id, phase, venuePointsBefore, fetchVenuePoints]);

  useEffect(() => {
    if (phase !== "complete" || !session?.id || venuePointsAfter?.sessionId === session.id) return;
    let cancelled = false;
    void fetchVenuePoints().then((points) => {
      if (cancelled || points === null) return;
      setVenuePointsAfter({ sessionId: session.id, points });
    });
    return () => { cancelled = true; };
  }, [phase, session?.id, venuePointsAfter, fetchVenuePoints]);

  // Next-game messaging on the game-over screen (CompleteScreen's
  // NextGameStatus): once a session completes, fetch the venue's next
  // scheduled window the same way the idle lobby does, so the player learns
  // when to come back (or that nothing else is scheduled) without first
  // having to fall back to the lobby screen themselves.
  const [completeNextWindow, setCompleteNextWindow] = useState<{ sessionId: string; nextWindowAtMs: number | null } | null>(null);

  useEffect(() => {
    if (phase !== "complete" || !session?.id || completeNextWindow?.sessionId === session.id) return;
    let cancelled = false;
    void fetchCategoryBlitzNextWindowAt(venueId).then((ms) => {
      if (cancelled) return;
      setCompleteNextWindow({ sessionId: session.id, nextWindowAtMs: ms });
    });
    return () => { cancelled = true; };
  }, [phase, session?.id, completeNextWindow, venueId]);

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
  //
  // A page reload remounts this component from scratch: `revealedRoundId`
  // resets to null, so without the elapsed-time check below, a round that's
  // already been running a while would replay RoundStartReveal from the top
  // — burning more of the round's already-ticking clock and re-arming
  // markRevealDone's completion gate from scratch every time a frustrated
  // player reloads mid-round (Root Cause 4 in
  // docs/category-blitz-no-grading-analysis.md). Comparing against
  // ROUND_START_REVEAL_MAX_MS on every render (rather than a one-shot
  // mount check) also generalizes to any other way this tab could end up
  // "still answering, reveal never shown" long after a round actually
  // started — a freshly-started round always has ~0 elapsed time here, so
  // this never cuts off a reveal that's genuinely still playing.
  const [revealedRoundId, setRevealedRoundId] = useState<string | null>(null);
  // Render bodies can't call Date.now() directly (impure) — mirror it into
  // state via its own tick instead, same pattern as IdleScreen's countdown.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const showReveal =
    phase === "answering" &&
    !!round &&
    round.id !== revealedRoundId &&
    nowMs - new Date(round.startedAt).getTime() <= ROUND_START_REVEAL_MAX_MS;

  // The case above (elapsed time already past the reveal's max duration)
  // never mounts RoundStartReveal, so its onDone/markRevealDone callback
  // never fires on its own — without this, the auto-scoring timer gate
  // (revealDoneRef, lib/categoryBlitzRealtime.ts) would stay blocked for
  // the rest of the round. Mirrors the visibility-resync forceReveal path
  // in the hook; safe to call every render since markRevealDone is
  // idempotent per round ID.
  useEffect(() => {
    if (
      phase === "answering" &&
      round &&
      round.id !== revealedRoundId &&
      nowMs - new Date(round.startedAt).getTime() > ROUND_START_REVEAL_MAX_MS
    ) {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[CategoryBlitzGame] round ${round.id}: reveal never mounted, marking done via elapsed-time fallback`);
      }
      markRevealDone(round.id);
    }
  }, [phase, round, revealedRoundId, nowMs, markRevealDone]);

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
        mode: results.mode,
      }];
    });
  }, [results, userId]);

  // The grading cascade now runs inside the server-anchored "reveal" phase
  // (see useCategoryBlitzSession Phase 3) instead of a client-derived boolean.
  // We render the cascade once the viewer's graded answers have populated; if
  // "reveal" is entered before `results` land, we hold a loading beat rather
  // than skipping. `markResultsRevealDone` advances the phase to "results".
  const revealReady = phase === "reveal" && !!results && !!userId;
  const showCascade = revealReady && gradingAnswers.length > 0;

  // Spectators / players who submitted nothing have no cascade to play — as
  // soon as their (empty) graded answers resolve, advance straight to results
  // so we don't hold the loading beat forever.
  useEffect(() => {
    if (revealReady && gradingAnswers.length === 0 && results) {
      markResultsRevealDone(results.roundId);
    }
  }, [revealReady, gradingAnswers.length, results, markResultsRevealDone]);

  // Phase 4: the reveal journey (RevealSequence — full-screen cascade → guided
  // scroll → leaderboard) reports back here once it has settled, flipping the
  // hook from "reveal" to the resting "results" intermission. Kept stable
  // (markResultsRevealDone is itself stable) so RevealSequence's own beat
  // timers don't churn on the ~4x/sec results-phase re-renders.
  const handleRevealSettled = useCallback(
    (roundId: string) => { markResultsRevealDone(roundId); },
    [markResultsRevealDone]
  );

  // Leaderboard exit beat: rows accelerate up/out as intermission runs out,
  // just before the round flips over.
  const leaderboardExiting =
    phase === "results" &&
    !!results &&
    nextRoundStartsIn !== null &&
    nextRoundStartsIn <= 1;

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

  // "Blend In!" mode-flip takeover (docs/category-blitz-mode-b-plan.md §4b):
  // fires exactly once per round, the moment a freshly-started reverse round
  // is detected (the same `showReveal` window RoundStartReveal uses) — never
  // for the reverse → standard reversion, which relies on the ModeSign flip +
  // ambient board theme shift alone. Keyed on round.id so a reload mid-round
  // (showReveal already false by then) never replays it.
  const modeFlipFiredRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showReveal || !round || round.mode !== "reverse") return;
    if (modeFlipFiredRoundRef.current === round.id) return;
    modeFlipFiredRoundRef.current = round.id;
    triggerAnimation("CATEGORY_BLITZ_MODE_FLIP", { modeFlipVariant: getModeFlipTakeoverVariant() });
  }, [showReveal, round, triggerAnimation]);

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
      className={`relative flex flex-col overflow-hidden text-white transition-colors duration-700 ${pageTheme.pageBg}`}
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
      {canSkipRound && (
        <button
          type="button"
          onClick={skipRound}
          disabled={isSkippingRound}
          className="fixed bottom-2 right-32 z-[999] rounded-full bg-amber-400 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-950 disabled:opacity-50"
        >
          {isSkippingRound ? "Skipping…" : "Skip round"}
        </button>
      )}
      {testMode && <DevAnimationPanel />}

      {/* Phase content */}
      {(phase === "idle" || phase === "lobby") && (
        <LobbyScreen
          phase={phase}
          venueId={venueId}
          username={username}
          lobbyCountdown={lobbyCountdown}
          playerCount={session?.playerCount}
          testMode={testMode}
        />
      )}
      {phase === "answering" && round && (
        showReveal ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain">
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
            mode={round.mode}
          />
        )
      )}
      {phase === "scoring" && <ScoringScreen mode={activeMode} />}
      {/* Reveal phase: play the full-screen reveal journey (cascade → guided
          scroll → leaderboard), or hold a loading beat while the viewer's
          graded answers are still in flight (never skip it). */}
      {phase === "reveal" && (
        showCascade && results ? (
          <RevealSequence
            answers={gradingAnswers}
            leaderboardEntries={results.totals}
            meId={userId}
            roundId={results.roundId}
            onSettled={handleRevealSettled}
            nextRoundStartsIn={nextRoundStartsIn}
          />
        ) : (
          <ScoringScreen mode={activeMode} />
        )
      )}
      {phase === "results" && results && userId && (
        <ResultsScreen
          results={results}
          userId={userId}
          nextRoundStartsIn={nextRoundStartsIn}
          playerCount={session?.playerCount}
          leaderboardExiting={leaderboardExiting}
        />
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
          <CompleteScreen
            results={results}
            userId={userId}
            venueId={venueId}
            username={username}
            rankGained={rankGained}
            venuePointsBefore={session?.id && venuePointsBefore?.sessionId === session.id ? venuePointsBefore.points : null}
            venuePointsAfter={session?.id && venuePointsAfter?.sessionId === session.id ? venuePointsAfter.points : null}
            nextWindowInfo={
              session?.id && completeNextWindow?.sessionId === session.id
                ? { nextWindowAtMs: completeNextWindow.nextWindowAtMs }
                : null
            }
          />
        </>
      )}
    </div>
  );
}
