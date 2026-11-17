// Player report reasons (Phase 4c.7, D32), shared by the Report sheet and POST /api/trivia/report.
// The codes match the `question_reports_reason` check in supabase/migrations/20261117040723_question_reports.sql.

export type QuestionReportGame = "speed" | "live";

export type QuestionReportReason = "wrong_answer" | "two_right" | "my_answer_right" | "confusing" | "typo" | "other";

export type QuestionReportReasonOption = { code: QuestionReportReason; label: string };

export const QUESTION_REPORT_REASONS: Record<QuestionReportGame, readonly QuestionReportReasonOption[]> = {
  speed: [
    { code: "wrong_answer", label: "Wrong answer" },
    { code: "two_right", label: "Two right answers" },
    { code: "confusing", label: "Confusing" },
    { code: "typo", label: "Typo" },
    { code: "other", label: "Other" },
  ],
  live: [
    { code: "my_answer_right", label: "My answer was right" },
    { code: "wrong_answer", label: "Wrong answer" },
    { code: "confusing", label: "Confusing" },
    { code: "typo", label: "Typo" },
    { code: "other", label: "Other" },
  ],
};

export const QUESTION_REPORT_NOTE_MAX = 200;

export const isQuestionReportGame = (value: unknown): value is QuestionReportGame => value === "speed" || value === "live";

export const isReasonForGame = (game: QuestionReportGame, reason: unknown): reason is QuestionReportReason =>
  QUESTION_REPORT_REASONS[game].some((option) => option.code === reason);
