import "server-only";

import { getLiveShowdownState } from "@/lib/liveShowdownEngine";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const QUESTIONS_PER_ROUND = 15;
const QUESTION_BLOCK_MS = 60_000;
const ROUND_MS = 20 * 60_000;

type LiveShowdownQuestionRow = {
  id: string;
  slug: string | null;
  question: string;
  category: string | null;
  options: unknown;
  correct_answer: number;
  question_pool: "anytime_blitz" | "live_showdown";
};

type TriviaScheduleRow = {
  id: string;
  title: string;
  start_time: string;
  timezone: string;
  num_rounds: number;
  venue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminLiveShowdownSchedule = {
  id: string;
  title: string;
  startTime: string;
  timezone: string;
  numRounds: number;
  venueId: string | null;
  createdAt: string;
  updatedAt: string;
};

function getAdminClient(): NonNullable<typeof supabaseAdmin> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  return supabaseAdmin;
}

function clampRounds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

function mapScheduleRow(row: TriviaScheduleRow): AdminLiveShowdownSchedule {
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    timezone: row.timezone,
    numRounds: row.num_rounds,
    venueId: row.venue_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toWordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isStandaloneNumeric(value: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value.trim());
}

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim());
}

function isLiveShowdownEligibleAnswer(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (isStandaloneNumeric(normalized)) return true;
  return toWordCount(normalized) <= 2;
}

function getCorrectAnswer(row: LiveShowdownQuestionRow): string {
  const options = coerceOptions(row.options);
  const answerIndex = Number.isInteger(row.correct_answer) ? row.correct_answer : -1;
  if (answerIndex < 0 || answerIndex >= options.length) return "";
  return String(options[answerIndex] ?? "").trim();
}

function normalizeCategory(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized || "General";
}

function shuffleInPlace<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtcIso(dateValue: string, timeValue: string, timeZone: string): string {
  const match = `${dateValue}T${timeValue}`.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error("Target date and start time are required.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  let guessMs = localUtcMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(guessMs), timeZone);
    guessMs = localUtcMs - offset;
  }
  return new Date(guessMs).toISOString();
}

async function buildLiveShowdownQuestionMatrix(numRounds: number): Promise<string[]> {
  const admin = getAdminClient();
  const totalNeeded = numRounds * QUESTIONS_PER_ROUND;
  const { data, error } = await admin
    .from("trivia_questions")
    .select("id, slug, question, category, options, correct_answer, question_pool")
    .in("question_pool", ["live_showdown", "anytime_blitz"]);

  if (error) {
    throw new Error(error.message || "Failed to load trivia questions for Live Showdown seeding.");
  }

  const rows = ((data ?? []) as LiveShowdownQuestionRow[])
    .filter((row) => String(row.slug ?? "").trim().length > 0)
    .map((row) => ({ ...row, slug: String(row.slug ?? "").trim() } as LiveShowdownQuestionRow & { slug: string }));

  const liveEligible = rows.filter((row) => row.question_pool === "live_showdown" && isLiveShowdownEligibleAnswer(getCorrectAnswer(row)));
  const anytimeEligible = rows.filter((row) => row.question_pool === "anytime_blitz" && isLiveShowdownEligibleAnswer(getCorrectAnswer(row)));
  const allByCategory = new Map<string, Array<(LiveShowdownQuestionRow & { slug: string })>>();

  for (const row of rows) {
    const category = normalizeCategory(row.category);
    const list = allByCategory.get(category) ?? [];
    list.push(row as LiveShowdownQuestionRow & { slug: string });
    allByCategory.set(category, list);
  }

  for (const list of allByCategory.values()) {
    shuffleInPlace(list);
  }

  const used = new Set<string>();
  const selected: string[] = [];

  const takeFrom = (
    source: Array<LiveShowdownQuestionRow & { slug: string }>,
    count: number,
    category?: string
  ): string[] => {
    const picked: string[] = [];
    for (const row of source) {
      if (picked.length >= count) break;
      if (used.has(row.slug)) continue;
      if (category && normalizeCategory(row.category) !== category) continue;
      used.add(row.slug);
      picked.push(row.slug);
    }
    return picked;
  };

  const rounds: string[][] = [];

  for (let round = 1; round <= numRounds; round += 1) {
    const categoriesWithEnoughRemaining = Array.from(allByCategory.entries())
      .map(([category, list]) => ({
        category,
        remaining: list.filter((row) => !used.has(row.slug)).length,
      }))
      .filter((entry) => entry.remaining >= QUESTIONS_PER_ROUND)
      .sort((a, b) => b.remaining - a.remaining);

    const preferredCategory = categoriesWithEnoughRemaining[0]?.category ?? null;
    const roundSlugs: string[] = [];

    if (preferredCategory) {
      roundSlugs.push(...takeFrom(liveEligible as Array<LiveShowdownQuestionRow & { slug: string }>, QUESTIONS_PER_ROUND, preferredCategory));
      if (roundSlugs.length < QUESTIONS_PER_ROUND) {
        roundSlugs.push(...takeFrom(anytimeEligible as Array<LiveShowdownQuestionRow & { slug: string }>, QUESTIONS_PER_ROUND - roundSlugs.length, preferredCategory));
      }
      if (roundSlugs.length < QUESTIONS_PER_ROUND) {
        const categoryAll = allByCategory.get(preferredCategory) ?? [];
        roundSlugs.push(...takeFrom(categoryAll, QUESTIONS_PER_ROUND - roundSlugs.length));
      }
    }

    if (roundSlugs.length < QUESTIONS_PER_ROUND) {
      const needed = QUESTIONS_PER_ROUND - roundSlugs.length;
      roundSlugs.push(...takeFrom(liveEligible as Array<LiveShowdownQuestionRow & { slug: string }>, needed));
    }
    if (roundSlugs.length < QUESTIONS_PER_ROUND) {
      const needed = QUESTIONS_PER_ROUND - roundSlugs.length;
      roundSlugs.push(...takeFrom(anytimeEligible as Array<LiveShowdownQuestionRow & { slug: string }>, needed));
    }
    if (roundSlugs.length < QUESTIONS_PER_ROUND) {
      const needed = QUESTIONS_PER_ROUND - roundSlugs.length;
      roundSlugs.push(...takeFrom(rows as Array<LiveShowdownQuestionRow & { slug: string }>, needed));
      console.warn(
        `[Live Showdown] Round ${round}: used broad fallback rows outside strict answer filter to fill ${needed} slot(s).`
      );
    }

    if (roundSlugs.length < QUESTIONS_PER_ROUND) {
      throw new Error(
        `Unable to fill round ${round}; only ${roundSlugs.length}/${QUESTIONS_PER_ROUND} questions available after all fallback passes.`
      );
    }

    rounds.push(roundSlugs.slice(0, QUESTIONS_PER_ROUND));
  }

  const flat = rounds.flat();
  if (flat.length < totalNeeded) {
    throw new Error(`Unable to produce required question matrix: ${flat.length}/${totalNeeded} slots filled.`);
  }
  return flat.slice(0, totalNeeded);
}

function computeNextSlot(params: {
  totalRounds: number;
  currentRound: number;
  currentQuestionIndex: number | null;
  activePhase: "answering" | "rest_warning" | "mid_game_break";
}): { round: number; questionIndex: number } | null {
  const { totalRounds, currentRound, currentQuestionIndex, activePhase } = params;
  const currentQ = currentQuestionIndex ?? QUESTIONS_PER_ROUND;

  if (activePhase === "mid_game_break") {
    if (currentRound >= totalRounds) return null;
    return { round: currentRound + 1, questionIndex: 1 };
  }

  if (currentQ < QUESTIONS_PER_ROUND) {
    return { round: currentRound, questionIndex: currentQ + 1 };
  }
  if (currentRound >= totalRounds) {
    return null;
  }
  return { round: currentRound + 1, questionIndex: 1 };
}

export async function listAdminLiveShowdownSchedules(limit = 30): Promise<AdminLiveShowdownSchedule[]> {
  const admin = getAdminClient();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const { data, error } = await admin
    .from("trivia_schedules")
    .select("id, title, start_time, timezone, num_rounds, venue_id, created_at, updated_at")
    .order("start_time", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message || "Failed to list Live Showdown schedules.");
  }

  return ((data ?? []) as TriviaScheduleRow[]).map(mapScheduleRow);
}

export async function createAdminLiveShowdownSchedule(params: {
  title: string;
  targetDate: string;
  startTime: string;
  timezone: string;
  numRounds: number;
  venueId: string;
}): Promise<AdminLiveShowdownSchedule> {
  const admin = getAdminClient();

  const title = String(params.title ?? "").trim();
  const targetDate = String(params.targetDate ?? "").trim();
  const startTime = String(params.startTime ?? "").trim();
  const timezone = String(params.timezone ?? "America/New_York").trim() || "America/New_York";
  const venueId = String(params.venueId ?? "").trim();
  const numRounds = clampRounds(Number(params.numRounds));

  if (!title || !targetDate || !startTime || !venueId) {
    throw new Error("title, targetDate, startTime, timezone, numRounds, and venueId are required.");
  }

  const startTimeIso = zonedDateTimeToUtcIso(targetDate, startTime, timezone);
  const sampledQuestionSlugs = await buildLiveShowdownQuestionMatrix(numRounds);

  const scheduleInsert = await admin
    .from("trivia_schedules")
    .insert({
      title,
      start_time: startTimeIso,
      timezone,
      num_rounds: numRounds,
      venue_id: venueId,
    })
    .select("id, title, start_time, timezone, num_rounds, venue_id, created_at, updated_at")
    .single();

  if (scheduleInsert.error || !scheduleInsert.data) {
    throw new Error(scheduleInsert.error?.message || "Failed to create Live Showdown schedule.");
  }

  const schedule = scheduleInsert.data as TriviaScheduleRow;
  const sessionRows: Array<{
    schedule_id: string;
    question_id: string;
    round_number: number;
    question_index: number;
  }> = [];

  let cursor = 0;
  for (let round = 1; round <= numRounds; round += 1) {
    for (let questionIndex = 1; questionIndex <= QUESTIONS_PER_ROUND; questionIndex += 1) {
      sessionRows.push({
        schedule_id: schedule.id,
        question_id: sampledQuestionSlugs[cursor]!,
        round_number: round,
        question_index: questionIndex,
      });
      cursor += 1;
    }
  }

  const mappingInsert = await admin.from("trivia_session_questions").insert(sessionRows);
  if (mappingInsert.error) {
    await admin.from("trivia_schedules").delete().eq("id", schedule.id);
    throw new Error(mappingInsert.error.message || "Failed to seed Live Showdown session questions.");
  }

  return mapScheduleRow(schedule);
}

export async function resetLiveShowdownAnswersForSchedule(scheduleIdRaw: string): Promise<{ deleted: number }> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) {
    throw new Error("scheduleId is required.");
  }

  const { data, error } = await admin
    .from("live_showdown_answers")
    .delete()
    .eq("schedule_id", scheduleId)
    .select("id");

  if (error) {
    throw new Error(error.message || "Failed to reset Live Showdown answers.");
  }

  return { deleted: Array.isArray(data) ? data.length : 0 };
}

export async function deleteAdminLiveShowdownSchedule(scheduleIdRaw: string): Promise<{ deleted: boolean }> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) {
    throw new Error("scheduleId is required.");
  }

  const { error: deleteSessionQuestionsError } = await admin
    .from("trivia_session_questions")
    .delete()
    .eq("schedule_id", scheduleId);

  if (deleteSessionQuestionsError) {
    throw new Error(deleteSessionQuestionsError.message || "Failed to delete Live Showdown session questions.");
  }

  const { error: deleteAnswersError } = await admin
    .from("live_showdown_answers")
    .delete()
    .eq("schedule_id", scheduleId);

  if (deleteAnswersError) {
    throw new Error(deleteAnswersError.message || "Failed to delete Live Showdown answers.");
  }

  const { data, error: deleteScheduleError } = await admin
    .from("trivia_schedules")
    .delete()
    .eq("id", scheduleId)
    .select("id");

  if (deleteScheduleError) {
    throw new Error(deleteScheduleError.message || "Failed to delete Live Showdown schedule.");
  }

  return { deleted: Array.isArray(data) && data.length > 0 };
}

export async function forceAdvanceLiveShowdownToNextQuestion(scheduleIdRaw: string): Promise<{
  updatedStartTime: string;
}> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) {
    throw new Error("scheduleId is required.");
  }

  const { data: scheduleRow, error: scheduleError } = await admin
    .from("trivia_schedules")
    .select("venue_id")
    .eq("id", scheduleId)
    .limit(1)
    .maybeSingle<{ venue_id: string | null }>();

  if (scheduleError) {
    throw new Error(scheduleError.message || "Failed to resolve schedule venue.");
  }

  const venueId = String(scheduleRow?.venue_id ?? "").trim();
  if (!venueId) {
    throw new Error("Selected schedule does not have a venue.");
  }

  const state = await getLiveShowdownState(Date.now(), venueId);
  if (!state.isGameActive) {
    throw new Error("No active Live Showdown game is running.");
  }
  if (state.scheduleId !== scheduleId) {
    throw new Error("The selected schedule is not currently active.");
  }

  const nextSlot = computeNextSlot({
    totalRounds: state.totalRounds,
    currentRound: state.currentRound,
    currentQuestionIndex: state.currentQuestionIndex,
    activePhase: state.activePhase,
  });

  if (!nextSlot) {
    throw new Error("No next question slot is available for this schedule.");
  }

  const elapsedToTargetMs =
    (nextSlot.round - 1) * ROUND_MS + (nextSlot.questionIndex - 1) * QUESTION_BLOCK_MS + 5_000;
  const newStartTimeIso = new Date(Date.now() - elapsedToTargetMs).toISOString();

  const { error } = await admin
    .from("trivia_schedules")
    .update({ start_time: newStartTimeIso })
    .eq("id", scheduleId);

  if (error) {
    throw new Error(error.message || "Failed to force advance Live Showdown phase.");
  }

  return { updatedStartTime: newStartTimeIso };
}
