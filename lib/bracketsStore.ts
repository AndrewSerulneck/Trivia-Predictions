import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import type { BracketGameState, BracketTeam } from "@/lib/brackets/games";
import { BRACKET_SLOT_COUNT, type BracketGender, type BracketRound } from "@/lib/brackets/tree";

// March Madness brackets: shared reads/writes of the bracket_* tables (migration 20261019203858)
// for the sync, the player API and the admin panel. Entries are written only by the
// bracket_save_entry RPC (lib/bracketsEntries.ts); winner seats and scores only by
// bracket_record_results (recordBracketResults below — its one caller module).

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
  "round, location, slot, feed_game_id, tip_at, status_state, status_detail, home_team, away_team, home_score, away_score, winner_side, result_source, teams_set_by, feeds_seat, feeds_seat_set_by, mismatch_note";

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
  teamsSetBy: row.teams_set_by,
  feedsSeat: row.feeds_seat === null ? null : Number(row.feeds_seat),
  feedsSeatSetBy: row.feeds_seat_set_by,
  mismatchNote: row.mismatch_note,
});

const gameToRow = (tournamentId: string, game: BracketGameState) => ({
  tournament_id: tournamentId,
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
  teams_set_by: game.teamsSetBy,
  feeds_seat: game.feedsSeat,
  feeds_seat_set_by: game.feedsSeatSetBy,
  mismatch_note: game.mismatchNote ? game.mismatchNote.slice(0, 500) : null,
  updated_at: new Date().toISOString(),
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

/** Upsert changed game rows (one request; a tournament has at most 79). */
export async function saveBracketGames(tournamentId: string, games: readonly BracketGameState[]): Promise<StoreResult<number>> {
  if (!supabaseAdmin) return noDb;
  if (games.length === 0) return { ok: true, value: 0 };
  const { error } = await supabaseAdmin
    .from("bracket_games")
    .upsert(games.map((game) => gameToRow(tournamentId, game)), { onConflict: "tournament_id,round,location" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: games.length };
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

export type RecordResultsOutcome = {
  changedSlots: number;
  regradedRounds: number[];
  reversedCredits: number;
  gradedEntries: number;
};

const RECORD_RPC = "bracket_record_results";

/**
 * Store the tournament's winner seats and re-grade every entry (bracket_record_results). The sync
 * passes allowChange = false (it only fills undecided slots; the RPC refuses anything else); an
 * admin override passes true with a reason, and the RPC reverses the affected rounds' credits.
 */
export async function recordBracketResults(params: {
  tournamentId: string;
  winnerSeats: ReadonlyArray<number | null>;
  championshipTotal: number | null;
  allowChange: boolean;
  reason: string | null;
  actor: string;
}): Promise<StoreResult<RecordResultsOutcome> & { code?: "rpc_missing" | "rpc_failed" }> {
  if (!supabaseAdmin) return noDb;
  const { data, error } = await supabaseAdmin.rpc(RECORD_RPC, {
    p_tournament_id: params.tournamentId,
    p_winner_seats: [...params.winnerSeats],
    p_championship_total: params.championshipTotal,
    p_allow_change: params.allowChange,
    p_reason: params.reason,
    p_actor: params.actor,
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
    | { changed_slots: number; regraded_rounds: number[] | null; reversed_credits: number; graded_entries: number }
    | undefined;
  return {
    ok: true,
    value: {
      changedSlots: Number(row?.changed_slots ?? 0),
      regradedRounds: (row?.regraded_rounds ?? []).map(Number),
      reversedCredits: Number(row?.reversed_credits ?? 0),
      gradedEntries: Number(row?.graded_entries ?? 0),
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
