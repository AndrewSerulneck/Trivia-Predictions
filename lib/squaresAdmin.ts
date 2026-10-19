import "server-only";

import { SEASONAL_GAME_WINDOWS, isSquaresEnabled, type SeasonalWindow } from "@/lib/seasonalGames";
import { isSquaresMoment, squaresMomentPoints, type SquaresMoment } from "@/lib/squares";
import { fetchSquaresGame, fetchSuperBowlGame } from "@/lib/squaresFeed";
import {
  gradeMoment,
  isSquaresRehearsalEnabled,
  isSquaresSettlementActive,
  payUnpaidSquaresResults,
  runSquaresTick,
  squaresSeason,
  type SquaresTickReport,
} from "@/lib/squaresSettlement";
import {
  createSquaresEvent,
  eventFieldsFromGame,
  getCurrentSquaresEvent,
  getSquaresMoments,
  logSquaresAdmin,
  type SquaresEventRecord,
  type SquaresMomentRecord,
} from "@/lib/squaresStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";

// Super Bowl Squares admin panel: status + fix-ups (plan Phase 2). Every change is written to
// squares_admin_log with the admin's username. The settlement does the normal work; these exist
// for when the feed or the schedule needs a human.

export type SquaresAdminOverview = {
  flags: { enabled: boolean; rehearsal: boolean; settlementActiveNow: boolean; season: number; window: SeasonalWindow };
  event: SquaresEventRecord | null;
  moments: SquaresMomentRecord[];
  counts: { boards: number; claims: number; unpaid: number };
  log: Array<{ id: string; action: string; actor: string; detail: Record<string, unknown>; createdAt: string }>;
  archived: Array<{ id: string; season: number; bdlGameId: number; kickoffAt: string; archivedAt: string }>;
};

export type SquaresAdminAction =
  | { action: "discover" }
  | { action: "create_from_game"; gameId: number }
  | { action: "set_game"; gameId: number }
  | { action: "move_lock"; lockAt: string }
  | { action: "grade_moment"; moment: SquaresMoment; colScore: number; rowScore: number; reason: string }
  | { action: "void_moment"; moment: SquaresMoment; reason: string; colScore: number | null; rowScore: number | null }
  | { action: "archive"; reason: string }
  | { action: "run_now" };

const isScore = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 200;
const isGameId = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
const reasonOf = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length >= 3 && text.length <= 400 ? text : null;
};

/** Validates an admin request body. Returns an error message for anything malformed. */
export const parseSquaresAdminAction = (body: unknown): SquaresAdminAction | { error: string } => {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  switch (input.action) {
    case "discover":
    case "run_now":
      return { action: input.action };
    case "create_from_game":
    case "set_game":
      return isGameId(input.gameId) ? { action: input.action, gameId: input.gameId } : { error: "gameId must be a positive whole number." };
    case "move_lock": {
      const lockAt = typeof input.lockAt === "string" ? input.lockAt : "";
      return Number.isFinite(Date.parse(lockAt)) ? { action: "move_lock", lockAt: new Date(Date.parse(lockAt)).toISOString() } : { error: "lockAt must be a date and time." };
    }
    case "grade_moment": {
      const reason = reasonOf(input.reason);
      if (!isSquaresMoment(input.moment)) return { error: "moment must be q1, half, q3 or final." };
      if (!isScore(input.colScore) || !isScore(input.rowScore)) return { error: "Both scores are required (whole numbers)." };
      if (!reason) return { error: "A reason (3–400 characters) is required." };
      return { action: "grade_moment", moment: input.moment, colScore: input.colScore, rowScore: input.rowScore, reason };
    }
    case "void_moment": {
      const reason = reasonOf(input.reason);
      if (!isSquaresMoment(input.moment)) return { error: "moment must be q1, half, q3 or final." };
      if (!reason) return { error: "A reason (3–400 characters) is required." };
      const hasCol = input.colScore !== undefined && input.colScore !== null && input.colScore !== "";
      const hasRow = input.rowScore !== undefined && input.rowScore !== null && input.rowScore !== "";
      if (hasCol !== hasRow) return { error: "Give both scores to re-grade now, or neither to wait for the feed." };
      if (hasCol && (!isScore(input.colScore) || !isScore(input.rowScore))) return { error: "Scores must be whole numbers." };
      return {
        action: "void_moment",
        moment: input.moment,
        reason,
        colScore: hasCol ? (input.colScore as number) : null,
        rowScore: hasRow ? (input.rowScore as number) : null,
      };
    }
    case "archive": {
      const reason = reasonOf(input.reason);
      return reason ? { action: "archive", reason } : { error: "A reason (3–400 characters) is required." };
    }
    default:
      return { error: "Unknown action." };
  }
};

export type SquaresAdminResult =
  | { ok: true; message: string; tick?: SquaresTickReport }
  | { ok: false; status: number; error: string };

const refuse = (status: number, error: string): SquaresAdminResult => ({ ok: false, status, error });

async function countRows(table: "squares_boards" | "squares_results", eventId: string, unpaidOnly = false): Promise<number> {
  let query = supabaseAdmin!.from(table).select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (unpaidOnly) query = query.not("user_id", "is", null).is("credited_at", null).is("voided_at", null);
  const { count } = await query;
  return count ?? 0;
}

export async function getSquaresAdminOverview(): Promise<{ ok: true; overview: SquaresAdminOverview } | { ok: false; error: string }> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const current = await getCurrentSquaresEvent();
  if (!current.ok) return { ok: false, error: current.error };
  const event = current.value;

  let moments: SquaresMomentRecord[] = [];
  let counts = { boards: 0, claims: 0, unpaid: 0 };
  if (event) {
    const [momentsRead, boards, unpaid, claimsRead] = await Promise.all([
      getSquaresMoments(event.id),
      countRows("squares_boards", event.id),
      countRows("squares_results", event.id, true),
      supabaseAdmin
        .from("squares_claims")
        .select("cell, squares_boards!inner(event_id)", { count: "exact", head: true })
        .eq("squares_boards.event_id", event.id),
    ]);
    if (!momentsRead.ok) return { ok: false, error: momentsRead.error };
    moments = momentsRead.value;
    counts = { boards, claims: claimsRead.count ?? 0, unpaid };
  }

  const [logRead, archivedRead] = await Promise.all([
    supabaseAdmin.from("squares_admin_log").select("id, action, actor, detail, created_at").order("created_at", { ascending: false }).limit(25),
    supabaseAdmin
      .from("squares_events")
      .select("id, season, bdl_game_id, kickoff_at, archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(5),
  ]);
  if (logRead.error) return { ok: false, error: logRead.error.message };
  if (archivedRead.error) return { ok: false, error: archivedRead.error.message };

  return {
    ok: true,
    overview: {
      flags: {
        enabled: isSquaresEnabled(),
        rehearsal: isSquaresRehearsalEnabled(),
        settlementActiveNow: isSquaresSettlementActive(new Date()),
        season: squaresSeason(),
        window: SEASONAL_GAME_WINDOWS.squares,
      },
      event,
      moments,
      counts,
      log: ((logRead.data ?? []) as Array<{ id: string; action: string; actor: string; detail: Record<string, unknown>; created_at: string }>).map(
        (row) => ({ id: row.id, action: row.action, actor: row.actor, detail: row.detail, createdAt: row.created_at }),
      ),
      archived: ((archivedRead.data ?? []) as Array<{ id: string; season: number; bdl_game_id: number; kickoff_at: string; archived_at: string }>).map(
        (row) => ({ id: row.id, season: row.season, bdlGameId: Number(row.bdl_game_id), kickoffAt: row.kickoff_at, archivedAt: row.archived_at }),
      ),
    },
  };
}

export async function runSquaresAdminAction(action: SquaresAdminAction, actor: string): Promise<SquaresAdminResult> {
  if (!supabaseAdmin) return refuse(503, "Supabase admin client is not configured.");

  if (action.action === "run_now") {
    const tick = await runSquaresTick({ force: true });
    return { ok: true, message: tick.errors.length ? "Ran with errors." : "Ran.", tick };
  }

  const current = await getCurrentSquaresEvent();
  if (!current.ok) return refuse(500, current.error);
  const event = current.value;

  if (action.action === "discover" || action.action === "create_from_game") {
    if (event) return refuse(409, "There is already a current event. Archive it first.");
    const feed = action.action === "discover" ? await fetchSuperBowlGame(squaresSeason()) : await fetchSquaresGame(action.gameId);
    if (!feed.ok) return refuse(502, `The NFL feed answered: ${feed.reason}.`);
    if (!feed.value) return refuse(404, "The Super Bowl is not in the feed yet.");
    const created = await createSquaresEvent(feed.value, { season: feed.value.season ?? squaresSeason(), createdBy: actor });
    if (!created.ok) return refuse("code" in created && created.code === "exists" ? 409 : 500, created.error);
    await logSquaresAdmin(created.value.id, "event_created", actor, { bdlGameId: created.value.bdlGameId, via: action.action });
    return { ok: true, message: `Event created for game ${created.value.bdlGameId}.` };
  }

  if (!event) return refuse(404, "There is no current event.");

  switch (action.action) {
    case "set_game": {
      if (event.drawnAt) return refuse(409, "The numbers are drawn; the game can't change now.");
      const feed = await fetchSquaresGame(action.gameId);
      if (!feed.ok) return refuse(502, `The NFL feed answered: ${feed.reason}.`);
      const fields = eventFieldsFromGame(feed.value, event.lockAtSetBy === "admin" ? Date.parse(event.lockAt) : null);
      if (!fields) return refuse(422, "That game has no usable teams or kickoff.");
      const { error } = await supabaseAdmin.from("squares_events").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", event.id).is("drawn_at", null);
      if (error) return refuse(500, error.message);
      await logSquaresAdmin(event.id, "set_game", actor, { from: event.bdlGameId, to: action.gameId });
      return { ok: true, message: `Event now follows game ${action.gameId}.` };
    }
    case "move_lock": {
      if (event.drawnAt) return refuse(409, "The numbers are drawn; the lock time can't change now.");
      if (Date.parse(action.lockAt) > Date.parse(event.kickoffAt)) return refuse(422, "Lock must be at or before kickoff.");
      const { error } = await supabaseAdmin
        .from("squares_events")
        .update({ lock_at: action.lockAt, lock_at_set_by: "admin", updated_at: new Date().toISOString() })
        .eq("id", event.id)
        .is("drawn_at", null);
      if (error) return refuse(500, error.message);
      await logSquaresAdmin(event.id, "move_lock", actor, { from: event.lockAt, to: action.lockAt });
      return { ok: true, message: "Lock time moved." };
    }
    case "grade_moment": {
      if (!event.drawnAt) return refuse(409, "The numbers aren't drawn yet.");
      const moments = await getSquaresMoments(event.id);
      if (!moments.ok) return refuse(500, moments.error);
      const moment = moments.value.find((item) => item.moment === action.moment);
      if (!moment) return refuse(500, "Moment row missing.");
      if (moment.graded) return refuse(409, "Already graded. Void it to change it.");
      const report = { actions: [] as string[], errors: [] as string[] };
      const graded = await gradeMoment(report, event.id, action.moment, action.colScore, action.rowScore, "admin", moment.gradeNo);
      if (!graded) return refuse(409, report.errors[0] ?? `Not graded (${report.actions.join(", ") || "unknown"}).`);
      await logSquaresAdmin(event.id, "grade_moment", actor, {
        moment: action.moment,
        gradeNo: moment.gradeNo,
        scores: { col: action.colScore, row: action.rowScore },
        reason: action.reason,
      });
      await payUnpaidSquaresResults(event.id, report);
      return { ok: true, message: `Graded ${action.moment}.` };
    }
    case "void_moment": {
      const regrade = action.colScore !== null && action.rowScore !== null;
      const { data, error } = await supabaseAdmin.rpc("squares_void_moment", {
        p_event_id: event.id,
        p_moment: action.moment,
        p_reason: action.reason,
        p_actor: actor,
        p_col_score: action.colScore,
        p_row_score: action.rowScore,
        p_points: regrade ? squaresMomentPoints(action.moment) : null,
      });
      if (error) {
        console.error(isMissingFunction(error, "squares_void_moment") ? "[Squares] rpc-missing" : "[Squares] void-failed", { message: error.message });
        return refuse(500, error.message);
      }
      const row = (Array.isArray(data) ? data[0] : data) as
        | { void_outcome?: string; void_results?: number; void_reversed?: number; void_burned?: number }
        | undefined;
      if (row?.void_outcome === "not_graded") return refuse(409, "That moment isn't graded.");
      if (row?.void_outcome !== "voided" && row?.void_outcome !== "voided_and_regraded") return refuse(500, `Void answered ${row?.void_outcome ?? "nothing"}.`);
      const report = { actions: [] as string[], errors: [] as string[] };
      if (regrade) await payUnpaidSquaresResults(event.id, report);
      return {
        ok: true,
        message: `Voided ${action.moment}: ${row.void_reversed ?? 0} paid credit(s) taken back, ${row.void_burned ?? 0} unpaid cancelled.${
          regrade ? " Re-graded with your scores." : " It will re-grade from the feed."
        }`,
      };
    }
    case "archive": {
      const unpaid = await countRows("squares_results", event.id, true);
      if (unpaid > 0) return refuse(409, `${unpaid} winning result(s) are still unpaid. Run settlement first.`);
      const { error } = await supabaseAdmin.from("squares_events").update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", event.id);
      if (error) return refuse(500, error.message);
      await logSquaresAdmin(event.id, "archive", actor, { reason: action.reason });
      return { ok: true, message: "Event archived." };
    }
  }
}
