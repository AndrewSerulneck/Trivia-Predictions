"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { getGodMode, getUserId, getVenueId } from "@/lib/storage";
import { calculateDistanceMeters, getCurrentLocation, getGeofenceThresholdMeters } from "@/lib/geolocation";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";
import { supabase } from "@/lib/supabase";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { ViewTabs, FoldLine } from "@/components/venue/GameChrome";
import { GameAppBar } from "@/components/venue/AppBar";
import type { FantasyEntry, FantasyGame, FantasyLeaderboardEntry, FantasyPlayerPoolItem } from "@/lib/fantasy";
import type { FantasyLineupPlayer } from "@/lib/fantasy";
import type { FantasyPlayerPoolEmptyReason } from "@/lib/fantasy";
import { FantasySettledCollectAnimation } from "@/components/animations/FantasySettledCollectAnimation";

type GamesPayload = {
  ok: boolean;
  games?: FantasyGame[];
  playerPool?: FantasyPlayerPoolItem[];
  playerPoolEmptyReason?: FantasyPlayerPoolEmptyReason | null;
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

async function parseJsonResponse<T>(response: Response, contextMessage: string): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    const snippet = raw.slice(0, 120).replace(/\s+/g, " ").trim();
    throw new Error(`${contextMessage} (received non-JSON response${snippet ? `: ${snippet}` : ""})`);
  }
}

const DISABLE_GEOFENCE_FOR_TESTING = true;
type FantasySport = "nba" | "wnba" | "baseball" | "football";
const FANTASY_SPORTS: Array<{ key: FantasySport; icon: string; label: string; available: boolean }> = [
  { key: "nba", icon: "🏀", label: "NBA", available: true },
  { key: "wnba", icon: "🏀", label: "WNBA", available: true },
  { key: "baseball", icon: "⚾", label: "MLB", available: true },
  { key: "football", icon: "🏈", label: "NFL", available: false },
];
const FANTASY_LINEUP_SIZE_BY_SPORT: Record<FantasySport, number> = {
  nba: 5,
  wnba: 5,
  baseball: 6,
  football: 5,
};
const FANTASY_MLB_PITCHER_COUNT = 3;
const FANTASY_MLB_HITTER_COUNT = 3;

type MlbRosterRole = "pitcher" | "hitter";

function isMlbPitcherPosition(position: string | null | undefined): boolean {
  const normalized = String(position ?? "").trim().toUpperCase();
  if (!normalized) {
    return false;
  }
  const tokens = normalized.split(/[^A-Z]+/).filter(Boolean);
  return tokens.some((token) => token === "P" || token === "SP" || token === "RP" || token === "CP");
}

function getMlbRosterRole(position: string | null | undefined): MlbRosterRole {
  return isMlbPitcherPosition(position) ? "pitcher" : "hitter";
}

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

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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

function getFantasySportFromEntrySportKey(sportKey: string): FantasySport {
  if (sportKey === "basketball_wnba") return "wnba";
  if (sportKey === "baseball_mlb") return "baseball";
  return "nba";
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
  if (status === "canceled") return "bg-slate-800/50 text-slate-400 border-slate-600";
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

function splitPlayerNameForLineup(name: string): { first: string; rest: string } {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { first: parts[0] ?? "", rest: "" };
  }
  return { first: parts[0]!, rest: parts.slice(1).join(" ") };
}

function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Player avatar framed for the chalkboard theme — chalk-cream ring by default,
// emerald ring while the player is actively scoring. Falls back to jersey number or initials circle.
function PlayerHeadshot({
  src,
  name,
  jerseyNumber,
  live = false,
  sizeClass = "h-[30px] w-[30px]",
}: {
  src?: string | null;
  name: string;
  jerseyNumber?: string | null;
  live?: boolean;
  sizeClass?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const ringClass = live ? "border-[#6ee7b7]/60" : "border-[#fef3c7]/55";

  if (!src || imgFailed) {
    return (
      <div
        className={`${sizeClass} shrink-0 rounded-full border-[1.5px] bg-[#0a3128] ${ringClass} flex items-center justify-center`}
        aria-label={`${name} avatar`}
      >
        <span className="text-[#fef3c7] font-bold leading-none select-none" style={{ fontSize: "40%" }}>
          {jerseyNumber ?? playerInitials(name)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} headshot`}
      className={`${sizeClass} shrink-0 rounded-full border-[1.5px] bg-[#0a3128] object-cover ${ringClass}`}
      loading="lazy"
      onError={() => setImgFailed(true)}
    />
  );
}

function ordinalLabel(rank: number): string {
  if (!Number.isFinite(rank) || rank <= 0) {
    return "—";
  }
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${rank}th`;
  }
  const suffix = ["th", "st", "nd", "rd"][rank % 10] ?? "th";
  return `${rank}${rank % 10 >= 1 && rank % 10 <= 3 ? suffix : "th"}`;
}

// Faint chalk grid overlay for the forest-green "chalkboard" surfaces.
function ChalkGrid({ fine = false }: { fine?: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(254,243,199,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(254,243,199,0.06)_1px,transparent_1px)] ${
        fine ? "bg-[length:18px_18px]" : "bg-[length:20px_20px]"
      }`}
    />
  );
}

type FantasyHomeProps = {
  defaultSport?: FantasySport;
  initialDate?: string;
  initialEntryId?: string;
  onBack?: () => void;
};

export function FantasyHome({ defaultSport = "nba", initialDate = "", initialEntryId = "", onBack }: FantasyHomeProps) {
  const { triggerAnimation } = useAnimationTrigger();
  const [userId, setUserId] = useState(() => getUserId() ?? "");
  const [venueId, setVenueId] = useState(() => getVenueId() ?? "");
  const [games, setGames] = useState<FantasyGame[]>([]);
  const [entries, setEntries] = useState<FantasyEntry[]>([]);
  const [selectedSport, setSelectedSport] = useState<FantasySport>(defaultSport);
  const [selectedDate, setSelectedDate] = useState(() => (isValidDateInput(initialDate) ? initialDate : getTodayDateInput()));
  const [serverTodayDate, setServerTodayDate] = useState(() => getTodayDateInput());
  const [selectedGameId, setSelectedGameId] = useState(() =>
    getGameIdForSportDate(defaultSport, isValidDateInput(initialDate) ? initialDate : getTodayDateInput())
  );
  const [playerPool, setPlayerPool] = useState<FantasyPlayerPoolItem[]>([]);
  const [playerPoolEmptyReason, setPlayerPoolEmptyReason] = useState<FantasyPlayerPoolEmptyReason | null>(null);
  const [leaderboard, setLeaderboard] = useState<FantasyLeaderboardEntry[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [hasStartedGame, setHasStartedGame] = useState(false);
  const [isLoadingPool, setIsLoadingPool] = useState(false);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const hasAutoCollectedFantasyRef = useRef<Set<string>>(new Set());
  const [settledCollectResult, setSettledCollectResult] = useState<{ pointsCollected: number; entryCount: number } | null>(null);
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
  const hasAppliedInitialEntryRef = useRef(false);
  const [isGeofencePaused, setIsGeofencePaused] = useState(false);
  const [geofencePauseReason, setGeofencePauseReason] = useState("");
  const [statFlashes, setStatFlashes] = useState<Array<{ id: string; label: string; pointsDelta: number }>>([]);
  const [statAnimPop, setStatAnimPop] = useState<{ id: number; label: string; delta: number } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [lastCollectedPoints, setLastCollectedPoints] = useState(0);
  const [isCollectingLive, setIsCollectingLive] = useState(false);
  const [activeFantasyTab, setActiveFantasyTab] = useState<"sweat" | "leaderboard">("sweat");
  const syncedLastCollectedRef = useRef<string | false>(false);
  const autoCollectLiveTimerRef = useRef<number | null>(null);
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
    if (isValidDateInput(initialDate)) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  useEffect(() => {
    const fromBell = sessionStorage.getItem("tp:celebrate") === "fantasy";
    const bellDelta = Number(sessionStorage.getItem("tp:celebrate:delta") ?? 0);
    if (fromBell) {
      sessionStorage.removeItem("tp:celebrate");
      sessionStorage.removeItem("tp:celebrate:delta");
      triggerAnimation("FANTASY_LIVE_COLLECT");
      if (bellDelta > 0) {
        window.dispatchEvent(new CustomEvent("tp:coin-flight", { detail: { delta: bellDelta, coins: Math.min(18, Math.max(6, Math.round(bellDelta / 2))) } }));
        window.dispatchEvent(new CustomEvent("tp:points-updated", { detail: { source: "fantasy-celebrate", delta: bellDelta } }));
      }
    }
    const uid = getUserId() ?? "";
    if (!uid) return;
    const linkUrl = `${window.location.pathname}${window.location.search}`;
    void fetch("/api/notifications/celebrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, game: "fantasy", linkUrl }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { celebrate: boolean; delta: number };
        if (!fromBell && data.celebrate) {
          triggerAnimation("FANTASY_LIVE_COLLECT");
          if (data.delta > 0) {
            window.dispatchEvent(new CustomEvent("tp:coin-flight", { detail: { delta: data.delta, coins: Math.min(18, Math.max(6, Math.round(data.delta / 2))) } }));
            window.dispatchEvent(new CustomEvent("tp:points-updated", { detail: { source: "fantasy-celebrate", delta: data.delta } }));
          }
        }
      })
      .catch(() => {});
  }, [triggerAnimation]);

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
    if (!venueId || DISABLE_GEOFENCE_FOR_TESTING || getGodMode()) {
      setIsGeofencePaused(false);
      setGeofencePauseReason("");
      return;
    }

    let active = true;
    const verify = async () => {
      try {
        const venueResponse = await fetch("/api/venues", { cache: "no-store" });
        const venuePayload = await parseJsonResponse<{
          ok?: boolean;
          venues?: Array<{ id: string; latitude: number; longitude: number; radius: number }>;
        }>(venueResponse, "Failed to load venue data");
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
      const payload = await parseJsonResponse<GamesPayload>(response, "Failed to load fantasy games");
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
      const payload = await parseJsonResponse<EntriesPayload>(response, "Failed to load fantasy entries");
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
      // Only wipe displayed entries when this is the visible primary load.
      // Silent background refreshes (showLoading=false) should leave existing
      // data intact so a transient timeout or network hiccup doesn't blank the page.
      if (showLoading) {
        setEntries([]);
      }
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
    const statFlashTimers = statFlashTimersRef.current;
    return () => {
      for (const timer of statFlashTimers.values()) {
        window.clearTimeout(timer);
      }
      statFlashTimers.clear();
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

  const loadSelectedGameDetails = useCallback(async (isBackgroundRefresh = false) => {
    if (!selectedGameId) {
      setPlayerPool([]);
      setPlayerPoolEmptyReason(null);
      setLeaderboard([]);
      setIsLoadingPool(false);
      return;
    }

    if (selectedSport !== "nba" && selectedSport !== "wnba" && selectedSport !== "baseball") {
      setPlayerPool([]);
      setPlayerPoolEmptyReason(null);
      setLeaderboard([]);
      setIsLoadingPool(false);
      return;
    }

    if (!isBackgroundRefresh) {
      setIsLoadingPool(true);
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

      if (selectedSport === "baseball" || selectedSport === "nba" || selectedSport === "wnba") {
        const sportGameId = getGameIdForSportDate(selectedSport, gameDate);
        const sportRes = await fetch(`/api/fantasy/games?${makeParams(sportGameId)}`, { cache: "no-store" });
        const sportPayload = await parseJsonResponse<GamesPayload>(sportRes, "Failed to load fantasy player pool");
        if (requestNonce !== gameDetailsRequestNonceRef.current) return;
        setPlayerPool(sportPayload.playerPool ?? []);
        setPlayerPoolEmptyReason(sportPayload.playerPoolEmptyReason ?? null);
        setLeaderboard(sportPayload.leaderboard ?? []);
        setSelectedPlayers((current) => {
          const poolKeys = new Set((sportPayload.playerPool ?? []).map((item) => item.playerName));
          return current.filter((name) => poolKeys.has(name));
        });
        return;
      }
    } catch (error) {
      setPlayerPool([]);
      setPlayerPoolEmptyReason(null);
      setLeaderboard([]);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load fantasy player pool.");
    } finally {
      setIsLoadingPool(false);
    }
  }, [selectedGameId, selectedDate, selectedSport, venueId]);

  useEffect(() => {
    setSelectedPlayers([]);
    setPlayerPool([]);
    setPlayerPoolEmptyReason(null);
    setLeaderboard([]);
    setSortBy("projected");
    setFilterPosition("all");
    setFilterTeam("all");
    setVisibleCount(25);
    setHasStartedGame(false);
    setHasLocalLineupDraft(false);
    setDraftSubmissionAttempted(false);
    setJustSubmittedRoster(false);
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
  }, [loadEntries, userId]);

  useEffect(() => {
    const targetEntryId = initialEntryId.trim();
    if (!targetEntryId || entries.length === 0 || hasAppliedInitialEntryRef.current) {
      return;
    }
    const targetEntry = entries.find((entry) => entry.id === targetEntryId);
    if (!targetEntry) {
      return;
    }
    hasAppliedInitialEntryRef.current = true;
    const targetDate = parseDailyGameDateFromId(targetEntry.gameId) ?? toLocalDateInput(new Date(targetEntry.startsAt));
    if (isValidDateInput(targetDate)) {
      setSelectedDate(targetDate);
    }
    setSelectedSport(getFantasySportFromEntrySportKey(targetEntry.sportKey));
  }, [entries, initialEntryId]);

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
  const playerPoolJerseyByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of playerPool) {
      const key = normalizePlayerKey(item.playerName);
      const num = String(item.jerseyNumber ?? "").trim();
      if (!key || !num || map.has(key)) {
        continue;
      }
      map.set(key, num);
    }
    return map;
  }, [playerPool]);
  const playerPoolItemByKey = useMemo(() => {
    const map = new Map<string, FantasyPlayerPoolItem>();
    for (const item of playerPool) {
      const key = normalizePlayerKey(item.playerName);
      if (!key || map.has(key)) {
        continue;
      }
      map.set(key, item);
    }
    return map;
  }, [playerPool]);
  const selectedPlayerPoolItems = useMemo(
    () =>
      selectedPlayers
        .map((name) => playerPoolItemByKey.get(normalizePlayerKey(name)) ?? null)
        .filter((item): item is FantasyPlayerPoolItem => Boolean(item)),
    [playerPoolItemByKey, selectedPlayers]
  );
  const selectedMlbPitchers = useMemo(
    () => selectedPlayerPoolItems.filter((item) => getMlbRosterRole(item.position) === "pitcher"),
    [selectedPlayerPoolItems]
  );
  const selectedMlbHitters = useMemo(
    () => selectedPlayerPoolItems.filter((item) => getMlbRosterRole(item.position) === "hitter"),
    [selectedPlayerPoolItems]
  );
  const hasResolvedEntries = !loadingEntries;
  const canEditExistingEntryLineup = useMemo(() => {
    if (!existingEntryForSelectedGame) {
      return false;
    }
    if (selectedDate < serverTodayDate) {
      return false;
    }
    if (existingEntryForSelectedGame.status === "final" || existingEntryForSelectedGame.status === "canceled") {
      return false;
    }
    return true;
  }, [existingEntryForSelectedGame, selectedDate, serverTodayDate]);

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
      const data = await parseJsonResponse<{ ok: boolean; result?: { platformPointsAwarded: number }; error?: string }>(res, "Failed to collect live fantasy points");
      if (!data.ok) throw new Error(data.error ?? "Collection failed");
      const awarded = data.result?.platformPointsAwarded ?? 0;
      setLastCollectedPoints((prev) => prev + awarded);
      if (awarded > 0) {
        triggerAnimation("FANTASY_LIVE_COLLECT");
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
  }, [isCollectingLive, isGeofencePaused, trackedEntry, triggerAnimation, uncollectedPoints, userId]);

  useEffect(() => {
    if (!trackedEntry || uncollectedPoints <= 0 || isGeofencePaused) {
      if (autoCollectLiveTimerRef.current !== null) {
        window.clearTimeout(autoCollectLiveTimerRef.current);
        autoCollectLiveTimerRef.current = null;
      }
      return;
    }
    if (autoCollectLiveTimerRef.current !== null) return;
    autoCollectLiveTimerRef.current = window.setTimeout(() => {
      autoCollectLiveTimerRef.current = null;
      void collectLivePoints();
    }, 3000);
    return () => {
      if (autoCollectLiveTimerRef.current !== null) {
        window.clearTimeout(autoCollectLiveTimerRef.current);
        autoCollectLiveTimerRef.current = null;
      }
    };
  }, [collectLivePoints, isGeofencePaused, trackedEntry, uncollectedPoints]);

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
        "broadcast",
        { event: "entry_updated" },
        (payload) => {
          console.log("[FantasyRealtime] entry_updated broadcast", payload);
          if (!active) {
            return;
          }
          setLastRealtimeMessageAt(Date.now());

          const nextEntry = mapRealtimeEntry((payload.payload ?? null) as FantasyEntryRealtimeRow);
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
    // Pass refreshSettlement=false so the server only reads DB state — the cron jobs
    // handle scoring, and triggering a server-side refresh here can cause Vercel timeouts.
    const scheduleFallbackRefresh = () => {
      if (!active || fantasyRealtimeFallbackTimerRef.current) {
        return;
      }
      fantasyRealtimeFallbackTimerRef.current = window.setTimeout(() => {
        fantasyRealtimeFallbackTimerRef.current = null;
        void loadEntries(false, false);
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

  // Stable primitives — only change when the user switches sport/entry, not on score updates.
  const trackedEntryId = trackedEntry?.id ?? null;
  const trackedEntrySportKey = trackedEntry?.sportKey ?? null;

  useEffect(() => {
    if (!supabase || !trackedEntrySportKey) return;
    const client = supabase;
    let active = true;

    const channel = client
      .channel(`live-stats:${trackedEntrySportKey}`)
      .on(
        "broadcast",
        { event: "stat_update" },
        (payload) => {
          if (!active) return;
          if (geofencePauseRef.current) return;
          const row = (payload.payload ?? null) as LiveStatsRealtimeRow | null;
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
            if (change.pointsDelta > 0) {
              window.__fantasyStatFlash   = change.flashLabel;
              window.__fantasyPointsDelta = change.pointsDelta;
              triggerAnimation("FANTASY_SCORE_UP");
            }
          }

          setLastRealtimeMessageAt(Date.now());
        }
      )
      .subscribe();

    return () => {
      active = false;
      void client.removeChannel(channel);
      prevStatsSnapshotRef.current.clear();
    };
  }, [markPlayersAsHot, pushStatFlash, triggerAnimation, triggerPlayerScorePop, triggerTotalScorePop, trackedEntryId, trackedEntrySportKey]);

  useEffect(() => {
    if (!userId || !supabase) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadEntries(true, false);
      void loadSelectedGameDetails(true);
      void loadGames(selectedDate);
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadEntries, loadGames, loadSelectedGameDetails, selectedDate, userId]);

  useEffect(() => {
    if (!selectedGameId) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadSelectedGameDetails(true);
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
      void loadSelectedGameDetails(true);
      void loadGames(selectedDate);
    }, delayMs);
    return () => {
      if (fantasyKickoffRefreshTimerRef.current) {
        window.clearTimeout(fantasyKickoffRefreshTimerRef.current);
        fantasyKickoffRefreshTimerRef.current = null;
      }
    };
  }, [hasLiveEntry, loadEntries, loadGames, loadSelectedGameDetails, nextPendingEntryStartMs, selectedDate, userId]);

  const togglePlayer = useCallback((player: FantasyPlayerPoolItem) => {
    const playerName = player.playerName;
    setJustSubmittedRoster(false);
    setHasLocalLineupDraft(true);
    setSelectedPlayers((current) => {
      if (current.includes(playerName)) {
        return current.filter((name) => name !== playerName);
      }
      if (selectedSport === "baseball") {
        const role = getMlbRosterRole(player.position);
        const currentItems = current
          .map((name) => playerPoolItemByKey.get(normalizePlayerKey(name)) ?? null)
          .filter((item): item is FantasyPlayerPoolItem => Boolean(item));
        const pitcherCount = currentItems.filter((item) => getMlbRosterRole(item.position) === "pitcher").length;
        const hitterCount = currentItems.filter((item) => getMlbRosterRole(item.position) === "hitter").length;
        if (role === "pitcher" && pitcherCount >= FANTASY_MLB_PITCHER_COUNT) {
          return current;
        }
        if (role === "hitter" && hitterCount >= FANTASY_MLB_HITTER_COUNT) {
          return current;
        }
      }
      if (current.length >= requiredLineupSize) {
        return current;
      }
      return [...current, playerName];
    });
  }, [playerPoolItemByKey, requiredLineupSize, selectedSport]);

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

      const payload = await parseJsonResponse<{ ok: boolean; error?: string }>(response, "Failed to submit fantasy lineup");
      if (!payload.ok) {
        const message = payload.error ?? "Failed to submit fantasy lineup.";
        if (isDuplicateSlateEntryError(message)) {
          clearDraftStorage();
          setHasLocalLineupDraft(false);
          setIsEditingRoster(false);
          const refreshedEntries = await loadEntries(true);
          await loadSelectedGameDetails(true);
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
      await Promise.all([loadEntries(true), loadSelectedGameDetails(true)]);
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

    if (selectedSport === "baseball" && (selectedMlbPitchers.length !== FANTASY_MLB_PITCHER_COUNT || selectedMlbHitters.length !== FANTASY_MLB_HITTER_COUNT)) {
      const missingPitchers = Math.max(0, FANTASY_MLB_PITCHER_COUNT - selectedMlbPitchers.length);
      const missingHitters = Math.max(0, FANTASY_MLB_HITTER_COUNT - selectedMlbHitters.length);
      const needs: string[] = [];
      if (missingPitchers > 0) {
        needs.push(`${missingPitchers} more pitcher${missingPitchers === 1 ? "" : "s"}`);
      }
      if (missingHitters > 0) {
        needs.push(`${missingHitters} more hitter${missingHitters === 1 ? "" : "s"}`);
      }
      setStatusMessage(
        selectedPlayers.length === 0
          ? "Draft 3 pitchers and 3 hitters to build your MLB roster."
          : `Draft ${needs.join(" and ")}, then tap ${existingEntryForSelectedGame ? "Update roster" : "Submit roster"}.`
      );
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
    selectedMlbHitters.length,
    selectedMlbPitchers.length,
    selectedSport,
  ]);

  const handleSubmitRoster = useCallback(async () => {
    setDraftSubmissionAttempted(true);
    const didSave = await persistLineup(selectedPlayers, Boolean(existingEntryForSelectedGame));
    if (didSave && existingEntryForSelectedGame) {
      setIsEditingRoster(false);
    }
  }, [existingEntryForSelectedGame, persistLineup, selectedPlayers]);

  const startEditingRoster = useCallback(() => {
    setJustSubmittedRoster(false);
    setIsEditingRoster(true);
    setStatusMessage("");
    setErrorMessage("");
  }, []);

  useEffect(() => {
    if (loadingEntries || !userId) return;
    const toCollect = entries.filter(
      (entry) =>
        entry.id &&
        entry.status === "final" &&
        !entry.rewardClaimedAt &&
        computeFantasyClaimablePoints(entry) > 0 &&
        !hasAutoCollectedFantasyRef.current.has(entry.id)
    );
    if (toCollect.length === 0) return;
    toCollect.forEach((entry) => hasAutoCollectedFantasyRef.current.add(entry.id));

    const run = async () => {
      let totalAwarded = 0;
      for (const entry of toCollect) {
        try {
          const response = await fetch("/api/fantasy/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "claim", userId, entryId: entry.id }),
          });
          const payload = await parseJsonResponse<{
            ok: boolean;
            result?: { claimed: boolean; pointsAwarded: number };
          }>(response, "Failed to collect fantasy entries");
          if (payload.ok && payload.result?.claimed) {
            totalAwarded += payload.result.pointsAwarded;
          }
        } catch {
          // continue collecting remaining entries
        }
      }
      if (totalAwarded > 0) {
        window.dispatchEvent(
          new CustomEvent("tp:coin-flight", {
            detail: {
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
        setSettledCollectResult({ pointsCollected: totalAwarded, entryCount: toCollect.length });
      }
      void loadEntries(false);
    };
    void run();
  }, [entries, loadEntries, loadingEntries, userId]);

  const myLeaderboardEntry = useMemo(
    () => leaderboard.find((row) => row.userId === userId) ?? null,
    [leaderboard, userId]
  );
  const venueAvgPoints = useMemo(() => {
    if (leaderboard.length === 0) {
      return 0;
    }
    const sum = leaderboard.reduce((acc, row) => acc + Number(row.points ?? 0), 0);
    return sum / leaderboard.length;
  }, [leaderboard]);
  const liveScoringCount = useMemo(() => {
    let count = 0;
    for (const value of livePointsByPlayer.values()) {
      if (value > 0) {
        count += 1;
      }
    }
    return count;
  }, [livePointsByPlayer]);
  const selectedPlayerKeySet = useMemo(
    () => new Set(selectedPlayers.map((name) => normalizePlayerKey(name))),
    [selectedPlayers]
  );
  // Show the full pool including drafted players so they render inline as
  // "✓ Drafted" (chalkboard design); selection state still drives the toggle.
  const availablePlayerPool = useMemo(() => playerPool, [playerPool]);

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
  const topProjectedPlayerKey = useMemo(() => {
    let key: string | null = null;
    let best = Number.NEGATIVE_INFINITY;
    for (const item of sortedFilteredPool) {
      const projected = Number(item.projectedLine ?? 0);
      if (projected > best) {
        best = projected;
        key = normalizePlayerKey(item.playerName);
      }
    }
    return best > 0 ? key : null;
  }, [sortedFilteredPool]);


  if (!userId || !venueId) {
    return (
      <div className="rounded-2xl border border-amber-400/40 bg-amber-950/30 p-3 text-sm text-amber-300">
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
  // Per-sport roster status for the multi-sport toggle dots (live > set > final).
  const entryStatusBySport: Partial<Record<FantasySport, "live" | "set" | "final">> = {};
  const entryStatusRank = (status: "live" | "set" | "final" | undefined): number =>
    status === "live" ? 3 : status === "set" ? 2 : status === "final" ? 1 : 0;
  for (const entry of entries) {
    const entrySport = getFantasySportFromEntrySportKey(entry.sportKey);
    const next: "live" | "set" | "final" | undefined =
      entry.status === "live" ? "live" : entry.status === "pending" ? "set" : entry.status === "final" ? "final" : undefined;
    if (next && entryStatusRank(next) > entryStatusRank(entryStatusBySport[entrySport])) {
      entryStatusBySport[entrySport] = next;
    }
  }
  const totalEntryCount = Object.values(entryStatusBySport).filter(Boolean).length;
  const crossSportLiveSport = FANTASY_SPORTS.find(
    (sport) => sport.key !== selectedSport && entryStatusBySport[sport.key] === "live"
  );
  const draftCtaLabel = existingEntryForSelectedGame ? "Edit your roster" : "Draft your roster";
  const isFantasyLineupSport = selectedSport === "nba" || selectedSport === "wnba" || selectedSport === "baseball";
  const selectedSportLabel =
    selectedSport === "baseball" ? "baseball" : selectedSport === "wnba" ? "WNBA" : "NBA";
  let emptyPlayerPoolMessage = "";
  if (!isLoadingPool && availablePlayerPool.length === 0) {
    if (playerPoolEmptyReason === "all-games-started") {
      emptyPlayerPoolMessage = `No players are available to draft because all ${selectedSportLabel} games for this slate are already in progress.`;
    } else if (playerPoolEmptyReason === "no-games") {
      emptyPlayerPoolMessage = `No ${selectedSportLabel} games are scheduled for this date.`;
    } else {
      emptyPlayerPoolMessage = `No ${selectedSportLabel} players are available to draft for this slate right now.`;
    }
  }
  const showPoolLoader =
    isFantasyLineupSport &&
    Boolean(selectedGameId) &&
    hasResolvedEntries &&
    isLoadingPool &&
    !isPastSelectedDate &&
    !hasActiveDraftedEntry &&
    !existingEntryForSelectedGame &&
    !hasStartedGame;
  const showGameStart =
    isFantasyLineupSport &&
    selectedGameId &&
    hasResolvedEntries &&
    !isLoadingPool &&
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
  const selectedPlayerCount = selectedPlayers.length;
  const isBaseballRosterComplete =
    selectedSport === "baseball" &&
    selectedMlbPitchers.length === FANTASY_MLB_PITCHER_COUNT &&
    selectedMlbHitters.length === FANTASY_MLB_HITTER_COUNT;
  const isLineupComplete =
    selectedSport === "baseball"
      ? selectedPlayers.length === requiredLineupSize && isBaseballRosterComplete
      : selectedPlayers.length === requiredLineupSize;
  const remainingLineupSlots = Math.max(0, requiredLineupSize - selectedPlayerCount);
  const remainingMlbPitchers = Math.max(0, FANTASY_MLB_PITCHER_COUNT - selectedMlbPitchers.length);
  const remainingMlbHitters = Math.max(0, FANTASY_MLB_HITTER_COUNT - selectedMlbHitters.length);
  const showFloatingRosterCta =
    isFantasyLineupSport &&
    Boolean(selectedGameId) &&
    !isPastSelectedDate &&
    canModifyRosterSelections &&
    selectedPlayerCount > 0;
  const floatingRosterCtaLabel = isLineupComplete
    ? `${existingEntryForSelectedGame ? "Update" : "Submit"} Roster!`
    : selectedSport === "baseball"
    ? remainingMlbPitchers > 0 && remainingMlbHitters > 0
      ? `Draft ${remainingMlbPitchers} pitcher${remainingMlbPitchers === 1 ? "" : "s"} and ${remainingMlbHitters} hitter${remainingMlbHitters === 1 ? "" : "s"}`
      : remainingMlbPitchers > 0
      ? `Draft ${remainingMlbPitchers} pitcher${remainingMlbPitchers === 1 ? "" : "s"}`
      : `Draft ${remainingMlbHitters} hitter${remainingMlbHitters === 1 ? "" : "s"}`
    : `Draft ${remainingLineupSlots} player${remainingLineupSlots === 1 ? "" : "s"}!`;
  const fantasyBottomPadding = showFloatingRosterCta
    ? "calc(7rem + env(safe-area-inset-bottom, 0px))"
    : "max(env(safe-area-inset-bottom, 0px), 2rem)";

  return (
    <div
      className="tp-fantasy-compact min-h-[100dvh] touch-pan-y bg-[#020617] text-[#f8fafc]"
      style={{ paddingBottom: fantasyBottomPadding }}
    >
      {settledCollectResult ? (
        <FantasySettledCollectAnimation
          pointsCollected={settledCollectResult.pointsCollected}
          entryCount={settledCollectResult.entryCount}
          onComplete={() => setSettledCollectResult(null)}
        />
      ) : null}
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
              className={`rounded-full border px-4 py-1.5 text-sm font-black shadow-[0_8px_24px_rgba(15,23,42,0.45)] ${
                flash.pointsDelta >= 0
                  ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                  : "border-rose-400/50 bg-rose-950/40 text-rose-300"
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

      {/* ── Unified app bar (Venue back · hamburger · identity · points · alerts) ── */}
      <GameAppBar game="fantasy" onExit={onBack} />

      <div className="mx-auto w-full max-w-[30rem] space-y-3 px-4 pt-3">

        {/* ── Consolidated control band: multi-sport roster toggle + browse-past-days stepper ── */}
        <div className="overflow-hidden rounded-xl border border-amber-200/[0.18] bg-amber-200/[0.04]">
          {/* Sport-entry toggle — switch between your rosters, each with its own status dot */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FANTASY_SPORTS.map((sport) => {
                const on = selectedSport === sport.key;
                const status = entryStatusBySport[sport.key];
                const dotClass =
                  status === "live"
                    ? "animate-pulse bg-emerald-400"
                    : status === "set"
                    ? "bg-amber-200"
                    : status === "final"
                    ? "bg-slate-400"
                    : "";
                return (
                  <button
                    key={sport.key}
                    type="button"
                    disabled={!sport.available}
                    onClick={() => sport.available && setSelectedSport(sport.key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black tracking-[0.03em] transition-colors disabled:cursor-not-allowed ${
                      on
                        ? "border-amber-200 bg-amber-200 text-[#0a3128]"
                        : sport.available
                        ? status
                          ? "border-amber-200/30 bg-white/[0.03] text-amber-200"
                          : "border-white/[0.12] bg-white/[0.03] text-slate-400"
                        : "border-white/[0.12] bg-white/[0.03] text-slate-600 opacity-55"
                    }`}
                  >
                    {status && !on ? <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} /> : null}
                    {sport.label}
                    {!sport.available ? (
                      <span className={`text-[8px] font-extrabold uppercase tracking-[0.1em] ${on ? "text-[#0a3128]/70" : "text-slate-500"}`}>
                        Soon
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <span className="shrink-0 pr-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-200/55">
              {totalEntryCount} {totalEntryCount === 1 ? "entry" : "entries"}
            </span>
          </div>

          <div className="h-px bg-white/[0.07]" />

          {/* Date stepper — walk back through previous days + day status */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <button
              type="button"
              onClick={navigateToPrevDay}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200/30 bg-black/25 text-[10px] font-black text-amber-200 active:scale-90"
              aria-label="Previous day"
            >
              ◀
            </button>
            <div className="min-w-0 flex-1 text-center">
              <span className="text-[25px] font-black text-[#fef3c7]">{formatDateLabel(selectedDate, serverTodayDate)}</span>
            </div>
            <button
              type="button"
              onClick={navigateToNextDay}
              disabled={isToday}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-200/30 bg-black/25 text-[10px] font-black text-amber-200 active:scale-90 disabled:opacity-30"
              aria-label="Next day"
            >
              ▶
            </button>
            <span
              className={`shrink-0 whitespace-nowrap pr-1 text-[9px] font-black uppercase tracking-[0.06em] ${
                isPastSelectedDate ? "text-slate-400" : "text-amber-200"
              }`}
            >
              {isPastSelectedDate
                ? "Final"
                : isFantasyLineupSport && sportGames.length > 0
                ? selectedSport === "baseball"
                  ? "Locks at pitch"
                  : "Locks at tip"
                : isToday
                ? "Today"
                : ""}
            </span>
          </div>
        </div>

        {/* Cross-sport nudge — you already have a roster live elsewhere */}
        {crossSportLiveSport ? (
          <button
            type="button"
            onClick={() => setSelectedSport(crossSportLiveSport.key)}
            className="flex w-full items-center gap-2 rounded-[10px] border border-emerald-300/30 bg-emerald-500/[0.07] px-3 py-2 text-left"
          >
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-[10.5px] font-bold leading-snug text-emerald-200">
              Your <b className="text-[#6ee7b7]">{crossSportLiveSport.label}</b> roster is live right now — tap to sweat it.
            </span>
          </button>
        ) : null}

        <VenueEntryRulesPanel gameKey="fantasy" shouldDisplay={entries.length === 0} />

        {isGeofencePaused ? (
          <p className="rounded-xl border border-amber-400/40 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-200">
            {geofencePauseReason || "Fantasy scoring is paused while outside the venue geofence."}
          </p>
        ) : null}

        {statusMessage ? (
          <p className="rounded-xl border border-emerald-400/40 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-300">
            {statusMessage}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-xl border border-rose-400/40 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-300">
            {errorMessage}
          </p>
        ) : null}

        {/* ── LIVE SCORING (shown whenever a tracked entry exists) ── */}
        {isFantasyLineupSport && trackedEntry ? (
          <>
            {/* My Sweat / Leaderboard tabs (replaces the leaderboard show/hide toggle) */}
            <ViewTabs
              game="fantasy"
              active={activeFantasyTab}
              onPick={(id) => setActiveFantasyTab(id === "leaderboard" ? "leaderboard" : "sweat")}
              tabs={[
                { id: "sweat", label: "My Sweat", live: hasLiveEntry },
                { id: "leaderboard", label: "Leaderboard", count: leaderboard.length > 0 ? leaderboard.length : undefined },
              ]}
            />

            {activeFantasyTab === "sweat" ? (
              <>
            {/* Total FP scoreboard */}
            <div className="relative overflow-hidden rounded-[18px] border-2 border-[#fef3c7]/55 bg-[#0a3128] px-3.5 pb-4 pt-3.5">
              <ChalkGrid />
              <div className="relative z-[2]">
                <div className="flex items-center justify-between">
                  <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-[#fde68a]">Live Game</p>
                  {hasLiveEntry ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6ee7b7]/45 bg-emerald-500/15 px-2 py-1 text-[9.5px] font-black uppercase tracking-[0.16em] text-[#6ee7b7]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                      Live
                    </span>
                  ) : null}
                </div>
                <SpringPop popKey={totalScorePopTick} glowSize={14} glowColor={totalScorePopTone === "loss" ? "red" : "green"}>
                  <div className="mt-1.5 flex items-end gap-2.5">
                    <span className={`font-mono text-[46px] font-[900] leading-[0.95] tabular-nums ${
                      totalScorePopTone === "loss" ? "text-rose-400" : isRealtimeFresh ? "text-[#6ee7b7]" : "text-[#fef3c7]"
                    }`}>
                      {liveTrackedEntryPoints.toFixed(1)}
                    </span>
                    <span className="pb-1.5 text-[11px] font-extrabold uppercase leading-tight tracking-[0.08em] text-[#fef3c7]/55">
                      fantasy
                      <br />
                      points
                    </span>
                  </div>
                </SpringPop>
                <div className="mt-3 flex gap-2">
                  {[
                    {
                      l: "Venue rank",
                      v: myLeaderboardEntry ? ordinalLabel(myLeaderboardEntry.rank) : "—",
                      sub: leaderboard.length > 0 ? `of ${leaderboard.length}` : "—",
                      c: "text-[#6ee7b7]",
                    },
                    {
                      l: "Venue avg",
                      v: venueAvgPoints > 0 ? venueAvgPoints.toFixed(1) : "—",
                      sub:
                        venueAvgPoints > 0
                          ? `${liveTrackedEntryPoints - venueAvgPoints >= 0 ? "+" : ""}${(liveTrackedEntryPoints - venueAvgPoints).toFixed(1)}`
                          : "—",
                      c: "text-[#fde68a]",
                    },
                    {
                      l: "Players live",
                      v: `${liveScoringCount}/${requiredLineupSize}`,
                      sub: "scoring",
                      c: "text-[#67e8f9]",
                    },
                  ].map((stat) => (
                    <div key={stat.l} className="flex-1 rounded-[10px] border border-[#fef3c7]/[0.18] bg-black/30 px-2 py-1.5">
                      <div className="text-[8px] font-black uppercase tracking-[0.12em] text-[#fef3c7]/55">{stat.l}</div>
                      <div className={`mt-0.5 font-mono text-[15px] font-[900] tabular-nums ${stat.c}`}>{stat.v}</div>
                      <div className="text-[9px] font-bold text-slate-500">{stat.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Geofence status banner */}
            {!isGeofencePaused && hasLiveEntry ? (
              <div className="flex items-center gap-2 rounded-[10px] border border-sky-400/30 bg-sky-400/[0.08] px-3 py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
                <span className="text-[10px] font-bold leading-snug text-sky-200">At the venue — live scoring active. Leave and scoring pauses.</span>
              </div>
            ) : null}

            {/* Points ticker */}
            {statFlashes.length > 0 ? (
              <div className="rounded-xl border border-[#6ee7b7]/[0.28] bg-emerald-500/[0.06] px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-[#6ee7b7]">Points ticker</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {statFlashes.map((flash) => (
                    <div key={flash.id} className="flex items-center gap-2">
                      <span className="min-w-[72px] shrink-0 rounded border border-[#6ee7b7]/35 bg-emerald-500/15 px-1.5 py-0.5 text-center text-[8px] font-black tracking-[0.08em] text-[#6ee7b7]">
                        {flash.label}
                      </span>
                      <span className={`shrink-0 font-mono text-[11px] font-[900] tabular-nums ${flash.pointsDelta >= 0 ? "text-[#6ee7b7]" : "text-rose-300"}`}>
                        {flash.pointsDelta >= 0 ? "+" : ""}{flash.pointsDelta.toFixed(1)} FP
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Your roster */}
            <div>
                <p className="mb-2.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
                  {canEditExistingEntryLineup ? "Your roster" : "Your roster · locked"}
                </p>
                <div className="flex flex-col gap-2.5">
                  {(
                    trackedEntry.lineupPlayers.length > 0
                      ? trackedEntry.lineupPlayers
                      : trackedEntry.lineup.map((playerName, index) => ({
                          playerId: -(index + 1),
                          playerName,
                          headshotUrl: null,
                          jerseyNumber: null,
                        }))
                  ).map((player) => {
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
                    const isScoring = playerPoints > 0;
                    const poolItem = playerPool.find(
                      (it) => normalizePlayerKey(it.playerName) === normalizePlayerKey(player.playerName)
                    );
                    return (
                      <div
                        key={`${trackedEntry.id}-${player.playerId}`}
                        className={`grid grid-cols-[60px_1fr_auto] items-center gap-3.5 rounded-[18px] border px-4 py-4 transition-all duration-300 ${
                          isHot
                            ? popTone === "loss"
                              ? "scale-[1.02] border-rose-400/40 bg-rose-950/20"
                              : "scale-[1.02] border-emerald-400/40 bg-emerald-950/20"
                            : "border-[#fef3c7]/[0.22] bg-[#fef3c7]/[0.045]"
                        }`}
                      >
                        <PlayerHeadshot
                          src={player.headshotUrl ?? playerPoolHeadshotByName.get(normalizePlayerKey(player.playerName)) ?? null}
                          name={player.playerName}
                          jerseyNumber={player.jerseyNumber ?? playerPoolJerseyByName.get(normalizePlayerKey(player.playerName)) ?? null}
                          live={isScoring}
                          sizeClass="h-[60px] w-[60px]"
                        />
                        <div className="min-w-0 leading-tight">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`truncate text-[15px] font-black ${
                              isHot ? (popTone === "loss" ? "text-rose-300" : "text-emerald-300") : "text-[#fef3c7]"
                            }`}>
                              {player.playerName}
                            </span>
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-[0.08em] ${
                              isScoring
                                ? "border border-[#6ee7b7]/40 bg-emerald-500/15 text-[#6ee7b7]"
                                : "border border-white/10 bg-white/5 text-slate-400"
                            }`}>
                              {isScoring ? <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" /> : null}
                              {isScoring ? "Live" : "Pending"}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-[11px] font-bold text-[#fef3c7]/55">
                            {poolItem?.position ? <span className="text-[#fde68a]">{poolItem.position}</span> : null}
                            {poolItem?.position && poolItem?.team ? " · " : null}
                            {poolItem?.team ?? trackedEntry.gameLabel}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-[#fef3c7]/45">FP</div>
                          <SpringPop
                            popKey={playerPopTickById[String(player.playerId)] ?? 0}
                            glowSize={12}
                            glowColor={popTone === "loss" ? "red" : "green"}
                            className={`font-mono text-[24px] font-[900] leading-[1.05] tabular-nums ${
                              isHot ? (popTone === "loss" ? "text-rose-200" : "text-emerald-200") : "text-[#fde68a]"
                            }`}
                          >
                            {playerPoints.toFixed(1)}
                          </SpringPop>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {existingEntryForSelectedGame && canEditExistingEntryLineup && !isEditingRoster ? (
                  <button
                    type="button"
                    onClick={startEditingRoster}
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[12px] border border-[#fde68a]/50 bg-[#fde68a]/15 text-[12.5px] font-black uppercase tracking-[0.08em] text-[#fde68a] active:scale-[0.98]"
                  >
                    Edit Roster
                  </button>
                ) : null}
              </div>

            {hasLiveEntry ? (
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <p className="text-[11px] font-semibold text-[#6ee7b7]">Live · Streaming updates</p>
              </div>
            ) : null}
              </>
            ) : (
              /* Leaderboard tab — full venue board */
              leaderboard.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-[#fef3c7]/[0.18] bg-[#0f172a]">
                  {leaderboard.map((row, i) => {
                    const isMe = row.userId === userId;
                    return (
                      <div
                        key={row.entryId}
                        className={`flex items-center justify-between px-3.5 py-3 ${i ? "border-t border-white/5" : ""} ${isMe ? "bg-[#fef3c7]/[0.06]" : ""}`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className={`w-5 font-mono text-[13px] font-[900] tabular-nums ${row.rank <= 3 ? "text-[#fde68a]" : "text-slate-500"}`}>
                            {row.rank}
                          </span>
                          <span className={`truncate text-[13px] ${isMe ? "font-black text-[#fef3c7]" : "font-bold text-slate-300"}`}>
                            {isMe ? "You" : row.username}
                          </span>
                        </div>
                        <span className={`font-mono text-[14px] font-[900] tabular-nums ${isMe ? "text-[#6ee7b7]" : "text-slate-200"}`}>
                          {Number(row.points ?? 0).toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-[#fef3c7]/[0.18] bg-[#0f172a] p-5 text-center text-[12px] font-bold text-slate-400">
                  No venue entries yet.
                </div>
              )
            )}
          </>
        ) : null}

        {/* ── DRAFT / player pool (conditional primary zone; hidden on the Leaderboard tab) ── */}
        {activeFantasyTab === "sweat" ? (
          <>
            {selectedSport === "football" ? (
              <div className="rounded-2xl border border-[#fef3c7]/20 bg-[#0a3128] p-4 text-center">
                <p className="text-sm font-extrabold text-[#fef3c7]">🏈 Football fantasy is coming soon!</p>
              </div>
            ) : null}

            {/* Pool loading state — shown while player pool is being fetched */}
            {showPoolLoader ? (
              <div className="relative overflow-hidden rounded-2xl border border-[#fef3c7]/30 bg-[#0a3128] p-4">
                <ChalkGrid fine />
                <div className="relative z-[2] flex items-center gap-3">
                  <BasketballLoader label="Loading today's player pool…" />
                </div>
              </div>
            ) : null}

            {/* Game start prompt */}
            {showGameStart ? (
              <div
                className={`relative overflow-hidden rounded-2xl border border-[#fef3c7]/30 bg-[#0a3128] ${
                  sportGames.length === 0 ? "p-8" : "p-4"
                }`}
              >
                <ChalkGrid fine />
                <div className="relative z-[2]">
                  {sportGames.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-2 text-center">
                      <p className="text-2xl">{FANTASY_SPORTS.find((s) => s.key === selectedSport)?.icon ?? "🏆"}</p>
                      <p className="text-base font-bold text-[#fde68a]">No {selectedSportLabel} games scheduled</p>
                      <p className="text-xs text-[#fef3c7]/50">Check back on a game day or browse another sport</p>
                    </div>
                  ) : (
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#fde68a]">
                      {`${selectedSportLabel} · ${nextUnlockedGame ? "Next game" : "First game"} ${formatLocalDateTime((nextUnlockedGame ?? sportGames[0])!.startsAt)}`}
                    </p>
                  )}
                  {sportGames.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setHasStartedGame(true)}
                      className="mt-3 w-full rounded-xl bg-[#8b5cf6] py-3 text-sm font-black uppercase tracking-[0.04em] text-white shadow-[0_8px_24px_rgba(139,92,246,0.35)] active:scale-[0.98]"
                    >
                      {draftCtaLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Lineup builder */}
            {showLineupBuilder ? (
              <>
                {/* Chalkboard roster strip */}
                <div className="relative overflow-hidden rounded-[14px] border border-[#fef3c7]/35 bg-[#0a3128] px-3 py-3">
                  <ChalkGrid fine />
                  <div className="relative z-[2]">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[10.5px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
                          Your lineup · {selectedPlayers.length}/{requiredLineupSize}
                        </p>
                        {selectedSport === "baseball" ? (
                          <>
                            <span className="inline-flex items-center rounded-full border border-sky-300/35 bg-sky-400/10 px-2 py-1 text-[8.5px] font-black uppercase tracking-[0.1em] text-sky-200">
                              Pitchers {selectedMlbPitchers.length}/{FANTASY_MLB_PITCHER_COUNT}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-amber-300/35 bg-amber-400/10 px-2 py-1 text-[8.5px] font-black uppercase tracking-[0.1em] text-amber-200">
                              Hitters {selectedMlbHitters.length}/{FANTASY_MLB_HITTER_COUNT}
                            </span>
                          </>
                        ) : null}
                      </div>
                      {isSubmittedRosterView && canEditExistingEntryLineup ? (
                        <button
                          type="button"
                          onClick={startEditingRoster}
                          className="text-[10px] font-bold text-[#fde68a] underline"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                    {selectedSport === "baseball" ? (
                      <div className="space-y-3">
                        {[
                          {
                            title: "Pitchers",
                            accent: "text-sky-200",
                            slotAccent: "border-sky-300/35 bg-sky-400/10",
                            emptyAccent: "border-sky-300/20 bg-sky-950/20",
                            players: selectedMlbPitchers,
                            total: FANTASY_MLB_PITCHER_COUNT,
                          },
                          {
                            title: "Hitters",
                            accent: "text-amber-200",
                            slotAccent: "border-amber-300/35 bg-amber-400/10",
                            emptyAccent: "border-amber-300/20 bg-amber-950/20",
                            players: selectedMlbHitters,
                            total: FANTASY_MLB_HITTER_COUNT,
                          },
                        ].map((section) => (
                          <div key={section.title}>
                            <div className="mb-2 flex items-center justify-between">
                              <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${section.accent}`}>
                                {section.title}
                              </p>
                              <span className="text-[9px] font-bold text-slate-400">
                                {section.players.length}/{section.total}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              {Array.from({ length: section.total }).map((_, i) => {
                                const item = section.players[i];
                                const name = item?.playerName ?? "";
                                const filled = Boolean(item);
                                return (
                                  <button
                                    key={`${section.title}-slot-${i}`}
                                    type="button"
                                    disabled={!filled || !canModifyRosterSelections}
                                    onClick={() => name && removeSelectedPlayer(name)}
                                    aria-label={filled ? `Remove ${name}` : `Empty ${section.title} slot`}
                                    className={`flex flex-col items-center justify-center gap-1.5 rounded-[11px] py-3.5 text-center transition-transform active:scale-95 disabled:cursor-default ${
                                      filled
                                        ? `border ${section.slotAccent}`
                                        : `border border-dashed ${section.emptyAccent}`
                                    }`}
                                  >
                                    {filled ? (
                                      <PlayerHeadshot
                                        src={playerPoolHeadshotByName.get(normalizePlayerKey(name)) ?? null}
                                        name={name}
                                        jerseyNumber={playerPoolJerseyByName.get(normalizePlayerKey(name)) ?? null}
                                        sizeClass="h-[42px] w-[42px]"
                                      />
                                    ) : (
                                      <span className="text-base font-black text-[#fef3c7]/55">+</span>
                                    )}
                                    {filled ? (
                                      <span className="w-full truncate px-1 text-[9px] font-black leading-tight text-[#fef3c7]">
                                        {name}
                                      </span>
                                    ) : null}
                                    <span className={`text-[8.5px] font-extrabold leading-none ${filled ? "text-[#fef3c7]" : "text-slate-500"}`}>
                                      {item?.position ?? (section.title === "Pitchers" ? "P" : "BAT")}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 gap-1">
                        {Array.from({ length: requiredLineupSize }).map((_, i) => {
                          const name = selectedPlayers[i];
                          const poolItem = name
                            ? playerPool.find((item) => normalizePlayerKey(item.playerName) === normalizePlayerKey(name))
                            : undefined;
                          const filled = Boolean(name);
                          const lineupName = splitPlayerNameForLineup(name ?? "");
                          return (
                            <button
                              key={`slot-${i}`}
                              type="button"
                              disabled={!filled || !canModifyRosterSelections}
                              onClick={() => name && removeSelectedPlayer(name)}
                              aria-label={filled ? `Remove ${name}` : "Empty roster slot"}
                              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] px-0.5 py-2.5 text-center transition-transform active:scale-95 disabled:cursor-default ${
                                filled
                                  ? "border border-[#fef3c7]/40 bg-[#fef3c7]/10"
                                  : "border border-dashed border-[#fef3c7]/25 bg-black/25"
                              }`}
                            >
                              {filled ? (
                                <PlayerHeadshot src={playerPoolHeadshotByName.get(normalizePlayerKey(name!)) ?? null} name={name!} jerseyNumber={playerPoolJerseyByName.get(normalizePlayerKey(name!)) ?? null} sizeClass="h-[34px] w-[34px]" />
                              ) : (
                                <span className="text-base font-black text-[#fef3c7]/55">+</span>
                              )}
                              {filled ? (
                                <span className="grid w-full min-w-0 px-0.5 text-center text-[8.5px] font-black leading-[0.95] text-[#fef3c7]">
                                  <span className="truncate">{lineupName.first}</span>
                                  {lineupName.rest ? <span className="truncate">{lineupName.rest}</span> : null}
                                </span>
                              ) : null}
                              <span className={`text-[8px] font-extrabold leading-none ${filled ? "text-[#fef3c7]" : "text-slate-500"}`}>
                                {poolItem?.position ?? "—"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {isSubmittedRosterView && canEditExistingEntryLineup ? (
                      <button
                        type="button"
                        onClick={startEditingRoster}
                        className="mt-2.5 flex min-h-[42px] w-full items-center justify-center rounded-[12px] border border-[#fde68a]/50 bg-[#fde68a]/15 text-[12px] font-black uppercase tracking-[0.08em] text-[#fde68a] active:scale-[0.98]"
                      >
                        Edit Roster
                      </button>
                    ) : null}
                    {!canModifyRosterSelections ? (
                      <p className="mt-2.5 text-[10.5px] text-[#fef3c7]/55">
                        {canEditExistingEntryLineup
                          ? "Roster locked in. Tap Edit to make changes before tipoff."
                          : "Roster locked — games have started."}
                      </p>
                    ) : selectedSport === "baseball" ? (
                      <p className="mt-2.5 text-[10.5px] text-[#fef3c7]/60">
                        Draft exactly 3 pitchers and 3 hitters for your MLB roster.
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Player pool */}
                {canModifyRosterSelections ? (
                  <div className="space-y-2.5">
                    {/* Sort + filter controls */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                      <span className="shrink-0 self-center text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Sort</span>
                      {(["projected", "alpha", "position", "team"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSortBy(mode)}
                          className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[10.5px] font-extrabold tracking-[0.04em] transition-colors ${
                            sortBy === mode
                              ? "border-[#fef3c7]/40 bg-[#fef3c7]/15 text-[#fef3c7]"
                              : "border-white/[0.12] bg-transparent text-slate-400"
                          }`}
                        >
                          {mode === "projected" ? "Proj" : mode === "alpha" ? "A–Z" : mode === "position" ? "Pos" : "Team"}
                        </button>
                      ))}
                      <span className="mx-0.5 h-4 w-px shrink-0 self-center bg-white/10" />
                      <select
                        value={filterPosition}
                        onChange={(e) => setFilterPosition(e.target.value)}
                        className="shrink-0 rounded-full border-white/[0.12] bg-transparent px-2.5 py-1.5 text-[10.5px] font-extrabold text-slate-300 focus:outline-none"
                      >
                        <option value="all">All positions</option>
                        {CANONICAL_POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                      <select
                        value={filterTeam}
                        onChange={(e) => setFilterTeam(e.target.value)}
                        className="shrink-0 rounded-full border-white/[0.12] bg-transparent px-2.5 py-1.5 text-[10.5px] font-extrabold text-slate-300 focus:outline-none"
                      >
                        <option value="all">All teams</option>
                        {uniqueTeams.map((team) => (
                          <option key={team} value={team}>{team}</option>
                        ))}
                      </select>
                    </div>

                    {/* Player rows */}
                    {availablePlayerPool.length === 0 ? (
                      <div
                        className={`text-center ${
                          playerPoolEmptyReason === "no-games"
                            ? "py-14"
                            : "py-6"
                        }`}
                      >
                        {isLoadingPool ? (
                          <BasketballLoader label="Loading players…" />
                        ) : (
                          <p
                            className={`mx-auto max-w-[28rem] ${
                              playerPoolEmptyReason === "no-games"
                                ? "text-xl font-bold leading-8 text-slate-200"
                                : "text-sm leading-6 text-slate-400"
                            }`}
                          >
                            {playerPoolEmptyReason === "no-games" ? (
                              <span className="mr-3 inline-block align-middle" style={{ marginTop: "-0.15em" }}>🏀</span>
                            ) : null}
                            {emptyPlayerPoolMessage}
                            {playerPoolEmptyReason === "no-games" ? (
                              <span className="ml-3 inline-block align-middle" style={{ marginTop: "-0.15em" }}>🏀</span>
                            ) : null}
                          </p>
                        )}
                      </div>
                    ) : sortedFilteredPool.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-500">No players match this filter.</p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-[7px]">
                          {sortedFilteredPool.slice(0, visibleCount).map((item) => {
                            const isSelected = selectedPlayerKeySet.has(normalizePlayerKey(item.playerName));
                            const isFull = selectedPlayers.length >= requiredLineupSize;
                            const isBaseballRole = selectedSport === "baseball";
                            const rosterRole = isBaseballRole ? getMlbRosterRole(item.position) : null;
                            const roleCount = rosterRole === "pitcher" ? selectedMlbPitchers.length : selectedMlbHitters.length;
                            const roleLimit = rosterRole === "pitcher" ? FANTASY_MLB_PITCHER_COUNT : FANTASY_MLB_HITTER_COUNT;
                            const isRoleFull = Boolean(isBaseballRole && roleCount >= roleLimit);
                            const disableDraft = (isFull || isRoleFull) && !isSelected;
                            const isTop = topProjectedPlayerKey === normalizePlayerKey(item.playerName);
                            const proj = item.projectedLine != null ? Math.round(Number(item.projectedLine)) : 0;
                            return (
                              <div
                                key={item.playerName}
                                className={`grid grid-cols-[30px_1fr_auto] items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 ${
                                  isSelected
                                    ? "border border-[#fef3c7]/30 bg-[#fef3c7]/[0.06]"
                                    : "border border-white/[0.06] bg-white/[0.015]"
                                }`}
                              >
                                <PlayerHeadshot src={item.headshotUrl} name={item.playerName} jerseyNumber={item.jerseyNumber ?? null} />
                                <div className="min-w-0 leading-[1.15]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-[13px] font-black text-[#fef3c7]">{item.playerName}</span>
                                    {selectedSport === "baseball" ? (
                                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${
                                        rosterRole === "pitcher"
                                          ? "border border-sky-300/35 bg-sky-400/10 text-sky-200"
                                          : "border border-amber-300/35 bg-amber-400/10 text-amber-200"
                                      }`}>
                                        {rosterRole === "pitcher" ? "Pitcher" : "Hitter"}
                                      </span>
                                    ) : null}
                                    {isTop ? (
                                      <span className="shrink-0 rounded-full border border-[#fcd34d]/40 bg-[#fcd34d]/15 px-1.5 text-[8px] font-black uppercase tracking-[0.06em] text-[#fcd34d]">★ Top</span>
                                    ) : null}
                                  </div>
                                  <div className="mt-0.5 truncate text-[10px] font-bold text-[#fef3c7]/55">
                                    {item.position ? <span className="text-[#fde68a]">{item.position}</span> : null}
                                    {item.position && item.team ? " · " : null}
                                    {item.team ?? ""}
                                    {proj > 0 ? (
                                      <>
                                        {item.position || item.team ? " · " : null}
                                        <span className="text-[#fde68a]">{proj} proj</span>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={disableDraft}
                                  onClick={() => togglePlayer(item)}
                                  className={`h-8 min-w-[64px] rounded-full text-[10.5px] font-black uppercase tracking-[0.04em] transition-colors disabled:opacity-40 ${
                                    isSelected
                                      ? "border border-[#6ee7b7]/55 bg-emerald-500/15 text-[#6ee7b7]"
                                      : "border border-[#fef3c7]/45 bg-[#fef3c7]/10 text-[#fde68a]"
                                  }`}
                                >
                                  {isSelected ? "✓ Drafted" : isRoleFull && selectedSport === "baseball" ? "Full" : "Draft"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {visibleCount < sortedFilteredPool.length ? (
                          <button
                            type="button"
                            onClick={() => setVisibleCount((n) => n + 25)}
                            className="w-full rounded-[10px] border border-white/10 bg-white/[0.02] py-2.5 text-[11px] font-extrabold tracking-[0.04em] text-slate-400"
                          >
                            Load more players ({sortedFilteredPool.length - visibleCount})
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {/* ── Ad below the fold ── */}
        <FoldLine />
        <InlineSlotAdClient
          slot="inline-content"
          venueId={venueId}
          pageKey="fantasy"
          adType="inline"
          displayTrigger="on-load"
          placementKey="fantasy-inline"
        />
      </div>{/* end content container */}

      {/* ── Submission toast ── */}
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
            className="fixed left-1/2 z-[2400] w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border border-emerald-400/60 bg-emerald-500/20 px-3 py-3 shadow-[0_14px_32px_rgba(16,185,129,0.35)]"
            style={{ bottom: "calc(6.75rem + env(safe-area-inset-bottom, 0px))" }}
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

      {/* ── Sticky Submit Button ── */}
      {isMounted && showFloatingRosterCta
        ? createPortal(
            <div
              data-fantasy-submit-cta
              className="pointer-events-none bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent px-4 pt-3"
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1000,
                paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1.5rem)",
              }}
            >
              <button
                type="button"
                onClick={() => void handleSubmitRoster()}
                disabled={submitting || !isLineupComplete}
                className={`pointer-events-auto flex w-full items-center justify-center gap-2.5 rounded-[14px] py-4 text-base font-black uppercase tracking-[0.04em] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-65 ${
                  isLineupComplete && !submitting
                    ? "bg-[#8b5cf6] text-white shadow-[0_8px_24px_rgba(139,92,246,0.35)]"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {submitting ? (
                  "Saving..."
                ) : (
                  <>
                    {isLineupComplete ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    ) : null}
                    {floatingRosterCtaLabel}
                  </>
                )}
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
