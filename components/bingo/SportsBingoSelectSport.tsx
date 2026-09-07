"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SPORTS_BINGO_LEAGUES } from "@/lib/sportsBingoLeagues";

type SportOption = {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
  note?: string;
};

// Static fallback: today's always-clickable list, used both when season gating is off
// (NEXT_PUBLIC_BINGO_SEASON_GATING_ENABLED unset) and when the /api/bingo/leagues call fails —
// fail open, never blank the picker over a flaky request. Key/label/icon come from the shared
// catalog; only the fail-open `enabled`/`note` status stays local (see route.ts comment).
const FALLBACK_STATUS: Record<string, { enabled: boolean; note?: string }> = {
  basketball_nba: { enabled: true },
  basketball_wnba: { enabled: true },
  americanfootball_nfl: { enabled: false, note: "Coming soon" },
  baseball_mlb: { enabled: true },
};

const FALLBACK_SPORT_OPTIONS: SportOption[] = SPORTS_BINGO_LEAGUES.map((league) => ({
  key: league.sportKey,
  label: league.label,
  icon: league.emoji,
  enabled: FALLBACK_STATUS[league.sportKey]?.enabled ?? true,
  note: FALLBACK_STATUS[league.sportKey]?.note,
}));

type LeaguesApiLeague = {
  key: string;
  label: string;
  icon: string;
  status: "in_season" | "out_of_season" | "coming_soon";
  resumesLabel?: string;
  note?: string;
};

export type SportsBingoSelectSportProps = {
  /**
   * Sheet host (plan 4a). When supplied, picking a league calls this instead of navigating to
   * `/bingo/select-game` — that is the ONLY difference between the standalone route and the
   * in-place `CreateBoardSheet`. Absent, the component behaves exactly as it always has.
   */
  onSelectSport?: (sportKey: string) => void;
  /** The sheet header already says "Step 1 of 3"; suppress the in-card copy so it is not said twice. */
  hideStepHeading?: boolean;
};

export function SportsBingoSelectSport({ onSelectSport, hideStepHeading = false }: SportsBingoSelectSportProps) {
  const router = useRouter();
  const [sportOptions, setSportOptions] = useState<SportOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/bingo/leagues");
        const body = (await response.json()) as { ok: boolean; leagues?: LeaguesApiLeague[] };
        if (!response.ok || !body.ok || !Array.isArray(body.leagues)) {
          throw new Error("Failed to load leagues.");
        }
        if (cancelled) return;
        setSportOptions(
          body.leagues.map((league) => ({
            key: league.key,
            label: league.label,
            icon: league.icon,
            enabled: league.status === "in_season",
            note:
              league.status === "out_of_season"
                ? `Out of season · ${league.resumesLabel ?? "TBD"}`
                : league.status === "coming_soon"
                  ? league.note ?? "Coming soon"
                  : undefined,
          }))
        );
      } catch {
        if (!cancelled) {
          setSportOptions(FALLBACK_SPORT_OPTIONS);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = sportOptions === null;
  const options = sportOptions ?? [];

  return (
    <div className="tp-bingo-theme space-y-4">
      <div className="rounded-2xl border border-sky-300/30 bg-slate-900 p-4">
        {hideStepHeading ? null : (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Step 1 of 3</p>
        )}
        <h2 className={`text-lg font-semibold text-slate-200 ${hideStepHeading ? "" : "mt-1"}`}>Choose A League</h2>
        <p className="mt-1 text-sm text-slate-400">Pick a league, then a game, then lock in your board.</p>
        <p className="mt-3 flex items-center gap-2 rounded-md border border-sky-300/40 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-200">
          <span aria-hidden="true">📱</span>
          Tip: turn your phone sideways for the enhanced, larger board view.
        </p>

        <div className="mt-4 space-y-2">
          {isLoading
            ? FALLBACK_SPORT_OPTIONS.map((sport) => (
                <div
                  key={sport.key}
                  aria-hidden="true"
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3.5"
                >
                  <span className="h-10 w-10 animate-pulse rounded-xl bg-slate-700/60" />
                  <span className="h-4 w-24 animate-pulse rounded bg-slate-700/60" />
                </div>
              ))
            : options.map((sport) => (
                <button
                  key={sport.key}
                  type="button"
                  onClick={() => {
                    if (!sport.enabled) {
                      return;
                    }
                    if (onSelectSport) {
                      onSelectSport(sport.key);
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
