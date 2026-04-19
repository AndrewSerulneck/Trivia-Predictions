"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId } from "@/lib/storage";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { Fragment } from "react";
import type { LeaderboardEntry } from "@/types";

type LeaderboardPayload = {
  ok: boolean;
  entries?: LeaderboardEntry[];
  error?: string;
};

export function LeaderboardTable({
  venueId,
  initialEntries = [],
}: {
  venueId: string;
  initialEntries?: LeaderboardEntry[];
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [isLoading, setIsLoading] = useState(initialEntries.length === 0);

  const load = useCallback(async () => {
    if (!venueId) return;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/leaderboard?venue=${encodeURIComponent(venueId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as LeaderboardPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load leaderboard.");
      }
      setEntries(payload.entries ?? []);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load leaderboard.");
    } finally {
      setIsLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    setCurrentUserId(getUserId() ?? "");
    setEntries(initialEntries);
    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 20000);

    const refreshOnPointsUpdate = () => {
      void load();
    };
    window.addEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);
    };
  }, [venueId, initialEntries, load]);

  const currentUserRank = useMemo(
    () => entries.find((entry) => entry.userId === currentUserId)?.rank ?? null,
    [currentUserId, entries]
  );

  if (errorMessage) {
    return <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>;
  }

  if (isLoading && entries.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Loading leaderboard...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No users ranked yet for this venue.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {currentUserRank ? (
        <p className="text-sm text-slate-600">
          Your current rank: <strong>#{currentUserRank}</strong>
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {entries.map((entry, index) => {
              const isCurrentUser = currentUserId && entry.userId === currentUserId;
              const shouldRenderAdBreak = (index + 1) % 25 === 0;
              const adBreakNumber = shouldRenderAdBreak ? (index + 1) / 25 : 0;
              const sequenceIndex = shouldRenderAdBreak ? ((adBreakNumber - 1) % 4) + 1 : 1;
              return (
                <Fragment key={entry.userId}>
                  <tr className={isCurrentUser ? "bg-blue-50" : undefined}>
                    <td className="px-3 py-2 font-semibold text-slate-700">#{entry.rank}</td>
                    <td className="px-3 py-2">
                      {entry.username}
                      {isCurrentUser ? (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-medium">{entry.points}</td>
                  </tr>
                  {shouldRenderAdBreak ? (
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-3 py-3">
                        <InlineSlotAdClient
                          slot="leaderboard-sidebar"
                          venueId={venueId}
                          pageKey="venue"
                          adType="inline"
                          displayTrigger="on-load"
                          placementKey="venue-leaderboard-inline"
                          sequenceIndex={sequenceIndex}
                          showPlaceholder
                          placeholderLabel={`Venue Inline Ad Space #${adBreakNumber}`}
                          placeholderDetails={`Variant ${sequenceIndex} for placement key venue-leaderboard-inline`}
                          showPlacementDebug
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
