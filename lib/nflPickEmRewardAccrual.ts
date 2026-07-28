import "server-only";

import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import { NFL_PICKEM_SPORT_SLUG } from "@/lib/nflPickEm";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * NFL Pick 'Em → challenge-campaign accrual (Phase 6).
 *
 * NFL picks live in `pickem_picks` alongside daily Pick 'Em and are settled by the
 * SHARED `settlePendingPickEmPicks` (lib/pickem.ts), which writes status /
 * reward_points and stops there — `applyChallengeCampaignPoints` was never called
 * for NFL, so a points-target NFL reward could be created but never won.
 *
 * This is a SEPARATE NFL-only sweep rather than an inline branch inside
 * settlePendingPickEmPicks (the plan's "option B"): daily Pick 'Em's settlement
 * path is left byte-for-byte untouched, and the sweep is independently testable
 * and safely re-runnable. It reads settled-but-not-yet-accrued NFL picks and is
 * invoked right after settlement by /api/cron/pickem-settle.
 *
 * THE ACCRUAL UNIT IS CORRECT PICKS, NOT POINTS. Every NFL pick is worth a flat
 * 10 (`PICKEM_REWARD_POINTS`), and that column sits right here on the row, which
 * makes 10 the tempting wrong answer — but a partner's threshold is "get N picks
 * right", so `basePoints` must be 1 per won pick or every reward would be won at
 * a tenth of its stated difficulty.
 *
 * Week/season scope is NOT hand-rolled here. The engine already answers it:
 * `isCampaignEligibleAtTime` gates on gameTypes/activeDays/endDate,
 * `computeCycleStart` places the accrual in the right weekly cycle (anchored
 * Thursday via activeDays[0]), and a season reward's startDate/endDate bound it.
 * All this sweep owes the engine is an accurate `occurredAt`.
 */

/**
 * Sweep ceiling, matching settlePendingPickEmPicks' own 500-row page. Oldest
 * kickoff first, so a backlog drains in chronological order across runs and a
 * later cycle can never be credited before an earlier one.
 */
export const NFL_ACCRUAL_SWEEP_ROW_CAP = 500;

type AccrualPickRow = {
  id: string;
  user_id: string;
  venue_id: string;
  starts_at: string;
};

type AccrualGroup = {
  userId: string;
  venueId: string;
  /** The pick's own game kickoff — see the occurredAt note below. */
  startsAt: string;
  pickIds: string[];
};

export type NFLPickEmAccrualReport = {
  picksScanned: number;
  /** Groups whose points were handed to the challenge engine. */
  groupsAccrued: number;
  /** Won picks counted — also the total `basePoints` handed to the engine. */
  picksAccrued: number;
  /** Progress rows the engine actually moved (0 when a venue has no NFL reward). */
  campaignUpdates: number;
  errors: Array<{ scope: string; message: string }>;
};

const emptyReport = (): NFLPickEmAccrualReport => ({
  picksScanned: 0,
  groupsAccrued: 0,
  picksAccrued: 0,
  campaignUpdates: 0,
  errors: [],
});

/**
 * Group by (user, venue, kickoff) — NOT by (user, venue) alone.
 *
 * `occurredAt` decides which cycle the points land in, so it must be the pick's
 * OWN kickoff, not `new Date()`: a Sunday-afternoon game settled by a Monday
 * cron belongs to Sunday's NFL week. An NFL week runs Thu→Wed so Monday is
 * usually still the same week, but a late-Wednesday cron settling a
 * Monday-night game would cross the boundary and credit the wrong week.
 *
 * One user's won picks in a sweep can therefore span several kickoffs (Thu, Sun,
 * Mon) with different correct cycles, so a single call per user/venue would have
 * to pick one of them and be wrong for the rest. Grouping by kickoff still
 * collapses the common case — the whole Sunday 1pm slate is one call.
 */
const groupPicks = (rows: AccrualPickRow[]): AccrualGroup[] => {
  const groups = new Map<string, AccrualGroup>();
  for (const row of rows) {
    const userId = String(row.user_id ?? "").trim();
    const venueId = String(row.venue_id ?? "").trim();
    const startsAt = String(row.starts_at ?? "").trim();
    const key = `${userId}|${venueId}|${startsAt}`;
    const existing = groups.get(key);
    if (existing) {
      existing.pickIds.push(row.id);
      continue;
    }
    groups.set(key, { userId, venueId, startsAt, pickIds: [row.id] });
  }
  return [...groups.values()];
};

const stampAccrued = async (pickIds: string[], stampIso: string): Promise<void> => {
  const { error } = await supabaseAdmin!
    .from("pickem_picks")
    .update({ challenge_accrued_at: stampIso })
    .in("id", pickIds);
  if (error) {
    throw new Error(error.message ?? "Failed to stamp challenge_accrued_at.");
  }
};

/**
 * Feed newly-settled winning NFL picks into the challenge-campaign engine.
 * Idempotent: each pick is stamped `challenge_accrued_at` in the same pass and
 * the select filters on that column being null, so re-running the cron over an
 * overlapping window never double-counts (which would inflate a guest toward a
 * real prize — `applyChallengeCampaignPoints` accumulates).
 *
 * One bad group never aborts the sweep; failures land in `report.errors` and the
 * rows stay un-stamped for the next run.
 */
export async function accrueNFLPickEmChallengePoints(): Promise<NFLPickEmAccrualReport> {
  const report = emptyReport();
  if (!supabaseAdmin) return report;

  const { data, error } = await supabaseAdmin
    .from("pickem_picks")
    .select("id, user_id, venue_id, starts_at")
    .eq("sport_slug", NFL_PICKEM_SPORT_SLUG)
    .eq("status", "won")
    .is("challenge_accrued_at", null)
    .order("starts_at", { ascending: true })
    .limit(NFL_ACCRUAL_SWEEP_ROW_CAP)
    .returns<AccrualPickRow[]>();

  if (error) {
    throw new Error(error.message ?? "Failed to load NFL picks awaiting reward accrual.");
  }

  const rows = data ?? [];
  report.picksScanned = rows.length;
  if (rows.length === 0) return report;

  const stampIso = new Date().toISOString();

  for (const group of groupPicks(rows)) {
    const occurredAtMs = Date.parse(group.startsAt);
    if (!group.userId || !group.venueId || !Number.isFinite(occurredAtMs)) {
      // Unusable row: stamp it so the sweep doesn't re-scan it forever. It can
      // never be placed in a cycle, and leaving it null would keep it at the
      // head of every future page (oldest-first) ahead of accruable picks.
      try {
        await stampAccrued(group.pickIds, stampIso);
      } catch (err) {
        report.errors.push({
          scope: group.pickIds.join(","),
          message: err instanceof Error ? err.message : "Failed to stamp unusable pick.",
        });
      }
      continue;
    }

    try {
      const result = await applyChallengeCampaignPoints({
        userId: group.userId,
        venueId: group.venueId,
        gameType: "nfl-pickem",
        // 1 per correct pick. See the unit note at the top of this file.
        basePoints: group.pickIds.length,
        occurredAt: new Date(occurredAtMs),
        // A partner creating a reward mid-week must not instantly award guests
        // for games that finished before the reward existed.
        requireCampaignCreatedBeforeOccurrence: true,
      });
      report.groupsAccrued += 1;
      report.picksAccrued += group.pickIds.length;
      report.campaignUpdates += result.campaignUpdates.length;
    } catch (err) {
      report.errors.push({
        scope: `${group.userId}@${group.venueId}#${group.startsAt}`,
        message: err instanceof Error ? err.message : "Failed to accrue NFL reward points.",
      });
      // Un-stamped, so the next sweep retries this group.
      continue;
    }

    try {
      await stampAccrued(group.pickIds, stampIso);
    } catch (err) {
      // Accrual already landed. Do NOT re-accrue in this run; the next sweep
      // will see the rows again and may double-count, which is why this is
      // logged loudly rather than swallowed.
      console.error(
        `[nfl-pickem-reward] accrued ${group.pickIds.length} pick(s) but failed to stamp challenge_accrued_at (picks: ${group.pickIds.join(", ")})`,
        err
      );
      report.errors.push({
        scope: `${group.userId}@${group.venueId}#${group.startsAt}`,
        message: err instanceof Error ? err.message : "Failed to stamp challenge_accrued_at.",
      });
    }
  }

  return report;
}
