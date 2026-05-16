import "server-only";

import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type TriviaQuestionPool = "anytime_blitz" | "live_showdown";

export type RawQuestionBankItem = {
  id?: string;
  slug?: string;
  question?: string;
  options?: unknown;
  correctAnswer?: number;
  correct_answer?: number;
  answer?: string | number;
  correctAnswerText?: string | number;
  correct_answer_text?: string | number;
  [key: string]: unknown;
};

export type SplitQuestionPools = {
  anytimeBlitzPool: RawQuestionBankItem[];
  liveShowdownPool: RawQuestionBankItem[];
  discardedForLiveShowdown: RawQuestionBankItem[];
};

type TriviaQuestionRow = {
  id: string;
  slug: string | null;
  question: string;
  options: string[];
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
  question_pool: TriviaQuestionPool;
};

const MAX_CANDIDATE_QUESTIONS = 2500;

function shuffleInPlace<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function normalizeAnswerText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function isStandaloneNumber(answer: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?$/.test(answer);
}

function countWords(answer: string): number {
  if (!answer) return 0;
  return answer
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
}

function resolveAnswerString(question: RawQuestionBankItem): string {
  const directAnswer =
    question.correctAnswerText ??
    question.correct_answer_text ??
    question.answer;

  if (directAnswer !== undefined && directAnswer !== null && String(directAnswer).trim().length > 0) {
    return normalizeAnswerText(directAnswer);
  }

  const options = Array.isArray(question.options) ? question.options : [];
  const idxRaw = question.correctAnswer ?? question.correct_answer;
  const idx = Number(idxRaw);
  if (Number.isInteger(idx) && idx >= 0 && idx < options.length) {
    return normalizeAnswerText(options[idx]);
  }

  return "";
}

export function isLiveShowdownAnswerAllowed(answerRaw: unknown): boolean {
  const answer = normalizeAnswerText(answerRaw);
  if (!answer) {
    return false;
  }

  if (isStandaloneNumber(answer)) {
    return true;
  }

  return countWords(answer) <= 2;
}

export function splitQuestionBankByMode(questions: RawQuestionBankItem[]): SplitQuestionPools {
  const anytimeBlitzPool: RawQuestionBankItem[] = [];
  const liveShowdownPool: RawQuestionBankItem[] = [];
  const discardedForLiveShowdown: RawQuestionBankItem[] = [];

  for (const question of questions) {
    anytimeBlitzPool.push(question);

    const answerString = resolveAnswerString(question);
    if (isLiveShowdownAnswerAllowed(answerString)) {
      liveShowdownPool.push(question);
      continue;
    }

    discardedForLiveShowdown.push(question);
  }

  return {
    anytimeBlitzPool,
    liveShowdownPool,
    discardedForLiveShowdown,
  };
}

export async function getAnytimeBlitzQuestions(userId: string, count: number): Promise<TriviaQuestionRow[]> {
  if (!supabaseAdmin || !userId) {
    return [];
  }

  const safeCount = Math.max(1, Math.min(Math.floor(count), 100));

  const { data: seenRows, error: seenError } = await supabaseAdmin
    .from("user_seen_questions")
    .select("question_id")
    .eq("user_id", userId)
    .limit(MAX_CANDIDATE_QUESTIONS * 4);

  if (seenError) {
    throw new Error(seenError.message || "Failed to load seen question history.");
  }

  const seenQuestionIds = new Set(
    (seenRows ?? [])
      .map((row) => String((row as { question_id?: string }).question_id ?? "").trim())
      .filter(Boolean)
  );

  const queryLimit = Math.max(300, safeCount * 20);
  const { data: questionRows, error: questionError } = await supabaseAdmin
    .from("trivia_questions")
    .select("id, slug, question, options, correct_answer, category, difficulty, question_pool")
    .eq("question_pool", "anytime_blitz")
    .limit(queryLimit);

  if (questionError) {
    throw new Error(questionError.message || "Failed to load Anytime Blitz questions.");
  }

  const candidates = (questionRows ?? []) as TriviaQuestionRow[];
  const unseen = candidates.filter((row) => {
    const immutableQuestionId = String(row.slug ?? row.id).trim();
    return immutableQuestionId.length > 0 && !seenQuestionIds.has(immutableQuestionId);
  });

  return shuffleInPlace(unseen).slice(0, safeCount);
}

export async function trackLiveShowdownQuestionExposure(userIds: string[], questionId: string): Promise<void> {
  if (!supabaseAdmin) {
    return;
  }

  const normalizedQuestionId = String(questionId ?? "").trim();
  if (!normalizedQuestionId) {
    return;
  }

  const dedupedUserIds = Array.from(
    new Set(
      (userIds ?? [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (dedupedUserIds.length === 0) {
    return;
  }

  const rows = dedupedUserIds.map((userId) => ({
    user_id: userId,
    question_id: normalizedQuestionId,
  }));

  const { error } = await supabaseAdmin
    .from("user_seen_questions")
    .upsert(rows, { onConflict: "user_id,question_id", ignoreDuplicates: true });

  if (error) {
    throw new Error(error.message || "Failed to track Live Showdown question exposure.");
  }
}
