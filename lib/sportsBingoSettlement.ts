export const BINGO_FINAL_CONFIRMATION_MS = 60_000;
export const BINGO_FINAL_DATA_GRACE_MS = 2 * 60 * 60 * 1000;
export const BINGO_NO_FINAL_DEADLINE_MS = 48 * 60 * 60 * 1000;

export type BingoGradingState = {
  firstFinalAt?: string;
  lastObservedAt?: string;
  reasons?: Record<string, string>;
};
export type BingoEvaluation = {
  status: "pending" | "hit" | "miss" | "void";
  resolved: boolean;
  reason?: string;
  retryable?: boolean;
};

/** Pure policy, shared by the live sweep and Phase 6's future explicit repair preview. */
export function planBingoSettlement(params: {
  now: number;
  startsAt: string;
  completed: boolean;
  state: BingoGradingState;
  evaluations: Array<BingoEvaluation & { index: number }>;
}): { state: BingoGradingState; statuses: Array<BingoEvaluation & { index: number }>; maySettle: boolean } {
  const { now, completed } = params;
  const firstFinal = completed ? params.state.firstFinalAt ?? new Date(now).toISOString() : undefined;
  const finalAge = firstFinal ? Math.max(0, now - Date.parse(firstFinal)) : 0;
  const deadline = now - Date.parse(params.startsAt) >= BINGO_NO_FINAL_DEADLINE_MS;
  const expired = deadline || (completed && finalAge >= BINGO_FINAL_DATA_GRACE_MS);
  const reasons: Record<string, string> = {};
  const statuses = params.evaluations.map((evaluation) => {
    const missing = evaluation.status === "pending" || (evaluation.status === "void" && evaluation.retryable !== false);
    if (!missing) {
      if (evaluation.status === "void") reasons[String(evaluation.index)] = evaluation.reason ?? "ungradable_rule";
      return evaluation;
    }
    const reason = evaluation.reason ?? (completed ? "required_evidence_unavailable" : "awaiting_game_or_threshold");
    reasons[String(evaluation.index)] = expired ? `grace_expired:${reason}` : reason;
    return { ...evaluation, status: expired ? "void" as const : "pending" as const, resolved: expired, reason: reasons[String(evaluation.index)] };
  });
  return {
    state: { firstFinalAt: firstFinal, lastObservedAt: new Date(now).toISOString(), reasons },
    statuses,
    maySettle: statuses.every((evaluation) => evaluation.status !== "pending") && (deadline || (completed && finalAge >= BINGO_FINAL_CONFIRMATION_MS)),
  };
}

/** Read-only correction seam. Won/lost cards never re-enter the ordinary active-card sweep. */
export function previewBingoCorrection(before: Array<{ index: number; status: string }>, after: Array<{ index: number; status: string }>) {
  return after.flatMap((square) => {
    const original = before.find((item) => item.index === square.index);
    return original && original.status !== square.status ? [{ index: square.index, before: original.status, after: square.status }] : [];
  });
}
