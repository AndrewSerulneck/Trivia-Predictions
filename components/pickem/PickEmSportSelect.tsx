"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";

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
  mma: "🥊",
  tennis: "🎾",
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
        <div className="rounded-ht-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400">{errorMessage}</div>
      ) : null}

        <section className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ht-fg-muted">Step 1 of 2</p>
        <h2 className="mt-1 text-lg font-semibold text-ht-fg-primary">Choose a sport or league</h2>
        <p className="mt-1 text-sm text-ht-fg-secondary">
          Select the sport you want to play today. {clickableCount} available now.
        </p>

        {loading ? (
          <div className="mt-4">
            <BouncingBallLoader size="sm" label="Loading sports..." />
          </div>
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
                className={`tp-clean-button flex w-full items-center justify-between rounded-ht-xl border p-3 text-left ${
                  sport.isClickable
                    ? "border-ht-border-hairline bg-ht-surface text-ht-fg-primary hover:border-ht-border-soft hover:bg-ht-elevated"
                    : "cursor-not-allowed border-ht-border-hairline bg-ht-surface/50 text-ht-fg-muted"
                }`}
              >
                <span className="inline-flex min-w-0 flex-col">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden="true" className="text-base">
                      {getSportIcon(sport.slug)}
                    </span>
                    {sport.label}
                  </span>
                  <span className="mt-0.5 text-xs text-ht-fg-muted">{sport.subtitle}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                    sport.isClickable
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-ht-elevated text-ht-fg-muted"
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
