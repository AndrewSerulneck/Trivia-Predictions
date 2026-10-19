import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SQUARES_MOMENTS,
  isSquaresMoment,
  lockAtFor,
  squaresAxes,
  type MomentObservation,
  type NflFeedGame,
  type SquaresMoment,
  type SquaresSide,
  type SquaresTeam,
} from "@/lib/squares";

// Super Bowl Squares: shared reads/writes of the squares_* tables (migration 20261019051458) for
// the settlement, the board API and the admin panel. Grading, claims, the draw and voids are RPCs
// and are called only from lib/squaresSettlement.ts, lib/squaresBoard.ts and lib/squaresAdmin.ts.

export const EVENT_COLUMNS =
  "id, season, bdl_game_id, col_side, col_team, row_team, kickoff_at, lock_at, lock_at_set_by, col_digits, row_digits, drawn_at, live_score, feed_checked_at, completed_at, archived_at, created_by, created_at";

export const MOMENT_COLUMNS =
  "event_id, moment, grade_no, observed_col_score, observed_row_score, observed_at, col_score, row_score, winning_cell, score_source, graded_at, mismatch_note";

export type SquaresLiveScore = {
  col: number | null;
  row: number | null;
  status: string | null;
  statusState: string | null;
  /** When the settlement read it (ISO). */
  at: string;
};

export type SquaresEventRecord = {
  id: string;
  season: number;
  bdlGameId: number;
  colSide: SquaresSide;
  colTeam: SquaresTeam;
  rowTeam: SquaresTeam;
  kickoffAt: string;
  lockAt: string;
  lockAtSetBy: "auto" | "admin";
  colDigits: number[] | null;
  rowDigits: number[] | null;
  drawnAt: string | null;
  liveScore: SquaresLiveScore | null;
  feedCheckedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
};

export type SquaresMomentRecord = {
  moment: SquaresMoment;
  gradeNo: number;
  observed: MomentObservation;
  graded: { col: number; row: number; winningCell: number; source: "feed" | "admin"; gradedAt: string } | null;
  mismatchNote: string | null;
};

type EventRow = {
  id: string;
  season: number;
  bdl_game_id: number | string;
  col_side: SquaresSide;
  col_team: SquaresTeam;
  row_team: SquaresTeam;
  kickoff_at: string;
  lock_at: string;
  lock_at_set_by: "auto" | "admin";
  col_digits: number[] | null;
  row_digits: number[] | null;
  drawn_at: string | null;
  live_score: SquaresLiveScore | null;
  feed_checked_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
};

export type MomentRow = {
  event_id: string;
  moment: string;
  grade_no: number;
  observed_col_score: number | null;
  observed_row_score: number | null;
  observed_at: string | null;
  col_score: number | null;
  row_score: number | null;
  winning_cell: number | null;
  score_source: "feed" | "admin" | null;
  graded_at: string | null;
  mismatch_note: string | null;
};

export const toEventRecord = (row: EventRow): SquaresEventRecord => ({
  id: row.id,
  season: Number(row.season),
  bdlGameId: Number(row.bdl_game_id),
  colSide: row.col_side,
  colTeam: row.col_team,
  rowTeam: row.row_team,
  kickoffAt: row.kickoff_at,
  lockAt: row.lock_at,
  lockAtSetBy: row.lock_at_set_by,
  colDigits: row.col_digits ? row.col_digits.map(Number) : null,
  rowDigits: row.row_digits ? row.row_digits.map(Number) : null,
  drawnAt: row.drawn_at,
  liveScore: row.live_score,
  feedCheckedAt: row.feed_checked_at,
  completedAt: row.completed_at,
  archivedAt: row.archived_at,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

export const toMomentRecord = (row: MomentRow): SquaresMomentRecord | null => {
  if (!isSquaresMoment(row.moment)) return null;
  return {
    moment: row.moment,
    gradeNo: Number(row.grade_no),
    observed:
      row.observed_at !== null && row.observed_col_score !== null && row.observed_row_score !== null
        ? { col: Number(row.observed_col_score), row: Number(row.observed_row_score), atMs: Date.parse(row.observed_at) }
        : null,
    graded:
      row.graded_at !== null && row.col_score !== null && row.row_score !== null && row.winning_cell !== null && row.score_source
        ? {
            col: Number(row.col_score),
            row: Number(row.row_score),
            winningCell: Number(row.winning_cell),
            source: row.score_source,
            gradedAt: row.graded_at,
          }
        : null,
    mismatchNote: row.mismatch_note,
  };
};

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string };

const unavailable = <T>(): StoreResult<T> => ({ ok: false, error: "Supabase admin client is not configured." });

/** The one current (not archived) event, or null. */
export async function getCurrentSquaresEvent(): Promise<StoreResult<SquaresEventRecord | null>> {
  if (!supabaseAdmin) return unavailable();
  const { data, error } = await supabaseAdmin
    .from("squares_events")
    .select(EVENT_COLUMNS)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: data ? toEventRecord(data as EventRow) : null };
}

/** The event's four moments, in game order. Missing rows are re-created (an interrupted create). */
export async function getSquaresMoments(eventId: string, retried = false): Promise<StoreResult<SquaresMomentRecord[]>> {
  if (!supabaseAdmin) return unavailable();
  const { data, error } = await supabaseAdmin.from("squares_event_moments").select(MOMENT_COLUMNS).eq("event_id", eventId);
  if (error) return { ok: false, error: error.message };
  const records = ((data ?? []) as MomentRow[]).flatMap((row) => {
    const record = toMomentRecord(row);
    return record ? [record] : [];
  });
  if (records.length < SQUARES_MOMENTS.length) {
    if (retried) return { ok: false, error: "The event's moment rows are missing." };
    const ensured = await ensureMomentRows(eventId);
    if (!ensured.ok) return ensured;
    return getSquaresMoments(eventId, true);
  }
  return { ok: true, value: SQUARES_MOMENTS.map((moment) => records.find((r) => r.moment === moment) as SquaresMomentRecord) };
}

async function ensureMomentRows(eventId: string): Promise<StoreResult<null>> {
  if (!supabaseAdmin) return unavailable();
  const { error } = await supabaseAdmin
    .from("squares_event_moments")
    .upsert(
      SQUARES_MOMENTS.map((moment) => ({ event_id: eventId, moment })),
      { onConflict: "event_id,moment", ignoreDuplicates: true },
    );
  return error ? { ok: false, error: error.message } : { ok: true, value: null };
}

/** Event columns derived from a feed record (teams, kickoff, lock). Null when the matchup is unknown. */
export const eventFieldsFromGame = (
  game: NflFeedGame,
  adminLockMs: number | null,
): {
  bdl_game_id: number;
  col_side: SquaresSide;
  col_team: SquaresTeam;
  row_team: SquaresTeam;
  kickoff_at: string;
  lock_at: string;
} | null => {
  const axes = squaresAxes(game);
  const kickoffMs = Date.parse(String(game.date ?? ""));
  if (!axes || !Number.isFinite(kickoffMs)) return null;
  return {
    bdl_game_id: game.id,
    col_side: axes.colSide,
    col_team: axes.colTeam,
    row_team: axes.rowTeam,
    kickoff_at: new Date(kickoffMs).toISOString(),
    lock_at: new Date(lockAtFor(kickoffMs, adminLockMs)).toISOString(),
  };
};

/** Create the current event from a feed record. `exists` when another current event won the race. */
export async function createSquaresEvent(
  game: NflFeedGame,
  options: { season: number; createdBy: string },
): Promise<StoreResult<SquaresEventRecord> | { ok: false; error: string; code: "exists" | "matchup_unknown" }> {
  if (!supabaseAdmin) return unavailable();
  const fields = eventFieldsFromGame(game, null);
  if (!fields) return { ok: false, code: "matchup_unknown", error: "The feed record has no usable teams or kickoff." };
  const { data, error } = await supabaseAdmin
    .from("squares_events")
    .insert({ ...fields, season: options.season, created_by: options.createdBy })
    .select(EVENT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, code: "exists", error: "A current event already exists." };
    return { ok: false, error: error.message };
  }
  const event = toEventRecord(data as EventRow);
  const ensured = await ensureMomentRows(event.id);
  if (!ensured.ok) return ensured;
  return { ok: true, value: event };
}

/** Append to the admin log (best-effort for the caller, which logs on failure). */
export async function logSquaresAdmin(
  eventId: string | null,
  action: string,
  actor: string,
  detail: Record<string, unknown>,
): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from("squares_admin_log").insert({ event_id: eventId, action, actor, detail });
  if (error) console.error("[Squares] admin-log-failed", { action, message: error.message });
}
