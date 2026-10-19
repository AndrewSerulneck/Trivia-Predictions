import "server-only";

import { randomInt } from "node:crypto";
import { creditSeasonalPoints } from "@/lib/seasonalPointsCredit";
import { SEASONAL_GAME_WINDOWS, isSquaresEnabled, seasonalWindowState } from "@/lib/seasonalGames";
import {
  SQUARES_DISCOVERY_EVERY_MINUTES,
  SQUARES_NO_FINAL_DEADLINE_MS,
  SQUARES_POST_FINAL_POLL_MS,
  SQUARES_POST_FINAL_WATCH_MS,
  SQUARES_PRE_LOCK_REFRESH_MS,
  gradedMomentMismatches,
  isFinalRecord,
  liveScoreOf,
  planMomentStep,
  squaresMomentEvidence,
  squaresMomentPoints,
  type NflFeedGame,
  type SquaresMoment,
} from "@/lib/squares";
import { fetchSquaresGame, fetchSuperBowlGame } from "@/lib/squaresFeed";
import { awardSquaresPrizes, withdrawVoidedSquaresPrizes } from "@/lib/squaresPrizeAwards";
import {
  createSquaresEvent,
  eventFieldsFromGame,
  getCurrentSquaresEvent,
  getSquaresMoments,
  logSquaresAdmin,
  type SquaresEventRecord,
  type SquaresLiveScore,
  type SquaresMomentRecord,
} from "@/lib/squaresStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";

// Super Bowl Squares settlement (docs/squares-and-brackets-plan.md, Phase 2). Runs from the existing
// every-minute cron (/api/cron/pickem-settle) — no new vercel.json entry.
//
// Cost (plan §6): outside the card window (Feb 1–15) or with the flag off, a run returns before
// touching the database or the provider. Inside it: one small read of the current event per run;
// at most one provider request per run, and only:
//   • no event yet: every SQUARES_DISCOVERY_EVERY_MINUTES (looking for the Super Bowl matchup);
//   • before lock: once an hour (kickoff moves, flexed times);
//   • lock → final: every run (≈ 300 for a Super Bowl);
//   • complete: every SQUARES_POST_FINAL_POLL_MS for SQUARES_POST_FINAL_WATCH_MS (corrections).
// Grading is one set-based RPC per moment for every board; paying is one batched credit call, then
// each venue's Prizes for that moment (lib/squaresPrizeAwards.ts: one indexed read per run, normally
// empty).

/** Server-only rehearsal switch (plan Phase 6): run the settlement outside the card window too. */
export const isSquaresRehearsalEnabled = (): boolean => {
  const v = (process.env.SQUARES_REHEARSAL_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/** Whether the cron should do anything at all. A pure check: no database, no provider. */
export const isSquaresSettlementActive = (now: Date): boolean =>
  isSquaresEnabled() && (seasonalWindowState(SEASONAL_GAME_WINDOWS.squares, now) === "open" || isSquaresRehearsalEnabled());

/** The NFL season (the year it started) whose Super Bowl the card window covers. */
export const squaresSeason = (): number => Number(SEASONAL_GAME_WINDOWS.squares.opensOn.slice(0, 4)) - 1;

/** A uniformly random permutation of 0–9 (Fisher–Yates on node:crypto). */
export const drawDigitPermutation = (): number[] => {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
};

export type SquaresTickReport = {
  ran: boolean;
  skipped?: string;
  eventId?: string;
  feedRequests: number;
  actions: string[];
  errors: string[];
};

const nowIso = (ms: number) => new Date(ms).toISOString();

/**
 * One settlement step. `force` (admin "Run now") skips the window/flag gate and the throttles, so an
 * admin can drive a rehearsal or a fix-up by hand. Never throws: problems land in `errors`.
 */
export async function runSquaresTick(options: { now?: Date; force?: boolean } = {}): Promise<SquaresTickReport> {
  const report = await tick(options);
  if (report.errors.length > 0) console.error("[Squares] tick-errors", { eventId: report.eventId, errors: report.errors });
  return report;
}

async function tick(options: { now?: Date; force?: boolean }): Promise<SquaresTickReport> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const force = options.force === true;
  const report: SquaresTickReport = { ran: false, feedRequests: 0, actions: [], errors: [] };

  if (!force && !isSquaresSettlementActive(now)) return { ...report, skipped: "inactive" };
  if (!supabaseAdmin) return { ...report, skipped: "no_database" };
  report.ran = true;

  try {
    const current = await getCurrentSquaresEvent();
    if (!current.ok) {
      report.errors.push(`event read: ${current.error}`);
      return report;
    }
    if (!current.value) {
      await discoverEvent(report, now, force);
      return report;
    }
    const event = current.value;
    report.eventId = event.id;
    const lockMs = Date.parse(event.lockAt);
    const kickoffMs = Date.parse(event.kickoffAt);

    if (nowMs < lockMs && !event.drawnAt) {
      await refreshBeforeLock(report, event, nowMs, force);
      return report;
    }

    if (!event.drawnAt) {
      const drew = await drawEvent(report, event);
      if (!drew) return report;
    }

    await settleSquaresWinners(event, report, now);

    if (event.completedAt) {
      const completedMs = Date.parse(event.completedAt);
      if (!force && nowMs - completedMs > SQUARES_POST_FINAL_WATCH_MS) return { ...report, skipped: "watch_over" };
      const lastMs = event.feedCheckedAt ? Date.parse(event.feedCheckedAt) : 0;
      if (!force && nowMs - lastMs < SQUARES_POST_FINAL_POLL_MS) return report;
    } else if (!force && nowMs - kickoffMs > SQUARES_NO_FINAL_DEADLINE_MS) {
      if (now.getUTCMinutes() === 0) console.warn("[Squares] no-final-deadline", { eventId: event.id });
      return { ...report, skipped: "no_final_deadline" };
    }

    report.feedRequests += 1;
    const feed = await fetchSquaresGame(event.bdlGameId);
    if (!feed.ok) {
      report.errors.push(`feed: ${feed.reason}`);
      return report;
    }
    const game = feed.value;
    await recordLiveScore(report, event, game, nowMs);

    const moments = await getSquaresMoments(event.id);
    if (!moments.ok) {
      report.errors.push(`moments read: ${moments.error}`);
      return report;
    }
    const graded = await advanceMoments(report, event, game, moments.value, nowMs);
    if (graded) await settleSquaresWinners(event, report, now);

    await completeIfDone(report, event, game, nowMs);
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : "Squares tick failed.");
  }
  return report;
}

async function discoverEvent(report: SquaresTickReport, now: Date, force: boolean): Promise<void> {
  if (!force && now.getUTCMinutes() % SQUARES_DISCOVERY_EVERY_MINUTES !== 0) {
    report.skipped = "no_event";
    return;
  }
  report.feedRequests += 1;
  const found = await fetchSuperBowlGame(squaresSeason());
  if (!found.ok) {
    report.errors.push(`discovery: ${found.reason}`);
    return;
  }
  if (!found.value) {
    report.actions.push("super_bowl_not_in_feed_yet");
    return;
  }
  const created = await createSquaresEvent(found.value, { season: squaresSeason(), createdBy: "auto" });
  if (!created.ok) {
    if ("code" in created && created.code === "exists") return;
    report.errors.push(`create: ${created.error}`);
    return;
  }
  report.eventId = created.value.id;
  report.actions.push("event_created");
  await logSquaresAdmin(created.value.id, "event_created", "settlement", { bdlGameId: created.value.bdlGameId });
}

/** Before lock: follow kickoff changes, at most hourly. Never after the draw. */
async function refreshBeforeLock(report: SquaresTickReport, event: SquaresEventRecord, nowMs: number, force: boolean): Promise<void> {
  const lastMs = event.feedCheckedAt ? Date.parse(event.feedCheckedAt) : 0;
  if (!force && nowMs - lastMs < SQUARES_PRE_LOCK_REFRESH_MS) {
    report.skipped = "before_lock";
    return;
  }
  report.feedRequests += 1;
  const feed = await fetchSquaresGame(event.bdlGameId);
  const patch: Record<string, unknown> = { feed_checked_at: nowIso(nowMs), updated_at: nowIso(nowMs) };
  if (feed.ok) {
    const adminLockMs = event.lockAtSetBy === "admin" ? Date.parse(event.lockAt) : null;
    const fields = eventFieldsFromGame(feed.value, adminLockMs);
    // Compare instants, not strings: PostgREST returns "+00:00", toISOString() writes "Z".
    const moved = (a: string, b: string) => Date.parse(a) !== Date.parse(b);
    if (fields && (moved(fields.kickoff_at, event.kickoffAt) || moved(fields.lock_at, event.lockAt) || fields.col_side !== event.colSide)) {
      Object.assign(patch, fields);
      report.actions.push("matchup_refreshed");
    }
  } else {
    report.errors.push(`refresh: ${feed.reason}`);
  }
  const { error } = await supabaseAdmin!
    .from("squares_events")
    .update(patch)
    .eq("id", event.id)
    .is("drawn_at", null);
  if (error) report.errors.push(`refresh write: ${error.message}`);
}

async function drawEvent(report: SquaresTickReport, event: SquaresEventRecord): Promise<boolean> {
  const { data, error } = await supabaseAdmin!.rpc("squares_draw", {
    p_event_id: event.id,
    p_col_digits: drawDigitPermutation(),
    p_row_digits: drawDigitPermutation(),
  });
  if (error) {
    console.error(isMissingFunction(error, "squares_draw") ? "[Squares] rpc-missing" : "[Squares] draw-failed", { message: error.message });
    report.errors.push(`draw: ${error.message}`);
    return false;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { draw_happened?: boolean; draw_drawn_at?: string | null } | undefined;
  if (row?.draw_happened) {
    report.actions.push("drawn");
    console.info("[Squares] drawn", { eventId: event.id });
  }
  // The database clock may still be a moment before lock_at: no draw yet, try next run.
  return Boolean(row?.draw_drawn_at);
}

async function recordLiveScore(report: SquaresTickReport, event: SquaresEventRecord, game: NflFeedGame, nowMs: number): Promise<void> {
  const score = liveScoreOf(game, event.colSide);
  const live: SquaresLiveScore = {
    col: score?.col ?? null,
    row: score?.row ?? null,
    status: game.status ?? null,
    statusState: game.status_state ?? null,
    at: nowIso(nowMs),
  };
  const { error } = await supabaseAdmin!
    .from("squares_events")
    .update({ live_score: live, feed_checked_at: live.at, updated_at: live.at })
    .eq("id", event.id);
  if (error) report.errors.push(`live score write: ${error.message}`);
}

/** Observe / clear / grade each ungraded moment. Returns whether anything was graded. */
async function advanceMoments(
  report: SquaresTickReport,
  event: SquaresEventRecord,
  game: NflFeedGame,
  moments: SquaresMomentRecord[],
  nowMs: number,
): Promise<boolean> {
  const evidence = new Map(squaresMomentEvidence(game, event.colSide).map((item) => [item.moment, item]));
  let graded = false;
  for (const moment of moments) {
    if (moment.graded) continue;
    const proof = evidence.get(moment.moment);
    if (!proof) continue;
    const step = planMomentStep(proof, moment.observed, nowMs);
    if (step.action === "none") continue;
    if (step.action === "grade") {
      graded = (await gradeMoment(report, event.id, moment.moment, step.score.col, step.score.row, "feed", moment.gradeNo)) || graded;
      continue;
    }
    const observation =
      step.action === "observe"
        ? { observed_col_score: step.observation.col, observed_row_score: step.observation.row, observed_at: nowIso(step.observation.atMs) }
        : { observed_col_score: null, observed_row_score: null, observed_at: null };
    const { error } = await supabaseAdmin!
      .from("squares_event_moments")
      .update({ ...observation, updated_at: nowIso(nowMs) })
      .eq("event_id", event.id)
      .eq("moment", moment.moment)
      .eq("grade_no", moment.gradeNo)
      .is("graded_at", null);
    if (error) report.errors.push(`${moment.moment} observe: ${error.message}`);
    else report.actions.push(`${moment.moment}_${step.action}`);
  }
  return graded;
}

/** Grade one moment for every board (squares_grade_moment). Shared with lib/squaresAdmin.ts. */
export async function gradeMoment(
  report: { actions: string[]; errors: string[] },
  eventId: string,
  moment: SquaresMoment,
  colScore: number,
  rowScore: number,
  source: "feed" | "admin",
  gradeNo: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin!.rpc("squares_grade_moment", {
    p_event_id: eventId,
    p_moment: moment,
    p_col_score: colScore,
    p_row_score: rowScore,
    p_points: squaresMomentPoints(moment),
    p_source: source,
    p_grade_no: gradeNo,
  });
  if (error) {
    console.error(isMissingFunction(error, "squares_grade_moment") ? "[Squares] rpc-missing" : "[Squares] grade-failed", {
      moment,
      message: error.message,
    });
    report.errors.push(`${moment} grade: ${error.message}`);
    return false;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { grade_outcome?: string; grade_winning_cell?: number; grade_boards?: number; grade_winners?: number }
    | undefined;
  if (row?.grade_outcome !== "graded") {
    report.actions.push(`${moment}_${row?.grade_outcome ?? "unknown"}`);
    return false;
  }
  report.actions.push(`${moment}_graded`);
  console.info("[Squares] moment-graded", {
    eventId,
    moment,
    source,
    gradeNo,
    winningCell: row.grade_winning_cell,
    boards: row.grade_boards,
    winners: row.grade_winners,
  });
  return true;
}

/**
 * Everything a graded winner is owed, safe to repeat: venue points (payUnpaidSquaresResults), then
 * the venue's Squares Prizes (awardSquaresPrizes), then taking back a voided grade's unused coupons
 * (withdrawVoidedSquaresPrizes). Shared with lib/squaresAdmin.ts.
 */
export async function settleSquaresWinners(
  event: Pick<SquaresEventRecord, "id" | "kickoffAt" | "lockAt">,
  report: { actions: string[]; errors: string[] },
  now: Date = new Date(),
): Promise<void> {
  await payUnpaidSquaresResults(event.id, report);
  await awardSquaresPrizes(event, report, now);
  await withdrawVoidedSquaresPrizes(event, report, now);
}

type UnpaidRow = { id: string; user_id: string; credit_key: string; points: number };

/** Most unpaid results paid per run (two credit batches); the rest wait for the next run. */
const PAY_PER_RUN = 1000;

/**
 * Pay every graded, unvoided, unpaid winning result through creditSeasonalPoints (once-only by
 * key), then mark it paid. Safe to repeat: a key already paid to the same player is just marked.
 */
export async function payUnpaidSquaresResults(eventId: string, report: { actions: string[]; errors: string[] }): Promise<void> {
  const { data, error } = await supabaseAdmin!
    .from("squares_results")
    .select("id, user_id, credit_key, points")
    .eq("event_id", eventId)
    .not("user_id", "is", null)
    .is("credited_at", null)
    .is("voided_at", null)
    .limit(PAY_PER_RUN);
  if (error) {
    report.errors.push(`unpaid read: ${error.message}`);
    return;
  }
  const unpaid = (data ?? []) as UnpaidRow[];
  if (unpaid.length === 0) return;

  const response = await creditSeasonalPoints(
    "squares",
    unpaid.map((row) => ({ userId: row.user_id, sourceKey: row.credit_key, points: Number(row.points) })),
  );
  const byKey = new Map(unpaid.map((row) => [row.credit_key, row]));
  const paidIds = response.results
    .filter((result) => result.outcome === "credited" || (result.outcome === "already_credited" && result.existingUserId === result.userId))
    .flatMap((result) => {
      const row = byKey.get(result.sourceKey);
      return row ? [row.id] : [];
    });
  if (!response.ok) report.errors.push(`credit: ${response.code} ${response.error}`);
  if (paidIds.length === 0) return;
  const { error: markError } = await supabaseAdmin!
    .from("squares_results")
    .update({ credited_at: new Date().toISOString() })
    .in("id", paidIds)
    .is("voided_at", null);
  if (markError) report.errors.push(`mark paid: ${markError.message}`);
  else report.actions.push(`paid_${paidIds.length}`);
}

/** All four graded + final → completed; report any quarter the final record disagrees with. */
async function completeIfDone(report: SquaresTickReport, event: SquaresEventRecord, game: NflFeedGame, nowMs: number): Promise<void> {
  if (!isFinalRecord(game)) return;
  const moments = await getSquaresMoments(event.id);
  if (!moments.ok) {
    report.errors.push(`moments re-read: ${moments.error}`);
    return;
  }
  if (moments.value.some((moment) => !moment.graded)) return;

  const graded = moments.value.map((moment) => ({ moment: moment.moment, col: moment.graded!.col, row: moment.graded!.row }));
  const mismatches = gradedMomentMismatches(game, event.colSide, graded);
  for (const mismatch of mismatches) {
    const current = moments.value.find((moment) => moment.moment === mismatch.moment);
    const note = mismatch.final
      ? `Final record says ${mismatch.final.col}–${mismatch.final.row}; graded ${mismatch.graded.col}–${mismatch.graded.row}.`
      : `Final record can't prove this moment; graded ${mismatch.graded.col}–${mismatch.graded.row}.`;
    if (current?.mismatchNote === note || current?.graded?.source === "admin") continue;
    console.warn("[Squares] moment-mismatch", { eventId: event.id, moment: mismatch.moment, graded: mismatch.graded, final: mismatch.final });
    await supabaseAdmin!
      .from("squares_event_moments")
      .update({ mismatch_note: note, updated_at: nowIso(nowMs) })
      .eq("event_id", event.id)
      .eq("moment", mismatch.moment);
    await logSquaresAdmin(event.id, "moment_mismatch", "settlement", { moment: mismatch.moment, note });
    report.actions.push(`${mismatch.moment}_mismatch`);
  }

  if (!event.completedAt) {
    const { error } = await supabaseAdmin!
      .from("squares_events")
      .update({ completed_at: nowIso(nowMs), updated_at: nowIso(nowMs) })
      .eq("id", event.id)
      .is("completed_at", null);
    if (error) report.errors.push(`complete: ${error.message}`);
    else report.actions.push("completed");
  }
}
