import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openSpeedTriviaAdmission, approveSpeedTrivia, speedTriviaError } from "@/lib/speedTriviaAdmission";
import { AdmissionError } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { AdmissionRow, AdmissionSession } from "@/types/speedTriviaAdmission";
import type { TriviaBulkResult, TriviaReviewRecord, TriviaReviewRow } from "@/types/triviaReview";

export const runProgressiveTriviaApproval = async (
  ids: string[], started: number, signal: AbortSignal,
  emit: (record: TriviaReviewRecord) => void,
): Promise<void> => {
  const savedIds: string[] = [];
  const repeats: NonNullable<TriviaBulkResult["repeats"]> = [];
  const holds: NonNullable<TriviaBulkResult["holds"]> = [];
  let gate: AdmissionSession | undefined;
  const timeLeft = () => {
    const remaining = 240_000 - (Date.now() - started);
    if (remaining <= 0) throw new AdmissionError("budget_exhausted", "Review time limit reached.");
    return remaining;
  };
  const recordRow = (result: TriviaReviewRow) => {
    if (result.outcome === "approved") savedIds.push(result.id);
    else if (result.outcome === "repeat") repeats.push({ ...result, conflicts: result.matches?.map(match => match.id) });
    else holds.push(result);
    const checked = savedIds.length + repeats.length + holds.length;
    emit({ type: "row", result, counts: { checked, approved: savedIds.length, repeats: repeats.length, unresolved: holds.length, remaining: ids.length - checked } });
  };
  const describe = (id: string, error: unknown): TriviaReviewRow => {
    const failure = speedTriviaError(error);
    const matches = failure.conflicts.slice(0, 3).flatMap(matchId => {
      const match = gate?.index().byId.get(matchId)?.row;
      return match?.status === "active" ? [{ id: match.id, question: match.question.slice(0, 2_000), answer: (match.options[match.correct_answer] ?? "").slice(0, 1_000) }] : [];
    });
    return { id, outcome: failure.code === "duplicate" ? "repeat" : "unresolved", code: failure.code,
      reason: (error instanceof Error ? error.message : "Question checking did not finish.").slice(0, 3_000), matches };
  };
  let final: Partial<TriviaBulkResult> = { ok: true };
  try {
    signal.throwIfAborted();
    const { data, error } = await supabaseAdmin!.from("trivia_questions").select("*").in("id", ids)
      .eq("question_pool", "anytime_blitz").abortSignal(AbortSignal.any([signal, AbortSignal.timeout(timeLeft())]));
    if (error || !data) throw new AdmissionError(Date.now() - started >= 240_000 ? "budget_exhausted" : "verification_unavailable", "Could not verify selected questions.");
    const rows = new Map((data as AdmissionRow[]).map(row => [row.id, row]));
    if (data.some(row => row.status !== "active")) gate = await openSpeedTriviaAdmission({ elapsedMs: timeLeft(), signal });
    for (const id of ids) {
      signal.throwIfAborted();
      gate?.budget.assertTime();
      const row = rows.get(id);
      if (!row) { recordRow({ id, outcome: "unresolved", code: "missing", reason: "This question is no longer in the loaded Speed Trivia selection. Refresh Question Review." }); continue; }
      if (row.status === "active") { recordRow({ id, outcome: "approved" }); continue; }
      emit({ type: "checking", id, question: row.question.slice(0, 2_000) });
      try {
        await approveSpeedTrivia(row, gate);
        recordRow({ id, outcome: "approved" });
      } catch (error) {
        const failure = speedTriviaError(error);
        if (["duplicate", "uncertain", "retired"].includes(failure.code)) { recordRow(describe(id, error)); continue; }
        // A timeout may follow a committed save. Reconcile once, without rechecking.
        if (failure.code !== "budget_exhausted" && failure.code !== "cancelled") recordRow(describe(id, error));
        throw error;
      }
    }
  } catch (error) {
    const failure = speedTriviaError(error);
    final = failure.code === "budget_exhausted"
      ? { ok: true, paused: true, code: failure.code, needsRecovery: true }
      : { ok: false, code: failure.code, needsRecovery: true, error: "Checking stopped. Saved approvals are kept; unresolved and unchecked questions remain pending." };
  }
  const examined = new Set([...savedIds, ...repeats.map(row => row.id), ...holds.map(row => row.id)]);
  emit({ type: "complete", result: { ...final, ok: final.ok ?? false, savedIds, repeats, holds, notProcessed: ids.filter(id => !examined.has(id)) } });
};
