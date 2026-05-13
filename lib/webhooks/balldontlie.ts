import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// ---- Signature verification ----

export function verifyBdlSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  if (!secret || !timestamp || !rawBody || !signature) return false;
  const expected = `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---- Player name normalization (mirrors sportsBingo.ts normalizeNameKey) ----

export function normalizePlayerName(value: string): string {
  return value
    .normalize("NFKD")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Payload types ----

export type BdlPlayerStats = {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fg3m: number;
  oreb: number;
  dreb: number;
  ftm: number;
  tov: number;
  minDecimal: number;
  fgm: number;
};

export type BdlNbaPlayerEvent = {
  eventType: string;
  gameId: string;
  playerId: number;
  playerName: string;
  normalizedPlayerName: string;
  teamId: number | null;
  teamName: string;
  gameStatus: string;
  stats: BdlPlayerStats;
};

// ---- Defensive payload parsing ----

type Obj = Record<string, unknown>;

function dig(obj: unknown, path: string[]): unknown {
  let v: unknown = obj;
  for (const k of path) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Obj)[k];
  }
  return v;
}

function pickNum(obj: unknown, paths: string[][]): number {
  for (const path of paths) {
    const v = Number(dig(obj, path));
    if (Number.isFinite(v) && v !== 0) return v;
  }
  return 0;
}

function pickStr(obj: unknown, paths: string[][]): string {
  for (const path of paths) {
    const v = dig(obj, path);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function parseMinutesDecimal(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const m = raw.match(/^(\d+):(\d+)/);
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function parseNbaPlayerEvent(rawBody: unknown): BdlNbaPlayerEvent | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const root = rawBody as Obj;

  // Support both { type, data: { ... } } and flat shapes
  const data: Obj =
    root.data != null && typeof root.data === "object" ? (root.data as Obj) : root;

  const eventType = pickStr(root, [["type"], ["event"], ["event_type"]]);

  const gameId = pickStr(data, [["game", "id"], ["game_id"]]);
  if (!gameId) return null;

  const playerId = pickNum(data, [["player", "id"], ["player_id"]]);
  if (!playerId) return null;

  const firstName = pickStr(data, [["player", "first_name"], ["player", "firstname"]]);
  const lastName = pickStr(data, [["player", "last_name"], ["player", "lastname"]]);
  const playerName =
    pickStr(data, [["player", "full_name"], ["player", "name"]]) ||
    `${firstName} ${lastName}`.trim() ||
    `Player ${playerId}`;

  const teamId = pickNum(data, [["team", "id"], ["team_id"]]) || null;
  const teamName = pickStr(data, [["team", "full_name"], ["team", "name"], ["team_name"]]);
  const gameStatus = pickStr(data, [["game", "status"], ["game_status"]]);

  const minRaw = dig(data, ["min"]) ?? dig(data, ["minutes"]);

  const stats: BdlPlayerStats = {
    pts: pickNum(data, [["pts"], ["points"]]),
    reb: pickNum(data, [["reb"], ["rebounds"], ["totReb"]]),
    ast: pickNum(data, [["ast"], ["assists"]]),
    stl: pickNum(data, [["stl"], ["steals"]]),
    blk: pickNum(data, [["blk"], ["blocks"]]),
    fg3m: pickNum(data, [["fg3m"], ["threes_made"]]),
    oreb: pickNum(data, [["oreb"], ["offReb"]]),
    dreb: pickNum(data, [["dreb"], ["defReb"]]),
    ftm: pickNum(data, [["ftm"], ["free_throws_made"]]),
    tov: pickNum(data, [["turnover"], ["turnovers"], ["tov"]]),
    minDecimal: parseMinutesDecimal(minRaw),
    fgm: pickNum(data, [["fgm"], ["field_goals_made"]]),
  };

  return {
    eventType,
    gameId: String(gameId),
    playerId,
    playerName,
    normalizedPlayerName: normalizePlayerName(playerName),
    teamId,
    teamName,
    gameStatus,
    stats,
  };
}

// ---- Fantasy points (matches heartbeat formula) ----

export function calcNbaFantasyPoints(stats: BdlPlayerStats): number {
  return Number(
    (stats.pts + stats.reb * 1.2 + stats.ast * 1.5 + stats.stl * 3 + stats.blk * 3 - stats.tov).toFixed(2)
  );
}

// ---- Bingo metric → stat value ----

type NBAPlayerMilestoneMetric =
  | "points"
  | "rebounds"
  | "assists"
  | "steals"
  | "blocks"
  | "threes"
  | "offensive_rebounds"
  | "free_throws_made"
  | "defensive_rebounds"
  | "two_point_fg"
  | "minutes_played";

export function getStatForBingoMetric(
  stats: BdlPlayerStats,
  metric: NBAPlayerMilestoneMetric | string
): number {
  switch (metric as NBAPlayerMilestoneMetric) {
    case "points":
      return stats.pts;
    case "rebounds":
      return stats.reb;
    case "assists":
      return stats.ast;
    case "steals":
      return stats.stl;
    case "blocks":
      return stats.blk;
    case "threes":
      return stats.fg3m;
    case "offensive_rebounds":
      return stats.oreb;
    case "defensive_rebounds":
      return stats.dreb;
    case "free_throws_made":
      return stats.ftm;
    case "two_point_fg":
      return Math.max(0, stats.fgm - stats.fg3m);
    case "minutes_played":
      return stats.minDecimal;
    default:
      return 0;
  }
}
