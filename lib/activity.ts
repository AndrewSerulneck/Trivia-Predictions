import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserPredictions } from "@/lib/userPredictions";
import type { PredictionStatus } from "@/types";

export type ActivityItem = {
  id: string;
  timestamp: string;
  type: "trivia" | "prediction";
  title: string;
  detail: string;
  predictionStatus?: PredictionStatus;
  isResolved?: boolean;
};

type TriviaAnswerRow = {
  id: string;
  is_correct: boolean;
  answered_at: string;
  question_id: string;
  trivia_questions: { question: string } | { question: string }[] | null;
};

function getQuestionText(value: TriviaAnswerRow["trivia_questions"]): string {
  if (!value) {
    return "Trivia question";
  }
  if (Array.isArray(value)) {
    return value[0]?.question ?? "Trivia question";
  }
  return value.question ?? "Trivia question";
}

export async function getUserActivity(userId: string): Promise<ActivityItem[]> {
  if (!userId) {
    return [];
  }

  const activityItems: ActivityItem[] = [];

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("trivia_answers")
      .select("id, is_correct, answered_at, question_id, trivia_questions(question)")
      .eq("user_id", userId)
      .order("answered_at", { ascending: false })
      .limit(25);

    for (const row of (data ?? []) as TriviaAnswerRow[]) {
      activityItems.push({
        id: `trivia-${row.id}`,
        timestamp: row.answered_at,
        type: "trivia",
        title: row.is_correct ? "Trivia answered correctly" : "Trivia answered incorrectly",
        detail: getQuestionText(row.trivia_questions),
      });
    }
  }

  const predictions = await getUserPredictions(userId);
  for (const prediction of predictions) {
    const isResolved = prediction.status !== "pending";
    const timestamp = prediction.resolvedAt ?? prediction.createdAt;
    activityItems.push({
      id: `prediction-${prediction.id}`,
      timestamp,
      type: "prediction",
      title: isResolved
        ? `Prediction resolved: ${prediction.outcomeTitle}`
        : `Prediction pick: ${prediction.outcomeTitle}`,
      detail: isResolved
        ? `${prediction.points} points at stake · final status ${prediction.status}`
        : `${prediction.points} potential points · status pending`,
      predictionStatus: prediction.status,
      isResolved,
    });
  }

  return activityItems.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)).slice(0, 50);
}
