import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AdmissionError, createBudget, createSession } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import { contentHash } from "@/lib/speed-trivia-uniqueness/core.cjs";
import { computeSpeedTag, readSpeedSubjectKey, speedSubjectHasRoom, tagSpeedQuestion, writeSpeedTag } from "@/lib/speedTriviaTagging";
import type { TagRow } from "@/lib/question-variety/tagging.cjs";
import { recordUsage } from "@/lib/openai/ledger.cjs";
import type { ModelUsage } from "@/lib/openai/ledger.cjs";
import type { AdmissionRow, AdmissionSession } from "@/types/speedTriviaAdmission";
import type { SpeedIndex, SpeedQuestion } from "@/types/speedTriviaUniqueness";

let cachedIndex: SpeedIndex | null = null;
const pairCache = new Map<string, unknown>();
let tail: Promise<unknown> = Promise.resolve();
// Serialize index mutations inside this server process. Database revision checks
// remain authoritative across other servers, nightly jobs and direct callers.
const serialized = <T,>(operation: () => Promise<T>): Promise<T> => {
  const result = tail.then(operation, operation);
  tail = result.catch(() => undefined);
  return result;
};

// The signing key is server-only. Its absence disables Speed writes; Live stays usable.
export const findTriviaAdmissionRow = async (identifier: string): Promise<AdmissionRow | null> => {
  if (!supabaseAdmin) throw new AdmissionError("verification_unavailable", "Supabase admin client is not configured.");
  const field = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(identifier) ? "id" : "slug";
  const { data, error } = await supabaseAdmin.from("trivia_questions").select("*").eq(field, identifier).maybeSingle();
  if (error) throw new AdmissionError("verification_unavailable", "Could not load the current question.");
  return data as AdmissionRow | null;
};
export const openSpeedTriviaAdmission = (options?: { elapsedMs: number; signal?: AbortSignal }): Promise<AdmissionSession> => {
  if (!supabaseAdmin) throw new AdmissionError("verification_unavailable", "Supabase admin client is not configured.");
  // Start the deadline before waiting for another local request. Keep the same
  // approved dollar ceiling, including retries and all items in this request.
  const budget = options ? createBudget({ dollars: Number(process.env.SPEED_TRIVIA_MAX_DOLLARS), elapsedMs: options.elapsedMs, signal: options.signal }) : undefined;
  const opening = serialized(async () => {
    budget?.assertTime();
    const session = await createSession({ client: supabaseAdmin!, cachedIndex, cache: pairCache, budget });
    try { await session.refresh(); } catch (error) { cachedIndex = null; throw error; }
    cachedIndex = session.index();
    session.write = (row, options) => {
      const writing = serialized(async () => {
        session.budget.assertTime();
        // Another local request may have advanced the shared index since this session opened.
        // D5: rows rejected in Quick Review as dull or obscure don't block new wording of their fact.
        const fresh = await createSession({ client: supabaseAdmin!, cachedIndex, cache: pairCache, budget: session.budget, releasedRows: "read" });
        try {
          const result = await fresh.write(row, options);
          cachedIndex = fresh.index();
          session.index = fresh.index;
          session.corpus = fresh.corpus;
          if (pairCache.size > 20000) pairCache.clear();
          return result;
        } catch (error) {
          cachedIndex = error instanceof AdmissionError && error.code === "verification_unavailable" ? null : fresh.index();
          session.index = fresh.index;
          session.corpus = fresh.corpus;
          throw error;
        }
      });
      return budget ? budget.limit(writing) : writing;
    };
    session.leave = (patch, existing) => serialized(async () => {
      const fresh = await createSession({ client: supabaseAdmin!, cachedIndex, cache: pairCache, budget: session.budget });
      try { const result = await fresh.leave(patch, existing); cachedIndex = fresh.index(); return result; }
      catch (error) { cachedIndex = error instanceof AdmissionError && error.code === "verification_unavailable" ? null : fresh.index(); throw error; }
    });
    return session;
  });
  return budget ? budget.limit(opening) : opening;
};
// Phase 4f.2: what a session's checks spent since it was last recorded, as one ledger row per model (none when no paid
// call was made). A session can serve several saves (bulk Keep), so only the difference is written each time.
const recordedSpend = new WeakMap<object, Record<string, ModelUsage>>();
const recordSpend = async (session: AdmissionSession) => {
  try {
    const now = (session.budget.summary().byModel ?? {}) as Record<string, ModelUsage>;
    const before = recordedSpend.get(session.budget) ?? {};
    recordedSpend.set(session.budget, now);
    const delta = Object.fromEntries(Object.entries(now).map(([model, entry]) => {
      const old = before[model] ?? { calls: 0, inputTokens: 0, outputTokens: 0, dollars: 0 };
      return [model, { calls: entry.calls - old.calls, inputTokens: entry.inputTokens - old.inputTokens, outputTokens: entry.outputTokens - old.outputTokens, dollars: entry.dollars - old.dollars }];
    }));
    await recordUsage(supabaseAdmin, { feature: "speed_question_checks", byModel: delta, metadata: { source: "admin" } });
  } catch {
    // The ledger never fails a save.
  }
};
const recorded = async <T,>(session: AdmissionSession, attempt: () => Promise<T>): Promise<T> => {
  try { return await attempt(); } finally { await recordSpend(session); }
};
// Phase 4a.1 star cap: approval needs a subject tag. An untagged question is tagged once (one OpenAI call) and retried;
// if tagging fails, the 'untagged' refusal stands and the question stays waiting. `tagged` says it tagged (Phase 4c.1),
// so a save doesn't tag the same content a second time.
const withTag = async <T,>(row: AdmissionRow, attempt: () => Promise<T>): Promise<{ result: T; tagged: boolean }> => {
  try {
    return { result: await attempt(), tagged: false };
  } catch (error) {
    if (!(error instanceof AdmissionError) || error.code !== "untagged" || !(await tagSpeedQuestion(row))) throw error;
    return { result: await attempt(), tagged: true };
  }
};
const changedContent = (saved: AdmissionRow, existing: AdmissionRow | null) => {
  if (!existing || existing.question_pool !== "anytime_blitz") return true;
  const hash = (row: AdmissionRow) => contentHash({ ...row, category: row.category ?? "" } as SpeedQuestion);
  try { return hash(saved) !== hash(existing); } catch { return true; }
};
const isActiveSpeed = (row: AdmissionRow | null) => row?.question_pool === "anytime_blitz" && row.status === "active";
export const writeSpeedTrivia = async (patch: Record<string, unknown>, existing: AdmissionRow | null = null, session?: AdmissionSession): Promise<AdmissionRow> => {
  const gate = session ?? await openSpeedTriviaAdmission();
  const prospective = { ...(existing ?? {}), ...patch } as AdmissionRow;
  // Phase 4c.8 (post-4c.4 review #4, D15): the star cap is checked only when a row BECOMES active, so an edit that
  // keeps an approved question approved is tagged before the save. A move into a subject with 5 other approved
  // questions is refused ('subject_full', 409) with nothing saved. Still one OpenAI call per save; if it fails, the
  // save goes ahead and is tagged after it instead (Phase 7g, R2 #20.2: no early return keeping the old subject).
  // The tag trigger (guard_speed_question_tag) stays the binding check.
  let earlyTag: TagRow | null = null;
  const tagBeforeSave = Boolean(existing && isActiveSpeed(existing) && isActiveSpeed(prospective) && changedContent(prospective, existing));
  if (tagBeforeSave && existing) {
    earlyTag = await computeSpeedTag(prospective);
    if (earlyTag && earlyTag.subject_key !== await readSpeedSubjectKey(existing.id)
      && await speedSubjectHasRoom(earlyTag.subject_key, existing.id) === false) {
      throw new AdmissionError("subject_full", "Subject full.");
    }
  }
  const { result, tagged } = await recorded(gate, () => withTag(prospective, () => gate.write(patch, { existing })));
  const saved = result.row;
  if (tagBeforeSave && earlyTag) {
    if (saved) await writeSpeedTag(earlyTag);
    return saved;
  }
  // Admin add/edit: a new question, or new content, gets its subject tag now (best effort; never blocks the save),
  // unless withTag just tagged this content (one OpenAI call per save, Phase 4c.1). An edit whose early tag failed
  // lands here too, so it isn't left with its old subject (a second call only after the first failed).
  if (!tagged && saved?.question_pool === "anytime_blitz" && changedContent(saved, existing)) await tagSpeedQuestion(saved);
  return saved;
};
// Manual approval compares only with questions already available to players.
// An edit that keeps a live question live does too (D38); other edits, new generation and imports use the complete fact bank.
export const approveSpeedTrivia = async (existing: AdmissionRow, session?: AdmissionSession): Promise<AdmissionRow> => {
  const gate = session ?? await openSpeedTriviaAdmission();
  return (await recorded(gate, () => withTag(existing, () => gate.write({ status: "active" }, { existing, approvedOnly: true })))).result.row;
};
export const convertSpeedTriviaToLive = async (patch: Record<string, unknown>, existing: AdmissionRow, session?: AdmissionSession): Promise<AdmissionRow> => {
  const gate = session ?? await openSpeedTriviaAdmission();
  return gate.leave(patch, existing);
};
// A question's own state that stops its approval (409). subject_full and untagged come from the star cap (Phase 4a.1).
export const speedTriviaError = (error: unknown) => error instanceof AdmissionError
  ? { status: ["duplicate", "uncertain", "retired", "subject_full", "untagged"].includes(error.code) ? 409 : 503, code: error.code, conflicts: error.evidence?.matchedRowIds ?? [] }
  : { status: 500, code: "write_failed", conflicts: [] };
