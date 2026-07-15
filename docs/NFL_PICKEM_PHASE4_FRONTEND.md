# Phase 4: Frontend Components

## 4.1 Existing UI Patterns

### Pattern Analysis from PickEmGameList.tsx

**File**: [`components/pickem/PickEmGameList.tsx`](components/pickem/PickEmGameList.tsx:1)

Key patterns to replicate:

```typescript
// Lines 201-220: Component props and state initialization
export function PickEmGameList({ 
  initialSportSlug = "", 
  initialDate = "", 
  onBack 
}: { 
  initialSportSlug?: string; 
  initialDate?: string; 
  onBack?: () => void;
}) {
  const normalizedInitialSportSlug = String(initialSportSlug ?? "").trim().toLowerCase();
  const todayDateKey = getLocalDateKey();
  const router = useRouter();
  // ... state declarations
}
```

**Code Review**: Uses controlled inputs with URL params. We'll use the same pattern with weekId.

```typescript
// Lines 668-759: Optimistic pick submission
const submitPick = useCallback(async (game: PickEmGame, pickTeam: string) => {
  const displayedPickTeam = optimisticPickByGame[game.id] ?? game.userPickTeam;
  const isDeselect = displayedPickTeam === pickTeam;
  
  // Optimistic UI update
  setOptimisticPickByGame((current) => {
    const next = { ...current };
    if (isDeselect) {
      delete next[game.id];
    } else {
      next[game.id] = pickTeam;
    }
    return next;
  });
  
  // API call
  if (isDeselect) {
    await clearPickRequest(game.id);
  } else {
    await flushGamePick(game.id, pickTeam);
  }
}, [/* deps */]);
```

**Code Review**: Excellent optimistic update pattern with error rollback. We'll use identical pattern.

```typescript
// Lines 1197-1344: Game card rendering with Tailwind
<li className="overflow-hidden rounded-xl border border-[#fde68a]/45 
  bg-[linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]">
  {/* Header */}
  <div className="flex items-center justify-between border-b border-dashed 
    border-[#fde68a]/45 px-4 py-2">
    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
      {league}
    </span>
  </div>
  {/* Team buttons */}
</li>
```

**Code Review**: Consistent gradient styling, gold accent colors (#fde68a), compact typography.

### Styling System

From the existing codebase:
- **Primary accent**: `#fde68a` (gold)
- **Background**: `#020617` (slate-950)
- **Gradient**: `#1a2f72` → `#6b1a4e`
- **Font**: Bree Serif for headings, system for body
- **Border radius**: `rounded-xl` (0.75rem)
- **Spacing**: Tailwind standard (px-4, py-2, etc.)

## 4.2 Component Architecture

### Component Hierarchy

```
NFLPickEmGameList (main container)
├── GameAppBar (existing component)
├── WeekSelector (week navigation)
├── LockCountdown (deadline display)
├── WeeklySummary (stats card)
├── ErrorDisplay (error messages)
└── GameList
    └── NFLGameCard[] (individual games)
        ├── ThursdayBadge (conditional)
        ├── TeamButton (home)
        └── TeamButton (away)
```

## 4.3 Component Implementation

### Main Component: NFLPickEmGameList.tsx

```typescript
// components/nfl-pickem/NFLPickEmGameList.tsx
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GameAppBar } from "@/components/venue/AppBar";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { getUserId, getVenueId } from "@/lib/storage";
import { WeekSelector } from "./WeekSelector";
import { LockCountdown } from "./LockCountdown";
import { NFLGameCard } from "./NFLGameCard";
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

type NFLGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  userPickTeam?: string;
  userPickStatus?: "pending" | "won" | "lost" | "push";
  isThursdayGame: boolean;
  isSundayGame: boolean;
  isMondayGame: boolean;
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
        ) : null}
        
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
          </div>
        )}
      </div>
    </div>
  );
}
```

### Week Selector Component

```typescript
// components/nfl-pickem/WeekSelector.tsx
"use client";

import { motion } from "framer-motion";

type WeekOption = {
  id: string;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
};

export function WeekSelector({
  weeks,
  selectedWeekId,
  onSelect,
}: {
  weeks: WeekOption[];
  selectedWeekId: string;
  onSelect: (weekId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#fde68a]/30 bg-slate-900 p-3">
      <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
        Select Week
      </h3>
      
      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(253,230,138,0.3)_transparent]">
        {weeks.map((week) => (
          <motion.button
            key={week.id}
            type="button"
            onClick={() => onSelect(week.id)}
            className={`shrink-0 rounded-lg border px-3 py-2.5 text-left transition-all ${
              selectedWeekId === week.id
                ? "border-[#fde68a] bg-[#fde68a]/20 shadow-lg shadow-[#fde68a]/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
            whileTap={{ scale: 0.95 }}
            whileHover={{ y: -2 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-black text-white">
                Week {week.weekNumber}
              </span>
              {week.isCurrent && (
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                  NOW
                </span>
              )}
            </div>
            
            <div className="mt-1 text-[10px] text-slate-400">
              {new Date(week.weekStartDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              -{" "}
              {new Date(week.weekEndDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </div>
            
            <div className="mt-2 flex items-center gap-2">
              {week.isLocked ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400">
                  <span>🔒</span> Locked
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                  <span>✓</span> Open
                </span>
              )}
              <span className="text-[9px] text-slate-500">
                {week.gamesCount} games
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
```

### Lock Countdown Component

```typescript
// components/nfl-pickem/LockCountdown.tsx
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export function LockCountdown({ lockTime }: { lockTime: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);
  
  useEffect(() => {
    const lockDate = new Date(lockTime).getTime();
    
    const updateTimer = () => {
      const now = Date.now();
      const diff = lockDate - now;
      
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft(0);
      } else {
        setTimeLeft(diff);
        setIsExpired(false);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [lockTime]);
  
  if (isExpired) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-lg border border-rose-500/45 bg-rose-950/30 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🔒</span>
          <span className="text-[14px] font-black text-rose-400">
            PICKS ARE NOW LOCKED
          </span>
        </div>
      </motion.div>
    );
  }
  
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  
  const isUrgent = timeLeft < 60 * 60 * 1000; // Less than 1 hour
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border px-4 py-3 ${
        isUrgent 
          ? "border-rose-400/45 bg-rose-950/30" 
          : "border-amber-400/45 bg-amber-950/30"
      }`}
    >
      <div className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
        isUrgent ? "text-rose-400" : "text-amber-300"
      }`}>
        ⏰ Picks Lock In
      </div>
      
      <div className={`mt-1 font-black tabular-nums ${
        isUrgent ? "text-[22px] text-rose-400" : "text-[20px] text-amber-400"
      }`}>
        {days > 0 && <span>{days}d </span>}
        <span>{String(hours).padStart(2, "0")}</span>
        <span className="animate-pulse">:</span>
        <span>{String(minutes).padStart(2, "0")}</span>
        <span className="animate-pulse">:</span>
        <span>{String(seconds).padStart(2, "0")}</span>
      </div>
      
      <div className={`text-[10px] ${isUrgent ? "text-rose-300" : "text-amber-300/70"}`}>
        {new Date(lockTime).toLocaleString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </motion.div>
  );
}
```

### Game Card Component

```typescript
// components/nfl-pickem/NFLGameCard.tsx
"use client";

import { motion } from "framer-motion";

type NFLGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
  status: "scheduled" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  userPickTeam?: string;
  userPickStatus?: "pending" | "won" | "lost" | "push";
  isThursdayGame: boolean;
  isSubmitting?: boolean;
};

export function NFLGameCard({
  game,
  onPick,
  isLocked,
}: {
  game: NFLGame;
  onPick: (game: NFLGame, team: string) => void;
  isLocked: boolean;
}) {
  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
    });
  };
  
  const awaySelected = game.userPickTeam === game.awayTeam;
  const homeSelected = game.userPickTeam === game.homeTeam;
  const isCorrect = game.userPickStatus === "won";
  const isWrong = game.userPickStatus === "lost";
  
  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-[#fde68a]/45 bg-[linear-gradient(115deg,#1a2f72_0%,#1a2f72_46%,#6b1a4e_54%,#6b1a4e_100%)]"
      whileTap={!isLocked ? { scale: 0.99 } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-dashed border-[#fde68a]/45 px-4 py-2">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
          {game.isThursdayGame ? "🏈 Thursday Night" : "NFL"}
        </span>
        <span className={`text-[11px] font-extrabold ${
          game.status === "live" ? "text-emerald-300" : "text-slate-300"
        }`}>
          {game.status === "final" ? "Final" : 
           game.status === "live" ? "● Live" :
           formatTime(game.startsAt)}
        </span>
      </div>
      
      {/* Teams */}
      <div className="flex overflow-hidden bg-[#020617]/45">
        {/* Away Team */}
        <button
          type="button"
          disabled={isLocked || game.isSubmitting}
          onClick={() => onPick(game, game.awayTeam)}
          className={`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-white/5"
          } ${awaySelected ? "bg-[#fde68a]/15" : ""}`}
        >
          {game.isSubmitting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#fde68a] border-t-transparent" />
            </div>
          )}
          
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all ${
            awaySelected
              ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
              : "border border-[#fde68a]/45 text-transparent"
          }`}>
            ✓
          </span>
          
          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
            {game.awayTeam}
          </span>
          
          {game.status === "final" && (
            <span className={`text-[18px] font-black tabular-nums ${
              game.winnerTeam === game.awayTeam ? "text-emerald-300" : "text-slate-400"
            }`}>
              {game.awayScore ?? "–"}
            </span>
          )}
        </button>
        
        <div className="w-px shrink-0 bg-[#fde68a]/20" />
        
        {/* Home Team */}
        <button
          type="button"
          disabled={isLocked || game.isSubmitting}
          onClick={() => onPick(game, game.homeTeam)}
          className={`tp-clean-button relative flex w-1/2 flex-col items-center justify-center gap-1 px-2 py-4 text-center transition-colors ${
            isLocked ? "cursor-not-allowed opacity-50" : "hover:bg-white/5"
          } ${homeSelected ? "bg-[#fde68a]/15" : ""}`}
        >
          {game.isSubmitting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#fde68a] border-t-transparent" />
            </div>
          )}
          
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] font-black transition-all ${
            homeSelected
              ? "rotate-[-7deg] border border-[#fde68a] bg-[#fde68a] text-[#1a2f72]"
              : "border border-[#fde68a]/45 text-transparent"
          }`}>
            ✓
          </span>
          
          <span className="whitespace-normal break-words text-[15px] font-black leading-tight text-white">
            {game.homeTeam}
          </span>
          
          {game.status === "final" && (
            <span className={`text-[18px] font-black tabular-nums ${
              game.winnerTeam === game.homeTeam ? "text-emerald-300" : "text-slate-400"
            }`}>
              {game.homeScore ?? "–"}
            </span>
          )}
        </button>
      </div>
      
      {/* Result Banner */}
      {game.status === "final" && game.userPickTeam && (
        <div className={`px-4 py-1.5 text-[11px] font-extrabold tracking-[0.04em] ${
          isCorrect 
            ? "bg-emerald-500/20 text-emerald-300" 
            : isWrong
            ? "bg-rose-500/20 text-rose-300"
            : "bg-amber-500/20 text-amber-300"
        }`}>
          {isCorrect 
            ? `✓ Correct! +10 points` 
            : isWrong 
            ? "✗ Incorrect"
            : "● Push (Tie)"}
        </div>
      )}
    </motion.div>
  );
}
```

### Weekly Summary Component

```typescript
// components/nfl-pickem/WeeklySummary.tsx
"use client";

import { motion } from "framer-motion";

export function WeeklySummary({
  summary,
  weekNumber,
  isComplete,
}: {
  summary: {
    picksCount: number;
    correctPicks: number;
    incorrectPicks: number;
    totalPoints: number;
  };
  weekNumber: number;
  isComplete: boolean;
}) {
  const accuracy = summary.picksCount > 0
    ? Math.round((summary.correctPicks / summary.picksCount) * 100)
    : 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[#fde68a]/30 bg-[#020617]/80 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-black text-[#fde68a]">
          Week {weekNumber} Summary
        </h3>
        {isComplete && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            Complete
          </span>
        )}
      </div>
      
      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-white/5 p-2 text-center">
          <div className="text-[18px] font-black text-white">
            {summary.picksCount}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Picks
          </div>
        </div>
        
        <div className="rounded-lg bg-emerald-500/10 p-2 text-center">
          <div className="text-[18px] font-black text-emerald-400">
            {summary.correctPicks}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-500/70">
            Correct
          </div>
        </div>
        
        <div className="rounded-lg bg-rose-500/10 p-2 text-center">
          <div className="text-[18px] font-black text-rose-400">
            {summary.incorrectPicks}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-rose-500/70">
            Wrong
          </div>
        </div>
        
        <div className="rounded-lg bg-[#fde68a]/10 p-2 text-center">
          <div className="text-[18px] font-black text-[#fde68a]">
            {summary.totalPoints}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#fde68a]/70">
            Points
          </div>
        </div>
      </div>
      
      {summary.picksCount > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Accuracy</span>
            <span className="font-bold text-white">{accuracy}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${accuracy}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`h-full rounded-full ${
                accuracy >= 70 ? "bg-emerald-400" :
                accuracy >= 40 ? "bg-[#fde68a]" :
                "bg-rose-400"
              }`}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
```

### Page Component

```typescript
// app/nfl-pickem/page.tsx
import { NFLPickEmGameList } from "@/components/nfl-pickem/NFLPickEmGameList";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "NFL Pick 'Em | Hightop Challenge",
  description: "Pick NFL winners each week. Picks lock at Thursday Night Football kickoff!",
  openGraph: {
    title: "NFL Pick 'Em | Hightop Challenge",
    description: "Pick NFL winners each week. Compete with friends and win points!",
  },
};

export default function NFLPickEmPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  return (
    <main className="min-h-screen bg-slate-950">
      <NFLPickEmGameList initialWeekId={searchParams.week} />
    </main>
  );
}
```

### Loading State

```typescript
// app/nfl-pickem/loading.tsx
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";

export default function NFLPickEmLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <BouncingBallLoader size="lg" label="Loading NFL Pick 'Em..." />
    </div>
  );
}
```

## 4.4 Code Review Checklist

- [ ] Component props properly typed
- [ ] Optimistic updates implemented correctly
- [ ] Error handling with user-friendly messages
- [ ] Loading states for all async operations
- [ ] Responsive design works on mobile
- [ ] Accessibility (aria labels, keyboard nav)
- [ ] Consistent styling with existing app
- [ ] No memory leaks (cleanup useEffect)
- [ ] Request cancellation implemented
- [ ] URL state sync for shareability

## 4.5 Integration with Venue Hub

Add to [`lib/venueGameCards.ts`](lib/venueGameCards.ts:19):

```typescript
// Add to VENUE_GAME_CARDS array
{
  key: "nfl-pickem",
  title: "NFL Pick 'Em",
  path: "/nfl-pickem",
  cardClassName: "bg-emerald-700 text-white",
  visibleOnVenueHome: true,
  rules: [
    "-Pick winners for all NFL games each week",
    "-Picks lock at Thursday Night Football kickoff",
    "-10 points per correct pick",
    "-View past weeks to see your results",
  ],
  steps: [
    {
      stepLabel: "Weekly Picks",
      heading: "Pick every game, every week.",
      body: "Navigate through the NFL season week by week. Pick winners for all games before Thursday Night kickoff.",
    },
    {
      stepLabel: "Lock Time",
      heading: "Thursday Night is the deadline.",
      body: "All picks lock when the first Thursday Night Football game kicks off. No changes after that!",
    },
    {
      stepLabel: "Track Results",
      heading: "See how you did.",
      body: "View previous weeks to check your picks and see the final scores. Build your season record!",
    },
  ],
}
```

---

**Next**: Proceed to [Phase 5: Logic & Lock Mechanism](docs/NFL_PICKEM_PHASE5_LOGIC.md)
