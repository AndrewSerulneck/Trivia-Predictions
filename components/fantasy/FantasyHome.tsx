"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { getUserId, getVenueId } from "@/lib/storage";
import { navigateBackToVenue } from "@/lib/venueGameTransition";
import { calculateDistanceMeters, getCurrentLocation } from "@/lib/geolocation";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
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
  wnbaDailyGameId?: string;
  error?: string;
};

type EntriesPayload = {
  ok: boolean;
  entries?: FantasyEntry[];
  error?: string;
};

type LiveStatsRealtimeRow = {
  game_id: string;
  player_id: number;
  player_name: string;
  team_name: string;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  turnovers: number;
  total_fantasy_points: number;
  game_status: string;
};

type StatsSnapshot = Pick<LiveStatsRealtimeRow, "pts" | "ast" | "reb" | "stl" | "blk" | "turnovers" | "total_fantasy_points">;

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
  live_collected_points?: number | string;
  stats_last_source_updated_at?: string | null;
  settled_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

const FALLBACK_HEADSHOT_SRC = "/images/player-silhouette.svg";
const DISABLE_GEOFENCE_FOR_TESTING =
  String(process.env.NEXT_PUBLIC_DISABLE_GEOFENCE ?? "")
    .trim()
    .toLowerCase() === "true";
const ACCESS_DISTANCE_METERS = 200;

function getGeofenceThresholdMeters(venueRadius: number, accuracy?: number): number {
  const normalizedVenueRadius = Number.isFinite(venueRadius) ? Math.max(0, Math.round(venueRadius)) : 0;
  const baseRadius = Math.max(ACCESS_DISTANCE_METERS, normalizedVenueRadius);
  const accuracyBuffer = Number.isFinite(accuracy) ? Math.min(5000, Math.max(120, Math.round(Number(accuracy) * 1.5))) : 320;
  return baseRadius + accuracyBuffer;
}

type FantasySport = "basketball" | "baseball" | "football";
const FANTASY_SPORTS: Array<{ key: FantasySport; icon: string; available: boolean }> = [
  { key: "basketball", icon: "🏀", available: true },
  { key: "baseball", icon: "⚾", available: false },
  { key: "football", icon: "🏈", available: false },
];
const FANTASY_LINEUP_SIZE_BY_SPORT: Record<FantasySport, number> = {
  basketball: 5,
  baseball: 5,
  football: 5,
};

function formatDateLabel(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return "Today";
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date(`${todayStr}T00:00:00`);
  const diffDays = Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
  return lineup;
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
    const headshotUrlRaw = String(row.headshot_url ?? row.headshotUrl ?? "").trim();
    if (!Number.isFinite(playerId) || playerId <= 0 || !playerName || seen.has(playerId)) {
      continue;
    }
    seen.add(playerId);
    players.push({ playerId, playerName, headshotUrl: headshotUrlRaw || null });
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
    liveCollectedPoints: Math.max(0, Number(row.live_collected_points ?? 0)),
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

function parseDailyGameDateFromId(gameId: string): string | null {
  const trimmed = String(gameId ?? "").trim();
  if (trimmed.startsWith("nba-daily-")) {
    const rawDate = trimmed.slice("nba-daily-".length).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  }
  if (trimmed.startsWith("wnba-daily-")) {
    const rawDate = trimmed.slice("wnba-daily-".length).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  }
  return null;
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

function describeStatChange(
  prev: StatsSnapshot,
  next: StatsSnapshot
): { actionLabel: string; flashLabel: string; pointsDelta: number } | null {
  const fpDelta = next.total_fantasy_points - prev.total_fantasy_points;
  if (Math.abs(fpDelta) < 0.01) return null;

  const ptsDiff = Math.round(next.pts - prev.pts);
  const astDiff = Math.round(next.ast - prev.ast);
  const rebDiff = Math.round(next.reb - prev.reb);
  const stlDiff = Math.round(next.stl - prev.stl);
  const blkDiff = Math.round(next.blk - prev.blk);
  const tovDiff = Math.round(next.turnovers - prev.turnovers);

  const labels: string[] = [];
  const pushDiffLabel = (diff: number, positiveSingular: string, positivePlural: string, negativeLabel: string) => {
    if (diff > 0) {
      labels.push(diff === 1 ? positiveSingular : `${positivePlural} (${diff})`);
      return;
    }
    if (diff < 0) {
      labels.push(negativeLabel);
    }
  };
  pushDiffLabel(stlDiff, "recorded a Steal", "recorded Steals", "had a Steal correction");
  pushDiffLabel(blkDiff, "recorded a Block", "recorded Blocks", "had a Block correction");
  if (ptsDiff >= 3) labels.push("scored from long range");
  else if (ptsDiff > 0) labels.push(ptsDiff === 1 ? "made a Free Throw" : `scored ${ptsDiff} points`);
  else if (ptsDiff < 0) labels.push("had a scoring correction");
  pushDiffLabel(astDiff, "recorded an Assist", "recorded Assists", "had an Assist correction");
  pushDiffLabel(rebDiff, "grabbed a Rebound", "grabbed Rebounds", "had a Rebound correction");
  pushDiffLabel(tovDiff, "committed a Turnover", "committed Turnovers", "had a Turnover correction");

  const actionLabel =
    labels.length === 0
      ? fpDelta > 0
        ? "had a fantasy stat update"
        : "had a fantasy stat correction"
      : labels.length === 1
        ? labels[0]!
        : `${labels[0]} and more`;

  const contributions = [
    { key: "steal", value: stlDiff * 3 },
    { key: "block", value: blkDiff * 3 },
    { key: "assist", value: astDiff * 1.5 },
    { key: "rebound", value: rebDiff * 1.2 },
    { key: "points", value: ptsDiff * 1 },
    { key: "turnover", value: tovDiff * -1 },
  ].filter((item) => Math.abs(item.value) > 0.0001);
  contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const top = contributions[0]?.key ?? "update";
  const flashLabel =
    top === "rebound"
      ? rebDiff >= 0
        ? "REBOUND!"
        : "REBOUND CORRECTION!"
      : top === "assist"
      ? astDiff >= 0
        ? "ASSIST!"
        : "ASSIST CORRECTION!"
      : top === "steal"
      ? stlDiff >= 0
        ? "STEAL!"
        : "STEAL CORRECTION!"
      : top === "block"
      ? blkDiff >= 0
        ? "BLOCK!"
        : "BLOCK CORRECTION!"
      : top === "turnover"
      ? tovDiff > 0
        ? "TURNOVER!"
        : "TURNOVER FIX!"
      : top === "points"
      ? ptsDiff >= 3
        ? "3-POINTER!"
        : ptsDiff >= 0
        ? "BUCKET!"
        : "SCORING CORRECTION!"
      : fpDelta >= 0
      ? "STAT UPDATE!"
      : "STAT CORRECTION!";

  return { actionLabel, flashLabel, pointsDelta: fpDelta };
}

function SpringPop({
  popKey,
  className,
  glowSize,
  glowColor = "cyan",
  children,
}: {
  popKey: number;
  className?: string;
  glowSize: number;
  glowColor?: "cyan" | "gold" | "green" | "red";
  children: React.ReactNode;
}) {
  const controls = useAnimationControls();

  useEffect(() => {
    let cancelled = false;
    const rgba =
      glowColor === "gold"
        ? "rgba(255,215,0,0.95)"
        : glowColor === "green"
        ? "rgba(34,197,94,0.95)"
        : glowColor === "red"
        ? "rgba(239,68,68,0.95)"
        : "rgba(34,211,238,0.95)";
    const rgbaFade =
      glowColor === "gold"
        ? "rgba(255,215,0,0)"
        : glowColor === "green"
        ? "rgba(34,197,94,0)"
        : glowColor === "red"
        ? "rgba(239,68,68,0)"
        : "rgba(34,211,238,0)";
    const run = async () => {
      await controls.set({ scale: 1, filter: `drop-shadow(0 0 0 ${rgbaFade})` });
      if (cancelled) return;
      await controls.start({
        scale: 1.2,
        filter: `drop-shadow(0 0 ${glowSize}px ${rgba})`,
        transition: { type: "spring", stiffness: 300, damping: 30, mass: 1 },
      });
      if (cancelled) return;
      await controls.start({
        scale: 1,
        filter: `drop-shadow(0 0 0 ${rgbaFade})`,
        transition: { type: "spring", stiffness: 300, damping: 30, mass: 1 },
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [controls, glowColor, glowSize, popKey]);

  return (
    <motion.span animate={controls} className={className}>
      {children}
    </motion.span>
  );
}

function BasketballLoader({ label = "Loading Fantasy..." }: { label?: string }) {
  return <BouncingBallLoader size="md" label={label} />;
}

function PlayerHeadshot({ src, name, sizeClass = "h-7 w-7" }: { src?: string | null; name: string; sizeClass?: string }) {
  return (
    <img
      src={src || FALLBACK_HEADSHOT_SRC}
      alt={`${name} headshot`}
      className={`${sizeClass} rounded-full border border-white/70 bg-slate-200 object-cover shadow-sm`}
      loading="lazy"
      onError={(event) => {
        const target = event.currentTarget;
        if (target.src.endsWith(FALLBACK_HEADSHOT_SRC)) {
          return;
        }
        target.src = FALLBACK_HEADSHOT_SRC;
      }}
    />
  );
}

export function FantasyHome() {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [games, setGames] = useState<FantasyGame[]>([]);
  const [entries, setEntries] = useState<FantasyEntry[]>([]);
  const [selectedSport, setSelectedSport] = useState<FantasySport>("basketball");
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateInput());
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
  const [totalScorePopTone, setTotalScorePopTone] = useState<"gain" | "loss">("gain");
  const [playerPopToneById, setPlayerPopToneById] = useState<Record<string, "gain" | "loss">>({});
  const [lastRealtimeMessageAt, setLastRealtimeMessageAt] = useState<number | null>(null);
  const [isRealtimeFresh, setIsRealtimeFresh] = useState(false);
  const [isEditingRoster, setIsEditingRoster] = useState(false);
  const [sortBy, setSortBy] = useState<"projected" | "alpha" | "position" | "team">("projected");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(25);
  const hasRestoredDraftRef = useRef(false);
  const [isGeofencePaused, setIsGeofencePaused] = useState(false);
  const [geofencePauseReason, setGeofencePauseReason] = useState("");
  const [statFlashes, setStatFlashes] = useState<Array<{ id: string; label: string; pointsDelta: number }>>([]);
  const [statAnimPop, setStatAnimPop] = useState<{ id: number; label: string; delta: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [lastCollectedPoints, setLastCollectedPoints] = useState(0);
  const [isCollectingLive, setIsCollectingLive] = useState(false);
  const syncedLastCollectedRef = useRef<string | false>(false);
  const gameDetailsRequestNonceRef = useRef(0);
  const prevStatsSnapshotRef = useRef<Map<number, StatsSnapshot>>(new Map());
  const statFlashCounterRef = useRef(0);
  const statAnimCounterRef = useRef(0);
  const statFlashTimersRef = useRef<Map<string, number>>(new Map());
  const fantasyKickoffRefreshTimerRef = useRef<number | null>(null);
  const fantasyLineupAutosaveTimerRef = useRef<number | null>(null);
  const fantasyRealtimeFallbackTimerRef = useRef<number | null>(null);
  const fantasyHighlightResetTimerRef = useRef<number | null>(null);
  const geofencePauseRef = useRef(false);
  const todayDate = useMemo(() => getTodayDateInput(), []);
  const requiredLineupSize = FANTASY_LINEUP_SIZE_BY_SPORT[selectedSport] ?? 5;

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  useEffect(() => {
    geofencePauseRef.current = isGeofencePaused;
  }, [isGeofencePaused]);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!venueId || DISABLE_GEOFENCE_FOR_TESTING) {
      setIsGeofencePaused(false);
      setGeofencePauseReason("");
      return;
    }

    let active = true;
    const verify = async () => {
      try {
        const venueResponse = await fetch("/api/venues", { cache: "no-store" });
        const venuePayload = (await venueResponse.json()) as {
          ok?: boolean;
          venues?: Array<{ id: string; latitude: number; longitude: number; radius: number }>;
        };
        const venue = (venuePayload.venues ?? []).find((item) => String(item.id) === venueId);
        if (!venue) {
          return;
        }
        const location = await getCurrentLocation();
        const distance = calculateDistanceMeters(location, {
          latitude: Number(venue.latitude),
          longitude: Number(venue.longitude),
        });
        const allowed = getGeofenceThresholdMeters(Number(venue.radius), location.accuracy);
        if (!active) return;
        const paused = distance > allowed;
        setIsGeofencePaused(paused);
        setGeofencePauseReason(
          paused
            ? `Fantasy scoring paused: you're ${Math.round(distance)}m away (allowed ${Math.round(allowed)}m). Return to venue to resume live scoring.`
            : ""
        );
      } catch {
        // Ignore transient geolocation/network failures.
      }
    };

    void verify();
    const interval = window.setInterval(() => {
      void verify();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [venueId]);

  const loadGames = useCallback(async (date: string) => {
    setLoadingGames(true);
    try {
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
      setGames(payload.games ?? []);
    } catch (error) {
      setGames([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy games.");
    } finally {
      setLoadingGames(false);
    }
  }, []);

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
      setEntries((previous) => {
        const incoming = payload.entries ?? [];
        if (!geofencePauseRef.current) {
          return incoming;
        }
        const previousById = new Map(previous.map((entry) => [entry.id, entry]));
        return incoming.map((entry) => {
          const prior = previousById.get(entry.id);
          if (!prior) return entry;
          if (entry.status === "pending" || entry.status === "live") {
            return {
              ...entry,
              points: prior.points,
              scoreBreakdown: prior.scoreBreakdown,
            };
          }
          return entry;
        });
      });
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

  const pushStatFlash = useCallback((label: string, pointsDelta: number) => {
    statFlashCounterRef.current += 1;
    const id = `flash-${Date.now()}-${statFlashCounterRef.current}`;
    setStatFlashes((prev) => [{ id, label, pointsDelta }, ...prev].slice(0, 3));
    const timer = window.setTimeout(() => {
      statFlashTimersRef.current.delete(id);
      setStatFlashes((prev) => prev.filter((item) => item.id !== id));
    }, 1300);
    statFlashTimersRef.current.set(id, timer);
    statAnimCounterRef.current += 1;
    setStatAnimPop({ id: statAnimCounterRef.current, label, delta: pointsDelta });
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of statFlashTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      statFlashTimersRef.current.clear();
    };
  }, []);

  const triggerTotalScorePop = useCallback((tone: "gain" | "loss" = "gain") => {
    setTotalScorePopTone(tone);
    setTotalScorePopTick((value) => value + 1);
  }, []);

  const triggerPlayerScorePop = useCallback((playerIds: Array<number | string>, tone: "gain" | "loss" = "gain") => {
    const keys = Array.from(new Set(playerIds.map((id) => String(id).trim()).filter(Boolean)));
    if (keys.length === 0) {
      return;
    }
    setPlayerPopToneById((previous) => {
      const next = { ...previous };
      for (const key of keys) {
        next[key] = tone;
      }
      return next;
    });
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

    if (selectedSport !== "basketball") {
      setPlayerPool([]);
      setLeaderboard([]);
      return;
    }

    try {
      const requestNonce = ++gameDetailsRequestNonceRef.current;
      const gameDate = parseDailyGameDateFromId(selectedGameId) ?? selectedDate;

      const makeParams = (gameId: string) => {
        const p = new URLSearchParams({
          gameId,
          date: gameDate,
          tzOffsetMinutes: String(new Date().getTimezoneOffset()),
          _t: String(Date.now()),
          includeStartedGames: "false",
        });
        if (venueId) p.set("venueId", venueId);
        return p.toString();
      };

      const nbaId = `nba-daily-${gameDate}`;
      const wnbaId = `wnba-daily-${gameDate}`;

      const [nbaRes, wnbaRes] = await Promise.all([
        fetch(`/api/fantasy/games?${makeParams(nbaId)}`, { cache: "no-store" }),
        fetch(`/api/fantasy/games?${makeParams(wnbaId)}`, { cache: "no-store" }),
      ]);
      const [nbaPayload, wnbaPayload] = (await Promise.all([nbaRes.json(), wnbaRes.json()])) as [GamesPayload, GamesPayload];

      if (requestNonce !== gameDetailsRequestNonceRef.current) return;

      const seen = new Set<string>();
      const combined: FantasyPlayerPoolItem[] = [];
      for (const item of [...(nbaPayload.playerPool ?? []), ...(wnbaPayload.playerPool ?? [])]) {
        const key = normalizePlayerKey(item.playerName);
        if (key && !seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }

      setPlayerPool(combined);
      setLeaderboard(nbaPayload.leaderboard ?? []);

      setSelectedPlayers((current) => {
        const poolKeys = new Set(combined.map((item) => item.playerName));
        return current.filter((name) => poolKeys.has(name));
      });
    } catch (error) {
      setPlayerPool([]);
      setLeaderboard([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy player pool.");
    }
  }, [selectedGameId, selectedDate, selectedSport, venueId]);

  useEffect(() => {
    setSelectedPlayers([]);
    setPlayerPool([]);
    setLeaderboard([]);
    setSortBy("projected");
    setFilterPosition("all");
    setFilterTeam("all");
    setVisibleCount(25);
    hasRestoredDraftRef.current = false;
  }, [selectedGameId]);

  useEffect(() => {
    setVisibleCount(25);
  }, [sortBy, filterPosition, filterTeam]);

  useEffect(() => {
    void loadGames(selectedDate);
  }, [loadGames, selectedDate]);

  // Derive selectedGameId from sport + date + available games
  useEffect(() => {
    if (selectedSport === "basketball") {
      const hasNba = games.some((g) => g.league === "NBA");
      const hasWnba = games.some((g) => g.league === "WNBA");
      const id = !hasNba && hasWnba ? `wnba-daily-${selectedDate}` : `nba-daily-${selectedDate}`;
      setSelectedGameId(id);
    }
  }, [selectedSport, selectedDate, games]);

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
    () =>
      entries.find((entry) => {
        if (selectedSport === "basketball") {
          return parseDailyGameDateFromId(entry.gameId) === selectedDate;
        }
        return entry.gameId === selectedGameId;
      }),
    [entries, selectedGameId, selectedSport, selectedDate]
  );
  const playerPoolKeys = useMemo(
    () => new Set(playerPool.map((item) => normalizePlayerKey(item.playerName)).filter(Boolean)),
    [playerPool]
  );
  const playerPoolHeadshotByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of playerPool) {
      const key = normalizePlayerKey(item.playerName);
      const src = String(item.headshotUrl ?? "").trim();
      if (!key || !src || map.has(key)) {
        continue;
      }
      map.set(key, src);
    }
    return map;
  }, [playerPool]);
  const canEditExistingEntryLineup = useMemo(() => {
    if (!existingEntryForSelectedGame) {
      return false;
    }
    if (existingEntryForSelectedGame.status === "canceled" || existingEntryForSelectedGame.status === "final") {
      return false;
    }
    return !existingEntryForSelectedGame.lineup.some((playerName) => !playerPoolKeys.has(normalizePlayerKey(playerName)));
  }, [existingEntryForSelectedGame, playerPoolKeys]);

  // Persist in-progress draft to localStorage on every selection change
  useEffect(() => {
    if (!userId || !selectedGameId || !hasStartedGame || existingEntryForSelectedGame) return;
    const key = `fantasy_draft_${userId}_${selectedGameId}`;
    try {
      if (selectedPlayers.length > 0) {
        localStorage.setItem(key, JSON.stringify(selectedPlayers));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore storage quota or permission errors
    }
  }, [selectedPlayers, userId, selectedGameId, hasStartedGame, existingEntryForSelectedGame]);

  // Restore draft from localStorage once the player pool loads
  useEffect(() => {
    if (hasRestoredDraftRef.current) return;
    if (!hasStartedGame || !userId || !selectedGameId || existingEntryForSelectedGame) return;
    if (playerPool.length === 0) return;
    const key = `fantasy_draft_${userId}_${selectedGameId}`;
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return;
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const valid = (parsed as string[]).filter(
        (name) => typeof name === "string" && playerPoolKeys.has(normalizePlayerKey(name))
      );
      if (valid.length > 0) {
        setSelectedPlayers(valid.slice(0, requiredLineupSize));
        setHasLocalLineupDraft(true);
      }
    } catch {
      // ignore parse or storage errors
    }
    hasRestoredDraftRef.current = true;
  }, [hasStartedGame, userId, selectedGameId, existingEntryForSelectedGame, playerPool, playerPoolKeys, requiredLineupSize]);

  const sportGames = useMemo(
    () =>
      selectedSport === "basketball"
        ? games.filter((g) => g.league === "NBA" || g.league === "WNBA")
        : [],
    [games, selectedSport]
  );
  const nextUnlockedGame = useMemo(() => sportGames.find((game) => !game.isLocked) ?? null, [sportGames]);
  const liveDebugTargetGame = useMemo(() => {
    const liveGames = sportGames.filter((game) => game.status === "live");
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
  const selectedSlateDate = selectedDate;
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
      entries.some((entry) => {
        if (selectedSport === "basketball") {
          return (
            parseDailyGameDateFromId(entry.gameId) === selectedDate &&
            (entry.status === "pending" || entry.status === "live")
          );
        }
        return entry.gameId === selectedGameId && (entry.status === "pending" || entry.status === "live");
      }),
    [entries, selectedGameId, selectedSport, selectedDate]
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
  const hasPreviousUnclaimedFantasyEntries = useMemo(
    () =>
      entries.some((entry) => {
        if (entry.status !== "final" || entry.rewardClaimedAt || computeFantasyClaimablePoints(entry) <= 0) {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        if (!entryDateKey) {
          return false;
        }
        return entryDateKey < selectedSlateDate;
      }),
    [entries, selectedSlateDate]
  );
  const hasCurrentUnclaimedFantasyEntries = useMemo(
    () =>
      entries.some((entry) => {
        if (entry.status !== "final" || entry.rewardClaimedAt || computeFantasyClaimablePoints(entry) <= 0) {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        if (!entryDateKey) {
          return false;
        }
        return entryDateKey === selectedSlateDate;
      }),
    [entries, selectedSlateDate]
  );
  const hasFutureUnclaimedFantasyEntries = useMemo(
    () =>
      entries.some((entry) => {
        if (entry.status !== "final" || entry.rewardClaimedAt || computeFantasyClaimablePoints(entry) <= 0) {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        if (!entryDateKey) {
          return false;
        }
        return entryDateKey > selectedSlateDate;
      }),
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

  // Sync lastCollectedPoints from entry once on first load or entry change (server-authoritative baseline)
  useEffect(() => {
    if (!trackedEntry) return;
    if (!syncedLastCollectedRef.current || trackedEntry.id !== syncedLastCollectedRef.current) {
      syncedLastCollectedRef.current = trackedEntry.id;
      setLastCollectedPoints(Math.max(0, trackedEntry.liveCollectedPoints ?? 0));
    }
  }, [trackedEntry]);

  const uncollectedPoints = useMemo(
    () => (trackedEntry && !showTrackedEntryClaimButton ? Math.max(0, liveTrackedEntryPoints - lastCollectedPoints) : 0),
    [lastCollectedPoints, liveTrackedEntryPoints, showTrackedEntryClaimButton, trackedEntry]
  );

  const collectLivePoints = useCallback(async () => {
    if (!trackedEntry || isCollectingLive || uncollectedPoints <= 0 || isGeofencePaused) return;
    setIsCollectingLive(true);
    try {
      const res = await fetch("/api/fantasy/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect-live", userId, entryId: trackedEntry.id }),
      });
      const data = (await res.json()) as { ok: boolean; result?: { platformPointsAwarded: number }; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Collection failed");
      const awarded = data.result?.platformPointsAwarded ?? 0;
      setLastCollectedPoints((prev) => prev + awarded);
      if (awarded > 0) {
        window.dispatchEvent(new CustomEvent("tp:coin-flight", { detail: { delta: awarded } }));
        window.dispatchEvent(new CustomEvent("tp:points-updated", { detail: { source: "fantasy-live-collect", delta: awarded } }));
        window.dispatchEvent(new CustomEvent("tp:success-particles"));
        setStatusMessage(`+${awarded} pts collected!`);
        window.setTimeout(() => setStatusMessage(""), 2500);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to collect points.");
      window.setTimeout(() => setErrorMessage(""), 3000);
    } finally {
      setIsCollectingLive(false);
    }
  }, [isCollectingLive, isGeofencePaused, trackedEntry, uncollectedPoints, userId]);

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
    setIsEditingRoster(false);
  }, [selectedGameId]);

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
                if (geofencePauseRef.current && (nextEntry.status === "pending" || nextEntry.status === "live")) {
                  return previous;
                }
                const nextLineupPlayers =
                  nextEntry.lineupPlayers.length > 0
                    ? nextEntry.lineupPlayers
                    : nextEntry.lineup.map((playerName, index) => ({ playerId: -(index + 1), playerName }));
                const changedPlayers = nextLineupPlayers
                  .filter((player) => {
                  const before = getScoreFromBreakdown(previousEntry.scoreBreakdown, player);
                  const after = getScoreFromBreakdown(nextEntry.scoreBreakdown, player);
                  return after - before >= 0.01;
                })
                  .map((player) => player.playerId);
                if (changedPlayers.length > 0) {
                  window.requestAnimationFrame(() => {
                    markPlayersAsHot(changedPlayers);
                    triggerPlayerScorePop(changedPlayers);
                  });
                }
                if (Number(nextEntry.points ?? 0) - Number(previousEntry.points ?? 0) >= 0.01 || changedPlayers.length > 0) {
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

  // Refs so the live_player_stats subscription can read fresh values without re-subscribing.
  const liveDebugTargetGameIdRef = useRef<string | null>(null);
  liveDebugTargetGameIdRef.current = liveDebugTargetGame?.id ?? null;

  const trackedEntryPlayerIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const ids = (trackedEntry?.lineupPlayers ?? [])
      .filter((p) => p.playerId > 0)
      .map((p) => p.playerId);
    trackedEntryPlayerIdsRef.current = new Set(ids);
  }, [trackedEntry]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;

    const channel = client
      .channel("live-player-stats-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_player_stats" },
        (payload) => {
          if (!active) return;
          if (geofencePauseRef.current) return;
          const row = (payload.new ?? null) as LiveStatsRealtimeRow | null;
          if (!row) return;

          const gameId = String(row.game_id ?? "").trim();
          const playerId = Number(row.player_id ?? 0);
          if (!Number.isFinite(playerId) || playerId <= 0) return;

          // Only process rows for the tracked live game or the user's roster players.
          const isTrackedGame = liveDebugTargetGameIdRef.current && gameId === liveDebugTargetGameIdRef.current;
          const isRosterPlayer = trackedEntryPlayerIdsRef.current.has(playerId);
          if (!isTrackedGame && !isRosterPlayer) return;

          const nextSnapshot: StatsSnapshot = {
            pts: Number(row.pts ?? 0),
            ast: Number(row.ast ?? 0),
            reb: Number(row.reb ?? 0),
            stl: Number(row.stl ?? 0),
            blk: Number(row.blk ?? 0),
            turnovers: Number(row.turnovers ?? 0),
            total_fantasy_points: Number(row.total_fantasy_points ?? 0),
          };

          const prevSnapshot = prevStatsSnapshotRef.current.get(playerId);
          prevStatsSnapshotRef.current.set(playerId, nextSnapshot);

          // No baseline yet — store snapshot but don't generate a ledger entry.
          if (!prevSnapshot) return;

          const change = describeStatChange(prevSnapshot, nextSnapshot);
          if (!change) return;

          // Trigger pop on roster players only.
          if (isRosterPlayer) {
            const tone = change.pointsDelta >= 0 ? "gain" : "loss";
            window.requestAnimationFrame(() => {
              markPlayersAsHot([playerId]);
              triggerPlayerScorePop([playerId], tone);
              triggerTotalScorePop(tone);
            });
            pushStatFlash(change.flashLabel, change.pointsDelta);
          }

          setLastRealtimeMessageAt(Date.now());
        }
      )
      .subscribe();

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [markPlayersAsHot, pushStatFlash, triggerPlayerScorePop, triggerTotalScorePop]);

  useEffect(() => {
    if (!userId || supabase) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadEntries(true, false);
      void loadSelectedGameDetails();
      void loadGames(selectedDate);
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadEntries, loadGames, loadSelectedGameDetails, selectedDate, userId, supabase]);

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
      void loadGames(selectedDate);
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
      if (current.length >= requiredLineupSize) {
        return current;
      }
      return [...current, playerName];
    });
  }, [requiredLineupSize]);

  const removeSelectedPlayer = useCallback((playerName: string) => {
    setHasLocalLineupDraft(true);
    setSelectedPlayers((current) => current.filter((name) => name !== playerName));
  }, []);

  const navigateToPrevDay = useCallback(() => {
    setSelectedDate((prev) => {
      const d = new Date(`${prev}T00:00:00`);
      d.setDate(d.getDate() - 1);
      return toLocalDateInput(d);
    });
    setHasStartedGame(false);
    setSelectedPlayers([]);
  }, []);

  const navigateToNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      if (prev >= todayDate) return prev;
      const d = new Date(`${prev}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return toLocalDateInput(d);
    });
    setHasStartedGame(false);
    setSelectedPlayers([]);
  }, [todayDate]);

  const persistLineup = useCallback(async (lineup: string[]) => {
    if (!userId || !venueId || !selectedGameId || lineup.length !== requiredLineupSize) {
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
  }, [existingEntryForSelectedGame, loadEntries, loadSelectedGameDetails, requiredLineupSize, selectedGameId, userId, venueId]);

  useEffect(() => {
    if (!(selectedGameId && hasResolvedEntries && ((hasStartedGame && !existingEntryForSelectedGame) || canEditExistingEntryLineup))) {
      return;
    }

    if (!hasLocalLineupDraft) {
      return;
    }

    if (selectedPlayers.length !== requiredLineupSize) {
      setStatusMessage(
        selectedPlayers.length === 0
          ? `Tap players to build your roster. Saves happen automatically at ${requiredLineupSize} selections.`
          : `Select ${requiredLineupSize - selectedPlayers.length} more player${requiredLineupSize - selectedPlayers.length === 1 ? "" : "s"} to auto-save.`
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
    requiredLineupSize,
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
  const selectedPlayerKeySet = useMemo(
    () => new Set(selectedPlayers.map((name) => normalizePlayerKey(name))),
    [selectedPlayers]
  );
  const availablePlayerPool = useMemo(
    () => playerPool.filter((item) => !selectedPlayerKeySet.has(normalizePlayerKey(item.playerName))),
    [playerPool, selectedPlayerKeySet]
  );

  const CANONICAL_POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

  const uniqueTeams = useMemo(
    () =>
      Array.from(new Set(availablePlayerPool.map((item) => item.team).filter((t): t is string => Boolean(t)))).sort(),
    [availablePlayerPool]
  );

  const sortedFilteredPool = useMemo(() => {
    let pool = availablePlayerPool;
    if (filterPosition !== "all") {
      pool = pool.filter((item) => item.position === filterPosition);
    }
    if (filterTeam !== "all") {
      pool = pool.filter((item) => item.team === filterTeam);
    }
    return [...pool].sort((a, b) => {
      if (sortBy === "alpha") {
        return a.playerName.localeCompare(b.playerName);
      }
      if (sortBy === "position") {
        const order: string[] = ["PG", "SG", "SF", "PF", "C"];
        const posA = a.position ?? "ZZZ";
        const posB = b.position ?? "ZZZ";
        const ai = order.indexOf(posA);
        const bi = order.indexOf(posB);
        const posCompare = ai !== -1 && bi !== -1 ? ai - bi : posA.localeCompare(posB);
        if (posCompare !== 0) return posCompare;
        return (b.projectedLine ?? -1) - (a.projectedLine ?? -1);
      }
      if (sortBy === "team") {
        const teamA = a.team ?? "ZZZ";
        const teamB = b.team ?? "ZZZ";
        if (teamA !== teamB) return teamA.localeCompare(teamB);
        return (b.projectedLine ?? -1) - (a.projectedLine ?? -1);
      }
      // "projected" — null/0 sink to bottom
      const projA = a.projectedLine ?? -1;
      const projB = b.projectedLine ?? -1;
      return projB - projA;
    });
  }, [availablePlayerPool, sortBy, filterPosition, filterTeam]);

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

  if (loadingGames && loadingEntries) {
    return (
      <div className="space-y-4">
        <BasketballLoader label="Syncing today's games and rosters..." />
      </div>
    );
  }

  const isToday = selectedDate === todayDate;
  const showGameStart =
    selectedSport === "basketball" &&
    selectedGameId &&
    hasResolvedEntries &&
    !hasActiveDraftedEntry &&
    !existingEntryForSelectedGame &&
    !hasStartedGame;
  const showLineupBuilder =
    selectedSport === "basketball" &&
    selectedGameId &&
    hasResolvedEntries &&
    ((hasStartedGame && !existingEntryForSelectedGame) || (canEditExistingEntryLineup && isEditingRoster));

  return (
    <div className="tp-fantasy-compact min-h-[100dvh] touch-pan-y space-y-3">
      {/* Stat flash toasts */}
      <div className="pointer-events-none fixed left-1/2 top-[5.25rem] z-[2200] -translate-x-1/2 space-y-2">
        <AnimatePresence initial={false}>
          {statFlashes.map((flash) => (
            <motion.div
              key={flash.id}
              initial={{ opacity: 0, y: -18, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1.05 }}
              exit={{ opacity: 0, y: -22, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 340, damping: 26, mass: 0.8 }}
              className={`rounded-full border px-4 py-1.5 text-sm font-black shadow-[0_8px_24px_rgba(15,23,42,0.35)] ${
                flash.pointsDelta >= 0
                  ? "border-emerald-300 bg-emerald-100/95 text-emerald-900"
                  : "border-rose-300 bg-rose-100/95 text-rose-900"
              }`}
            >
              {flash.label} {flash.pointsDelta >= 0 ? "+" : ""}
              {flash.pointsDelta.toFixed(1)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Full-screen stat pop animation portal */}
      {isMounted && statAnimPop
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[7000] flex flex-col items-center justify-center gap-3">
              <motion.span
                key={statAnimPop.id}
                className="select-none whitespace-nowrap font-black leading-none transform-gpu will-change-transform"
                style={{
                  color: statAnimPop.delta >= 0 ? "#22c55e" : "#ef4444",
                  fontSize: "clamp(2.6rem, 12vw, 5.5rem)",
                  textShadow:
                    statAnimPop.delta >= 0
                      ? "0 0 60px rgba(34,197,94,0.55), 0 0 120px rgba(34,197,94,0.3)"
                      : "0 0 60px rgba(239,68,68,0.55), 0 0 120px rgba(239,68,68,0.3)",
                }}
                initial={{ scale: 0, y: 0, opacity: 0 }}
                animate={{
                  scale: [0, 1.55, 1.2, 1.2, 0.85],
                  y: [0, -30, -30, -30, 320],
                  rotate: [0, 0, 0, 0, 12],
                  opacity: [0, 1, 1, 1, 0],
                }}
                transition={{
                  duration: 0.85,
                  times: [0, 0.13, 0.22, 0.62, 1],
                  ease: ["easeOut", "easeOut", "linear", "easeIn"],
                }}
                onAnimationComplete={() => setStatAnimPop(null)}
              >
                {statAnimPop.label}
              </motion.span>
              <motion.span
                key={`delta-${statAnimPop.id}`}
                className="select-none font-black leading-none transform-gpu will-change-transform"
                style={{
                  color: statAnimPop.delta >= 0 ? "#86efac" : "#fca5a5",
                  fontSize: "clamp(1.6rem, 7vw, 3rem)",
                  textShadow:
                    statAnimPop.delta >= 0
                      ? "0 0 24px rgba(34,197,94,0.6)"
                      : "0 0 24px rgba(239,68,68,0.6)",
                }}
                initial={{ scale: 0, opacity: 0, y: 10 }}
                animate={{
                  scale: [0, 1.2, 1.0, 1.0, 0.8],
                  y: [10, -20, -20, -20, 330],
                  opacity: [0, 1, 1, 1, 0],
                }}
                transition={{
                  duration: 0.85,
                  times: [0, 0.15, 0.25, 0.62, 1],
                  ease: ["easeOut", "easeOut", "linear", "easeIn"],
                  delay: 0.05,
                }}
              >
                {statAnimPop.delta >= 0 ? "+" : ""}{statAnimPop.delta.toFixed(1)} pts
              </motion.span>
            </div>,
            document.body
          )
        : null}

      {/* Page title */}
      <h1 className="px-1 text-xl font-black tracking-tight text-slate-900">Hightop Fantasy Sports</h1>

      {/* Top section — date nav, sport scroll, roster tracker */}
      <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-3 shadow-sm">

        {/* Date nav pill */}
        <div className="flex w-full items-center justify-between rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-2 py-1.5">
          <button
            type="button"
            onClick={navigateToPrevDay}
            className="tp-clean-button relative flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/15 active:scale-90"
            aria-label="Previous day"
          >
            ◀
            {hasPreviousUnclaimedFantasyEntries && !hasCurrentUnclaimedFantasyEntries ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white">
                !
              </span>
            ) : null}
          </button>
          <span className="text-sm font-bold text-white">{formatDateLabel(selectedDate, todayDate)}</span>
          <button
            type="button"
            onClick={navigateToNextDay}
            disabled={isToday}
            className="tp-clean-button relative flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/15 active:scale-90 disabled:opacity-30"
            aria-label="Next day"
          >
            ▶
            {hasFutureUnclaimedFantasyEntries && !hasCurrentUnclaimedFantasyEntries ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-none text-white">
                !
              </span>
            ) : null}
          </button>
        </div>

        {/* Sport scroll */}
        <div className="mt-4 w-full touch-pan-x overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
          <div className="inline-flex w-max min-w-full justify-center gap-3 pr-1">
            {FANTASY_SPORTS.map((sport) => (
              <button
                key={sport.key}
                type="button"
                disabled={!sport.available}
                onClick={() => sport.available && setSelectedSport(sport.key)}
                className={`tp-clean-button flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-2 text-[3.25rem] leading-none transition-all ${
                  selectedSport === sport.key
                    ? "border-indigo-700 bg-indigo-600 shadow-sm"
                    : sport.available
                    ? "border-slate-300 bg-white hover:border-indigo-300"
                    : "border-slate-200 bg-slate-100 opacity-40"
                }`}
                title={sport.available ? sport.key : `${sport.key} — coming soon`}
              >
                {sport.icon}
              </button>
            ))}
          </div>
        </div>

        {/* Roster tracker pips */}
        <div className="mt-3 flex items-center gap-2">
          <p className="text-[11px] font-semibold text-slate-500">Roster</p>
          <div className="flex flex-1 gap-1">
            {Array.from({ length: requiredLineupSize }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  i < selectedPlayers.length ? "bg-indigo-600" : "bg-indigo-200"
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] font-semibold text-slate-500">
            {selectedPlayers.length}/{requiredLineupSize}
          </p>
        </div>

      </section>

      {/* Sticky action row */}
      <div className="sticky top-0 z-30 mb-1 flex w-full items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (venueId) {
              void navigateBackToVenue({
                venuePath: `/venue/${encodeURIComponent(venueId)}`,
                fallbackNavigate: () => { window.location.href = `/venue/${encodeURIComponent(venueId)}`; },
              });
            }
          }}
          className="tp-clean-button flex flex-1 items-center justify-center gap-1 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] py-2 text-sm font-bold text-white shadow-sm active:scale-95"
        >
          ← Back to Venue
        </button>
        <button
          type="button"
          data-fantasy-collect-all
          onClick={() => void collectAllFantasyEntries()}
          disabled={finalUnclaimedEntries.length === 0 || isCollectingAllFantasy}
          className="tp-clean-button flex flex-1 items-center justify-center gap-1 rounded-full border border-[#3a1c72] bg-gradient-to-r from-[#5b2ca5] via-[#7b3fd6] to-[#8f4de8] py-2 text-sm font-bold text-white shadow-sm active:scale-95 disabled:opacity-40"
        >
          {isCollectingAllFantasy
            ? "Collecting..."
            : finalUnclaimedEntries.length > 0
            ? `Collect ${totalUnclaimedFantasyPoints} pts`
            : "Collect Points"}
        </button>
      </div>

      <VenueEntryRulesPanel gameKey="fantasy" shouldDisplay={entries.length === 0} />

      {isGeofencePaused ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {geofencePauseReason || "Fantasy scoring is paused while outside the venue geofence."}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          {statusMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
          {errorMessage}
        </p>
      ) : null}

      {/* "Coming soon" for non-basketball sports */}
      {selectedSport !== "basketball" ? (
        <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-4 shadow-sm">
          <p className="text-center text-sm font-semibold text-slate-600">
            {selectedSport === "baseball" ? "⚾" : "🏈"} {selectedSport.charAt(0).toUpperCase() + selectedSport.slice(1)} fantasy is coming soon!
          </p>
        </section>
      ) : null}

      {/* Team tracker for live/pending entry */}
      {selectedSport === "basketball" && trackedEntry ? (
        <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Your Team Tracker</h3>
            {existingEntryForSelectedGame ? (
              canEditExistingEntryLineup ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isEditingRoster) {
                      setHasLocalLineupDraft(true);
                    } else {
                      setIsEditingRoster(true);
                    }
                  }}
                  className="tp-clean-button rounded-lg border border-indigo-500 bg-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-900"
                >
                  {isEditingRoster ? "Submit Roster" : "Edit Roster"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="tp-clean-button cursor-not-allowed rounded-lg border border-slate-400 bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 opacity-90"
                >
                  Roster Locked
                </button>
              )
            ) : null}
          </div>
          <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{showTrackedEntryClaimButton ? "Final Score" : "Live Points"}</p>
              <SpringPop
                popKey={totalScorePopTick}
                glowSize={12}
                glowColor={totalScorePopTone === "loss" ? "red" : "green"}
              >
                <p
                  className={`text-sm font-black ${
                    totalScorePopTone === "loss"
                      ? "text-rose-700"
                      : isRealtimeFresh
                      ? "text-emerald-700"
                      : "text-slate-900"
                  }`}
                >
                  {liveTrackedEntryPoints.toFixed(2)} pts
                </p>
              </SpringPop>
            </div>
            <ul className="mt-2 space-y-1">
              {(
                isEditingRoster && canEditExistingEntryLineup && existingEntryForSelectedGame
                  ? selectedPlayers.map((playerName, index) => ({
                      playerId: -(index + 1),
                      playerName,
                      headshotUrl: playerPoolHeadshotByName.get(normalizePlayerKey(playerName)) ?? null,
                    }))
                  : trackedEntry.lineupPlayers.length > 0
                  ? trackedEntry.lineupPlayers
                  : trackedEntry.lineup.map((playerName, index) => ({
                      playerId: -(index + 1),
                      playerName,
                      headshotUrl: playerPoolHeadshotByName.get(normalizePlayerKey(playerName)) ?? null,
                    }))
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
                const popTone = playerPopToneById[String(player.playerId)] ?? "gain";
                return (
                  <li
                    key={`${trackedEntry.id}-${player.playerId}`}
                    className={`flex items-center justify-between gap-2 text-xs transition-all duration-300 ${
                      isHot
                        ? popTone === "loss"
                          ? "scale-[1.03] text-rose-300 drop-shadow-[0_0_10px_rgba(244,63,94,0.95)]"
                          : "scale-[1.03] text-emerald-300 drop-shadow-[0_0_10px_rgba(34,197,94,0.95)]"
                        : "text-slate-700"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {isEditingRoster && canEditExistingEntryLineup && existingEntryForSelectedGame ? (
                        <button
                          type="button"
                          onClick={() => removeSelectedPlayer(playerName)}
                          className="tp-clean-button inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-rose-600 bg-rose-600 text-[10px] font-black leading-none text-white"
                          aria-label={`Remove ${playerName}`}
                        >
                          -
                        </button>
                      ) : null}
                      <PlayerHeadshot src={player.headshotUrl ?? null} name={playerName} sizeClass="h-9 w-9" />
                      <span className="truncate text-sm font-semibold text-slate-800">{playerName}</span>
                    </div>
                    <SpringPop
                      popKey={playerPopTickById[String(player.playerId)] ?? 0}
                      glowSize={10}
                      glowColor={popTone === "loss" ? "red" : "green"}
                      className={`text-sm font-bold ${isHot ? (popTone === "loss" ? "text-rose-200" : "text-emerald-200") : ""}`}
                    >
                      {playerPoints.toFixed(2)} pts
                    </SpringPop>
                  </li>
                );
              })}
            </ul>
          </div>
          {showTrackedEntryClaimButton ? (
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                void claimReward(trackedEntry, rect);
              }}
              disabled={claimingEntryId === trackedEntry.id}
              className="tp-clean-button mt-3 w-full rounded-lg border border-emerald-500 bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-60"
            >
              {claimingEntryId === trackedEntry.id ? "Collecting..." : `Collect ${trackedEntryClaimablePoints} Points`}
            </button>
          ) : hasLiveEntry ? (
            <>
              <p className="mt-2 text-[11px] font-semibold text-emerald-800">Live game detected. Streaming realtime updates.</p>
              {uncollectedPoints > 0 ? (
                <button
                  type="button"
                  onClick={() => void collectLivePoints()}
                  disabled={isCollectingLive || isGeofencePaused}
                  className="tp-clean-button mt-2 w-full rounded-lg border border-amber-500 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
                >
                  {isCollectingLive
                    ? "Collecting..."
                    : isGeofencePaused
                    ? "Must be at venue to collect"
                    : `Collect ${uncollectedPoints.toFixed(1)} Live Pts`}
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-[11px] text-slate-600">No live game right now. Automatic updates will resume when your next game starts.</p>
          )}
        </section>
      ) : null}

      {/* Completed games with unclaimed points */}
      {selectedSport === "basketball" && finalUnclaimedEntries.length > 1 ? (
        <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Completed Games Ready To Collect</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-700">
            Finalized rosters stay here until you collect points.
          </p>
          <div className="mt-3 space-y-2">
            {finalUnclaimedEntries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-indigo-200 bg-white px-3 py-2">
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
                    className="tp-clean-button rounded-lg border border-indigo-500 bg-indigo-100 px-2.5 py-1.5 text-xs font-semibold text-indigo-900 disabled:opacity-60"
                  >
                    {claimingEntryId === entry.id ? "Collecting..." : `Collect ${computeFantasyClaimablePoints(entry)} Points`}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Game Start card */}
      {showGameStart ? (
        <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-indigo-700">Game Start</p>
          {sportGames.length > 0 ? (
            <p className="mt-1 text-sm text-slate-700">
              {sportGames[0] ? formatLocalDateTime(sportGames[0].startsAt) : null}
            </p>
          ) : null}
          {sportGames.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600">No basketball games scheduled for this day.</p>
          ) : null}
          {sportGames.length > 0 ? (
            <button
              type="button"
              onClick={() => setHasStartedGame(true)}
              className="tp-clean-button mt-3 w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-[#5b2ca5] via-[#7b3fd6] to-[#8f4de8] px-3 py-3 text-sm font-bold text-white shadow-sm active:scale-95"
            >
              Draft your roster
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Lineup Builder */}
      {showLineupBuilder ? (
        <section className="rounded-2xl border border-indigo-200/70 bg-indigo-50/85 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {existingEntryForSelectedGame ? "Update Lineup" : "Lineup Builder"}
            </h3>
            <div className="text-xs font-semibold text-slate-700">
              {selectedPlayers.length}/{requiredLineupSize} selected
            </div>
          </div>

          {/* Scoring reference */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Scoring System</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-slate-600">Points</span><span className="text-right font-semibold text-slate-900">+1.0</span>
              <span className="text-slate-600">Rebounds</span><span className="text-right font-semibold text-slate-900">+1.2</span>
              <span className="text-slate-600">Assists</span><span className="text-right font-semibold text-slate-900">+1.5</span>
              <span className="text-slate-600">Steals</span><span className="text-right font-semibold text-slate-900">+3.0</span>
              <span className="text-slate-600">Blocks</span><span className="text-right font-semibold text-slate-900">+3.0</span>
              <span className="text-slate-600">Turnovers</span><span className="text-right font-semibold text-rose-700">-1.0</span>
            </div>
          </div>

          {/* ── Live Roster Preview ── */}
          <div className="mt-3 rounded-xl border border-indigo-300 bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-indigo-700">
                My Roster
              </p>
              {submitting ? (
                <span className="text-[10px] font-semibold text-slate-500">Saving…</span>
              ) : selectedPlayers.length === requiredLineupSize ? (
                <span className="text-[10px] font-bold text-emerald-700">Auto-saved ✓</span>
              ) : (
                <span className="text-[10px] text-slate-400">
                  {requiredLineupSize - selectedPlayers.length} more to auto-save
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-2">
              {selectedPlayers.map((name) => {
                const poolItem = playerPool.find((item) => normalizePlayerKey(item.playerName) === normalizePlayerKey(name));
                return (
                  <li key={name} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => removeSelectedPlayer(name)}
                        className="tp-clean-button inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-500 bg-rose-500 text-[12px] font-black leading-none text-white active:scale-90"
                        aria-label={`Remove ${name}`}
                      >
                        −
                      </button>
                      <PlayerHeadshot
                        src={playerPoolHeadshotByName.get(normalizePlayerKey(name)) ?? null}
                        name={name}
                        sizeClass="h-7 w-7"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
                        {(poolItem?.position || poolItem?.team) ? (
                          <p className="text-[10px] text-slate-500">
                            {[poolItem.position, poolItem.team].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {(() => {
                      const rosterProj =
                        poolItem?.projectedLine !== null && poolItem?.projectedLine !== undefined
                          ? Math.round(Number(poolItem.projectedLine))
                          : 0;
                      return (
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${
                            rosterProj > 0
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-slate-50 text-slate-400"
                          }`}
                        >
                          {rosterProj} proj
                        </span>
                      );
                    })()}
                  </li>
                );
              })}
              {Array.from({ length: requiredLineupSize - selectedPlayers.length }).map((_, i) => (
                <li key={`empty-${i}`} className="flex items-center gap-2 opacity-40">
                  <div className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-400" />
                  <span className="text-xs text-slate-500">Pick a player below…</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Sort + Filter controls ── */}
          <div className="mt-3 space-y-2">
            {/* Sort toggles */}
            <div className="flex flex-wrap gap-1.5">
              {(["projected", "alpha", "position", "team"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortBy(mode)}
                  className={`tp-clean-button rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                    sortBy === mode
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
                  }`}
                >
                  {mode === "projected" ? "Best Proj" : mode === "alpha" ? "A–Z" : mode === "position" ? "Position" : "Team"}
                </button>
              ))}
            </div>
            {/* Dropdowns row */}
            <div className="flex gap-2">
              <select
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="all">All Positions</option>
                {CANONICAL_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="all">All Teams</option>
                {uniqueTeams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Player pool ── */}
          {availablePlayerPool.length === 0 ? (
            <div className="mt-3">
              {sportGames.length > 0 ? (
                <BasketballLoader label="Loading today's eligible players…" />
              ) : (
                <p className="text-sm text-slate-600">No players available for this date.</p>
              )}
            </div>
          ) : sortedFilteredPool.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No players match the current filter.</p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sortedFilteredPool.slice(0, visibleCount).map((item) => {
                  const isSelected = selectedPlayerKeySet.has(normalizePlayerKey(item.playerName));
                  const isFull = selectedPlayers.length >= requiredLineupSize;
                  return (
                    <button
                      key={item.playerName}
                      type="button"
                      disabled={isFull && !isSelected}
                      onClick={() => togglePlayer(item.playerName)}
                      className={`tp-clean-button rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-indigo-200 bg-white/90 hover:border-indigo-400 active:bg-indigo-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <PlayerHeadshot
                          src={item.headshotUrl || FALLBACK_HEADSHOT_SRC}
                          name={item.playerName}
                          sizeClass="h-9 w-9 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{item.playerName}</p>
                          {(item.position || item.team) ? (
                            <p className="text-[10px] font-semibold text-slate-500">
                              {[item.position, item.team].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          {(() => {
                            const displayProjection =
                              item.projectedLine !== null && item.projectedLine !== undefined
                                ? Math.round(Number(item.projectedLine))
                                : 0;
                            return (
                              <span
                                className={`text-sm font-black tabular-nums ${
                                  isSelected
                                    ? "text-emerald-700"
                                    : displayProjection > 0
                                    ? "text-indigo-700"
                                    : "text-slate-400"
                                }`}
                              >
                                {displayProjection}
                              </span>
                            );
                          })()}
                          {isSelected ? (
                            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-800">
                              Added
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Load More */}
              {visibleCount < sortedFilteredPool.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + 25)}
                  className="tp-clean-button mt-3 w-full rounded-lg border border-indigo-200 bg-white py-2 text-xs font-semibold text-indigo-700 hover:border-indigo-400 active:bg-indigo-50"
                >
                  Load more · {sortedFilteredPool.length - visibleCount} remaining
                </button>
              ) : null}
            </>
          )}

          {submitting ? (
            <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-700">Saving lineup…</p>
          ) : null}
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
