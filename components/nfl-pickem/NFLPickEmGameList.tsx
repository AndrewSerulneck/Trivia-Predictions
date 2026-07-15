"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GameAppBar } from "@/components/venue/AppBar";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { getUserId, getVenueId } from "@/lib/storage";
import { WeekSelector } from "./WeekSelector";
import { LockCountdown } from "./LockCountdown";
import { NFLGameCard, type NFLGame } from "./NFLGameCard";
import { WeeklySummary } from "./WeeklySummary";

// Types matching API
type NFLWeekOption = {
  id: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
};

type UserSummary = {
  picksCount: number;
  correctPicks: number;
  incorrectPicks: number;
  totalPoints: number;
  isComplete: boolean;
};

export function NFLPickEmGameList({ 
  initialWeekId 
}: { 
  initialWeekId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Core state
  const [weeks, setWeeks] = useState<NFLWeekOption[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>(initialWeekId || "");
  const [weekData, setWeekData] = useState<{
    week: {
      id: string;
      weekNumber: number;
      thursdayKickoff: string | null;
      status: string;
      isLocked: boolean;
    };
    games: NFLGame[];
    userSummary?: UserSummary;
  } | null>(null);
  
  // UI state
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [loadingGames, setLoadingGames] = useState(false);
  const [error, setError] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [venueId, setVenueId] = useState<string>("");
  
  // Optimistic state
  const [optimisticPicks, setOptimisticPicks] = useState<Record<string, string>>({});
  const [submittingGames, setSubmittingGames] = useState<Record<string, boolean>>({});
  
  // Refs for request deduplication
  const inFlightRequests = useRef<Record<string, AbortController>>({});
  
  // Initialize user data
  useEffect(() => {
    setUserId(getUserId() || "");
    setVenueId(getVenueId() || "");
  }, []);
  
  // Load weeks list
  useEffect(() => {
    async function loadWeeks() {
      try {
        const response = await fetch("/api/nfl-pickem/weeks?includeComplete=true");
        const data = await response.json();
        
        if (!data.ok) throw new Error(data.error);
        
        setWeeks(data.weeks);
        
        // Select initial week
        if (!selectedWeekId && data.weeks.length > 0) {
          const target = data.weeks.find((w: NFLWeekOption) => w.isCurrent) 
            || data.weeks.find((w: NFLWeekOption) => !w.isLocked)
            || data.weeks[data.weeks.length - 1];
          setSelectedWeekId(target.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load weeks");
      } finally {
        setLoadingWeeks(false);
      }
    }
    
    loadWeeks();
  }, [selectedWeekId]);
  
  // Load games when week changes
  useEffect(() => {
    if (!selectedWeekId) return;
    
    // Cancel any in-flight requests
    Object.values(inFlightRequests.current).forEach(ctrl => ctrl.abort());
    inFlightRequests.current = {};
    
    async function loadGames() {
      setLoadingGames(true);
      setError("");
      
      const controller = new AbortController();
      inFlightRequests.current[selectedWeekId] = controller;
      
      try {
        const params = new URLSearchParams({ weekId: selectedWeekId });
        if (userId) params.set("userId", userId);
        if (venueId) params.set("venueId", venueId);
        
        const response = await fetch(`/api/nfl-pickem/games?${params}`, {
          signal: controller.signal,
        });
        
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);
        
        // Only update if this request wasn't cancelled
        if (!controller.signal.aborted) {
          setWeekData({
            week: data.week,
            games: data.games,
            userSummary: data.userSummary,
          });
          
          // Clear optimistic picks for this week
          setOptimisticPicks({});
          
          // Update URL
          const newParams = new URLSearchParams(searchParams);
          newParams.set("week", selectedWeekId);
          router.replace(`/nfl-pickem?${newParams.toString()}`, { scroll: false });
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingGames(false);
        }
        delete inFlightRequests.current[selectedWeekId];
      }
    }
    
    loadGames();
  }, [selectedWeekId, userId, venueId, router, searchParams]);
  
  // Submit pick handler
  const submitPick = useCallback(async (game: NFLGame, team: string) => {
    if (!userId || !venueId) {
      setError("Please join a venue to make picks");
      return;
    }
    
    if (game.isLocked || weekData?.week.isLocked) {
      setError("Picks are locked for this game");
      return;
    }
    
    const currentPick = optimisticPicks[game.id] || game.userPickTeam;
    const isDeselect = currentPick === team;
    
    // Optimistic update
    setOptimisticPicks(prev => {
      const next = { ...prev };
      if (isDeselect) {
        delete next[game.id];
      } else {
        next[game.id] = team;
      }
      return next;
    });
    
    setSubmittingGames(prev => ({ ...prev, [game.id]: true }));
    
    try {
      const response = await fetch("/api/nfl-pickem/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isDeselect ? "clear" : undefined,
          userId,
          venueId,
          weekId: selectedWeekId,
          gameId: game.id,
          pickTeam: isDeselect ? undefined : team,
        }),
      });
      
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      
      // Refresh to get updated summary
      if (weekData) {
        const summaryRes = await fetch(
          `/api/nfl-pickem/games?weekId=${selectedWeekId}&userId=${userId}&venueId=${venueId}`
        );
        const summaryData = await summaryRes.json();
        if (summaryData.ok) {
          setWeekData(prev => prev ? { ...prev, userSummary: summaryData.userSummary } : null);
        }
      }
    } catch (err) {
      // Rollback optimistic update
      setOptimisticPicks(prev => {
        const next = { ...prev };
        if (isDeselect) {
          next[game.id] = currentPick!;
        } else {
          delete next[game.id];
        }
        return next;
      });
      setError(err instanceof Error ? err.message : "Failed to submit pick");
    } finally {
      setSubmittingGames(prev => ({ ...prev, [game.id]: false }));
    }
  }, [userId, venueId, selectedWeekId, weekData, optimisticPicks]);
  
  // Memoized game list with optimistic updates
  const gamesWithOptimistic = useMemo(() => {
    if (!weekData) return [];
    return weekData.games.map(game => ({
      ...game,
      userPickTeam: optimisticPicks[game.id] !== undefined 
        ? optimisticPicks[game.id] 
        : game.userPickTeam,
      isSubmitting: submittingGames[game.id],
    }));
  }, [weekData, optimisticPicks, submittingGames]);
  
  // Group games by day
  const groupedGames = useMemo(() => {
    const groups: Record<string, typeof gamesWithOptimistic> = {
      Thursday: [],
      Sunday: [],
      Monday: [],
      Other: [],
    };
    
    for (const game of gamesWithOptimistic) {
      if (game.isThursdayGame) groups.Thursday.push(game);
      else if (game.isSundayGame) groups.Sunday.push(game);
      else if (game.isMondayGame) groups.Monday.push(game);
      else groups.Other.push(game);
    }
    
    return groups;
  }, [gamesWithOptimistic]);
  
  // Render
  return (
    <div className="min-h-[100dvh] touch-pan-y bg-slate-950 pb-[max(env(safe-area-inset-bottom),24px)]">
      <GameAppBar game="nfl-pickem" />
      
      <div className="space-y-4 px-3 pt-3">
        {/* Header */}
        <section className="rounded-2xl border border-[#fde68a]/30 bg-slate-900 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏈</span>
            <h1 
              className="text-[22px] leading-none text-[#fde68a]"
              style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
            >
              NFL Pick 'Em
            </h1>
          </div>
          <p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-400">
            Pick winners for all NFL games each week. Picks lock at Thursday Night Football kickoff!
          </p>
        </section>
        
        {/* Week Selector */}
        {loadingWeeks ? (
          <div className="flex items-center justify-center py-8">
            <BouncingBallLoader size="sm" label="Loading weeks..." />
          </div>
        ) : weeks.length > 0 ? (
          <WeekSelector
            weeks={weeks}
            selectedWeekId={selectedWeekId}
            onSelect={setSelectedWeekId}
          />
        ) : (
          <section className="rounded-2xl border border-amber-300/30 bg-amber-950/20 px-4 py-5 text-center">
            <h2 className="text-[15px] font-black text-amber-100">NFL weeks are not loaded yet</h2>
            <p className="mt-2 text-[12px] font-semibold leading-relaxed text-amber-100/70">
              The schedule needs to be synced before Pick 'Em can open games for this season.
            </p>
          </section>
        )}
        
        {/* Lock Countdown */}
        {weekData?.week.thursdayKickoff && !weekData.week.isLocked && (
          <LockCountdown lockTime={weekData.week.thursdayKickoff} />
        )}
        
        {/* Lock notice */}
        {weekData?.week.isLocked && (
          <div className="rounded-lg border border-rose-500/45 bg-rose-950/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔒</span>
              <span className="text-[13px] font-black text-rose-400">
                PICKS ARE LOCKED
              </span>
            </div>
            <p className="mt-1 text-[11px] text-rose-300">
              Thursday Night Football has kicked off. You can still view this week's games and results.
            </p>
          </div>
        )}
        
        {/* Weekly Summary */}
        {weekData?.userSummary && (
          <WeeklySummary 
            summary={weekData.userSummary}
            weekNumber={weekData.week.weekNumber}
            isComplete={weekData.userSummary.isComplete}
          />
        )}
        
        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-rose-500/45 bg-rose-950/30 px-4 py-3"
            >
              <p className="text-[12px] font-semibold text-rose-300">{error}</p>
              <button
                onClick={() => setError("")}
                className="mt-1 text-[11px] text-rose-400 underline"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Games Loading */}
        {loadingGames && !weekData && (
          <div className="flex items-center justify-center py-12">
            <BouncingBallLoader size="md" label="Loading games..." />
          </div>
        )}
        
        {/* Games List */}
        {weekData && (
          <div className="space-y-4">
            {groupedGames.Thursday.length > 0 && (
              <section>
                <h2 className="mb-2 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
                  <span>🏈</span> Thursday Night Football
                </h2>
                <div className="space-y-2.5">
                  {groupedGames.Thursday.map(game => (
                    <NFLGameCard
                      key={game.id}
                      game={game}
                      onPick={submitPick}
                      isLocked={weekData.week.isLocked || game.isLocked}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {groupedGames.Sunday.length > 0 && (
              <section>
                <h2 className="mb-2 text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Sunday Games
                </h2>
                <div className="space-y-2.5">
                  {groupedGames.Sunday.map(game => (
                    <NFLGameCard
                      key={game.id}
                      game={game}
                      onPick={submitPick}
                      isLocked={weekData.week.isLocked || game.isLocked}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {groupedGames.Monday.length > 0 && (
              <section>
                <h2 className="mb-2 text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Monday Night Football
                </h2>
                <div className="space-y-2.5">
                  {groupedGames.Monday.map(game => (
                    <NFLGameCard
                      key={game.id}
                      game={game}
                      onPick={submitPick}
                      isLocked={weekData.week.isLocked || game.isLocked}
                    />
                  ))}
                </div>
              </section>
            )}

            {groupedGames.Other.length > 0 && (
              <section>
                <h2 className="mb-2 text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Other Games
                </h2>
                <div className="space-y-2.5">
                  {groupedGames.Other.map(game => (
                    <NFLGameCard
                      key={game.id}
                      game={game}
                      onPick={submitPick}
                      isLocked={weekData.week.isLocked || game.isLocked}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
