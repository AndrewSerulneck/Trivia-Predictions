"use client";

import React from "react";
import type { VenueGameCardConfig, VenueGameKey } from "@/lib/venueGameCards";
import {
  formatBadgeCount,
  GAME_TITLE_LINES_BY_KEY,
  VENUE_HUB_TILE_GRADIENT_BY_KEY,
  VENUE_HUB_TILE_SUBTITLE_BY_KEY,
  type LiveTriviaStatus,
  type VenueArrivalStage,
} from "@/components/venue/venueHubShared";

const WEEKDAY_LABELS: Record<string, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function formatRecurringScheduleLabel(status: LiveTriviaStatus, nextStartAtMs: number | null): string | null {
  if (status.recurringType !== "weekly" && status.recurringType !== "daily") return null;
  const days = [...status.recurringDays].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)
  );

  let dayLabel: string;
  if (status.recurringType === "daily") {
    dayLabel = "every day";
  } else if (days.length === 1) {
    dayLabel = `every ${WEEKDAY_LABELS[days[0]] ?? days[0]}`;
  } else if (days.length > 1) {
    const names = days.map((d) => WEEKDAY_LABELS[d] ?? d);
    dayLabel = `every ${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  } else {
    return null;
  }

  if (!nextStartAtMs) return `Live Trivia ${dayLabel}`;

  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(nextStartAtMs));

  return `Live Trivia ${dayLabel} at ${timeStr}`;
}

type VenueGamesPanelProps = {
  contentReady: boolean;
  showFastPathSkeleton: boolean;
  arrivalStatusText: string;
  arrivalStage: VenueArrivalStage;
  arrivalProgress: number;
  liveTriviaStatus: LiveTriviaStatus;
  nextLiveTriviaCountdownLabel: string;
  nextLiveTriviaCountdownSeconds: number | null;
  lobbyButtonShouldPulse: boolean;
  pendingDestination: VenueGameKey | null;
  orderedHomeCards: VenueGameCardConfig[];
  visibleBadgeByGame: Map<VenueGameKey, string>;
  badgeError: string;
  categoryBlitzSessionActive?: boolean;
  onTriggerPulse: () => void;
  onGoTo: (dest: VenueGameKey, sourceElement: HTMLElement | null) => void;
  onRetryBadges: () => void;
};

function VenueGamesPanelInner({
  contentReady,
  showFastPathSkeleton,
  arrivalStatusText,
  arrivalStage,
  arrivalProgress,
  liveTriviaStatus,
  nextLiveTriviaCountdownLabel,
  nextLiveTriviaCountdownSeconds,
  lobbyButtonShouldPulse,
  pendingDestination,
  orderedHomeCards,
  visibleBadgeByGame,
  badgeError,
  categoryBlitzSessionActive = false,
  onTriggerPulse,
  onGoTo,
  onRetryBadges,
}: VenueGamesPanelProps) {
  return (
    <section className="venue-screen relative m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
      <div className={`venue-home-panel-content venue-home-games-fit w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-4 pt-2 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
        {showFastPathSkeleton ? (
          <div className="mx-auto mb-2 w-full max-w-[24rem] rounded-2xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-center text-xs font-semibold text-slate-300">
            <p>{arrivalStatusText}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-slate-400">
              {arrivalStage} · {Math.round(arrivalProgress)}%
            </p>
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-[24rem] space-y-3 sm:max-w-md">
          <div className="rounded-2xl border border-amber-400/60 bg-ht-surface p-3 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
            <div className="flex items-stretch gap-3">
              <div className="min-w-0 flex-1">
                {(() => {
                  const recurringLabel = formatRecurringScheduleLabel(liveTriviaStatus, liveTriviaStatus.nextStartAtMs);
                  if (liveTriviaStatus.live) {
                    return (
                      <>
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-300">
                          {recurringLabel ?? "Live Trivia in progress!"}
                        </p>
                        <p className="mt-1 font-black text-amber-200 text-[2.2rem] leading-none">
                          Live now!
                        </p>
                      </>
                    );
                  }
                  const isFarOut = recurringLabel != null &&
                    nextLiveTriviaCountdownSeconds != null &&
                    nextLiveTriviaCountdownSeconds >= 86400;
                  if (isFarOut) {
                    return (
                      <p className="font-black text-amber-200 text-[1.35rem] leading-snug">
                        {recurringLabel}
                      </p>
                    );
                  }
                  return (
                    <>
                      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-300">
                        {recurringLabel ?? "Next Live Trivia Showdown In"}
                      </p>
                      <p className="mt-1 font-black tabular-nums text-amber-200 text-[2.2rem] leading-none">
                        {nextLiveTriviaCountdownLabel}
                      </p>
                      {!recurringLabel && liveTriviaStatus.label ? (
                        <p className="mt-1 text-xs font-semibold text-amber-100/90">{liveTriviaStatus.label}</p>
                      ) : null}
                    </>
                  );
                })()}
              </div>
              <button
                type="button"
                onMouseDown={onTriggerPulse}
                onClick={(event) => {
                  onGoTo("live_trivia", event.currentTarget);
                }}
                disabled={pendingDestination !== null}
                className={`tp-clean-button min-w-[7.2rem] rounded-[12px] border px-4 py-2 text-lg font-black leading-tight transition-all disabled:opacity-60 ${
                  lobbyButtonShouldPulse
                    ? "animate-pulse border-rose-300/60 bg-rose-400/20 text-rose-200 shadow-[0_0_0_1px_rgba(252,165,165,0.3)]"
                    : "border-cyan-400/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.28)] hover:bg-cyan-400/15"
                }`}
              >
                Enter
                <br />
                lobby
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {orderedHomeCards.map((card) => {
              const isOpening = pendingDestination === card.key;
              const badge = visibleBadgeByGame.get(card.key);
              const isLiveTriviaCard = card.key === "live_trivia";
              const isCategoryBlitzLive = card.key === "category-blitz" && categoryBlitzSessionActive;
              const statusLabel = (isLiveTriviaCard && liveTriviaStatus.live) || isCategoryBlitzLive ? "LIVE" : null;
              return (
                <button
                  key={card.key}
                  type="button"
                  onMouseDown={onTriggerPulse}
                  onClick={(event) => {
                    onGoTo(card.key, event.currentTarget);
                  }}
                  disabled={pendingDestination !== null}
                  data-venue-game-card={card.key}
                  className={`tp-clean-button tp-game-card-btn group relative w-full overflow-hidden rounded-[22px] border border-white/75 text-left shadow-[0_12px_26px_rgba(15,23,42,0.5)] ${isOpening ? "is-opening" : ""}`}
                  style={{ backgroundImage: VENUE_HUB_TILE_GRADIENT_BY_KEY[card.key] }}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_14%,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.12)_40%,rgba(255,255,255,0)_72%)]" />
                  <div className="relative flex min-h-[190px] flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="text-[2rem] font-black uppercase leading-[0.95] text-white"
                        style={{
                          fontFamily: "'Bree Serif', 'Nunito', serif",
                          letterSpacing: "0.045em",
                          textShadow: "0 1px 0 rgba(12,18,28,.8), 0 3px 0 rgba(12,18,28,.58), 0 0 12px rgba(255,255,255,.5)",
                        }}
                      >
                        {GAME_TITLE_LINES_BY_KEY[card.key][0]}
                        <br />
                        {GAME_TITLE_LINES_BY_KEY[card.key][1]}
                      </div>
                      {statusLabel ? (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-rose-300/60 bg-rose-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-rose-200">
                          <span className="h-[7px] w-[7px] rounded-full bg-rose-500" />
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>

                    {isCategoryBlitzLive ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-amber-300/60 bg-amber-500/20 px-3 py-2.5">
                        <div>
                          <p className="text-[20px] font-black uppercase tracking-[0.12em] text-amber-100">
                            Live game in progress!
                          </p>
                          <p className="mt-1 text-[19px] font-semibold leading-snug text-amber-50/90">
                            {VENUE_HUB_TILE_SUBTITLE_BY_KEY[card.key]}
                          </p>
                        </div>
                        <span className="self-start rounded-full border border-amber-200/70 bg-amber-400/25 px-2.5 py-1 text-[22px] font-black uppercase tracking-[0.06em] text-amber-100">
                          Join now
                        </span>
                      </div>
                    ) : (
                      <div className="max-w-[92%] rounded-xl border border-white/40 bg-black/30 px-3 py-2 text-[19px] font-bold leading-snug text-white/95">
                        {VENUE_HUB_TILE_SUBTITLE_BY_KEY[card.key]}
                      </div>
                    )}

                  </div>

                  {badge ? (
                    <span className="absolute right-2 top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black leading-none text-white shadow-[0_2px_8px_rgba(15,23,42,0.45)]">
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {badgeError ? (
          <button
            type="button"
            onClick={onRetryBadges}
            className="mx-auto mt-2 block max-w-[24rem] rounded-full border border-slate-600 bg-slate-800 px-3 py-1.5 text-center text-[11px] font-semibold text-slate-300"
          >
            {badgeError} Tap to retry
          </button>
        ) : null}
      </div>
    </section>
  );
}

export const VenueGamesPanel = React.memo(VenueGamesPanelInner);
VenueGamesPanel.displayName = "VenueGamesPanel";
