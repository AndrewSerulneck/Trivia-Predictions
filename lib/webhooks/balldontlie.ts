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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferBasketballSportKeyFromEventType(eventType: string): "basketball_nba" | "basketball_wnba" {
  const normalized = String(eventType ?? "").trim().toLowerCase();
  if (normalized.startsWith("wnba.player")) {
    return "basketball_wnba";
  }
  return "basketball_nba";
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

export type BdlMlbBatterEvent = {
  eventType: "groundout" | "flyout" | "strikeout" | "hit" | "home_run" | "walk" | "hit_by_pitch";
  gameId: string;
  playerId: number | null;
  playerName: string;
  teamName: string;
  pitchCount: number | null;
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

function pickNumAllowZero(obj: unknown, paths: string[][]): number | null {
  for (const path of paths) {
    const raw = dig(obj, path);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
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

function toMlbEventType(rawType: string): BdlMlbBatterEvent["eventType"] | null {
  const normalized = rawType.trim().toLowerCase();
  if (normalized === "batter.groundout" || normalized.endsWith(".batter.groundout")) return "groundout";
  if (normalized === "batter.flyout" || normalized.endsWith(".batter.flyout")) return "flyout";
  if (normalized === "batter.strikeout" || normalized.endsWith(".batter.strikeout")) return "strikeout";
  if (normalized === "batter.hit" || normalized.endsWith(".batter.hit")) return "hit";
  if (normalized === "batter.home_run" || normalized.endsWith(".batter.home_run")) return "home_run";
  if (normalized === "batter.walk" || normalized.endsWith(".batter.walk")) return "walk";
  if (normalized === "batter.hit_by_pitch" || normalized.endsWith(".batter.hit_by_pitch")) return "hit_by_pitch";
  return null;
}

export function parseMlbBatterEvent(rawBody: unknown): BdlMlbBatterEvent | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const root = rawBody as Obj;
  const data: Obj =
    root.data != null && typeof root.data === "object" ? (root.data as Obj) : root;

  const rawType = pickStr(root, [["type"], ["event"], ["event_type"]]);
  const eventType = toMlbEventType(rawType);
  if (!eventType) {
    return null;
  }

  const gameId = pickStr(data, [["game", "id"], ["game_id"], ["event", "game_id"], ["play", "game_id"]]);
  if (!gameId) {
    return null;
  }

  const playerName =
    pickStr(data, [["player", "full_name"], ["player", "name"]]) ||
    `${pickStr(data, [["player", "first_name"]])} ${pickStr(data, [["player", "last_name"]])}`.trim();
  if (!playerName) {
    return null;
  }
  const playerId = pickNum(data, [["player", "id"], ["player_id"], ["batter", "id"]]) || null;

  const teamName = pickStr(data, [["team", "full_name"], ["team", "name"], ["team_name"]]);
  if (!teamName) {
    return null;
  }

  const pitchCountRaw = pickNumAllowZero(data, [["pitch_count"], ["pitches"], ["play", "pitch_count"], ["event", "pitch_count"]]);
  const pitchCount = pitchCountRaw !== null && Number.isFinite(pitchCountRaw) ? Math.max(0, Math.floor(pitchCountRaw)) : null;

  return {
    eventType,
    gameId: String(gameId),
    playerId,
    playerName,
    teamName,
    pitchCount,
  };
}

// ---- Fantasy points (matches heartbeat formula) ----

export function calcNbaFantasyPoints(stats: BdlPlayerStats): number {
  return Number(
    (stats.pts + stats.reb * 1.2 + stats.ast * 1.5 + stats.stl * 3 + stats.blk * 3 - stats.tov).toFixed(2)
  );
}

// ---- MLB cumulative box-score types ----

export type BdlMlbBatterStats = {
  h: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  runs: number;
  rbi: number;
  stolenBases: number;
  strikeoutsAsBatter: number;
};

export type BdlMlbPitcherStats = {
  strikeouts: number;
  outs: number;
  earnedRuns: number;
  walksAllowed: number;
  hitsAllowed: number;
};

export type BdlMlbPlayerEvent = {
  eventType: string;
  gameId: string;
  playerId: number;
  playerName: string;
  normalizedPlayerName: string;
  teamId: number | null;
  teamName: string;
  gameStatus: string;
  isPitcher: boolean;
  batterStats: BdlMlbBatterStats;
  pitcherStats: BdlMlbPitcherStats;
};

export function parseMlbPlayerEvent(rawBody: unknown): BdlMlbPlayerEvent | null {
  if (!rawBody || typeof rawBody !== "object") return null;
  const root = rawBody as Obj;
  const data: Obj = root.data != null && typeof root.data === "object" ? (root.data as Obj) : root;

  const eventType = pickStr(root, [["type"], ["event"], ["event_type"]]);
  const gameId = pickStr(data, [["game", "id"], ["game_id"]]);
  if (!gameId) return null;

  const playerId =
    pickNum(data, [["player", "id"], ["player_id"], ["batter", "id"]]) ||
    pickNum(data, [["pitcher", "id"]]);
  if (!playerId) return null;

  const firstName = pickStr(data, [
    ["player", "first_name"],
    ["batter", "first_name"],
    ["pitcher", "first_name"],
  ]);
  const lastName = pickStr(data, [
    ["player", "last_name"],
    ["batter", "last_name"],
    ["pitcher", "last_name"],
  ]);
  const playerName =
    pickStr(data, [
      ["player", "full_name"],
      ["player", "name"],
      ["batter", "full_name"],
      ["pitcher", "full_name"],
    ]) ||
    `${firstName} ${lastName}`.trim() ||
    `Player ${playerId}`;

  const teamId = pickNum(data, [["team", "id"], ["team_id"]]) || null;
  const teamName = pickStr(data, [["team", "full_name"], ["team", "name"], ["team_name"]]);
  const gameStatus = pickStr(data, [["game", "status"], ["game_status"]]);

  const position = pickStr(data, [["player", "position"], ["position"]]);
  const isPitcher =
    position.toLowerCase().startsWith("p") ||
    eventType.toLowerCase().startsWith("pitcher.") ||
    Boolean(dig(data, ["pitcher", "id"]));

  const stats =
    data.stats != null && typeof data.stats === "object" ? (data.stats as Obj) : data;

  const batterStats: BdlMlbBatterStats = {
    h: pickNum(stats, [["h"], ["hits"]]),
    doubles: pickNum(stats, [["doubles"], ["d"]]),
    triples: pickNum(stats, [["triples"], ["t"]]),
    homeRuns: pickNum(stats, [["home_runs"], ["hr"]]),
    runs: pickNum(stats, [["runs"], ["r"]]),
    rbi: pickNum(stats, [["rbi"]]),
    stolenBases: pickNum(stats, [["stolen_bases"], ["sb"]]),
    strikeoutsAsBatter: pickNum(stats, [["strikeouts"], ["so"]]),
  };

  const pitcherStats: BdlMlbPitcherStats = {
    strikeouts: pickNum(stats, [["strikeouts"], ["so"]]),
    outs: pickNum(stats, [["outs_pitched"], ["outs"]]),
    earnedRuns: pickNum(stats, [["earned_runs"], ["er"]]),
    walksAllowed: pickNum(stats, [["base_on_balls"], ["bb"]]),
    hitsAllowed: pickNum(stats, [["hits_allowed"], ["ha"]]),
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
    isPitcher,
    batterStats,
    pitcherStats,
  };
}

export function calcMlbBatterFantasyPoints(stats: BdlMlbBatterStats): number {
  const singles = Math.max(0, stats.h - stats.doubles - stats.triples - stats.homeRuns);
  const total =
    singles * 10 +
    stats.doubles * 20 +
    stats.triples * 30 +
    stats.homeRuns * 50 +
    stats.runs * 10 +
    stats.rbi * 10 +
    stats.stolenBases * 15 -
    stats.strikeoutsAsBatter * 5;
  return Number(Math.max(0, total).toFixed(2));
}

export function calcMlbPitcherFantasyPoints(stats: BdlMlbPitcherStats): number {
  const total =
    stats.strikeouts * 10 +
    stats.outs * 5 -
    stats.earnedRuns * 15 -
    (stats.walksAllowed + stats.hitsAllowed) * 5;
  return Number(Math.max(0, total).toFixed(2));
}

export function calcMlbFantasyPoints(event: BdlMlbPlayerEvent): number {
  return event.isPitcher
    ? calcMlbPitcherFantasyPoints(event.pitcherStats)
    : calcMlbBatterFantasyPoints(event.batterStats);
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
