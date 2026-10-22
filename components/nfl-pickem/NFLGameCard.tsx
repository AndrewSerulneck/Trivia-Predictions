"use client";

import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

import { motion, useReducedMotion } from "framer-motion";

export type NFLGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  homeSpread?: number | null;
  awaySpread?: number | null;
  isLocked: boolean;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  userPickTeam?: string;
  // `canceled` = settled but ungradeable (the settlement sweep voids a spread
  // pick whose locked line or final scores never arrived). It renders neutral,
  // like a push, and must never be counted as still pending.
  userPickStatus?: "pending" | "won" | "lost" | "push" | "canceled";
  isThursdayGame: boolean;
  isSundayGame?: boolean;
  isMondayGame?: boolean;
  dayGroupKey: string;
  dayGroupLabel: string;
  isThursdayNightSection: boolean;
};

const formatSpread = (spread: number | null | undefined): string | null => {
  if (spread === null || spread === undefined || !Number.isFinite(spread)) return null;
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : String(spread);
};

export function NFLGameCard({
  game,
  onPick,
  isLocked,
  scoringMode,
  saving = false,
}: {
  game: NFLGame;
  onPick: (game: NFLGame, team: string) => void;
  isLocked: boolean;
  saving?: boolean;
  scoringMode: "standard" | "spread";
}) {
  const reducedMotion = useReducedMotion();
  // Pinned to Eastern so this always agrees with the day-section heading
  // above it (server-computed in ET) — a viewer's local clock can put a
  // Thursday-night ET kickoff on a different weekday. See
  // docs/nfl-pickem-chronological-order-plan.md.
  const formatTime = (iso: string) => {
    const time = new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    });
    return `${time} ET`;
  };

  const awaySelected = game.userPickTeam === game.awayTeam;
  const homeSelected = game.userPickTeam === game.homeTeam;
  const isCorrect = game.userPickStatus === "won";
  const isWrong = game.userPickStatus === "lost";
  const showSpread = scoringMode === "spread";
  const awaySpreadLabel = showSpread ? formatSpread(game.awaySpread) : null;
  const homeSpreadLabel = showSpread ? formatSpread(game.homeSpread) : null;

  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-ht-ticket-edge shadow-ht-panel [background:var(--ht-ticket-bg)]"
      whileTap={reducedMotion ? undefined : !isLocked && !saving ? { scale: 0.99 } : undefined} transition={reducedMotion ? { duration: 0 } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ht-ticket-rule [border-bottom-style:var(--ht-ticket-rule-style)] px-4 py-2">
        <span className="text-caption font-black uppercase tracking-[0.16em] text-ht-pickem-accent">
          {game.isThursdayGame ? "🏈 Thursday Night" : "NFL"}
        </span>
        <span className="flex items-center gap-1.5">
          {isLocked && game.status !== "final" && (
            <span className="text-caption text-ht-fg-muted" title="Picks locked at kickoff">
              🔒
            </span>
          )}
          <span className={`text-caption font-extrabold ${
            game.status === "live" ? "text-ht-success-fg" : "text-ht-ticket-meta"
          }`}>
            {game.status === "final" ? "Final" :
             game.status === "live" ? "● Live" :
             formatTime(game.startsAt)}
          </span>
        </span>
      </div>

      <span role="status" className="sr-only">{saving ? "Saving…" : ""}</span>
      {/* Teams */}
      <div className="flex overflow-hidden bg-ht-ticket-halves">
        {/* Away Team */}
        <button
          type="button"
          disabled={isLocked || saving}
          aria-busy={saving}
          onClick={() => onPick(game, game.awayTeam)}
          className={"tp-player-hit-target tp-player-pressable " + (`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-ht-overlay/5"
          } ${awaySelected ? "bg-ht-pickem-picked" : "bg-ht-ticket-away"}`)}
        >
          {saving ? <span className="absolute right-2 top-2"><ButtonSpinner /></span> : null}
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all motion-reduce:transition-none duration-150 ease-out ${
            awaySelected
              ? "rotate-[-7deg] scale-110 border border-ht-pickem-accent bg-ht-pickem-accent text-ht-pickem-on-fill"
              : "scale-100 border border-ht-ticket-box-edge bg-ht-ticket-box-bg text-transparent"
          }`}>
            ✓
          </span>

          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-ht-fg-bright">
            {game.awayTeam}
          </span>
          {awaySpreadLabel && (
            <span className="text-caption font-extrabold uppercase tracking-[0.08em] text-ht-pickem-accent">
              {awaySpreadLabel}
            </span>
          )}

          {game.status === "final" && (
            <span className={`text-[18px] font-black tabular-nums ${
              game.winnerTeam === game.awayTeam ? "text-ht-success-fg" : "text-ht-fg-muted"
            }`}>
              {game.awayScore ?? "–"}
            </span>
          )}
        </button>

        <div className="w-px shrink-0 bg-ht-ticket-divider" />

        {/* Home Team */}
        <button
          type="button"
          disabled={isLocked || saving}
          aria-busy={saving}
          onClick={() => onPick(game, game.homeTeam)}
          className={"tp-player-hit-target tp-player-pressable " + (`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-ht-overlay/5"
          } ${homeSelected ? "bg-ht-pickem-picked" : "bg-ht-ticket-home"}`)}
        >
          {saving ? <span className="absolute right-2 top-2"><ButtonSpinner /></span> : null}
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all motion-reduce:transition-none duration-150 ease-out ${
            homeSelected
              ? "rotate-[-7deg] scale-110 border border-ht-pickem-accent bg-ht-pickem-accent text-ht-pickem-on-fill"
              : "scale-100 border border-ht-ticket-box-edge bg-ht-ticket-box-bg text-transparent"
          }`}>
            ✓
          </span>

          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-ht-fg-bright">
            {game.homeTeam}
          </span>
          {homeSpreadLabel && (
            <span className="text-caption font-extrabold uppercase tracking-[0.08em] text-ht-pickem-accent">
              {homeSpreadLabel}
            </span>
          )}

          {game.status === "final" && (
            <span className={`text-[18px] font-black tabular-nums ${
              game.winnerTeam === game.homeTeam ? "text-ht-success-fg" : "text-ht-fg-muted"
            }`}>
              {game.homeScore ?? "–"}
            </span>
          )}
        </button>
      </div>

      {/* Result Banner */}
      {game.status === "final" && game.userPickTeam && (
        <div className={`px-4 py-1.5 text-caption font-extrabold tracking-[0.04em] ${
          isCorrect
            ? "bg-emerald-500/20 text-ht-success-fg"
            : isWrong
            ? "bg-rose-500/20 text-ht-danger-fg"
            : "bg-amber-500/20 text-ht-warn-fg"
        }`}>
          {isCorrect
            ? `✓ Correct! +10 points`
            : isWrong
            ? "✗ Incorrect"
            : "● Push (Tie)"}
        </div>
      )}
    </motion.div>
  );
}
