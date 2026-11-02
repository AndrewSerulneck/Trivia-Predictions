import "server-only";

import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";

/**
 * Automatic Pick 'Em points (docs/pickem-college-football-and-prize-plan.md Phase 1, D2 + D10).
 *
 * Every correct pick in `pickem_picks` (regular sports AND NFL Pick 'Em) is worth a flat
 * 10 venue points, paid once, automatically, right after it is graded. There is no Collect
 * button and no 2x/3x bonus any more.
 *
 * The money moves ONLY inside the `pay_pickem_points` RPC (migration 20261031182914): one
 * statement stamps `reward_claimed_at` on every won, unpaid pick and adds 10 per pick to
 * `users.points`. That conditional stamp is the once-only guarantee — never pay a pick with a
 * plain update or credit `users.points` from here. The RPC pays every won pick whose stamp is
 * still null. The pre-release backlog is NOT paid (Andrew, D12): the migration stamped every won
 * pick graded more than 24 h before it ran with `reward_points = 0`; only wins graded since then
 * on the old code are paid at the first run.
 *
 * Points-target prizes that count Pick 'Em ("pickem" game type) still receive the points, as
 * they did when the player collected: 10 per correct REGULAR pick, at the moment it is paid.
 * Two exceptions, both deliberate:
 *  - NFL picks are never fed to "pickem" prizes. NFL Pick 'Em has its own accrual sweep
 *    (lib/nflPickEmRewardAccrual.ts, "nfl-pickem", 1 per correct pick); feeding them here too
 *    would count one pick twice.
 *  - A pick graded longer ago than PICKEM_PRIZE_ACCRUAL_MAX_AGE_MS (the cutover backlog, or a
 *    pick whose payment waited on a late migration) is paid its venue points but adds no prize
 *    progress: crediting months-old picks to today's prize cycle would be a windfall.
 *
 * Prize accrual runs after the payment committed and is best-effort, exactly like the old
 * Collect path: a failure there never un-pays a pick and never fails the grading run.
 */

/** Venue points for one correct pick. The RPC pays the same literal; keep them equal. */
export const PICKEM_POINTS_PER_CORRECT_PICK = 10;

/** Most picks one payment call pays; the rest are paid by the next grading run. */
export const PICKEM_PAYOUT_BATCH = 500;

/** A paid pick graded longer ago than this adds venue points but no prize progress. */
export const PICKEM_PRIZE_ACCRUAL_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const NFL_SPORT_SLUG = "nfl";

export type PaidPickEmPick = {
  pickId: string;
  userId: string;
  venueId: string;
  sportSlug: string;
  startsAt: string;
  resolvedAt: string | null;
  points: number;
};

export type PickEmPayoutReport = {
  picksPaid: number;
  pointsPaid: number;
  /** Paid picks whose points also went to "pickem" points-target prizes. */
  picksAccruedToPrizes: number;
  /** null = ran cleanly; otherwise why nothing (or only part) happened. */
  error: string | null;
};

type PayRow = {
  pick_id: string;
  user_id: string;
  venue_id: string;
  sport_slug: string;
  starts_at: string;
  resolved_at: string | null;
  points_awarded: number;
};

const emptyReport = (error: string | null = null): PickEmPayoutReport => ({
  picksPaid: 0,
  pointsPaid: 0,
  picksAccruedToPrizes: 0,
  error,
});

let missingRpcLogged = false;

/**
 * Which paid picks feed "pickem" points-target prizes, grouped per player and venue.
 * Pure, so the NFL and age rules are testable without a database.
 */
export const pickEmPrizeAccrualGroups = (
  paid: PaidPickEmPick[],
  nowMs: number
): Array<{ userId: string; venueId: string; picks: number; points: number }> => {
  const groups = new Map<string, { userId: string; venueId: string; picks: number; points: number }>();
  for (const pick of paid) {
    if (pick.sportSlug === NFL_SPORT_SLUG) continue;
    const resolvedMs = Date.parse(String(pick.resolvedAt ?? ""));
    if (!Number.isFinite(resolvedMs) || nowMs - resolvedMs > PICKEM_PRIZE_ACCRUAL_MAX_AGE_MS) continue;
    if (!pick.userId || !pick.venueId) continue;
    const key = `${pick.userId}|${pick.venueId}`;
    const group = groups.get(key) ?? { userId: pick.userId, venueId: pick.venueId, picks: 0, points: 0 };
    group.picks += 1;
    group.points += pick.points;
    groups.set(key, group);
  }
  return [...groups.values()];
};

/**
 * Pay every graded-correct, unpaid pick (one player's, or everyone's when `userId` is omitted).
 * Never throws: grading must not fail because payment did. Unpaid picks stay unpaid and the
 * next grading run pays them.
 */
export async function payPickEmPoints(params: { userId?: string } = {}): Promise<PickEmPayoutReport> {
  if (!supabaseAdmin) return emptyReport();
  const userId = String(params.userId ?? "").trim();

  let rows: PayRow[];
  try {
    const result = await supabaseAdmin.rpc("pay_pickem_points", {
      p_user_id: userId || null,
      p_limit: PICKEM_PAYOUT_BATCH,
    });
    if (result?.error) {
      if (isMissingFunction(result.error, "pay_pickem_points")) {
        if (!missingRpcLogged) {
          missingRpcLogged = true;
          console.error("[PickEmPoints] pay_pickem_points-missing: correct picks stay unpaid until the migration is applied.");
        }
        return emptyReport("pay_pickem_points is not installed.");
      }
      console.error("[PickEmPoints] pay-failed", result.error.message);
      return emptyReport(result.error.message ?? "Pick 'Em payment failed.");
    }
    rows = Array.isArray(result?.data) ? (result.data as PayRow[]) : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pick 'Em payment failed.";
    console.error("[PickEmPoints] pay-failed", message);
    return emptyReport(message);
  }

  const paid: PaidPickEmPick[] = rows.map((row) => ({
    pickId: String(row.pick_id),
    userId: String(row.user_id ?? ""),
    venueId: String(row.venue_id ?? ""),
    sportSlug: String(row.sport_slug ?? ""),
    startsAt: String(row.starts_at ?? ""),
    resolvedAt: row.resolved_at ?? null,
    points: Math.max(0, Number(row.points_awarded ?? PICKEM_POINTS_PER_CORRECT_PICK)),
  }));
  const report: PickEmPayoutReport = {
    picksPaid: paid.length,
    pointsPaid: paid.reduce((sum, pick) => sum + pick.points, 0),
    picksAccruedToPrizes: 0,
    error: null,
  };

  const occurredAt = new Date();
  for (const group of pickEmPrizeAccrualGroups(paid, occurredAt.getTime())) {
    try {
      await applyChallengeCampaignPoints({
        userId: group.userId,
        venueId: group.venueId,
        gameType: "pickem",
        basePoints: group.points,
        occurredAt,
      });
      report.picksAccruedToPrizes += group.picks;
    } catch (error) {
      // The points are already paid; only prize progress is lost, as with the old Collect path.
      console.error(
        `[PickEmPoints] prize-accrual-failed ${group.userId}@${group.venueId}`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return report;
}
