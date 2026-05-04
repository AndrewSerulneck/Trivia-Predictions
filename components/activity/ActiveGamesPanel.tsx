"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getUserId } from "@/lib/storage";

type BingoCard = {
  id: string;
  gameLabel: string;
  sportKey: string;
  startsAt: string;
  createdAt?: string;
  settledAt?: string;
  rewardPoints?: number;
  rewardClaimedAt?: string;
  status: "active" | "won" | "lost" | "canceled";
};

type PickEmPick = {
  id: string;
  sportSlug: string;
  league: string;
  gameLabel: string;
  selectedTeam: string;
  startsAt: string;
  status: "pending" | "won" | "lost" | "push" | "canceled";
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  rewardPoints?: number;
  rewardClaimedAt?: string | null;
};

type PredictionPick = {
  id: string;
  marketQuestion?: string | null;
  marketClosesAt?: string | null;
  outcomeTitle: string;
  points: number;
  status: "pending" | "won" | "lost" | "push" | "canceled";
  createdAt: string;
  resolvedAt?: string;
};

type BingoPayload = {
  ok: boolean;
  cards?: BingoCard[];
  error?: string;
};

type PickEmPayload = {
  ok: boolean;
  picks?: PickEmPick[];
  error?: string;
};

type PredictionPayload = {
  ok: boolean;
  items?: PredictionPick[];
  error?: string;
};

type ChallengesPayload = {
  ok: boolean;
  challenges?: Array<{
    id: string;
    senderUserId: string;
    receiverUserId: string;
    status: "pending" | "accepted" | "declined" | "canceled" | "expired" | "completed";
  }>;
  error?: string;
};

function formatLocalDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getCurrentWeekWindowLocal(): { startMs: number; endMs: number } {
  const now = new Date();
  const day = now.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysSinceMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function isInCurrentWeek(iso: string | undefined | null): boolean {
  if (!iso) {
    return false;
  }
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  const { startMs, endMs } = getCurrentWeekWindowLocal();
  return timestamp >= startMs && timestamp < endMs;
}

function formatStatus(status: string): string {
  if (status === "won") return "Won";
  if (status === "lost") return "Lost";
  if (status === "push") return "Push";
  if (status === "canceled") return "Canceled";
  if (status === "pending") return "Pending";
  return status;
}

export function ActiveGamesPanel() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [claimingBingoRewards, setClaimingBingoRewards] = useState(false);
  const [claimingPickEmRewards, setClaimingPickEmRewards] = useState(false);
  const [bingoCards, setBingoCards] = useState<BingoCard[]>([]);
  const [pickEmPicks, setPickEmPicks] = useState<PickEmPick[]>([]);
  const [predictionPicks, setPredictionPicks] = useState<PredictionPick[]>([]);
  const [pendingChallengesReceived, setPendingChallengesReceived] = useState(0);
  const [pendingChallengesSent, setPendingChallengesSent] = useState(0);

  useEffect(() => {
    setUserId(getUserId() ?? "");
  }, []);

  const load = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!userId) {
        setLoading(false);
        setBingoCards([]);
        setPickEmPicks([]);
        setPredictionPicks([]);
        return;
      }

      if (!background) {
        setLoading(true);
      }
      setErrorMessage("");

      try {
        const [bingoResponse, pickEmResponse, predictionResponse, challengesResponse] = await Promise.all([
          fetch(`/api/bingo/cards?userId=${encodeURIComponent(userId)}&includeSettled=true`, { cache: "no-store" }),
          fetch(`/api/pickem/picks?userId=${encodeURIComponent(userId)}&includeSettled=true&limit=200`, {
            cache: "no-store",
          }),
          fetch(
            `/api/picks?userId=${encodeURIComponent(userId)}&status=all&includeMarkets=true&page=1&pageSize=100`,
            {
              cache: "no-store",
            }
          ),
          fetch(`/api/challenges?userId=${encodeURIComponent(userId)}&includeResolved=true`, {
            cache: "no-store",
          }),
        ]);

        const [bingoPayload, pickEmPayload, predictionPayload, challengesPayload] = (await Promise.all([
          bingoResponse.json(),
          pickEmResponse.json(),
          predictionResponse.json(),
          challengesResponse.json(),
        ])) as [BingoPayload, PickEmPayload, PredictionPayload, ChallengesPayload];

        if (!bingoPayload.ok) {
          throw new Error(bingoPayload.error ?? "Failed to load Sports Bingo boards.");
        }
        if (!pickEmPayload.ok) {
          throw new Error(pickEmPayload.error ?? "Failed to load Pick 'Em picks.");
        }
        if (!predictionPayload.ok) {
          throw new Error(predictionPayload.error ?? "Failed to load prediction picks.");
        }
        if (!challengesPayload.ok) {
          throw new Error(challengesPayload.error ?? "Failed to load challenge summary.");
        }

        setBingoCards(bingoPayload.cards ?? []);
        setPickEmPicks(pickEmPayload.picks ?? []);
        setPredictionPicks(predictionPayload.items ?? []);
        const allChallenges = challengesPayload.challenges ?? [];
        setPendingChallengesReceived(
          allChallenges.filter((challenge) => challenge.status === "pending" && challenge.receiverUserId === userId).length
        );
        setPendingChallengesSent(
          allChallenges.filter((challenge) => challenge.status === "pending" && challenge.senderUserId === userId).length
        );
      } catch (error) {
        if (!background) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load active games.");
        }
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [userId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const interval = window.setInterval(() => {
      void load({ background: true });
    }, 20000);

    return () => {
      window.clearInterval(interval);
    };
  }, [load, userId]);

  const totalActiveGames = useMemo(
    () =>
      bingoCards.filter((card) => card.status === "active").length +
      pickEmPicks.filter((pick) => pick.status === "pending").length +
      predictionPicks.filter((pick) => pick.status === "pending").length,
    [bingoCards, pickEmPicks, predictionPicks]
  );
  const activeBingoCards = useMemo(
    () => bingoCards.filter((card) => card.status === "active"),
    [bingoCards]
  );
  const activePickEmPicks = useMemo(
    () => pickEmPicks.filter((pick) => pick.status === "pending"),
    [pickEmPicks]
  );
  const activePredictionPicks = useMemo(
    () => predictionPicks.filter((pick) => pick.status === "pending"),
    [predictionPicks]
  );

  const completedBingoCardsThisWeek = useMemo(
    () =>
      bingoCards.filter(
        (card) =>
          card.status !== "active" && isInCurrentWeek(card.settledAt ?? card.startsAt ?? card.createdAt)
      ),
    [bingoCards]
  );
  const completedPickEmPicksThisWeek = useMemo(
    () =>
      pickEmPicks.filter(
        (pick) =>
          pick.status !== "pending" && isInCurrentWeek(pick.resolvedAt ?? pick.updatedAt ?? pick.startsAt ?? pick.createdAt)
      ),
    [pickEmPicks]
  );
  const completedPredictionPicksThisWeek = useMemo(
    () =>
      predictionPicks.filter(
        (pick) => pick.status !== "pending" && isInCurrentWeek(pick.resolvedAt ?? pick.marketClosesAt ?? pick.createdAt)
      ),
    [predictionPicks]
  );
  const totalCompletedThisWeek = useMemo(
    () =>
      completedBingoCardsThisWeek.length +
      completedPickEmPicksThisWeek.length +
      completedPredictionPicksThisWeek.length,
    [completedBingoCardsThisWeek.length, completedPickEmPicksThisWeek.length, completedPredictionPicksThisWeek.length]
  );
  const totalWinsThisWeek = useMemo(
    () =>
      completedBingoCardsThisWeek.filter((card) => card.status === "won").length +
      completedPickEmPicksThisWeek.filter((pick) => pick.status === "won").length +
      completedPredictionPicksThisWeek.filter((pick) => pick.status === "won").length,
    [completedBingoCardsThisWeek, completedPickEmPicksThisWeek, completedPredictionPicksThisWeek]
  );
  const unclaimedBingoCards = useMemo(
    () => bingoCards.filter((card) => card.status === "won" && !card.rewardClaimedAt),
    [bingoCards]
  );
  const unclaimedPickEmRewards = useMemo(
    () => pickEmPicks.filter((pick) => pick.status === "won" && !pick.rewardClaimedAt),
    [pickEmPicks]
  );
  const unclaimedBingoPoints = useMemo(
    () => unclaimedBingoCards.reduce((sum, card) => sum + Math.max(0, Number(card.rewardPoints ?? 0)), 0),
    [unclaimedBingoCards]
  );
  const unclaimedPickEmPoints = useMemo(
    () => unclaimedPickEmRewards.reduce((sum, pick) => sum + Math.max(0, Number(pick.rewardPoints ?? 10)), 0),
    [unclaimedPickEmRewards]
  );

  const triggerCoinAndPointsUpdate = useCallback((totalPoints: number, sourceRect: DOMRect) => {
    if (totalPoints <= 0) {
      return;
    }
    window.dispatchEvent(
      new CustomEvent("tp:coin-flight", {
        detail: {
          sourceRect: {
            left: sourceRect.left,
            top: sourceRect.top,
            width: sourceRect.width,
            height: sourceRect.height,
          },
          delta: totalPoints,
          coins: Math.min(36, Math.max(12, Math.round(totalPoints / 2))),
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent("tp:points-updated", {
        detail: {
          source: "active-games-claim",
          delta: totalPoints,
        },
      })
    );
  }, []);

  const claimAllBingoRewards = useCallback(
    async (sourceRect: DOMRect) => {
      if (!userId || claimingBingoRewards || unclaimedBingoCards.length === 0) {
        return;
      }
      setStatusMessage("");
      setClaimingBingoRewards(true);
      try {
        const settled = await Promise.allSettled(
          unclaimedBingoCards.map(async (card) => {
            const response = await fetch("/api/bingo/cards", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "claim",
                userId,
                cardId: card.id,
              }),
            });
            const payload = (await response.json()) as {
              ok: boolean;
              result?: { rewardPoints: number };
              error?: string;
            };
            if (!payload.ok || !payload.result) {
              throw new Error(payload.error ?? "Failed to claim Bingo reward.");
            }
            return Math.max(0, Number(payload.result.rewardPoints ?? 0));
          })
        );

        let claimedCount = 0;
        let totalPoints = 0;
        let failedCount = 0;
        for (const result of settled) {
          if (result.status === "fulfilled") {
            claimedCount += 1;
            totalPoints += result.value;
          } else {
            failedCount += 1;
          }
        }

        if (totalPoints > 0) {
          triggerCoinAndPointsUpdate(totalPoints, sourceRect);
        }
        if (claimedCount > 0) {
          setStatusMessage(
            failedCount > 0
              ? `Claimed ${claimedCount} Bingo reward${claimedCount === 1 ? "" : "s"} for +${totalPoints} points (${failedCount} still pending).`
              : `Claimed ${claimedCount} Bingo reward${claimedCount === 1 ? "" : "s"} for +${totalPoints} points.`
          );
        } else if (failedCount > 0) {
          setStatusMessage("No Bingo rewards were claimed. Please try again.");
        }
        await load({ background: true });
      } finally {
        setClaimingBingoRewards(false);
      }
    },
    [claimingBingoRewards, load, triggerCoinAndPointsUpdate, unclaimedBingoCards, userId]
  );

  const claimAllPickEmRewards = useCallback(
    async (sourceRect: DOMRect) => {
      if (!userId || claimingPickEmRewards || unclaimedPickEmRewards.length === 0) {
        return;
      }
      setStatusMessage("");
      setClaimingPickEmRewards(true);
      try {
        const settled = await Promise.allSettled(
          unclaimedPickEmRewards.map(async (pick) => {
            const response = await fetch("/api/pickem/picks", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: "claim",
                userId,
                pickId: pick.id,
              }),
            });
            const payload = (await response.json()) as {
              ok: boolean;
              result?: { claimed: boolean; pointsAwarded: number };
              error?: string;
            };
            if (!payload.ok || !payload.result) {
              throw new Error(payload.error ?? "Failed to claim Pick 'Em reward.");
            }
            if (!payload.result.claimed) {
              return 0;
            }
            return Math.max(0, Number(payload.result.pointsAwarded ?? 0));
          })
        );

        let claimedCount = 0;
        let totalPoints = 0;
        let failedCount = 0;
        for (const result of settled) {
          if (result.status === "fulfilled") {
            if (result.value > 0) {
              claimedCount += 1;
            }
            totalPoints += result.value;
          } else {
            failedCount += 1;
          }
        }

        if (totalPoints > 0) {
          triggerCoinAndPointsUpdate(totalPoints, sourceRect);
        }
        if (claimedCount > 0) {
          setStatusMessage(
            failedCount > 0
              ? `Claimed ${claimedCount} Pick 'Em reward${claimedCount === 1 ? "" : "s"} for +${totalPoints} points (${failedCount} still pending).`
              : `Claimed ${claimedCount} Pick 'Em reward${claimedCount === 1 ? "" : "s"} for +${totalPoints} points.`
          );
        } else if (failedCount > 0) {
          setStatusMessage("No Pick 'Em rewards were claimed. Please try again.");
        } else {
          setStatusMessage("Pick 'Em rewards were already claimed.");
        }
        await load({ background: true });
      } finally {
        setClaimingPickEmRewards(false);
      }
    },
    [claimingPickEmRewards, load, triggerCoinAndPointsUpdate, unclaimedPickEmRewards, userId]
  );

  if (!userId) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Join a venue to view your active games.
      </div>
    );
  }

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading active games...</div>;
  }

  if (errorMessage) {
    return <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Active and Completed Games</h2>
        <p className="mt-1 text-sm text-slate-700">
          You currently have <span className="font-semibold">{totalActiveGames}</span> active game
          {totalActiveGames === 1 ? "" : "s"}.
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Completed this week: <span className="font-semibold">{totalCompletedThisWeek}</span>.
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Games won this week: <span className="font-semibold">{totalWinsThisWeek}</span>.
        </p>
        <p className="mt-1 text-sm text-slate-700">
          Pending challenges:{" "}
          <span className="font-semibold">{pendingChallengesReceived}</span> received ·{" "}
          <span className="font-semibold">{pendingChallengesSent}</span> sent.
        </p>
        {statusMessage ? (
          <p className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
            {statusMessage}
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Sports Bingo Boards ({activeBingoCards.length})</h3>
          <div className="flex items-center gap-2">
            {unclaimedBingoCards.length > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  void claimAllBingoRewards(rect);
                }}
                disabled={claimingBingoRewards}
                className="tp-clean-button rounded-lg border border-emerald-500 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-60"
              >
                {claimingBingoRewards
                  ? "Claiming..."
                  : `Claim Points! (+${unclaimedBingoPoints.toLocaleString()})`}
              </button>
            ) : null}
            <Link href="/bingo" className="text-xs font-semibold text-blue-700 underline">
              Open Bingo
            </Link>
          </div>
        </div>

        {activeBingoCards.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No active Sports Bingo boards.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activeBingoCards.map((card) => (
              <li key={card.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{card.gameLabel}</p>
                <p className="mt-1 text-xs text-slate-600">Starts {formatLocalDateTime(card.startsAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Pick &apos;Em Picks ({activePickEmPicks.length})</h3>
          <div className="flex items-center gap-2">
            {unclaimedPickEmRewards.length > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  void claimAllPickEmRewards(rect);
                }}
                disabled={claimingPickEmRewards}
                className="tp-clean-button rounded-lg border border-emerald-500 bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900 disabled:opacity-60"
              >
                {claimingPickEmRewards
                  ? "Claiming..."
                  : `Claim Points! (+${unclaimedPickEmPoints.toLocaleString()})`}
              </button>
            ) : null}
            <Link href="/pickem" className="text-xs font-semibold text-blue-700 underline">
              Open Pick &apos;Em
            </Link>
          </div>
        </div>

        {activePickEmPicks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No active Pick &apos;Em selections.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activePickEmPicks.map((pick) => (
              <li key={pick.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{pick.gameLabel}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Picked: <span className="font-semibold">{pick.selectedTeam}</span>
                </p>
                <p className="text-xs text-slate-600">Starts {formatLocalDateTime(pick.startsAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Sports Predictions ({activePredictionPicks.length})</h3>
          <Link href="/predictions" className="text-xs font-semibold text-blue-700 underline">
            Open Predictions
          </Link>
        </div>

        {activePredictionPicks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No pending prediction picks.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activePredictionPicks.map((pick) => (
              <li key={pick.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{pick.marketQuestion ?? "Prediction Market"}</p>
                <p className="mt-1 text-xs text-slate-600">Selected: {pick.outcomeTitle}</p>
                <p className="text-xs text-slate-600">{pick.points} points at stake</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Completed This Week ({totalCompletedThisWeek})</h3>

        {totalCompletedThisWeek === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No completed games from this week yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-800">Sports Bingo ({completedBingoCardsThisWeek.length})</h4>
              {completedBingoCardsThisWeek.length === 0 ? (
                <p className="mt-1 text-xs text-slate-600">No completed Sports Bingo boards this week.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {completedBingoCardsThisWeek.map((card) => (
                    <li key={`completed-bingo-${card.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{card.gameLabel}</p>
                      <p className="mt-1 text-xs text-slate-600">Result: {formatStatus(card.status)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800">Pick &apos;Em ({completedPickEmPicksThisWeek.length})</h4>
              {completedPickEmPicksThisWeek.length === 0 ? (
                <p className="mt-1 text-xs text-slate-600">No completed Pick &apos;Em picks this week.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {completedPickEmPicksThisWeek.map((pick) => (
                    <li key={`completed-pickem-${pick.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{pick.gameLabel}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Picked: <span className="font-semibold">{pick.selectedTeam}</span> · Result: {formatStatus(pick.status)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-800">Sports Predictions ({completedPredictionPicksThisWeek.length})</h4>
              {completedPredictionPicksThisWeek.length === 0 ? (
                <p className="mt-1 text-xs text-slate-600">No completed prediction picks this week.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {completedPredictionPicksThisWeek.map((pick) => (
                    <li key={`completed-prediction-${pick.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{pick.marketQuestion ?? "Prediction Market"}</p>
                      <p className="mt-1 text-xs text-slate-600">Selected: {pick.outcomeTitle}</p>
                      <p className="text-xs text-slate-600">Result: {formatStatus(pick.status)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
