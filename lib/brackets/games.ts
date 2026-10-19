// March Madness brackets — the games, from the feed to graded state
// (docs/squares-and-brackets-plan.md, Phase 7). Pure, client-safe; the sync (lib/bracketsSync.ts)
// and the admin fix-ups are thin wrappers around these.
//
// Feed facts (plan §2, §8; tests/brackets-feed-fixture.test.ts):
//   - GET /ncaab|ncaaw/v1/bracket?season=<year the season STARTED>&per_page=100 — 67 games in 2026,
//     79 in 2027 (12 opening-round games per tournament). Pages at 25 without per_page.
//   - round 0 = opening round; its winner lands in a round-1 AWAY slot matched only by team id.
//     How a not-yet-played opener shows in round 1 is unknown until March 2027, so a round-1 team may
//     be missing (TBD), an opener is linked to its seat by team id when the feed shows it, by
//     elimination when only one seat and one opener are left, or by an admin.
//   - A loser's `winner` is null, never false. `seed` is a string. Final = status_state "final".
//
// Corrections are never automatic: once a game has a winner here, a feed record that disagrees is
// reported (mismatch_note) and an admin decides (override_result). Same stance as Squares and Bingo.

import {
  BRACKET_GAMES_PER_ROUND,
  BRACKET_SLOT_COUNT,
  childSlots,
  isBracketRound,
  roundOfSlot,
  seatsOfRound1Slot,
  slotOf,
  slotsOfRound,
  type BracketKind,
} from "@/lib/brackets/tree";
import type { BracketWinnerSeats } from "@/lib/brackets/picks";

// ── Feed shapes ──────────────────────────────────────────────────────────────────────────────

export type BracketFeedTeam = {
  id?: number | null;
  name?: string | null;
  full_name?: string | null;
  college?: string | null;
  abbreviation?: string | null;
  seed?: string | number | null;
  score?: number | null;
  winner?: boolean | null;
};

export type BracketFeedGame = {
  game_id: number;
  season?: number;
  round: number;
  bracket_location: number;
  date?: string | null;
  location?: string | null;
  status?: string | null;
  status_state?: string | null;
  status_detail?: string | null;
  home_team?: BracketFeedTeam | null;
  away_team?: BracketFeedTeam | null;
};

// ── Stored shapes (bracket_games, camelCase) ─────────────────────────────────────────────────

export type BracketTeam = {
  id: number;
  name: string;
  fullName: string;
  college: string;
  abbreviation: string;
  seed: number | null;
};

export type BracketSide = "home" | "away";

export type BracketGameState = {
  /** 0 = opening round, 1–6 = the bracket. */
  round: number;
  location: number;
  /** 0–62; null for an opening-round game. */
  slot: number | null;
  feedGameId: number | null;
  tipAt: string | null;
  statusState: string | null;
  statusDetail: string | null;
  homeTeam: BracketTeam | null;
  awayTeam: BracketTeam | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerSide: BracketSide | null;
  /** Who decided the winner: the feed, or an admin override. */
  resultSource: "feed" | "admin" | null;
  /** 'admin' = an admin set this game's teams; the feed no longer overwrites them. */
  teamsSetBy: "feed" | "admin";
  /** Opening round only: the round-1 seat its winner fills. */
  feedsSeat: number | null;
  feedsSeatSetBy: "auto" | "admin" | null;
  /** The feed disagreed with the stored result (report-only). */
  mismatchNote: string | null;
};

const isPositiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

/** A feed team, or null when the feed has no real team there yet (TBD). */
export const teamFromFeed = (team: BracketFeedTeam | null | undefined): BracketTeam | null => {
  if (!team || !isPositiveInt(team.id)) return null;
  const seed = Number.parseInt(String(team.seed ?? ""), 10);
  return {
    id: team.id,
    name: String(team.name ?? "").trim(),
    fullName: String(team.full_name ?? "").trim(),
    college: String(team.college ?? "").trim(),
    abbreviation: String(team.abbreviation ?? "").trim(),
    seed: Number.isInteger(seed) && seed >= 1 && seed <= 16 ? seed : null,
  };
};

/** The feed's winner side, only for a final record whose winner also has more points. */
export const feedWinnerSide = (game: BracketFeedGame): BracketSide | null => {
  if (String(game.status_state ?? "").toLowerCase() !== "final") return null;
  const home = game.home_team;
  const away = game.away_team;
  if (!isPositiveInt(home?.id) || !isPositiveInt(away?.id)) return null;
  const homeWon = home?.winner === true;
  const awayWon = away?.winner === true;
  if (homeWon === awayWon) return null;
  if (!isCount(home?.score) || !isCount(away?.score)) return null;
  if (homeWon && home.score > away.score) return "home";
  if (awayWon && away.score > home.score) return "away";
  return null;
};

export const isBracketFeedGame = (value: unknown): value is BracketFeedGame => {
  if (!value || typeof value !== "object") return false;
  const game = value as BracketFeedGame;
  if (!isPositiveInt(game.game_id) || !isPositiveInt(game.bracket_location)) return false;
  if (game.round === 0) return true;
  return isBracketRound(game.round) && slotOf(game.round, game.bracket_location) !== null;
};

export const emptyBracketGame = (round: number, location: number): BracketGameState => ({
  round,
  location,
  slot: round === 0 ? null : slotOf(round, location),
  feedGameId: null,
  tipAt: null,
  statusState: null,
  statusDetail: null,
  homeTeam: null,
  awayTeam: null,
  homeScore: null,
  awayScore: null,
  winnerSide: null,
  resultSource: null,
  teamsSetBy: "feed",
  feedsSeat: null,
  feedsSeatSetBy: null,
  mismatchNote: null,
});

const gameKey = (round: number, location: number): string => `${round}:${location}`;

// ── Replay clock (rehearsals; plan Phase 10) ─────────────────────────────────────────────────
// A rehearsal tournament replays a finished season against a clock set in the past
// (bracket_tournaments.clock_offset_seconds). The feed already knows every result, so each record
// is cut back to what was known at `asOfMs`: not tipped = scheduled, tipped but under
// REPLAY_GAME_MS = in progress, after that = as the feed has it. Later-round teams and filled
// opening-round seats are hidden until the games that decide them are over.

export const REPLAY_GAME_MS = 150 * 60_000;

export const maskBracketFeedAt = (games: readonly BracketFeedGame[], asOfMs: number): BracketFeedGame[] => {
  const tipMs = (game: BracketFeedGame) => Date.parse(String(game.date ?? ""));
  const isOverAt = (game: BracketFeedGame) => Number.isFinite(tipMs(game)) && tipMs(game) + REPLAY_GAME_MS <= asOfMs;
  const unplayedOpenerTeams = new Set<number>();
  for (const game of games) {
    if (game.round !== 0 || isOverAt(game)) continue;
    for (const team of [game.home_team, game.away_team]) if (isPositiveInt(team?.id)) unplayedOpenerTeams.add(team.id);
  }
  const strip = (team: BracketFeedTeam | null | undefined): BracketFeedTeam | null =>
    team ? { ...team, score: null, winner: null } : null;
  return games.map((game) => {
    const tip = tipMs(game);
    const tipped = Number.isFinite(tip) && tip <= asOfMs;
    if (isOverAt(game)) return game;
    let home = strip(game.home_team);
    let away = strip(game.away_team);
    if (game.round >= 2 && !tipped) {
      home = null;
      away = null;
    }
    if (game.round === 1) {
      if (isPositiveInt(home?.id) && unplayedOpenerTeams.has(home.id)) home = null;
      if (isPositiveInt(away?.id) && unplayedOpenerTeams.has(away.id)) away = null;
    }
    return {
      ...game,
      status: tipped ? "in" : "pre",
      status_state: tipped ? "in" : "pre",
      status_detail: tipped ? "In progress" : "Scheduled",
      home_team: home,
      away_team: away,
    };
  });
};

// ── Merging a feed pull into the stored games ────────────────────────────────────────────────

export type BracketMergeResult = {
  /** Every game after the merge (stored games the feed didn't mention are kept). */
  games: BracketGameState[];
  /** The games whose stored row must be written. */
  changed: BracketGameState[];
  /** New mismatch notes, for the log. */
  mismatches: Array<{ round: number; location: number; note: string }>;
};

const sameTeam = (a: BracketTeam | null, b: BracketTeam | null): boolean => JSON.stringify(a) === JSON.stringify(b);

export const bracketGameChanged = (a: BracketGameState, b: BracketGameState): boolean => JSON.stringify(a) !== JSON.stringify(b);

const mergeOne = (stored: BracketGameState, feed: BracketFeedGame): { game: BracketGameState; mismatch: string | null } => {
  const next: BracketGameState = { ...stored, feedGameId: feed.game_id };
  if (feed.date && Number.isFinite(Date.parse(feed.date))) next.tipAt = new Date(Date.parse(feed.date)).toISOString();
  next.statusState = feed.status_state ? String(feed.status_state) : next.statusState;
  next.statusDetail = feed.status_detail ? String(feed.status_detail) : next.statusDetail;
  if (stored.teamsSetBy !== "admin") {
    next.homeTeam = teamFromFeed(feed.home_team) ?? stored.homeTeam;
    next.awayTeam = teamFromFeed(feed.away_team) ?? stored.awayTeam;
  }
  if (isCount(feed.home_team?.score)) next.homeScore = feed.home_team.score;
  if (isCount(feed.away_team?.score)) next.awayScore = feed.away_team.score;
  const side = feedWinnerSide(feed);
  let mismatch: string | null = null;
  if (stored.winnerSide === null) {
    if (side) {
      next.winnerSide = side;
      next.resultSource = "feed";
    }
  } else if (side && side !== stored.winnerSide) {
    mismatch = `Feed says the ${side} team won; stored result is ${stored.winnerSide} (${stored.resultSource ?? "feed"}).`;
    next.mismatchNote = mismatch;
  } else if (side === stored.winnerSide && stored.mismatchNote) {
    next.mismatchNote = null;
  }
  return { game: next, mismatch: mismatch && mismatch !== stored.mismatchNote ? mismatch : null };
};

/**
 * Link each opening-round game to the round-1 seat its winner fills: kept if an admin set it;
 * else the seat whose team is one of the opener's two teams; else, when exactly one opener and
 * exactly one empty round-1 seat are left, that seat. Anything else waits for an admin.
 */
export const linkOpeners = (games: readonly BracketGameState[]): BracketGameState[] => {
  const round1 = games.filter((g) => g.round === 1 && g.slot !== null);
  const seatTeam = new Map<number, BracketTeam | null>();
  for (const game of round1) {
    const [home, away] = seatsOfRound1Slot(game.slot as number);
    seatTeam.set(home, game.homeTeam);
    seatTeam.set(away, game.awayTeam);
  }
  const result = games.map((game) => {
    if (game.round !== 0 || game.feedsSeatSetBy === "admin") return game;
    const ids = new Set([game.homeTeam?.id, game.awayTeam?.id].filter(isPositiveInt));
    for (const [seat, team] of seatTeam) {
      if (team && ids.has(team.id)) return { ...game, feedsSeat: seat, feedsSeatSetBy: "auto" as const };
    }
    return game;
  });
  const taken = new Set(result.filter((g) => g.round === 0 && g.feedsSeat !== null).map((g) => g.feedsSeat as number));
  const openSeats = [...seatTeam].filter(([seat, team]) => team === null && !taken.has(seat)).map(([seat]) => seat);
  const unlinked = result.filter((g) => g.round === 0 && g.feedsSeat === null);
  if (openSeats.length === 1 && unlinked.length === 1) {
    return result.map((g) => (g === unlinked[0] ? { ...g, feedsSeat: openSeats[0], feedsSeatSetBy: "auto" as const } : g));
  }
  return result;
};

/** Fill a later-round game's missing teams from the winners of the games feeding it. */
const fillTeamsFromChildren = (games: BracketGameState[]): BracketGameState[] => {
  const bySlot = new Map<number, BracketGameState>();
  for (const game of games) if (game.slot !== null) bySlot.set(game.slot, game);
  const winnerTeam = (slot: number): BracketTeam | null => {
    const game = bySlot.get(slot);
    if (!game?.winnerSide) return null;
    return game.winnerSide === "home" ? game.homeTeam : game.awayTeam;
  };
  for (let slot = 32; slot < BRACKET_SLOT_COUNT; slot += 1) {
    const game = bySlot.get(slot);
    const children = childSlots(slot);
    if (!game || !children || game.teamsSetBy === "admin") continue;
    const home = game.homeTeam ?? winnerTeam(children[0]);
    const away = game.awayTeam ?? winnerTeam(children[1]);
    if (!sameTeam(home, game.homeTeam) || !sameTeam(away, game.awayTeam)) {
      bySlot.set(slot, { ...game, homeTeam: home, awayTeam: away });
    }
  }
  return games.map((game) => (game.slot !== null ? (bySlot.get(game.slot) ?? game) : game));
};

/** Merge one feed pull (already masked for a replay) into the stored games. */
export const mergeBracketFeed = (stored: readonly BracketGameState[], feed: readonly BracketFeedGame[]): BracketMergeResult => {
  const byKey = new Map(stored.map((game) => [gameKey(game.round, game.location), game]));
  const mismatches: BracketMergeResult["mismatches"] = [];
  for (const record of feed) {
    if (!isBracketFeedGame(record)) continue;
    const key = gameKey(record.round, record.bracket_location);
    const base = byKey.get(key) ?? emptyBracketGame(record.round, record.bracket_location);
    const { game, mismatch } = mergeOne(base, record);
    if (mismatch) mismatches.push({ round: game.round, location: game.location, note: mismatch });
    byKey.set(key, game);
  }
  const merged = fillTeamsFromChildren(linkOpeners([...byKey.values()])).sort(
    (a, b) => a.round - b.round || a.location - b.location,
  );
  const before = new Map(stored.map((game) => [gameKey(game.round, game.location), game]));
  const changed = merged.filter((game) => {
    const old = before.get(gameKey(game.round, game.location));
    return !old || bracketGameChanged(old, game);
  });
  return { games: merged, changed, mismatches };
};

// ── Graded state ─────────────────────────────────────────────────────────────────────────────

/** The winning seat of every slot (null = undecided), the array grading compares picks with. */
export const bracketWinnerSeats = (games: readonly BracketGameState[]): Array<number | null> => {
  const sideBySlot = new Map<number, BracketSide | null>();
  for (const game of games) if (game.slot !== null) sideBySlot.set(game.slot, game.winnerSide);
  const seats: Array<number | null> = Array.from({ length: BRACKET_SLOT_COUNT }, () => null);
  for (let slot = 0; slot < BRACKET_SLOT_COUNT; slot += 1) {
    const side = sideBySlot.get(slot) ?? null;
    if (!side) continue;
    const children = childSlots(slot);
    if (!children) {
      const [home, away] = seatsOfRound1Slot(slot);
      seats[slot] = side === "home" ? home : away;
    } else {
      seats[slot] = seats[side === "home" ? children[0] : children[1]];
    }
  }
  return seats;
};

/** The championship game's total points once it is decided (the tiebreaker's answer). */
export const championshipTotal = (games: readonly BracketGameState[]): number | null => {
  const final = games.find((game) => game.slot === BRACKET_SLOT_COUNT - 1);
  if (!final?.winnerSide || !isCount(final.homeScore) || !isCount(final.awayScore)) return null;
  return final.homeScore + final.awayScore;
};

const earliestTip = (games: readonly BracketGameState[], round: number): string | null => {
  const tips = games
    .filter((game) => game.round === round && game.tipAt)
    .map((game) => Date.parse(game.tipAt as string))
    .filter(Number.isFinite);
  return tips.length ? new Date(Math.min(...tips)).toISOString() : null;
};

/** Automatic lock times: the first Round-of-64 tip (main) and the first Sweet 16 tip (second chance). */
export const autoBracketLocks = (games: readonly BracketGameState[]): { main: string | null; second: string | null } => ({
  main: earliestTip(games, 1),
  second: earliestTip(games, 3),
});

/** All 32 Round-of-64 games are in the feed (teams may still be TBD behind an opening-round game). */
export const hasFullField = (games: readonly BracketGameState[]): boolean =>
  games.filter((game) => game.round === 1).length === BRACKET_GAMES_PER_ROUND[1];

/** The Sweet 16 is set: every Round-of-32 game has a winner. */
export const isSweetSixteenSet = (winnerSeats: BracketWinnerSeats): boolean =>
  slotsOfRound(2).every((slot) => (winnerSeats[slot] ?? null) !== null);

export type BracketKindPhase = "not_open" | "open" | "locked" | "complete";

/** Where one kind of entry stands at `nowMs` (the tournament's own clock: real now − clock offset). */
export const bracketKindPhase = (params: {
  kind: BracketKind;
  nowMs: number;
  lockAt: string | null;
  fullField: boolean;
  winnerSeats: BracketWinnerSeats;
}): BracketKindPhase => {
  const { kind, nowMs, lockAt, fullField, winnerSeats } = params;
  if ((winnerSeats[BRACKET_SLOT_COUNT - 1] ?? null) !== null) return "complete";
  const ready = kind === "main" ? fullField : isSweetSixteenSet(winnerSeats);
  if (!ready || !lockAt) return "not_open";
  return nowMs < Date.parse(lockAt) ? "open" : "locked";
};

// ── Sync pace ────────────────────────────────────────────────────────────────────────────────
// Plan §4 Phase 7: every 2 min while a game is live, hourly otherwise inside the window.

export const BRACKET_LIVE_SYNC_MS = 2 * 60_000;
export const BRACKET_IDLE_SYNC_MS = 60 * 60_000;
/** A tipped game with no winner after this long is no longer treated as live (a stuck feed). */
export const BRACKET_LIVE_GAME_MAX_MS = 6 * 60 * 60_000;

/** When to read the feed next (tournament clock, ms), or null when the championship is decided. */
export const nextBracketSyncAt = (games: readonly BracketGameState[], nowMs: number): number | null => {
  const final = games.find((game) => game.slot === BRACKET_SLOT_COUNT - 1);
  if (final?.winnerSide) return null;
  let nextTip = Number.POSITIVE_INFINITY;
  for (const game of games) {
    if (game.winnerSide || !game.tipAt) continue;
    const tip = Date.parse(game.tipAt);
    if (!Number.isFinite(tip)) continue;
    if (tip <= nowMs && nowMs - tip < BRACKET_LIVE_GAME_MAX_MS) return nowMs + BRACKET_LIVE_SYNC_MS;
    if (tip > nowMs) nextTip = Math.min(nextTip, tip);
  }
  return Math.max(nowMs + BRACKET_LIVE_SYNC_MS, Math.min(nowMs + BRACKET_IDLE_SYNC_MS, nextTip));
};

/** Rounds whose winners differ between two winner-seat arrays (an override's reach). */
export const roundsChangedBetween = (before: BracketWinnerSeats, after: BracketWinnerSeats): number[] => {
  const rounds = new Set<number>();
  for (let slot = 0; slot < BRACKET_SLOT_COUNT; slot += 1) {
    if ((before[slot] ?? null) !== (after[slot] ?? null)) rounds.add(roundOfSlot(slot));
  }
  return [...rounds].sort((a, b) => a - b);
};
