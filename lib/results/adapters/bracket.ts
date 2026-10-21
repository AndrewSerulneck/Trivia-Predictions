import "server-only";

import { gameView } from "@/lib/bracketsEntries";
import { getBracketGames } from "@/lib/bracketsStore";
import { BRACKET_ROUND_NAMES, bracketDisplayYear, bracketOptionLabel, bracketRegionName, bracketSeatTeams } from "@/lib/bracketsView";
import { bracketRoundPoints, rankBracketEntries } from "@/lib/brackets/scoring";
import {
  BRACKET_SLOT_COUNT,
  isBracketKind,
  locationOfSlot,
  regionOfSlot,
  roundOfSlot,
  slotsOfKind,
  type BracketGender,
  type BracketKind,
} from "@/lib/brackets/tree";
import { localDateOf } from "@/lib/ownerHistoryDisplay";
import { findResultsEntry, makeResultsEntryTokens, resultsEntryTokensEnabled } from "@/lib/results/entryToken";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";
import { loadUsernames } from "@/lib/results/playerNames";
import type {
  ResultsAdapter,
  ResultsBreakdownRow,
  ResultsGameDetail,
  ResultsGamePage,
  ResultsGameRow,
} from "@/lib/results/types";
import { isBracketsEnabled, isBracketsRehearsalEnabled } from "@/lib/seasonalGames";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import { getVenueTimezone } from "@/lib/timezone";

// March Madness brackets on the Results page (docs/squares-and-brackets-plan.md Phase 9a). One game per
// bracket (tournament × main / second chance) the venue's players filled out: gameKey =
// "<tournament id>:<kind>". It is dated on the day the bracket LOCKED (when play started; in real
// time for a rehearsal) and is "in progress" until the championship is graded — which, as for Live
// Trivia, names nobody yet. A player's score is their bracket score; standings are the bracket's own
// order (points, tiebreaker, earliest save), scorers only; "players" counts every entry with a pick.
// Breakdown = the player's picks, each right or wrong, with the round's points (hasBreakdown: true).
//
// INERT while both NEXT_PUBLIC_BRACKETS_ENABLED and BRACKETS_REHEARSAL_ENABLED are off: no game is
// listed and a game URL is a 404, with no read at all. (Turning them off after a season hides past
// brackets here too, as Squares does.)
//
// COST (on demand only): a timeline page = ONE indexed aggregate (bracket_venue_games, on
// bracket_entries_venue_id_idx); with brackets: + one tournaments read + the venue timezone (cached
// 10 min) + one entries read per FINISHED bracket on the page (≤ 4 a season) + one usernames read. A
// game screen: tournament + entries + usernames. A breakdown: tournament + entries + games (≤ 79 rows).
//
// PRIVACY: usernames and scores only; a standings row's `entry` is the HMAC token (never a user id).

export const BRACKET_COMPETITION_ID = "bracket";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Entries one venue can have in one bracket that the read will rank (far above real venues). */
const ENTRIES_CAP = 1000;

const TOURNAMENT_SELECT =
  "id, gender, season, purpose, clock_offset_seconds, region_names, winner_seats, championship_total, main_lock_at, second_lock_at, completed_at";

type TournamentRow = {
  id: string;
  gender: BracketGender;
  season: number;
  purpose: "live" | "rehearsal";
  clock_offset_seconds: number | null;
  region_names: Array<string | null> | null;
  winner_seats: Array<number | null> | null;
  championship_total: number | null;
  main_lock_at: string | null;
  second_lock_at: string | null;
  completed_at: string | null;
};

type EntryRow = {
  id: string;
  user_id: string;
  score: number;
  tiebreaker: number | null;
  submitted_at: string;
};

/** One bracket as a Results game, before its standings are read. */
type BracketGame = {
  tournament: TournamentRow;
  kind: BracketKind;
  gameKey: string;
  lockMs: number;
  players: number;
  completed: boolean;
};

const client = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

const isOn = (): boolean => isBracketsEnabled() || isBracketsRehearsalEnabled();

export const bracketResultsGameKey = (tournamentId: string, kind: BracketKind): string => `${tournamentId}:${kind}`;

const parseGameKey = (gameKey: string): { tournamentId: string; kind: BracketKind } | null => {
  const [tournamentId, kind, extra] = String(gameKey ?? "").trim().split(":");
  if (extra !== undefined || !UUID_PATTERN.test(tournamentId ?? "") || !isBracketKind(kind)) return null;
  return { tournamentId, kind };
};

/** When the bracket locked, in REAL time (a rehearsal's clock runs behind by its offset). */
const realLockMs = (tournament: TournamentRow, kind: BracketKind): number | null => {
  const lockMs = Date.parse(String((kind === "main" ? tournament.main_lock_at : tournament.second_lock_at) ?? ""));
  return Number.isFinite(lockMs) ? lockMs + Number(tournament.clock_offset_seconds ?? 0) * 1000 : null;
};

/** "Men's bracket 2027" (a rehearsal says so). */
const gameTitle = (tournament: TournamentRow, kind: BracketKind): string =>
  `${bracketOptionLabel(tournament.gender, kind)} ${bracketDisplayYear(Number(tournament.season))}${
    tournament.purpose === "rehearsal" ? " · Rehearsal" : ""
  }`;

const readTournaments = async (ids: readonly string[]): Promise<TournamentRow[]> => {
  if (ids.length === 0) return [];
  const { data, error } = await client().from("bracket_tournaments").select(TOURNAMENT_SELECT).in("id", [...ids]).returns<TournamentRow[]>();
  if (error) throw new Error(error.message ?? "Failed to load brackets.");
  return data ?? [];
};

const readEntries = async (tournamentId: string, kind: BracketKind, venueId: string): Promise<EntryRow[]> => {
  const { data, error } = await client()
    .from("bracket_entries")
    .select("id, user_id, score, tiebreaker, submitted_at")
    .eq("tournament_id", tournamentId)
    .eq("kind", kind)
    .eq("venue_id", venueId)
    .gt("pick_count", 0)
    .order("score", { ascending: false })
    .limit(ENTRIES_CAP)
    .returns<EntryRow[]>();
  if (error) throw new Error(error.message ?? "Failed to load the bracket's entries.");
  return data ?? [];
};

/** The bracket's standings, scorers only (rank 1, 2, 3… — the tiebreakers leave no ties). */
const rankScorers = (entries: readonly EntryRow[], championshipTotal: number | null) =>
  rankBracketEntries(
    entries.map((row) => ({ entryId: row.id, userId: row.user_id, score: Number(row.score) || 0, tiebreaker: row.tiebreaker, submittedAt: row.submitted_at })),
    championshipTotal,
  ).filter((entry) => entry.score > 0);

const gameRow = (
  game: BracketGame,
  timeZone: string,
  leader: { userId: string; score: number } | null,
  names: Map<string, string>,
): ResultsGameRow => {
  const startsAt = new Date(game.lockMs).toISOString();
  return {
    competitionId: BRACKET_COMPETITION_ID,
    gameKey: game.gameKey,
    date: localDateOf(startsAt, timeZone) ?? startsAt.slice(0, 10),
    startsAt,
    title: gameTitle(game.tournament, game.kind),
    playerCount: game.players,
    inProgress: !game.completed,
    winners: game.completed && leader ? [names.get(leader.userId) ?? null] : [],
    topScore: game.completed && leader ? leader.score : 0,
  };
};

/** The venue's brackets that have locked, newest first. */
const venueGames = async (venueId: string, nowMs: number): Promise<BracketGame[]> => {
  const { data, error } = await client().rpc("bracket_venue_games", { p_venue_id: venueId });
  if (error) {
    if (isMissingFunction(error, "bracket_venue_games")) {
      console.error("[Results] bracket-venue-games-missing");
      return [];
    }
    throw new Error(error.message ?? "Failed to load the venue's brackets.");
  }
  const rows = ((data ?? []) as Array<{ tournament_id: string; kind: string; entries: number }>).filter(
    (row) => isBracketKind(row.kind) && Number(row.entries) > 0,
  );
  if (rows.length === 0) return [];
  const tournaments = new Map((await readTournaments([...new Set(rows.map((row) => row.tournament_id))])).map((t) => [t.id, t]));
  return rows
    .flatMap((row): BracketGame[] => {
      const tournament = tournaments.get(row.tournament_id);
      const kind = row.kind as BracketKind;
      const lockMs = tournament ? realLockMs(tournament, kind) : null;
      if (!tournament || lockMs === null || lockMs > nowMs) return [];
      return [
        {
          tournament,
          kind,
          gameKey: bracketResultsGameKey(tournament.id, kind),
          lockMs,
          players: Number(row.entries),
          completed: Boolean(tournament.completed_at),
        },
      ];
    })
    .sort((a, b) => b.lockMs - a.lockMs || (a.gameKey < b.gameKey ? -1 : 1));
};

const listGames: ResultsAdapter["listGames"] = async ({ venueId, before, limit, nowMs, withFirstGameDate }) => {
  const empty: ResultsGamePage = { games: [], exhausted: true };
  if (!isOn()) return withFirstGameDate ? { ...empty, firstGameDate: null } : empty;

  const games = await venueGames(venueId, nowMs);
  if (games.length === 0) return withFirstGameDate ? { ...empty, firstGameDate: null } : empty;

  const timeZone = await getVenueTimezone(venueId);
  const dateOf = (game: BracketGame) => localDateOf(game.lockMs, timeZone) ?? new Date(game.lockMs).toISOString().slice(0, 10);
  const older = games.filter((game) => before === null || dateOf(game) < before);
  // Never split a date: take whole dates until the page holds at least `limit` games.
  const page: BracketGame[] = [];
  for (const game of older) {
    if (page.length >= Math.max(1, limit) && dateOf(game) !== dateOf(page[page.length - 1])) break;
    page.push(game);
  }

  const leaders = new Map<string, { userId: string; score: number }>();
  for (const game of page.filter((candidate) => candidate.completed)) {
    const [leader] = rankScorers(
      await readEntries(game.tournament.id, game.kind, venueId),
      game.tournament.championship_total,
    );
    if (leader) leaders.set(game.gameKey, { userId: leader.userId, score: leader.score });
  }
  const names = await loadUsernames([...leaders.values()].map((leader) => leader.userId));
  const result: ResultsGamePage = {
    games: page.map((game) => gameRow(game, timeZone, leaders.get(game.gameKey) ?? null, names)),
    exhausted: page.length === older.length,
  };
  if (!withFirstGameDate) return result;
  return { ...result, firstGameDate: games.map(dateOf).reduce<string | null>((min, date) => (min === null || date < min ? date : min), null) };
};

/** One bracket of this venue's, or a 404. */
const venueGame = async (venueId: string, gameKey: string, nowMs: number): Promise<{ game: BracketGame; entries: EntryRow[] }> => {
  const parsed = isOn() ? parseGameKey(gameKey) : null;
  if (!parsed) throw new ResultsNotFoundError("That game wasn't found.");
  const [tournament] = await readTournaments([parsed.tournamentId]);
  const lockMs = tournament ? realLockMs(tournament, parsed.kind) : null;
  if (!tournament || lockMs === null || lockMs > nowMs) throw new ResultsNotFoundError("That game wasn't found.");
  const entries = await readEntries(tournament.id, parsed.kind, venueId);
  if (entries.length === 0) throw new ResultsNotFoundError("That game wasn't found.");
  return {
    game: {
      tournament,
      kind: parsed.kind,
      gameKey: bracketResultsGameKey(tournament.id, parsed.kind),
      lockMs,
      players: entries.length,
      completed: Boolean(tournament.completed_at),
    },
    entries,
  };
};

const getStandings: ResultsAdapter["getStandings"] = async ({ venueId, gameKey, nowMs }): Promise<ResultsGameDetail> => {
  const { game, entries } = await venueGame(venueId, gameKey, nowMs);
  const timeZone = await getVenueTimezone(venueId);
  // Nobody is named while the bracket is still being played (the shared Results contract).
  const ranked = game.completed ? rankScorers(entries, game.tournament.championship_total) : [];
  const names = await loadUsernames(ranked.map((entry) => entry.userId));
  const tokens = makeResultsEntryTokens(
    { venueId, competitionId: BRACKET_COMPETITION_ID, gameKey: game.gameKey },
    ranked.map((entry) => entry.userId),
  );
  return {
    game: gameRow(game, timeZone, ranked[0] ? { userId: ranked[0].userId, score: ranked[0].score } : null, names),
    standings: ranked.map((entry) => ({
      rank: entry.rank,
      username: names.get(entry.userId) ?? null,
      score: entry.score,
      entry: tokens.get(entry.userId) ?? null,
    })),
  };
};

/** "East", "Semifinal 1", "Final". */
const slotLabel = (slot: number, regionNames: ReadonlyArray<string | null>): string => {
  const round = roundOfSlot(slot);
  if (round === 6) return "Final";
  if (round === 5) return `Semifinal ${locationOfSlot(slot)}`;
  const region = regionOfSlot(slot);
  return region === null ? "" : bracketRegionName(regionNames, region);
};

/**
 * One player's picks in a finished bracket, found by their standings `entry` token: every pick with
 * its round, right or wrong, and the points it earned. The total equals their standings score.
 */
const getBreakdown: NonNullable<ResultsAdapter["getBreakdown"]> = async ({ venueId, gameKey, entry, nowMs }) => {
  if (!resultsEntryTokensEnabled()) throw new ResultsUnavailableError("Player breakdowns aren't available.");
  const { game } = await venueGame(venueId, gameKey, nowMs);
  if (!game.completed) throw new ResultsNotFoundError("That player wasn't found.");

  const { data, error } = await client()
    .from("bracket_entries")
    .select("user_id, picks, score")
    .eq("tournament_id", game.tournament.id)
    .eq("kind", game.kind)
    .eq("venue_id", venueId)
    .gt("score", 0)
    .limit(ENTRIES_CAP)
    .returns<Array<{ user_id: string; picks: Array<number | null> | null; score: number }>>();
  if (error) throw new Error(error.message ?? "Failed to load the bracket's entries.");
  const rows = data ?? [];
  const userId = findResultsEntry(
    { venueId, competitionId: BRACKET_COMPETITION_ID, gameKey: game.gameKey },
    rows.map((row) => row.user_id),
    entry,
  );
  const mine = userId ? rows.find((row) => row.user_id === userId) : null;
  if (!mine) throw new ResultsNotFoundError("That player wasn't found.");

  const games = await getBracketGames(game.tournament.id);
  if (!games.ok) throw new Error(games.error);
  const seats = bracketSeatTeams(games.value.map(gameView));
  const teamName = (seat: number): string => {
    const team = seats[seat];
    return team ? `${team.name}${team.seed !== null ? ` (${team.seed})` : ""}` : `Seat ${seat + 1}`;
  };
  const winners = game.tournament.winner_seats ?? [];
  const regionNames = game.tournament.region_names ?? [];

  const breakdown: ResultsBreakdownRow[] = slotsOfKind(game.kind).flatMap((slot) => {
    const raw = mine.picks?.[slot];
    if (raw === null || raw === undefined || slot >= BRACKET_SLOT_COUNT) return [];
    const pick = Number(raw);
    const winner = winners[slot];
    const round = roundOfSlot(slot);
    const decided = winner !== null && winner !== undefined;
    const right = decided && Number(winner) === pick;
    return [
      {
        group: BRACKET_ROUND_NAMES[round],
        label: slotLabel(slot, regionNames),
        detail: decided && !right ? `${teamName(pick)} · won by ${teamName(Number(winner))}` : teamName(pick),
        outcome: !decided ? ("none" as const) : right ? ("right" as const) : ("wrong" as const),
        points: right ? bracketRoundPoints(round) : 0,
      },
    ];
  });
  const total = breakdown.reduce((sum, row) => sum + row.points, 0);
  // The same rule bracket_record_results scores with, so these always agree; a mismatch means a read
  // raced a re-grade.
  if (total !== Number(mine.score)) console.error("[Results] bracket-breakdown-total-mismatch", { gameKey, expected: mine.score, total });
  return { rows: breakdown, total };
};

export const bracketResultsAdapter: ResultsAdapter = {
  id: BRACKET_COMPETITION_ID,
  listGames,
  getStandings,
  getBreakdown,
};
