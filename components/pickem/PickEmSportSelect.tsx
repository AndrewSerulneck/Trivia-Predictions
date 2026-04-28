"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PickEmSport = {
  slug: string;
  label: string;
  subtitle: string;
  isInSeason: boolean;
  isClickable: boolean;
};

type SportsResponse = {
  ok: boolean;
  sports?: PickEmSport[];
  error?: string;
};

const SPORT_ICONS: Record<string, string> = {
  nba: "🏀",
  mlb: "⚾",
  soccer: "⚽",
  nfl: "🏈",
  nhl: "🏒",
};

function getSportIcon(slug: string): string {
  return SPORT_ICONS[slug] ?? "🏟️";
}

export function PickEmSportSelect() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sports, setSports] = useState<PickEmSport[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch("/api/pickem/sports", { cache: "no-store" });
        const payload = (await response.json()) as SportsResponse;
        if (!payload.ok) {
          throw new Error(payload.error ?? "Unable to load Pick 'Em sports right now.");
        }
        setSports(payload.sports ?? []);
      } catch (error) {
        setSports([]);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load Pick 'Em sports right now.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const clickableCount = useMemo(() => sports.filter((sport) => sport.isClickable).length, [sports]);

  return (
    <div className="space-y-4">
      {errorMessage ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>
      ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 1 of 2</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Choose a sport or league</h2>
        <p className="mt-1 text-sm text-slate-700">
          Select the sport you want to play today. {clickableCount} available now.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading sports...</p>
        ) : (
          <div className="mt-4 space-y-2">
            {sports.map((sport) => (
              <button
                key={sport.slug}
                type="button"
                disabled={!sport.isClickable}
                onClick={() => {
                  if (!sport.isClickable) {
                    return;
                  }
                  router.push(`/pickem/${encodeURIComponent(sport.slug)}`);
                }}
                className={`tp-clean-button flex w-full items-center justify-between rounded-xl border p-3 text-left ${
                  sport.isClickable
                    ? "border-slate-200 bg-white text-slate-900"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                }`}
              >
                <span className="inline-flex min-w-0 flex-col">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden="true" className="text-base">
                      {getSportIcon(sport.slug)}
                    </span>
                    {sport.label}
                  </span>
                  <span className="mt-0.5 text-xs text-slate-600">{sport.subtitle}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                    sport.isClickable
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {sport.isClickable ? "Available" : "Coming Soon"}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
