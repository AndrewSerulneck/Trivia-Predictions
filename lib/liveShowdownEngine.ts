import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const QUESTIONS_PER_ROUND = 15;
const QUESTION_BLOCK_MS = 60_000;
const ANSWERING_MS = 30_000;
const REST_WARNING_MS = 30_000;
const QUESTION_WINDOW_MS = QUESTIONS_PER_ROUND * QUESTION_BLOCK_MS; // 15 min
const ROUND_MS = 20 * 60_000; // 20 min
const MID_GAME_BREAK_MS = ROUND_MS - QUESTION_WINDOW_MS; // 5 min

export type LiveShowdownPhase = "answering" | "rest_warning" | "mid_game_break";

type TriviaScheduleRow = {
  id: string;
  title: string;
  start_time: string;
  timezone: string;
  num_rounds: number;
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
};

type LiveShowdownQuestionInternal = LiveShowdownQuestionPublic & {
  correctAnswer: string | null;
};

type LiveShowdownActiveState = {
  isGameActive: true;
  scheduleId: string;
  scheduleTitle: string;
  scheduleTimezone: string;
  scheduleStartTime: string;
  totalRounds: number;
  currentRound: number;
  currentQuestionIndex: number | null;
  activePhase: LiveShowdownPhase;
  secondsRemaining: number;
  activeQuestion: LiveShowdownQuestionPublic | null;
  revealedAnswer: string | null;
  isFinalResultsWindow: boolean;
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
  nextSchedule: {
    id: string;
    title: string;
    timezone: string;
    startTime: string;
    numRounds: number;
  } | null;
};

export type LiveShowdownState = LiveShowdownActiveState | LiveShowdownInactiveState;

function clampRounds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

function toSafeServerTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return Date.now();
  }
  return Math.floor(value);
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

  return {
    id: row.id,
    questionId: String(row.slug ?? row.id),
    question: row.question,
    options,
    category: row.category ?? null,
    difficulty: row.difficulty ?? null,
    roundNumber: sessionRow.round_number,
    questionIndex: sessionRow.question_index,
    correctAnswer,
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
  };
}

async function findRelevantSchedules(nowIso: string): Promise<{
  active: TriviaScheduleRow | null;
  upcoming: TriviaScheduleRow | null;
}> {
  if (!supabaseAdmin) {
    return { active: null, upcoming: null };
  }

  const [recentResult, upcomingResult] = await Promise.all([
    supabaseAdmin
      .from("trivia_schedules")
      .select("id, title, start_time, timezone, num_rounds")
      .lte("start_time", nowIso)
      .order("start_time", { ascending: false })
      .limit(40),
    supabaseAdmin
      .from("trivia_schedules")
      .select("id, title, start_time, timezone, num_rounds")
      .gt("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(1),
  ]);

  if (recentResult.error) {
    throw new Error(recentResult.error.message || "Failed to load recent Live Showdown schedules.");
  }
  if (upcomingResult.error) {
    throw new Error(upcomingResult.error.message || "Failed to load upcoming Live Showdown schedules.");
  }

  const nowMs = Date.parse(nowIso);
  const recentRows = (recentResult.data ?? []) as TriviaScheduleRow[];
  let active: TriviaScheduleRow | null = null;

  for (const row of recentRows) {
    const startMs = Date.parse(String(row.start_time ?? ""));
    if (!Number.isFinite(startMs)) continue;
    const rounds = clampRounds(Number(row.num_rounds));
    const endMs = startMs + rounds * ROUND_MS;
    if (nowMs >= startMs && nowMs < endMs) {
      active = row;
      break;
    }
  }

  const upcoming = ((upcomingResult.data ?? [])[0] as TriviaScheduleRow | undefined) ?? null;
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
    .eq("question_pool", "live_showdown")
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
      .eq("question_pool", "live_showdown")
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

export async function getLiveShowdownState(serverTimestamp: number): Promise<LiveShowdownState> {
  const nowMs = toSafeServerTimestamp(serverTimestamp);
  const nowIso = new Date(nowMs).toISOString();

  const { active, upcoming } = await findRelevantSchedules(nowIso);

  if (!active) {
    const nextStartMs = upcoming ? Date.parse(String(upcoming.start_time ?? "")) : Number.NaN;
    const secondsRemaining = Number.isFinite(nextStartMs)
      ? Math.max(0, Math.ceil((nextStartMs - nowMs) / 1000))
      : 0;

    return {
      isGameActive: false,
      activePhase: "mid_game_break",
      secondsRemaining,
      totalRounds: 0,
      currentRound: null,
      currentQuestionIndex: null,
      activeQuestion: null,
      revealedAnswer: null,
      nextSchedule: upcoming
        ? {
            id: upcoming.id,
            title: upcoming.title,
            timezone: upcoming.timezone,
            startTime: upcoming.start_time,
            numRounds: clampRounds(Number(upcoming.num_rounds)),
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
    }
  } else {
    activePhase = "mid_game_break";
    secondsRemaining = Math.max(1, Math.ceil((ROUND_MS - roundElapsedMs) / 1000));

    // During break, expose the last question's answer for continuity.
    const previousQuestion = await loadSessionQuestion(active.id, currentRound, QUESTIONS_PER_ROUND);
    revealedAnswer = previousQuestion?.correctAnswer ?? null;
  }

  const isFinalResultsWindow =
    activePhase === "mid_game_break" &&
    currentRound === totalRounds &&
    secondsRemaining <= 60;

  return {
    isGameActive: true,
    scheduleId: active.id,
    scheduleTitle: active.title,
    scheduleTimezone: active.timezone,
    scheduleStartTime: active.start_time,
    totalRounds,
    currentRound,
    currentQuestionIndex,
    activePhase,
    secondsRemaining,
    activeQuestion: toPublicQuestion(activeQuestion),
    revealedAnswer,
    isFinalResultsWindow,
  };
}

// Re-export constants for testability and downstream UI assumptions.
export const LIVE_SHOWDOWN_TIMING = {
  QUESTIONS_PER_ROUND,
  QUESTION_BLOCK_MS,
  ANSWERING_MS,
  REST_WARNING_MS,
  QUESTION_WINDOW_MS,
  MID_GAME_BREAK_MS,
  ROUND_MS,
} as const;
