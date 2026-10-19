import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import {
  SEASONAL_CREDIT_BATCH_MAX,
  seasonalCreditProblem,
  type SeasonalCredit,
  type SeasonalPointsSource,
} from "@/lib/seasonalPoints";

// The ONLY caller of the credit_seasonal_points RPC (migration 20261019045030). Squares settlement
// (Phase 2) and bracket grading (Phase 7) pay venue points through this and nothing else — never a
// plain `update users set points`, which would pay twice on a retried cron run.

export type SeasonalCreditOutcome = "credited" | "already_credited" | "user_not_found";

export type SeasonalCreditResult = SeasonalCredit & {
  outcome: SeasonalCreditOutcome;
  /** For already_credited: who the key was paid to before, when visible. A different user = a settlement bug to log. */
  existingUserId: string | null;
  existingPoints: number | null;
};

export type SeasonalCreditResponse =
  | { ok: true; results: SeasonalCreditResult[] }
  | { ok: false; code: "invalid" | "unavailable" | "rpc_missing" | "rpc_failed"; error: string; results: SeasonalCreditResult[] };

type CreditRow = {
  credit_user_id: string;
  credit_source_key: string;
  credit_points: number;
  outcome: SeasonalCreditOutcome;
  existing_user_id: string | null;
  existing_points: number | null;
};

const RPC = "credit_seasonal_points";

/**
 * Credit venue points, once per (source, sourceKey). Sends at most SEASONAL_CREDIT_BATCH_MAX
 * credits per call. Fails closed: an invalid credit refuses the whole request before anything is
 * sent; an RPC error stops at that batch. Batches before it are committed and listed in `results`
 * (re-sending them is safe — they come back already_credited).
 */
export async function creditSeasonalPoints(
  source: SeasonalPointsSource,
  credits: readonly SeasonalCredit[],
): Promise<SeasonalCreditResponse> {
  const results: SeasonalCreditResult[] = [];
  const seen = new Set<string>();
  for (const credit of credits) {
    const problem = seasonalCreditProblem(credit) ?? (seen.has(credit.sourceKey) ? "duplicate sourceKey" : null);
    if (problem) return { ok: false, code: "invalid", error: `${credit.sourceKey}: ${problem}`, results };
    seen.add(credit.sourceKey);
  }
  if (credits.length === 0) return { ok: true, results };
  if (!supabaseAdmin) return { ok: false, code: "unavailable", error: "Supabase admin client is not configured.", results };

  for (let start = 0; start < credits.length; start += SEASONAL_CREDIT_BATCH_MAX) {
    const batch = credits.slice(start, start + SEASONAL_CREDIT_BATCH_MAX);
    const { data, error } = await supabaseAdmin.rpc(RPC, {
      p_source: source,
      p_credits: batch.map((c) => ({ user_id: c.userId, source_key: c.sourceKey, points: c.points })),
    });
    if (error) {
      const missing = isMissingFunction(error, RPC);
      console.error(missing ? "[SeasonalPoints] rpc-missing" : "[SeasonalPoints] rpc-failed", {
        source,
        batchStart: start,
        batchSize: batch.length,
        message: error.message,
      });
      return { ok: false, code: missing ? "rpc_missing" : "rpc_failed", error: error.message ?? "Credit failed.", results };
    }
    for (const row of (data ?? []) as CreditRow[]) {
      if (row.outcome === "already_credited" && row.existing_user_id && row.existing_user_id !== row.credit_user_id) {
        console.warn("[SeasonalPoints] key-paid-to-another-user", { source, sourceKey: row.credit_source_key });
      }
      results.push({
        userId: row.credit_user_id,
        sourceKey: row.credit_source_key,
        points: Number(row.credit_points),
        outcome: row.outcome,
        existingUserId: row.existing_user_id ?? null,
        existingPoints: row.existing_points === null || row.existing_points === undefined ? null : Number(row.existing_points),
      });
    }
  }
  return { ok: true, results };
}
