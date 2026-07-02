import type { ScreenLeaderboardEntry } from "@/lib/venueScreen";

type ScreenLeaderboardProps = {
  entries: ScreenLeaderboardEntry[] | null;
  emptyLabel?: string;
  maxRows?: number;
};

export function ScreenLeaderboard({
  entries,
  emptyLabel = "Leaderboard coming in...",
  maxRows = 8,
}: ScreenLeaderboardProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className="flex min-h-[18rem] w-full max-w-5xl items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] px-8 text-center">
        <p className="text-4xl font-black text-white/62">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ol className="grid w-full max-w-5xl gap-3" aria-label="Leaderboard">
      {entries.slice(0, maxRows).map((entry) => (
        <li
          key={`${entry.rank}-${entry.username}`}
          className="grid min-h-[5.5rem] grid-cols-[6rem_1fr_10rem] items-center rounded-lg border border-white/10 bg-white/[0.07] px-6 py-4 text-4xl font-black shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
        >
          <span className="font-mono text-cyan-200">#{entry.rank}</span>
          <span className="min-w-0 truncate text-left text-white">{entry.username}</span>
          <span className="text-right font-mono text-amber-200 tabular-nums">{entry.points}</span>
        </li>
      ))}
    </ol>
  );
}
