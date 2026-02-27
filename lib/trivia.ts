import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

export async function getTriviaQuestions(limit = 10, userId?: string): Promise<TriviaQuestion[]> {
  if (!supabaseAdmin) {
    return FALLBACK_QUESTIONS.slice(0, limit);
  }

  const safeLimit = Math.max(1, Math.min(limit, 100));
  let answeredQuestionIds = new Set<string>();

  if (userId) {
    const { data: answersData, error: answersError } = await supabaseAdmin
      .from("trivia_answers")
      .select("question_id")
      .eq("user_id", userId)
      .limit(5000);

    if (answersError) {
      return FALLBACK_QUESTIONS.slice(0, safeLimit);
    }

    answeredQuestionIds = new Set(
      (answersData ?? [])
        .map((row) => (row as { question_id?: string }).question_id)
        .filter((value): value is string => Boolean(value))
    );
  }

  const queryLimit = userId ? Math.max(safeLimit * 5, 100) : safeLimit;
  const { data, error } = await supabaseAdmin
    .from("trivia_questions")
    .select("id, question, options, correct_answer, category, difficulty")
    .order("created_at", { ascending: false })
    .limit(queryLimit);

  if (error || !data) {
    return FALLBACK_QUESTIONS.slice(0, safeLimit);
  }

  const mapped = data.map((row) => mapQuestionRow(row as TriviaQuestionRow));
  if (!userId) {
    return mapped.slice(0, safeLimit);
  }

  return mapped
    .filter((question) => !answeredQuestionIds.has(question.id))
    .slice(0, safeLimit);
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
}): Promise<{ isCorrect: boolean; correctAnswer: number; saved: boolean; alreadyAnswered?: boolean }> {
  const question = await getQuestionById(params.questionId);
  if (!question) {
    throw new Error("Question not found.");
  }

  const isCorrect = params.answer === question.correctAnswer;
  const safeTimeElapsed = Number.isFinite(params.timeElapsed) ? Math.max(0, Math.round(params.timeElapsed)) : 0;
  let saved = false;

  if (supabaseAdmin && params.userId) {
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
