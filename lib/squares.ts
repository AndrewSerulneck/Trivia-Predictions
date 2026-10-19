// Super Bowl Squares — the pure rules (docs/squares-and-brackets-plan.md, Phase 2). No I/O, no
// server-only, so the player screens (Phase 3), the admin panel and the tests share one copy.
// The database half lives in supabase/migrations/20261019051458_squares_engine.sql; the server
// half in lib/squaresFeed.ts, lib/squaresSettlement.ts, lib/squaresBoard.ts, lib/squaresAdmin.ts.
//
// Grid: cell = row * 10 + col, 0–99. Columns belong to the column team (the AFC team in a Super
// Bowl), rows to the row team (NFC). colDigits[col] is the digit printed above column `col`.

import { SQUARES_MOMENTS, SQUARES_MOMENT_POINTS, type SquaresMoment } from "@/lib/seasonalPoints";

export { SQUARES_MOMENTS, SQUARES_MOMENT_POINTS, type SquaresMoment };

export const SQUARES_CELL_COUNT = 100;

/** Claims close and the numbers are drawn this long before kickoff (plan §3). */
export const SQUARES_LOCK_BEFORE_KICKOFF_MS = 30 * 60 * 1000;

/** A moment's score must be seen unchanged this long before it is graded (Bingo's final hold). */
export const SQUARES_CONFIRMATION_MS = 60 * 1000;

/** After the game is complete the settlement keeps reading the feed this long, to catch corrections. */
export const SQUARES_POST_FINAL_WATCH_MS = 3 * 60 * 60 * 1000;

/** During the post-final watch, read the feed at most this often. */
export const SQUARES_POST_FINAL_POLL_MS = 5 * 60 * 1000;

/** Before lock, refresh the matchup / kickoff from the feed at most this often. */
export const SQUARES_PRE_LOCK_REFRESH_MS = 60 * 60 * 1000;

/** Stop reading the feed this long after kickoff if the game never went final (an admin takes over). */
export const SQUARES_NO_FINAL_DEADLINE_MS = 12 * 60 * 60 * 1000;

/** Without a current event, look for the Super Bowl in the feed at most once per this many minutes. */
export const SQUARES_DISCOVERY_EVERY_MINUTES = 15;

/** Quarters that must be finished before each moment counts. `final` needs the game final. */
const MOMENT_QUARTERS: Record<SquaresMoment, number> = { q1: 1, half: 2, q3: 3, final: 4 };

export const isSquaresMoment = (value: unknown): value is SquaresMoment =>
  typeof value === "string" && (SQUARES_MOMENTS as readonly string[]).includes(value);

export const isSquaresCell = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < SQUARES_CELL_COUNT;

export const cellOf = (row: number, col: number): number => row * 10 + col;
export const rowOfCell = (cell: number): number => Math.floor(cell / 10);
export const colOfCell = (cell: number): number => cell % 10;

/** True when `digits` holds 0–9 each exactly once. Mirrors squares_is_digit_permutation(). */
export const isDigitPermutation = (digits: readonly number[] | null | undefined): digits is number[] => {
  if (!Array.isArray(digits) || digits.length !== 10) return false;
  const sorted = [...digits].sort((a, b) => a - b);
  return sorted.every((digit, index) => digit === index);
};

/** The winning cell for a cumulative score. Mirrors the cell math in squares_grade_moment(). */
export const winningCell = (
  colDigits: readonly number[],
  rowDigits: readonly number[],
  colScore: number,
  rowScore: number,
): number => {
  const col = colDigits.indexOf(colScore % 10);
  const row = rowDigits.indexOf(rowScore % 10);
  if (col < 0 || row < 0) throw new Error("winningCell: digits are not a permutation of 0–9");
  return cellOf(row, col);
};

// ── The feed record (balldontlie /nfl/v1/games) ─────────────────────────────────────────────

export type NflFeedTeam = {
  id: number;
  abbreviation?: string | null;
  full_name?: string | null;
  name?: string | null;
  location?: string | null;
  conference?: string | null;
};

type QuarterValue = number | null | undefined;

export type NflFeedGame = {
  id: number;
  date?: string | null;
  season?: number | null;
  week?: number | null;
  postseason?: boolean | null;
  status?: string | null;
  status_state?: string | null;
  home_team?: NflFeedTeam | null;
  visitor_team?: NflFeedTeam | null;
  home_team_score?: number | null;
  visitor_team_score?: number | null;
  home_team_q1?: QuarterValue;
  home_team_q2?: QuarterValue;
  home_team_q3?: QuarterValue;
  home_team_q4?: QuarterValue;
  home_team_ot?: QuarterValue;
  visitor_team_q1?: QuarterValue;
  visitor_team_q2?: QuarterValue;
  visitor_team_q3?: QuarterValue;
  visitor_team_q4?: QuarterValue;
  visitor_team_ot?: QuarterValue;
};

export type SquaresSide = "home" | "visitor";

/** What the event stores for an axis team. */
export type SquaresTeam = {
  id: number;
  abbreviation: string;
  fullName: string;
  name: string;
  conference: string | null;
};

const toTeam = (team: NflFeedTeam): SquaresTeam => ({
  id: team.id,
  abbreviation: String(team.abbreviation ?? "").trim(),
  fullName: String(team.full_name ?? team.name ?? "").trim(),
  name: String(team.name ?? team.full_name ?? "").trim(),
  conference: team.conference ? String(team.conference).trim().toUpperCase() : null,
});

/**
 * Which side is the column team. A Super Bowl (AFC vs NFC): the AFC side, whichever is "home" —
 * the designated home team alternates by year. Same-conference games (an admin rehearsal on a
 * regular-season game): the visitor. Null when either team is unknown.
 */
export const squaresAxes = (
  game: NflFeedGame,
): { colSide: SquaresSide; colTeam: SquaresTeam; rowTeam: SquaresTeam } | null => {
  const home = game.home_team;
  const visitor = game.visitor_team;
  if (!home?.id || !visitor?.id || home.id === visitor.id) return null;
  const homeConf = String(home.conference ?? "").toUpperCase();
  const visitorConf = String(visitor.conference ?? "").toUpperCase();
  const colSide: SquaresSide = homeConf === "AFC" && visitorConf === "NFC" ? "home" : "visitor";
  const colTeam = colSide === "home" ? home : visitor;
  const rowTeam = colSide === "home" ? visitor : home;
  return { colSide, colTeam: toTeam(colTeam), rowTeam: toTeam(rowTeam) };
};

/** The Super Bowl is the only postseason game between the two conferences. */
export const isSuperBowlRecord = (game: NflFeedGame): boolean => {
  if (game.postseason !== true) return false;
  const a = String(game.home_team?.conference ?? "").toUpperCase();
  const b = String(game.visitor_team?.conference ?? "").toUpperCase();
  return Boolean(game.home_team?.id && game.visitor_team?.id) && ((a === "AFC" && b === "NFC") || (a === "NFC" && b === "AFC"));
};

/** Picks the Super Bowl out of a season's postseason list (latest one if the feed ever repeats). */
export const findSuperBowl = (games: readonly NflFeedGame[]): NflFeedGame | null => {
  const candidates = games.filter((game) => isSuperBowlRecord(game) && Number.isFinite(Date.parse(String(game.date ?? ""))));
  candidates.sort((a, b) => Date.parse(String(b.date)) - Date.parse(String(a.date)));
  return candidates[0] ?? null;
};

/** Lock time for a kickoff: kickoff − 30 min, or an admin's earlier time (never after kickoff). */
export const lockAtFor = (kickoffMs: number, adminLockMs?: number | null): number => {
  const auto = kickoffMs - SQUARES_LOCK_BEFORE_KICKOFF_MS;
  if (adminLockMs === null || adminLockMs === undefined || !Number.isFinite(adminLockMs)) return auto;
  return Math.min(adminLockMs, kickoffMs);
};

// ── Moment evidence: when does the feed PROVE a moment is over, and at what score? ──────────
//
// Phase 0 facts (plan §8): a scoreless quarter is `null` in some finished records and `0` in
// others, and while a game is live `null` can also mean "not played yet". So:
//   • A moment is over only on POSITIVE evidence: the game is final; or the status text names a
//     later point (e.g. "Halftime", "3rd Quarter", "End of 1st"); or a LATER quarter has a value
//     greater than 0 (a 0 might be pre-filled, so it proves nothing).
//   • Its score is the cumulative sum through that quarter, null counted as 0 — accepted only when
//     every quarter (+ OT) sums to the team's total score, which proves no scoring is missing from
//     the breakdown. Otherwise the moment waits.
//   • The final moment uses the totals (overtime counts toward the final) once the game is final.
// Being late is the safe failure: a moment that can't be proven live is proven when the game ends.
// The live capture (tests/fixtures/squares/nfl-live-capture-*.json) checks this rule.

export const isFinalRecord = (game: NflFeedGame): boolean => {
  const state = String(game.status_state ?? "").trim().toLowerCase();
  if (state === "final" || state === "post") return true;
  return /^final\b/i.test(String(game.status ?? "").trim());
};

const isPreGameRecord = (game: NflFeedGame): boolean => {
  const state = String(game.status_state ?? "").trim().toLowerCase();
  return state === "" || state === "scheduled" || state === "pre";
};

/**
 * Fewest quarters the status text proves are finished (0 when it proves nothing). Strict on
 * purpose: an ordinal counts only next to a quarter word ("3rd Quarter", "3rd Qtr", "Q3"), so a
 * down-and-distance string like "3rd & 5" proves nothing. Unknown wording = 0 = wait.
 */
export const quartersFinishedFromStatus = (status: string | null | undefined): number => {
  const text = String(status ?? "").trim().toLowerCase();
  if (!text) return 0;
  if (/^final\b/.test(text)) return 4;
  const end = text.match(/\bend\s+of\s+(?:the\s+)?(1st|first|2nd|second|3rd|third|4th|fourth|regulation)\b/);
  if (end) return ({ "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3 } as Record<string, number>)[end[1]] ?? 4;
  if (/\bhalf\s*-?\s*time\b|^half$/.test(text)) return 2;
  if (/\bovertime\b|^\d?ot\b|\b\d?ot\s+\d{1,2}:\d{2}\b/.test(text)) return 4;
  const quarter = (ordinal: string, n: number) =>
    new RegExp(`\\b(?:${ordinal})\\s*(?:quarter|qtr|q)\\b|\\bq${n}\\b|\\b${n}q\\b`).test(text);
  if (quarter("4th|fourth", 4)) return 3;
  if (quarter("3rd|third", 3)) return 2;
  if (quarter("2nd|second", 2)) return 1;
  return 0;
};

const sideValues = (game: NflFeedGame, side: SquaresSide): { quarters: QuarterValue[]; total: number | null | undefined } =>
  side === "home"
    ? {
        quarters: [game.home_team_q1, game.home_team_q2, game.home_team_q3, game.home_team_q4, game.home_team_ot],
        total: game.home_team_score,
      }
    : {
        quarters: [game.visitor_team_q1, game.visitor_team_q2, game.visitor_team_q3, game.visitor_team_q4, game.visitor_team_ot],
        total: game.visitor_team_score,
      };

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Fewest quarters the quarter fields prove are finished: a later quarter with points > 0. */
export const quartersFinishedFromFields = (game: NflFeedGame): number => {
  let finished = 0;
  for (const side of ["home", "visitor"] as const) {
    const { quarters } = sideValues(game, side);
    quarters.forEach((value, index) => {
      // index 0..3 = Q1..Q4, 4 = OT. Points in quarter k+1 prove k quarters are over.
      if (isCount(value) && value > 0) finished = Math.max(finished, Math.min(index, 4));
    });
  }
  return finished;
};

export const quartersFinished = (game: NflFeedGame): number => {
  if (isFinalRecord(game)) return 4;
  if (isPreGameRecord(game)) return 0;
  return Math.max(quartersFinishedFromStatus(game.status), quartersFinishedFromFields(game));
};

export type MomentScore = { col: number; row: number };

export type MomentEvidence =
  | { moment: SquaresMoment; state: "over"; score: MomentScore }
  | { moment: SquaresMoment; state: "not_over" }
  | { moment: SquaresMoment; state: "unproven"; reason: "quarters_do_not_sum" | "score_missing" };

/** A team's cumulative score through `quarters`, or null when the breakdown can't be trusted. */
const cumulativeThrough = (game: NflFeedGame, side: SquaresSide, quarters: number): number | null => {
  const { quarters: values, total } = sideValues(game, side);
  if (!isCount(total)) return null;
  if (values.some((value) => value !== null && value !== undefined && !isCount(value))) return null;
  const all = values.reduce<number>((sum, value) => sum + (isCount(value) ? value : 0), 0);
  if (all !== total) return null;
  return values.slice(0, quarters).reduce<number>((sum, value) => sum + (isCount(value) ? value : 0), 0);
};

/** Evidence for every moment from one feed record. `colSide` comes from the event. */
export const squaresMomentEvidence = (game: NflFeedGame, colSide: SquaresSide): MomentEvidence[] => {
  const rowSide: SquaresSide = colSide === "home" ? "visitor" : "home";
  const final = isFinalRecord(game);
  const finished = quartersFinished(game);
  return SQUARES_MOMENTS.map((moment): MomentEvidence => {
    if (moment === "final") {
      if (!final) return { moment, state: "not_over" };
      const col = sideValues(game, colSide).total;
      const row = sideValues(game, rowSide).total;
      return isCount(col) && isCount(row)
        ? { moment, state: "over", score: { col, row } }
        : { moment, state: "unproven", reason: "score_missing" };
    }
    if (finished < MOMENT_QUARTERS[moment]) return { moment, state: "not_over" };
    const col = cumulativeThrough(game, colSide, MOMENT_QUARTERS[moment]);
    const row = cumulativeThrough(game, rowSide, MOMENT_QUARTERS[moment]);
    return col !== null && row !== null
      ? { moment, state: "over", score: { col, row } }
      : { moment, state: "unproven", reason: "quarters_do_not_sum" };
  });
};

/** The live score for display, from the event's point of view. Null when the feed has none. */
export const liveScoreOf = (game: NflFeedGame, colSide: SquaresSide): MomentScore | null => {
  const rowSide: SquaresSide = colSide === "home" ? "visitor" : "home";
  const col = sideValues(game, colSide).total;
  const row = sideValues(game, rowSide).total;
  return isCount(col) && isCount(row) ? { col, row } : null;
};

// ── The 60-second hold ──────────────────────────────────────────────────────────────────────

export type MomentObservation = { col: number; row: number; atMs: number } | null;

export type MomentStep =
  | { action: "none" }
  | { action: "observe"; observation: { col: number; row: number; atMs: number } }
  | { action: "clear" }
  | { action: "grade"; score: MomentScore };

/**
 * What to do with one ungraded moment this run. The same score must be seen for
 * SQUARES_CONFIRMATION_MS before it is graded; a different score restarts the hold; losing the
 * evidence clears it.
 */
export const planMomentStep = (evidence: MomentEvidence, observed: MomentObservation, nowMs: number): MomentStep => {
  if (evidence.state !== "over") return observed ? { action: "clear" } : { action: "none" };
  const { col, row } = evidence.score;
  if (!observed || observed.col !== col || observed.row !== row) {
    return { action: "observe", observation: { col, row, atMs: nowMs } };
  }
  return nowMs - observed.atMs >= SQUARES_CONFIRMATION_MS ? { action: "grade", score: { col, row } } : { action: "none" };
};

/**
 * After the final: the quarter scores the final record implies, compared with what was graded.
 * Report-only — a correction is an admin void + re-grade, never automatic.
 */
export const gradedMomentMismatches = (
  finalRecord: NflFeedGame,
  colSide: SquaresSide,
  graded: ReadonlyArray<{ moment: SquaresMoment; col: number; row: number }>,
): Array<{ moment: SquaresMoment; graded: MomentScore; final: MomentScore | null }> => {
  const evidence = new Map(squaresMomentEvidence(finalRecord, colSide).map((item) => [item.moment, item]));
  return graded.flatMap((item) => {
    const proof = evidence.get(item.moment);
    const finalScore = proof?.state === "over" ? proof.score : null;
    if (finalScore && finalScore.col === item.col && finalScore.row === item.row) return [];
    return [{ moment: item.moment, graded: { col: item.col, row: item.row }, final: finalScore }];
  });
};

// ── Event phase (what the screens and the settlement branch on) ─────────────────────────────

export type SquaresEventPhase = "open" | "locked" | "drawn" | "complete" | "archived";

export const squaresEventPhase = (
  event: { lockAtMs: number; drawnAtMs: number | null; completedAtMs: number | null; archivedAtMs: number | null },
  nowMs: number,
): SquaresEventPhase => {
  if (event.archivedAtMs !== null) return "archived";
  if (event.completedAtMs !== null) return "complete";
  if (event.drawnAtMs !== null) return "drawn";
  return nowMs >= event.lockAtMs ? "locked" : "open";
};

/** The credit key for a board's moment under one grade. Mirrors squares_grade_moment(). */
export const squaresCreditKey = (boardId: string, moment: SquaresMoment, gradeNo: number): string =>
  `${boardId}:${moment}:${gradeNo}`;

export const squaresMomentPoints = (moment: SquaresMoment): number => SQUARES_MOMENT_POINTS[moment];
