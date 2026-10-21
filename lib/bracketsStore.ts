import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import type { BracketGameState, BracketTeam } from "@/lib/brackets/games";
import { BRACKET_SLOT_COUNT, type BracketGender, type BracketRound } from "@/lib/brackets/tree";

// March Madness brackets: shared reads/writes of the bracket_* tables (migration 20261019203858)
// for the sync, the player API and the admin panel. Entries are written only by the
// bracket_save_entry RPC (lib/bracketsEntries.ts); winner seats and scores only by
// bracket_record_results (recordBracketResults below — its one caller module). Game rows (10.1):
// the sync writes only through bracket_save_feed_games (saveFeedBracketGames), which never
// overwrites what an admin took over; an admin action writes only its own columns
// (updateBracketGameColumns). Nothing writes whole game rows.

export type BracketPurpose = "live" | "rehearsal";

export type BracketTournamentRecord = {
  id: string;
  gender: BracketGender;
  season: number;
  purpose: BracketPurpose;
  /** Rehearsal replay clock: the tournament's now = real now − this. 0 when live. */
  clockOffsetSeconds: number;
  /** Four entries; null = "Region n". */
  regionNames: Array<string | null>;
  winnerSeats: Array<number | null>;
  championshipTotal: number | null;
  mainLockAt: string | null;
  mainLockSetBy: "auto" | "admin";
  secondLockAt: string | null;
  secondLockSetBy: "auto" | "admin";
  feedCheckedAt: string | null;
  nextSyncAt: string | null;
  completedAt: string | null;
  /** Every bracket prize was settled after the championship (lib/bracketPrizeAwards.ts, Phase 9a). */
  prizesSettledAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
};

export type BracketRoundRecord = {
  round: BracketRound;
  gradeNo: number;
  paidGradeNo: number | null;
  paidAt: string | null;
};

export const TOURNAMENT_COLUMNS =
  "id, gender, season, purpose, clock_offset_seconds, region_names, winner_seats, championship_total, main_lock_at, main_lock_set_by, second_lock_at, second_lock_set_by, feed_checked_at, next_sync_at, completed_at, prizes_settled_at, archived_at, created_by, created_at";

const GAME_COLUMNS =
  "round, location, slot, feed_game_id, tip_at, status_state, status_detail, home_team, away_team, home_score, away_score, winner_side, result_source, result_held, teams_set_by, feeds_seat, feeds_seat_set_by, mismatch_note";

type TournamentRow = {
  id: string;
  gender: BracketGender;
  season: number;
  purpose: BracketPurpose;
  clock_offset_seconds: number;
  region_names: Array<string | null> | null;
  winner_seats: Array<number | null> | null;
  championship_total: number | null;
  main_lock_at: string | null;
  main_lock_set_by: "auto" | "admin";
  second_lock_at: string | null;
  second_lock_set_by: "auto" | "admin";
  feed_checked_at: string | null;
  next_sync_at: string | null;
  completed_at: string | null;
  prizes_settled_at: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
};

type GameRow = {
  round: number;
  location: number;
  slot: number | null;
  feed_game_id: number | string | null;
  tip_at: string | null;
  status_state: string | null;
  status_detail: string | null;
  home_team: BracketTeam | null;
  away_team: BracketTeam | null;
  home_score: number | null;
  away_score: number | null;
  winner_side: "home" | "away" | null;
  result_source: "feed" | "admin" | null;
  result_held: boolean | null;
  teams_set_by: "feed" | "admin";
  feeds_seat: number | null;
  feeds_seat_set_by: "auto" | "admin" | null;
  mismatch_note: string | null;
};

const seatList = (value: Array<number | null> | null): Array<number | null> =>
  Array.from({ length: BRACKET_SLOT_COUNT }, (_, i) => {
    const seat = value?.[i];
    return seat === null || seat === undefined ? null : Number(seat);
  });

export const tournamentFromRow = (row: TournamentRow): BracketTournamentRecord => ({
  id: row.id,
  gender: row.gender,
  season: Number(row.season),
  purpose: row.purpose,
  clockOffsetSeconds: Number(row.clock_offset_seconds ?? 0),
  regionNames: Array.from({ length: 4 }, (_, i) => row.region_names?.[i] ?? null),
  winnerSeats: seatList(row.winner_seats),
  championshipTotal: row.championship_total === null ? null : Number(row.championship_total),
  mainLockAt: row.main_lock_at,
  mainLockSetBy: row.main_lock_set_by,
  secondLockAt: row.second_lock_at,
  secondLockSetBy: row.second_lock_set_by,
  feedCheckedAt: row.feed_checked_at,
  nextSyncAt: row.next_sync_at,
  completedAt: row.completed_at,
  prizesSettledAt: row.prizes_settled_at ?? null,
  archivedAt: row.archived_at,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const gameFromRow = (row: GameRow): BracketGameState => ({
  round: Number(row.round),
  location: Number(row.location),
  slot: row.slot === null ? null : Number(row.slot),
  feedGameId: row.feed_game_id === null ? null : Number(row.feed_game_id),
  tipAt: row.tip_at ? new Date(Date.parse(row.tip_at)).toISOString() : null,
  statusState: row.status_state,
  statusDetail: row.status_detail,
  homeTeam: row.home_team,
  awayTeam: row.away_team,
  homeScore: row.home_score,
  awayScore: row.away_score,
  winnerSide: row.winner_side,
  resultSource: row.result_source,
  resultHeld: row.result_held === true,
  teamsSetBy: row.teams_set_by,
  feedsSeat: row.feeds_seat === null ? null : Number(row.feeds_seat),
  feedsSeatSetBy: row.feeds_seat_set_by,
  mismatchNote: row.mismatch_note,
});

/** The sync's view of one changed game, for bracket_save_feed_games (which decides what it may keep). */
const feedGameToJson = (game: BracketGameState, seen: BracketGameState | undefined) => ({
  round: game.round,
  location: game.location,
  slot: game.slot,
  feed_game_id: game.feedGameId,
  tip_at: game.tipAt,
  status_state: game.statusState ? game.statusState.slice(0, 40) : null,
  status_detail: game.statusDetail ? game.statusDetail.slice(0, 80) : null,
  home_team: game.homeTeam,
  away_team: game.awayTeam,
  home_score: game.homeScore,
  away_score: game.awayScore,
  winner_side: game.winnerSide,
  result_source: game.resultSource,
  feeds_seat: game.feedsSeat,
  feeds_seat_set_by: game.feedsSeatSetBy,
  mismatch_note: game.mismatchNote ? game.mismatchNote.slice(0, 500) : null,
  seen_winner_side: seen?.winnerSide ?? null,
  seen_result_held: seen?.resultHeld ?? false,
});

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string };

const noDb = { ok: false as const, error: "Supabase admin client is not configured." };

/** The tournament's own clock (rehearsals replay the past). */
export const tournamentNowMs = (tournament: Pick<BracketTournamentRecord, "clockOffsetSeconds">, realNowMs: number): number =>
  realNowMs - tournament.clockOffsetSeconds * 1000;

/** Every tournament that is not archived (at most a handful). */
export async function listCurrentBracketTournaments(): Promise<StoreResult<BracketTournamentRecord[]>> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin
    .from("bracket_tournaments")
    .select(TOURNAMENT_COLUMNS)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: ((data ?? []) as TournamentRow[]).map(tournamentFromRow) };
}

export async function getBracketTournament(id: string): Promise<StoreResult<BracketTournamentRecord | null>> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin.from("bracket_tournaments").select(TOURNAMENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: data ? tournamentFromRow(data as TournamentRow) : null };
}

/** Has this gender's season ever had a tournament of this purpose, archived or not? (Discovery never re-creates one.) */
export async function bracketTournamentExists(gender: BracketGender, season: number, purpose: BracketPurpose): Promise<StoreResult<boolean>> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin
    .from("bracket_tournaments")
    .select("id")
    .eq("gender", gender)
    .eq("season", season)
    .eq("purpose", purpose)
    .limit(1);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data ?? []).length > 0 };
}

export async function getBracketGames(tournamentId: string): Promise<StoreResult<BracketGameState[]>> {
  return getBracketGamesFor([tournamentId]).then((result) =>
    result.ok ? { ok: true as const, value: result.value.get(tournamentId) ?? [] } : result,
  );
}

/** Games of several tournaments in one read (≤ 2 × 79 rows). */
export async function getBracketGamesFor(tournamentIds: readonly string[]): Promise<StoreResult<Map<string, BracketGameState[]>>> {
  if (!supabaseAdmin) return noDb;
  const map = new Map<string, BracketGameState[]>(tournamentIds.map((id) => [id, []]));
  if (tournamentIds.length === 0) return { ok: true, value: map };
  const { data, error } = await supabaseAdmin
    .from("bracket_games")
    .select(`tournament_id, ${GAME_COLUMNS}`)
    .in("tournament_id", [...tournamentIds])
    .order("round", { ascending: true })
    .order("location", { ascending: true });
  if (error) return { ok: false, error: error.message };
  for (const row of (data ?? []) as Array<GameRow & { tournament_id: string }>) {
    map.get(row.tournament_id)?.push(gameFromRow(row));
  }
  return { ok: true, value: map };
}

const FEED_GAMES_RPC = "bracket_save_feed_games";

/**
 * The sync's write of the games it changed (one request; a tournament has at most 79). `seen` is
 * the stored rows the merge started from. The RPC writes the feed's columns and keeps whatever an
 * admin took over in the CURRENT row (result, hold, teams, opening-round link), so an admin action
 * that lands between the sync's read and this write always survives (plan 10.1, §17 B3).
 */
export async function saveFeedBracketGames(
  tournamentId: string,
  games: readonly BracketGameState[],
  seen: readonly BracketGameState[],
): Promise<StoreResult<number>> {
  if (!supabaseAdmin) return noDb;
  if (games.length === 0) return { ok: true, value: 0 };
  const seenByKey = new Map(seen.map((game) => [`${game.round}:${game.location}`, game]));
  const { data, error } = await supabaseAdmin.rpc(FEED_GAMES_RPC, {
    p_tournament_id: tournamentId,
    p_games: games.map((game) => feedGameToJson(game, seenByKey.get(`${game.round}:${game.location}`))),
  });
  if (error) {
    console.error(isMissingFunction(error, FEED_GAMES_RPC) ? "[Brackets] rpc-missing" : "[Brackets] feed-games-write-failed", {
      tournamentId,
      message: error.message,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true, value: Number(data ?? 0) };
}

/** The columns an admin action may set on one game; each action passes only its own. */
export type BracketGameAdminPatch = Partial<
  Pick<BracketGameState, "winnerSide" | "resultSource" | "resultHeld" | "mismatchNote" | "homeTeam" | "awayTeam" | "teamsSetBy" | "feedsSeat" | "feedsSeatSetBy">
>;

const ADMIN_PATCH_COLUMNS: Record<keyof BracketGameAdminPatch, string> = {
  winnerSide: "winner_side",
  resultSource: "result_source",
  resultHeld: "result_held",
  mismatchNote: "mismatch_note",
  homeTeam: "home_team",
  awayTeam: "away_team",
  teamsSetBy: "teams_set_by",
  feedsSeat: "feeds_seat",
  feedsSeatSetBy: "feeds_seat_set_by",
};

/** An admin fix-up of one game: writes only the given columns, never the feed's (plan 10.1). */
export async function updateBracketGameColumns(
  tournamentId: string,
  game: Pick<BracketGameState, "round" | "location">,
  patch: BracketGameAdminPatch,
): Promise<StoreResult<null>> {
  if (!supabaseAdmin) return noDb;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, column] of Object.entries(ADMIN_PATCH_COLUMNS) as Array<[keyof BracketGameAdminPatch, string]>) {
    if (key in patch) row[column] = patch[key];
  }
  const { data, error } = await supabaseAdmin
    .from("bracket_games")
    .update(row)
    .eq("tournament_id", tournamentId)
    .eq("round", game.round)
    .eq("location", game.location)
    .select("round");
  if (error) return { ok: false, error: error.message };
  if (!data || (Array.isArray(data) && data.length === 0)) return { ok: false, error: "No such game." };
  return { ok: true, value: null };
}

export async function getBracketRounds(tournamentId: string): Promise<StoreResult<BracketRoundRecord[]>> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin
    .from("bracket_rounds")
    .select("round, grade_no, paid_grade_no, paid_at")
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    value: ((data ?? []) as Array<{ round: number; grade_no: number; paid_grade_no: number | null; paid_at: string | null }>).map(
      (row) => ({
        round: Number(row.round) as BracketRound,
        gradeNo: Number(row.grade_no),
        paidGradeNo: row.paid_grade_no === null ? null : Number(row.paid_grade_no),
        paidAt: row.paid_at,
      }),
    ),
  };
}

export async function createBracketTournament(params: {
  gender: BracketGender;
  season: number;
  purpose: BracketPurpose;
  clockOffsetSeconds: number;
  createdBy: string;
}): Promise<StoreResult<BracketTournamentRecord>> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin
    .from("bracket_tournaments")
    .insert({
      gender: params.gender,
      season: params.season,
      purpose: params.purpose,
      clock_offset_seconds: params.clockOffsetSeconds,
      created_by: params.createdBy.slice(0, 100),
    })
    .select(TOURNAMENT_COLUMNS)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed." };
  return { ok: true, value: tournamentFromRow(data as TournamentRow) };
}

export async function updateBracketTournament(id: string, patch: Record<string, unknown>): Promise<StoreResult<null>> {
  if (!supabaseAdmin) return noDb;
  const { error } = await supabaseAdmin
    .from("bracket_tournaments")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: null };
}

/** Just the stored winner seats (the payment re-check, plan 10.1). */
export async function getBracketWinnerSeats(id: string): Promise<StoreResult<Array<number | null>>> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin.from("bracket_tournaments").select("winner_seats").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "No such tournament." };
  return { ok: true, value: seatList((data as { winner_seats: Array<number | null> | null }).winner_seats) };
}

/**
 * The sync's end-of-run tournament write. next_sync_at is written only while it is still the value
 * the run read (`seenNextSyncAt`): an admin action that asked for a sync meanwhile (next_sync_at =
 * now, plan 10.1) must not be pushed back, or after the championship (next = null) a correction would
 * never be paid. One request normally; a second, without next_sync_at, only when that happened.
 */
export async function finishBracketSyncRun(
  id: string,
  seenNextSyncAt: string | null,
  patch: Record<string, unknown>,
  nextSyncAt: string | null,
): Promise<StoreResult<{ nextSyncWritten: boolean }>> {
  if (!supabaseAdmin) return noDb;
  const updatedAt = new Date().toISOString();
  let query = supabaseAdmin
    .from("bracket_tournaments")
    .update({ ...patch, next_sync_at: nextSyncAt, updated_at: updatedAt })
    .eq("id", id);
  query = seenNextSyncAt === null ? query.is("next_sync_at", null) : query.eq("next_sync_at", seenNextSyncAt);
  const { data, error } = await query.select("id");
  if (error) return { ok: false, error: error.message };
  if (Array.isArray(data) && data.length > 0) return { ok: true, value: { nextSyncWritten: true } };
  const rest = await updateBracketTournament(id, patch);
  return rest.ok ? { ok: true, value: { nextSyncWritten: false } } : rest;
}

export type RecordResultsOutcome = {
  changedSlots: number;
  regradedRounds: number[];
  reversedCredits: number;
  gradedEntries: number;
  /** The stored winner seats were not `expectedWinnerSeats`: nothing was changed (10.1). */
  stale: boolean;
};

const RECORD_RPC = "bracket_record_results";

/**
 * Store the tournament's winner seats and re-grade every entry (bracket_record_results). The sync
 * passes allowChange = false (it only fills undecided slots; the RPC refuses anything else) and the
 * seats it read as expectedWinnerSeats (anything recorded since → `stale`, nothing changed); an
 * admin override passes true with a reason and no expected seats, and the RPC reverses the affected
 * rounds' credits.
 */
export async function recordBracketResults(params: {
  tournamentId: string;
  winnerSeats: ReadonlyArray<number | null>;
  championshipTotal: number | null;
  allowChange: boolean;
  reason: string | null;
  actor: string;
  expectedWinnerSeats?: ReadonlyArray<number | null> | null;
}): Promise<StoreResult<RecordResultsOutcome> & { code?: "rpc_missing" | "rpc_failed" }> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin.rpc(RECORD_RPC, {
    p_tournament_id: params.tournamentId,
    p_winner_seats: [...params.winnerSeats],
    p_championship_total: params.championshipTotal,
    p_allow_change: params.allowChange,
    p_reason: params.reason,
    p_actor: params.actor,
    p_expected_winner_seats: params.expectedWinnerSeats ? [...params.expectedWinnerSeats] : null,
  });
  if (error) {
    const missing = isMissingFunction(error, RECORD_RPC);
    console.error(missing ? "[Brackets] rpc-missing" : "[Brackets] record-results-failed", {
      tournamentId: params.tournamentId,
      message: error.message,
    });
    return { ok: false, error: error.message, code: missing ? "rpc_missing" : "rpc_failed" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed_slots: number; regraded_rounds: number[] | null; reversed_credits: number; graded_entries: number; stale: boolean | null }
    | undefined;
  return {
    ok: true,
    value: {
      changedSlots: Number(row?.changed_slots ?? 0),
      regradedRounds: (row?.regraded_rounds ?? []).map(Number),
      reversedCredits: Number(row?.reversed_credits ?? 0),
      gradedEntries: Number(row?.graded_entries ?? 0),
      stale: row?.stale === true,
    },
  };
}

export async function logBracketsAdmin(params: {
  tournamentId: string | null;
  action: string;
  detail: Record<string, unknown>;
  actor: string;
}): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from("bracket_admin_log").insert({
    tournament_id: params.tournamentId,
    action: params.action.slice(0, 60),
    detail: params.detail,
    actor: params.actor.slice(0, 100) || "admin",
  });
  if (error) console.error("[Brackets] admin-log-failed", { action: params.action, message: error.message });
}
