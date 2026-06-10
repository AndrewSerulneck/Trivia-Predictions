"use client";

import { motion, type Variants } from "framer-motion";
import { RankBadge } from "@/components/trivia/RankBadge";

// Minimal shape this row reads — structurally compatible with the page's
// LeaderboardEntry type, so callers can pass that directly.
type LeaderboardRowPlayer = {
  rank: number;
  userId: string;
  username: string;
  roundPoints: Record<number, number>;
  totalPoints: number;
  pointsThisRound: number;
};

// Leaderboard row stagger — declared at module scope so the object identity is
// stable across renders (Framer treats a new variants object as a change).
const rowVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: "easeOut" },
  }),
};

// One intermission leaderboard row: slides in from the left with an index-based
// stagger, and the rank-movement chevron pops in once the row has landed.
export const LiveTriviaLeaderboardRow = ({
  player,
  index,
  isViewer,
  movement,
  currentRound,
}: {
  player: LeaderboardRowPlayer;
  index: number;
  isViewer: boolean;
  movement: number;
  currentRound: number;
}) => {
  return (
    <motion.tr
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      custom={index}
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
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.3, 1], opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 + index * 0.06 }}
              className="inline-block text-[10px] font-black tabular-nums text-emerald-400"
            >
              ▲{movement}
            </motion.span>
          ) : movement < 0 ? (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.3, 1], opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 + index * 0.06 }}
              className="inline-block text-[10px] font-black tabular-nums text-rose-400"
            >
              ▼{Math.abs(movement)}
            </motion.span>
          ) : null}
        </div>
      </td>
      {Array.from({ length: currentRound }, (_, i) => {
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
    </motion.tr>
  );
};
