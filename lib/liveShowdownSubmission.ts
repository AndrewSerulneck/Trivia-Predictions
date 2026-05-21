import "server-only";

import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import { parseLargePureNumberAnswer } from "@/lib/liveShowdownClosestGuess";
import { getLiveShowdownState } from "@/lib/liveShowdownEngine";
import { gradeWriteInAnswer, normalizeWriteInForStorage } from "@/lib/liveShowdownGrading";
import { trackLiveShowdownQuestionExposure } from "@/lib/liveShowdown";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const LIVE_SHOWDOWN_POINTS_PER_CORRECT = 10;

type TriviaSessionQuestionRow = {
  question_id: string;
};

type TriviaQuestionRow = {
  id: string;
  slug: string | null;
  options: unknown;
  correct_answer: number;
  question_pool: "anytime_blitz" | "live_showdown";
};

type ExistingAnswerRow = {
  id: string;
  is_correct: boolean;
  points_awarded: number;
};

type UserVenueRow = {
  venue_id: string | null;
};

type ScheduleVenueRow = {
  venue_id: string | null;
};

export type SubmitLiveShowdownAnswerParams = {
  userId: string;
  venueId: string;
  scheduleId: string;
  roundNumber: number;
  questionIndex: number;
  submittedAnswer: string;
};

export type SubmitLiveShowdownAnswerResult = {
  accepted: boolean;
  isCorrect: boolean;
  pointsAwarded: number;
  alreadySubmitted: boolean;
  activePhase: "answering";
  normalizedAnswer: string;
  pendingClosestGuess: boolean;
};

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim());
}

async function getCorrectAnswerForScheduleSlot(
  scheduleId: string,
  roundNumber: number,
  questionIndex: number
): Promise<{ questionId: string; correctTarget: string; closestGuessEligible: boolean }> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: slotRow, error: slotError } = await supabaseAdmin
    .from("trivia_session_questions")
    .select("question_id")
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex)
    .limit(1)
    .maybeSingle();

  if (slotError) {
    throw new Error(slotError.message || "Failed to resolve session question slot.");
  }
  const sessionSlot = (slotRow as TriviaSessionQuestionRow | null) ?? null;
  if (!sessionSlot?.question_id) {
    throw new Error("No question mapped to this schedule slot.");
  }

  const questionSlugOrId = String(sessionSlot.question_id).trim();
  if (!questionSlugOrId) {
    throw new Error("Mapped question id is empty.");
  }

  const bySlug = await supabaseAdmin
    .from("trivia_questions")
    .select("id, slug, options, correct_answer, question_pool")
    .eq("slug", questionSlugOrId)
    .limit(1)
    .maybeSingle();

  if (bySlug.error) {
    throw new Error(bySlug.error.message || "Failed to load Live Showdown question.");
  }

  let question = (bySlug.data as TriviaQuestionRow | null) ?? null;
  if (!question && isUuidLike(questionSlugOrId)) {
    const byId = await supabaseAdmin
      .from("trivia_questions")
      .select("id, slug, options, correct_answer, question_pool")
      .eq("id", questionSlugOrId)
      .limit(1)
      .maybeSingle();

    if (byId.error) {
      throw new Error(byId.error.message || "Failed to load Live Showdown question by id.");
    }
    question = (byId.data as TriviaQuestionRow | null) ?? null;
  }

  if (!question) {
    throw new Error("Mapped Live Showdown question was not found.");
  }

  const options = coerceOptions(question.options);
  const answerIndex = Number.isInteger(question.correct_answer) ? question.correct_answer : -1;
  const correctTarget =
    answerIndex >= 0 && answerIndex < options.length
      ? String(options[answerIndex] ?? "").trim()
      : "";

  if (!correctTarget) {
    throw new Error("Live Showdown question has no valid correct target.");
  }

  return {
    questionId: String(question.slug ?? question.id),
    correctTarget,
    closestGuessEligible: parseLargePureNumberAnswer(correctTarget) !== null,
  };
}

async function awardTriviaPointsForLiveShowdown(userId: string, basePoints: number): Promise<number> {
  if (!supabaseAdmin || basePoints <= 0) {
    return 0;
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .select("points, venue_id")
    .eq("id", userId)
    .limit(1)
    .maybeSingle<{ points: number; venue_id: string | null }>();

  if (userError) {
    throw new Error(userError.message || "Failed to load user points.");
  }

  let pointsAwarded = basePoints;
  const venueId = String(userRow?.venue_id ?? "").trim();
  if (venueId) {
    const campaignResult = await applyChallengeCampaignPoints({
      userId,
      venueId,
      gameType: "trivia",
      basePoints,
    }).catch(() => null);

    if (campaignResult) {
      pointsAwarded = Math.max(0, Number(campaignResult.finalPoints ?? basePoints));
    }
  }

  const nextPoints = Math.max(0, Number(userRow?.points ?? 0) + pointsAwarded);
  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({ points: nextPoints })
    .eq("id", userId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to update user points.");
  }

  return pointsAwarded;
}

export async function submitLiveShowdownAnswer(
  params: SubmitLiveShowdownAnswerParams
): Promise<SubmitLiveShowdownAnswerResult> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const scheduleId = String(params.scheduleId ?? "").trim();
  const submittedAnswer = String(params.submittedAnswer ?? "").trim();
  const roundNumber = Math.floor(Number(params.roundNumber));
  const questionIndex = Math.floor(Number(params.questionIndex));

  if (!userId || !venueId || !scheduleId || !submittedAnswer) {
    throw new Error("userId, venueId, scheduleId, roundNumber, questionIndex, and submittedAnswer are required.");
  }
  if (!Number.isFinite(roundNumber) || roundNumber < 1 || !Number.isFinite(questionIndex) || questionIndex < 1 || questionIndex > 15) {
    throw new Error("roundNumber and questionIndex are invalid.");
  }

  const { data: userVenueData, error: userVenueError } = await supabaseAdmin
    .from("users")
    .select("venue_id")
    .eq("id", userId)
    .limit(1)
    .maybeSingle<UserVenueRow>();

  if (userVenueError) {
    throw new Error(userVenueError.message || "Failed to resolve user's active venue.");
  }
  const userVenueId = String(userVenueData?.venue_id ?? "").trim();
  if (!userVenueId || userVenueId !== venueId) {
    throw new Error("User venue does not match this Live Showdown venue.");
  }

  const { data: scheduleVenueData, error: scheduleVenueError } = await supabaseAdmin
    .from("trivia_schedules")
    .select("venue_id")
    .eq("id", scheduleId)
    .limit(1)
    .maybeSingle<ScheduleVenueRow>();

  if (scheduleVenueError) {
    throw new Error(scheduleVenueError.message || "Failed to resolve Live Showdown schedule venue.");
  }
  const scheduleVenueId = String(scheduleVenueData?.venue_id ?? "").trim();
  if (!scheduleVenueId || scheduleVenueId !== venueId) {
    throw new Error("Schedule venue does not match this Live Showdown venue.");
  }

  const state = await getLiveShowdownState(Date.now(), venueId);
  if (!state.isGameActive) {
    throw new Error("No Live Showdown game is currently active.");
  }
  if (state.scheduleId !== scheduleId || state.currentRound !== roundNumber || state.currentQuestionIndex !== questionIndex) {
    throw new Error("Submission does not match the currently active schedule slot.");
  }
  if (state.activePhase !== "answering") {
    throw new Error("Submissions are only accepted during the answering phase.");
  }

  const { questionId, correctTarget, closestGuessEligible } = await getCorrectAnswerForScheduleSlot(
    scheduleId,
    roundNumber,
    questionIndex
  );

  const { data: existingRow, error: existingError } = await supabaseAdmin
    .from("live_showdown_answers")
    .select("id, is_correct, points_awarded")
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "Failed to check existing answer submission.");
  }
  const existing = (existingRow as ExistingAnswerRow | null) ?? null;
  if (existing) {
    return {
      accepted: true,
      isCorrect: Boolean(existing.is_correct),
      pointsAwarded: Math.max(0, Number(existing.points_awarded ?? 0)),
      alreadySubmitted: true,
      activePhase: "answering",
      normalizedAnswer: normalizeWriteInForStorage(submittedAnswer),
      pendingClosestGuess: closestGuessEligible && Math.max(0, Number(existing.points_awarded ?? 0)) === 0,
    };
  }
  const normalizedAnswer = normalizeWriteInForStorage(submittedAnswer);
  const isCorrect = closestGuessEligible ? false : gradeWriteInAnswer(submittedAnswer, correctTarget);

  await trackLiveShowdownQuestionExposure([userId], questionId);

  const insertRow = {
    user_id: userId,
    schedule_id: scheduleId,
    question_id: questionId,
    round_number: roundNumber,
    question_index: questionIndex,
    submitted_answer: submittedAnswer,
    normalized_answer: normalizedAnswer,
    is_correct: isCorrect,
    points_awarded: 0,
  };

  const { error: insertError } = await supabaseAdmin
    .from("live_showdown_answers")
    .insert(insertRow);

  if (insertError?.code === "23505") {
    const { data: conflictRow } = await supabaseAdmin
      .from("live_showdown_answers")
      .select("id, is_correct, points_awarded")
      .eq("user_id", userId)
      .eq("schedule_id", scheduleId)
      .eq("round_number", roundNumber)
      .eq("question_index", questionIndex)
      .limit(1)
      .maybeSingle();

    const conflict = (conflictRow as ExistingAnswerRow | null) ?? null;
    return {
      accepted: true,
      isCorrect: Boolean(conflict?.is_correct),
      pointsAwarded: Math.max(0, Number(conflict?.points_awarded ?? 0)),
      alreadySubmitted: true,
      activePhase: "answering",
      normalizedAnswer,
      pendingClosestGuess: closestGuessEligible && Math.max(0, Number(conflict?.points_awarded ?? 0)) === 0,
    };
  }

  if (insertError) {
    throw new Error(insertError.message || "Failed to save Live Showdown answer.");
  }

  let pointsAwarded = 0;
  if (isCorrect) {
    pointsAwarded = await awardTriviaPointsForLiveShowdown(userId, LIVE_SHOWDOWN_POINTS_PER_CORRECT);
    if (pointsAwarded > 0) {
      const { error: awardedUpdateError } = await supabaseAdmin
        .from("live_showdown_answers")
        .update({ points_awarded: pointsAwarded })
        .eq("user_id", userId)
        .eq("schedule_id", scheduleId)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex);

      if (awardedUpdateError) {
        throw new Error(awardedUpdateError.message || "Failed to finalize awarded points for answer.");
      }
    }
  }

  return {
    accepted: true,
    isCorrect,
    pointsAwarded,
    alreadySubmitted: false,
    activePhase: "answering",
    normalizedAnswer,
    pendingClosestGuess: closestGuessEligible,
  };
}
