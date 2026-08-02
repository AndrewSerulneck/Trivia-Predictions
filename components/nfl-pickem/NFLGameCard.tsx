"use client";

import { motion } from "framer-motion";

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
}: {
  game: NFLGame;
  onPick: (game: NFLGame, team: string) => void;
  isLocked: boolean;
  scoringMode: "standard" | "spread";
}) {
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
      className="overflow-hidden rounded-xl border border-[#fde68a]/45 bg-[linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]"
      whileTap={!isLocked ? { scale: 0.99 } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-dashed border-[#fde68a]/45 px-4 py-2">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
          {game.isThursdayGame ? "🏈 Thursday Night" : "NFL"}
        </span>
        <span className="flex items-center gap-1.5">
          {isLocked && game.status !== "final" && (
            <span className="text-[10px] text-slate-400" title="Picks locked at kickoff">
              🔒
            </span>
          )}
          <span className={`text-[11px] font-extrabold ${
            game.status === "live" ? "text-emerald-300" : "text-slate-300"
          }`}>
            {game.status === "final" ? "Final" :
             game.status === "live" ? "● Live" :
             formatTime(game.startsAt)}
          </span>
        </span>
      </div>

      {/* Teams */}
      <div className="flex overflow-hidden bg-[#020617]/45">
        {/* Away Team */}
        <button
          type="button"
          disabled={isLocked}
          onClick={() => onPick(game, game.awayTeam)}
          className={`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-white/5"
          } ${awaySelected ? "bg-[#fde68a]/15" : ""}`}
        >
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all duration-150 ease-out ${
            awaySelected
              ? "rotate-[-7deg] scale-110 border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
              : "scale-100 border border-[#fde68a]/45 text-transparent"
          }`}>
            ✓
          </span>
          
          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
            {game.awayTeam}
          </span>
          {awaySpreadLabel && (
            <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#fde68a]">
              {awaySpreadLabel}
            </span>
          )}
          
          {game.status === "final" && (
            <span className={`text-[18px] font-black tabular-nums ${
              game.winnerTeam === game.awayTeam ? "text-emerald-300" : "text-slate-400"
            }`}>
              {game.awayScore ?? "–"}
            </span>
          )}
        </button>
        
        <div className="w-px shrink-0 bg-[#fde68a]/20" />
        
        {/* Home Team */}
        <button
          type="button"
          disabled={isLocked}
          onClick={() => onPick(game, game.homeTeam)}
          className={`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-white/5"
          } ${homeSelected ? "bg-[#fde68a]/15" : ""}`}
        >
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all duration-150 ease-out ${
            homeSelected
              ? "rotate-[-7deg] scale-110 border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
              : "scale-100 border border-[#fde68a]/45 text-transparent"
          }`}>
            ✓
          </span>
          
          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
            {game.homeTeam}
          </span>
          {homeSpreadLabel && (
            <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#fde68a]">
              {homeSpreadLabel}
            </span>
          )}
          
          {game.status === "final" && (
            <span className={`text-[18px] font-black tabular-nums ${
              game.winnerTeam === game.homeTeam ? "text-emerald-300" : "text-slate-400"
            }`}>
              {game.homeScore ?? "–"}
            </span>
          )}
        </button>
      </div>
      
      {/* Result Banner */}
      {game.status === "final" && game.userPickTeam && (
        <div className={`px-4 py-1.5 text-[11px] font-extrabold tracking-[0.04em] ${
          isCorrect 
            ? "bg-emerald-500/20 text-emerald-300" 
            : isWrong
            ? "bg-rose-500/20 text-rose-300"
            : "bg-amber-500/20 text-amber-300"
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
