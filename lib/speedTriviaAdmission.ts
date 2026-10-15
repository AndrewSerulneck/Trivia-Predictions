import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AdmissionError, createBudget, createSession } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { AdmissionRow, AdmissionSession } from "@/types/speedTriviaAdmission";
import type { SpeedIndex } from "@/types/speedTriviaUniqueness";

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
        const fresh = await createSession({ client: supabaseAdmin!, cachedIndex, cache: pairCache, budget: session.budget, prerequisitesChecked: true });
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
      const fresh = await createSession({ client: supabaseAdmin!, cachedIndex, cache: pairCache, budget: session.budget, prerequisitesChecked: true });
      try { const result = await fresh.leave(patch, existing); cachedIndex = fresh.index(); return result; }
      catch (error) { cachedIndex = error instanceof AdmissionError && error.code === "verification_unavailable" ? null : fresh.index(); throw error; }
    });
    return session;
  });
  return budget ? budget.limit(opening) : opening;
};
export const writeSpeedTrivia = async (patch: Record<string, unknown>, existing: AdmissionRow | null = null, session?: AdmissionSession): Promise<AdmissionRow> => {
  const gate = session ?? await openSpeedTriviaAdmission();
  return (await gate.write(patch, { existing })).row;
};
// Manual approval compares only with questions already available to players.
// Edits, new generation and imports continue to use the complete fact bank.
export const approveSpeedTrivia = async (existing: AdmissionRow, session?: AdmissionSession): Promise<AdmissionRow> => {
  const gate = session ?? await openSpeedTriviaAdmission();
  return (await gate.write({ status: "active" }, { existing, approvedOnly: true })).row;
};
export const convertSpeedTriviaToLive = async (patch: Record<string, unknown>, existing: AdmissionRow, session?: AdmissionSession): Promise<AdmissionRow> => {
  const gate = session ?? await openSpeedTriviaAdmission();
  return gate.leave(patch, existing);
};
export const speedTriviaError = (error: unknown) => error instanceof AdmissionError
  ? { status: ["duplicate", "uncertain", "retired"].includes(error.code) ? 409 : 503, code: error.code, conflicts: error.evidence?.matchedRowIds ?? [] }
  : { status: 500, code: "write_failed", conflicts: [] };
