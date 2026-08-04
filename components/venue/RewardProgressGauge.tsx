"use client";

import React from "react";

// One gauge, two hosts: the Rewards card (VenueChallengesPanel) and the reward
// detail modal (VenueHubClient). Extracted in the prize-first redesign (Phase 3,
// docs/rewards-panel-prize-first-plan.md) so the two can never drift apart.
//
// `barGradient` is a computed per-game gradient (CHALLENGE_ICON_STYLE), which is
// why this file uses inline style for the fill — same local idiom as the card it
// came from.

type RewardProgressGaugeSize = "card" | "modal";

type RewardProgressGaugeProps = {
  progress: number;
  target: number;
  barGradient: string;
  size?: RewardProgressGaugeSize;
};

const TRACK_CLASS_BY_SIZE: Record<RewardProgressGaugeSize, string> = {
  card: "h-2",
  modal: "h-3.5",
};

const READOUT_CLASS_BY_SIZE: Record<RewardProgressGaugeSize, string> = {
  card: "mt-1.5 text-sm",
  modal: "mt-2 text-lg",
};

export function RewardProgressGauge({ progress, target, barGradient, size = "card" }: RewardProgressGaugeProps) {
  const safeProgress = Math.max(0, Number(progress) || 0);
  const safeTarget = Math.max(1, Number(target) || 1);
  const percent = Math.min(100, Math.round((safeProgress / safeTarget) * 100));
  return (
    <div>
      <div className={`w-full overflow-hidden rounded-full bg-slate-800/80 ${TRACK_CLASS_BY_SIZE[size]}`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: barGradient }}
        />
      </div>
      <div className={`font-semibold tabular-nums text-slate-500 ${READOUT_CLASS_BY_SIZE[size]}`}>
        {safeProgress.toLocaleString()} / {safeTarget.toLocaleString()} pts
      </div>
    </div>
  );
}
