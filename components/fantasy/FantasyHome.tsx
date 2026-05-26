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
  mlbDailyGameId?: string;
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
  sport_key?: string;
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

type FantasySport = "nba" | "wnba" | "baseball" | "football";
const FANTASY_SPORTS: Array<{ key: FantasySport; icon: string; available: boolean }> = [
  { key: "nba", icon: "NBA", available: true },
  { key: "wnba", icon: "WNBA", available: true },
  { key: "baseball", icon: "⚾", available: true },
  { key: "football", icon: "🏈", available: false },
];
const FANTASY_LINEUP_SIZE_BY_SPORT: Record<FantasySport, number> = {
  nba: 5,
  wnba: 5,
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
  if (trimmed.startsWith("mlb-daily-")) {
    const rawDate = trimmed.slice("mlb-daily-".length).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
  }
  return null;
}

function getGameIdForSportDate(sport: FantasySport, date: string): string {
  if (sport === "nba") {
    return `nba-daily-${date}`;
  }
  if (sport === "wnba") {
    return `wnba-daily-${date}`;
  }
  if (sport === "baseball") {
    return `mlb-daily-${date}`;
  }
  return "";
}

function getEntrySportKeyForFantasySport(sport: FantasySport): string | null {
  if (sport === "nba") {
    return "basketball_nba";
  }
  if (sport === "wnba") {
    return "basketball_wnba";
  }
  if (sport === "baseball") {
    return "baseball_mlb";
  }
  return null;
}

function getServerDateFromGamesPayload(payload: GamesPayload): string | null {
  const candidates = [payload.dailyGameId, payload.wnbaDailyGameId, payload.mlbDailyGameId];
  for (const candidate of candidates) {
    const parsed = parseDailyGameDateFromId(String(candidate ?? ""));
    if (parsed) {
      return parsed;
    }
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
  if (status === "final") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
  if (status === "live") return "bg-amber-500/15 text-amber-300 border-amber-400/40";
  if (status === "canceled") return "bg-ht-border-soft text-ht-fg-muted border-ht-border-strong";
  return "bg-sky-500/15 text-sky-300 border-sky-400/40";
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

function describeMlbStatChange(
  prev: StatsSnapshot,
  next: StatsSnapshot
): { actionLabel: string; flashLabel: string; pointsDelta: number } | null {
  const fpDelta = next.total_fantasy_points - prev.total_fantasy_points;
  if (Math.abs(fpDelta) < 0.01) return null;

  let flashLabel: string;
  let actionLabel: string;
  if (fpDelta >= 45) {
    flashLabel = "HOME RUN!";
    actionLabel = "hit a Home Run";
  } else if (fpDelta >= 25) {
    flashLabel = "TRIPLE!";
    actionLabel = "hit a Triple";
  } else if (fpDelta >= 15) {
    flashLabel = "DOUBLE!";
    actionLabel = "hit a Double";
  } else if (fpDelta >= 9) {
    flashLabel = "STRIKEOUT!";
    actionLabel = "recorded a Strikeout";
  } else if (fpDelta >= 5) {
    flashLabel = fpDelta >= 10 ? "HIT!" : "OUT!";
    actionLabel = fpDelta >= 10 ? "recorded a Hit" : "recorded an Out";
  } else if (fpDelta > 0) {
    flashLabel = "STAT UPDATE!";
    actionLabel = "had a fantasy stat update";
  } else {
    flashLabel = "STAT CORRECTION!";
    actionLabel = "had a fantasy stat correction";
  }

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

type FantasyHomeProps = {
  defaultSport?: FantasySport;
};

export function FantasyHome({ defaultSport = "nba" }: FantasyHomeProps) {
  const [userId, setUserId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [games, setGames] = useState<FantasyGame[]>([]);
  const [entries, setEntries] = useState<FantasyEntry[]>([]);
  const [selectedSport, setSelectedSport] = useState<FantasySport>(defaultSport);
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateInput());
  const [serverTodayDate, setServerTodayDate] = useState(() => getTodayDateInput());
  const [selectedGameId, setSelectedGameId] = useState("");
  const [playerPool, setPlayerPool] = useState<FantasyPlayerPoolItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<FantasyLeaderboardEntry[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [hasStartedGame, setHasStartedGame] = useState(false);
  const [isLoadingPool, setIsLoadingPool] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [claimingEntryId, setClaimingEntryId] = useState("");
  const [isCollectingAllFantasy, setIsCollectingAllFantasy] = useState(false);
  const [hasLocalLineupDraft, setHasLocalLineupDraft] = useState(false);
  const [draftSubmissionAttempted, setDraftSubmissionAttempted] = useState(false);
  const [justSubmittedRoster, setJustSubmittedRoster] = useState(false);
  const [lastSubmissionTime, setLastSubmissionTime] = useState<number | null>(null);
  const [submissionAnimationComplete, setSubmissionAnimationComplete] = useState(false);
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
  const fantasyRealtimeFallbackTimerRef = useRef<number | null>(null);
  const fantasyHighlightResetTimerRef = useRef<number | null>(null);
  const geofencePauseRef = useRef(false);
  const requiredLineupSize = FANTASY_LINEUP_SIZE_BY_SPORT[selectedSport] ?? 5;
  const draftStorageKey = useMemo(
    () => (userId && selectedGameId ? `fantasy_draft_${userId}_${selectedGameId}` : ""),
    [selectedGameId, userId]
  );

  const clearDraftStorage = useCallback(() => {
    if (!draftStorageKey) {
      return;
    }
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // ignore storage quota or permission errors
    }
  }, [draftStorageKey]);

  const isDuplicateSlateEntryError = useCallback((message: string) => {
    return message.toLowerCase().includes("already have an entry for this daily slate");
  }, []);

  useEffect(() => {
    setSelectedSport(defaultSport);
  }, [defaultSport]);

  useEffect(() => {
    setUserId(getUserId() ?? "");
    setVenueId(getVenueId() ?? "");
  }, []);

  useEffect(() => {
    geofencePauseRef.current = isGeofencePaused;
  }, [isGeofencePaused]);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!lastSubmissionTime) {
      return;
    }
    setSubmissionAnimationComplete(false);
    const fadeTimer = window.setTimeout(() => {
      setSubmissionAnimationComplete(true);
    }, 2300);
    const clearTimer = window.setTimeout(() => {
      setLastSubmissionTime(null);
      setSubmissionAnimationComplete(false);
    }, 3000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [lastSubmissionTime]);

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
      const serverDate = getServerDateFromGamesPayload(payload);
      if (serverDate) {
        setServerTodayDate(serverDate);
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
      return [] as FantasyEntry[];
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
      const incoming = payload.entries ?? [];
      setEntries((previous) => {
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
      return incoming;
    } catch (error) {
      setEntries([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy entries.");
      return [] as FantasyEntry[];
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
      setIsLoadingPool(false);
      return;
    }

    if (selectedSport !== "nba" && selectedSport !== "wnba" && selectedSport !== "baseball") {
      setPlayerPool([]);
      setLeaderboard([]);
      setIsLoadingPool(false);
      return;
    }

    setIsLoadingPool(true);
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

      if (selectedSport === "baseball" || selectedSport === "nba" || selectedSport === "wnba") {
        const sportGameId = getGameIdForSportDate(selectedSport, gameDate);
        const sportRes = await fetch(`/api/fantasy/games?${makeParams(sportGameId)}`, { cache: "no-store" });
        const sportPayload = (await sportRes.json()) as GamesPayload;
        if (requestNonce !== gameDetailsRequestNonceRef.current) return;
        setPlayerPool(sportPayload.playerPool ?? []);
        setLeaderboard(sportPayload.leaderboard ?? []);
        setSelectedPlayers((current) => {
          const poolKeys = new Set((sportPayload.playerPool ?? []).map((item) => item.playerName));
          return current.filter((name) => poolKeys.has(name));
        });
        return;
      }
    } catch (error) {
      setPlayerPool([]);
      setLeaderboard([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy player pool.");
    } finally {
      setIsLoadingPool(false);
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
    setHasStartedGame(false);
    setHasLocalLineupDraft(false);
    setDraftSubmissionAttempted(false);
    setJustSubmittedRoster(false);
    setIsLoadingPool(true);
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
    const id = getGameIdForSportDate(selectedSport, selectedDate);
    setSelectedGameId(id);
  }, [selectedSport, selectedDate]);

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

  const selectedEntrySportKey = useMemo(() => getEntrySportKeyForFantasySport(selectedSport), [selectedSport]);

  const existingEntryForSelectedGame = useMemo(
    () => {
      return entries.find((entry) => {
        if (!selectedEntrySportKey) {
          return false;
        }
        return entry.sportKey === selectedEntrySportKey && entry.gameId === selectedGameId;
      });
    },
    [entries, selectedEntrySportKey, selectedGameId]
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
  const hasResolvedEntries = !loadingEntries;
  const canEditExistingEntryLineup = useMemo(() => {
    if (!existingEntryForSelectedGame) {
      return false;
    }
    if (selectedDate < serverTodayDate) {
      return false;
    }
    if (existingEntryForSelectedGame.status === "canceled" || existingEntryForSelectedGame.status === "final") {
      return false;
    }
    return !existingEntryForSelectedGame.lineup.some((playerName) => !playerPoolKeys.has(normalizePlayerKey(playerName)));
  }, [existingEntryForSelectedGame, playerPoolKeys, selectedDate, serverTodayDate]);

  // Persist in-progress draft to localStorage on every selection change
  useEffect(() => {
    if (!hasStartedGame || existingEntryForSelectedGame || !draftStorageKey) return;
    try {
      if (selectedPlayers.length > 0) {
        localStorage.setItem(draftStorageKey, JSON.stringify(selectedPlayers));
      } else {
        localStorage.removeItem(draftStorageKey);
      }
    } catch {
      // ignore storage quota or permission errors
    }
  }, [draftStorageKey, existingEntryForSelectedGame, hasStartedGame, selectedPlayers]);

  // Restore draft from localStorage once the player pool loads
  useEffect(() => {
    if (hasRestoredDraftRef.current) return;
    if (!hasResolvedEntries || !hasStartedGame || !draftStorageKey || existingEntryForSelectedGame || draftSubmissionAttempted) return;
    if (playerPool.length === 0) return;
    try {
      const saved = localStorage.getItem(draftStorageKey);
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
  }, [
    draftStorageKey,
    draftSubmissionAttempted,
    existingEntryForSelectedGame,
    hasResolvedEntries,
    hasStartedGame,
    playerPool,
    playerPoolKeys,
    requiredLineupSize,
  ]);

  const sportGames = useMemo(
    () =>
      selectedSport === "nba"
        ? games.filter((g) => g.league === "NBA")
        : selectedSport === "wnba"
        ? games.filter((g) => g.league === "WNBA")
        : selectedSport === "baseball"
        ? games.filter((g) => g.league === "MLB")
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
  }, [sportGames]);
  const selectedSlateDate = selectedDate;
  const liveEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (!selectedEntrySportKey || entry.sportKey !== selectedEntrySportKey) {
          return false;
        }
        if (entry.status !== "live") {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        return entryDateKey === selectedSlateDate;
      }),
    [entries, selectedEntrySportKey, selectedSlateDate]
  );
  const hasActiveDraftedEntry = useMemo(
    () =>
      entries.some((entry) => {
        if (!selectedEntrySportKey || entry.sportKey !== selectedEntrySportKey) {
          return false;
        }
        return (
          entry.gameId === selectedGameId &&
          (entry.status === "pending" || entry.status === "live")
        );
      }),
    [entries, selectedEntrySportKey, selectedGameId]
  );
  const hasLiveEntry = liveEntries.length > 0;
  const hasSyncableEntry = useMemo(
    () =>
      entries.some((entry) => {
        if (!selectedEntrySportKey || entry.sportKey !== selectedEntrySportKey) {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        if (entryDateKey !== selectedSlateDate) {
          return false;
        }
        return entry.status === "pending" || entry.status === "live";
      }),
    [entries, selectedEntrySportKey, selectedSlateDate]
  );
  const nextPendingEntryStartMs = useMemo(() => {
    const now = Date.now();
    let nextStart: number | null = null;
    for (const entry of entries) {
      if (!selectedEntrySportKey || entry.sportKey !== selectedEntrySportKey) {
        continue;
      }
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
  }, [entries, selectedEntrySportKey, selectedSlateDate]);
  const finalUnclaimedEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            Boolean(selectedEntrySportKey) &&
            entry.sportKey === selectedEntrySportKey &&
            getEntryLocalDateKey(entry) === selectedSlateDate &&
            entry.status === "final" &&
            !entry.rewardClaimedAt &&
            computeFantasyClaimablePoints(entry) > 0 &&
            isIsoInCurrentLocalWeek(entry.startsAt)
        )
        .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt)),
    [entries, selectedEntrySportKey, selectedSlateDate]
  );
  const hasPreviousUnclaimedFantasyEntries = useMemo(
    () =>
      entries.some((entry) => {
        if (!selectedEntrySportKey || entry.sportKey !== selectedEntrySportKey) {
          return false;
        }
        if (entry.status !== "final" || entry.rewardClaimedAt || computeFantasyClaimablePoints(entry) <= 0) {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        if (!entryDateKey) {
          return false;
        }
        return entryDateKey < selectedSlateDate;
      }),
    [entries, selectedEntrySportKey, selectedSlateDate]
  );
  const hasCurrentUnclaimedFantasyEntries = useMemo(
    () =>
      entries.some((entry) => {
        if (!selectedEntrySportKey || entry.sportKey !== selectedEntrySportKey) {
          return false;
        }
        if (entry.status !== "final" || entry.rewardClaimedAt || computeFantasyClaimablePoints(entry) <= 0) {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        if (!entryDateKey) {
          return false;
        }
        return entryDateKey === selectedSlateDate;
      }),
    [entries, selectedEntrySportKey, selectedSlateDate]
  );
  const hasFutureUnclaimedFantasyEntries = useMemo(
    () =>
      entries.some((entry) => {
        if (!selectedEntrySportKey || entry.sportKey !== selectedEntrySportKey) {
          return false;
        }
        if (entry.status !== "final" || entry.rewardClaimedAt || computeFantasyClaimablePoints(entry) <= 0) {
          return false;
        }
        const entryDateKey = getEntryLocalDateKey(entry);
        if (!entryDateKey) {
          return false;
        }
        return entryDateKey > selectedSlateDate;
      }),
    [entries, selectedEntrySportKey, selectedSlateDate]
  );
  const trackedEntry = useMemo(() => {
    const selected = entries.find(
      (entry) =>
        Boolean(selectedEntrySportKey) &&
        entry.sportKey === selectedEntrySportKey &&
        entry.gameId === selectedGameId
    );
    if (selected && !(selected.status === "final" && Boolean(selected.rewardClaimedAt))) {
      return selected;
    }
    if (liveEntries.length > 0) {
      return liveEntries[0] ?? null;
    }
    return finalUnclaimedEntries[0] ?? null;
  }, [entries, finalUnclaimedEntries, liveEntries, selectedEntrySportKey, selectedGameId]);
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
    if (!existingEntryForSelectedGame) {
      return;
    }
    if (hasLocalLineupDraft && canEditExistingEntryLineup && isEditingRoster) {
      return;
    }
    setSelectedPlayers(existingEntryForSelectedGame.lineup);
  }, [canEditExistingEntryLineup, existingEntryForSelectedGame, hasLocalLineupDraft, isEditingRoster]);

  useEffect(() => {
    return () => {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
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

          const sportKey = String(row.sport_key ?? "").trim();
          const change = sportKey === "baseball_mlb"
            ? describeMlbStatChange(prevSnapshot, nextSnapshot)
            : describeStatChange(prevSnapshot, nextSnapshot);
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
    setJustSubmittedRoster(false);
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
    setJustSubmittedRoster(false);
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
    setJustSubmittedRoster(false);
  }, []);

  const navigateToNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      if (prev >= serverTodayDate) return prev;
      const d = new Date(`${prev}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return toLocalDateInput(d);
    });
    setHasStartedGame(false);
    setSelectedPlayers([]);
    setJustSubmittedRoster(false);
  }, [serverTodayDate]);

  const persistLineup = useCallback(async (lineup: string[], hadExistingEntryBeforeSubmit: boolean) => {
    if (!userId || !venueId || !selectedGameId || lineup.length !== requiredLineupSize) {
      return false;
    }

    setSubmitting(true);
    setStatusMessage("");
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
        const message = payload.error ?? "Failed to submit fantasy lineup.";
        if (isDuplicateSlateEntryError(message)) {
          clearDraftStorage();
          setHasLocalLineupDraft(false);
          setIsEditingRoster(false);
          const refreshedEntries = await loadEntries(true);
          await loadSelectedGameDetails();
          const matchedEntry = refreshedEntries.find((entry) => {
            if (!selectedEntrySportKey) {
              return false;
            }
            return entry.sportKey === selectedEntrySportKey && entry.gameId === selectedGameId;
          });
          if (matchedEntry && hadExistingEntryBeforeSubmit) {
            setSelectedPlayers(matchedEntry.lineup);
          }
          if (hadExistingEntryBeforeSubmit) {
            setStatusMessage("Roster already submitted for this date. Click 'Edit Roster' to modify it.");
            setJustSubmittedRoster(false);
            return false;
          }
          setStatusMessage("Roster submitted successfully. Live scoring will update automatically.");
          setLastSubmissionTime(Date.now());
          setDraftSubmissionAttempted(false);
          setJustSubmittedRoster(true);
          setSelectedPlayers(matchedEntry?.lineup ?? lineup);
          return true;
        }
        throw new Error(message);
      }

      setStatusMessage(
        existingEntryForSelectedGame
          ? "Roster updated successfully."
          : "Roster submitted successfully. Live scoring will update automatically."
      );
      setLastSubmissionTime(Date.now());
      setHasLocalLineupDraft(false);
      setDraftSubmissionAttempted(false);
      setJustSubmittedRoster(true);
      clearDraftStorage();
      setSelectedPlayers(lineup);
      await Promise.all([loadEntries(true), loadSelectedGameDetails()]);
      return true;
    } catch (error) {
      setDraftSubmissionAttempted(false);
      setJustSubmittedRoster(false);
      setErrorMessage(error instanceof Error ? error.message : "Failed to save fantasy lineup.");
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [
    clearDraftStorage,
    existingEntryForSelectedGame,
    isDuplicateSlateEntryError,
    loadEntries,
    loadSelectedGameDetails,
    requiredLineupSize,
    selectedEntrySportKey,
    selectedGameId,
    userId,
    venueId,
  ]);

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
          ? "Tap players to build your roster."
          : `Select ${requiredLineupSize - selectedPlayers.length} more player${requiredLineupSize - selectedPlayers.length === 1 ? "" : "s"}, then tap ${existingEntryForSelectedGame ? "Update roster" : "Submit roster"}.`
      );
      return;
    }
    setStatusMessage(
      `${existingEntryForSelectedGame ? "Update roster" : "Submit roster"} to lock this lineup.`
    );
  }, [
    canEditExistingEntryLineup,
    existingEntryForSelectedGame,
    hasLocalLineupDraft,
    hasResolvedEntries,
    hasStartedGame,
    requiredLineupSize,
    selectedGameId,
    selectedPlayers,
  ]);

  const handleSubmitRoster = useCallback(async () => {
    setDraftSubmissionAttempted(true);
    const didSave = await persistLineup(selectedPlayers, Boolean(existingEntryForSelectedGame));
    if (didSave && existingEntryForSelectedGame) {
      setIsEditingRoster(false);
    }
  }, [existingEntryForSelectedGame, persistLineup, selectedPlayers]);

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

  const CANONICAL_POSITIONS: readonly string[] =
    selectedSport === "baseball"
      ? ["P", "C", "1B", "2B", "3B", "SS", "OF", "DH"]
      : ["PG", "SG", "SF", "PF", "C"];

  const uniqueTeams = useMemo(
    () =>
      Array.from(new Set(availablePlayerPool.map((item) => item.team).filter((t): t is string => Boolean(t)))).sort(),
    [availablePlayerPool]
  );

  const sortedFilteredPool = useMemo(() => {
    const isBaseball = selectedSport === "baseball";
    const matchPos = (itemPos: string | null | undefined, filter: string): boolean => {
      const pos = (itemPos ?? "").trim().toUpperCase();
      const f = filter.toUpperCase();
      if (isBaseball) {
        if (f === "P") return pos === "P" || pos === "SP" || pos === "RP";
        if (f === "OF") return pos === "OF" || pos === "LF" || pos === "RF" || pos === "CF";
      }
      return pos === f;
    };
    let pool = availablePlayerPool;
    if (filterPosition !== "all") {
      pool = pool.filter((item) => matchPos(item.position, filterPosition));
    }
    if (filterTeam !== "all") {
      pool = pool.filter((item) => item.team === filterTeam);
    }
    const positionOrder: string[] = isBaseball
      ? ["P", "SP", "RP", "C", "1B", "2B", "3B", "SS", "OF", "LF", "CF", "RF", "DH"]
      : ["PG", "SG", "SF", "PF", "C"];
    return [...pool].sort((a, b) => {
      if (sortBy === "alpha") {
        return a.playerName.localeCompare(b.playerName);
      }
      if (sortBy === "position") {
        const posA = (a.position ?? "ZZZ").toUpperCase();
        const posB = (b.position ?? "ZZZ").toUpperCase();
        const ai = positionOrder.indexOf(posA);
        const bi = positionOrder.indexOf(posB);
        const posCompare =
          ai !== -1 && bi !== -1 ? ai - bi :
          ai !== -1 ? -1 :
          bi !== -1 ? 1 :
          posA.localeCompare(posB);
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
  }, [availablePlayerPool, sortBy, filterPosition, filterTeam, selectedSport]);

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

  const isToday = selectedDate === serverTodayDate;
  const isPastSelectedDate = selectedDate < serverTodayDate;
  const draftCtaLabel = existingEntryForSelectedGame ? "Edit your roster" : "Draft your roster";
  const isFantasyLineupSport = selectedSport === "nba" || selectedSport === "wnba" || selectedSport === "baseball";
  const selectedSportLabel =
    selectedSport === "baseball" ? "baseball" : selectedSport === "wnba" ? "WNBA" : "NBA";
  const showGameStart =
    isFantasyLineupSport &&
    selectedGameId &&
    hasResolvedEntries &&
    !isPastSelectedDate &&
    !hasActiveDraftedEntry &&
    !existingEntryForSelectedGame &&
    !hasStartedGame;
  const showLineupBuilder =
    isFantasyLineupSport &&
    selectedGameId &&
    hasResolvedEntries &&
    !isPastSelectedDate &&
    ((hasStartedGame && !existingEntryForSelectedGame) || Boolean(existingEntryForSelectedGame) || (canEditExistingEntryLineup && isEditingRoster));
  const isSubmittedRosterView = (Boolean(existingEntryForSelectedGame) || justSubmittedRoster) && !isEditingRoster;
  const canModifyRosterSelections = !isSubmittedRosterView;

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
      <h1 className="px-1 text-xl font-black tracking-tight text-ht-fg-primary">Hightop Fantasy Sports</h1>

      {/* Top section — date nav, sport scroll, roster tracker */}
      <section className="rounded-2xl border border-violet-400/30 bg-slate-900 p-3">

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
          <span className="text-sm font-bold text-white">{formatDateLabel(selectedDate, serverTodayDate)}</span>
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
            {FANTASY_SPORTS.map((sport) => {
              const usesTextLabel = sport.icon.length > 2;
              return (
                <button
                  key={sport.key}
                  type="button"
                  disabled={!sport.available}
                  onClick={() => sport.available && setSelectedSport(sport.key)}
                  className={`tp-clean-button flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border-2 leading-none transition-all ${
                    usesTextLabel ? "px-1 text-sm font-black tracking-wide" : "text-[3.25rem]"
                  } ${
                    selectedSport === sport.key
                      ? "border-indigo-700 bg-indigo-600 shadow-sm"
                      : sport.available
                      ? "border-ht-border-soft bg-ht-elevated hover:border-indigo-400/60"
                      : "border-ht-border-hairline bg-ht-surface opacity-40"
                  }`}
                  title={sport.available ? sport.key.toUpperCase() : `${sport.key} — coming soon`}
                >
                  {sport.icon}
                </button>
              );
            })}
          </div>
        </div>

        {/* Roster tracker pips */}
        <div className="mt-3 flex items-center gap-2">
          <p className="text-[11px] font-semibold text-ht-fg-muted">Roster</p>
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
          <p className="text-[11px] font-semibold text-ht-fg-muted">
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
        <p className="rounded-lg border border-amber-400/40 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-200">
          {geofencePauseReason || "Fantasy scoring is paused while outside the venue geofence."}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="rounded-lg border border-emerald-400/40 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-300">
          {statusMessage}
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {lastSubmissionTime ? (
          <motion.div
            key={lastSubmissionTime}
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={
              submissionAnimationComplete
                ? { opacity: 0, scale: 0.98, y: -4 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: submissionAnimationComplete ? 0.65 : 0.3, ease: "easeOut" }}
            className="fixed bottom-6 left-1/2 z-[2400] w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border border-emerald-400/60 bg-emerald-500/20 px-3 py-3 shadow-[0_14px_32px_rgba(16,185,129,0.35)]"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-center gap-2">
              <motion.span
                initial={{ scale: 0.7, rotate: -12 }}
                animate={{ scale: [0.7, 1.15, 1], rotate: [0, 5, 0] }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-500/25 text-emerald-300"
              >
                ✓
              </motion.span>
              <span className="text-sm font-bold text-emerald-300">
                {existingEntryForSelectedGame ? "Roster Updated" : "Roster Locked In"}
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {errorMessage ? (
        <p className="rounded-lg border border-rose-400/40 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      {/* "Coming soon" for football */}
      {selectedSport === "football" ? (
        <section className="rounded-2xl border border-violet-400/30 bg-slate-900 p-4">
          <p className="text-center text-sm font-semibold text-ht-fg-muted">
            🏈 Football fantasy is coming soon!
          </p>
        </section>
      ) : null}

      {/* Team tracker for live/pending entry */}
      {isFantasyLineupSport && trackedEntry ? (
        <section className="rounded-2xl border border-violet-400/30 bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-ht-fg-primary">Your Team Tracker</h3>
            {existingEntryForSelectedGame ? (
              canEditExistingEntryLineup ? (
                <button
                  type="button"
                  onClick={() => {
                    setJustSubmittedRoster(false);
                    setIsEditingRoster(true);
                  }}
                  className="tp-clean-button rounded-lg border border-violet-400/60 bg-violet-950/30 px-3 py-1.5 text-xs font-semibold text-violet-300"
                >
                  {isEditingRoster ? "Editing roster" : "Edit your roster"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="tp-clean-button cursor-not-allowed rounded-lg border border-ht-border-strong bg-ht-elevated-2 px-3 py-1.5 text-xs font-semibold text-ht-fg-muted opacity-90"
                >
                  Roster Locked
                </button>
              )
            ) : null}
          </div>
          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ht-fg-primary">{showTrackedEntryClaimButton ? "Final Score" : "Live Points"}</p>
              <SpringPop
                popKey={totalScorePopTick}
                glowSize={12}
                glowColor={totalScorePopTone === "loss" ? "red" : "green"}
              >
                <p
                  className={`text-sm font-black ${
                    totalScorePopTone === "loss"
                      ? "text-rose-400"
                      : isRealtimeFresh
                      ? "text-emerald-400"
                      : "text-ht-fg-primary"
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
                        : "text-slate-300"
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
                      <span className="truncate text-sm font-semibold text-slate-200">{playerName}</span>
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
              className="tp-clean-button mt-3 w-full rounded-lg border border-emerald-400/60 bg-emerald-950/30 px-3 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-60"
            >
              {claimingEntryId === trackedEntry.id ? "Collecting..." : `Collect ${trackedEntryClaimablePoints} Points`}
            </button>
          ) : hasLiveEntry ? (
            <>
              <p className="mt-2 text-[11px] font-semibold text-emerald-400">Live game detected. Streaming realtime updates.</p>
              {uncollectedPoints > 0 ? (
                <button
                  type="button"
                  onClick={() => void collectLivePoints()}
                  disabled={isCollectingLive || isGeofencePaused}
                  className="tp-clean-button mt-2 w-full rounded-lg border border-amber-400/60 bg-amber-950/30 px-3 py-2 text-sm font-semibold text-amber-300 disabled:opacity-60"
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
            <p className="mt-2 text-[11px] text-ht-fg-muted">No live game right now. Automatic updates will resume when your next game starts.</p>
          )}
        </section>
      ) : null}

      {/* Completed games with unclaimed points */}
      {isFantasyLineupSport && finalUnclaimedEntries.length > 1 ? (
        <section className="rounded-2xl border border-violet-400/30 bg-slate-900 p-4">
          <h3 className="text-base font-semibold text-ht-fg-primary">Completed Games Ready To Collect</h3>
          <p className="mt-1 text-xs leading-relaxed text-ht-fg-secondary">
            Finalized rosters stay here until you collect points.
          </p>
          <div className="mt-3 space-y-2">
            {finalUnclaimedEntries.map((entry) => (
              <div key={entry.id} className="rounded-ht-lg border border-indigo-400/40 bg-ht-elevated px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ht-fg-primary">{entry.gameLabel}</p>
                    <p className="text-xs text-ht-fg-muted">{formatLocalDateTime(entry.startsAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      void claimReward(entry, rect);
                    }}
                    disabled={claimingEntryId === entry.id}
                    className="tp-clean-button rounded-lg border border-indigo-400/60 bg-indigo-500/15 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 disabled:opacity-60"
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
        <section className="rounded-2xl border border-violet-400/30 bg-slate-900 p-4">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-indigo-300">Game Start</p>
          {sportGames.length > 0 ? (
            <p className="mt-1 text-sm text-ht-fg-secondary">
              {sportGames[0] ? formatLocalDateTime(sportGames[0].startsAt) : null}
            </p>
          ) : null}
          {sportGames.length === 0 ? (
            <p className="mt-1 text-sm text-ht-fg-muted">
              No {selectedSportLabel} games scheduled for this day.
            </p>
          ) : null}
          {sportGames.length > 0 ? (
            isLoadingPool ? (
              <div
                className="mt-3 flex h-[46px] w-full animate-pulse items-center justify-center gap-2 rounded-xl bg-indigo-300/50"
                aria-label="Loading player pool…"
              >
                <span className="h-2 w-2 rounded-full bg-indigo-400/70" />
                <span className="h-2 w-24 rounded-full bg-indigo-400/70" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHasStartedGame(true)}
                className="tp-clean-button mt-3 w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-[#5b2ca5] via-[#7b3fd6] to-[#8f4de8] px-3 py-3 text-sm font-bold text-white shadow-sm active:scale-95"
              >
                {draftCtaLabel}
              </button>
            )
          ) : null}
        </section>
      ) : null}

      {/* Lineup Builder */}
      {showLineupBuilder ? (
        <section className="rounded-2xl border border-violet-400/30 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ht-fg-primary">
              {existingEntryForSelectedGame ? "Update Lineup" : "Lineup Builder"}
            </h3>
            <div className="text-xs font-semibold text-ht-fg-secondary">
              {selectedPlayers.length}/{requiredLineupSize} selected
            </div>
          </div>

          {/* Scoring reference */}
          <div className="mt-3 rounded-ht-xl border border-ht-border-hairline bg-ht-surface px-3 py-3">
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.08em] text-ht-fg-muted">Scoring System</p>
            {selectedSport === "baseball" ? (
              <div className="mt-2 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ht-fg-muted">Batting</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-ht-fg-secondary">Single / Walk</span><span className="text-right font-semibold text-ht-fg-primary">+10</span>
                  <span className="text-ht-fg-secondary">Double</span><span className="text-right font-semibold text-ht-fg-primary">+20</span>
                  <span className="text-ht-fg-secondary">Triple</span><span className="text-right font-semibold text-ht-fg-primary">+30</span>
                  <span className="text-ht-fg-secondary">Home Run</span><span className="text-right font-semibold text-ht-fg-primary">+50</span>
                  <span className="text-ht-fg-secondary">Run / RBI</span><span className="text-right font-semibold text-ht-fg-primary">+10</span>
                  <span className="text-ht-fg-secondary">Stolen Base</span><span className="text-right font-semibold text-ht-fg-primary">+15</span>
                  <span className="text-ht-fg-secondary">Strikeout (bat)</span><span className="text-right font-semibold text-rose-400">-5</span>
                </div>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-ht-fg-muted">Pitching</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-ht-fg-secondary">Strikeout</span><span className="text-right font-semibold text-ht-fg-primary">+10</span>
                  <span className="text-ht-fg-secondary">Out Recorded</span><span className="text-right font-semibold text-ht-fg-primary">+5</span>
                  <span className="text-ht-fg-secondary">Earned Run</span><span className="text-right font-semibold text-rose-400">-15</span>
                  <span className="text-ht-fg-secondary">Walk / Hit Allowed</span><span className="text-right font-semibold text-rose-400">-5</span>
                </div>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-ht-fg-secondary">Points</span><span className="text-right font-semibold text-ht-fg-primary">+1.0</span>
                <span className="text-ht-fg-secondary">Rebounds</span><span className="text-right font-semibold text-ht-fg-primary">+1.2</span>
                <span className="text-ht-fg-secondary">Assists</span><span className="text-right font-semibold text-ht-fg-primary">+1.5</span>
                <span className="text-ht-fg-secondary">Steals</span><span className="text-right font-semibold text-ht-fg-primary">+3.0</span>
                <span className="text-ht-fg-secondary">Blocks</span><span className="text-right font-semibold text-ht-fg-primary">+3.0</span>
                <span className="text-ht-fg-secondary">Turnovers</span><span className="text-right font-semibold text-rose-400">-1.0</span>
              </div>
            )}
          </div>

          {/* ── Live Roster Preview ── */}
          <div className="mt-3 rounded-ht-xl border border-indigo-400/40 bg-ht-surface px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-indigo-300">
                  My Roster
                </p>
                {isSubmittedRosterView && canEditExistingEntryLineup ? (
                  <button
                    type="button"
                    onClick={() => {
                      setJustSubmittedRoster(false);
                      setIsEditingRoster(true);
                    }}
                    className="tp-clean-button rounded-full border border-indigo-400/60 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-300"
                  >
                    Edit roster
                  </button>
                ) : null}
              </div>
              {submitting ? (
                <span className="text-[10px] font-semibold text-ht-fg-muted">Saving…</span>
              ) : isSubmittedRosterView ? (
                <span className="text-[10px] font-bold text-emerald-400">
                  {canEditExistingEntryLineup ? "Roster submitted" : "Roster locked"}
                </span>
              ) : selectedPlayers.length === requiredLineupSize ? (
                <span className="text-[10px] font-bold text-emerald-400">
                  Ready to {existingEntryForSelectedGame ? "update" : "submit"}
                </span>
              ) : (
                <span className="text-[10px] text-ht-fg-muted">
                  {requiredLineupSize - selectedPlayers.length} more to complete
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-2">
              {selectedPlayers.map((name) => {
                const poolItem = playerPool.find((item) => normalizePlayerKey(item.playerName) === normalizePlayerKey(name));
                return (
                  <li key={name} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {canModifyRosterSelections ? (
                        <button
                          type="button"
                          onClick={() => removeSelectedPlayer(name)}
                          className="tp-clean-button inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-500 bg-rose-500 text-[12px] font-black leading-none text-white active:scale-90"
                          aria-label={`Remove ${name}`}
                        >
                          −
                        </button>
                      ) : null}
                      <PlayerHeadshot
                        src={playerPoolHeadshotByName.get(normalizePlayerKey(name)) ?? null}
                        name={name}
                        sizeClass="h-7 w-7"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ht-fg-primary">{name}</p>
                        {(poolItem?.position || poolItem?.team) ? (
                          <p className="text-[10px] text-ht-fg-muted">
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
                              ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-300"
                              : "border-ht-border-hairline bg-ht-elevated text-ht-fg-muted"
                          }`}
                        >
                          Projected: {rosterProj} pts
                        </span>
                      );
                    })()}
                  </li>
                );
              })}
              {Array.from({ length: requiredLineupSize - selectedPlayers.length }).map((_, i) => (
                <li key={`empty-${i}`} className="flex items-center gap-2 opacity-40">
                  <div className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-400" />
                  <span className="text-xs text-ht-fg-muted">
                    {canModifyRosterSelections ? "Pick a player below…" : "Empty slot"}
                  </span>
                </li>
              ))}
            </ul>
            {canModifyRosterSelections ? (
              <>
                {submitting ? (
                  <p className="mt-3 text-xs font-semibold leading-relaxed text-ht-fg-muted">Saving lineup…</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSubmitRoster()}
                  disabled={submitting || selectedPlayers.length !== requiredLineupSize}
                  className="tp-clean-button mt-3 w-full rounded-xl border border-indigo-500 bg-gradient-to-r from-[#5b2ca5] via-[#7b3fd6] to-[#8f4de8] px-3 py-3 text-sm font-bold text-white shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {existingEntryForSelectedGame ? "Update roster" : "Submit roster"}
                </button>
                <p className="mt-2 text-[11px] font-medium text-ht-fg-muted">
                  Your lineup is saved only when you tap {existingEntryForSelectedGame ? "Update roster" : "Submit roster"}.
                </p>
              </>
            ) : (
              <p className="mt-3 text-[11px] font-medium text-ht-fg-muted">
                {canEditExistingEntryLineup
                  ? "Roster is locked in. Tap Edit roster to make changes before tipoff."
                  : "Roster is locked because games have already started."}
              </p>
            )}
          </div>

          {/* ── Sort + Filter controls ── */}
          {canModifyRosterSelections ? (
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
                      : "border-ht-border-soft bg-ht-elevated text-ht-fg-secondary hover:border-indigo-400/60"
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
                className="flex-1 rounded-lg border border-ht-border-soft bg-ht-surface px-2.5 py-1.5 text-xs font-semibold text-ht-fg-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="all">All Positions</option>
                {CANONICAL_POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="flex-1 rounded-lg border border-ht-border-soft bg-ht-surface px-2.5 py-1.5 text-xs font-semibold text-ht-fg-primary shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="all">All Teams</option>
                {uniqueTeams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>
          </div>
          ) : null}

          {/* ── Player pool ── */}
          {canModifyRosterSelections ? (
            <>
              {availablePlayerPool.length === 0 ? (
                <div className="mt-3">
                  {sportGames.length > 0 ? (
                    <BasketballLoader label="Loading today's eligible players…" />
                  ) : (
                    <p className="text-sm text-ht-fg-muted">No players available for this date.</p>
                  )}
                </div>
              ) : sortedFilteredPool.length === 0 ? (
                <p className="mt-3 text-sm text-ht-fg-muted">No players match the current filter.</p>
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
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-ht-border-soft bg-ht-elevated hover:border-indigo-400/60"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <PlayerHeadshot
                              src={item.headshotUrl || FALLBACK_HEADSHOT_SRC}
                              name={item.playerName}
                              sizeClass="h-9 w-9 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-ht-fg-primary">{item.playerName}</p>
                              {(item.position || item.team) ? (
                                <p className="text-[10px] font-semibold text-ht-fg-muted">
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
                                    className={`text-xs font-black tabular-nums ${
                                      isSelected
                                        ? "text-emerald-400"
                                        : displayProjection > 0
                                        ? "text-indigo-300"
                                        : "text-ht-fg-muted"
                                    }`}
                                  >
                                    Projected: {displayProjection} pts
                                  </span>
                                );
                              })()}
                              {isSelected ? (
                                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-400">
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
                      className="tp-clean-button mt-3 w-full rounded-lg border border-indigo-400/40 bg-indigo-500/10 py-2 text-xs font-semibold text-indigo-300 hover:border-indigo-400/60"
                    >
                      Load more · {sortedFilteredPool.length - visibleCount} remaining
                    </button>
                  ) : null}
                </>
              )}
            </>
          ) : null}

        </section>
      ) : null}

      <InlineSlotAdClient
        slot="inline-content"
        venueId={venueId}
        pageKey="fantasy"
        adType="inline"
        displayTrigger="on-load"
        placementKey="fantasy-inline"
      />
    </div>
  );
}
