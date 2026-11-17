import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  QUESTION_REPORT_NOTE_MAX,
  isReasonForGame,
  type QuestionReportGame,
  type QuestionReportReason,
} from "@/lib/questionReportReasons";

// Player reports of a bad question (Phase 4c.7 of docs/speed-trivia-backlog-and-quality-plan.md, D32).
// Server-only table `question_reports`. The note is untrusted player text: it is never logged.
// Cost per report: 2 small indexed reads (question, answer) and 1 insert.
// The 24 h limit and the one-per-question rule live in the insert trigger (migration
// 20261117142126_question_reports_daily_limit.sql, post-4c.4 review #8), so a burst can't beat them.

/** Must match the number in the trigger (tests/question-reports-limit-contract.test.ts). */
export const QUESTION_REPORT_DAILY_LIMIT = 20;
const LIMIT_ERROR = "question-report-limit";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_FORFEIT = "__FORFEIT__";

export type QuestionReportInput = {
  userId: string;
  game: QuestionReportGame;
  /** Speed: the trivia_questions id. */
  questionId?: string;
  /** Live: the trivia_questions slug the Live state serves as `questionId`. */
  slug?: string;
  reason: unknown;
  note?: unknown;
};

export type QuestionReportOutcome = { ok: true } | { ok: false; status: 400 | 403 | 404 | 429 | 500; error: string };

const fail = (status: 400 | 403 | 404 | 429 | 500, error: string): QuestionReportOutcome => ({ ok: false, status, error });

/** Cuts to `max` characters (code points, as Postgres `char_length` counts). */
const cut = (value: string, max: number) => Array.from(value).slice(0, max).join("");

// C0/C1 controls (newlines and tabs included) and bidi overrides become spaces; runs of spaces collapse.
const CONTROL = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;

export const cleanReportNote = (raw: unknown): string =>
  cut(String(raw ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim(), QUESTION_REPORT_NOTE_MAX).trim();

const cleanPlayerAnswer = (raw: unknown): string | null => cleanReportNote(raw) || null;

export const submitQuestionReport = async (input: QuestionReportInput): Promise<QuestionReportOutcome> => {
  const { userId, game } = input;
  // 1. The reason is valid for the game.
  if (!isReasonForGame(game, input.reason)) return fail(400, "Pick a reason.");
  const reason: QuestionReportReason = input.reason;
  const note = reason === "other" ? cleanReportNote(input.note) : null;
  if (reason === "other" && !note) return fail(400, "Add a note.");

  const admin = supabaseAdmin;
  if (!admin) return fail(500, "Reports are unavailable.");

  // Resolve the question, and 2. the player has answered it (this read also gives player_answer).
  let questionId: string;
  let playerAnswer: string | null;
  if (game === "speed") {
    questionId = String(input.questionId ?? "").trim();
    if (!UUID.test(questionId)) return fail(400, "Question not found.");
    const { data: question, error: questionError } = await admin
      .from("trivia_questions")
      .select("id, options")
      .eq("id", questionId)
      .eq("question_pool", "anytime_blitz")
      .maybeSingle();
    if (questionError) return fail(500, "Couldn't send. Try again.");
    if (!question) return fail(404, "Question not found.");
    const { data: answer, error: answerError } = await admin
      .from("trivia_answers")
      .select("answer")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .order("answered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (answerError) return fail(500, "Couldn't send. Try again.");
    if (!answer) return fail(403, "Answer it first.");
    const options = Array.isArray(question.options) ? (question.options as unknown[]) : [];
    const stored = Number(answer.answer);
    // trivia_answers.answer is the stored index (D31); -1 is a time-out.
    playerAnswer = Number.isInteger(stored) && stored >= 0 && stored < options.length ? cleanPlayerAnswer(options[stored]) : null;
  } else {
    const slug = String(input.slug ?? "").trim();
    if (!slug || slug.length > 200) return fail(400, "Question not found.");
    const { data: question, error: questionError } = await admin
      .from("trivia_questions")
      .select("id")
      .eq("slug", slug)
      .eq("question_pool", "live_showdown")
      .maybeSingle();
    if (questionError) return fail(500, "Couldn't send. Try again.");
    if (!question) return fail(404, "Question not found.");
    questionId = String(question.id);
    const { data: answer, error: answerError } = await admin
      .from("live_showdown_answers")
      .select("submitted_answer")
      .eq("user_id", userId)
      .eq("question_id", slug)
      .order("answered_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (answerError) return fail(500, "Couldn't send. Try again.");
    if (!answer) return fail(403, "Answer it first.");
    const submitted = String(answer.submitted_answer ?? "");
    playerAnswer = submitted === LIVE_FORFEIT ? null : cleanPlayerAnswer(submitted);
  }

  // 3. One per player per question (a second report is skipped and still replies "Sent."), and at most 20 per player
  // per rolling 24 hours. The trigger enforces both.
  const { error: insertError } = await admin.from("question_reports").upsert(
    { question_id: questionId, game, user_id: userId, reason, note, player_answer: playerAnswer },
    { onConflict: "user_id,question_id", ignoreDuplicates: true },
  );
  if (insertError) {
    if (String(insertError.message ?? "").includes(LIMIT_ERROR)) return fail(429, "Try again later.");
    console.error("[question-reports] insert failed", insertError.code ?? "unknown");
    return fail(500, "Couldn't send. Try again.");
  }
  return { ok: true };
};
