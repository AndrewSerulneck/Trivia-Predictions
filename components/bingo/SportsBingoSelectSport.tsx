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
    <div className="space-y-4">
      <div className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <h2 className="text-center text-3xl font-semibold text-ht-fg-primary">Sports Bingo</h2>
        <p className="mt-2 rounded-ht-md border border-ht-cyan-600/40 bg-ht-elevated px-3 py-2 text-xs text-ht-cyan-400">
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
              className={`flex w-full items-center justify-between rounded-ht-lg border p-3 text-left transition-all ${
                sport.enabled
                  ? "border-ht-border-hairline bg-ht-surface hover:border-ht-border-soft hover:bg-ht-elevated"
                  : "cursor-not-allowed border-ht-border-hairline bg-ht-surface/50 text-ht-fg-muted"
              }`}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-ht-fg-primary">
                <span aria-hidden="true" className="text-base">
                  {sport.icon}
                </span>
                {sport.label}
              </span>
              <span className="text-xs font-medium text-ht-fg-muted">{sport.note ?? "Continue"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
