"use client";

import React, { useLayoutEffect, useRef } from "react";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { formatBadgeCount, type HomeScreenIndex } from "@/components/venue/venueHubShared";

type VenueHubHeaderBarProps = {
  venueDisplayName: string;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  activeScreen: HomeScreenIndex;
  onGoToScreen: (screenIndex: HomeScreenIndex) => void;
  challengeBadgeCount: number;
};

function VenueHubHeaderBarInner({
  venueDisplayName,
  isMenuOpen,
  onOpenMenu,
  activeScreen,
  onGoToScreen,
  challengeBadgeCount,
}: VenueHubHeaderBarProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const spacerRef = useRef<HTMLDivElement | null>(null);

  // The header is `fixed`, so the page needs an in-flow spacer as tall as the header really is.
  // A guessed height (it used to be "inset + 8rem") leaves a dead band or tucks content under the
  // header whenever the real height differs — the native app, a larger text size, a long venue
  // name. Measure it instead. The CSS variable is set through the ref because inline `style`
  // props are off-limits outside the TV display; until the first measurement the old guess holds.
  useLayoutEffect(() => {
    const header = headerRef.current;
    const spacer = spacerRef.current;
    if (!header || !spacer) return;
    const sync = () => {
      spacer.style.setProperty("--venue-hub-header-h", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* A <header>, not a <section>: globals.css pads every `.tp-page-main section` with
          `0.625rem !important` on phones, which silently replaced this bar's safe-area top padding
          and pushed the menu and alerts buttons under the status bar wherever the inset is real
          (the installed app). The phone padding is restated here so the website looks the same. */}
      <header
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-[1100] shrink-0 border-b border-white/10 bg-[rgba(2,6,23,0.92)] pt-[max(env(safe-area-inset-top),0px)] backdrop-blur-xl max-[430px]:p-[0.625rem] max-[430px]:pt-[max(env(safe-area-inset-top),0.625rem)]"
      >
        <div className="flex items-center justify-between px-4 py-1.5">
          <button
            type="button"
            onClick={onOpenMenu}
            className="tp-clean-button tp-player-hit-target tp-player-pressable inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-white/10 bg-ht-surface text-ht-fg-primary"
            aria-label="Open navigation menu"
            aria-expanded={isMenuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <h2
            className="truncate px-3 text-center text-[1.15rem] font-black uppercase tracking-[0.04em] text-cyan-300"
            style={{ fontFamily: "var(--ht-font-display)" }}
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
                  className={`tp-clean-button tp-player-hit-target tp-player-pressable rounded-full px-2 py-2 text-caption font-black uppercase tracking-[0.08em] ${
                    activeScreen === 0 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                  }`}
                >
                  Games
                </button>
                <button
                  type="button"
                  onClick={() => onGoToScreen(1)}
                  className={`tp-clean-button tp-player-hit-target tp-player-pressable rounded-full px-2 py-2 text-caption font-black uppercase tracking-[0.08em] ${
                    activeScreen === 1 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                  }`}
                >
                  Leaderboard
                </button>
                <button
                  type="button"
                  onClick={() => onGoToScreen(2)}
                  className={`tp-clean-button tp-player-hit-target tp-player-pressable relative rounded-full px-2 py-2 text-caption font-black uppercase tracking-[0.08em] ${
                    activeScreen === 2 ? "bg-cyan-400 text-slate-950" : "bg-slate-800/80 text-slate-200"
                  }`}
                >
                  Rewards
                  {challengeBadgeCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-caption font-black leading-none text-white">
                      {formatBadgeCount(challengeBadgeCount)}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div
        ref={spacerRef}
        aria-hidden
        data-venue-hub-header-spacer
        className="shrink-0 h-[var(--venue-hub-header-h,calc(max(env(safe-area-inset-top),0px)+8rem))]"
      />
    </>
  );
}

export const VenueHubHeaderBar = React.memo(VenueHubHeaderBarInner);
VenueHubHeaderBar.displayName = "VenueHubHeaderBar";
