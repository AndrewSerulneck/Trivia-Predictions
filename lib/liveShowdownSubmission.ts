import "server-only";

import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import { parseLargePureNumberAnswer } from "@/lib/liveShowdownClosestGuess";
import { getLiveShowdownState } from "@/lib/liveShowdownEngine";
import { gradeWriteInAnswerWithVariants, normalizeWriteInForStorage } from "@/lib/liveShowdownGrading";
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

let supportsOccurrenceDateColumn: boolean | null = null;
let hasLoggedOccurrenceDateFallback = false;

function isMissingOccurrenceDateColumnError(message: string | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  return normalized.includes("occurrence_date") && normalized.includes("does not exist");
}

function logOccurrenceDateFallbackOnce(scope: string): void {
  if (hasLoggedOccurrenceDateFallback) return;
  hasLoggedOccurrenceDateFallback = true;
  console.warn(`[live-trivia][occurrence-compat] Falling back to legacy answer schema in ${scope} (missing occurrence_date column).`);
}

async function runOccurrenceCompatibleQuery(
  scope: string,
  withOccurrence: () => PromiseLike<any>,
  withoutOccurrence: () => PromiseLike<any>
): Promise<any> {
  if (supportsOccurrenceDateColumn === false) {
    return withoutOccurrence();
  }

  const withResult = await withOccurrence();
  if (withResult.error && isMissingOccurrenceDateColumnError(withResult.error.message ?? undefined)) {
    supportsOccurrenceDateColumn = false;
    logOccurrenceDateFallbackOnce(scope);
    return withoutOccurrence();
  }

  if (!withResult.error) {
    supportsOccurrenceDateColumn = true;
  }
  return withResult;
}

export type SubmitLiveShowdownAnswerParams = {
  userId: string;
  venueId: string;
  scheduleId: string;
  roundNumber: number;
  questionIndex: number;
  submittedAnswer: string;
  occurrenceDate?: string; // YYYY-MM-DD hint from client; server always derives authoritative value
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

function normalizeAnswerKey(value: string): string {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function resolveAdditionalAcceptableAnswers(options: string[], correctAnswerIndex: number): {
  targets: string[];
  indexes: number[];
} {
  const canonical = options[correctAnswerIndex] ?? "";
  const seen = new Set([normalizeAnswerKey(canonical)]);
  const targets: string[] = [];
  const indexes: number[] = [];

  options.forEach((option, index) => {
    if (index === correctAnswerIndex) return;
    const answer = String(option ?? "").trim();
    const key = normalizeAnswerKey(answer);
    if (!answer || !key || seen.has(key)) return;
    seen.add(key);
    targets.push(answer);
    indexes.push(index);
  });

  return { targets, indexes };
}

async function getCorrectAnswerForScheduleSlot(
  scheduleId: string,
  roundNumber: number,
  questionIndex: number,
  occurrenceDate: string
): Promise<{
  questionId: string;
  questionDbId: string;
  correctTarget: string;
  correctAnswerIndex: number;
  acceptableTargets: string[];
  acceptableAnswerIndexes: number[];
  closestGuessEligible: boolean;
}> {
  const admin = supabaseAdmin;
  if (!admin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: slotRow, error: slotError } = await runOccurrenceCompatibleQuery(
    "getCorrectAnswerForScheduleSlot",
    () =>
      admin
        .from("trivia_session_questions")
        .select("question_id")
        .eq("schedule_id", scheduleId)
        .eq("occurrence_date", occurrenceDate)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex)
        .limit(1)
        .maybeSingle(),
    () =>
      admin
        .from("trivia_session_questions")
        .select("question_id")
        .eq("schedule_id", scheduleId)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex)
        .limit(1)
        .maybeSingle()
  );

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

  const bySlug = await admin
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
    const byId = await admin
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
  const additionalAnswers = resolveAdditionalAcceptableAnswers(options, answerIndex);

  return {
    questionId: String(question.slug ?? question.id),
    questionDbId: String(question.id),
    correctTarget,
    correctAnswerIndex: answerIndex,
    acceptableTargets: additionalAnswers.targets,
    acceptableAnswerIndexes: additionalAnswers.indexes,
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
      gameType: "live-trivia",
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
  const admin = supabaseAdmin;
  if (!admin) {
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

  const { data: userVenueData, error: userVenueError } = await admin
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

  const state = await getLiveShowdownState(Date.now(), venueId);
  if (!state.isGameActive) {
    throw new Error("No Live Showdown game is currently active.");
  }
  if (state.activePhase !== "answering") {
    throw new Error("Submissions are only accepted during the answering phase.");
  }
  const authoritativeScheduleId = String(state.scheduleId ?? "").trim();
  const authoritativeRoundNumber = Number(state.currentRound);
  const authoritativeQuestionIndex = Number(state.currentQuestionIndex);
  if (!authoritativeScheduleId || !Number.isFinite(authoritativeRoundNumber) || !Number.isFinite(authoritativeQuestionIndex)) {
    throw new Error("Live Showdown answering slot is unavailable.");
  }

  if (
    scheduleId !== authoritativeScheduleId ||
    roundNumber !== authoritativeRoundNumber ||
    questionIndex !== authoritativeQuestionIndex
  ) {
    console.warn(
      `[live-trivia][submission] Client slot mismatch ignored for user ${userId}: ` +
        `client=${scheduleId}/${roundNumber}/${questionIndex} server=${authoritativeScheduleId}/${authoritativeRoundNumber}/${authoritativeQuestionIndex}`
    );
  }

  const effectiveScheduleId = authoritativeScheduleId;
  const effectiveRoundNumber = authoritativeRoundNumber;
  const effectiveQuestionIndex = authoritativeQuestionIndex;

  const { data: scheduleVenueData, error: scheduleVenueError } = await admin
    .from("trivia_schedules")
    .select("venue_id")
    .eq("id", effectiveScheduleId)
    .limit(1)
    .maybeSingle<ScheduleVenueRow>();

  if (scheduleVenueError) {
    throw new Error(scheduleVenueError.message || "Failed to resolve Live Showdown schedule venue.");
  }
  const scheduleVenueId = String(scheduleVenueData?.venue_id ?? "").trim();
  if (!scheduleVenueId || scheduleVenueId !== venueId) {
    throw new Error("Schedule venue does not match this Live Showdown venue.");
  }

  // Use the server-derived occurrence date from the active game state — never trust
  // the client-supplied hint for anything that writes to the DB.
  const occurrenceDate = state.occurrenceDate;

  const {
    questionId,
    questionDbId,
    correctTarget,
    correctAnswerIndex,
    acceptableTargets,
    acceptableAnswerIndexes,
    closestGuessEligible,
  } =
    await getCorrectAnswerForScheduleSlot(effectiveScheduleId, effectiveRoundNumber, effectiveQuestionIndex, occurrenceDate);

  const { data: existingRow, error: existingError } = await runOccurrenceCompatibleQuery(
    "submitLiveShowdownAnswer:existing_check",
    () =>
      admin
        .from("live_showdown_answers")
        .select("id, is_correct, points_awarded")
        .eq("user_id", userId)
        .eq("schedule_id", effectiveScheduleId)
        .eq("occurrence_date", occurrenceDate)
        .eq("round_number", effectiveRoundNumber)
        .eq("question_index", effectiveQuestionIndex)
        .limit(1)
        .maybeSingle(),
    () =>
      admin
        .from("live_showdown_answers")
        .select("id, is_correct, points_awarded")
        .eq("user_id", userId)
        .eq("schedule_id", effectiveScheduleId)
        .eq("round_number", effectiveRoundNumber)
        .eq("question_index", effectiveQuestionIndex)
        .limit(1)
        .maybeSingle()
  );

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
  const isCorrect = closestGuessEligible
    ? false
    : await gradeWriteInAnswerWithVariants(
        submittedAnswer,
        correctTarget,
        questionDbId,
        correctAnswerIndex,
        acceptableTargets,
        acceptableAnswerIndexes
      );

  await trackLiveShowdownQuestionExposure([userId], questionId);

  const insertRowWithOccurrence = {
    user_id: userId,
    schedule_id: effectiveScheduleId,
    occurrence_date: occurrenceDate,
    question_id: questionId,
    round_number: effectiveRoundNumber,
    question_index: effectiveQuestionIndex,
    submitted_answer: submittedAnswer,
    normalized_answer: normalizedAnswer,
    is_correct: isCorrect,
    points_awarded: 0,
  };
  const insertRowLegacy = {
    user_id: userId,
    schedule_id: effectiveScheduleId,
    question_id: questionId,
    round_number: effectiveRoundNumber,
    question_index: effectiveQuestionIndex,
    submitted_answer: submittedAnswer,
    normalized_answer: normalizedAnswer,
    is_correct: isCorrect,
    points_awarded: 0,
  };

  const { error: insertError } = await runOccurrenceCompatibleQuery(
    "submitLiveShowdownAnswer:insert",
    () => admin.from("live_showdown_answers").insert(insertRowWithOccurrence),
    () => admin.from("live_showdown_answers").insert(insertRowLegacy)
  );

  if (insertError?.code === "23505") {
    const { data: conflictRow } = await runOccurrenceCompatibleQuery(
      "submitLiveShowdownAnswer:conflict_lookup",
      () =>
        admin
          .from("live_showdown_answers")
          .select("id, is_correct, points_awarded")
          .eq("user_id", userId)
          .eq("schedule_id", effectiveScheduleId)
          .eq("occurrence_date", occurrenceDate)
          .eq("round_number", effectiveRoundNumber)
          .eq("question_index", effectiveQuestionIndex)
          .limit(1)
          .maybeSingle(),
      () =>
        admin
          .from("live_showdown_answers")
          .select("id, is_correct, points_awarded")
          .eq("user_id", userId)
          .eq("schedule_id", effectiveScheduleId)
          .eq("round_number", effectiveRoundNumber)
          .eq("question_index", effectiveQuestionIndex)
          .limit(1)
          .maybeSingle()
    );

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
      const { error: awardedUpdateError } = await runOccurrenceCompatibleQuery(
        "submitLiveShowdownAnswer:award_update",
        () =>
          admin
            .from("live_showdown_answers")
            .update({ points_awarded: pointsAwarded })
            .eq("user_id", userId)
            .eq("schedule_id", effectiveScheduleId)
            .eq("occurrence_date", occurrenceDate)
            .eq("round_number", effectiveRoundNumber)
            .eq("question_index", effectiveQuestionIndex),
        () =>
          admin
            .from("live_showdown_answers")
            .update({ points_awarded: pointsAwarded })
            .eq("user_id", userId)
            .eq("schedule_id", effectiveScheduleId)
            .eq("round_number", effectiveRoundNumber)
            .eq("question_index", effectiveQuestionIndex)
      );

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
