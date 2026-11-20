import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TAG_MODEL, tagOne } from "@/lib/question-variety/tagging.cjs";
import type { TagRow } from "@/lib/question-variety/tagging.cjs";
import type { AdmissionRow } from "@/types/speedTriviaAdmission";

// The star cap needs every question's subject before it can be approved (docs/speed-trivia-backlog-and-quality-plan.md
// Phases 4a.1, 4c.1). The logic lives once, in tagOne (lib/question-variety/tagging.cjs), shared with the scripts.
// One OpenAI call (gpt-6.1-sol, ~$0.003-$0.006) per question, only for a question without a tag. Best effort: a failure
// never blocks anything; an untagged question just stays waiting. Phase 7e (R2 #29.4): each call has a total deadline,
// retries included, that fits its route.


const ADMIN_SAVE = `openai:${TAG_MODEL}:admin-save-v1`;
const QUICK_KEEP = `openai:${TAG_MODEL}:quick-keep-v1`;
/** Quick Keep tags at most this many questions per request (a bulk Keep shares one allowance across its pages). */
export const QUICK_KEEP_TAG_LIMIT = 25;
const TAG_CONCURRENCY = 4;
/** Phase 7e: one Admin save's tag call, retries included (its route allows 300 s). */
export const ADMIN_TAG_DEADLINE_MS = 45_000;
/** Phase 7e: all of one Quick Keep request's tagging (route maxDuration 120 s), leaving room for the Keep itself. */
export const QUICK_KEEP_TAG_MS = 90_000;
/** A tag call isn't started with less time than this left. */
const MIN_TAG_MS = 2_000;

export const tagSpeedQuestion = async (row: AdmissionRow, transport: typeof fetch = fetch, taggedBy = ADMIN_SAVE,
  deadlineMs = ADMIN_TAG_DEADLINE_MS): Promise<boolean> =>
  tagOne({ client: supabaseAdmin, row, apiKey: process.env.OPENAI_API_KEY, transport, taggedBy, deadlineMs });

// Phase 4c.8 (post-4c.4 review #4): an edit to an approved question is tagged BEFORE the save, so a move into a full
// subject is refused with nothing saved. Same single OpenAI call; the tag is written after the save.

/** The tag this content would get, without writing it. Null on any failure (never throws). */
export const computeSpeedTag = (row: AdmissionRow, transport: typeof fetch = fetch): Promise<TagRow | null> =>
  tagOne({ client: supabaseAdmin, row, apiKey: process.env.OPENAI_API_KEY, transport, taggedBy: ADMIN_SAVE, write: false,
    deadlineMs: ADMIN_TAG_DEADLINE_MS });

/** The subject the question is tagged with now; null when untagged or unreadable. One indexed read. */
export const readSpeedSubjectKey = async (rowId: string): Promise<string | null> => {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from("question_tags").select("subject_key")
    .eq("game", "speed").eq("question_ref", rowId).maybeSingle<{ subject_key: string | null }>();
  return error ? null : data?.subject_key ?? null;
};

/** False only when the database says 5 other approved questions already share the subject. Null if it can't say. */
export const speedSubjectHasRoom = async (subjectKey: string, rowId: string): Promise<boolean | null> => {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.rpc("speed_trivia_subject_has_room", { p_subject_key: subjectKey, p_row_id: rowId });
  return error || typeof data !== "boolean" ? null : data;
};

/**
 * Write a tag computed by computeSpeedTag. The tag trigger (guard_speed_question_tag) still binds: if another save
 * filled the subject in the meantime, the old tag stays and this logs. Never throws.
 */
export const writeSpeedTag = async (tag: TagRow): Promise<boolean> => {
  if (!supabaseAdmin) return false;
  try {
    const { error } = await supabaseAdmin.from("question_tags").upsert([tag], { onConflict: "game,question_ref" });
    if (error && /\bstar-cap\b/.test(error.message ?? "")) console.warn("Tag not changed: subject full.", { questionId: tag.question_ref });
    return !error;
  } catch {
    return false;
  }
};

/**
 * How many more questions this request may tag, and until when (epoch ms). Shared across the pages of one bulk Keep,
 * so tagging can't stretch the request past its time limit (Phase 7e, R2 #29.4).
 */
export type TagAllowance = { left: number; until: number };
export const tagAllowance = (now: () => number = Date.now): TagAllowance => ({ left: QUICK_KEEP_TAG_LIMIT, until: now() + QUICK_KEEP_TAG_MS });

/**
 * Quick Keep: tag the batch's waiting Speed questions that have no tag, before the signed Keep. Two indexed reads
 * (question_tags, then the untagged rows), then one OpenAI call each, 4 at a time, at most `allowance.left` in all,
 * none started after `allowance.until`, each cut off at it.
 * Never throws; a question still untagged gets the 'untagged' outcome from the Keep as before. Returns how many were tagged.
 */
export const tagUntaggedSpeedQuestions = async (ids: string[], allowance: TagAllowance, transport: typeof fetch = fetch,
  now: () => number = Date.now): Promise<number> => {
  if (!supabaseAdmin || ids.length === 0 || allowance.left <= 0 || allowance.until - now() < MIN_TAG_MS || !process.env.OPENAI_API_KEY) return 0;
  const client = supabaseAdmin;
  try {
    const { data: tags, error } = await client.from("question_tags").select("question_ref, subject_key")
      .eq("game", "speed").in("question_ref", ids);
    if (error) return 0;
    // Same rule as speed_trivia_star_cap_state: no row, or no subject_key, is untagged.
    const tagged = new Set((tags ?? []).filter((tag) => tag.subject_key).map((tag) => String(tag.question_ref)));
    const missing = ids.filter((id) => !tagged.has(id));
    if (missing.length === 0) return 0;
    const { data: rows, error: rowError } = await client.from("trivia_questions")
      .select("id, question, options, correct_answer, category, question_pool, created_at")
      .in("id", missing).eq("question_pool", "anytime_blitz").eq("status", "pending_review");
    if (rowError || !Array.isArray(rows)) return 0;
    const order = new Map(missing.map((id, i) => [id, i]));
    const todo = (rows as AdmissionRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).slice(0, allowance.left);
    allowance.left -= todo.length;
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < todo.length) {
        const timeLeft = allowance.until - now();
        if (timeLeft < MIN_TAG_MS) return;
        const row = todo[next++];
        if (await tagSpeedQuestion(row, transport, QUICK_KEEP, timeLeft)) done++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(TAG_CONCURRENCY, todo.length) }, worker));
    return done;
  } catch {
    return 0;
  }
};
