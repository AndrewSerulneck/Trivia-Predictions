"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserId } from "@/lib/storage";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { Fragment } from "react";
import type { AdSlot, LeaderboardEntry } from "@/types";

type LeaderboardPayload = {
  ok: boolean;
  entries?: LeaderboardEntry[];
  currentUserRank?: number | null;
  error?: string;
};

const VENUE_LEADERBOARD_SLOTS: Record<number, AdSlot> = {
  1: "venue-leaderboard-rows-1-10",
  2: "venue-leaderboard-rows-11-20",
  3: "venue-leaderboard-rows-21-30",
  4: "venue-leaderboard-rows-31-40",
  5: "venue-leaderboard-rows-41-50",
};

function areEntriesEqual(a: LeaderboardEntry[], b: LeaderboardEntry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) return false;
    if (
      left.userId !== right.userId ||
      left.username !== right.username ||
      left.rank !== right.rank ||
      left.points !== right.points
    ) {
      return false;
    }
  }
  return true;
}

function rankBadge(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `#${rank}`;
}

export function LeaderboardTable({
  venueId,
  initialEntries = [],
  isEnabled = true,
  mobileBottomSpacer = false,
}: {
  venueId: string;
  initialEntries?: LeaderboardEntry[];
  isEnabled?: boolean;
  mobileBottomSpacer?: boolean;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [resolvedCurrentUserRank, setResolvedCurrentUserRank] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(isEnabled && initialEntries.length === 0);
  const hydratedVenueRef = useRef("");

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!venueId) return;
    const silent = Boolean(options?.silent);
    if (!silent) {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams({ venue: venueId });
      const safeUserId = (getUserId() ?? "").trim();
      if (safeUserId) {
        params.set("userId", safeUserId);
      }
      const response = await fetch(`/api/leaderboard?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as LeaderboardPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load leaderboard.");
      }
      const nextEntries = payload.entries ?? [];
      setEntries((current) => (areEntriesEqual(current, nextEntries) ? current : nextEntries));
      const nextRank = Number.isFinite(payload.currentUserRank ?? NaN) ? Math.max(1, Number(payload.currentUserRank)) : null;
      setResolvedCurrentUserRank((current) => (current === nextRank ? current : nextRank));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load leaderboard.");
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [venueId]);

  useEffect(() => {
    setCurrentUserId(getUserId() ?? "");
  }, []);

  useEffect(() => {
    if (!isEnabled || !venueId) {
      return;
    }
    if (hydratedVenueRef.current !== venueId) {
      hydratedVenueRef.current = venueId;
      setEntries(initialEntries);
      setIsLoading(initialEntries.length === 0);
    }
  }, [initialEntries, isEnabled, venueId]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    void load({ silent: entries.length > 0 });

    const interval = window.setInterval(() => {
      void load({ silent: true });
    }, 20000);

    const refreshOnPointsUpdate = () => {
      void load({ silent: true });
    };
    window.addEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", refreshOnPointsUpdate as EventListener);
    };
  }, [entries.length, isEnabled, load]);

  const currentUserRank = useMemo(
    () => resolvedCurrentUserRank ?? entries.find((entry) => entry.userId === currentUserId)?.rank ?? null,
    [currentUserId, entries, resolvedCurrentUserRank]
  );

  if (isLoading && entries.length === 0) {
    return (
      <div className="rounded-ht-md border border-ht-border-hairline bg-ht-elevated p-4 text-sm text-ht-fg-muted">
        Loading leaderboard...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-ht-md border border-ht-border-hairline bg-ht-elevated p-4 text-sm text-ht-fg-muted">
        No users ranked yet for this venue.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <div className="flex items-center justify-between gap-2 rounded-ht-md border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-300">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-ht-sm border border-amber-400/40 bg-ht-elevated px-2 py-1 font-semibold text-amber-300"
          >
            Retry
          </button>
        </div>
      ) : null}
      {currentUserRank ? (
        <div className="inline-flex rounded-ht-pill border border-amber-400/40 bg-amber-500/10 px-3 py-1.5">
          <p className="text-base font-semibold text-amber-300">
            Your current rank: <strong>#{currentUserRank}</strong>
          </p>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-ht-xl border border-ht-border-soft bg-ht-surface shadow-ht-card">
        <table className="w-full table-fixed divide-y divide-ht-border-hairline text-sm text-ht-fg-secondary">
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "56%" }} />
            <col style={{ width: "24%" }} />
          </colgroup>
          <thead className="bg-ht-elevated text-left text-ht-fg-primary border-b border-ht-border-soft">
            <tr>
              <th className="px-3 py-2 text-sm font-black tracking-wide uppercase" style={{ color: "var(--ht-amber-500)", letterSpacing: "var(--ht-track-eyebrow)" }}>Rank</th>
              <th className="px-3 py-2 text-sm font-black tracking-wide uppercase" style={{ color: "var(--ht-amber-500)", letterSpacing: "var(--ht-track-eyebrow)" }}>Username</th>
              <th className="px-3 py-2 text-right text-sm font-black tracking-wide uppercase" style={{ color: "var(--ht-amber-500)", letterSpacing: "var(--ht-track-eyebrow)" }}>Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ht-border-hairline bg-transparent">
            {entries.map((entry, index) => {
              const isCurrentUser = currentUserId && entry.userId === currentUserId;
              const shouldRenderAdBreak = (index + 1) % 10 === 0;
              const adBreakNumber = shouldRenderAdBreak ? (index + 1) / 10 : 0;
              const sequenceIndex = shouldRenderAdBreak ? ((adBreakNumber - 1) % 6) + 1 : 1;
              const isTopThree = entry.rank <= 3;
              return (
                <Fragment key={entry.userId}>
                  <tr
                    className={
                      isCurrentUser
                        ? "bg-amber-500/12"
                        : isTopThree
                        ? "bg-ht-elevated/50"
                        : ""
                    }
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex min-w-[2.45rem] items-center justify-center rounded-ht-pill border px-2 py-0.5 text-sm font-bold ht-tabular ${
                          entry.rank === 1
                            ? "border-amber-400/60 bg-amber-500/20 text-amber-300"
                            : entry.rank === 2
                            ? "border-slate-400/50 bg-slate-500/20 text-slate-300"
                            : entry.rank === 3
                            ? "border-orange-400/50 bg-orange-500/20 text-orange-300"
                            : "border-ht-border-hairline bg-ht-elevated text-ht-fg-muted"
                        }`}
                      >
                        {rankBadge(entry.rank)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="block truncate align-middle text-base font-semibold text-ht-fg-primary">
                        {entry.username}
                      </span>
                      {isCurrentUser ? (
                        <span className="ml-2 rounded-ht-pill border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-base font-bold text-ht-fg-primary ht-tabular">
                      {entry.points}
                    </td>
                  </tr>
                  {shouldRenderAdBreak ? (
                    <tr className="bg-ht-elevated/40">
                      <td colSpan={3} className="px-3 py-3">
                        <InlineSlotAdClient
                          slot={VENUE_LEADERBOARD_SLOTS[sequenceIndex] ?? "venue-leaderboard-rows-1-10"}
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
              <tr className="bg-ht-elevated/40">
                <td colSpan={3} className="px-3 py-3">
                  <InlineSlotAdClient
                    slot={VENUE_LEADERBOARD_SLOTS[1] ?? "venue-leaderboard-rows-1-10"}
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
      {mobileBottomSpacer ? <div aria-hidden="true" className="h-[50svh] min-h-[14rem] md:hidden" /> : null}
    </div>
  );
}
