import "server-only";

import { localDateOf, rankScorers } from "@/lib/ownerHistoryDisplay";
import { ResultsNotFoundError } from "@/lib/results/errors";
import { loadUsernames } from "@/lib/results/playerNames";
import type { ResultsAdapter, ResultsGameDetail, ResultsGamePage, ResultsGameRow } from "@/lib/results/types";
import { isSquaresEnabled } from "@/lib/seasonalGames";
import type { SquaresTeam } from "@/lib/squares";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueTimezone } from "@/lib/timezone";
import { SQUARES_EVENT_NAME } from "@/lib/venueGameCards";

// Super Bowl Squares on the Results page (docs/squares-and-brackets-plan.md Phase 4). One game per
// season: the venue's board for that season's event. gameKey = the event id. A player's score is the
// venue points their winning squares paid at this venue (squares_results, voided grades left out);
// standings list the winners only (as Live Trivia lists scorers only), and "players" counts everyone
// who held a square. No per-player breakdown (hasBreakdown: false), so no entry tokens.
//
// Listed once kickoff has passed (before that it isn't a game yet, just a board being filled in),
// and "in progress" until the event is complete — which, as for Live Trivia, names nobody yet.
//
// INERT while NEXT_PUBLIC_SQUARES_ENABLED is off: no game is listed and a game URL is a 404, with
// no read at all. (Turning the flag off after a season hides past Squares games here too.)
//
// COST (on demand only): a timeline page with no Squares board at the venue = ONE indexed read
// (squares_boards_venue_id_idx). With boards: + the venue timezone (cached 10 min) + one claims read
// + one results read + one usernames read. A game screen is the same four reads for that one board.

export const SQUARES_COMPETITION_ID = "squares";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Claims (≤ 100) and results (≤ 4 moments × a few grades) per board are small; this bounds a bad read. */
const ROWS_CAP = 2000;

type BoardRow = {
  id: string;
  event: {
    id: string;
    kickoff_at: string;
    completed_at: string | null;
    col_team: Partial<SquaresTeam> | null;
    row_team: Partial<SquaresTeam> | null;
  } | null;
};

type Board = {
  id: string;
  eventId: string;
  kickoffAt: string;
  kickoffMs: number;
  completed: boolean;
  title: string;
};

const BOARD_SELECT = "id, event:squares_events(id, kickoff_at, completed_at, col_team, row_team)";

const client = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

const teamName = (team: Partial<SquaresTeam> | null): string => String(team?.name || team?.abbreviation || "").trim();

/** "Chiefs vs Eagles" (AFC first, as the columns are), else the event's own name. */
const gameTitle = (event: NonNullable<BoardRow["event"]>): string => {
  const col = teamName(event.col_team);
  const row = teamName(event.row_team);
  return col && row ? `${col} vs ${row}` : SQUARES_EVENT_NAME;
};

/** The venue's boards whose game has kicked off, newest first. */
const startedBoards = (rows: BoardRow[], nowMs: number): Board[] =>
  rows
    .flatMap((row) => {
      const event = row.event;
      const kickoffMs = event ? Date.parse(event.kickoff_at) : Number.NaN;
      if (!event || !Number.isFinite(kickoffMs) || kickoffMs > nowMs) return [];
      return [{ id: row.id, eventId: event.id, kickoffAt: event.kickoff_at, kickoffMs, completed: Boolean(event.completed_at), title: gameTitle(event) }];
    })
    .sort((a, b) => b.kickoffMs - a.kickoffMs);

type Tally = { players: Map<string, Set<string>>; points: Map<string, Map<string, { points: number; reachedAt: string | null }>> };

/** Who held a square on each board, and what each winner was paid there (unvoided results). */
const tallyBoards = async (boardIds: string[]): Promise<Tally> => {
  const tally: Tally = { players: new Map(), points: new Map() };
  if (boardIds.length === 0) return tally;
  const [claims, results] = await Promise.all([
    client().from("squares_claims").select("board_id, user_id").in("board_id", boardIds).limit(ROWS_CAP)
      .returns<Array<{ board_id: string; user_id: string }>>(),
    client()
      .from("squares_results")
      .select("board_id, user_id, points, created_at")
      .in("board_id", boardIds)
      .not("user_id", "is", null)
      .is("voided_at", null)
      .limit(ROWS_CAP)
      .returns<Array<{ board_id: string; user_id: string; points: number; created_at: string }>>(),
  ]);
  if (claims.error) throw new Error(claims.error.message ?? "Failed to load Squares claims.");
  if (results.error) throw new Error(results.error.message ?? "Failed to load Squares results.");
  for (const row of claims.data ?? []) {
    const set = tally.players.get(row.board_id) ?? new Set<string>();
    set.add(row.user_id);
    tally.players.set(row.board_id, set);
  }
  for (const row of results.data ?? []) {
    const byUser = tally.points.get(row.board_id) ?? new Map<string, { points: number; reachedAt: string | null }>();
    const current = byUser.get(row.user_id) ?? { points: 0, reachedAt: null };
    const reachedAt = current.reachedAt === null || row.created_at < current.reachedAt ? row.created_at : current.reachedAt;
    byUser.set(row.user_id, { points: current.points + (Number(row.points) || 0), reachedAt });
    tally.points.set(row.board_id, byUser);
  }
  return tally;
};

/** The board's winners, ranked ("1, 2, 2, 4"); nobody while the game is still being played. */
const rankedWinners = (board: Board, tally: Tally) =>
  board.completed
    ? rankScorers(
        [...(tally.points.get(board.id) ?? new Map()).entries()].map(([userId, value]) => ({ userId, ...value })),
      )
    : [];

const gameRow = (
  board: Board,
  timeZone: string,
  tally: Tally,
  names: Map<string, string>,
): ResultsGameRow => {
  const ranked = rankedWinners(board, tally);
  const leaders = ranked.filter((entry) => entry.rank === 1);
  return {
    competitionId: SQUARES_COMPETITION_ID,
    gameKey: board.eventId,
    date: localDateOf(board.kickoffAt, timeZone) ?? board.kickoffAt.slice(0, 10),
    startsAt: new Date(board.kickoffMs).toISOString(),
    title: board.title,
    playerCount: tally.players.get(board.id)?.size ?? 0,
    inProgress: !board.completed,
    winners: leaders.map(({ row }) => names.get(row.userId) ?? null),
    topScore: leaders[0]?.row.points ?? 0,
  };
};

const listGames: ResultsAdapter["listGames"] = async ({ venueId, before, limit, nowMs, withFirstGameDate }) => {
  const empty: ResultsGamePage = { games: [], exhausted: true };
  if (!isSquaresEnabled()) return withFirstGameDate ? { ...empty, firstGameDate: null } : empty;

  const { data, error } = await client().from("squares_boards").select(BOARD_SELECT).eq("venue_id", venueId).returns<BoardRow[]>();
  if (error) throw new Error(error.message ?? "Failed to load Squares games.");
  const boards = startedBoards(data ?? [], nowMs);
  if (boards.length === 0) return withFirstGameDate ? { ...empty, firstGameDate: null } : empty;

  const timeZone = await getVenueTimezone(venueId);
  const dated = boards.map((board) => ({ board, date: localDateOf(board.kickoffAt, timeZone) ?? board.kickoffAt.slice(0, 10) }));
  // One game per season, so a page never splits a date and every page is the whole (short) list.
  const page = dated.filter(({ date }) => before === null || date < before).slice(0, Math.max(1, limit));
  const tally = await tallyBoards(page.map(({ board }) => board.id));
  const names = await loadUsernames(
    page.flatMap(({ board }) => rankedWinners(board, tally).filter((entry) => entry.rank === 1).map(({ row }) => row.userId)),
  );
  const result: ResultsGamePage = {
    games: page.map(({ board }) => gameRow(board, timeZone, tally, names)),
    exhausted: page.length === dated.filter(({ date }) => before === null || date < before).length,
  };
  if (!withFirstGameDate) return result;
  const firstGameDate = dated.reduce<string | null>((min, { date }) => (min === null || date < min ? date : min), null);
  return { ...result, firstGameDate };
};

const getStandings: ResultsAdapter["getStandings"] = async ({ venueId, gameKey, nowMs }): Promise<ResultsGameDetail> => {
  const eventId = String(gameKey ?? "").trim();
  if (!isSquaresEnabled() || !UUID_PATTERN.test(eventId)) throw new ResultsNotFoundError("That game wasn't found.");
  const { data, error } = await client()
    .from("squares_boards")
    .select(BOARD_SELECT)
    .eq("venue_id", venueId)
    .eq("event_id", eventId)
    .returns<BoardRow[]>();
  if (error) throw new Error(error.message ?? "Failed to load the Squares game.");
  const [board] = startedBoards(data ?? [], nowMs);
  if (!board) throw new ResultsNotFoundError("That game wasn't found.");

  const [timeZone, tally] = await Promise.all([getVenueTimezone(venueId), tallyBoards([board.id])]);
  const ranked = rankedWinners(board, tally);
  const names = await loadUsernames(ranked.map(({ row }) => row.userId));
  return {
    game: gameRow(board, timeZone, tally, names),
    // No breakdown, so no entry tokens: a row is a username and a score, nothing to tap.
    standings: ranked.map(({ rank, row }) => ({ rank, username: names.get(row.userId) ?? null, score: row.points, entry: null })),
  };
};

export const squaresResultsAdapter: ResultsAdapter = {
  id: SQUARES_COMPETITION_ID,
  listGames,
  getStandings,
};
