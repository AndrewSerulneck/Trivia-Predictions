"use client";

import { useRouter } from "next/navigation";

type SportOption = {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
  note?: string;
};

const SPORT_OPTIONS: SportOption[] = [
  { key: "basketball_nba", label: "NBA", icon: "🏀", enabled: true },
  { key: "basketball_wnba", label: "WNBA", icon: "🏀", enabled: true },
  { key: "americanfootball_nfl", label: "NFL", icon: "🏈", enabled: false, note: "Coming soon" },
  { key: "baseball_mlb", label: "MLB", icon: "⚾", enabled: true },
];

export function SportsBingoSelectSport() {
  const router = useRouter();

  return (
    <div className="tp-bingo-theme space-y-4">
      <div className="rounded-2xl border border-orange-400/30 bg-slate-900 p-4">
        <h2 className="text-center text-3xl font-semibold text-slate-200">Sports Bingo</h2>
        <p className="mt-2 rounded-md border border-orange-400/40 bg-orange-950/30 px-3 py-2 text-xs text-orange-300">
          Tip: For best board readability, rotate your phone to landscape during board selection.
        </p>

        <div className="mt-4 space-y-2">
          {SPORT_OPTIONS.map((sport) => (
            <button
              key={sport.key}
              type="button"
              onClick={() => {
                if (!sport.enabled) {
                  return;
                }
                router.push(`/bingo/select-game?sportKey=${encodeURIComponent(sport.key)}`);
              }}
              disabled={!sport.enabled}
              className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                sport.enabled
                  ? "border-orange-400/30 bg-slate-800/60 hover:border-orange-400/80"
                  : "cursor-not-allowed border-slate-700/60 bg-slate-800/40 text-slate-400"
              }`}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span aria-hidden="true" className="text-base">
                  {sport.icon}
                </span>
                {sport.label}
              </span>
              <span className="text-xs font-medium text-orange-300">{sport.note ?? "Continue"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
