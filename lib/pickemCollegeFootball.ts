// College Football in regular Pick 'Em (docs/pickem-college-football-and-prize-plan.md Phase 2).
// A leaf: no I/O, no imports, so lib/pickem.ts and the screens can both use it.

export const COLLEGE_FOOTBALL_SPORT_KEY = "americanfootball_ncaaf";

/**
 * FBS conference ids from BallDontLie's `/ncaaf/v1/conferences`, checked against the provider on
 * 2026-10-31 (fixture `tests/fixtures/pickem-ncaaf/conferences.json`, pinned by a test):
 * 1 ACC, 2 American, 3 Big 12, 4 Big Ten, 5 CUSA, 6 FBS Indep., 7 MAC, 8 Mountain West, 9 Pac-12,
 * 10 SEC, 11 Sun Belt. Every other id (12–25, including 14 "FCS Indep.") is FCS.
 */
export const FBS_CONFERENCE_IDS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

function conferenceIdOf(team: unknown): number | null {
  if (!team || typeof team !== "object") return null;
  const raw = (team as Record<string, unknown>).conference;
  const id = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(id) ? id : null;
}

/**
 * The FBS rule (plan §4, Andrew D3): a game is offered when AT LEAST ONE team is FBS, so
 * Alabama vs an FCS team is in and FCS vs FCS is out. A team with no known conference counts as
 * not FBS.
 */
export function isFbsCollegeFootballGame(game: Record<string, unknown>): boolean {
  const home = conferenceIdOf(game.home_team);
  const away = conferenceIdOf(game.visitor_team ?? game.away_team);
  return (home !== null && FBS_CONFERENCE_IDS.has(home)) || (away !== null && FBS_CONFERENCE_IDS.has(away));
}

/**
 * The live label for a college game. The provider sends `period` (1–4 quarters, 5+ overtime) and
 * `time` as the clock ("12:28"); `status` is "pre" / "in" / "post". Halftime arrives as the end of
 * the 2nd quarter ("2", "0:00"). Anything not in progress gets no label.
 */
export function formatCollegeFootballPeriodLabel(game: Record<string, unknown>): string | null {
  if (String(game.status ?? "").trim().toLowerCase() !== "in") return null;
  const period = typeof game.period === "number" ? game.period : Number.parseInt(String(game.period ?? ""), 10);
  if (!Number.isFinite(period) || period < 1) return null;
  const clock = String(game.time ?? "").trim();
  const hasClock = /^\d{1,2}:\d{2}$/.test(clock);
  if (period === 2 && clock === "0:00") return "Halftime";
  const quarter = period > 4 ? "OT" : `Q${period}`;
  return hasClock ? `${quarter} · ${clock}` : quarter;
}

/** The one line that points NFL fans to NFL Pick 'Em (shown under the sport row). */
export const NFL_PICKEM_SIGNPOST = {
  text: "Looking for the NFL? NFL Pick 'Em is its own game.",
  linkLabel: "Open NFL Pick 'Em",
  href: "/nfl-pickem",
} as const;

/** A college pick with no final this long after kickoff is cancelled, not left pending forever. */
export const COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS = 48 * 60 * 60 * 1000;

/**
 * The provider's words for a college game that won't be finished as scheduled (Phase 7.3, F3):
 * cancelled (either spelling), postponed, forfeited or abandoned, in `status` or `status_state`.
 * Such a game is never graded: a not-started game reports 0–0, so grading it would hand every
 * away spread picker a "cover" (0 + line vs 0) and turn winner picks into pushes. A suspended or
 * delayed game is NOT called off: it may resume, so it waits like any unfinished game.
 */
export function isCollegeFootballCalledOff(params: { status: string | null; statusState: string | null }): boolean {
  return [params.status, params.statusState].some((value) => /cancel|postpon|forfeit|abandon/.test(String(value ?? "").toLowerCase()));
}

/**
 * A real college final, in the provider's own words (as in every captured fixture, overtime
 * games included): `status` "post" AND `status_state` "final", with both scores. A 0–0 "final" is
 * not believed (football can't end 0–0; it is what a game that never started reports).
 */
export function isCollegeFootballFinal(params: {
  status: string | null;
  statusState: string | null;
  homeScore: number | null;
  awayScore: number | null;
}): boolean {
  const status = String(params.status ?? "").trim().toLowerCase();
  const statusState = String(params.statusState ?? "").trim().toLowerCase();
  if (status !== "post" || statusState !== "final") return false;
  if (params.homeScore === null || params.awayScore === null) return false;
  return !(params.homeScore === 0 && params.awayScore === 0);
}

/**
 * When a college pick may be graded. Only a real final counts (`isCollegeFootballFinal`); a
 * called-off game is cancelled at once (`isCollegeFootballCalledOff`). The 4-hour "stale, grade
 * from the scores" shortcut other sports use is never applied here: college games often run past
 * 4 hours, and a game not yet started reports 0–0. A game with no final 48 hours after kickoff
 * (suspended, provider gap, a 0–0 "final") is cancelled.
 */
export function collegeFootballGradeGate(params: {
  status: string | null;
  statusState: string | null;
  homeScore: number | null;
  awayScore: number | null;
  startsAtMs: number;
  nowMs: number;
}): "grade" | "wait" | "cancel" | "called_off" {
  if (isCollegeFootballCalledOff(params)) return "called_off";
  if (isCollegeFootballFinal(params)) return "grade";
  if (Number.isFinite(params.startsAtMs) && params.nowMs - params.startsAtMs >= COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS) {
    return "cancel";
  }
  return "wait";
}

/**
 * A college pick whose game the provider doesn't return at all (Phase 7.4, F4) still gets its
 * 48-hour cancel — but only when that sport's score fetch was complete (`scoresComplete`): the
 * provider client reads a failed or cut-off request as "no games", and an outage must never
 * cancel picks. An incomplete fetch waits; the 8-day stale cancel is the backstop.
 */
export function collegeFootballMissingGameGate(params: {
  scoresComplete: boolean;
  startsAtMs: number;
  nowMs: number;
}): "wait" | "cancel" {
  if (!params.scoresComplete) return "wait";
  if (Number.isFinite(params.startsAtMs) && params.nowMs - params.startsAtMs >= COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS) {
    return "cancel";
  }
  return "wait";
}

/** Words for college spreads on the Pick 'Em screen (plan Phase 3). */
export const COLLEGE_FOOTBALL_SPREAD_COPY = {
  explainer: "Picks use the spread: your team must win by more than its line, or lose by less. Lines lock at kickoff.",
  lineComingSoon: "Line coming soon",
  noLineYet: "This game's line isn't out yet. Check back soon.",
  push: "Push (landed on the line)",
} as const;

/**
 * A spread pick on a final game can be graded only against the line locked at kickoff. Settlement
 * never fetches or creates a line, so a missing one cannot appear later: the pick waits (a slow
 * write may still land) and is cancelled 48 hours after kickoff rather than left pending forever.
 */
export function collegeFootballSpreadLineGate(params: {
  hasLockedLine: boolean;
  startsAtMs: number;
  nowMs: number;
}): "grade" | "wait" | "cancel" {
  if (params.hasLockedLine) return "grade";
  if (Number.isFinite(params.startsAtMs) && params.nowMs - params.startsAtMs >= COLLEGE_FOOTBALL_NO_FINAL_CANCEL_MS) {
    return "cancel";
  }
  return "wait";
}
