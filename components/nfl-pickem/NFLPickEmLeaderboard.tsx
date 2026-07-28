"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Trophy } from "lucide-react";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { NFL_REWARD_MIN_PICKERS } from "@/lib/nflPickEmRewardWeeks";
import { describeRewardPrize } from "@/lib/rewardDefinitions";
import type { RewardDiscountKind, RewardMenuItem, RewardPrizeKind } from "@/types";

type LeaderboardMode = "week" | "season";

type LeaderboardPick = {
  gameId: string;
  gameLabel: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isHidden: boolean;
  selectedTeam?: string;
  status: "pending" | "won" | "lost" | "push" | "canceled";
  winnerTeam: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

type LeaderboardTiebreaker = {
  isHidden: boolean;
  predictedTotal?: number;
  actualTotal: number | null;
};

type LeaderboardEntry = {
  userId: string;
  username: string;
  picksCount: number;
  correctPicks: number;
  incorrectPicks: number;
  totalPoints: number;
  rank: number;
  isCurrentUser: boolean;
  picks: LeaderboardPick[];
  // Absent when the entry's user never made a tiebreaker guess this week.
  tiebreaker?: LeaderboardTiebreaker;
  isTiebreakerWinner?: boolean;
};

type RewardWinner = {
  campaignId: string;
  campaignName: string;
  winnerUserId: string;
  winnerUsername: string | null;
  prizeKind?: RewardPrizeKind | null;
  prizeMenuItem?: RewardMenuItem | null;
  prizeMenuItemName?: string | null;
  prizeDiscountKind?: RewardDiscountKind | null;
  prizeDiscountValue?: number | null;
  prizeGiftCertificateAmount?: number | null;
};

const outcomeLabel = (status: LeaderboardPick["status"]): string => {
  if (status === "won") return "Correct";
  if (status === "lost") return "Wrong";
  if (status === "push") return "Push";
  if (status === "canceled") return "Canceled";
  return "Pending";
};

const outcomeColor = (status: LeaderboardPick["status"]): string => {
  if (status === "won") return "text-emerald-400";
  if (status === "lost") return "text-rose-400";
  return "text-slate-400";
};

function LeaderboardRow({ entry, winner }: { entry: LeaderboardEntry; winner?: RewardWinner }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const prize = winner ? describeRewardPrize(winner) : "";

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        entry.isCurrentUser ? "border-[#fde68a]/60 bg-[#fde68a]/10" : "border-[#fde68a]/20 bg-slate-900"
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        aria-expanded={isExpanded}
        className="tp-clean-button flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#fde68a]/40 text-[11px] font-black text-[#fde68a]">
          {entry.rank}
        </span>
        {winner && (
          <span title={prize ? `Won this week's reward: ${prize}` : "Won this week's reward"} className="shrink-0">
            <Trophy
              aria-label={prize ? `Won this week's reward: ${prize}` : "Won this week's reward"}
              className="h-3.5 w-3.5 text-[#fde68a]"
            />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-black text-white">
          {entry.username}
          {entry.isCurrentUser && (
            <span className="ml-1.5 rounded-full bg-[#fde68a]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#fde68a]">
              You
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[11px] font-black tabular-nums">
          <span className="text-slate-400" title="Picks">
            {entry.picksCount}
          </span>
          <span className="text-emerald-400" title="Correct">
            {entry.correctPicks}
          </span>
          <span className="text-rose-400" title="Wrong">
            {entry.incorrectPicks}
          </span>
          <span className="text-[#fde68a]" title="Points">
            {entry.totalPoints}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[#fde68a]/15"
          >
            <div className="space-y-1.5 px-3 py-2.5">
              {winner && (
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#fde68a]">
                  <Trophy aria-hidden="true" className="h-3 w-3 shrink-0" />
                  Won this week&apos;s reward{prize ? `: ${prize}` : ""}
                </p>
              )}
              {entry.tiebreaker && (
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                  Tiebreaker:{" "}
                  {entry.tiebreaker.isHidden
                    ? "Hidden until kickoff"
                    : entry.tiebreaker.predictedTotal ?? "—"}
                  {entry.isTiebreakerWinner && (
                    <span className="rounded-full bg-[#fde68a]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#fde68a]">
                      Closest guess
                    </span>
                  )}
                </p>
              )}
              {entry.picks.length === 0 ? (
                <p className="text-[11px] text-slate-500">No picks.</p>
              ) : (
                entry.picks.map((pick) => {
                  const hidden = pick.isHidden || !pick.selectedTeam;
                  const hasScore = pick.homeScore !== null && pick.awayScore !== null;
                  return (
                    <div
                      key={pick.gameId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-200">{pick.gameLabel}</p>
                        {hidden ? (
                          <p className="text-slate-500">Hidden until kickoff</p>
                        ) : (
                          <p className={outcomeColor(pick.status)}>
                            Picked {pick.selectedTeam} · {outcomeLabel(pick.status)}
                          </p>
                        )}
                      </div>
                      {!hidden && hasScore && (
                        <span className="shrink-0 font-black tabular-nums text-slate-300">
                          {pick.awayScore}–{pick.homeScore}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NFLPickEmLeaderboard({
  venueId,
  userId,
  weekId,
  season,
  currentWeekId,
  refreshKey,
}: {
  venueId: string;
  userId: string;
  weekId: string;
  season: number | null;
  /** The API's live "current" NFL week — lets a past, decided week be told apart
   *  from the one still in progress so the "no reward" note is never shown early. */
  currentWeekId?: string;
  /** Bumped by the parent after a successful pick so this refetches without depending on picks state. */
  refreshKey: number;
}) {
  const [mode, setMode] = useState<LeaderboardMode>("week");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlightRequest = useRef<AbortController | null>(null);

  // Reward-resolution state (Phase 8) — kept separate from the picks
  // leaderboard fetch above since it hits a different route and must never
  // block or error out the standings themselves.
  const [rewardWinners, setRewardWinners] = useState<RewardWinner[]>([]);
  const [rewardParticipantCount, setRewardParticipantCount] = useState<number | null>(null);
  const [hasActiveGameWinnerReward, setHasActiveGameWinnerReward] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    if (mode === "week" && !weekId) return;
    if (mode === "season" && !season) return;

    inFlightRequest.current?.abort();
    const controller = new AbortController();
    inFlightRequest.current = controller;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({ venueId, mode });
        if (mode === "week") {
          params.set("weekId", weekId);
        } else {
          params.set("season", String(season));
        }
        if (userId) params.set("userId", userId);

        const response = await fetch(`/api/nfl-pickem/leaderboard?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);

        if (!controller.signal.aborted) {
          setEntries(data.entries);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => controller.abort();
  }, [venueId, userId, weekId, season, mode, refreshKey]);

  // Winner marker (Phase 8) — only meaningful for the per-week view; a season
  // contest is decided by its final week, which already surfaces there.
  useEffect(() => {
    if (!venueId || mode !== "week" || !weekId) {
      setRewardWinners([]);
      setRewardParticipantCount(null);
      setHasActiveGameWinnerReward(false);
      return;
    }
    let cancelled = false;

    async function loadRewards() {
      try {
        const params = new URLSearchParams({ venueId, weekId });
        const response = await fetch(`/api/nfl-pickem/rewards?${params.toString()}`);
        const data = await response.json();
        if (cancelled || !data.ok) return;
        setRewardWinners(Array.isArray(data.winners) ? data.winners : []);
        setRewardParticipantCount(typeof data.participantCount === "number" ? data.participantCount : null);
        setHasActiveGameWinnerReward(Boolean(data.hasActiveGameWinnerReward));
      } catch {
        // Non-critical — the standings above already loaded independently.
      }
    }

    loadRewards();
    return () => {
      cancelled = true;
    };
  }, [venueId, weekId, mode, refreshKey]);

  const winnerByUserId = new Map(rewardWinners.map((winner) => [winner.winnerUserId, winner]));
  // Only for a week that has passed — the live current week's low count is
  // already communicated by NFLPickEmRewardBanner's "N of 3 players" state,
  // and isn't yet a decided outcome.
  const showNoRewardNote =
    mode === "week" &&
    hasActiveGameWinnerReward &&
    rewardWinners.length === 0 &&
    rewardParticipantCount !== null &&
    rewardParticipantCount < NFL_REWARD_MIN_PICKERS &&
    Boolean(currentWeekId) &&
    weekId !== currentWeekId;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-black uppercase tracking-[0.16em] text-[#fde68a]">Leaderboard</h2>
        <div className="inline-flex rounded-full border border-[#fde68a]/30 bg-slate-900 p-0.5 text-[11px] font-bold">
          <button
            type="button"
            aria-pressed={mode === "week"}
            onClick={() => setMode("week")}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              mode === "week" ? "bg-[#fde68a] text-[#1a2f72]" : "text-slate-400"
            }`}
          >
            This Week
          </button>
          <button
            type="button"
            aria-pressed={mode === "season"}
            onClick={() => setMode("season")}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              mode === "season" ? "bg-[#fde68a] text-[#1a2f72]" : "text-slate-400"
            }`}
          >
            Season
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-rose-500/45 bg-rose-950/30 px-4 py-3"
          >
            <p className="text-[12px] font-semibold text-rose-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {showNoRewardNote && (
        <p className="px-1 text-[11px] font-semibold text-slate-500">
          No reward this week — fewer than {NFL_REWARD_MIN_PICKERS} players made picks.
        </p>
      )}

      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <BouncingBallLoader size="sm" label="Loading leaderboard..." />
        </div>
      ) : !error && entries.length === 0 ? (
        <p className="px-1 text-[12px] font-semibold text-slate-500">
          {mode === "week" ? "No picks yet this week." : "No picks yet this season."}
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <LeaderboardRow key={entry.userId} entry={entry} winner={winnerByUserId.get(entry.userId)} />
          ))}
        </div>
      )}
    </section>
  );
}
