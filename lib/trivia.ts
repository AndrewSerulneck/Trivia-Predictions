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

export async function getTriviaQuestions(limit = 10): Promise<TriviaQuestion[]> {
  if (!supabaseAdmin) {
    return FALLBACK_QUESTIONS.slice(0, limit);
  }

  const { data, error } = await supabaseAdmin
    .from("trivia_questions")
    .select("id, question, options, correct_answer, category, difficulty")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) {
    return FALLBACK_QUESTIONS.slice(0, limit);
  }

  return data.map((row) => mapQuestionRow(row as TriviaQuestionRow));
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
}): Promise<{ isCorrect: boolean; correctAnswer: number; saved: boolean }> {
  const question = await getQuestionById(params.questionId);
  if (!question) {
    throw new Error("Question not found.");
  }

  const isCorrect = params.answer === question.correctAnswer;
  const safeTimeElapsed = Number.isFinite(params.timeElapsed) ? Math.max(0, Math.round(params.timeElapsed)) : 0;
  let saved = false;

  if (supabaseAdmin && params.userId) {
    const { error: answerError } = await supabaseAdmin.from("trivia_answers").insert({
      user_id: params.userId,
      question_id: params.questionId,
      answer: params.answer,
      is_correct: isCorrect,
      time_elapsed: safeTimeElapsed,
    });

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
