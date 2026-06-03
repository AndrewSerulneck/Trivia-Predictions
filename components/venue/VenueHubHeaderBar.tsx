"use client";

import React from "react";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { formatBadgeCount, type HomeScreenIndex } from "@/components/venue/venueHubShared";

type VenueHubHeaderBarProps = {
  venueDisplayName: string;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  onTriggerPulse: () => void;
  activeScreen: HomeScreenIndex;
  onGoToScreen: (screenIndex: HomeScreenIndex) => void;
  challengeBadgeCount: number;
};

function VenueHubHeaderBarInner({
  venueDisplayName,
  isMenuOpen,
  onOpenMenu,
  onTriggerPulse,
  activeScreen,
  onGoToScreen,
  challengeBadgeCount,
}: VenueHubHeaderBarProps) {
  return (
    <section className="fixed inset-x-0 top-0 z-[1100] shrink-0 border-b border-white/10 bg-[rgba(2,6,23,0.92)] pt-[max(env(safe-area-inset-top),0px)] backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-1.5">
        <button
          type="button"
          onMouseDown={onTriggerPulse}
          onClick={onOpenMenu}
          className="tp-clean-button inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-ht-surface text-ht-fg-primary"
          aria-label="Open navigation menu"
          aria-expanded={isMenuOpen}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <h2
          className="truncate px-3 text-center text-[1.15rem] font-black uppercase tracking-[0.04em] text-cyan-300"
          style={{ fontFamily: "'Bree Serif', 'Nunito', serif" }}
        >
          {venueDisplayName}
        </h2>
        <div className="shrink-0">
          <NotificationBell />
        </div>
      </div>
      <div className="px-4 pb-2">
        <div className="mx-auto w-full max-w-[24rem] sm:max-w-md">
          <div className="rounded-full border border-cyan-400/35 bg-slate-900/90 p-1 shadow-[0_8px_24px_rgba(2,6,23,0.45)]">
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => onGoToScreen(0)}
                className={`tp-clean-button rounded-full px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] ${
                  activeScreen === 0 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                }`}
              >
                Games
              </button>
              <button
                type="button"
                onClick={() => onGoToScreen(1)}
                className={`tp-clean-button relative rounded-full px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] ${
                  activeScreen === 1 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                }`}
              >
                Challenges
                {challengeBadgeCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white">
                    {formatBadgeCount(challengeBadgeCount)}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onGoToScreen(2)}
                className={`tp-clean-button rounded-full px-2 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em] ${
                  activeScreen === 2 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                }`}
              >
                Leaderboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const VenueHubHeaderBar = React.memo(VenueHubHeaderBarInner);
VenueHubHeaderBar.displayName = "VenueHubHeaderBar";
