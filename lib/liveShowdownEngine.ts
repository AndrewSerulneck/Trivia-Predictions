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
const ROUND_MS = 15 * 60_000; // 15 min
const MID_GAME_BREAK_MS = ROUND_MS - QUESTION_WINDOW_MS; // 3 min 45 sec

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
  image_url: string | null;
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
  imageUrl: string | null;
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

type LiveShowdownLeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  roundPoints: Record<number, number>; // { 1: 80, 2: 90 }
  totalPoints: number;
  pointsThisRound: number; // delta from the round that just completed
};

type LiveShowdownViewerRoundSummary = {
  roundNumber: number;
  category: string | null;
  correctCount: number;
  totalAnswered: number;
  points: number;
};

type LiveShowdownActiveState = {
  isGameActive: true;
  scheduleId: string;
  scheduleTitle: string;
  scheduleTimezone: string;
  scheduleStartTime: string;
  occurrenceDate: string; // 'YYYY-MM-DD'
  intermissionAdDelaySeconds: number;
  lobbyAdEnabled: boolean;
  venueName: string | null;
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
  leaderboard: LiveShowdownLeaderboardEntry[] | null;
  viewerRank: number | null;
  viewerRoundByRound: LiveShowdownViewerRoundSummary[] | null; // only populated post-game (isFinalResultsWindow)
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
    recurringType: "none" | "daily" | "weekly" | "monthly" | "yearly";
    recurringDays: string[];
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

let supportsOccurrenceDateColumn: boolean | null = null;
let hasLoggedOccurrenceDateFallback = false;

function isMissingOccurrenceDateColumnError(message: string | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  return normalized.includes("occurrence_date") && normalized.includes("does not exist");
}

function logOccurrenceDateFallbackOnce(scope: string): void {
  if (hasLoggedOccurrenceDateFallback) return;
  hasLoggedOccurrenceDateFallback = true;
  console.warn(`[live-trivia][occurrence-compat] Falling back to legacy schema in ${scope} (missing occurrence_date column).`);
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

function formatZonedDate(ms: number, timeZone: string): string {
  const parts = getTimeZoneParts(new Date(ms), timeZone);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// djb2 string hash → unsigned 32-bit. Used to seed the per-venue shuffle so the
// same (venue, date) always produces the same question order (idempotent re-runs)
// while different venues get different orders for the same date. Also reused by
// the admin in-game replacement path for deterministic slot-based picks.
export function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// Deterministic Fisher-Yates shuffle driven by a mulberry32 PRNG seeded from djb2.
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = items.slice();
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
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
    imageUrl: row.image_url ?? null,
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
    imageUrl: question.imageUrl ?? null,
  };
}

const SCHEDULE_COLUMNS =
  "id, title, start_time, timezone, recurring_type, recurring_days, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled";
const SCHEDULE_COLUMNS_LEGACY =
  "id, title, start_time, timezone, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled";

// Loads schedule rows, transparently falling back to the pre-recurring-columns
// schema. Pass a venueId to scope to a single venue; omit it to load all venues
// (used by the per-occurrence seeder cron).
async function loadScheduleRows(venueId?: string): Promise<TriviaScheduleRow[]> {
  const admin = supabaseAdmin;
  if (!admin) return [];

  const limit = venueId ? 200 : 2000;
  const buildQuery = (columns: string) => {
    let query = admin.from("trivia_schedules").select(columns);
    if (venueId) query = query.eq("venue_id", venueId);
    return query.order("start_time", { ascending: false }).limit(limit);
  };

  const withRecurring = await buildQuery(SCHEDULE_COLUMNS);

  if (withRecurring.error && isMissingRecurringColumnsError(withRecurring.error.message)) {
    const legacy = await buildQuery(SCHEDULE_COLUMNS_LEGACY);
    if (legacy.error) {
      throw new Error(legacy.error.message || "Failed to load Live Showdown schedules.");
    }
    return ((legacy.data ?? []) as unknown as Array<Omit<TriviaScheduleRow, "recurring_type" | "recurring_days">>).map((row) => ({
      ...row,
      recurring_type: "none",
      recurring_days: null,
    }));
  }

  if (withRecurring.error) {
    throw new Error(withRecurring.error.message || "Failed to load Live Showdown schedules.");
  }

  return (withRecurring.data ?? []) as unknown as TriviaScheduleRow[];
}

// Enumerates candidate occurrence start times (UTC ms) for a schedule within a
// window around now, honoring recurring_type / recurring_days in the schedule's
// timezone. One-time / monthly / yearly schedules yield their single fixed start.
function enumerateOccurrenceStartsMs(row: TriviaScheduleRow, nowMs: number): number[] {
  const baseStartMs = Date.parse(String(row.start_time ?? ""));
  if (!Number.isFinite(baseStartMs)) return [];

  const recurringType = normalizeRecurringType(row.recurring_type);
  const rowTimezone = String(row.timezone ?? "America/New_York").trim() || "America/New_York";
  const dayMs = 24 * 60 * 60 * 1000;

  if (recurringType === "daily" || recurringType === "weekly") {
    const baseStartParts = getTimeZoneParts(new Date(baseStartMs), rowTimezone);
    const recurringDays = normalizeRecurringDays(row.recurring_days);
    const effectiveDays =
      recurringType === "daily"
        ? WEEKDAY_KEYS
        : recurringDays.length > 0
        ? recurringDays
        : [baseStartParts.weekday];

    const starts: number[] = [];
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
      starts.push(occurrenceMs);
    }
    return starts;
  }

  return [baseStartMs];
}

async function findRelevantSchedules(nowIso: string, venueIdRaw: string): Promise<{
  active: (TriviaScheduleRow & { occurrenceDate: string }) | null;
  upcoming: (TriviaScheduleRow & { occurrenceDate: string }) | null;
}> {
  const venueId = toSafeVenueId(venueIdRaw);
  if (!venueId) {
    return { active: null, upcoming: null };
  }

  const rows = await loadScheduleRows(venueId);

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

    if (recurringType === "daily" || recurringType === "weekly") {
      const baseStartParts = getTimeZoneParts(new Date(baseStartMs), rowTimezone);
      const recurringDays = normalizeRecurringDays(row.recurring_days);
      const effectiveDays =
        recurringType === "daily"
          ? WEEKDAY_KEYS
          : recurringDays.length > 0
          ? recurringDays
          : [baseStartParts.weekday];

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
      continue;
    }

  if (recurringType === "none" || recurringType === "monthly" || recurringType === "yearly") {
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
    ? {
        ...activeCandidate.row,
        start_time: new Date(activeCandidate.startMs).toISOString(),
        occurrenceDate: formatZonedDate(
          activeCandidate.startMs,
          String(activeCandidate.row.timezone ?? "America/New_York").trim() || "America/New_York"
        ),
      }
    : null;
  const upcoming = upcomingCandidate
    ? {
        ...upcomingCandidate.row,
        start_time: new Date(upcomingCandidate.startMs).toISOString(),
        occurrenceDate: formatZonedDate(
          upcomingCandidate.startMs,
          String(upcomingCandidate.row.timezone ?? "America/New_York").trim() || "America/New_York"
        ),
      }
    : null;
  return { active, upcoming };
}

async function loadSessionQuestion(
  scheduleId: string,
  roundNumber: number,
  questionIndex: number,
  occurrenceDate: string
): Promise<LiveShowdownQuestionInternal | null> {
  const admin = supabaseAdmin;
  if (!admin) {
    return null;
  }

  const { data: sessionRowData, error: sessionRowError } = await runOccurrenceCompatibleQuery(
    "loadSessionQuestion",
    () =>
      admin
        .from("trivia_session_questions")
        .select("id, schedule_id, question_id, round_number, question_index")
        .eq("schedule_id", scheduleId)
        .eq("occurrence_date", occurrenceDate)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex)
        .limit(1)
        .maybeSingle(),
    () =>
      admin
        .from("trivia_session_questions")
        .select("id, schedule_id, question_id, round_number, question_index")
        .eq("schedule_id", scheduleId)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex)
        .limit(1)
        .maybeSingle()
  );

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

  const bySlug = await admin
    .from("trivia_questions")
    .select("id, slug, question, options, correct_answer, category, difficulty, question_pool, image_url")
    .eq("slug", questionId)
    .limit(1)
    .maybeSingle();

  if (bySlug.error) {
    throw new Error(bySlug.error.message || "Failed to load Live Showdown question by slug.");
  }

  let questionRow = (bySlug.data as TriviaQuestionRow | null) ?? null;

  if (!questionRow && isUuidLike(questionId)) {
    const byId = await admin
      .from("trivia_questions")
      .select("id, slug, question, options, correct_answer, category, difficulty, question_pool, image_url")
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

async function loadRoundCategory(
  scheduleId: string,
  roundNumber: number,
  occurrenceDate: string
): Promise<string | null> {
  const firstQuestion = await loadSessionQuestion(scheduleId, roundNumber, 1, occurrenceDate);
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

async function loadViewerResult(
  userIdRaw: string,
  scheduleId: string,
  roundNumber: number,
  questionIndex: number,
  pendingClosestGuessEligible: boolean,
  occurrenceDate: string
): Promise<LiveShowdownViewerResult | null> {
  const admin = supabaseAdmin;
  if (!admin) return null;

  const userId = String(userIdRaw ?? "").trim();
  if (!userId) return null;

  const { data, error } = await runOccurrenceCompatibleQuery(
    "loadViewerResult",
    () =>
      admin
        .from("live_showdown_answers")
        .select("submitted_answer, is_correct, points_awarded")
        .eq("user_id", userId)
        .eq("schedule_id", scheduleId)
        .eq("occurrence_date", occurrenceDate)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex)
        .limit(1)
        .maybeSingle<{ submitted_answer: string; is_correct: boolean; points_awarded: number }>(),
    () =>
      admin
        .from("live_showdown_answers")
        .select("submitted_answer, is_correct, points_awarded")
        .eq("user_id", userId)
        .eq("schedule_id", scheduleId)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex)
        .limit(1)
        .maybeSingle<{ submitted_answer: string; is_correct: boolean; points_awarded: number }>()
  );

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
  correctAnswerRaw: string | null,
  occurrenceDate: string
): Promise<string | null> {
  const admin = supabaseAdmin;
  if (!admin) return null;

  const correctAnswer = String(correctAnswerRaw ?? "").trim();
  const correctNumericAnswer = parseLargePureNumberAnswer(correctAnswer);
  if (correctNumericAnswer === null) {
    return null;
  }

  const { data, error } = await runOccurrenceCompatibleQuery(
    "settleClosestGuessQuestion:load_submissions",
    () =>
      admin
        .from("live_showdown_answers")
        .select("id, user_id, submitted_answer, normalized_answer, is_correct, points_awarded")
        .eq("schedule_id", scheduleId)
        .eq("occurrence_date", occurrenceDate)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex),
    () =>
      admin
        .from("live_showdown_answers")
        .select("id, user_id, submitted_answer, normalized_answer, is_correct, points_awarded")
        .eq("schedule_id", scheduleId)
        .eq("round_number", roundNumber)
        .eq("question_index", questionIndex)
  );

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
  const { data: usersData } = await admin
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
    const { data: claimedRows, error: claimError } = await admin
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
      const { error: finalPointsError } = await admin
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
    const { error: clearError } = await runOccurrenceCompatibleQuery(
      "settleClosestGuessQuestion:clear_flags",
      () =>
        admin
          .from("live_showdown_answers")
          .update({ is_correct: false })
          .eq("schedule_id", scheduleId)
          .eq("occurrence_date", occurrenceDate)
          .eq("round_number", roundNumber)
          .eq("question_index", questionIndex),
      () =>
        admin
          .from("live_showdown_answers")
          .update({ is_correct: false })
          .eq("schedule_id", scheduleId)
          .eq("round_number", roundNumber)
          .eq("question_index", questionIndex)
    );

    if (clearError) {
      throw new Error(clearError.message || "Failed to clear showdown correctness flags.");
    }

    if (winnerIds.size > 0) {
      const { error: markError } = await admin
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

export type LiveOccurrenceSeedTarget = {
  scheduleId: string;
  occurrenceDate: string; // YYYY-MM-DD in the schedule's timezone
  venueId: string;
  numRounds: number;
};

// Only seed occurrences that are happening now or starting within this horizon,
// so the daily cron seeds "today's" game without consuming the unseen-question
// pool for games far in the future.
const SEED_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

// Identifies every venue schedule whose occurrence is active now or starts within
// the next SEED_LOOKAHEAD_MS, returning the occurrence date in the schedule's
// timezone. Used by the per-occurrence seeder cron.
export async function findOccurrencesToSeed(nowMs: number): Promise<LiveOccurrenceSeedTarget[]> {
  const rows = await loadScheduleRows();
  const targets: LiveOccurrenceSeedTarget[] = [];

  for (const row of rows) {
    const venueId = toSafeVenueId(String(row.venue_id ?? ""));
    if (!venueId) continue;

    const rounds = clampRounds(Number(row.num_rounds));
    const rowTimezone = String(row.timezone ?? "America/New_York").trim() || "America/New_York";
    const starts = enumerateOccurrenceStartsMs(row, nowMs);

    let chosenMs: number | null = null;
    for (const startMs of starts) {
      const endMs = startMs + rounds * ROUND_MS;
      if (nowMs >= startMs && nowMs < endMs) {
        chosenMs = startMs;
        break;
      }
    }
    if (chosenMs === null) {
      for (const startMs of starts) {
        if (startMs > nowMs && startMs - nowMs <= SEED_LOOKAHEAD_MS) {
          if (chosenMs === null || startMs < chosenMs) {
            chosenMs = startMs;
          }
        }
      }
    }
    if (chosenMs === null) continue;

    targets.push({
      scheduleId: row.id,
      occurrenceDate: formatZonedDate(chosenMs, rowTimezone),
      venueId,
      numRounds: rounds,
    });
  }

  return targets;
}

// Seeds trivia_session_questions for one occurrence. Idempotent: if rows already
// exist for (schedule_id, occurrence_date) it returns without re-seeding.
// Questions are drawn from status='active' trivia_questions, deduplicated against
// venue_seen_questions, and shuffled with a per-(venue, date) seed.
export async function seedOccurrenceQuestions(
  scheduleId: string,
  occurrenceDate: string,
  venueId: string,
  numRounds: number
): Promise<{ seeded: number; skipped: number }> {
  const admin = supabaseAdmin;
  if (!admin) return { seeded: 0, skipped: 0 };

  const rounds = clampRounds(numRounds);
  const totalSlots = rounds * QUESTIONS_PER_ROUND;
  const safeVenueId = toSafeVenueId(venueId);

  // Idempotency guard — never re-seed an occurrence that already has rows.
  const { count: existingCount, error: existingError } = await runOccurrenceCompatibleQuery(
    "seedOccurrenceQuestions:existing_count",
    () =>
      admin
        .from("trivia_session_questions")
        .select("id", { count: "exact", head: true })
        .eq("schedule_id", scheduleId)
        .eq("occurrence_date", occurrenceDate),
    () =>
      admin
        .from("trivia_session_questions")
        .select("id", { count: "exact", head: true })
        .eq("schedule_id", scheduleId)
  );
  if (existingError) {
    throw new Error(existingError.message || "Failed to check existing occurrence questions.");
  }
  if ((existingCount ?? 0) > 0) {
    return { seeded: 0, skipped: totalSlots };
  }

  // Slugs already used at this venue.
  const { data: seenData, error: seenError } = await admin
    .from("venue_seen_questions")
    .select("question_id")
    .eq("venue_id", safeVenueId);
  if (seenError) {
    throw new Error(seenError.message || "Failed to load venue seen questions.");
  }
  const seenSlugs = new Set(
    ((seenData ?? []) as Array<{ question_id: string | null }>)
      .map((r) => String(r.question_id ?? "").trim())
      .filter(Boolean)
  );

  // Active question pool in a deterministic base order.
  const { data: poolData, error: poolError } = await admin
    .from("trivia_questions")
    .select("slug")
    .eq("status", "active")
    .eq("question_pool", "live_showdown")
    .not("slug", "is", null)
    .order("slug", { ascending: true })
    .limit(5000);
  if (poolError) {
    throw new Error(poolError.message || "Failed to load active question pool.");
  }

  const allSlugs = ((poolData ?? []) as Array<{ slug: string | null }>)
    .map((r) => String(r.slug ?? "").trim())
    .filter(Boolean);

  const seed = djb2(`${safeVenueId}${occurrenceDate}`);
  const unseen = allSlugs.filter((slug) => !seenSlugs.has(slug));
  const seen = allSlugs.filter((slug) => seenSlugs.has(slug));
  const shuffledUnseen = seededShuffle(unseen, seed);
  const shuffledSeen = seededShuffle(seen, seed ^ 0x9e3779b9);

  const chosen: string[] = [];
  const chosenSet = new Set<string>();
  const pushUnique = (slug: string) => {
    if (!slug || chosenSet.has(slug)) return;
    chosen.push(slug);
    chosenSet.add(slug);
  };

  for (const slug of shuffledUnseen) {
    if (chosen.length >= totalSlots) break;
    pushUnique(slug);
  }

  let usedRepeats = false;
  if (chosen.length < totalSlots) {
    // Not enough unseen questions — fall back to already-seen ones (allow repeats).
    usedRepeats = true;
    for (const slug of shuffledSeen) {
      if (chosen.length >= totalSlots) break;
      pushUnique(slug);
    }
  }

  if (chosen.length === 0) {
    // No active questions at all — nothing we can seed.
    return { seeded: 0, skipped: totalSlots };
  }

  // Fewer distinct questions than slots: cycle through what we have to fill.
  if (chosen.length < totalSlots) {
    const cycle = chosen.slice();
    let idx = 0;
    while (chosen.length < totalSlots) {
      chosen.push(cycle[idx % cycle.length]);
      idx += 1;
    }
  }

  if (usedRepeats) {
    // TODO(Prompt 10): persist a venue_question_warnings row / fire a notification
    // when a venue runs low on unseen questions. The table/notifier does not exist
    // yet, so we only log for now.
    console.warn(
      `[seedOccurrenceQuestions] venue ${safeVenueId} ran low on unseen questions for ${occurrenceDate} ` +
        `(unseen=${unseen.length}, needed=${totalSlots}); reused seen questions.`
    );
  }

  const sessionRowsWithOccurrence = chosen.slice(0, totalSlots).map((slug, k) => ({
    schedule_id: scheduleId,
    occurrence_date: occurrenceDate,
    question_id: slug,
    round_number: Math.floor(k / QUESTIONS_PER_ROUND) + 1,
    question_index: (k % QUESTIONS_PER_ROUND) + 1,
  }));
  const sessionRowsLegacy = chosen.slice(0, totalSlots).map((slug, k) => ({
    schedule_id: scheduleId,
    question_id: slug,
    round_number: Math.floor(k / QUESTIONS_PER_ROUND) + 1,
    question_index: (k % QUESTIONS_PER_ROUND) + 1,
  }));

  const { error: insertError } = await runOccurrenceCompatibleQuery(
    "seedOccurrenceQuestions:insert",
    () =>
      admin
        .from("trivia_session_questions")
        .upsert(sessionRowsWithOccurrence, {
          onConflict: "schedule_id,occurrence_date,round_number,question_index",
          ignoreDuplicates: true,
        }),
    () =>
      admin
        .from("trivia_session_questions")
        .upsert(sessionRowsLegacy, {
          onConflict: "schedule_id,round_number,question_index",
          ignoreDuplicates: true,
        })
  );
  if (insertError) {
    throw new Error(insertError.message || "Failed to seed occurrence questions.");
  }

  const seenRows = Array.from(new Set(chosen)).map((slug) => ({
    venue_id: safeVenueId,
    question_id: slug,
  }));
  const { error: seenUpsertError } = await admin
    .from("venue_seen_questions")
    .upsert(seenRows, { onConflict: "venue_id,question_id", ignoreDuplicates: true });
  if (seenUpsertError) {
    throw new Error(seenUpsertError.message || "Failed to record venue seen questions.");
  }

  return { seeded: totalSlots, skipped: 0 };
}

// Number of leaderboard entries surfaced in state. Ranks are computed across the
// full participant set so the viewer's rank is accurate even when off the board.
const LEADERBOARD_DISPLAY_LIMIT = 10;

type LeaderboardAnswer = {
  userId: string;
  roundNumber: number;
  points: number;
  isCorrect: boolean;
};

// Resolves the category name for each round of an occurrence in one batch
// (question_index 1 of each round → trivia_questions.category).
async function loadRoundCategoriesForOccurrence(
  scheduleId: string,
  occurrenceDate: string
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  const admin = supabaseAdmin;
  if (!admin) return result;

  const { data: slotData, error: slotError } = await runOccurrenceCompatibleQuery(
    "loadRoundCategoriesForOccurrence",
    () =>
      admin
        .from("trivia_session_questions")
        .select("round_number, question_id")
        .eq("schedule_id", scheduleId)
        .eq("occurrence_date", occurrenceDate)
        .eq("question_index", 1),
    () =>
      admin
        .from("trivia_session_questions")
        .select("round_number, question_id")
        .eq("schedule_id", scheduleId)
        .eq("question_index", 1)
  );
  if (slotError) {
    throw new Error(slotError.message || "Failed to load round categories.");
  }

  const slots = ((slotData ?? []) as Array<{ round_number: number; question_id: string | null }>)
    .map((row) => ({ round: Math.floor(Number(row.round_number)), slug: String(row.question_id ?? "").trim() }))
    .filter((row) => Number.isFinite(row.round) && row.slug);
  if (slots.length === 0) return result;

  const slugs = Array.from(new Set(slots.map((slot) => slot.slug)));
  const { data: questionData, error: questionError } = await admin
    .from("trivia_questions")
    .select("slug, category")
    .in("slug", slugs)
    .limit(slugs.length);
  if (questionError) {
    throw new Error(questionError.message || "Failed to load round category names.");
  }

  const categoryBySlug = new Map(
    ((questionData ?? []) as Array<{ slug: string | null; category: string | null }>).map((row) => [
      String(row.slug ?? "").trim(),
      String(row.category ?? "").trim() || null,
    ])
  );

  for (const slot of slots) {
    result.set(slot.round, categoryBySlug.get(slot.slug) ?? null);
  }
  return result;
}

// Builds the viewer's post-game round-by-round recap from their own answers.
async function buildViewerRoundByRound(
  scheduleId: string,
  occurrenceDate: string,
  viewerId: string,
  totalRounds: number,
  allAnswers: LeaderboardAnswer[]
): Promise<LiveShowdownViewerRoundSummary[]> {
  const byRound = new Map<number, { correctCount: number; totalAnswered: number; points: number }>();
  for (const row of allAnswers) {
    if (row.userId !== viewerId) continue;
    let stats = byRound.get(row.roundNumber);
    if (!stats) {
      stats = { correctCount: 0, totalAnswered: 0, points: 0 };
      byRound.set(row.roundNumber, stats);
    }
    stats.totalAnswered += 1;
    stats.points += row.points;
    if (row.isCorrect) stats.correctCount += 1;
  }

  const categoryByRound = await loadRoundCategoriesForOccurrence(scheduleId, occurrenceDate);

  const summaries: LiveShowdownViewerRoundSummary[] = [];
  for (let round = 1; round <= totalRounds; round += 1) {
    const stats = byRound.get(round) ?? { correctCount: 0, totalAnswered: 0, points: 0 };
    summaries.push({
      roundNumber: round,
      category: categoryByRound.get(round) ?? null,
      correctCount: stats.correctCount,
      totalAnswered: stats.totalAnswered,
      points: stats.points,
    });
  }
  return summaries;
}

// Computes the in-game leaderboard (this occurrence only — not lifetime venue
// points), the viewer's rank across the full field, and the viewer's post-game
// round-by-round recap. `currentRound` is the round that just completed (this is
// only ever invoked during mid_game_break).
async function loadGameLeaderboard(
  scheduleId: string,
  occurrenceDate: string,
  currentRound: number,
  viewerUserId: string,
  totalRounds: number,
  isFinalResultsWindow: boolean
): Promise<{
  leaderboard: LiveShowdownLeaderboardEntry[];
  viewerRank: number | null;
  viewerRoundByRound: LiveShowdownViewerRoundSummary[] | null;
}> {
  const admin = supabaseAdmin;
  if (!admin) {
    return { leaderboard: [], viewerRank: null, viewerRoundByRound: null };
  }

  const viewerId = String(viewerUserId ?? "").trim();

  const { data: answerData, error: answerError } = await runOccurrenceCompatibleQuery(
    "loadGameLeaderboard",
    () =>
      admin
        .from("live_showdown_answers")
        .select("user_id, round_number, points_awarded, is_correct")
        .eq("schedule_id", scheduleId)
        .eq("occurrence_date", occurrenceDate),
    () =>
      admin
        .from("live_showdown_answers")
        .select("user_id, round_number, points_awarded, is_correct")
        .eq("schedule_id", scheduleId)
  );
  if (answerError) {
    throw new Error(answerError.message || "Failed to load Live Showdown leaderboard answers.");
  }

  const answers: LeaderboardAnswer[] = (
    (answerData ?? []) as Array<{
      user_id: string;
      round_number: number;
      points_awarded: number;
      is_correct: boolean;
    }>
  )
    .map((row) => ({
      userId: String(row.user_id ?? "").trim(),
      roundNumber: Math.floor(Number(row.round_number)),
      points: Math.max(0, Number(row.points_awarded ?? 0)),
      isCorrect: Boolean(row.is_correct),
    }))
    .filter((row) => row.userId && Number.isFinite(row.roundNumber));

  if (answers.length === 0) {
    return { leaderboard: [], viewerRank: null, viewerRoundByRound: null };
  }

  // Aggregate per user: per-round points and cumulative total.
  const perUser = new Map<string, { roundPoints: Record<number, number>; totalPoints: number }>();
  for (const row of answers) {
    let entry = perUser.get(row.userId);
    if (!entry) {
      entry = { roundPoints: {}, totalPoints: 0 };
      perUser.set(row.userId, entry);
    }
    entry.roundPoints[row.roundNumber] = (entry.roundPoints[row.roundNumber] ?? 0) + row.points;
    entry.totalPoints += row.points;
  }

  const userIds = Array.from(perUser.keys());
  const { data: usersData, error: usersError } = await admin
    .from("users")
    .select("id, username")
    .in("id", userIds)
    .limit(userIds.length);
  if (usersError) {
    throw new Error(usersError.message || "Failed to load leaderboard usernames.");
  }
  const usernameById = new Map(
    ((usersData ?? []) as Array<{ id: string; username: string | null }>).map((row) => [
      String(row.id ?? "").trim(),
      String(row.username ?? "").trim() || "Player",
    ])
  );

  // Sort descending by total; break ties by username for a stable order.
  const sorted = userIds
    .map((userId) => {
      const agg = perUser.get(userId);
      const roundPoints = agg?.roundPoints ?? {};
      const totalPoints = agg?.totalPoints ?? 0;
      return {
        userId,
        username: usernameById.get(userId) ?? "Player",
        roundPoints,
        totalPoints,
        pointsThisRound: roundPoints[currentRound] ?? 0,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || a.username.localeCompare(b.username));

  // Competition ranking — equal totals share a rank (1, 2, 2, 4).
  const ranked: LiveShowdownLeaderboardEntry[] = [];
  let previousPoints: number | null = null;
  let previousRank = 0;
  sorted.forEach((entry, index) => {
    const rank = previousPoints !== null && entry.totalPoints === previousPoints ? previousRank : index + 1;
    previousPoints = entry.totalPoints;
    previousRank = rank;
    ranked.push({ rank, ...entry });
  });

  const viewerEntry = viewerId ? ranked.find((entry) => entry.userId === viewerId) : undefined;
  const viewerRank = viewerEntry ? viewerEntry.rank : null;

  const leaderboard = ranked.slice(0, LEADERBOARD_DISPLAY_LIMIT);

  const viewerRoundByRound =
    isFinalResultsWindow && viewerId
      ? await buildViewerRoundByRound(scheduleId, occurrenceDate, viewerId, totalRounds, answers)
      : null;

  return { leaderboard, viewerRank, viewerRoundByRound };
}

async function loadVenueName(venueId: string): Promise<string | null> {
  if (!supabaseAdmin || !venueId) return null;
  const { data } = await supabaseAdmin
    .from("venues")
    .select("name")
    .eq("id", venueId)
    .maybeSingle<{ name: string }>();
  return data?.name ?? null;
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
      ? await loadRoundCategory(upcoming.id, 1, upcoming.occurrenceDate).catch(() => null)
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
            recurringType: normalizeRecurringType(upcoming.recurring_type),
            recurringDays: normalizeRecurringDays(upcoming.recurring_days),
          }
        : null,
    };
  }

  const startMs = Date.parse(String(active.start_time ?? ""));
  if (!Number.isFinite(startMs)) {
    throw new Error("Active schedule has an invalid start_time.");
  }

  const occurrenceDate = active.occurrenceDate;

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

    activeQuestion = await loadSessionQuestion(active.id, currentRound, questionIndex, occurrenceDate);
    if (activePhase !== "answering") {
      revealedAnswer = activeQuestion?.correctAnswer ?? null;
      emceeAnnouncement = await settleClosestGuessQuestion(
        active.id,
        currentRound,
        questionIndex,
        activeQuestion?.correctAnswer ?? null,
        occurrenceDate
      );
      viewerResult = await loadViewerResult(
        viewerUserId,
        active.id,
        currentRound,
        questionIndex,
        activeQuestion?.correctNumericAnswer !== null,
        occurrenceDate
      );
    }
  } else {
    activePhase = "mid_game_break";
    secondsRemaining = Math.max(1, Math.ceil((ROUND_MS - roundElapsedMs) / 1000));

    const previousQuestion = await loadSessionQuestion(active.id, currentRound, QUESTIONS_PER_ROUND, occurrenceDate);
    revealedAnswer = previousQuestion?.correctAnswer ?? null;
    emceeAnnouncement = await settleClosestGuessQuestion(
      active.id,
      currentRound,
      QUESTIONS_PER_ROUND,
      previousQuestion?.correctAnswer ?? null,
      occurrenceDate
    );
    viewerResult = await loadViewerResult(
      viewerUserId,
      active.id,
      currentRound,
      QUESTIONS_PER_ROUND,
      previousQuestion?.correctNumericAnswer !== null,
      occurrenceDate
    );
  }

  const isFinalResultsWindow =
    activePhase === "mid_game_break" &&
    currentRound === totalRounds &&
    secondsRemaining <= 60;
  const currentRoundCategory =
    activeQuestion?.category ??
    (await loadRoundCategory(active.id, currentRound, occurrenceDate).catch(() => null));
  const upcomingRoundNumber = activePhase === "mid_game_break" && currentRound < totalRounds ? currentRound + 1 : null;
  const upcomingRoundCategory =
    upcomingRoundNumber !== null
      ? await loadRoundCategory(active.id, upcomingRoundNumber, occurrenceDate).catch(() => null)
      : null;

  // Leaderboard only matters during the break / final-results window.
  let leaderboard: LiveShowdownLeaderboardEntry[] | null = null;
  let viewerRank: number | null = null;
  let viewerRoundByRound: LiveShowdownViewerRoundSummary[] | null = null;
  if (activePhase === "mid_game_break") {
    const board = await loadGameLeaderboard(
      active.id,
      occurrenceDate,
      currentRound,
      viewerUserId,
      totalRounds,
      isFinalResultsWindow
    );
    leaderboard = board.leaderboard;
    viewerRank = board.viewerRank;
    viewerRoundByRound = board.viewerRoundByRound;
  }

  const venueName = await loadVenueName(venueId);

  return {
    isGameActive: true,
    scheduleId: active.id,
    scheduleTitle: active.title,
    scheduleTimezone: active.timezone,
    scheduleStartTime: active.start_time,
    occurrenceDate,
    intermissionAdDelaySeconds: clampIntermissionDelaySeconds(active.intermission_ad_delay_seconds),
    lobbyAdEnabled: Boolean(active.lobby_ad_enabled ?? true),
    venueName,
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
    leaderboard,
    viewerRank,
    viewerRoundByRound,
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
