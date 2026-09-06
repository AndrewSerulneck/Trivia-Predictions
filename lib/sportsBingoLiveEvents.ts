/**
 * Live-stat delta → ActionPop classification, shared by the client board and the server sweep.
 *
 * Phase 3 of `docs/prop-bingo-nfl-activation-plan.md` (live-event parity for NFL).
 *
 * ## Why this file exists
 *
 * NBA/WNBA/MLB boards pop because BallDontLie sends a webhook per stat change and
 * `app/api/webhooks/balldontlie/route.ts` re-broadcasts it on `live-stats:{sportKey}`. **BDL
 * publishes no NFL webhook**, so the only NFL heartbeat is the 1-minute
 * `/api/cron/bingo-progress` sweep, which already pulls `/nfl/v1/stats` once per game. Phase 3
 * diffs that already-paid-for snapshot against the previous sweep and publishes the changed
 * players onto the *same* channel, in the *same* row shape, so the client subscription is
 * unchanged.
 *
 * ## The contract that makes duplicate broadcasts safe
 *
 * Every broadcast row carries **absolute totals, never deltas**. `refreshSportsBingoProgress` runs
 * from the cron *and* from every user card poll *and* from the NBA/MLB webhook, on any number of
 * warm serverless instances, each holding its own previous-sweep map — so the same change can be
 * broadcast more than once. That is harmless precisely because the client re-derives the delta
 * against its own last-seen row: a second copy of an already-seen row yields all-zero deltas and
 * fires nothing. Never change these rows to carry deltas.
 *
 * Out-of-order delivery is the one case absolute totals do not fix on their own (an instance with
 * a stale cached snapshot can publish *older* totals after newer ones, which would rewind the
 * client's baseline and re-fire the same pop on the next real change).
 * `isRegressedNflLiveStatRow` is the guard for that: the client drops a rewinding row instead of
 * storing it.
 *
 * This module is deliberately isomorphic — no `server-only`, no Supabase, no React — because both
 * `lib/sportsBingo.ts` (server) and `components/bingo/SportsBingoHome.tsx` (client) import it.
 */

export type LiveDeltaTone = "cyan" | "gold";

export const NFL_LIVE_STAT_SPORT_KEY = "americanfootball_nfl";

/** `stat_type` stamped on every NFL broadcast row. Distinct from the NBA/MLB fantasy-total rows. */
export const NFL_LIVE_STAT_TYPE = "nfl_stat_totals";

/**
 * Most broadcast rows one NFL game may publish in a single sweep.
 *
 * Cost discipline, not correctness: each `send()` on an unsubscribed admin channel is one HTTP
 * POST to the realtime broadcast endpoint, and a Sunday slate is 13 concurrent games. Ranking by
 * `broadcastPriority` means the cap drops "gained 4 rushing yards", never a touchdown.
 */
export const NFL_LIVE_STAT_BROADCAST_MAX_PER_SWEEP = 12;

/** Scrimmage yards a player must gain in one sweep before the no-marquee-event fallback pops. */
export const NFL_LIVE_STAT_YARDS_POP_THRESHOLD = 25;

/** Most pops one player's row may produce in one sweep, so a 3-TD catch-up burst can't flood. */
export const NFL_LIVE_STAT_MAX_EVENTS_PER_ROW = 2;

/**
 * The NFL counters carried alongside the basketball-shaped row.
 *
 * They ride in an optional `nfl` block rather than being crammed into `pts`/`ast`/`reb`: those
 * fields drive the basketball rules in `classifyLiveDeltaEvent`, and a 6-point touchdown landing
 * in `pts` would fire "3-POINTER!" on a football board.
 */
export type NflLiveStatTotals = {
  passingYards: number;
  passingTouchdowns: number;
  passingInterceptions: number;
  rushingYards: number;
  rushingTouchdowns: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  /** Return and defensive scores, summed — the same field `anytime_td` settles against. */
  otherTouchdowns: number;
  fieldGoalsMade: number;
  defensiveSacks: number;
  defensiveInterceptions: number;
};

export type LivePlayerStatRealtimeRow = {
  game_id: string;
  player_id: number;
  player_name: string;
  game_status: string;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  turnovers: number;
  total_fantasy_points: number;
  sport_key?: string;
  stat_type?: string;
  value?: number;
  /** Present only on `americanfootball_nfl` rows. */
  nfl?: NflLiveStatTotals;
};

export type LiveDeltaEvent = {
  text: string;
  tone: LiveDeltaTone;
  shouldShake?: boolean;
  majorGlow?: boolean;
};

export const EMPTY_NFL_LIVE_STAT_TOTALS: NflLiveStatTotals = {
  passingYards: 0,
  passingTouchdowns: 0,
  passingInterceptions: 0,
  rushingYards: 0,
  rushingTouchdowns: 0,
  receptions: 0,
  receivingYards: 0,
  receivingTouchdowns: 0,
  otherTouchdowns: 0,
  fieldGoalsMade: 0,
  defensiveSacks: 0,
  defensiveInterceptions: 0,
};

const NFL_TOTAL_FIELDS = Object.keys(EMPTY_NFL_LIVE_STAT_TOTALS) as Array<keyof NflLiveStatTotals>;

const toCount = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Coerce whatever arrived over the wire into a complete totals block. Missing field = 0. */
export function readNflLiveStatTotals(row: LivePlayerStatRealtimeRow | null | undefined): NflLiveStatTotals {
  const raw = (row?.nfl ?? null) as Partial<NflLiveStatTotals> | null;
  if (!raw) {
    return { ...EMPTY_NFL_LIVE_STAT_TOTALS };
  }
  const totals = { ...EMPTY_NFL_LIVE_STAT_TOTALS };
  for (const field of NFL_TOTAL_FIELDS) {
    totals[field] = toCount(raw[field]);
  }
  return totals;
}

export function isNflSportKey(sportKey: string | null | undefined): boolean {
  return String(sportKey ?? "").toLowerCase() === NFL_LIVE_STAT_SPORT_KEY;
}

/**
 * True when `next` reports *less* of some counter than `previous` — i.e. it is an out-of-order or
 * stale delivery, not progress. Box-score counters only ever go up inside a game, so the only way
 * this fires is a rewind. The client drops those rows rather than storing them as the new
 * baseline; storing one would re-fire the pop it already showed as soon as the real row arrives.
 *
 * NFL-only on purpose: NBA/MLB rows come from a webhook with its own ordering and a live provider
 * correction there is a legitimate downward revision.
 */
export function isRegressedNflLiveStatRow(
  previous: LivePlayerStatRealtimeRow,
  next: LivePlayerStatRealtimeRow
): boolean {
  if (!isNflSportKey(next.sport_key)) {
    return false;
  }
  const previousTotals = readNflLiveStatTotals(previous);
  const nextTotals = readNflLiveStatTotals(next);
  return NFL_TOTAL_FIELDS.some((field) => nextTotals[field] < previousTotals[field]);
}

/** Did `value` cross `threshold` between the two readings? Used for the 100-yard milestones. */
const crossed = (previous: number, next: number, threshold: number): boolean =>
  previous < threshold && next >= threshold;

/**
 * NFL delta → pops. Exactly the event slate Phase 3 specifies: passing / rushing / receiving
 * touchdowns, 100-yard rushing and receiving crossings, interceptions (thrown and caught), sacks
 * and made field goals — plus one chunk-yardage fallback so a long drive still moves the board
 * between scores.
 */
export function classifyNflLiveDeltaEvent(
  previous: LivePlayerStatRealtimeRow,
  next: LivePlayerStatRealtimeRow
): LiveDeltaEvent[] {
  const before = readNflLiveStatTotals(previous);
  const after = readNflLiveStatTotals(next);
  const delta = (field: keyof NflLiveStatTotals): number => after[field] - before[field];

  const events: LiveDeltaEvent[] = [];

  if (delta("passingTouchdowns") >= 1) {
    events.push({ text: "TD PASS!", tone: "gold", majorGlow: true });
  }
  if (delta("rushingTouchdowns") >= 1) {
    events.push({ text: "RUSHING TD!", tone: "gold", shouldShake: true, majorGlow: true });
  }
  if (delta("receivingTouchdowns") >= 1) {
    events.push({ text: "TOUCHDOWN CATCH!", tone: "gold", shouldShake: true, majorGlow: true });
  }
  if (delta("otherTouchdowns") >= 1) {
    events.push({ text: "TOUCHDOWN!", tone: "gold", shouldShake: true, majorGlow: true });
  }
  if (crossed(before.rushingYards, after.rushingYards, 100)) {
    events.push({ text: "100 RUSH YARDS!", tone: "gold", majorGlow: true });
  }
  if (crossed(before.receivingYards, after.receivingYards, 100)) {
    events.push({ text: "100 REC YARDS!", tone: "gold", majorGlow: true });
  }
  if (delta("fieldGoalsMade") >= 1) {
    events.push({ text: "FIELD GOAL!", tone: "cyan" });
  }
  if (delta("defensiveInterceptions") >= 1) {
    events.push({ text: "INTERCEPTION!", tone: "cyan" });
  }
  if (delta("passingInterceptions") >= 1) {
    events.push({ text: "PICKED OFF!", tone: "cyan" });
  }
  if (delta("defensiveSacks") >= 1) {
    events.push({ text: "SACK!", tone: "cyan" });
  }

  if (events.length === 0) {
    const yardsGained = delta("rushingYards") + delta("receivingYards");
    if (yardsGained >= NFL_LIVE_STAT_YARDS_POP_THRESHOLD) {
      events.push({ text: `+${Math.round(yardsGained)} YDS`, tone: "cyan" });
    }
  }

  return events.slice(0, NFL_LIVE_STAT_MAX_EVENTS_PER_ROW);
}

/**
 * Moved here from `components/bingo/SportsBingoHome.tsx` in Phase 3 so it is unit-testable; the
 * NBA/MLB half is byte-for-byte the shipped behavior, with the NFL branch taken first.
 *
 * The NFL branch **returns early on purpose**. NFL rows carry the player's own points in `pts`, so
 * falling through would let a 6-point touchdown trip the `ptsDelta >= 3` "3-POINTER!" rule.
 */
export function classifyLiveDeltaEvent(
  previous: LivePlayerStatRealtimeRow,
  next: LivePlayerStatRealtimeRow
): LiveDeltaEvent[] {
  const sportKey = String(next.sport_key ?? "").toLowerCase();
  if (isNflSportKey(sportKey)) {
    return classifyNflLiveDeltaEvent(previous, next);
  }

  const events: LiveDeltaEvent[] = [];
  const statType = String(next.stat_type ?? "").toLowerCase();
  const prevValue = Number(previous.value ?? previous.total_fantasy_points ?? 0);
  const nextValue = Number(next.value ?? next.total_fantasy_points ?? 0);
  const valueDelta = nextValue - prevValue;

  const ptsDelta = Number(next.pts ?? 0) - Number(previous.pts ?? 0);
  const stlDelta = Number(next.stl ?? 0) - Number(previous.stl ?? 0);
  const blkDelta = Number(next.blk ?? 0) - Number(previous.blk ?? 0);
  const astDelta = Number(next.ast ?? 0) - Number(previous.ast ?? 0);
  const rebDelta = Number(next.reb ?? 0) - Number(previous.reb ?? 0);

  const isHomeRunEvent =
    statType.includes("home_run") ||
    statType.includes("home-run") ||
    (sportKey.includes("baseball") && statType.includes("hr"));
  const isTouchdownEvent = statType.includes("touchdown") || statType.includes("td");
  const isStrikeoutEvent = statType.includes("strikeout") || statType.includes("k");

  if (isHomeRunEvent && valueDelta >= 1) {
    events.push({ text: "HOME RUN!", tone: "gold", shouldShake: true, majorGlow: true });
  }
  if (isTouchdownEvent && valueDelta >= 1) {
    events.push({ text: "TOUCHDOWN!", tone: "gold", majorGlow: true });
  }
  if (ptsDelta >= 3) {
    events.push({ text: "3-POINTER!", tone: "gold", majorGlow: true });
  }
  if (blkDelta >= 1) {
    events.push({ text: "BLOCK!", tone: "cyan" });
  }
  if (stlDelta >= 1) {
    events.push({ text: "STEAL!", tone: "cyan" });
  }
  if (isStrikeoutEvent && valueDelta >= 1) {
    events.push({ text: "STRIKEOUT!", tone: "cyan" });
  }

  if (events.length === 0) {
    const scoreDelta = Math.max(valueDelta, ptsDelta, astDelta * 1.5, rebDelta * 1.2);
    if (scoreDelta >= 0.5) {
      events.push({ text: `+${scoreDelta.toFixed(0)} PTS`, tone: "cyan" });
    }
  }

  return events;
}

// --- The server half: turning one `/nfl/v1/stats` snapshot into broadcast rows ------------------

/**
 * The subset of `NFLPlayerStatLine` (lib/sportsBingo.ts) this file needs. Declared structurally
 * rather than imported so an isomorphic module never pulls in the `server-only` grading engine.
 */
export type NflLiveStatLineInput = NflLiveStatTotals & {
  playerId: number | null;
  playerName: string;
};

const normalizeLivePlayerKey = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Deterministic positive integer for a player the box score gave no id for. The client rejects
 * `player_id <= 0`, and a name is the only other stable handle a stat row carries. FNV-1a, masked
 * into the 1…2^31 range so it can never collide with a real BDL id's ordering assumptions beyond
 * being a distinct number.
 */
export function nflLiveStatFallbackPlayerId(playerKey: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < playerKey.length; index += 1) {
    hash ^= playerKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 2_000_000_000) + 1;
}

/** Points this player put on the board themselves. Rides in `pts` purely as display context. */
// Passing touchdowns are deliberately absent: the six points belong to the receiver's line, and
// counting them here would double them on every board that holds both halves of the same score.
const nflPlayerPoints = (totals: NflLiveStatTotals): number =>
  6 * (totals.rushingTouchdowns + totals.receivingTouchdowns + totals.otherTouchdowns) +
  3 * totals.fieldGoalsMade;

/**
 * Rank for the per-sweep broadcast cap: a scoring or turnover change outranks pure yardage, and
 * within a tier the bigger yardage move wins. Never used for classification, only for triage.
 */
function broadcastPriority(before: NflLiveStatTotals, after: NflLiveStatTotals): number {
  const scoringDelta =
    after.passingTouchdowns - before.passingTouchdowns +
    (after.rushingTouchdowns - before.rushingTouchdowns) +
    (after.receivingTouchdowns - before.receivingTouchdowns) +
    (after.otherTouchdowns - before.otherTouchdowns) +
    (after.fieldGoalsMade - before.fieldGoalsMade) +
    (after.defensiveInterceptions - before.defensiveInterceptions) +
    (after.passingInterceptions - before.passingInterceptions) +
    (after.defensiveSacks - before.defensiveSacks);
  const yardsDelta =
    after.passingYards - before.passingYards +
    (after.rushingYards - before.rushingYards) +
    (after.receivingYards - before.receivingYards);
  return scoringDelta * 1_000 + Math.max(0, yardsDelta);
}

const totalsFromLine = (line: NflLiveStatLineInput): NflLiveStatTotals => {
  const totals = { ...EMPTY_NFL_LIVE_STAT_TOTALS };
  for (const field of NFL_TOTAL_FIELDS) {
    totals[field] = toCount(line[field]);
  }
  return totals;
};

/** Element-wise max — the safe merge when a box score lists a player on more than one row. */
const mergeTotals = (left: NflLiveStatTotals, right: NflLiveStatTotals): NflLiveStatTotals => {
  const merged = { ...EMPTY_NFL_LIVE_STAT_TOTALS };
  for (const field of NFL_TOTAL_FIELDS) {
    merged[field] = Math.max(left[field], right[field]);
  }
  return merged;
};

const totalsEqual = (left: NflLiveStatTotals, right: NflLiveStatTotals): boolean =>
  NFL_TOTAL_FIELDS.every((field) => left[field] === right[field]);

const allZero = (totals: NflLiveStatTotals): boolean =>
  NFL_TOTAL_FIELDS.every((field) => totals[field] === 0);

export type NflLiveStatBroadcastPlan = {
  /** Rows to publish on `live-stats:americanfootball_nfl`, most newsworthy first. */
  rows: LivePlayerStatRealtimeRow[];
  /** The full current totals for every player, to be stored as the next sweep's baseline. */
  nextByPlayerKey: Map<string, NflLiveStatTotals>;
  /** How many changed players the per-sweep cap dropped. Telemetry only. */
  droppedRows: number;
};

/**
 * Diff one game's box score against the previous sweep and decide what to broadcast.
 *
 * **No previous snapshot → no rows.** A first sighting of a game (cold instance, or the first
 * sweep after kickoff) seeds the baseline and publishes nothing: with nothing to diff against,
 * every player would look like they had just done everything at once. This is the server-side
 * twin of the client's own "no previous reading → no event" rule, and it is why a stat change is
 * seen one sweep after it happens on a cold instance rather than being replayed as a burst.
 */
export function buildNflLiveStatBroadcastPlan(params: {
  gameId: string;
  gameStatus: string;
  lines: readonly NflLiveStatLineInput[];
  previousByPlayerKey: ReadonlyMap<string, NflLiveStatTotals> | null;
  maxRows?: number;
}): NflLiveStatBroadcastPlan {
  const nextByPlayerKey = new Map<string, NflLiveStatTotals>();
  const displayNameByKey = new Map<string, string>();
  const playerIdByKey = new Map<string, number>();

  for (const line of params.lines) {
    const key = normalizeLivePlayerKey(String(line.playerName ?? ""));
    if (!key) {
      continue;
    }
    const totals = totalsFromLine(line);
    const existing = nextByPlayerKey.get(key);
    nextByPlayerKey.set(key, existing ? mergeTotals(existing, totals) : totals);
    if (!displayNameByKey.has(key)) {
      displayNameByKey.set(key, String(line.playerName ?? "").trim());
    }
    const playerId = Number(line.playerId ?? 0);
    if (Number.isFinite(playerId) && playerId > 0 && !playerIdByKey.has(key)) {
      playerIdByKey.set(key, playerId);
    }
  }

  const previous = params.previousByPlayerKey;
  if (!previous) {
    return { rows: [], nextByPlayerKey, droppedRows: 0 };
  }

  const changed: Array<{ row: LivePlayerStatRealtimeRow; priority: number }> = [];
  for (const [key, totals] of nextByPlayerKey) {
    const before = previous.get(key) ?? { ...EMPTY_NFL_LIVE_STAT_TOTALS };
    if (totalsEqual(before, totals)) {
      continue;
    }
    // A player the previous sweep had never seen at all, still sitting on an empty line, is not
    // news — it is the box score adding a row before the player has done anything.
    if (!previous.has(key) && allZero(totals)) {
      continue;
    }
    const points = nflPlayerPoints(totals);
    changed.push({
      priority: broadcastPriority(before, totals),
      row: {
        game_id: params.gameId,
        player_id: playerIdByKey.get(key) ?? nflLiveStatFallbackPlayerId(key),
        player_name: displayNameByKey.get(key) ?? key,
        game_status: params.gameStatus,
        pts: points,
        ast: 0,
        reb: 0,
        stl: 0,
        blk: 0,
        turnovers: 0,
        total_fantasy_points: points,
        sport_key: NFL_LIVE_STAT_SPORT_KEY,
        stat_type: NFL_LIVE_STAT_TYPE,
        value: points,
        nfl: totals,
      },
    });
  }

  changed.sort((left, right) => right.priority - left.priority);
  const maxRows = params.maxRows ?? NFL_LIVE_STAT_BROADCAST_MAX_PER_SWEEP;
  return {
    rows: changed.slice(0, maxRows).map((entry) => entry.row),
    nextByPlayerKey,
    droppedRows: Math.max(0, changed.length - maxRows),
  };
}
