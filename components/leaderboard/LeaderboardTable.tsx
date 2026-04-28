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

function rankBadge(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `#${rank}`;
}

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
        <div className="inline-flex rounded-xl border-2 border-[#3b2412] bg-[#1f5136] px-3 py-1.5 shadow-[0_2px_0_rgba(0,0,0,0.25)]">
          <p className="text-base font-semibold text-[#ecf8f1] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">
            Your current rank: <strong>#{currentUserRank}</strong>
          </p>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border-4 border-[#3b2412] bg-[#4a2e18] p-1 shadow-[0_10px_20px_rgba(15,23,42,0.32),inset_0_0_0_2px_rgba(255,255,255,0.08)]">
        <table
          className="w-full table-fixed divide-y divide-white/15 text-sm text-[#f3fff8]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 16%, rgba(255,255,255,0.07) 0, rgba(255,255,255,0) 32%), radial-gradient(circle at 78% 82%, rgba(255,255,255,0.05) 0, rgba(255,255,255,0) 34%), linear-gradient(180deg, #245f41 0%, #1f5136 100%)",
          }}
        >
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "56%" }} />
            <col style={{ width: "24%" }} />
          </colgroup>
          <thead className="bg-[#275f41] text-left text-[#f8fff8]">
            <tr>
              <th className="px-3 py-2 text-lg font-semibold [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">Rank</th>
              <th className="px-3 py-2 text-lg font-semibold [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">Username</th>
              <th className="px-3 py-2 text-right text-lg font-semibold [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.5)]">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-transparent">
            {entries.map((entry, index) => {
              const isCurrentUser = currentUserId && entry.userId === currentUserId;
              const shouldRenderAdBreak = (index + 1) % 15 === 0;
              const adBreakNumber = shouldRenderAdBreak ? (index + 1) / 15 : 0;
              const sequenceIndex = shouldRenderAdBreak ? ((adBreakNumber - 1) % 6) + 1 : 1;
              const isTopThree = entry.rank <= 3;
              return (
                <Fragment key={entry.userId}>
                  <tr
                    className={
                      isCurrentUser
                        ? "bg-[#4a8766]/72"
                        : isTopThree
                        ? "bg-[#417b5a]/58"
                        : "bg-[#2e6647]/32"
                    }
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex min-w-[2.45rem] items-center justify-center rounded-full border px-2 py-0.5 text-base font-semibold [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.45)] ${
                          entry.rank === 1
                            ? "border-amber-200 bg-amber-100/30 text-amber-50"
                            : entry.rank === 2
                            ? "border-slate-200 bg-slate-100/25 text-slate-100"
                            : entry.rank === 3
                            ? "border-orange-200 bg-orange-100/25 text-orange-100"
                            : "border-white/40 bg-white/10 text-[#f6fff8]"
                        }`}
                      >
                        {rankBadge(entry.rank)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block truncate align-middle text-xl [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.45)]">
                        {entry.username}
                      </span>
                      {isCurrentUser ? (
                        <span className="ml-2 rounded-full border border-white/55 bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-xl font-semibold text-[#f6fff8] [font-family:'Kalam',cursive] [text-shadow:0_1px_0_rgba(0,0,0,0.45)]">
                      {entry.points}
                    </td>
                  </tr>
                  {shouldRenderAdBreak ? (
                    <tr className="bg-[#275f41]/85">
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
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {entries.length < 15 ? (
              <tr className="bg-[#275f41]/85">
                <td colSpan={3} className="px-3 py-3">
                  <InlineSlotAdClient
                    slot="leaderboard-sidebar"
                    venueId={venueId}
                    pageKey="venue"
                    adType="inline"
                    displayTrigger="on-load"
                    placementKey="venue-leaderboard-inline"
                    sequenceIndex={1}
                    showPlaceholder
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
