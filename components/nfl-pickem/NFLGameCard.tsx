"use client";

import { motion } from "framer-motion";

export type NFLGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  userPickTeam?: string;
  userPickStatus?: "pending" | "won" | "lost" | "push";
  isThursdayGame: boolean;
  isSundayGame?: boolean;
  isMondayGame?: boolean;
  isSubmitting?: boolean;
};

export function NFLGameCard({
  game,
  onPick,
  isLocked,
}: {
  game: NFLGame;
  onPick: (game: NFLGame, team: string) => void;
  isLocked: boolean;
}) {
  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
    });
  };
  
  const awaySelected = game.userPickTeam === game.awayTeam;
  const homeSelected = game.userPickTeam === game.homeTeam;
  const isCorrect = game.userPickStatus === "won";
  const isWrong = game.userPickStatus === "lost";
  
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
        <span className={`text-[11px] font-extrabold ${
          game.status === "live" ? "text-emerald-300" : "text-slate-300"
        }`}>
          {game.status === "final" ? "Final" : 
           game.status === "live" ? "● Live" :
           formatTime(game.startsAt)}
        </span>
      </div>
      
      {/* Teams */}
      <div className="flex overflow-hidden bg-[#020617]/45">
        {/* Away Team */}
        <button
          type="button"
          disabled={isLocked || game.isSubmitting}
          onClick={() => onPick(game, game.awayTeam)}
          className={`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-white/5"
          } ${awaySelected ? "bg-[#fde68a]/15" : ""}`}
        >
          {game.isSubmitting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#fde68a] border-t-transparent" />
            </div>
          )}
          
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all ${
            awaySelected
              ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
              : "border border-[#fde68a]/45 text-transparent"
          }`}>
            ✓
          </span>
          
          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
            {game.awayTeam}
          </span>
          
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
          disabled={isLocked || game.isSubmitting}
          onClick={() => onPick(game, game.homeTeam)}
          className={`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-white/5"
          } ${homeSelected ? "bg-[#fde68a]/15" : ""}`}
        >
          {game.isSubmitting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#fde68a] border-t-transparent" />
            </div>
          )}
          
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all ${
            homeSelected
              ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
              : "border border-[#fde68a]/45 text-transparent"
          }`}>
            ✓
          </span>
          
          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
            {game.homeTeam}
          </span>
          
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
