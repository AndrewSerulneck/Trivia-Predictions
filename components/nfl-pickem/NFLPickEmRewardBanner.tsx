"use client";

import { useEffect, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import { NFL_REWARD_MIN_PICKERS } from "@/lib/nflPickEmRewardWeeks";
import { describeRewardPrize } from "@/lib/rewardDefinitions";
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
  const [participantCount, setParticipantCount] = useState<number | null>(null);
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
        setParticipantCount(typeof data.participantCount === "number" ? data.participantCount : null);
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

  return (
    <div className="space-y-2.5">
      {campaigns.map((campaign) => {
        const isGameWinner = campaign.winCondition === "game_winner";
        const quotaRemaining = campaign.quotaRemaining ?? campaign.winnerQuota ?? 1;
        const isExhausted = quotaRemaining <= 0;
        const isWon = Boolean(campaign.viewerWon);
        const prize = describeRewardPrize(campaign);
        const target = Math.max(1, Number(campaign.pointsRequiredToWin ?? 1));
        const progress = Math.max(0, Number(campaign.progressPoints ?? 0));
        const percent = Math.min(100, Math.round((progress / target) * 100));
        const belowMinimum = participantCount !== null && participantCount < NFL_REWARD_MIN_PICKERS;

        return (
          <section
            key={campaign.id}
            className="rounded-2xl border border-[#fde68a]/30 bg-slate-900 px-4 py-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🏆</span>
              <h2 className="text-[13px] font-black uppercase tracking-[0.1em] text-[#fde68a]">
                {campaign.name}
              </h2>
            </div>
            {prize ? <p className="mt-1.5 text-[15px] font-black text-white">{prize}</p> : null}
            {campaign.rules ? (
              <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-400">{campaign.rules}</p>
            ) : null}

            {isWon ? (
              <p className="mt-3 text-[12px] font-bold text-amber-300">
                You won! Find your coupon under Redeem Prizes.
              </p>
            ) : isExhausted ? (
              <p className="mt-3 text-[12px] font-semibold text-slate-500">
                All prizes for this cycle have been claimed — check back next cycle.
              </p>
            ) : isGameWinner ? (
              <div className="mt-3 space-y-1.5">
                {participantCount !== null ? (
                  belowMinimum ? (
                    <p className="text-[12px] font-bold text-amber-300">
                      {participantCount} of {NFL_REWARD_MIN_PICKERS} players needed — at least{" "}
                      {NFL_REWARD_MIN_PICKERS} people must make picks this week for a winner to be crowned. Tell a
                      friend!
                    </p>
                  ) : (
                    <p className="text-[12px] font-bold text-emerald-300">
                      {participantCount} players in — a winner will be crowned this week.
                    </p>
                  )
                ) : null}
                <p className="text-[11px] text-slate-500">
                  Tied on correct picks? The tiebreaker question decides it.
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#fde68a] to-[#f59e0b] transition-all duration-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[12px] font-semibold tabular-nums text-slate-400">
                  {progress.toLocaleString()} of {target.toLocaleString()} picks right
                </p>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
