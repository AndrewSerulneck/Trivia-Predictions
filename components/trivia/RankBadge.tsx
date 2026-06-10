"use client";

// Rank pill used across the Live Trivia leaderboard, intermission rows, and
// post-game standings. Gold / silver / bronze for the top three, slate otherwise.
export const RankBadge = ({ rank }: { rank: number }) => {
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
