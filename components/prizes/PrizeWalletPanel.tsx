"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId, getVenueId } from "@/lib/storage";
import type { PrizeWin, WeeklyPrize } from "@/types";

type PrizePayload = {
  ok: boolean;
  weekStart?: string;
  weeklyPrize?: WeeklyPrize | null;
  wins?: PrizeWin[];
  error?: string;
};

function formatLocalDate(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown date";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PrizeWalletPanel() {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [claimingId, setClaimingId] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [weeklyPrize, setWeeklyPrize] = useState<WeeklyPrize | null>(null);
  const [wins, setWins] = useState<PrizeWin[]>([]);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!venueId) {
      setLoading(false);
      setWeeklyPrize(null);
      setWins([]);
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ venueId });
      if (userId) {
        params.set("userId", userId);
      }
      const response = await fetch(`/api/prizes?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as PrizePayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load prize information.");
      }
      setWeekStart(payload.weekStart ?? "");
      setWeeklyPrize(payload.weeklyPrize ?? null);
      setWins(payload.wins ?? []);
    } catch (error) {
      setWeeklyPrize(null);
      setWins([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load prize information.");
    } finally {
      setLoading(false);
    }
  }, [userId, venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const awardedWins = useMemo(() => wins.filter((win) => win.status === "awarded"), [wins]);
  const claimedWins = useMemo(() => wins.filter((win) => win.status === "claimed"), [wins]);

  const claimPrize = useCallback(
    async (prizeWin: PrizeWin, sourceRect: DOMRect) => {
      if (!userId || !prizeWin.id || claimingId) {
        return;
      }
      setClaimingId(prizeWin.id);
      setErrorMessage("");
      setStatusMessage("");
      try {
        const response = await fetch("/api/prizes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "claim",
            userId,
            prizeWinId: prizeWin.id,
          }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          result?: { claimed: boolean; rewardPoints: number; prizeTitle: string };
          error?: string;
        };
        if (!payload.ok || !payload.result) {
          throw new Error(payload.error ?? "Failed to claim this prize.");
        }

        if (payload.result.claimed && payload.result.rewardPoints > 0) {
          window.dispatchEvent(
            new CustomEvent("tp:coin-flight", {
              detail: {
                sourceRect: {
                  left: sourceRect.left,
                  top: sourceRect.top,
                  width: sourceRect.width,
                  height: sourceRect.height,
                },
                delta: payload.result.rewardPoints,
                coins: Math.min(36, Math.max(12, Math.round(payload.result.rewardPoints / 2))),
              },
            })
          );
          window.dispatchEvent(
            new CustomEvent("tp:points-updated", {
              detail: {
                source: "prize-claim",
                delta: payload.result.rewardPoints,
              },
            })
          );
        }

        setStatusMessage(
          payload.result.claimed
            ? `Claimed "${payload.result.prizeTitle}"${payload.result.rewardPoints > 0 ? ` for +${payload.result.rewardPoints} points.` : "."}`
            : "This prize has already been claimed."
        );
        await load();
      } catch (error) {
        setStatusMessage("");
        setErrorMessage(error instanceof Error ? error.message : "Failed to claim this prize.");
      } finally {
        setClaimingId("");
      }
    },
    [claimingId, load, userId]
  );

  if (!venueId) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Join a venue to view weekly prizes and your prize wallet.
      </div>
    );
  }

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading prize wallet...</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Weekly Prize</h2>
        <p className="mt-1 text-xs text-slate-600">
          Compete through the end of the week to win this venue reward.
        </p>
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">{weeklyPrize?.prizeTitle ?? "Weekly Venue Champion Prize"}</p>
          <p className="mt-1 text-xs text-amber-800">
            {weeklyPrize?.prizeDescription ??
              "Top the leaderboard by week end to become this venue's champion and redeem your prize."}
          </p>
          {weeklyPrize && weeklyPrize.rewardPoints > 0 ? (
            <p className="mt-2 text-xs font-semibold text-amber-900">Bonus reward: +{weeklyPrize.rewardPoints} points</p>
          ) : null}
          {weekStart ? <p className="mt-2 text-[11px] text-amber-700">Week of {formatLocalDate(weekStart)}</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Prize Wallet</h3>
        <p className="mt-1 text-sm text-slate-700">
          Awarded: <span className="font-semibold">{awardedWins.length}</span> · Claimed:{" "}
          <span className="font-semibold">{claimedWins.length}</span>
        </p>

        {statusMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            {statusMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {errorMessage}
          </p>
        ) : null}

        {wins.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No prize records yet. Win the weekly challenge to earn your first prize.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {wins.map((win) => (
              <li key={win.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{win.prizeTitle}</p>
                    {win.prizeDescription ? (
                      <p className="mt-1 text-xs text-slate-700">{win.prizeDescription}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">Awarded {formatLocalDate(win.awardedAt)}</p>
                    {win.rewardPoints > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-slate-800">Reward points: +{win.rewardPoints}</p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      win.status === "claimed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {win.status === "claimed" ? "Claimed" : "Awarded"}
                  </span>
                </div>

                {win.status === "awarded" ? (
                  <button
                    type="button"
                    disabled={claimingId === win.id}
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      void claimPrize(win, rect);
                    }}
                    className="tp-clean-button mt-2 rounded-lg border border-indigo-500 bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-900 disabled:opacity-60"
                  >
                    {claimingId === win.id ? "Claiming..." : "Claim Prize"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
