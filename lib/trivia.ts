import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomInt } from "node:crypto";
import type { TriviaQuestion } from "@/types";

type TriviaQuestionRow = {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
};

type TriviaAnswerLookupRow = {
  id: string;
  question_id: string;
  is_correct: boolean;
};

type UserRow = {
  id: string;
  username: string;
};

const MAX_CANDIDATE_QUESTIONS = 2000;
const TRIVIA_LIMIT_PER_WINDOW = 45;
const WINDOW_MS = 60 * 60 * 1000;

export type TriviaQuota = {
  limit: number;
  questionsUsed: number;
  questionsRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass: boolean;
};

export class TriviaLimitReachedError extends Error {
  quota: TriviaQuota;

  constructor(message: string, quota: TriviaQuota) {
    super(message);
    this.name = "TriviaLimitReachedError";
    this.quota = quota;
  }
}

const FALLBACK_QUESTIONS: TriviaQuestion[] = [
  {
    id: "fallback-1",
    question: "Which planet in our solar system is known as the Red Planet?",
    options: ["Mars", "Jupiter", "Venus", "Mercury"],
    correctAnswer: 0,
    category: "Science",
    difficulty: "easy",
  },
  {
    id: "fallback-2",
    question: "What year did the first iPhone launch?",
    options: ["2005", "2007", "2009", "2011"],
    correctAnswer: 1,
    category: "Technology",
    difficulty: "medium",
  },
  {
    id: "fallback-3",
    question: "Which city hosts the Eiffel Tower?",
    options: ["Rome", "Berlin", "Madrid", "Paris"],
    correctAnswer: 3,
    category: "Geography",
    difficulty: "easy",
  },
];

function mapQuestionRow(row: TriviaQuestionRow): TriviaQuestion {
  return {
    id: row.id,
    question: row.question,
    options: row.options,
    correctAnswer: row.correct_answer,
    category: row.category ?? undefined,
    difficulty: row.difficulty ?? undefined,
  };
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function categoryKey(category?: string): string {
  const value = category?.trim();
  return value && value.length > 0 ? value : "uncategorized";
}

function pickBalancedRandomQuestions(questions: TriviaQuestion[], limit: number): TriviaQuestion[] {
  if (questions.length <= limit) {
    return shuffleInPlace([...questions]);
  }

  const buckets = new Map<string, TriviaQuestion[]>();
  for (const question of questions) {
    const key = categoryKey(question.category);
    const existing = buckets.get(key) ?? [];
    existing.push(question);
    buckets.set(key, existing);
  }

  for (const bucket of buckets.values()) {
    shuffleInPlace(bucket);
  }

  const selected: TriviaQuestion[] = [];
  let keys = shuffleInPlace([...buckets.keys()]);
  let cursor = 0;

  while (selected.length < limit && keys.length > 0) {
    if (cursor >= keys.length) {
      cursor = 0;
      keys = shuffleInPlace(keys);
    }

    const key = keys[cursor];
    const bucket = buckets.get(key) ?? [];
    const nextQuestion = bucket.pop();

    if (!nextQuestion) {
      keys.splice(cursor, 1);
      continue;
    }

    selected.push(nextQuestion);
    cursor += 1;
  }

  return selected;
}

export async function getTriviaQuestions(limit = 15, userId?: string): Promise<TriviaQuestion[]> {
  const client = supabaseAdmin;
  if (!client) {
    return pickBalancedRandomQuestions(FALLBACK_QUESTIONS, limit);
  }

  const safeLimit = Math.max(1, Math.min(limit, 100));
  let answeredQuestionIds = new Set<string>();

  if (userId) {
    const { data: answersData, error: answersError } = await client
      .from("trivia_answers")
      .select("question_id")
      .eq("user_id", userId)
      .limit(MAX_CANDIDATE_QUESTIONS * 5);

    if (answersError) {
      return pickBalancedRandomQuestions(FALLBACK_QUESTIONS, safeLimit);
    }

    answeredQuestionIds = new Set(
      (answersData ?? [])
        .map((row) => (row as { question_id?: string }).question_id)
        .filter((value): value is string => Boolean(value))
    );
  }

  const queryLimit = Math.min(MAX_CANDIDATE_QUESTIONS, Math.max(safeLimit * 40, 480));

  const { count: totalQuestionCount, error: countError } = await client
    .from("trivia_questions")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return pickBalancedRandomQuestions(FALLBACK_QUESTIONS, safeLimit);
  }

  const total = Math.max(0, totalQuestionCount ?? 0);
  if (total === 0) {
    return pickBalancedRandomQuestions(FALLBACK_QUESTIONS, safeLimit);
  }

  const candidatesById = new Map<string, TriviaQuestionRow>();
  if (total <= queryLimit) {
    const { data, error } = await client
      .from("trivia_questions")
      .select("id, question, options, correct_answer, category, difficulty")
      .range(0, total - 1);
    if (error || !data) {
      return pickBalancedRandomQuestions(FALLBACK_QUESTIONS, safeLimit);
    }
    for (const row of data) {
      const typed = row as TriviaQuestionRow;
      candidatesById.set(typed.id, typed);
    }
  } else {
    const windowCount = 4;
    const minWindow = Math.max(220, safeLimit * 12);
    const windowSize = Math.min(
      Math.max(minWindow, Math.ceil(queryLimit / windowCount)),
      MAX_CANDIDATE_QUESTIONS
    );
    const maxOffset = Math.max(0, total - windowSize);
    const offsets = [0];
    for (let index = 0; index < windowCount; index += 1) {
      offsets.push(maxOffset > 0 ? randomInt(maxOffset + 1) : 0);
    }

    const windows = await Promise.all(
      offsets.map((offset) =>
        client
          .from("trivia_questions")
          .select("id, question, options, correct_answer, category, difficulty")
          .range(offset, offset + windowSize - 1)
      )
    );

    for (const result of windows) {
      if (result.error || !result.data) {
        continue;
      }
      for (const row of result.data) {
        const typed = row as TriviaQuestionRow;
        candidatesById.set(typed.id, typed);
      }
    }
  }

  const candidateRows = [...candidatesById.values()];
  if (candidateRows.length === 0) {
    return pickBalancedRandomQuestions(FALLBACK_QUESTIONS, safeLimit);
  }

  const mapped = shuffleInPlace(candidateRows.map((row) => mapQuestionRow(row)));
  if (!userId) {
    return pickBalancedRandomQuestions(mapped, safeLimit);
  }

  const unseen = mapped.filter((question) => !answeredQuestionIds.has(question.id));
  if (unseen.length >= safeLimit) {
    return pickBalancedRandomQuestions(unseen, safeLimit);
  }

  const seen = mapped.filter((question) => answeredQuestionIds.has(question.id));
  const pickedUnseen = pickBalancedRandomQuestions(unseen, safeLimit);
  const remaining = Math.max(0, safeLimit - pickedUnseen.length);
  const pickedSeen = remaining > 0 ? pickBalancedRandomQuestions(seen, remaining) : [];
  return shuffleInPlace([...pickedUnseen, ...pickedSeen]).slice(0, safeLimit);
}

export async function getTriviaQuota(
  userId: string,
  options: { forceAdminBypass?: boolean } = {}
): Promise<TriviaQuota> {
  const emptyQuota: TriviaQuota = {
    limit: TRIVIA_LIMIT_PER_WINDOW,
    questionsUsed: 0,
    questionsRemaining: TRIVIA_LIMIT_PER_WINDOW,
    windowSecondsRemaining: 0,
    isAdminBypass: false,
  };

  if (!userId || !supabaseAdmin) {
    return emptyQuota;
  }

  if (options.forceAdminBypass) {
    return {
      ...emptyQuota,
      isAdminBypass: true,
    };
  }

  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("id, username")
    .eq("id", userId)
    .maybeSingle<UserRow>();

  const cutoffIso = new Date(Date.now() - WINDOW_MS).toISOString();
  const userIdsForQuota = [userId];
  if (userData?.username) {
    const { data: usernameMatches } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username", userData.username)
      .limit(200);
    for (const row of usernameMatches ?? []) {
      const candidateId = (row as { id?: string }).id;
      if (candidateId && !userIdsForQuota.includes(candidateId)) {
        userIdsForQuota.push(candidateId);
      }
    }
  }

  let answersQuery = supabaseAdmin
    .from("trivia_answers")
    .select("answered_at")
    .gte("answered_at", cutoffIso)
    .order("answered_at", { ascending: true })
    .limit(TRIVIA_LIMIT_PER_WINDOW + 1);
  if (userIdsForQuota.length === 1) {
    answersQuery = answersQuery.eq("user_id", userIdsForQuota[0]);
  } else {
    answersQuery = answersQuery.in("user_id", userIdsForQuota);
  }
  const { data, error } = await answersQuery;

  if (error || !data) {
    return emptyQuota;
  }

  const questionsUsed = data.length;
  const questionsRemaining = Math.max(0, TRIVIA_LIMIT_PER_WINDOW - questionsUsed);
  let windowSecondsRemaining = 0;
  if (questionsRemaining === 0 && data[0]?.answered_at) {
    const oldestIncluded = new Date(data[0].answered_at).getTime();
    const resetAt = oldestIncluded + WINDOW_MS;
    windowSecondsRemaining = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  }

  return {
    limit: TRIVIA_LIMIT_PER_WINDOW,
    questionsUsed,
    questionsRemaining,
    windowSecondsRemaining,
    isAdminBypass: false,
  };
}

async function getQuestionById(questionId: string): Promise<TriviaQuestion | null> {
  if (!questionId) {
    return null;
  }

  if (!supabaseAdmin) {
    return FALLBACK_QUESTIONS.find((question) => question.id === questionId) ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("trivia_questions")
    .select("id, question, options, correct_answer, category, difficulty")
    .eq("id", questionId)
    .maybeSingle<TriviaQuestionRow>();

  if (error || !data) {
    return FALLBACK_QUESTIONS.find((question) => question.id === questionId) ?? null;
  }

  return mapQuestionRow(data);
}

export async function submitTriviaAnswer(params: {
  userId?: string;
  questionId: string;
  answer: number;
  timeElapsed: number;
  forceAdminBypass?: boolean;
}): Promise<{ isCorrect: boolean; correctAnswer: number; saved: boolean; alreadyAnswered?: boolean }> {
  const question = await getQuestionById(params.questionId);
  if (!question) {
    throw new Error("Question not found.");
  }

  const isCorrect = params.answer === question.correctAnswer;
  const safeTimeElapsed = Number.isFinite(params.timeElapsed) ? Math.max(0, Math.round(params.timeElapsed)) : 0;
  let saved = false;

  if (supabaseAdmin && params.userId) {
    const quota = await getTriviaQuota(params.userId, { forceAdminBypass: params.forceAdminBypass });
    if (!quota.isAdminBypass && quota.questionsRemaining <= 0) {
      const minutes = Math.floor(quota.windowSecondsRemaining / 60);
      const seconds = quota.windowSecondsRemaining % 60;
      const countdown = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      throw new TriviaLimitReachedError(
        `Trivia limit reached (${TRIVIA_LIMIT_PER_WINDOW}). Try again in ${countdown}.`,
        quota
      );
    }

    const { data: existingAnswer, error: existingAnswerError } = await supabaseAdmin
      .from("trivia_answers")
      .select("id, question_id, is_correct")
      .eq("user_id", params.userId)
      .eq("question_id", params.questionId)
      .maybeSingle<TriviaAnswerLookupRow>();

    if (!existingAnswerError && existingAnswer) {
      return {
        isCorrect: existingAnswer.is_correct,
        correctAnswer: question.correctAnswer,
        saved: false,
        alreadyAnswered: true,
      };
    }

    const { error: answerError } = await supabaseAdmin.from("trivia_answers").insert({
      user_id: params.userId,
      question_id: params.questionId,
      answer: params.answer,
      is_correct: isCorrect,
      time_elapsed: safeTimeElapsed,
    });

    if (answerError && answerError.code === "23505") {
      return {
        isCorrect,
        correctAnswer: question.correctAnswer,
        saved: false,
        alreadyAnswered: true,
      };
    }

    if (!answerError) {
      saved = true;

      if (isCorrect) {
        const { data: userData } = await supabaseAdmin
          .from("users")
          .select("points")
          .eq("id", params.userId)
          .maybeSingle<{ points: number }>();

        const nextPoints = (userData?.points ?? 0) + 10;
        await supabaseAdmin.from("users").update({ points: nextPoints }).eq("id", params.userId);
      }
    }
  }

  return {
    isCorrect,
    correctAnswer: question.correctAnswer,
    saved,
  };
}
