import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TAG_MODEL, tagOne } from "@/lib/question-variety/tagging.cjs";
import type { TagRow } from "@/lib/question-variety/tagging.cjs";
import type { AdmissionRow } from "@/types/speedTriviaAdmission";

// The star cap needs every question's subject before it can be approved (docs/speed-trivia-backlog-and-quality-plan.md
// Phases 4a.1, 4c.1). The logic lives once, in tagOne (lib/question-variety/tagging.cjs), shared with the scripts.
// One Gemini call (~$0.0001) per question, only for a question without a tag. Best effort: a failure never blocks
// anything; an untagged question just stays waiting.

const ADMIN_SAVE = `gemini:${TAG_MODEL}:admin-save-v1`;
const QUICK_KEEP = `gemini:${TAG_MODEL}:quick-keep-v1`;
/** Quick Keep tags at most this many questions per request (a bulk Keep shares one allowance across its pages). */
export const QUICK_KEEP_TAG_LIMIT = 25;
const TAG_CONCURRENCY = 4;

export const tagSpeedQuestion = async (row: AdmissionRow, transport: typeof fetch = fetch, taggedBy = ADMIN_SAVE): Promise<boolean> =>
  tagOne({ client: supabaseAdmin, row, apiKey: process.env.GEMINI_API_KEY, transport, taggedBy });

// Phase 4c.8 (post-4c.4 review #4): an edit to an approved question is tagged BEFORE the save, so a move into a full
// subject is refused with nothing saved. Same single Gemini call; the tag is written after the save.

/** The tag this content would get, without writing it. Null on any failure (never throws). */
export const computeSpeedTag = (row: AdmissionRow, transport: typeof fetch = fetch): Promise<TagRow | null> =>
  tagOne({ client: supabaseAdmin, row, apiKey: process.env.GEMINI_API_KEY, transport, taggedBy: ADMIN_SAVE, write: false });

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

/** How many more questions this request may tag. Shared across the pages of one bulk Keep. */
export type TagAllowance = { left: number };
export const tagAllowance = (): TagAllowance => ({ left: QUICK_KEEP_TAG_LIMIT });

/**
 * Quick Keep: tag the batch's waiting Speed questions that have no tag, before the signed Keep. Two indexed reads
 * (question_tags, then the untagged rows), then one Gemini call each, 4 at a time, at most `allowance.left` in all.
 * Never throws; a question still untagged gets the 'untagged' outcome from the Keep as before. Returns how many were tagged.
 */
export const tagUntaggedSpeedQuestions = async (ids: string[], allowance: TagAllowance, transport: typeof fetch = fetch): Promise<number> => {
  if (!supabaseAdmin || ids.length === 0 || allowance.left <= 0 || !process.env.GEMINI_API_KEY) return 0;
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
        const row = todo[next++];
        if (await tagSpeedQuestion(row, transport, QUICK_KEEP)) done++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(TAG_CONCURRENCY, todo.length) }, worker));
    return done;
  } catch {
    return 0;
  }
};
