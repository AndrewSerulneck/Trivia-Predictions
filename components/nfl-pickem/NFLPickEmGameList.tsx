"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GameAppBar } from "@/components/venue/AppBar";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { getUserId, getVenueId } from "@/lib/storage";
import { formatCalendarDate } from "@/lib/formatCalendarDate";
import { WeekSelector } from "@/components/nfl-pickem/WeekSelector";
import { NFLGameCard, type NFLGame } from "@/components/nfl-pickem/NFLGameCard";
import { WeeklySummary } from "@/components/nfl-pickem/WeeklySummary";
import { NFLPickEmLeaderboard } from "@/components/nfl-pickem/NFLPickEmLeaderboard";
import { NFLPickEmRewardBanner } from "@/components/nfl-pickem/NFLPickEmRewardBanner";
import { NFLTiebreakerCard } from "@/components/nfl-pickem/NFLTiebreakerCard";

type NFLPickEmScoringMode = "standard" | "spread";

// Types matching API
type NFLWeekOption = {
  id: string;
  weekNumber: number;
  label: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
  /** True only for the single preseason preview week — see lib/nflPickEm.ts. */
  isUpcomingPreview: boolean;
};

// Mirrors PICKEM_REWARD_POINTS in lib/nflPickEm.ts (and the header copy below).
// That module is server-only, so the value is restated rather than imported.
const NFL_PICK_REWARD_POINTS = 10;

type UserSummary = {
  picksCount: number;
  correctPicks: number;
  incorrectPicks: number;
  totalPoints: number;
  isComplete: boolean;
};

export function NFLPickEmGameList({
  initialWeekId,
  onBack,
}: {
  initialWeekId?: string;
  /** Injected by GameLandingExperience — ends the analytics session and runs the venue return transition. */
  onBack?: () => void;
}) {
  const router = useRouter();

  // Core state
  const [weeks, setWeeks] = useState<NFLWeekOption[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<string>(initialWeekId || "");
  // The API's notion of "current" NFL week — distinct from selectedWeekId,
  // which the user can navigate away from via WeekSelector. Lets the
  // leaderboard tell a past, already-decided week apart from the live one.
  const [currentWeekId, setCurrentWeekId] = useState<string>("");
  // Bumped after a successful pick so the leaderboard refetches its own-row
  // stats without depending on picks/optimisticPicks state directly.
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);
  const [weekData, setWeekData] = useState<{
    week: {
      id: string;
      weekNumber: number;
      thursdayKickoff: string | null;
      status: string;
      isLocked: boolean;
    };
    scoringMode: NFLPickEmScoringMode;
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

  // Low-frequency clock so a game's lock state can flip to locked locally
  // once its kickoff passes, without waiting on a refetch of the
  // server-computed isLocked boolean.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(interval);
  }, []);

  // Refs for request deduplication
  const inFlightRequests = useRef<Record<string, AbortController>>({});

  // Mirrors of state read synchronously inside submitPick so the callback never
  // needs weekData/optimisticPicks in its dependency array (avoids stale closures
  // and callback churn on every pick).
  const optimisticPicksRef = useRef<Record<string, string>>({});
  const serverPicksRef = useRef<Record<string, string | undefined>>({});
  // Per-game request sequence number so an earlier, slower response can't
  // clobber a newer optimistic pick.
  const requestSeqRef = useRef<Record<string, number>>({});
  
  // Initialize user data
  useEffect(() => {
    setUserId(getUserId() || "");
    setVenueId(getVenueId() || "");
  }, []);

  // Keep the synchronous mirrors above in sync with the latest committed state
  useEffect(() => {
    const serverPicks: Record<string, string | undefined> = {};
    weekData?.games.forEach(game => {
      serverPicks[game.id] = game.userPickTeam;
    });
    serverPicksRef.current = serverPicks;
  }, [weekData]);
  
  // Load weeks list
  useEffect(() => {
    async function loadWeeks() {
      try {
        const response = await fetch("/api/nfl-pickem/weeks?includeComplete=true");
        const data = await response.json();
        
        if (!data.ok) throw new Error(data.error);

        setWeeks(data.weeks);
        setSeason(typeof data.season === "number" ? data.season : null);
        setCurrentWeekId(typeof data.currentWeekId === "string" ? data.currentWeekId : "");

        // Default to the API's currentWeekId. The initialWeekId prop (from
        // ?week=) wins if it names a week that's actually in the allowed
        // (past + current) list; otherwise fall back rather than erroring —
        // this is also what recovers a stale/pokeable future-week id.
        // Deliberately reads the *initial* week rather than the live
        // selectedWeekId: subscribing to the selection made this effect refetch
        // the whole week list every time the user changed weeks.
        const weekIsValid = data.weeks.some((w: NFLWeekOption) => w.id === initialWeekId);
        if (!initialWeekId || !weekIsValid) {
          const currentWeekId: string | null = data.currentWeekId;
          const target =
            data.weeks.find((w: NFLWeekOption) => w.id === currentWeekId) ||
            data.weeks[data.weeks.length - 1];
          if (target) setSelectedWeekId(target.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load weeks");
      } finally {
        setLoadingWeeks(false);
      }
    }
    
    loadWeeks();
  }, [initialWeekId]);
  
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
            scoringMode: data.scoringMode === "spread" ? "spread" : "standard",
            games: data.games,
            userSummary: data.userSummary,
          });
          
          // Clear optimistic picks for this week
          setOptimisticPicks({});
          optimisticPicksRef.current = {};
          requestSeqRef.current = {};
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
  }, [selectedWeekId, userId, venueId]);

  // The ?week= sync belongs to the user action, not the fetch. Writing the URL
  // from inside loadGames made that effect depend on the navigation it had just
  // caused; a replace still pending when the user tapped the exit chevron then
  // fired after the push to /venue and yanked them back into the game.
  // window.location.search is read here (not useSearchParams) so nothing
  // subscribes to the URL and re-runs on it.
  const handleSelectWeek = useCallback((weekId: string) => {
    setSelectedWeekId(weekId);
    const params = new URLSearchParams(window.location.search);
    params.set("week", weekId);
    router.replace(`/nfl-pickem?${params.toString()}`, { scroll: false });
  }, [router]);

  // Submit pick handler. Reads pick/week state via refs (not closed-over state)
  // so this callback stays stable and never acts on a stale currentPick.
  const submitPick = useCallback(async (game: NFLGame, team: string) => {
    if (!userId || !venueId) {
      setError("Please join a venue to make picks");
      return;
    }

    if (game.isLocked || Date.parse(game.startsAt) <= Date.now()) {
      setError("Picks are locked for this game");
      return;
    }

    const currentPick = optimisticPicksRef.current[game.id] ?? serverPicksRef.current[game.id];
    const isDeselect = currentPick === team;

    // Optimistic update — mutate the ref synchronously so a rapid second tap
    // (before this render commits) still reads the correct current pick.
    const nextPicks = { ...optimisticPicksRef.current };
    if (isDeselect) {
      delete nextPicks[game.id];
    } else {
      nextPicks[game.id] = team;
    }
    optimisticPicksRef.current = nextPicks;
    setOptimisticPicks(nextPicks);

    const seq = (requestSeqRef.current[game.id] ?? 0) + 1;
    requestSeqRef.current[game.id] = seq;

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

      setLeaderboardRefreshKey((value) => value + 1);
    } catch (err) {
      // A newer request for this game has since started — it owns the
      // optimistic state now, so this stale response must not roll it back.
      if (requestSeqRef.current[game.id] !== seq) return;

      const rolledBack = { ...optimisticPicksRef.current };
      if (isDeselect) {
        rolledBack[game.id] = currentPick!;
      } else {
        delete rolledBack[game.id];
      }
      optimisticPicksRef.current = rolledBack;
      setOptimisticPicks(rolledBack);
      setError(err instanceof Error ? err.message : "Failed to submit pick");
    }
  }, [userId, venueId, selectedWeekId]);
  
  // Memoized game list with optimistic updates
  const gamesWithOptimistic = useMemo(() => {
    if (!weekData) return [];
    return weekData.games.map(game => ({
      ...game,
      userPickTeam: optimisticPicks[game.id] !== undefined
        ? optimisticPicks[game.id]
        : game.userPickTeam,
      // Locked if the server says so OR kickoff has passed on the client's
      // clock — display concern only, the server remains authoritative on writes.
      isLocked: game.isLocked || Date.parse(game.startsAt) <= now,
    }));
  }, [weekData, optimisticPicks, now]);

  // Weekly summary derived entirely from current pick state rather than the
  // server row, which is only refreshed by a full week reload. Blending a live
  // picksCount into stale correct/wrong counts let the accuracy bar disagree
  // with the tiles above it, and the stored is_complete goes stale the moment a
  // pick lands. The arithmetic mirrors recalculate_nfl_user_week: won =
  // correct, lost = wrong, 10 points per correct, complete = no pick still
  // pending (plus a has-picks guard, so an untouched week isn't "Complete").
  const displaySummary = useMemo(() => {
    if (!weekData?.userSummary) return undefined;

    let picksCount = 0;
    let correctPicks = 0;
    let incorrectPicks = 0;
    let pendingPicks = 0;

    for (const game of gamesWithOptimistic) {
      // A deselected pick keeps its stale userPickStatus, so gate on the team.
      if (!game.userPickTeam) continue;
      picksCount += 1;
      if (game.userPickStatus === "won") correctPicks += 1;
      else if (game.userPickStatus === "lost") incorrectPicks += 1;
      // Push and canceled are settled outcomes that score nothing — counting
      // either as pending would keep the week from ever reading complete.
      else if (game.userPickStatus !== "push" && game.userPickStatus !== "canceled") pendingPicks += 1;
    }

    return {
      ...weekData.userSummary,
      picksCount,
      correctPicks,
      incorrectPicks,
      totalPoints: correctPicks * NFL_PICK_REWARD_POINTS,
      isComplete: picksCount > 0 && pendingPicks === 0,
    };
  }, [weekData?.userSummary, gamesWithOptimistic]);
  
  // The preseason preview week (see buildNFLGameWeekOptions) — at most one
  // entry ever carries this flag, and only before any NFL week has started.
  const previewWeek = useMemo(() => weeks.find((week) => week.isUpcomingPreview), [weeks]);
  const previewWeekOpensLabel = useMemo(() => {
    if (!previewWeek) return "";
    return formatCalendarDate(previewWeek.weekStartDate, { month: "long", day: "numeric" });
  }, [previewWeek]);

  // Day-sections, in chronological order — grouped by the server-computed
  // dayGroupKey/dayGroupLabel (lib/nflPickEm.ts), never re-sorted here.
  // gamesWithOptimistic is already server-sorted by kickoff, so reducing in
  // order and keying on first appearance preserves that order.
  const dayGroups = useMemo(() => {
    const order: string[] = [];
    const byKey = new Map<string, { key: string; label: string; isThursdayNight: boolean; games: typeof gamesWithOptimistic }>();

    for (const game of gamesWithOptimistic) {
      let group = byKey.get(game.dayGroupKey);
      if (!group) {
        group = {
          key: game.dayGroupKey,
          label: game.dayGroupLabel,
          isThursdayNight: game.isThursdayNightSection,
          games: [],
        };
        byKey.set(game.dayGroupKey, group);
        order.push(game.dayGroupKey);
      }
      group.games.push(game);
    }

    return order.map((key) => byKey.get(key)!);
  }, [gamesWithOptimistic]);
  
  // Render
  return (
    <div className="min-h-[100dvh] touch-pan-y bg-slate-950 pb-[max(env(safe-area-inset-bottom),24px)]">
      <GameAppBar game="nfl-pickem" onExit={onBack} />
      
      <div className="space-y-4 px-3 pt-3">
        {/* Header */}
        <section className="rounded-2xl border border-[#fde68a]/30 bg-slate-900 px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏈</span>
            <h1 
              className="text-[22px] leading-none text-[#fde68a]"
              style={{ fontFamily: '"Bree Serif", "Nunito", serif' }}
            >
              NFL Pick &rsquo;Em
            </h1>
          </div>
          <p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-400">
            Pick winners for every NFL matchup each week. Correct picks are worth 10 points. Each pick locks at that game&apos;s kickoff.
          </p>
        </section>

        {/* Active reward awareness (Phase 8) — self-fetched, above the games list */}
        <NFLPickEmRewardBanner />

        {/* Week Selector */}
        {loadingWeeks ? (
          <div className="flex items-center justify-center py-8">
            <BouncingBallLoader size="sm" label="Loading weeks..." />
          </div>
        ) : weeks.length > 0 ? (
          <WeekSelector
            weeks={weeks}
            selectedWeekId={selectedWeekId}
            onSelect={handleSelectWeek}
          />
        ) : (
          <section className="rounded-2xl border border-amber-300/30 bg-amber-950/20 px-4 py-5 text-center">
            <h2 className="text-[15px] font-black text-amber-100">NFL weeks are not available yet</h2>
            <p className="mt-2 text-[12px] font-semibold leading-relaxed text-amber-100/70">
              Check back once the current week opens on Thursday.
            </p>
          </section>
        )}

        {/* Preseason early-access notice — see buildNFLGameWeekOptions */}
        {previewWeek && selectedWeekId === previewWeek.id && (
          <section className="rounded-2xl border border-[#fde68a]/30 bg-slate-900 px-4 py-3 text-center">
            <p className="text-[12px] font-semibold leading-relaxed text-[#fde68a]">
              {previewWeek.label || `Week ${previewWeek.weekNumber}`} opens {previewWeekOpensLabel} — lock in your
              picks early.
            </p>
          </section>
        )}

        {/* Weekly Summary */}
        {weekData && displaySummary && (
          <WeeklySummary
            summary={displaySummary}
            weekNumber={weekData.week.weekNumber}
            isComplete={displaySummary.isComplete}
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
        
        {/* Games List — one section per day, in chronological order */}
        {weekData && (
          <div className="space-y-4">
            {dayGroups.map((group) => (
              <section key={group.key}>
                <h2
                  className={`mb-2 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.16em] ${
                    group.isThursdayNight ? "text-[#fde68a]" : "text-slate-400"
                  }`}
                >
                  {group.isThursdayNight && <span>🏈</span>} {group.label}
                </h2>
                <div className="space-y-2.5">
                  {group.games.map(game => (
                    <NFLGameCard
                      key={game.id}
                      game={game}
                      onPick={submitPick}
                      isLocked={game.isLocked}
                      scoringMode={weekData.scoringMode}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Tiebreaker */}
        {weekData && venueId && selectedWeekId && (
          <NFLTiebreakerCard venueId={venueId} userId={userId} weekId={selectedWeekId} />
        )}

        {/* Leaderboard */}
        {venueId && selectedWeekId && (
          <NFLPickEmLeaderboard
            venueId={venueId}
            userId={userId}
            weekId={selectedWeekId}
            season={season}
            currentWeekId={currentWeekId}
            refreshKey={leaderboardRefreshKey}
          />
        )}
      </div>
    </div>
  );
}
