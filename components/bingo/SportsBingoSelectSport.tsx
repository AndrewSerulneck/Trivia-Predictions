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
  { key: "americanfootball_nfl", label: "NFL", icon: "🏈", enabled: false, note: "Coming soon" },
  { key: "baseball_mlb", label: "MLB", icon: "⚾", enabled: false, note: "Coming soon" },
];

export function SportsBingoSelectSport() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 1 of 3</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Choose A Sport</h2>
        <p className="mt-1 text-sm text-slate-700">Select the sport for your next Sports Bingo card.</p>
        <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
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
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all ${
                sport.enabled
                  ? "border-slate-200 bg-white hover:border-slate-300"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span aria-hidden="true" className="text-base">
                  {sport.icon}
                </span>
                {sport.label}
              </span>
              <span className="text-xs font-medium text-slate-500">{sport.note ?? "Continue"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
