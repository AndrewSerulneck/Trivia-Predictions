// March Madness on the venue TV (docs/squares-and-brackets-plan.md, Phase 9b). Pure and client-safe:
// it turns the venue's bracket read into the small payload the TV draws — the venue's top 10, today's
// games of that bracket's tournament and the biggest upset busting brackets here. The caller passes
// only the tournaments this venue shows (a rehearsal only at a hidden venue). It adds no request of its own: the TV already
// polls /api/venue-screen/state, and that route reads the brackets (lib/bracketsTvRead.ts).

import type { BracketGameView } from "@/lib/bracketsEntries";
import { BRACKET_ROUND_NAMES, bracketDisplayYear, bracketOptionLabel } from "@/lib/bracketsView";
import { bracketMaxPossible, rankBracketEntries } from "@/lib/brackets/scoring";
import { childSlots, roundOfSlot, seatsOfRound1Slot, type BracketGender, type BracketKind, type BracketRound } from "@/lib/brackets/tree";

/** Rows of the venue's standings on the TV. */
export const BRACKET_TV_TOP = 10;
/** Most of today's games the TV lists. */
export const BRACKET_TV_GAMES = 8;
/** An upset counts as "now" for this long after it tipped off (tournament clock). */
export const BRACKET_TV_UPSET_WINDOW_MS = 36 * 60 * 60 * 1000;

export type BracketTvTournament = {
  id: string;
  gender: BracketGender;
  season: number;
  winnerSeats: Array<number | null>;
  championshipTotal: number | null;
  games: BracketGameView[];
  /** Lock instants in the tournament's own clock (a rehearsal runs behind); null = not set. */
  locks: Record<BracketKind, number | null>;
  /** The tournament's clock now (real now − a rehearsal's offset). */
  nowMs: number;
};

export type BracketTvEntry = {
  tournamentId: string;
  kind: BracketKind;
  entryId: string;
  username: string;
  score: number;
  tiebreaker: number | null;
  submittedAt: string;
  picks: Array<number | null>;
};

export type BracketTvTeam = { name: string; seed: number | null; score: number | null };

export type BracketTvPayload = {
  /** "Men's bracket 2027". */
  title: string;
  /** The bracket shown (tournament:kind) — the TV's transition key. */
  key: string;
  complete: boolean;
  entries: number;
  standings: Array<{ rank: number; username: string; score: number; maxPossible: number }>;
  games: Array<{
    round: string;
    tipAt: string | null;
    status: string | null;
    home: BracketTvTeam;
    away: BracketTvTeam;
    winnerSide: "home" | "away" | null;
  }>;
  upset: {
    round: string;
    winner: BracketTvTeam;
    loser: BracketTvTeam;
    /** Brackets here that had the loser winning this game. */
    busted: number;
    of: number;
  } | null;
};

const teamOf = (game: BracketGameView, side: "home" | "away"): BracketTvTeam => {
  const team = side === "home" ? game.home : game.away;
  return { name: team?.name ?? "TBD", seed: team?.seed ?? null, score: side === "home" ? game.homeScore : game.awayScore };
};

const roundLabel = (round: number): string => (round === 0 ? "First Four" : BRACKET_ROUND_NAMES[round as BracketRound] ?? "");

/** The seat a slot's side came from (round 1: its own seat; later: the winner of that child slot). */
const seatOfSide = (slot: number, side: "home" | "away", winnerSeats: ReadonlyArray<number | null>): number | null => {
  if (roundOfSlot(slot) === 1) return seatsOfRound1Slot(slot)[side === "home" ? 0 : 1];
  const children = childSlots(slot);
  return children ? winnerSeats[children[side === "home" ? 0 : 1]] ?? null : null;
};

/**
 * Which bracket the TV shows: one that has locked and has entries here, the most entries first (then
 * the men's, then the main bracket). Null when none has.
 */
const pickBracket = (
  tournaments: readonly BracketTvTournament[],
  entries: readonly BracketTvEntry[],
): { tournament: BracketTvTournament; kind: BracketKind; entries: BracketTvEntry[] } | null => {
  const options = tournaments.flatMap((tournament) =>
    (["main", "second"] as const).flatMap((kind) => {
      const lock = tournament.locks[kind];
      if (lock === null || tournament.nowMs < lock) return [];
      const mine = entries.filter((entry) => entry.tournamentId === tournament.id && entry.kind === kind);
      return mine.length > 0 ? [{ tournament, kind, entries: mine }] : [];
    }),
  );
  options.sort(
    (a, b) =>
      b.entries.length - a.entries.length ||
      (a.tournament.gender === b.tournament.gender ? 0 : a.tournament.gender === "men" ? -1 : 1) ||
      (a.kind === b.kind ? 0 : a.kind === "main" ? -1 : 1),
  );
  return options[0] ?? null;
};

/** Local YYYY-MM-DD of an instant (Intl, so DST is right). */
const dayOf = (ms: number, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/**
 * The TV payload, or null when the TV should not show the brackets: no bracket has locked with
 * entries at this venue yet.
 */
export const buildBracketTvPayload = (params: {
  tournaments: readonly BracketTvTournament[];
  entries: readonly BracketTvEntry[];
  timeZone: string;
}): BracketTvPayload | null => {
  const chosen = pickBracket(params.tournaments, params.entries);
  if (!chosen) return null;
  const { tournament, kind } = chosen;
  const winnerSeats = tournament.winnerSeats;

  const ranked = rankBracketEntries(chosen.entries, tournament.championshipTotal);
  const standings = ranked.slice(0, BRACKET_TV_TOP).map((entry) => ({
    rank: entry.rank,
    username: entry.username,
    score: entry.score,
    maxPossible: bracketMaxPossible(entry.picks, winnerSeats, kind),
  }));

  // Today's games of the shown bracket's tournament only (on its own clock), in tip order — the games
  // that move the standings beside them, never the other gender's or a rehearsal's (plan 10.4, §17 B7).
  const today = dayOf(tournament.nowMs, params.timeZone);
  const games = tournament.games
    .filter((game) => {
      const tipMs = Date.parse(String(game.tipAt ?? ""));
      return Number.isFinite(tipMs) && dayOf(tipMs, params.timeZone) === today && game.home && game.away;
    })
    .sort((a, b) => Date.parse(String(a.tipAt)) - Date.parse(String(b.tipAt)))
    .slice(0, BRACKET_TV_GAMES)
    .map((game) => ({
      round: roundLabel(game.round),
      tipAt: game.tipAt,
      status: game.status,
      home: teamOf(game, "home"),
      away: teamOf(game, "away"),
      winnerSide: game.winnerSide,
    }));

  // The biggest upset busting brackets here: a decided game of the shown bracket in the last 36 hours
  // where the higher seed number won, ranked by how many of this venue's brackets had the loser.
  let upset: BracketTvPayload["upset"] = null;
  let best = { busted: -1, gap: -1, tip: -1 };
  for (const game of tournament.games) {
    if (game.slot === null || !game.winnerSide || !game.home || !game.away) continue;
    const tipMs = Date.parse(String(game.tipAt ?? ""));
    if (!Number.isFinite(tipMs) || tipMs > tournament.nowMs || tournament.nowMs - tipMs > BRACKET_TV_UPSET_WINDOW_MS) continue;
    const winner = teamOf(game, game.winnerSide);
    const loserSide = game.winnerSide === "home" ? "away" : "home";
    const loser = teamOf(game, loserSide);
    if (winner.seed === null || loser.seed === null || winner.seed <= loser.seed) continue;
    const loserSeat = seatOfSide(game.slot, loserSide, winnerSeats);
    if (loserSeat === null) continue;
    const busted = chosen.entries.filter((entry) => entry.picks[game.slot as number] === loserSeat).length;
    if (busted === 0) continue;
    const gap = winner.seed - loser.seed;
    if (busted > best.busted || (busted === best.busted && (gap > best.gap || (gap === best.gap && tipMs > best.tip)))) {
      best = { busted, gap, tip: tipMs };
      upset = { round: roundLabel(game.round), winner, loser, busted, of: chosen.entries.length };
    }
  }

  return {
    title: `${bracketOptionLabel(tournament.gender, kind)} ${bracketDisplayYear(tournament.season)}`,
    key: `${tournament.id}:${kind}`,
    complete: winnerSeats[62] !== null && winnerSeats[62] !== undefined,
    entries: chosen.entries.length,
    standings,
    games,
    upset,
  };
};
