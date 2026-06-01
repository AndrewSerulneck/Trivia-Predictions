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
      <div className="rounded-2xl border border-sky-300/30 bg-slate-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Step 1 of 3</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-200">Choose A League</h2>
        <p className="mt-1 text-sm text-slate-400">Pick a league, then a game, then lock in your board.</p>
        <p className="mt-3 flex items-center gap-2 rounded-md border border-sky-300/40 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-200">
          <span aria-hidden="true">📱</span>
          Tip: turn your phone sideways for the enhanced, larger board view.
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
              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-all ${
                sport.enabled
                  ? "border-sky-300/25 bg-slate-800/60 hover:border-sky-300/60 active:scale-[0.99]"
                  : "cursor-not-allowed border-slate-700/60 bg-slate-800/40 text-slate-400"
              }`}
            >
              <span className="inline-flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${
                    sport.enabled ? "bg-sky-300/[0.12] ring-1 ring-sky-300/30" : "bg-slate-800 ring-1 ring-slate-700"
                  }`}
                >
                  {sport.icon}
                </span>
                <span className="text-base font-black text-slate-100">{sport.label}</span>
              </span>
              {sport.enabled ? (
                <span aria-hidden="true" className="text-lg font-black text-sky-300">
                  ›
                </span>
              ) : (
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  {sport.note ?? "Coming soon"}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
