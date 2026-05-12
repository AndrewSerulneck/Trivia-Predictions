"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { getUserId, getVenueId } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import type { FantasyEntry, FantasyGame, FantasyLeaderboardEntry, FantasyPlayerPoolItem } from "@/lib/fantasy";
import type { FantasyLineupPlayer } from "@/lib/fantasy";

type GamesPayload = {
  ok: boolean;
  games?: FantasyGame[];
  playerPool?: FantasyPlayerPoolItem[];
  leaderboard?: FantasyLeaderboardEntry[];
  dailyGameId?: string;
  error?: string;
};

type EntriesPayload = {
  ok: boolean;
  entries?: FantasyEntry[];
  error?: string;
};

type LiveStatsDebugRow = {
  gameId: string;
  playerId: number;
  playerName: string;
  teamName: string;
  fantasyPoints: number;
  gameStatus: string;
  sourceUpdatedAt: string;
};

type LiveStatsDebugPayload = {
  ok: boolean;
  rows?: LiveStatsDebugRow[];
  error?: string;
};

type FantasyEntryRealtimeRow = {
  id?: string;
  user_id?: string;
  venue_id?: string;
  sport_key?: string;
  game_id?: string;
  game_label?: string;
  home_team?: string;
  away_team?: string;
  starts_at?: string;
  lineup?: unknown;
  status?: FantasyEntry["status"];
  points?: number | string;
  score_breakdown?: unknown;
  reward_points?: number | string;
  reward_claimed_at?: string | null;
  stats_last_source_updated_at?: string | null;
  settled_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

function parseRealtimeLineup(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const lineup: string[] = [];
  for (const item of raw) {
    const name =
      item && typeof item === "object" && !Array.isArray(item)
        ? String((item as Record<string, unknown>).player_name ?? (item as Record<string, unknown>).playerName ?? "").trim()
        : String(item ?? "").trim();
    const key = normalizePlayerKey(name);
    if (!name || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    lineup.push(name);
  }
  return lineup.slice(0, 5);
}

function parseRealtimeLineupPlayers(raw: unknown): FantasyLineupPlayer[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<number>();
  const players: FantasyLineupPlayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const playerId = Number.parseInt(String(row.player_id ?? row.playerId ?? ""), 10);
    const playerName = String(row.player_name ?? row.playerName ?? "").trim();
    if (!Number.isFinite(playerId) || playerId <= 0 || !playerName || seen.has(playerId)) {
      continue;
    }
    seen.add(playerId);
    players.push({ playerId, playerName });
  }
  return players;
}

function parseRealtimeScoreBreakdown(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const next: Record<string, number> = {};
  for (const [playerName, value] of Object.entries(raw as Record<string, unknown>)) {
    const points = typeof value === "number" ? value : Number.parseFloat(String(value));
    if (!Number.isFinite(points)) {
      continue;
    }
    next[playerName] = Number(points.toFixed(2));
  }
  return next;
}

function mapRealtimeEntry(row: FantasyEntryRealtimeRow): FantasyEntry | null {
  const id = String(row.id ?? "").trim();
  const userId = String(row.user_id ?? "").trim();
  const venueId = String(row.venue_id ?? "").trim();
  const sportKey = String(row.sport_key ?? "").trim();
  const gameId = String(row.game_id ?? "").trim();
  const startsAt = String(row.starts_at ?? "").trim();
  const status = (String(row.status ?? "pending").trim() || "pending") as FantasyEntry["status"];
  if (!id || !userId || !venueId || !gameId || !startsAt) {
    return null;
  }
  const pointsRaw = typeof row.points === "number" ? row.points : Number.parseFloat(String(row.points ?? "0"));
  const rewardRaw =
    typeof row.reward_points === "number" ? row.reward_points : Number.parseInt(String(row.reward_points ?? "0"), 10);
  const lineupPlayers = parseRealtimeLineupPlayers(row.lineup);
  const lineupNames = lineupPlayers.length > 0 ? lineupPlayers.map((player) => player.playerName) : parseRealtimeLineup(row.lineup);
  return {
    id,
    userId,
    venueId,
    sportKey: sportKey || "basketball_nba",
    gameId,
    gameLabel: String(row.game_label ?? "").trim(),
    homeTeam: String(row.home_team ?? "").trim(),
    awayTeam: String(row.away_team ?? "").trim(),
    startsAt,
    lineup: lineupNames,
    lineupPlayers,
    status,
    points: Number((Number.isFinite(pointsRaw) ? pointsRaw : 0).toFixed(2)),
    scoreBreakdown: parseRealtimeScoreBreakdown(row.score_breakdown),
    rewardPoints: Number.isFinite(rewardRaw) ? Math.max(0, rewardRaw) : 0,
    rewardClaimedAt: row.reward_claimed_at ? String(row.reward_claimed_at) : null,
    statsLastSourceUpdatedAt: row.stats_last_source_updated_at ? String(row.stats_last_source_updated_at) : null,
    settledAt: row.settled_at ? String(row.settled_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function getTodayDateInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildFantasyDailyGameId(date: string): string {
  return `nba-daily-${date}`;
}

function parseDailyGameDateFromId(gameId: string): string | null {
  const trimmed = String(gameId ?? "").trim();
  if (!trimmed.startsWith("nba-daily-")) {
    return null;
  }
  const rawDate = trimmed.slice("nba-daily-".length).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
}

function getEntryLocalDateKey(entry: Pick<FantasyEntry, "gameId" | "startsAt">): string | null {
  const fromGameId = parseDailyGameDateFromId(entry.gameId);
  if (fromGameId) {
    return fromGameId;
  }
  const startsAtMs = Date.parse(String(entry.startsAt ?? ""));
  if (!Number.isFinite(startsAtMs)) {
    return null;
  }
  return toLocalDateInput(new Date(startsAtMs));
}

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

function statusBadge(status: FantasyEntry["status"] | FantasyGame["status"]): string {
  if (status === "final") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (status === "live") return "bg-amber-100 text-amber-900 border-amber-300";
  if (status === "canceled") return "bg-slate-200 text-slate-700 border-slate-300";
  return "bg-blue-100 text-blue-900 border-blue-300";
}

function toStatusLabel(status: FantasyEntry["status"] | FantasyGame["status"]): string {
  if (status === "final") return "Final";
  if (status === "live") return "Live";
  if (status === "canceled") return "Canceled";
  return "Scheduled";
}

function computeFantasyClaimablePoints(entry: Pick<FantasyEntry, "points">): number {
  return Math.max(0, Math.round(Number(entry.points ?? 0)));
}

function normalizePlayerKey(value: string): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getScoreFromBreakdownByName(
  scoreBreakdown: Record<string, number>,
  playerName: string
): number {
  const exact = scoreBreakdown[playerName];
  if (typeof exact === "number" && Number.isFinite(exact)) {
    return exact;
  }
  const targetKey = normalizePlayerKey(playerName);
  for (const [key, raw] of Object.entries(scoreBreakdown)) {
    if (normalizePlayerKey(key) !== targetKey) {
      continue;
    }
    const parsed = Number(raw ?? 0);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function getScoreFromBreakdown(
  scoreBreakdown: Record<string, number>,
  player: { playerId: number; playerName: string }
): number {
  const idKey = String(player.playerId);
  const byId = scoreBreakdown[idKey];
  if (typeof byId === "number" && Number.isFinite(byId)) {
    return byId;
  }
  return getScoreFromBreakdownByName(scoreBreakdown, player.playerName);
}

function getLocalWeekStartMs(date: Date): number {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const dayOfWeek = next.getDay();
  next.setDate(next.getDate() - dayOfWeek);
  return next.getTime();
}

function isIsoInCurrentLocalWeek(iso: string): boolean {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return false;
  }
  return getLocalWeekStartMs(parsed) === getLocalWeekStartMs(new Date());
}

function SpringPop({
  popKey,
  className,
  glowSize,
  children,
}: {
  popKey: number;
  className?: string;
  glowSize: number;
  children: React.ReactNode;
}) {
  const controls = useAnimationControls();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await controls.set({ scale: 1, filter: "drop-shadow(0 0 0 rgba(34,211,238,0))" });
      if (cancelled) return;
      await controls.start({
        scale: 1.2,
        filter: `drop-shadow(0 0 ${glowSize}px rgba(34,211,238,0.95))`,
        transition: { type: "spring", stiffness: 300, damping: 30, mass: 1 },
      });
      if (cancelled) return;
      await controls.start({
        scale: 1,
        filter: "drop-shadow(0 0 0 rgba(34,211,238,0))",
        transition: { type: "spring", stiffness: 300, damping: 30, mass: 1 },
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [controls, glowSize, popKey]);

  return (
    <motion.span animate={controls} className={className}>
      {children}
    </motion.span>
  );
}

export function FantasyHome() {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [games, setGames] = useState<FantasyGame[]>([]);
  const [entries, setEntries] = useState<FantasyEntry[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [playerPool, setPlayerPool] = useState<FantasyPlayerPoolItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<FantasyLeaderboardEntry[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [hasStartedGame, setHasStartedGame] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [claimingEntryId, setClaimingEntryId] = useState("");
  const [isCollectingAllFantasy, setIsCollectingAllFantasy] = useState(false);
  const [hasLocalLineupDraft, setHasLocalLineupDraft] = useState(false);
  const [highlightedPlayerIds, setHighlightedPlayerIds] = useState<string[]>([]);
  const [totalScorePopTick, setTotalScorePopTick] = useState(0);
  const [playerPopTickById, setPlayerPopTickById] = useState<Record<string, number>>({});
  const [lastRealtimeMessageAt, setLastRealtimeMessageAt] = useState<number | null>(null);
  const [isRealtimeFresh, setIsRealtimeFresh] = useState(false);
  const [liveDebugRows, setLiveDebugRows] = useState<LiveStatsDebugRow[]>([]);
  const [liveDebugGameId, setLiveDebugGameId] = useState("");
  const [liveDebugLoading, setLiveDebugLoading] = useState(false);
  const gameDetailsRequestNonceRef = useRef(0);
  const fantasyKickoffRefreshTimerRef = useRef<number | null>(null);
  const fantasyLineupAutosaveTimerRef = useRef<number | null>(null);
  const fantasyRealtimeFallbackTimerRef = useRef<number | null>(null);
  const fantasyHighlightResetTimerRef = useRef<number | null>(null);
  const todayDate = useMemo(() => getTodayDateInput(), []);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    try {
      const date = todayDate;
      const params = new URLSearchParams({
        date,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        limit: "30",
      });
      const response = await fetch(`/api/fantasy/games?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as GamesPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load fantasy games.");
      }

      const nextGames = payload.games ?? [];
      setGames(nextGames);
      const fallbackDailyGameId = buildFantasyDailyGameId(date);
      const nextSelectedDailyId = String(payload.dailyGameId ?? "").trim() || fallbackDailyGameId;
      setSelectedGameId((current) => {
        if (current && (current === nextSelectedDailyId || nextGames.some((game) => game.id === current))) {
          return current;
        }
        return nextSelectedDailyId;
      });
    } catch (error) {
      setGames([]);
      setSelectedGameId("");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy games.");
    } finally {
      setLoadingGames(false);
    }
  }, [todayDate]);

  const loadEntries = useCallback(async (refreshSettlement = true, showLoading = refreshSettlement) => {
    if (!userId) {
      setEntries([]);
      setLoadingEntries(false);
      return;
    }

    if (showLoading) {
      setLoadingEntries(true);
    }
    try {
      const params = new URLSearchParams({
        userId,
        includeSettled: "true",
        refreshProgress: refreshSettlement ? "true" : "false",
        limit: "200",
      });
      const response = await fetch(`/api/fantasy/entries?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as EntriesPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load fantasy entries.");
      }
      setEntries(payload.entries ?? []);
    } catch (error) {
      setEntries([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy entries.");
    } finally {
      setLoadingEntries(false);
    }
  }, [userId]);

  const markPlayersAsHot = useCallback((playerIds: Array<number | string>) => {
    const keys = Array.from(new Set(playerIds.map((id) => String(id).trim()).filter(Boolean)));
    if (keys.length === 0) {
      return;
    }
    setHighlightedPlayerIds(keys);
    if (fantasyHighlightResetTimerRef.current) {
      window.clearTimeout(fantasyHighlightResetTimerRef.current);
    }
    fantasyHighlightResetTimerRef.current = window.setTimeout(() => {
      fantasyHighlightResetTimerRef.current = null;
      setHighlightedPlayerIds([]);
    }, 900);
  }, []);

  const triggerTotalScorePop = useCallback(() => {
    setTotalScorePopTick((value) => value + 1);
  }, []);

  const triggerPlayerScorePop = useCallback((playerIds: Array<number | string>) => {
    const keys = Array.from(new Set(playerIds.map((id) => String(id).trim()).filter(Boolean)));
    if (keys.length === 0) {
      return;
    }
    setPlayerPopTickById((previous) => {
      const next = { ...previous };
      for (const key of keys) {
        next[key] = (next[key] ?? 0) + 1;
      }
      return next;
    });
  }, []);

  const loadSelectedGameDetails = useCallback(async () => {
    if (!selectedGameId) {
      setPlayerPool([]);
      setLeaderboard([]);
      return;
    }

    try {
      const requestNonce = ++gameDetailsRequestNonceRef.current;
      const gameDate = parseDailyGameDateFromId(selectedGameId) ?? todayDate;
      const params = new URLSearchParams({
        gameId: selectedGameId,
        date: gameDate,
        tzOffsetMinutes: String(new Date().getTimezoneOffset()),
        _t: String(Date.now()),
      });
      // TODO: RESTORE ROSTER LOCK
      params.set("includeStartedGames", "true");
      if (venueId) {
        params.set("venueId", venueId);
      }

      const response = await fetch(`/api/fantasy/games?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as GamesPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load player pool.");
      }
      if (requestNonce !== gameDetailsRequestNonceRef.current) {
        return;
      }

      setPlayerPool(payload.playerPool ?? []);
      setLeaderboard(payload.leaderboard ?? []);

      setSelectedPlayers((current) => {
        const poolKeys = new Set((payload.playerPool ?? []).map((item) => item.playerName));
        return current.filter((name) => poolKeys.has(name));
      });
    } catch (error) {
      setPlayerPool([]);
      setLeaderboard([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy player pool.");
    }
  }, [selectedGameId, todayDate, venueId]);

  useEffect(() => {
    setSelectedPlayers([]);
    setPlayerPool([]);
    setLeaderboard([]);
  }, [selectedGameId]);

  useEffect(() => {
    void loadGames();
  }, [loadGames]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void loadEntries(false);
    void loadEntries(true, false);
  }, [loadEntries, userId]);

  useEffect(() => {
    void loadSelectedGameDetails();
  }, [loadSelectedGameDetails]);

  const existingEntryForSelectedGame = useMemo(
    () => entries.find((entry) => entry.gameId === selectedGameId),
    [entries, selectedGameId]
  );
  const playerPoolKeys = useMemo(
    () => new Set(playerPool.map((item) => normalizePlayerKey(item.playerName)).filter(Boolean)),
    [playerPool]
  );
  const canEditExistingEntryLineup = useMemo(() => {
    if (!existingEntryForSelectedGame) {
      return false;
    }
    // TODO: RESTORE ROSTER LOCK
    if (existingEntryForSelectedGame.status === "canceled") {
      return false;
    }
    return true;
  }, [existingEntryForSelectedGame, playerPoolKeys]);
  const nextUnlockedGame = useMemo(() => games.find((game) => !game.isLocked) ?? null, [games]);
  const liveDebugTargetGame = useMemo(() => {
    const liveGames = games.filter((game) => game.status === "live");
    if (liveGames.length === 0) {
      return null;
    }
    const lakersThunder = liveGames.find((game) => {
      const home = String(game.homeTeam ?? "").toLowerCase();
      const away = String(game.awayTeam ?? "").toLowerCase();
      const hasLakers = home.includes("lakers") || away.includes("lakers");
      const hasThunder = home.includes("thunder") || away.includes("thunder");
      return hasLakers && hasThunder;
    });
    return lakersThunder ?? liveGames[0] ?? null;
  }, [games]);
  const selectedSlateDate = useMemo(() => parseDailyGameDateFromId(selectedGameId) ?? todayDate, [selectedGameId, todayDate]);
  const liveEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (entry.status !== "live") {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        return entryDateKey === selectedSlateDate;
      }),
    [entries, selectedSlateDate]
  );
  const hasActiveDraftedEntry = useMemo(
    () =>
      entries.some(
        (entry) =>
          entry.gameId === selectedGameId &&
          (entry.status === "pending" || entry.status === "live")
      ),
    [entries, selectedGameId]
  );
  const hasLiveEntry = liveEntries.length > 0;
  const hasSyncableEntry = useMemo(
    () =>
      entries.some((entry) => {
        const entryDateKey = getEntryLocalDateKey(entry);
        if (entryDateKey !== selectedSlateDate) {
          return false;
        }
        return entry.status === "pending" || entry.status === "live";
      }),
    [entries, selectedSlateDate]
  );
  const nextPendingEntryStartMs = useMemo(() => {
    const now = Date.now();
    let nextStart: number | null = null;
    for (const entry of entries) {
      const entryDateKey = getEntryLocalDateKey(entry);
      if (entryDateKey !== selectedSlateDate) {
        continue;
      }
      if (entry.status !== "pending") {
        continue;
      }
      const startsAtMs = Date.parse(entry.startsAt);
      if (!Number.isFinite(startsAtMs) || startsAtMs <= now) {
        continue;
      }
      if (nextStart === null || startsAtMs < nextStart) {
        nextStart = startsAtMs;
      }
    }
    return nextStart;
  }, [entries, selectedSlateDate]);
  const finalUnclaimedEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            getEntryLocalDateKey(entry) === selectedSlateDate &&
            entry.status === "final" &&
            !entry.rewardClaimedAt &&
            computeFantasyClaimablePoints(entry) > 0 &&
            isIsoInCurrentLocalWeek(entry.startsAt)
        )
        .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt)),
    [entries, selectedSlateDate]
  );
  const trackedEntry = useMemo(() => {
    const selected = entries.find((entry) => entry.gameId === selectedGameId);
    if (selected && !(selected.status === "final" && Boolean(selected.rewardClaimedAt))) {
      return selected;
    }
    if (liveEntries.length > 0) {
      return liveEntries[0] ?? null;
    }
    return finalUnclaimedEntries[0] ?? null;
  }, [entries, finalUnclaimedEntries, liveEntries, selectedGameId]);
  const trackedEntryClaimablePoints = useMemo(
    () => (trackedEntry ? computeFantasyClaimablePoints(trackedEntry) : 0),
    [trackedEntry]
  );
  const trackedEntryBasePoints = useMemo(
    () => (trackedEntry ? Math.max(0, Number(trackedEntry.points ?? 0)) : 0),
    [trackedEntry]
  );
  const showTrackedEntryClaimButton = useMemo(
    () => Boolean(trackedEntry && trackedEntry.status === "final" && !trackedEntry.rewardClaimedAt && trackedEntryClaimablePoints > 0),
    [trackedEntry, trackedEntryClaimablePoints]
  );
  const hasResolvedEntries = !loadingEntries;
  const trackedEntryStartsAtMs = useMemo(() => Date.parse(String(trackedEntry?.startsAt ?? "").trim()), [trackedEntry]);
  const trackedEntryPreTipoff = useMemo(
    () => Boolean(Number.isFinite(trackedEntryStartsAtMs) && Date.now() < trackedEntryStartsAtMs),
    [trackedEntryStartsAtMs]
  );
  const livePointsByPlayer = useMemo(() => {
    const next = new Map<string, number>();
    if (!trackedEntry || trackedEntryPreTipoff) {
      return next;
    }
    const lineupPlayers =
      trackedEntry.lineupPlayers.length > 0
        ? trackedEntry.lineupPlayers
        : trackedEntry.lineup.map((playerName, index) => ({ playerId: -(index + 1), playerName }));
    for (const player of lineupPlayers) {
      const points = getScoreFromBreakdown(trackedEntry.scoreBreakdown, player);
      if (Number.isFinite(points)) {
        next.set(String(player.playerId), Number(points.toFixed(2)));
      }
    }
    return next;
  }, [trackedEntry, trackedEntryPreTipoff]);
  const liveTrackedEntryPoints = useMemo(() => {
    if (!trackedEntry) {
      return 0;
    }
    if (trackedEntryPreTipoff) {
      return 0;
    }
    const requireLiveRows = trackedEntry.status === "pending" || trackedEntry.status === "live";
    const lineupPlayers =
      trackedEntry.lineupPlayers.length > 0
        ? trackedEntry.lineupPlayers
        : trackedEntry.lineup.map((playerName, index) => ({ playerId: -(index + 1), playerName }));
    const total = lineupPlayers.reduce((sum, player) => {
      const points = livePointsByPlayer.get(String(player.playerId));
      if (typeof points === "number" && Number.isFinite(points)) {
        return sum + points;
      }
      if (requireLiveRows) {
        return sum;
      }
      return sum + getScoreFromBreakdown(trackedEntry.scoreBreakdown, player);
    }, 0);
    if (!Number.isFinite(total)) {
      return requireLiveRows ? 0 : Number(trackedEntry.points ?? 0);
    }
    return total;
  }, [livePointsByPlayer, trackedEntry, trackedEntryPreTipoff]);

  useEffect(() => {
    if (!selectedGameId) {
      setHasStartedGame(false);
      return;
    }

    if (existingEntryForSelectedGame) {
      setHasStartedGame(true);
      return;
    }

    setHasStartedGame(false);
  }, [existingEntryForSelectedGame, selectedGameId]);

  useEffect(() => {
    if (!existingEntryForSelectedGame || !canEditExistingEntryLineup) {
      return;
    }
    if (hasLocalLineupDraft) {
      return;
    }
    setSelectedPlayers(existingEntryForSelectedGame.lineup);
  }, [canEditExistingEntryLineup, existingEntryForSelectedGame, hasLocalLineupDraft]);

  useEffect(() => {
    return () => {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
      }
      if (fantasyLineupAutosaveTimerRef.current) {
        window.clearTimeout(fantasyLineupAutosaveTimerRef.current);
        fantasyLineupAutosaveTimerRef.current = null;
      }
      if (fantasyRealtimeFallbackTimerRef.current) {
        window.clearTimeout(fantasyRealtimeFallbackTimerRef.current);
        fantasyRealtimeFallbackTimerRef.current = null;
      }
      if (fantasyHighlightResetTimerRef.current) {
        window.clearTimeout(fantasyHighlightResetTimerRef.current);
        fantasyHighlightResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const updateFreshness = () => {
      if (!lastRealtimeMessageAt) {
        setIsRealtimeFresh(false);
        return;
      }
      setIsRealtimeFresh(Date.now() - lastRealtimeMessageAt <= 10_000);
    };
    updateFreshness();
    const interval = window.setInterval(updateFreshness, 1000);
    return () => window.clearInterval(interval);
  }, [lastRealtimeMessageAt]);

  useEffect(() => {
    if (!userId) {
      console.log("[FantasyRealtime] waiting for userId before subscribing");
      return;
    }
    if (!supabase) {
      console.log("[FantasyRealtime] supabase client not configured");
      return;
    }
    console.log("[FantasyRealtime] subscribing", { userId });
    let active = true;
    const client = supabase;
    const channel = client
      .channel(`fantasy-entries:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fantasy_entries", filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log("[FantasyRealtime] fantasy_entries payload", payload);
          if (!active) {
            return;
          }
          setLastRealtimeMessageAt(Date.now());

          if (payload.eventType === "DELETE") {
            const deletedId = String((payload.old as { id?: string } | null)?.id ?? "").trim();
            if (!deletedId) {
              return;
            }
            setEntries((previous) => previous.filter((entry) => entry.id !== deletedId));
            return;
          }

          const nextEntry = mapRealtimeEntry((payload.new ?? null) as FantasyEntryRealtimeRow);
          if (!nextEntry) {
            return;
          }

          setEntries((previous) => {
            const next = [...previous];
            const existingIndex = next.findIndex((entry) => entry.id === nextEntry.id);
            if (existingIndex >= 0) {
              const previousEntry = next[existingIndex];
              if (previousEntry) {
                const nextLineupPlayers =
                  nextEntry.lineupPlayers.length > 0
                    ? nextEntry.lineupPlayers
                    : nextEntry.lineup.map((playerName, index) => ({ playerId: -(index + 1), playerName }));
                const changedPlayers = nextLineupPlayers
                  .filter((player) => {
                  const before = getScoreFromBreakdown(previousEntry.scoreBreakdown, player);
                  const after = getScoreFromBreakdown(nextEntry.scoreBreakdown, player);
                  return Math.abs(after - before) >= 0.01;
                })
                  .map((player) => player.playerId);
                if (changedPlayers.length > 0) {
                  window.requestAnimationFrame(() => {
                    markPlayersAsHot(changedPlayers);
                    triggerPlayerScorePop(changedPlayers);
                  });
                }
                if (Math.abs(Number(nextEntry.points ?? 0) - Number(previousEntry.points ?? 0)) >= 0.01 || changedPlayers.length > 0) {
                  triggerTotalScorePop();
                }
              }
              next[existingIndex] = nextEntry;
            } else {
              next.push(nextEntry);
            }

            next.sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt));
            return next;
          });
        }
      )
      .subscribe((status) => {
        console.log("[FantasyRealtime] channel status", status, { userId });
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setIsRealtimeFresh(false);
        }
      });

    // Keep a low-frequency polling fallback for resilience if websocket delivery stalls.
    const scheduleFallbackRefresh = () => {
      if (!active || fantasyRealtimeFallbackTimerRef.current) {
        return;
      }
      fantasyRealtimeFallbackTimerRef.current = window.setTimeout(() => {
        fantasyRealtimeFallbackTimerRef.current = null;
        void loadEntries(true, false);
        scheduleFallbackRefresh();
      }, 45000);
    };
    scheduleFallbackRefresh();

    return () => {
      active = false;
      if (fantasyRealtimeFallbackTimerRef.current) {
        window.clearTimeout(fantasyRealtimeFallbackTimerRef.current);
        fantasyRealtimeFallbackTimerRef.current = null;
      }
      void client.removeChannel(channel);
    };
  }, [loadEntries, markPlayersAsHot, triggerPlayerScorePop, triggerTotalScorePop, userId]);

  useEffect(() => {
    if (!userId || supabase) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadEntries(true, false);
      void loadSelectedGameDetails();
      void loadGames();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadEntries, loadGames, loadSelectedGameDetails, userId, supabase]);

  useEffect(() => {
    if (!selectedGameId) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadSelectedGameDetails();
    }, 15000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadSelectedGameDetails, selectedGameId]);

  const loadLiveDebugRows = useCallback(async () => {
    const targetGameId = String(liveDebugTargetGame?.id ?? "").trim();
    const rosterPlayerIds = (
      trackedEntry?.lineupPlayers.length
        ? trackedEntry.lineupPlayers.map((player) => player.playerId)
        : []
    )
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => String(id));
    if (!targetGameId && rosterPlayerIds.length === 0) {
      setLiveDebugRows([]);
      setLiveDebugGameId("");
      return;
    }
    setLiveDebugLoading(true);
    try {
      const params = new URLSearchParams({
        gameId: targetGameId,
        limit: "120",
      });
      if (rosterPlayerIds.length > 0) {
        params.set("rosterPlayerIds", rosterPlayerIds.join(","));
      }
      const response = await fetch(`/api/fantasy/live-stats-debug?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as LiveStatsDebugPayload;
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load live debug rows.");
      }
      setLiveDebugRows(payload.rows ?? []);
      setLiveDebugGameId(targetGameId || "roster-fallback");
    } catch (error) {
      setLiveDebugRows([]);
      setLiveDebugGameId(targetGameId || "roster-fallback");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load live debug rows.");
    } finally {
      setLiveDebugLoading(false);
    }
  }, [liveDebugTargetGame?.id, trackedEntry]);

  useEffect(() => {
    void loadLiveDebugRows();
  }, [loadLiveDebugRows]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadLiveDebugRows();
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadLiveDebugRows]);

  useEffect(() => {
    if (!userId || hasLiveEntry || nextPendingEntryStartMs === null) {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
      }
      return;
    }
    const delayMs = Math.max(0, nextPendingEntryStartMs - Date.now() + 300);
    fantasyKickoffRefreshTimerRef.current = window.setTimeout(() => {
      fantasyKickoffRefreshTimerRef.current = null;
      void loadEntries(true, false);
      void loadSelectedGameDetails();
      void loadGames();
    }, delayMs);
    return () => {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
      }
    };
  }, [hasLiveEntry, loadEntries, loadGames, loadSelectedGameDetails, nextPendingEntryStartMs, userId]);

  const togglePlayer = useCallback((playerName: string) => {
    setHasLocalLineupDraft(true);
    setSelectedPlayers((current) => {
      if (current.includes(playerName)) {
        return current.filter((name) => name !== playerName);
      }
      if (current.length >= 5) {
        return current;
      }
      return [...current, playerName];
    });
  }, []);

  const persistLineup = useCallback(async (lineup: string[]) => {
    if (!userId || !venueId || !selectedGameId || lineup.length !== 5) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/fantasy/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: existingEntryForSelectedGame ? "update" : "submit",
          userId,
          venueId,
          gameId: selectedGameId,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          lineup,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to submit fantasy lineup.");
      }

      setStatusMessage(
        existingEntryForSelectedGame
          ? "Roster updated and saved automatically."
          : "Roster submitted automatically. Live scoring will update automatically."
      );
      setHasLocalLineupDraft(false);
      await Promise.all([loadEntries(true), loadSelectedGameDetails()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save fantasy lineup.");
    } finally {
      setSubmitting(false);
    }
  }, [existingEntryForSelectedGame, loadEntries, loadSelectedGameDetails, selectedGameId, userId, venueId]);

  useEffect(() => {
    if (!(selectedGameId && hasResolvedEntries && ((hasStartedGame && !existingEntryForSelectedGame) || canEditExistingEntryLineup))) {
      return;
    }

    if (!hasLocalLineupDraft) {
      return;
    }

    if (selectedPlayers.length !== 5) {
      setStatusMessage(
        selectedPlayers.length === 0
          ? "Tap players to build your roster. Saves happen automatically at 5 selections."
          : `Select ${5 - selectedPlayers.length} more player${5 - selectedPlayers.length === 1 ? "" : "s"} to auto-save.`
      );
      return;
    }

    if (fantasyLineupAutosaveTimerRef.current) {
      window.clearTimeout(fantasyLineupAutosaveTimerRef.current);
    }
    fantasyLineupAutosaveTimerRef.current = window.setTimeout(() => {
      fantasyLineupAutosaveTimerRef.current = null;
      void persistLineup(selectedPlayers);
    }, 220);

    return () => {
      if (fantasyLineupAutosaveTimerRef.current) {
        window.clearTimeout(fantasyLineupAutosaveTimerRef.current);
        fantasyLineupAutosaveTimerRef.current = null;
      }
    };
  }, [
    canEditExistingEntryLineup,
    existingEntryForSelectedGame,
    hasLocalLineupDraft,
    hasResolvedEntries,
    hasStartedGame,
    persistLineup,
    selectedGameId,
    selectedPlayers,
  ]);

  const claimReward = useCallback(
    async (entry: FantasyEntry, sourceRect?: DOMRect) => {
      if (!userId || !entry.id || claimingEntryId) {
        return;
      }

      setClaimingEntryId(entry.id);
      setStatusMessage("");
      setErrorMessage("");
      try {
        const response = await fetch("/api/fantasy/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "claim",
            userId,
            entryId: entry.id,
          }),
        });

        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          result?: { claimed: boolean; pointsAwarded: number };
        };

        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to claim fantasy reward.");
        }

        if (payload.result?.claimed) {
          if (sourceRect && payload.result.pointsAwarded > 0) {
            window.dispatchEvent(
              new CustomEvent("tp:coin-flight", {
                detail: {
                  sourceRect: {
                    left: sourceRect.left,
                    top: sourceRect.top,
                    width: sourceRect.width,
                    height: sourceRect.height,
                  },
                  delta: payload.result.pointsAwarded,
                  coins: Math.min(36, Math.max(12, Math.round(payload.result.pointsAwarded / 2))),
                },
              })
            );
            window.dispatchEvent(
              new CustomEvent("tp:points-updated", {
                detail: {
                  source: "fantasy-claim",
                  delta: payload.result.pointsAwarded,
                },
              })
            );
          }
          setStatusMessage(`Claimed +${payload.result.pointsAwarded} points.`);
        } else {
          setStatusMessage("Reward was already claimed.");
        }

        await loadEntries(false);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to claim fantasy reward.");
      } finally {
        setClaimingEntryId("");
      }
    },
    [claimingEntryId, loadEntries, userId]
  );

  const totalUnclaimedFantasyPoints = useMemo(
    () => finalUnclaimedEntries.reduce((sum, e) => sum + computeFantasyClaimablePoints(e), 0),
    [finalUnclaimedEntries]
  );

  const collectAllFantasyEntries = useCallback(async () => {
    if (!userId || isCollectingAllFantasy || finalUnclaimedEntries.length === 0) return;
    setIsCollectingAllFantasy(true);
    setStatusMessage("");
    setErrorMessage("");
    let totalAwarded = 0;
    let firstRect: DOMRect | undefined;
    try {
      const collectButton = document.querySelector<HTMLElement>("[data-fantasy-collect-all]");
      firstRect = collectButton?.getBoundingClientRect();
      for (const entry of finalUnclaimedEntries) {
        if (!entry.id) continue;
        const response = await fetch("/api/fantasy/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim", userId, entryId: entry.id }),
        });
        const payload = (await response.json()) as {
          ok: boolean;
          result?: { claimed: boolean; pointsAwarded: number };
        };
        if (payload.ok && payload.result?.claimed) {
          totalAwarded += payload.result.pointsAwarded;
        }
      }
      if (totalAwarded > 0) {
        window.dispatchEvent(
          new CustomEvent("tp:coin-flight", {
            detail: {
              sourceRect: firstRect
                ? { left: firstRect.left, top: firstRect.top, width: firstRect.width, height: firstRect.height }
                : undefined,
              delta: totalAwarded,
              coins: Math.min(36, Math.max(14, Math.round(totalAwarded / 2))),
            },
          })
        );
        window.dispatchEvent(
          new CustomEvent("tp:points-updated", {
            detail: { source: "fantasy-claim", delta: totalAwarded },
          })
        );
        setStatusMessage(`Collected +${totalAwarded} points!`);
      }
    } catch {
      setErrorMessage("Failed to collect some entries. Try individual collect buttons below.");
    } finally {
      setIsCollectingAllFantasy(false);
      await loadEntries(false);
    }
  }, [finalUnclaimedEntries, isCollectingAllFantasy, loadEntries, userId]);

  if (!userId || !venueId) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Join a venue to create and track fantasy lineups.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <VenueEntryRulesPanel gameKey="fantasy" shouldDisplay={entries.length === 0} />

      {finalUnclaimedEntries.length > 0 ? (
        <div className="rounded-xl border-2 border-violet-500 bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-3 shadow-[0_6px_18px_rgba(124,58,237,0.35)]">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-100">Fantasy Points Ready</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black leading-none text-white">
                {finalUnclaimedEntries.length} completed game{finalUnclaimedEntries.length !== 1 ? "s" : ""}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-violet-100">
                {totalUnclaimedFantasyPoints} pts waiting to collect
              </p>
            </div>
            <button
              type="button"
              data-fantasy-collect-all
              onClick={() => void collectAllFantasyEntries()}
              disabled={isCollectingAllFantasy}
              className="tp-clean-button inline-flex min-h-[44px] items-center rounded-full border-2 border-white bg-white px-4 py-2 text-sm font-black text-violet-800 shadow-[0_3px_0_rgba(0,0,0,0.18)] transition-all active:scale-95 disabled:opacity-60"
            >
              {isCollectingAllFantasy ? "Collecting..." : "Collect Points"}
            </button>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Hightop Fantasy™</h2>
            <p className="text-sm text-slate-700">Build a 5-player lineup and compete live with your venue.</p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/80 px-2 py-1">
            <span className={`inline-flex h-2 w-2 rounded-full bg-emerald-500 ${isRealtimeFresh ? "animate-pulse" : "opacity-40"}`} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">Live</span>
          </div>
        </div>

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

        {games.length === 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No NBA games available for this date.
          </div>
        ) : null}
      </section>

      {trackedEntry ? (
        <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Your Team Tracker</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge(trackedEntry.status)}`}>
              {toStatusLabel(trackedEntry.status)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-700">
            {trackedEntry.gameLabel} · {formatLocalDateTime(trackedEntry.startsAt)}
          </p>
          {showTrackedEntryClaimButton ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">Final fantasy score summary</p>
              <div className="mt-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-900">
                <p>Base fantasy score: {trackedEntryBasePoints.toFixed(2)} pts</p>
                <p className="font-semibold">Total to collect: {trackedEntryClaimablePoints} points</p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  void claimReward(trackedEntry, rect);
                }}
                disabled={claimingEntryId === trackedEntry.id}
                className="tp-clean-button mt-3 rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-60"
              >
                {claimingEntryId === trackedEntry.id ? "Collecting..." : `Collect ${trackedEntryClaimablePoints} Points`}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Live Points</p>
                  <SpringPop popKey={totalScorePopTick} glowSize={12}>
                    <p className={`text-sm font-black ${isRealtimeFresh ? "text-cyan-700" : "text-slate-900"}`}>{liveTrackedEntryPoints.toFixed(2)} pts</p>
                  </SpringPop>
                </div>
                <ul className="mt-2 space-y-1">
                  {(trackedEntry.lineupPlayers.length > 0
                    ? trackedEntry.lineupPlayers
                    : trackedEntry.lineup.map((playerName, index) => ({ playerId: -(index + 1), playerName })).map((player) => player)
                  ).map((player) => {
                    const playerName = player.playerName;
                    const livePoints = livePointsByPlayer.get(String(player.playerId));
                    const requireLiveRows = trackedEntry.status === "pending" || trackedEntry.status === "live";
                    const playerPoints =
                      typeof livePoints === "number"
                        ? livePoints
                        : requireLiveRows
                        ? 0
                        : getScoreFromBreakdown(trackedEntry.scoreBreakdown, player);
                    const isHot = highlightedPlayerIds.includes(String(player.playerId));
                    return (
                      <li
                        key={`${trackedEntry.id}-${player.playerId}`}
                        className={`flex items-center justify-between gap-2 text-xs transition-all duration-300 ${
                          isHot ? "scale-[1.03] text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.95)]" : "text-slate-700"
                        }`}
                      >
                        <span className="font-medium text-slate-800">{playerName}</span>
                        <SpringPop
                          popKey={playerPopTickById[String(player.playerId)] ?? 0}
                          glowSize={10}
                          className={`font-semibold ${isHot ? "text-cyan-200" : ""}`}
                        >
                          {playerPoints.toFixed(2)} pts
                        </SpringPop>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {hasLiveEntry ? (
                <p className="mt-2 text-[11px] font-semibold text-emerald-800">Live game detected. Streaming realtime updates.</p>
              ) : (
                <p className="mt-2 text-[11px] text-slate-600">No live game right now. Automatic updates will resume when your next game starts.</p>
              )}
            </>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-cyan-200/70 bg-cyan-50/80 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Live Player Feed (Debug)</h3>
            <p className="mt-1 text-xs text-slate-700">
              {liveDebugTargetGame
                ? `${liveDebugTargetGame.awayTeam} vs ${liveDebugTargetGame.homeTeam} · Game ID ${liveDebugTargetGame.id}`
                : "No live NBA game detected right now."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadLiveDebugRows()}
            className="tp-clean-button rounded-lg border border-cyan-400 bg-cyan-100 px-2.5 py-1.5 text-xs font-semibold text-cyan-900"
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          {liveDebugLoading ? "Refreshing..." : `Rows: ${liveDebugRows.length}${liveDebugGameId ? ` · game_id=${liveDebugGameId}` : ""}`}
        </p>
        {liveDebugRows.length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">No live player rows returned yet.</p>
        ) : (
          <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-cyan-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-cyan-100 text-slate-800">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Team</th>
                  <th className="px-2 py-1 text-left font-semibold">Player</th>
                  <th className="px-2 py-1 text-right font-semibold">Pts</th>
                  <th className="px-2 py-1 text-left font-semibold">Status</th>
                  <th className="px-2 py-1 text-left font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {liveDebugRows.map((row) => (
                  <tr key={`${row.gameId}-${row.playerId}`} className="border-t border-cyan-100">
                    <td className="px-2 py-1 text-slate-700">{row.teamName}</td>
                    <td className="px-2 py-1 font-medium text-slate-900">{row.playerName}</td>
                    <td className="px-2 py-1 text-right font-semibold text-slate-900">{row.fantasyPoints.toFixed(2)}</td>
                    <td className="px-2 py-1 text-slate-700">{row.gameStatus}</td>
                    <td className="px-2 py-1 text-slate-600">{formatLocalDateTime(row.sourceUpdatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {finalUnclaimedEntries.length > 1 ? (
        <section className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Completed Games Ready To Collect</h3>
          <p className="mt-1 text-xs text-slate-700">
            Finalized rosters stay here until you collect points.
          </p>
          <div className="mt-3 space-y-2">
            {finalUnclaimedEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{entry.gameLabel}</p>
                    <p className="text-xs text-slate-600">{formatLocalDateTime(entry.startsAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      void claimReward(entry, rect);
                    }}
                    disabled={claimingEntryId === entry.id}
                    className="tp-clean-button rounded-lg border border-emerald-500 bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-60"
                  >
                    {claimingEntryId === entry.id ? "Collecting..." : `Collect ${computeFantasyClaimablePoints(entry)} Points`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {selectedGameId && hasResolvedEntries && !hasActiveDraftedEntry && !existingEntryForSelectedGame && !hasStartedGame ? (
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-cyan-800">Game Start</p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">Hightop Fantasy™ Rules</h3>
          <p className="mt-1 text-sm text-slate-700">
            Build one NBA lineup for today&apos;s slate. Only players in games that have not started are eligible.
          </p>
          <div className="mt-3 space-y-1 rounded-lg border border-cyan-200 bg-white px-3 py-2">
            <p className="text-xs text-slate-700">- Draft a team</p>
            <p className="text-xs text-slate-700">- Earn points based on player stats</p>
            <p className="text-xs text-slate-700">- Teams are locked once games begin</p>
          </div>
          <button
            type="button"
            onClick={() => setHasStartedGame(true)}
            className="tp-clean-button mt-3 rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-2 text-sm font-semibold text-indigo-900"
          >
            Start Fantasy Game
          </button>
        </section>
      ) : null}

      {selectedGameId && hasResolvedEntries && ((hasStartedGame && !existingEntryForSelectedGame) || canEditExistingEntryLineup) ? (
        <section className="rounded-2xl border border-violet-200/70 bg-violet-50/85 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {existingEntryForSelectedGame ? "Update Lineup" : "Lineup Builder"}
            </h3>
            <div className="text-xs font-semibold text-slate-700">Selected {selectedPlayers.length}/5</div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Scoring: 1 pt per point, 1.2 per rebound, 1.5 per assist, 3 per steal, 3 per block, -1 per turnover.
          </div>
          <p className="mt-2 text-xs text-slate-700">
            Tap any player once to add them instantly. Tap again to remove.
          </p>

          {playerPool.length === 0 ? (
            <div className="mt-3 text-sm text-slate-600">
              {nextUnlockedGame ? "Loading player pool..." : "All games have started. No eligible players remain for today."}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {playerPool.map((item) => {
                const selected = selectedPlayers.includes(item.playerName);
                return (
                  <button
                    key={item.playerName}
                    type="button"
                    disabled={selectedPlayers.length >= 5 && !selected}
                    onClick={() => togglePlayer(item.playerName)}
                    className={`tp-clean-button rounded-lg border px-3 py-2 text-left disabled:opacity-60 ${
                      selected
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-violet-200 bg-white/90 hover:border-violet-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">{item.playerName}</div>
                      {selected ? (
                        <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-900">
                          Added
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Markets: {item.coverage} · Avg line: {item.projectedLine ?? "--"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedPlayers.map((name) => (
              <span key={name} className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                {name}
              </span>
            ))}
          </div>

          <p className="mt-3 text-xs font-semibold text-slate-700">
            {submitting
              ? "Saving lineup..."
              : selectedPlayers.length === 5
                ? "Lineup auto-saves when complete."
                : `Select ${5 - selectedPlayers.length} more player${5 - selectedPlayers.length === 1 ? "" : "s"} to auto-save.`}
          </p>
        </section>
      ) : null}

      {selectedGameId && hasResolvedEntries && existingEntryForSelectedGame && !canEditExistingEntryLineup ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Lineup Locked</h3>
          <p className="mt-1 text-sm text-slate-700">
            Your team is already set for today. Changes are only allowed before any selected player&apos;s game starts.
          </p>
        </section>
      ) : null}

      <InlineSlotAdClient
        slot="leaderboard-sidebar"
        venueId={venueId}
        pageKey="fantasy"
        adType="inline"
        displayTrigger="on-load"
        placementKey="fantasy-inline"
      />

    </div>
  );
}
