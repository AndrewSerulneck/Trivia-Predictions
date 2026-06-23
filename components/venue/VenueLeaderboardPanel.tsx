"use client";

import React from "react";
import type { LeaderboardEntry } from "@/types";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";

type VenueLeaderboardPanelProps = {
  contentReady: boolean;
  venueId: string;
  initialEntries: LeaderboardEntry[];
  isEnabled: boolean;
};

function VenueLeaderboardPanelInner({
  contentReady,
  venueId,
  initialEntries,
  isEnabled,
}: VenueLeaderboardPanelProps) {
  return (
    <section className="venue-screen m-0 flex w-full shrink-0 basis-full snap-start flex-col items-center p-0 box-border">
      <div className={`venue-home-panel-content w-full px-[clamp(1rem,3.2vw,1.5rem)] pb-8 pt-1 transition-opacity duration-300 ${contentReady ? "opacity-100" : "opacity-0"}`}>
        <div className="mx-auto w-full max-w-[26rem] space-y-3">
          <div className="rounded-2xl border border-cyan-400/30 bg-slate-900 p-4">
            <p className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-cyan-300">All Time Leaderboard</p>
            <LeaderboardTable
              venueId={venueId}
              initialEntries={initialEntries}
              isEnabled={isEnabled}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export const VenueLeaderboardPanel = React.memo(VenueLeaderboardPanelInner);
VenueLeaderboardPanel.displayName = "VenueLeaderboardPanel";
