import "server-only";

import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import {
  buildClosestGuessAnnouncement,
  computeClosestGuessWinners,
  parseLargePureNumberAnswer,
} from "@/lib/liveShowdownClosestGuess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const QUESTIONS_PER_ROUND = 15;
const QUESTION_BLOCK_MS = 45_000;
const ANSWERING_MS = 30_000;
const REST_WARNING_MS = 15_000;
const QUESTION_WINDOW_MS = QUESTIONS_PER_ROUND * QUESTION_BLOCK_MS; // 11 min 15 sec
const ROUND_MS = 20 * 60_000; // 20 min
const MID_GAME_BREAK_MS = ROUND_MS - QUESTION_WINDOW_MS; // 8 min 45 sec

export type LiveShowdownPhase = "answering" | "rest_warning" | "mid_game_break";

type TriviaScheduleRow = {
  id: string;
  title: string;
  start_time: string;
  timezone: string;
  recurring_type: "none" | "daily" | "weekly" | "monthly" | "yearly" | null;
  recurring_days: string[] | null;
  num_rounds: number;
  venue_id: string | null;
  intermission_ad_delay_seconds: number | null;
  lobby_ad_enabled: boolean | null;
};

type TriviaSessionQuestionRow = {
  id: string;
  schedule_id: string;
  question_id: string;
  round_number: number;
  question_index: number;
};

type TriviaQuestionRow = {
  id: string;
  slug: string | null;
  question: string;
  options: unknown;
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
  question_pool: "anytime_blitz" | "live_showdown";
};

export type LiveShowdownQuestionPublic = {
  id: string;
  questionId: string;
  question: string;
  options: string[];
  category: string | null;
  difficulty: string | null;
  roundNumber: number;
  questionIndex: number;
  isClosestGuess: boolean;
};

type LiveShowdownQuestionInternal = LiveShowdownQuestionPublic & {
  correctAnswer: string | null;
  correctNumericAnswer: number | null;
};

type LiveShowdownViewerResult = {
  userId: string;
  scheduleId: string;
  roundNumber: number;
  questionIndex: number;
  submittedAnswer: string;
  isCorrect: boolean;
  pointsAwarded: number;
  pendingClosestGuess: boolean;
};

type LiveShowdownActiveState = {
  isGameActive: true;
  scheduleId: string;
  scheduleTitle: string;
  scheduleTimezone: string;
  scheduleStartTime: string;
  intermissionAdDelaySeconds: number;
  lobbyAdEnabled: boolean;
  totalRounds: number;
  currentRound: number;
  currentQuestionIndex: number | null;
  activePhase: LiveShowdownPhase;
  secondsRemaining: number;
  activeQuestion: LiveShowdownQuestionPublic | null;
  revealedAnswer: string | null;
  emceeAnnouncement: string | null;
  viewerResult: LiveShowdownViewerResult | null;
  isFinalResultsWindow: boolean;
  currentRoundCategory: string | null;
  upcomingRoundNumber: number | null;
  upcomingRoundCategory: string | null;
};

type LiveShowdownInactiveState = {
  isGameActive: false;
  activePhase: "mid_game_break";
  secondsRemaining: number;
  totalRounds: 0;
  currentRound: null;
  currentQuestionIndex: null;
  activeQuestion: null;
  revealedAnswer: null;
  emceeAnnouncement: null;
  viewerResult: null;
  nextSchedule: {
    id: string;
    title: string;
    timezone: string;
    startTime: string;
    numRounds: number;
    intermissionAdDelaySeconds: number;
    lobbyAdEnabled: boolean;
    firstRoundCategory: string | null;
  } | null;
};

type LiveShowdownAnswerRow = {
  id: string;
  user_id: string;
  submitted_answer: string;
  normalized_answer: string;
  is_correct: boolean;
  points_awarded: number;
};

export type LiveShowdownState = LiveShowdownActiveState | LiveShowdownInactiveState;

function clampRounds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

function clampIntermissionDelaySeconds(value: number | null | undefined): number {
  if (!Number.isFinite(Number(value))) return 10;
  return Math.max(0, Math.min(300, Math.floor(Number(value))));
}

function toSafeServerTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return Date.now();
  }
  return Math.floor(value);
}

function toSafeVenueId(value: string): string {
  return String(value ?? "").trim();
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_BY_SHORT: Record<string, (typeof WEEKDAY_KEYS)[number]> = {
  sun: "sun",
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
};

function normalizeRecurringType(value: string | null | undefined): "none" | "daily" | "weekly" | "monthly" | "yearly" {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "yearly" ? value : "none";
}

function normalizeRecurringDays(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter((entry): entry is (typeof WEEKDAY_KEYS)[number] =>
      WEEKDAY_KEYS.includes(entry as (typeof WEEKDAY_KEYS)[number])
    );
  return Array.from(new Set(normalized));
}

function isMissingRecurringColumnsError(message: string | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  const mentionsRecurringColumn =
    normalized.includes("recurring_type") || normalized.includes("recurring_days");
  return mentionsRecurringColumn && (normalized.includes("does not exist") || normalized.includes("schema cache"));
}

function getTimeZoneParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: (typeof WEEKDAY_KEYS)[number];
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = WEEKDAY_BY_SHORT[String(values.weekday ?? "").slice(0, 3).toLowerCase()] ?? "sun";
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessMs = localUtcMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(guessMs), timeZone);
    guessMs = localUtcMs - offset;
  }
  return guessMs;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim());
}

function mapQuestionInternal(
  row: TriviaQuestionRow,
  sessionRow: TriviaSessionQuestionRow
): LiveShowdownQuestionInternal {
  const options = coerceOptions(row.options);
  const answerIndex = Number.isInteger(row.correct_answer) ? row.correct_answer : -1;
  const correctAnswer =
    answerIndex >= 0 && answerIndex < options.length
      ? String(options[answerIndex] ?? "").trim() || null
      : null;
  const correctNumericAnswer = correctAnswer ? parseLargePureNumberAnswer(correctAnswer) : null;

  return {
    id: row.id,
    questionId: String(row.slug ?? row.id),
    question: row.question,
    options,
    category: row.category ?? null,
    difficulty: row.difficulty ?? null,
    roundNumber: sessionRow.round_number,
    questionIndex: sessionRow.question_index,
    isClosestGuess: correctNumericAnswer !== null,
    correctAnswer,
    correctNumericAnswer,
  };
}

function toPublicQuestion(question: LiveShowdownQuestionInternal | null): LiveShowdownQuestionPublic | null {
  if (!question) return null;
  return {
    id: question.id,
    questionId: question.questionId,
    question: question.question,
    options: question.options,
    category: question.category,
    difficulty: question.difficulty,
    roundNumber: question.roundNumber,
    questionIndex: question.questionIndex,
    isClosestGuess: question.isClosestGuess,
  };
}

async function findRelevantSchedules(nowIso: string, venueIdRaw: string): Promise<{
  active: TriviaScheduleRow | null;
  upcoming: TriviaScheduleRow | null;
}> {
  const venueId = toSafeVenueId(venueIdRaw);
  if (!venueId) {
    return { active: null, upcoming: null };
  }

  if (!supabaseAdmin) {
    return { active: null, upcoming: null };
  }

  const withRecurring = await supabaseAdmin
    .from("trivia_schedules")
    .select("id, title, start_time, timezone, recurring_type, recurring_days, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled")
    .eq("venue_id", venueId)
    .order("start_time", { ascending: false })
    .limit(200);

  let rows: TriviaScheduleRow[] = [];
  if (withRecurring.error && isMissingRecurringColumnsError(withRecurring.error.message)) {
    const legacy = await supabaseAdmin
      .from("trivia_schedules")
      .select("id, title, start_time, timezone, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled")
      .eq("venue_id", venueId)
      .order("start_time", { ascending: false })
      .limit(200);
    if (legacy.error) {
      throw new Error(legacy.error.message || "Failed to load Live Showdown schedules.");
    }
    rows = ((legacy.data ?? []) as Array<Omit<TriviaScheduleRow, "recurring_type" | "recurring_days">>).map((row) => ({
      ...row,
      recurring_type: "none",
      recurring_days: null,
    }));
  } else if (withRecurring.error) {
    throw new Error(withRecurring.error.message || "Failed to load Live Showdown schedules.");
  } else {
    rows = (withRecurring.data ?? []) as TriviaScheduleRow[];
  }

  const nowMs = Date.parse(nowIso);
  const dayMs = 24 * 60 * 60 * 1000;
  let activeCandidate: { row: TriviaScheduleRow; startMs: number } | null = null;
  let upcomingCandidate: { row: TriviaScheduleRow; startMs: number } | null = null;

  for (const row of rows) {
    const baseStartMs = Date.parse(String(row.start_time ?? ""));
    if (!Number.isFinite(baseStartMs)) continue;
    const rounds = clampRounds(Number(row.num_rounds));
    const recurringType = normalizeRecurringType(row.recurring_type);
    const rowTimezone = String(row.timezone ?? "America/New_York").trim() || "America/New_York";

    if (recurringType !== "weekly") {
      const endMs = baseStartMs + rounds * ROUND_MS;
      if (nowMs >= baseStartMs && nowMs < endMs) {
        if (!activeCandidate || baseStartMs > activeCandidate.startMs) {
          activeCandidate = { row, startMs: baseStartMs };
        }
      } else if (baseStartMs > nowMs) {
        if (!upcomingCandidate || baseStartMs < upcomingCandidate.startMs) {
          upcomingCandidate = { row, startMs: baseStartMs };
        }
      }
      continue;
    }

    const baseStartParts = getTimeZoneParts(new Date(baseStartMs), rowTimezone);
    const recurringDays = normalizeRecurringDays(row.recurring_days);
    const effectiveDays = recurringDays.length > 0 ? recurringDays : [baseStartParts.weekday];

    for (let offset = -7; offset <= 14; offset += 1) {
      const dayProbe = getTimeZoneParts(new Date(nowMs + offset * dayMs), rowTimezone);
      if (!effectiveDays.includes(dayProbe.weekday)) continue;
      const occurrenceMs = zonedDateTimeToUtcMs(
        dayProbe.year,
        dayProbe.month,
        dayProbe.day,
        baseStartParts.hour,
        baseStartParts.minute,
        baseStartParts.second,
        rowTimezone
      );
      if (occurrenceMs < baseStartMs) continue;
      const endMs = occurrenceMs + rounds * ROUND_MS;
      if (nowMs >= occurrenceMs && nowMs < endMs) {
        if (!activeCandidate || occurrenceMs > activeCandidate.startMs) {
          activeCandidate = { row, startMs: occurrenceMs };
        }
      } else if (occurrenceMs > nowMs) {
        if (!upcomingCandidate || occurrenceMs < upcomingCandidate.startMs) {
          upcomingCandidate = { row, startMs: occurrenceMs };
        }
      }
    }
  }

  const active = activeCandidate
    ? { ...activeCandidate.row, start_time: new Date(activeCandidate.startMs).toISOString() }
    : null;
  const upcoming = upcomingCandidate
    ? { ...upcomingCandidate.row, start_time: new Date(upcomingCandidate.startMs).toISOString() }
    : null;
  return { active, upcoming };
}

async function loadSessionQuestion(
  scheduleId: string,
  roundNumber: number,
  questionIndex: number
): Promise<LiveShowdownQuestionInternal | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const { data: sessionRowData, error: sessionRowError } = await supabaseAdmin
    .from("trivia_session_questions")
    .select("id, schedule_id, question_id, round_number, question_index")
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex)
    .limit(1)
    .maybeSingle();

  if (sessionRowError) {
    throw new Error(sessionRowError.message || "Failed to load session question mapping.");
  }

  const sessionRow = (sessionRowData as TriviaSessionQuestionRow | null) ?? null;
  if (!sessionRow) {
    return null;
  }

  const questionId = String(sessionRow.question_id ?? "").trim();
  if (!questionId) {
    return null;
  }

  const bySlug = await supabaseAdmin
    .from("trivia_questions")
    .select("id, slug, question, options, correct_answer, category, difficulty, question_pool")
    .eq("slug", questionId)
    .limit(1)
    .maybeSingle();

  if (bySlug.error) {
    throw new Error(bySlug.error.message || "Failed to load Live Showdown question by slug.");
  }

  let questionRow = (bySlug.data as TriviaQuestionRow | null) ?? null;

  if (!questionRow && isUuidLike(questionId)) {
    const byId = await supabaseAdmin
      .from("trivia_questions")
      .select("id, slug, question, options, correct_answer, category, difficulty, question_pool")
      .eq("id", questionId)
      .limit(1)
      .maybeSingle();

    if (byId.error) {
      throw new Error(byId.error.message || "Failed to load Live Showdown question by id.");
    }
    questionRow = (byId.data as TriviaQuestionRow | null) ?? null;
  }

  if (!questionRow) {
    return null;
  }

  return mapQuestionInternal(questionRow, sessionRow);
}

async function loadRoundCategory(scheduleId: string, roundNumber: number): Promise<string | null> {
  const firstQuestion = await loadSessionQuestion(scheduleId, roundNumber, 1);
  const category = String(firstQuestion?.category ?? "").trim();
  return category || null;
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

async function loadViewerResult(
  userIdRaw: string,
  scheduleId: string,
  roundNumber: number,
  questionIndex: number,
  pendingClosestGuessEligible: boolean
): Promise<LiveShowdownViewerResult | null> {
  if (!supabaseAdmin) return null;

  const userId = String(userIdRaw ?? "").trim();
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from("live_showdown_answers")
    .select("submitted_answer, is_correct, points_awarded")
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex)
    .limit(1)
    .maybeSingle<{ submitted_answer: string; is_correct: boolean; points_awarded: number }>();

  if (error) {
    throw new Error(error.message || "Failed to load viewer showdown result.");
  }

  if (!data) return null;

  const pointsAwarded = Math.max(0, Number(data.points_awarded ?? 0));
  return {
    userId,
    scheduleId,
    roundNumber,
    questionIndex,
    submittedAnswer: String(data.submitted_answer ?? "").trim(),
    isCorrect: Boolean(data.is_correct),
    pointsAwarded,
    pendingClosestGuess: pendingClosestGuessEligible && pointsAwarded === 0 && !Boolean(data.is_correct),
  };
}

async function settleClosestGuessQuestion(
  scheduleId: string,
  roundNumber: number,
  questionIndex: number,
  correctAnswerRaw: string | null
): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const correctAnswer = String(correctAnswerRaw ?? "").trim();
  const correctNumericAnswer = parseLargePureNumberAnswer(correctAnswer);
  if (correctNumericAnswer === null) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("live_showdown_answers")
    .select("id, user_id, submitted_answer, normalized_answer, is_correct, points_awarded")
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex);

  if (error) {
    throw new Error(error.message || "Failed to load live showdown submissions.");
  }

  const answers = ((data ?? []) as LiveShowdownAnswerRow[]).map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    submitted_answer: String(row.submitted_answer ?? ""),
    normalized_answer: String(row.normalized_answer ?? ""),
    is_correct: Boolean(row.is_correct),
    points_awarded: Math.max(0, Number(row.points_awarded ?? 0)),
  }));

  if (answers.length === 0) {
    return null;
  }

  const userIds = Array.from(new Set(answers.map((row) => row.user_id).filter(Boolean)));
  const { data: usersData } = await supabaseAdmin
    .from("users")
    .select("id, username")
    .in("id", userIds)
    .limit(userIds.length);

  const usernameById = new Map(
    ((usersData ?? []) as Array<{ id: string; username: string | null }>).map((row) => [
      String(row.id ?? "").trim(),
      String(row.username ?? "").trim() || null,
    ])
  );

  const winners = computeClosestGuessWinners(
    answers.map((row) => ({
      answerId: row.id,
      userId: row.user_id,
      username: usernameById.get(row.user_id) ?? null,
      submittedAnswer: row.submitted_answer,
      normalizedAnswer: row.normalized_answer,
      isCorrect: row.is_correct,
      pointsAwarded: row.points_awarded,
    })),
    correctNumericAnswer
  );

  const winnerIds = new Set(winners.map((winner) => winner.answerId));
  const winnerRows = answers.filter((row) => winnerIds.has(row.id));

  const scoredWinnerIds = new Set(
    winnerRows.filter((row) => row.points_awarded > 0).map((row) => row.id)
  );
  const unscoredWinnerRows = winnerRows.filter((row) => row.points_awarded <= 0);

  for (const winnerRow of unscoredWinnerRows) {
    const { data: claimedRows, error: claimError } = await supabaseAdmin
      .from("live_showdown_answers")
      .update({ points_awarded: 10, is_correct: true })
      .eq("id", winnerRow.id)
      .eq("points_awarded", 0)
      .select("user_id")
      .limit(1);

    if (claimError) {
      throw new Error(claimError.message || "Failed to claim winner points for showdown answer.");
    }

    if (!claimedRows || claimedRows.length === 0) {
      continue;
    }

    const claimedUserId = String(claimedRows[0]?.user_id ?? "").trim();
    if (!claimedUserId) {
      continue;
    }

    const finalPointsAwarded = await awardTriviaPointsForLiveShowdown(claimedUserId, 10);
    if (finalPointsAwarded !== 10) {
      const { error: finalPointsError } = await supabaseAdmin
        .from("live_showdown_answers")
        .update({ points_awarded: finalPointsAwarded })
        .eq("id", winnerRow.id);

      if (finalPointsError) {
        throw new Error(finalPointsError.message || "Failed to finalize showdown winner points.");
      }
    }
    scoredWinnerIds.add(winnerRow.id);
  }

  const flagsAlreadyCorrect = answers.every((row) => {
    const shouldBeCorrect = winnerIds.has(row.id);
    return shouldBeCorrect ? row.is_correct : !row.is_correct;
  });
  if (!flagsAlreadyCorrect) {
    const { error: clearError } = await supabaseAdmin
      .from("live_showdown_answers")
      .update({ is_correct: false })
      .eq("schedule_id", scheduleId)
      .eq("round_number", roundNumber)
      .eq("question_index", questionIndex);

    if (clearError) {
      throw new Error(clearError.message || "Failed to clear showdown correctness flags.");
    }

    if (winnerIds.size > 0) {
      const { error: markError } = await supabaseAdmin
        .from("live_showdown_answers")
        .update({ is_correct: true })
        .in("id", Array.from(winnerIds));

      if (markError) {
        throw new Error(markError.message || "Failed to mark showdown winners as correct.");
      }
    }
  }

  if (winnerIds.size > 0 && scoredWinnerIds.size === 0) {
    return null;
  }

  return buildClosestGuessAnnouncement(winners, correctAnswer);
}

export async function getLiveShowdownState(
  serverTimestamp: number,
  venueId: string,
  viewerUserId = ""
): Promise<LiveShowdownState> {
  const nowMs = toSafeServerTimestamp(serverTimestamp);
  const nowIso = new Date(nowMs).toISOString();

  const { active, upcoming } = await findRelevantSchedules(nowIso, venueId);

  if (!active) {
    const nextStartMs = upcoming ? Date.parse(String(upcoming.start_time ?? "")) : Number.NaN;
    const secondsRemaining = Number.isFinite(nextStartMs)
      ? Math.max(0, Math.ceil((nextStartMs - nowMs) / 1000))
      : 0;

    const firstRoundCategory = upcoming
      ? await loadRoundCategory(upcoming.id, 1).catch(() => null)
      : null;

    return {
      isGameActive: false,
      activePhase: "mid_game_break",
      secondsRemaining,
      totalRounds: 0,
      currentRound: null,
      currentQuestionIndex: null,
      activeQuestion: null,
      revealedAnswer: null,
      emceeAnnouncement: null,
      viewerResult: null,
      nextSchedule: upcoming
        ? {
            id: upcoming.id,
            title: upcoming.title,
            timezone: upcoming.timezone,
            startTime: upcoming.start_time,
            numRounds: clampRounds(Number(upcoming.num_rounds)),
            intermissionAdDelaySeconds: clampIntermissionDelaySeconds(upcoming.intermission_ad_delay_seconds),
            lobbyAdEnabled: Boolean(upcoming.lobby_ad_enabled ?? true),
            firstRoundCategory,
          }
        : null,
    };
  }

  const startMs = Date.parse(String(active.start_time ?? ""));
  if (!Number.isFinite(startMs)) {
    throw new Error("Active schedule has an invalid start_time.");
  }

  const totalRounds = clampRounds(Number(active.num_rounds));
  const totalDurationMs = totalRounds * ROUND_MS;
  const clampedElapsedMs = Math.max(0, Math.min(nowMs - startMs, totalDurationMs - 1));

  const currentRound = Math.min(totalRounds, Math.floor(clampedElapsedMs / ROUND_MS) + 1);
  const roundElapsedMs = clampedElapsedMs - (currentRound - 1) * ROUND_MS;

  let activePhase: LiveShowdownPhase;
  let currentQuestionIndex: number | null = null;
  let secondsRemaining = 1;
  let activeQuestion: LiveShowdownQuestionInternal | null = null;
  let revealedAnswer: string | null = null;
  let emceeAnnouncement: string | null = null;
  let viewerResult: LiveShowdownViewerResult | null = null;

  if (roundElapsedMs < QUESTION_WINDOW_MS) {
    const questionIndex = Math.min(QUESTIONS_PER_ROUND, Math.floor(roundElapsedMs / QUESTION_BLOCK_MS) + 1);
    const elapsedInQuestionMs = roundElapsedMs - (questionIndex - 1) * QUESTION_BLOCK_MS;

    currentQuestionIndex = questionIndex;
    if (elapsedInQuestionMs < ANSWERING_MS) {
      activePhase = "answering";
      secondsRemaining = Math.max(1, Math.ceil((ANSWERING_MS - elapsedInQuestionMs) / 1000));
    } else {
      activePhase = "rest_warning";
      secondsRemaining = Math.max(1, Math.ceil((QUESTION_BLOCK_MS - elapsedInQuestionMs) / 1000));
    }

    activeQuestion = await loadSessionQuestion(active.id, currentRound, questionIndex);
    if (activePhase !== "answering") {
      revealedAnswer = activeQuestion?.correctAnswer ?? null;
      emceeAnnouncement = await settleClosestGuessQuestion(
        active.id,
        currentRound,
        questionIndex,
        activeQuestion?.correctAnswer ?? null
      );
      viewerResult = await loadViewerResult(
        viewerUserId,
        active.id,
        currentRound,
        questionIndex,
        activeQuestion?.correctNumericAnswer !== null
      );
    }
  } else {
    activePhase = "mid_game_break";
    secondsRemaining = Math.max(1, Math.ceil((ROUND_MS - roundElapsedMs) / 1000));

    const previousQuestion = await loadSessionQuestion(active.id, currentRound, QUESTIONS_PER_ROUND);
    revealedAnswer = previousQuestion?.correctAnswer ?? null;
    emceeAnnouncement = await settleClosestGuessQuestion(
      active.id,
      currentRound,
      QUESTIONS_PER_ROUND,
      previousQuestion?.correctAnswer ?? null
    );
    viewerResult = await loadViewerResult(
      viewerUserId,
      active.id,
      currentRound,
      QUESTIONS_PER_ROUND,
      previousQuestion?.correctNumericAnswer !== null
    );
  }

  const isFinalResultsWindow =
    activePhase === "mid_game_break" &&
    currentRound === totalRounds &&
    secondsRemaining <= 60;
  const currentRoundCategory =
    activeQuestion?.category ??
    (await loadRoundCategory(active.id, currentRound).catch(() => null));
  const upcomingRoundNumber = activePhase === "mid_game_break" && currentRound < totalRounds ? currentRound + 1 : null;
  const upcomingRoundCategory =
    upcomingRoundNumber !== null
      ? await loadRoundCategory(active.id, upcomingRoundNumber).catch(() => null)
      : null;

  return {
    isGameActive: true,
    scheduleId: active.id,
    scheduleTitle: active.title,
    scheduleTimezone: active.timezone,
    scheduleStartTime: active.start_time,
    intermissionAdDelaySeconds: clampIntermissionDelaySeconds(active.intermission_ad_delay_seconds),
    lobbyAdEnabled: Boolean(active.lobby_ad_enabled ?? true),
    totalRounds,
    currentRound,
    currentQuestionIndex,
    activePhase,
    secondsRemaining,
    activeQuestion: toPublicQuestion(activeQuestion),
    revealedAnswer,
    emceeAnnouncement,
    viewerResult,
    isFinalResultsWindow,
    currentRoundCategory,
    upcomingRoundNumber,
    upcomingRoundCategory,
  };
}

export const LIVE_SHOWDOWN_TIMING = {
  QUESTIONS_PER_ROUND,
  QUESTION_BLOCK_MS,
  ANSWERING_MS,
  REST_WARNING_MS,
  QUESTION_WINDOW_MS,
  MID_GAME_BREAK_MS,
  ROUND_MS,
} as const;
