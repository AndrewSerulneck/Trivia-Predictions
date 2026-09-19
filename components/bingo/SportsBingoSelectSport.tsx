"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SPORTS_BINGO_LEAGUES } from "@/lib/sportsBingoLeagues";

type SportOption = {
  key: string;
  label: string;
  icon: string;
};

type LeaguesApiLeague = {
  key: string;
  label: string;
  icon: string;
};

type LeaguesResponse = {
  ok: boolean;
  leagues?: LeaguesApiLeague[];
  incomplete?: boolean;
  warning?: string;
  error?: string;
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
  const requestIdRef = useRef(0);
  const localDateRef = useRef("");
  const hasLoadedRef = useRef(false);
  const [sportOptions, setSportOptions] = useState<SportOption[] | null>(null);
  const [warningMessage, setWarningMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadLeagues = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!hasLoadedRef.current) {
      setErrorMessage("");
    } else {
      setRefreshing(true);
    }

    try {
      const tzOffsetMinutes = new Date().getTimezoneOffset();
      const response = await fetch(
        `/api/bingo/leagues?tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as LeaguesResponse;
      if (!response.ok || !body.ok || !Array.isArray(body.leagues)) {
        throw new Error(body.error ?? "Failed to load available leagues.");
      }
      if (requestIdRef.current !== requestId) return;
      hasLoadedRef.current = true;
      setSportOptions(body.leagues);
      setErrorMessage("");
      setWarningMessage(body.incomplete ? body.warning ?? "Some leagues could not be checked. Try again." : "");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      hasLoadedRef.current = true;
      setSportOptions([]);
      setWarningMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load available leagues.");
    } finally {
      if (requestIdRef.current === requestId) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    localDateRef.current = new Date().toDateString();
    void loadLeagues();

    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      void loadLeagues();
    };
    const checkLocalDate = () => {
      const nextDate = new Date().toDateString();
      if (nextDate === localDateRef.current) return;
      localDateRef.current = nextDate;
      void loadLeagues();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const dateTimer = window.setInterval(checkLocalDate, 60_000);

    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.clearInterval(dateTimer);
    };
  }, [loadLeagues]);

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
            ? SPORTS_BINGO_LEAGUES.map((sport) => (
                <div
                  key={sport.sportKey}
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
                    if (onSelectSport) {
                      onSelectSport(sport.key);
                      return;
                    }
                    router.push(`/bingo/select-game?sportKey=${encodeURIComponent(sport.key)}`);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-sky-300/25 bg-slate-800/60 p-3.5 text-left transition-all hover:border-sky-300/60 active:scale-[0.99]"
                >
                  <span className="inline-flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-300/[0.12] text-xl ring-1 ring-sky-300/30"
                    >
                      {sport.icon}
                    </span>
                    <span className="text-base font-black text-slate-100">{sport.label}</span>
                  </span>
                  <span aria-hidden="true" className="text-lg font-black text-sky-300">›</span>
                </button>
              ))}
        </div>

        {!isLoading && !errorMessage && !warningMessage && options.length === 0 ? (
          <div className="mt-3 rounded-md border border-sky-300/25 bg-slate-800/60 p-3 text-sm text-sky-200">
            No games are available for board creation today.
          </div>
        ) : null}

        {errorMessage || warningMessage ? (
          <div
            role={errorMessage ? "alert" : "status"}
            className={`mt-3 rounded-md border p-3 text-sm ${
              errorMessage
                ? "border-rose-500/40 bg-rose-950/30 text-rose-300"
                : "border-amber-300/35 bg-amber-300/10 text-amber-100"
            }`}
          >
            <p>{errorMessage || warningMessage}</p>
            <button
              type="button"
              onClick={() => void loadLeagues()}
              disabled={refreshing}
              className="tp-clean-button mt-2 rounded-lg border border-current/30 px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] disabled:opacity-60"
            >
              {refreshing ? "Checking…" : "Try Again"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
