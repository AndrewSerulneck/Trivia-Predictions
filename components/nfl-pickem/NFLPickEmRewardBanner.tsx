"use client";

import { useEffect, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import { describeRewardPrize } from "@/lib/rewardDefinitions";
import { describeReward } from "@/lib/rewardDescription";
import type { ChallengeCampaign } from "@/types";

type NFLRewardCampaign = ChallengeCampaign & { progressPoints: number };

/**
 * Active-reward awareness for /nfl-pickem — Phase 8. Self-contained and
 * entirely client-fetched (per the "server render must stay fast" precedent:
 * app/nfl-pickem/page.tsx is a server component with no venue/week context of
 * its own, and adding one here would slow its render for every guest, most of
 * whom have no active NFL reward).
 */
export function NFLPickEmRewardBanner() {
  const [venueId, setVenueId] = useState("");
  const [userId, setUserId] = useState("");
  const [campaigns, setCampaigns] = useState<NFLRewardCampaign[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setVenueId(getVenueId() || "");
    setUserId(getUserId() || "");
  }, []);

  useEffect(() => {
    if (!venueId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const weeksResponse = await fetch("/api/nfl-pickem/weeks");
        const weeksData = await weeksResponse.json();
        const currentWeekId = weeksData?.ok ? String(weeksData.currentWeekId ?? "") : "";
        if (cancelled) return;

        const params = new URLSearchParams({ venueId });
        if (userId) params.set("userId", userId);
        if (currentWeekId) params.set("weekId", currentWeekId);

        const response = await fetch(`/api/nfl-pickem/rewards?${params.toString()}`);
        const data = await response.json();
        if (cancelled || !data.ok) return;

        setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [venueId, userId]);

  if (!loaded || campaigns.length === 0) return null;

  // Deliberately one short line per reward: it only tells the player a reward
  // is attached to this game. The full rules (minimum pickers, tiebreaker,
  // cadence) live on the venue Rewards card, not here.
  return (
    <div className="space-y-1.5">
      {campaigns.map((campaign) => {
        const quotaRemaining = campaign.quotaRemaining ?? campaign.winnerQuota ?? 1;
        const showProgress = campaign.winCondition !== "game_winner";
        const target = Math.max(1, Number(campaign.pointsRequiredToWin ?? 1));
        const progress = Math.max(0, Number(campaign.progressPoints ?? 0));
        // Same Line 1 the venue Rewards card shows (docs/reward-descriptions-plan.md).
        // Composed here, not served: Line 1 needs no calendar facts, and this route
        // is re-polled on every week switch, so it stays free of the extra read.
        const summary = describeReward(campaign, new Date()).summary || describeRewardPrize(campaign) || campaign.name;

        const status = campaign.viewerWon
          ? "You won! See Redeem Prizes."
          : quotaRemaining <= 0
            ? "All prizes claimed this cycle."
            : showProgress
              ? `${progress.toLocaleString()}/${target.toLocaleString()} picks right · Details in Prizes`
              : "Details in Prizes";

        return (
          <p
            key={campaign.id}
            className="flex items-start gap-2 rounded-xl border border-[#fde68a]/25 bg-slate-900 px-3 py-2 text-caption leading-snug"
          >
            <span aria-hidden>🏆</span>
            <span className="min-w-0">
              <span className="font-bold text-[#fde68a]">{summary}</span>{" "}
              <span className={campaign.viewerWon ? "font-bold text-amber-300" : "text-slate-400"}>{status}</span>
            </span>
          </p>
        );
      })}
    </div>
  );
}
