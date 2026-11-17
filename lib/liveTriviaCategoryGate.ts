import { CURRENT_EVENTS, CURRENT_EVENTS_MIN_QUESTIONS } from "@/lib/live-trivia-quality/categories.cjs";
import { parseLargePureNumberAnswer } from "@/lib/liveShowdownClosestGuess";

// Live Trivia categories held back until they can fill rounds (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c,
// D11): Current Events is offered as a round only once it has ≥ 45 questions. Expired entries are pruned from the
// database by the importer (D16), so the active count is the unexpired count.
const MIN_QUESTIONS: ReadonlyMap<string, number> = new Map([[CURRENT_EVENTS.toLowerCase(), CURRENT_EVENTS_MIN_QUESTIONS]]);

export const liveCategoryMinimum = (category: string): number => MIN_QUESTIONS.get(category.trim().toLowerCase()) ?? 0;

export const isLiveCategoryOffered = (category: string, activeCount: number): boolean => activeCount >= liveCategoryMinimum(category);

/** The categories with a minimum, as stored (D11). */
export const GATED_LIVE_CATEGORIES: readonly string[] = [CURRENT_EVENTS];

// The answer rule the round builder seeds by: an answer of ≤ 2 words, or a number. One copy, so the admin dropdown's
// gate count and the builder agree on what can fill a round (Phase 4c.3, review #8).
export const getLiveTriviaCorrectAnswer = (row: { options: unknown; correct_answer: number | null }): string => {
  const options = Array.isArray(row.options) ? row.options.map((entry) => String(entry ?? "").trim()) : [];
  const answerIndex = Number.isInteger(row.correct_answer) ? Number(row.correct_answer) : -1;
  if (answerIndex < 0 || answerIndex >= options.length) return "";
  return options[answerIndex] ?? "";
};

export const countAnswerWords = (answer: string): number =>
  answer ? answer.split(/\s+/).map((part) => part.trim()).filter(Boolean).length : 0;

export const isLiveTriviaSeedAnswerAllowed = (answerRaw: unknown): boolean => {
  const answer = String(answerRaw ?? "").trim().replace(/\s+/g, " ");
  if (!answer) return false;
  if (parseLargePureNumberAnswer(answer) !== null) return true;
  return countAnswerWords(answer) <= 2;
};
