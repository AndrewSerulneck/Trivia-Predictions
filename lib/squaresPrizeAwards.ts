import "server-only";

import { awardCycleWinner, getCampaignCloseTimestampMs, listActiveSquaresPrizeCampaigns } from "@/lib/challengeCampaigns";
import { createNotification } from "@/lib/notifications";
import { isSquaresMoment } from "@/lib/squares";
import { SQUARES_PRIZE_DEFINITION_ID, SQUARES_PRIZE_MOMENT_PHRASES, squaresPrizeCycleStart } from "@/lib/squaresPrizes";
import { chunkIds } from "@/lib/postgrestIds";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import { SQUARES_GAME_NAME } from "@/lib/venueGameCards";
import type { SquaresEventRecord } from "@/lib/squaresStore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ChallengeCampaign } from "@/types";

// Super Bowl Squares Prizes, awarded (docs/squares-and-brackets-plan.md, Phase 4).
//
// A graded moment writes one squares_results row per board; a row with a user_id is that venue's
// winner. Each such row is checked ONCE against the venue's active Squares prizes: every prize that
// pays that moment gets award_cycle_winner(prize, cycle = squaresPrizeCycleStart(kickoff, moment,
// grade_no), winner, quota 1) — which mints the coupon in the same transaction. Then the row is
// stamped prize_checked_at, so later runs never read it again.
//
// SAFE TO REPEAT: the ledger is unique on (prize, cycle, winner) and the quota is 1, so a run that
// dies before stamping just re-asks and gets won:false. A row is stamped only when every award for
// it answered; a failed one stays unchecked and is retried next run.
//
// WHICH PRIZES: active (archiving stops a prize), at the board's venue, paying that moment, created
// BEFORE the lock (a prize set up after claims closed was never on offer to the players holding
// squares), and not closed before kickoff (an old season's prize never pays a new season's game).
// A REHEARSAL event (squares_events.purpose, plan 6.2) pays prizes only at hidden venues — the second
// guard behind squares_claim, which already refuses rehearsal claims anywhere else.
//
// A VOID (Andrew, 2026-10-19: "take back if unused"): an admin void marks the moment's results void
// and re-grades under grade_no + 1 — new rows, a new cycle key — so the corrected winner is paid by
// awardSquaresPrizes. withdrawVoidedSquaresPrizes then takes back the voided winner's coupon unless
// it was already redeemed (squares_withdraw_prize_coupons, all-or-nothing per coupon; a redeemed
// coupon is spent and kept), tells that guest, and stamps prize_withdrawn_at.
//
// COST: two indexed reads per settlement run while the event is watched (squares_results_prize_
// unchecked_idx and squares_results_prize_withdraw_idx; normally both empty; none once the watch is
// over, plan 6.3). When a moment is graded: + one prizes read per POSTGREST_ID_CHUNK winning venues
// + one RPC per (venue with a prize for that moment and a winner) + one stamp write per
// POSTGREST_ID_CHUNK rows (lib/postgrestIds.ts). A void: + one RPC per voided winning result that
// was checked for prizes.

/** Most winning results checked in one run; the rest wait for the next. */
const PRIZE_RESULTS_PER_RUN = 500;

type UncheckedResultRow = {
  id: string;
  moment: string;
  grade_no: number;
  user_id: string | null;
  points: number;
  board: { venue_id: string } | null;
};

/**
 * May a prize pay at this venue for this event? A Super Bowl event: any venue. A rehearsal: only a
 * venue known to be hidden (null = unread or missing, which fails closed).
 */
export const squaresPrizePaysAtVenue = (
  purpose: SquaresEventRecord["purpose"],
  venueHidden: boolean | null | undefined,
): boolean => purpose !== "rehearsal" || venueHidden === true;

/** Was this prize on offer for this game? See WHICH PRIZES above. Unparseable dates fail closed. */
export const squaresPrizeCoversEvent = (
  campaign: ChallengeCampaign,
  event: Pick<SquaresEventRecord, "lockAt" | "kickoffAt">,
): boolean => {
  const createdMs = Date.parse(String(campaign.createdAt ?? ""));
  const lockMs = Date.parse(event.lockAt);
  const kickoffMs = Date.parse(event.kickoffAt);
  if (!Number.isFinite(createdMs) || !Number.isFinite(lockMs) || !Number.isFinite(kickoffMs)) return false;
  if (createdMs >= lockMs) return false;
  const closeMs = getCampaignCloseTimestampMs(campaign);
  return closeMs === null || kickoffMs <= closeMs;
};

export type SquaresPrizeReport = { actions: string[]; errors: string[] };

/**
 * Award every unchecked winning result of `event` to the prizes that pay it. Never throws: problems
 * land in `report.errors` and the affected rows are retried next run.
 */
export async function awardSquaresPrizes(
  event: Pick<SquaresEventRecord, "id" | "kickoffAt" | "lockAt" | "purpose">,
  report: SquaresPrizeReport,
  now: Date = new Date(),
): Promise<void> {
  if (!supabaseAdmin) return;
  const { data, error } = await supabaseAdmin
    .from("squares_results")
    .select("id, moment, grade_no, user_id, points, board:squares_boards(venue_id)")
    .eq("event_id", event.id)
    .not("user_id", "is", null)
    .is("voided_at", null)
    .is("prize_checked_at", null)
    .order("created_at", { ascending: true })
    .limit(PRIZE_RESULTS_PER_RUN)
    .returns<UncheckedResultRow[]>();
  if (error) {
    report.errors.push(`prize read: ${error.message}`);
    return;
  }
  const rows = data ?? [];
  if (rows.length === 0) return;

  const venueIds = [...new Set(rows.flatMap((row) => (row.board?.venue_id ? [row.board.venue_id] : [])))];

  // Rehearsal only: which of these venues are hidden. One read, made only for a rehearsal event with
  // an unchecked winner. A failed read stops the run (retried next run), never pays.
  const hiddenVenues = new Set<string>();
  if (event.purpose === "rehearsal" && venueIds.length > 0) {
    for (const chunk of chunkIds(venueIds)) {
      const { data: venueRows, error: venueError } = await supabaseAdmin.from("venues").select("id, hidden").in("id", chunk);
      if (venueError) {
        report.errors.push(`prize venues read: ${venueError.message}`);
        return;
      }
      for (const venue of (venueRows ?? []) as Array<{ id: string; hidden: boolean | null }>) {
        if (venue.hidden === true) hiddenVenues.add(venue.id);
      }
    }
  }
  let prizes: ChallengeCampaign[];
  try {
    // The read already filters on the definition; checked again here so this sweep pays only its
    // own prizes even if that read changes (tests/prize-sweep-ownership-contract.test.ts).
    prizes = (await listActiveSquaresPrizeCampaigns(venueIds)).filter(
      (campaign) => campaign.rewardDefinitionId === SQUARES_PRIZE_DEFINITION_ID && squaresPrizeCoversEvent(campaign, event),
    );
  } catch (readError) {
    report.errors.push(`prize campaigns read: ${readError instanceof Error ? readError.message : "failed"}`);
    return;
  }

  const checked: string[] = [];
  let awarded = 0;
  for (const row of rows) {
    const venueId = row.board?.venue_id ?? null;
    const userId = row.user_id;
    if (!venueId || !userId || !isSquaresMoment(row.moment)) {
      // Nothing any prize could pay (a malformed row): stamp it so it isn't read every minute.
      checked.push(row.id);
      continue;
    }
    if (!squaresPrizePaysAtVenue(event.purpose, hiddenVenues.has(venueId))) {
      // A rehearsal winner at a real venue (only possible if that venue was un-hidden mid-rehearsal):
      // no prize ever pays it, so stamp it once.
      console.warn("[SquaresPrize] rehearsal-visible-venue", { eventId: event.id, venueId });
      checked.push(row.id);
      continue;
    }
    const moment = row.moment;
    const cycleStart = squaresPrizeCycleStart(event.kickoffAt, moment, Number(row.grade_no));
    if (!cycleStart) {
      report.errors.push(`prize cycle: unreadable kickoff ${event.kickoffAt}`);
      continue;
    }
    let answered = true;
    for (const prize of prizes) {
      if (!prize.venueIds.includes(venueId) || !(prize.squaresMoments ?? []).includes(moment)) continue;
      try {
        const { won } = await awardCycleWinner({
          campaign: prize,
          userId,
          venueId,
          cycleStart,
          pointsEarned: Number(row.points) || 0,
          winnerQuota: 1,
          now,
        });
        if (won) {
          awarded += 1;
          console.info("[SquaresPrize] awarded", { campaignId: prize.id, venueId, moment, gradeNo: row.grade_no });
        }
      } catch (awardError) {
        answered = false;
        report.errors.push(`prize ${prize.id} ${moment}: ${awardError instanceof Error ? awardError.message : "award failed"}`);
      }
    }
    if (answered) checked.push(row.id);
  }

  if (awarded > 0) report.actions.push(`prizes_awarded_${awarded}`);
  for (const chunk of chunkIds(checked)) {
    const { error: stampError } = await supabaseAdmin
      .from("squares_results")
      .update({ prize_checked_at: now.toISOString() })
      .in("id", chunk)
      .is("prize_checked_at", null);
    if (stampError) report.errors.push(`prize stamp: ${stampError.message}`);
  }
}

/** What the guest reads when a corrected score moves their prize to another square. */
export const squaresPrizeWithdrawnMessage = (moment: string): string =>
  `Score correction in ${SQUARES_GAME_NAME}: the result at ${
    isSquaresMoment(moment) ? SQUARES_PRIZE_MOMENT_PHRASES[moment] : "that moment"
  } changed, so its prize went to the right square and your coupon for it was removed.`;

/**
 * Take back the unredeemed coupons of every voided winning result that was already checked for
 * prizes. A result still unchecked is left alone: either no award ever ran for it (the award step
 * skips voided rows), or one is running right now and will stamp it, after which this picks it up.
 * Never throws; a row is stamped prize_withdrawn_at only after its withdrawal answered.
 */
export async function withdrawVoidedSquaresPrizes(
  event: Pick<SquaresEventRecord, "id" | "kickoffAt">,
  report: SquaresPrizeReport,
  now: Date = new Date(),
): Promise<void> {
  if (!supabaseAdmin) return;
  const { data, error } = await supabaseAdmin
    .from("squares_results")
    .select("id, moment, grade_no, user_id, points, board:squares_boards(venue_id)")
    .eq("event_id", event.id)
    .not("user_id", "is", null)
    .not("voided_at", "is", null)
    .not("prize_checked_at", "is", null)
    .is("prize_withdrawn_at", null)
    .order("created_at", { ascending: true })
    .limit(PRIZE_RESULTS_PER_RUN)
    .returns<UncheckedResultRow[]>();
  if (error) {
    report.errors.push(`prize withdraw read: ${error.message}`);
    return;
  }
  const done: string[] = [];
  let withdrawn = 0;
  for (const row of data ?? []) {
    const venueId = row.board?.venue_id ?? null;
    const cycleStart = isSquaresMoment(row.moment) ? squaresPrizeCycleStart(event.kickoffAt, row.moment, Number(row.grade_no)) : null;
    if (!venueId || !row.user_id || !cycleStart) {
      done.push(row.id);
      continue;
    }
    const { data: answer, error: rpcError } = await supabaseAdmin.rpc("squares_withdraw_prize_coupons", {
      p_venue_id: venueId,
      p_cycle_start: cycleStart.toISOString(),
      p_user_id: row.user_id,
    });
    if (rpcError) {
      if (isMissingFunction(rpcError, "squares_withdraw_prize_coupons")) console.error("[SquaresPrize] rpc-missing");
      report.errors.push(`prize withdraw ${row.moment}: ${rpcError.message}`);
      continue;
    }
    const counts = (Array.isArray(answer) ? answer[0] : answer) as { withdrawn_count?: number; kept_count?: number } | undefined;
    const taken = Number(counts?.withdrawn_count) || 0;
    if (taken > 0) {
      withdrawn += taken;
      console.info("[SquaresPrize] withdrawn", { venueId, moment: row.moment, gradeNo: row.grade_no, coupons: taken, kept: counts?.kept_count ?? 0 });
      try {
        await createNotification({ userId: row.user_id, message: squaresPrizeWithdrawnMessage(row.moment), type: "info", linkUrl: "/redeem-prizes" });
      } catch (notifyError) {
        console.error("[SquaresPrize] withdraw-notice-failed", notifyError instanceof Error ? notifyError.message : notifyError);
      }
    }
    done.push(row.id);
  }

  if (withdrawn > 0) report.actions.push(`prizes_withdrawn_${withdrawn}`);
  for (const chunk of chunkIds(done)) {
    const { error: stampError } = await supabaseAdmin
      .from("squares_results")
      .update({ prize_withdrawn_at: now.toISOString() })
      .in("id", chunk)
      .is("prize_withdrawn_at", null);
    if (stampError) report.errors.push(`prize withdraw stamp: ${stampError.message}`);
  }
}

