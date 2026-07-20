// Shared type-scale helper for the Live Trivia TV question typography.
//
// TvQuestionReveal (Prompt A) and TvAnswerReveal (Prompt I) both render the
// question text, and TvAnswerReveal's demotion animation must start at
// EXACTLY the size TvQuestionReveal left on screen or the handoff visibly
// jumps. Extracted here (per the author's own flagged drift risk) so the two
// can never independently drift out of sync.

export type QuestionTypeScale = { size: number; leading: number };

/** Question type scales down as it gets longer so it always fills the frame. */
export function questionType(len: number): QuestionTypeScale {
  if (len <= 60) return { size: 108, leading: 1.06 };
  if (len <= 110) return { size: 90, leading: 1.08 };
  if (len <= 170) return { size: 74, leading: 1.12 };
  return { size: 60, leading: 1.16 };
}
