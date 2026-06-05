import "server-only";

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

import { djb2, getLiveShowdownState } from "@/lib/liveShowdownEngine";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const QUESTIONS_PER_ROUND = 15;

function removeLiveTriviaQuestionFromJson(slug: string): void {
  const dir = join(process.cwd(), "data", "live-trivia", "categories");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf-8")) as {
        categoryName?: string;
        questions: Array<{ slug?: string }>;
      };
      const before = raw.questions.length;
      raw.questions = raw.questions.filter((q) => String(q.slug ?? "").trim() !== slug);
      if (raw.questions.length !== before) {
        writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");
        return;
      }
    } catch {
      // skip unreadable files
    }
  }
}
const QUESTION_BLOCK_MS = 60_000;
const ROUND_MS = 20 * 60_000;
const BLOCKED_LIVE_SHOWDOWN_CATEGORIES = new Set(["fantasy epics"]);

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
  recurring_type: "none" | "daily" | "weekly" | "monthly" | "yearly" | null;
  recurring_days: string[] | null;
  num_rounds: number;
  venue_id: string | null;
  intermission_ad_delay_seconds: number | null;
  lobby_ad_enabled: boolean | null;
  created_at: string;
  updated_at: string;
};

type TriviaScheduleRowLegacy = Omit<TriviaScheduleRow, "recurring_type" | "recurring_days">;

export type AdminLiveShowdownScheduleQuestion = {
  id: string;
  scheduleId: string;
  questionId: string;
  roundNumber: number;
  questionIndex: number;
  question: string;
  category: string | null;
  options: string[];
  correctAnswer: number;
  difficulty: string | null;
};

export type AdminLiveShowdownSchedule = {
  id: string;
  title: string;
  startTime: string;
  timezone: string;
  recurringType: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurringDays: string[];
  numRounds: number;
  venueId: string | null;
  intermissionAdDelaySeconds: number;
  lobbyAdEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function normalizeRecurringDays(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter((entry): entry is (typeof WEEKDAY_KEYS)[number] =>
      WEEKDAY_KEYS.includes(entry as (typeof WEEKDAY_KEYS)[number])
    );
  return Array.from(new Set(normalized));
}

function getAdminClient(): NonNullable<typeof supabaseAdmin> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
  return supabaseAdmin;
}

// Swaps a single seeded session slot for a fresh active question, used when an
// admin deletes a question that is still mapped to today's or a future
// occurrence. The replacement is deterministic per slot (djb2-seeded) so repeated
// calls converge on the same pick, avoids questions already used in the same
// occurrence, and records the new slug in venue_seen_questions.
export async function replaceSessionQuestion(
  scheduleId: string,
  occurrenceDate: string,
  roundNumber: number,
  questionIndex: number,
  venueId: string,
  excludeSlug: string
): Promise<void> {
  const admin = getAdminClient();
  const safeVenueId = String(venueId ?? "").trim();
  const safeExcludeSlug = String(excludeSlug ?? "").trim();

  // Slugs already used anywhere in this occurrence, so we don't introduce a repeat.
  const { data: usedData, error: usedError } = await admin
    .from("trivia_session_questions")
    .select("question_id")
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate);
  if (usedError) {
    throw new Error(usedError.message || "Failed to load occurrence question usage.");
  }
  const usedSlugs = new Set(
    ((usedData ?? []) as Array<{ question_id: string | null }>)
      .map((row) => String(row.question_id ?? "").trim())
      .filter(Boolean)
  );
  if (safeExcludeSlug) usedSlugs.add(safeExcludeSlug);

  // Active candidates in a deterministic base order (exclude the deleted slug).
  const { data: poolData, error: poolError } = await admin
    .from("trivia_questions")
    .select("slug")
    .eq("status", "active")
    .eq("question_pool", "live_showdown")
    .neq("slug", safeExcludeSlug)
    .not("slug", "is", null)
    .order("slug", { ascending: true })
    .limit(5000);
  if (poolError) {
    throw new Error(poolError.message || "Failed to load replacement question pool.");
  }

  const candidates = ((poolData ?? []) as Array<{ slug: string | null }>)
    .map((row) => String(row.slug ?? "").trim())
    .filter((slug) => slug && !usedSlugs.has(slug));
  if (candidates.length === 0) {
    throw new Error("No eligible replacement question is available for this slot.");
  }

  const seed = djb2(`${scheduleId}${occurrenceDate}${roundNumber}${questionIndex}`);
  const newSlug = candidates[seed % candidates.length];

  const { error: updateError } = await admin
    .from("trivia_session_questions")
    .update({ question_id: newSlug })
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex);
  if (updateError) {
    throw new Error(updateError.message || "Failed to replace session question.");
  }

  if (safeVenueId) {
    const { error: seenError } = await admin
      .from("venue_seen_questions")
      .upsert({ venue_id: safeVenueId, question_id: newSlug }, { onConflict: "venue_id,question_id", ignoreDuplicates: true });
    if (seenError) {
      throw new Error(seenError.message || "Failed to record replacement in venue seen questions.");
    }
  }
}

function clampRounds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

function mapScheduleRow(row: TriviaScheduleRow): AdminLiveShowdownSchedule {
  const recurringType =
    row.recurring_type === "daily" ||
    row.recurring_type === "weekly" ||
    row.recurring_type === "monthly" ||
    row.recurring_type === "yearly"
      ? row.recurring_type
      : "none";
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    timezone: row.timezone,
    recurringType,
    recurringDays: normalizeRecurringDays(row.recurring_days),
    numRounds: row.num_rounds,
    venueId: row.venue_id ?? null,
    intermissionAdDelaySeconds: Math.max(
      0,
      Math.min(300, Math.floor(Number(row.intermission_ad_delay_seconds ?? 10)))
    ),
    lobbyAdEnabled: Boolean(row.lobby_ad_enabled ?? true),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScheduleRowLegacy(row: TriviaScheduleRowLegacy): AdminLiveShowdownSchedule {
  return mapScheduleRow({ ...row, recurring_type: "none", recurring_days: null });
}

function isMissingRecurringColumnError(message: string | undefined): boolean {
  const normalized = String(message ?? "").toLowerCase();
  const mentionsRecurringColumn =
    normalized.includes("recurring_type") || normalized.includes("recurring_days");
  return mentionsRecurringColumn && (normalized.includes("does not exist") || normalized.includes("schema cache"));
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

function isBlockedLiveShowdownCategory(category: string | null | undefined): boolean {
  const normalized = normalizeCategory(category).toLowerCase();
  return BLOCKED_LIVE_SHOWDOWN_CATEGORIES.has(normalized);
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
    .eq("question_pool", "live_showdown")
    .eq("status", "active");

  if (error) {
    throw new Error(error.message || "Failed to load trivia questions for Live Showdown seeding.");
  }

  type EligibleRow = LiveShowdownQuestionRow & { slug: string };

  const rows = ((data ?? []) as LiveShowdownQuestionRow[])
    .filter((row) => String(row.slug ?? "").trim().length > 0)
    .map((row) => ({ ...row, slug: String(row.slug ?? "").trim() }) as EligibleRow);

  const liveEligible = rows.filter(
    (row) => isLiveShowdownEligibleAnswer(getCorrectAnswer(row))
  );

  // Build per-category buckets; shuffle each bucket for variety within the category.
  const byCategory = new Map<string, EligibleRow[]>();
  for (const row of liveEligible) {
    if (isBlockedLiveShowdownCategory(row.category)) {
      continue;
    }
    const cat = normalizeCategory(row.category);
    const list = byCategory.get(cat) ?? [];
    list.push(row);
    byCategory.set(cat, list);
  }
  for (const list of byCategory.values()) {
    shuffleInPlace(list);
  }

  // Only categories that can fully support one round are eligible.
  // Contract: each round must use a distinct category (no repeats in a game).
  const eligibleRoundCategories = Array.from(byCategory.entries())
    .filter(([, list]) => list.length >= 25)
    .map(([cat]) => cat);
  if (eligibleRoundCategories.length === 0) {
    throw new Error("No eligible Live Showdown categories are available for seeding.");
  }
  // Prefer no repeats: consume every available category once before any repeat.
  const selectedRoundCategories: string[] = [];
  const firstCycle = shuffleInPlace([...eligibleRoundCategories]);
  let cycle = [...firstCycle];
  while (selectedRoundCategories.length < numRounds) {
    if (cycle.length === 0) {
      cycle = shuffleInPlace([...eligibleRoundCategories]);
    }
    const next = cycle.shift();
    if (!next) break;
    selectedRoundCategories.push(next);
  }

  const used = new Set<string>();

  // Pick up to `count` unused questions from `source`, optionally filtered to `category`.
  // Enforces at most one closest-guess (standalone numeric answer) question per round
  // using the `numericUsed` accumulator passed in from the caller.
  const takeFrom = (
    source: EligibleRow[],
    count: number,
    category: string | undefined,
    numericUsed: { value: number },
    enforceNumericLimit = true
  ): string[] => {
    const picked: string[] = [];
    for (const row of source) {
      if (picked.length >= count) break;
      if (used.has(row.slug)) continue;
      if (category !== undefined && normalizeCategory(row.category) !== category) continue;
      const isNumeric = isStandaloneNumeric(getCorrectAnswer(row));
      if (enforceNumericLimit && isNumeric && numericUsed.value >= 1) continue;
      used.add(row.slug);
      picked.push(row.slug);
      if (isNumeric) numericUsed.value += 1;
    }
    return picked;
  };

  const rounds: string[][] = [];

  for (let round = 1; round <= numRounds; round += 1) {
    const preferredCategory = selectedRoundCategories[round - 1] ?? null;

    const roundSlugs: string[] = [];
    const numericUsed = { value: 0 };

    if (preferredCategory) {
      // 1. Live-eligible questions from preferred category.
      roundSlugs.push(...takeFrom(liveEligible, QUESTIONS_PER_ROUND, preferredCategory, numericUsed));
      // 2. Any live question from preferred category (broadest fallback within category).
      if (roundSlugs.length < QUESTIONS_PER_ROUND) {
        const catAll = byCategory.get(preferredCategory) ?? [];
        roundSlugs.push(
          ...takeFrom(catAll, QUESTIONS_PER_ROUND - roundSlugs.length, preferredCategory, numericUsed)
        );
      }
      // 4. Final in-category fallback without closest-guess cap to guarantee fill.
      if (roundSlugs.length < QUESTIONS_PER_ROUND) {
        const catAll = byCategory.get(preferredCategory) ?? [];
        roundSlugs.push(
          ...takeFrom(catAll, QUESTIONS_PER_ROUND - roundSlugs.length, preferredCategory, numericUsed, false)
        );
      }
    }

    if (roundSlugs.length < QUESTIONS_PER_ROUND) {
      throw new Error(
        `Unable to fill round ${round} for category "${preferredCategory}"; only ${roundSlugs.length}/${QUESTIONS_PER_ROUND} questions available.`
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
  const withRecurring = await admin
    .from("trivia_schedules")
    .select("id, title, start_time, timezone, recurring_type, recurring_days, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled, created_at, updated_at")
    .order("start_time", { ascending: false })
    .limit(safeLimit);

  if (withRecurring.error && isMissingRecurringColumnError(withRecurring.error.message)) {
    const legacy = await admin
      .from("trivia_schedules")
      .select("id, title, start_time, timezone, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled, created_at, updated_at")
      .order("start_time", { ascending: false })
      .limit(safeLimit);
    if (legacy.error) {
      throw new Error(legacy.error.message || "Failed to list Live Showdown schedules.");
    }
    return ((legacy.data ?? []) as TriviaScheduleRowLegacy[]).map(mapScheduleRowLegacy);
  }

  if (withRecurring.error) {
    throw new Error(withRecurring.error.message || "Failed to list Live Showdown schedules.");
  }

  return ((withRecurring.data ?? []) as TriviaScheduleRow[]).map(mapScheduleRow);
}

export async function createAdminLiveShowdownSchedule(params: {
  title: string;
  targetDate: string;
  startTime: string;
  timezone: string;
  recurringType?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurringDays?: string[];
  numRounds: number;
  venueId: string;
  intermissionAdDelaySeconds?: number;
  lobbyAdEnabled?: boolean;
}): Promise<AdminLiveShowdownSchedule> {
  const admin = getAdminClient();

  const title = String(params.title ?? "").trim();
  const targetDate = String(params.targetDate ?? "").trim();
  const startTime = String(params.startTime ?? "").trim();
  const timezone = String(params.timezone ?? "America/New_York").trim() || "America/New_York";
  const recurringType =
    params.recurringType === "daily" ||
    params.recurringType === "weekly" ||
    params.recurringType === "monthly" ||
    params.recurringType === "yearly"
      ? params.recurringType
      : "none";
  const recurringDays = normalizeRecurringDays(params.recurringDays);
  const venueId = String(params.venueId ?? "").trim();
  const numRounds = clampRounds(Number(params.numRounds));
  const intermissionAdDelaySeconds = Math.max(
    0,
    Math.min(300, Math.floor(Number(params.intermissionAdDelaySeconds ?? 10)))
  );
  const lobbyAdEnabled = params.lobbyAdEnabled !== false;

  if (!title || !targetDate || !startTime || !venueId) {
    throw new Error("title, targetDate, startTime, timezone, numRounds, and venueId are required.");
  }
  if (recurringType === "weekly" && recurringDays.length === 0) {
    throw new Error("Weekly recurring schedules require at least one recurring day.");
  }

  const startTimeIso = zonedDateTimeToUtcIso(targetDate, startTime, timezone);
  const sampledQuestionSlugs = await buildLiveShowdownQuestionMatrix(numRounds);

  const scheduleInsert = await admin
    .from("trivia_schedules")
    .insert({
      title,
      start_time: startTimeIso,
      timezone,
      recurring_type: recurringType,
      recurring_days: recurringDays,
      num_rounds: numRounds,
      venue_id: venueId,
      intermission_ad_delay_seconds: intermissionAdDelaySeconds,
      lobby_ad_enabled: lobbyAdEnabled,
    })
    .select("id, title, start_time, timezone, recurring_type, recurring_days, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled, created_at, updated_at")
    .single();

  let schedule: TriviaScheduleRow | null = null;
  if (scheduleInsert.error && isMissingRecurringColumnError(scheduleInsert.error.message)) {
    const legacyInsert = await admin
      .from("trivia_schedules")
      .insert({
        title,
        start_time: startTimeIso,
        timezone,
        num_rounds: numRounds,
        venue_id: venueId,
        intermission_ad_delay_seconds: intermissionAdDelaySeconds,
        lobby_ad_enabled: lobbyAdEnabled,
      })
      .select("id, title, start_time, timezone, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled, created_at, updated_at")
      .single();
    if (legacyInsert.error || !legacyInsert.data) {
      throw new Error(legacyInsert.error?.message || "Failed to create Live Showdown schedule.");
    }
    schedule = { ...(legacyInsert.data as TriviaScheduleRowLegacy), recurring_type: "none", recurring_days: null };
  } else if (scheduleInsert.error || !scheduleInsert.data) {
    throw new Error(scheduleInsert.error?.message || "Failed to create Live Showdown schedule.");
  } else {
    schedule = scheduleInsert.data as TriviaScheduleRow;
  }
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

export async function updateAdminLiveShowdownSchedule(params: {
  id: string;
  title: string;
  targetDate: string;
  startTime: string;
  timezone: string;
  recurringType?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurringDays?: string[];
  numRounds: number;
  venueId: string;
  intermissionAdDelaySeconds?: number;
  lobbyAdEnabled?: boolean;
}): Promise<AdminLiveShowdownSchedule> {
  const admin = getAdminClient();

  const scheduleId = String(params.id ?? "").trim();
  const title = String(params.title ?? "").trim();
  const targetDate = String(params.targetDate ?? "").trim();
  const startTime = String(params.startTime ?? "").trim();
  const timezone = String(params.timezone ?? "America/New_York").trim() || "America/New_York";
  const recurringType =
    params.recurringType === "daily" ||
    params.recurringType === "weekly" ||
    params.recurringType === "monthly" ||
    params.recurringType === "yearly"
      ? params.recurringType
      : "none";
  const recurringDays = normalizeRecurringDays(params.recurringDays);
  const venueId = String(params.venueId ?? "").trim();
  const numRounds = clampRounds(Number(params.numRounds));
  const intermissionAdDelaySeconds = Math.max(
    0,
    Math.min(300, Math.floor(Number(params.intermissionAdDelaySeconds ?? 10)))
  );
  const lobbyAdEnabled = params.lobbyAdEnabled !== false;

  if (!scheduleId) throw new Error("id is required.");
  if (!title || !targetDate || !startTime || !venueId) {
    throw new Error("title, targetDate, startTime, timezone, numRounds, and venueId are required.");
  }
  if (recurringType === "weekly" && recurringDays.length === 0) {
    throw new Error("Weekly recurring schedules require at least one recurring day.");
  }

  const startTimeIso = zonedDateTimeToUtcIso(targetDate, startTime, timezone);

  // Fetch the existing schedule to check if numRounds changed
  const { data: existing, error: fetchError } = await admin
    .from("trivia_schedules")
    .select("num_rounds")
    .eq("id", scheduleId)
    .maybeSingle<{ num_rounds: number }>();

  if (fetchError) {
    throw new Error(fetchError.message || "Failed to fetch existing schedule.");
  }

  const oldNumRounds = clampRounds(Number(existing?.num_rounds ?? 1));
  const roundsChanged = oldNumRounds !== numRounds;

  // If rounds changed, rebuild the question matrix
  if (roundsChanged) {
    const newQuestionSlugs = await buildLiveShowdownQuestionMatrix(numRounds);

    // Delete existing session questions
    const { error: deleteQuestionsError } = await admin
      .from("trivia_session_questions")
      .delete()
      .eq("schedule_id", scheduleId);

    if (deleteQuestionsError) {
      throw new Error(deleteQuestionsError.message || "Failed to remove old session questions.");
    }

    // Insert new session questions
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
          schedule_id: scheduleId,
          question_id: newQuestionSlugs[cursor]!,
          round_number: round,
          question_index: questionIndex,
        });
        cursor += 1;
      }
    }
    const { error: insertQuestionsError } = await admin
      .from("trivia_session_questions")
      .insert(sessionRows);

    if (insertQuestionsError) {
      throw new Error(insertQuestionsError.message || "Failed to seed new session questions.");
    }
  }

  // Update the schedule row
  const updateResult = await admin
    .from("trivia_schedules")
    .update({
      title,
      start_time: startTimeIso,
      timezone,
      recurring_type: recurringType,
      recurring_days: recurringDays,
      num_rounds: numRounds,
      venue_id: venueId,
      intermission_ad_delay_seconds: intermissionAdDelaySeconds,
      lobby_ad_enabled: lobbyAdEnabled,
    })
    .eq("id", scheduleId)
    .select("id, title, start_time, timezone, recurring_type, recurring_days, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled, created_at, updated_at")
    .single();

  if (updateResult.error && isMissingRecurringColumnError(updateResult.error.message)) {
    const legacyUpdate = await admin
      .from("trivia_schedules")
      .update({
        title,
        start_time: startTimeIso,
        timezone,
        num_rounds: numRounds,
        venue_id: venueId,
        intermission_ad_delay_seconds: intermissionAdDelaySeconds,
        lobby_ad_enabled: lobbyAdEnabled,
      })
      .eq("id", scheduleId)
      .select("id, title, start_time, timezone, num_rounds, venue_id, intermission_ad_delay_seconds, lobby_ad_enabled, created_at, updated_at")
      .single();

    if (legacyUpdate.error || !legacyUpdate.data) {
      throw new Error(legacyUpdate.error?.message || "Failed to update Live Showdown schedule.");
    }
    return mapScheduleRow({ ...(legacyUpdate.data as TriviaScheduleRowLegacy), recurring_type: "none", recurring_days: null });
  }

  if (updateResult.error || !updateResult.data) {
    throw new Error(updateResult.error?.message || "Failed to update Live Showdown schedule.");
  }

  return mapScheduleRow(updateResult.data as TriviaScheduleRow);
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

export async function getAdminLiveShowdownSessionQuestions(
  scheduleIdRaw: string
): Promise<AdminLiveShowdownScheduleQuestion[]> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) {
    throw new Error("scheduleId is required.");
  }

  // Fetch all session questions for this schedule
  const { data: sessionRows, error: sessionError } = await admin
    .from("trivia_session_questions")
    .select("id, schedule_id, question_id, round_number, question_index")
    .eq("schedule_id", scheduleId)
    .order("round_number", { ascending: true })
    .order("question_index", { ascending: true });

  if (sessionError) {
    throw new Error(sessionError.message || "Failed to load session questions.");
  }

  const rows = (sessionRows ?? []) as Array<{
    id: string;
    schedule_id: string;
    question_id: string | null;
    round_number: number;
    question_index: number;
  }>;

  if (rows.length === 0) return [];

  // Deduplicate question slugs and fetch their details
  const slugs = Array.from(
    new Set(rows.map((r) => String(r.question_id ?? "").trim()).filter(Boolean))
  );

  if (slugs.length === 0) return [];

  const { data: questionData, error: questionError } = await admin
    .from("trivia_questions")
    .select("slug, question, category, options, correct_answer, difficulty")
    .in("slug", slugs);

  if (questionError) {
    throw new Error(questionError.message || "Failed to load question details.");
  }

  const questionBySlug = new Map(
    ((questionData ?? []) as Array<{
      slug: string;
      question: string;
      category: string | null;
      options: unknown;
      correct_answer: number;
      difficulty: string | null;
    }>).map((row) => [
      row.slug,
      {
        question: row.question,
        category: row.category,
        options: Array.isArray(row.options) ? row.options.map((o) => String(o ?? "")) : [],
        correctAnswer: row.correct_answer,
        difficulty: row.difficulty,
      },
    ])
  );

  return rows.map((row) => {
    const slug = String(row.question_id ?? "").trim();
    const details = questionBySlug.get(slug);
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      questionId: slug,
      roundNumber: row.round_number,
      questionIndex: row.question_index,
      question: details?.question ?? "(Question not found)",
      category: details?.category ?? null,
      options: details?.options ?? [],
      correctAnswer: details?.correctAnswer ?? 0,
      difficulty: details?.difficulty ?? null,
    };
  });
}

export async function updateAdminLiveShowdownSessionQuestions(
  scheduleIdRaw: string,
  updates: Array<{
    id: string;
    roundNumber: number;
    questionIndex: number;
    questionId: string;
  }>
): Promise<void> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) {
    throw new Error("scheduleId is required.");
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error("At least one question update is required.");
  }

  const { error } = await admin
    .from("trivia_session_questions")
    .upsert(
      updates.map((u) => ({
        id: u.id,
        schedule_id: scheduleId,
        question_id: u.questionId,
        round_number: u.roundNumber,
        question_index: u.questionIndex,
      })),
      { onConflict: "id", ignoreDuplicates: false }
    );

  if (error) {
    throw new Error(error.message || "Failed to update session question ordering.");
  }
}

// ─── Single Question Replacement ────────────────────────────────────────────

/**
 * Replace a single question in a scheduled (non-occurrence) round with a
 * different question from the same category.  Used by the admin manage-view
 * "delete & replace" button so the round always stays full.
 *
 * The replaced question is soft-deleted in `trivia_questions` so it can never
 * appear in future rotation while historical joins and answer records stay intact.
 *
 * 1. Look up all question slugs already present in this schedule + round
 *    so we don't introduce a duplicate.
 * 2. Fetch eligible questions from `trivia_questions` that belong to the
 *    requested category.
 * 3. Exclude the slug being removed and any slug already used in this round.
 * 4. Check answer eligibility via `isLiveShowdownEligibleAnswer`.
 * 5. Pick a random candidate, UPDATE the session-question row's question_id.
 * 6. Mark the old question as deleted in `trivia_questions`.
 * 7. Return the full question details.
 */
export async function replaceSingleSessionQuestion(
  scheduleIdRaw: string,
  roundNumber: number,
  questionIndex: number,
  excludeSlug: string,
  category: string,
): Promise<AdminLiveShowdownScheduleQuestion> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) throw new Error("scheduleId is required.");
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new Error("roundNumber must be a positive integer.");
  }
  if (!Number.isInteger(questionIndex) || questionIndex < 1) {
    throw new Error("questionIndex must be a positive integer.");
  }
  const safeExclude = String(excludeSlug ?? "").trim();
  if (!safeExclude) throw new Error("excludeSlug is required.");
  const targetCategory = String(category ?? "").trim();
  if (!targetCategory) throw new Error("category is required.");

  // 1. Slugs already used in this schedule + round (so we don't repeat).
  const { data: usedData, error: usedError } = await admin
    .from("trivia_session_questions")
    .select("question_id")
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber);
  if (usedError) {
    throw new Error(usedError.message || "Failed to load round question usage.");
  }
  const usedSlugs = new Set(
    ((usedData ?? []) as Array<{ question_id: string | null }>)
      .map((r) => String(r.question_id ?? "").trim())
      .filter(Boolean),
  );
  usedSlugs.add(safeExclude);

  // 2. Fetch eligible questions from the same category.
  const { data, error } = await admin
    .from("trivia_questions")
    .select("id, slug, question, category, options, correct_answer, question_pool, difficulty")
    .eq("question_pool", "live_showdown")
    .eq("status", "active");

  if (error) {
    throw new Error(error.message || "Failed to load question pool.");
  }

  type EligibleRow = LiveShowdownQuestionRow & { slug: string; difficulty: string | null; question: string };

  const catCandidates = ((data ?? []) as Array<LiveShowdownQuestionRow & { difficulty: string | null; question: string }>)
    .filter((row) => {
      const slug = String(row.slug ?? "").trim();
      if (!slug) return false;
      if (usedSlugs.has(slug)) return false;
      if (normalizeCategory(row.category) !== targetCategory) return false;
      if (isBlockedLiveShowdownCategory(row.category)) return false;
      return isLiveShowdownEligibleAnswer(getCorrectAnswer(row));
    })
    .map((row) => ({ ...row, slug: String(row.slug ?? "").trim() }) as EligibleRow);

  if (catCandidates.length === 0) {
    throw new Error(
      `No eligible replacement question available in category "${targetCategory}" for this round. ` +
      `All questions in this category may already be in use or ineligible.`
    );
  }

  // 3. Pick a random candidate.
  const picked = catCandidates[Math.floor(Math.random() * catCandidates.length)];

  // Sanity-check the replacement slug before sending to the DB.
  const replacementSlug = String(picked.slug ?? "").trim();
  if (!replacementSlug) {
    throw new Error("Replacement question has an empty slug – cannot update session row.");
  }

  // 4. Update the session-question row in place (preserves id / round / index).
  const { error: updateError } = await admin
    .from("trivia_session_questions")
    .update({ question_id: replacementSlug })
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex);

  if (updateError) {
    throw new Error(updateError.message || "Failed to replace session question.");
  }

  // 5. Soft-delete the old question so it cannot be selected again.
  const { error: deleteError } = await admin
    .from("trivia_questions")
    .update({ status: "deleted" })
    .eq("slug", safeExclude);

  if (deleteError) {
    throw new Error(deleteError.message || "Failed to mark the replaced question as deleted.");
  }

  // Also remove from local JSON so re-imports don't resurrect it.
  removeLiveTriviaQuestionFromJson(safeExclude);

  return {
    id: "",
    scheduleId,
    questionId: picked.slug,
    roundNumber,
    questionIndex,
    question: picked.question,
    category: picked.category,
    options: coerceOptions(picked.options),
    correctAnswer: picked.correct_answer,
    difficulty: picked.difficulty,
  };
}

// Swaps a single session slot for a different question from the same category
// WITHOUT soft-deleting the old question. Use this when you want to rotate a
// question out of a schedule while keeping it available for future sessions.
export async function swapSessionQuestion(
  scheduleIdRaw: string,
  roundNumber: number,
  questionIndex: number,
  excludeSlug: string,
  category: string,
): Promise<AdminLiveShowdownScheduleQuestion> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) throw new Error("scheduleId is required.");
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new Error("roundNumber must be a positive integer.");
  }
  if (!Number.isInteger(questionIndex) || questionIndex < 1) {
    throw new Error("questionIndex must be a positive integer.");
  }
  const safeExclude = String(excludeSlug ?? "").trim();
  if (!safeExclude) throw new Error("excludeSlug is required.");
  const targetCategory = String(category ?? "").trim();
  if (!targetCategory) throw new Error("category is required.");

  const { data: usedData, error: usedError } = await admin
    .from("trivia_session_questions")
    .select("question_id")
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber);
  if (usedError) {
    throw new Error(usedError.message || "Failed to load round question usage.");
  }
  const usedSlugs = new Set(
    ((usedData ?? []) as Array<{ question_id: string | null }>)
      .map((r) => String(r.question_id ?? "").trim())
      .filter(Boolean),
  );
  usedSlugs.add(safeExclude);

  const { data, error } = await admin
    .from("trivia_questions")
    .select("id, slug, question, category, options, correct_answer, question_pool, difficulty")
    .eq("question_pool", "live_showdown")
    .eq("status", "active");

  if (error) {
    throw new Error(error.message || "Failed to load question pool.");
  }

  type EligibleRow = LiveShowdownQuestionRow & { slug: string; difficulty: string | null; question: string };

  const catCandidates = ((data ?? []) as Array<LiveShowdownQuestionRow & { difficulty: string | null; question: string }>)
    .filter((row) => {
      const slug = String(row.slug ?? "").trim();
      if (!slug) return false;
      if (usedSlugs.has(slug)) return false;
      if (normalizeCategory(row.category) !== targetCategory) return false;
      if (isBlockedLiveShowdownCategory(row.category)) return false;
      return isLiveShowdownEligibleAnswer(getCorrectAnswer(row));
    })
    .map((row) => ({ ...row, slug: String(row.slug ?? "").trim() }) as EligibleRow);

  if (catCandidates.length === 0) {
    throw new Error(
      `No eligible swap question available in category "${targetCategory}" for this round. ` +
      `All questions in this category may already be in use or ineligible.`
    );
  }

  const picked = catCandidates[Math.floor(Math.random() * catCandidates.length)];
  const replacementSlug = String(picked.slug ?? "").trim();
  if (!replacementSlug) {
    throw new Error("Replacement question has an empty slug – cannot update session row.");
  }

  const { error: updateError } = await admin
    .from("trivia_session_questions")
    .update({ question_id: replacementSlug })
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex);

  if (updateError) {
    throw new Error(updateError.message || "Failed to swap session question.");
  }

  return {
    id: "",
    scheduleId,
    questionId: picked.slug,
    roundNumber,
    questionIndex,
    question: picked.question,
    category: picked.category,
    options: coerceOptions(picked.options),
    correctAnswer: picked.correct_answer,
    difficulty: picked.difficulty,
  };
}

// ─── Round Category Replacement ──────────────────────────────────────────────

type CategoryCount = {
  category: string;
  count: number;
};

export async function getLiveShowdownRoundCategories(): Promise<CategoryCount[]> {
  const admin = getAdminClient();

  // 1. Fetch all active live_showdown / anytime_blitz questions from the DB.
  // We deliberately do NOT filter by isLiveShowdownEligibleAnswer here so that
  // every category present in the pool appears in the dropdown. The
  // replaceRoundQuestionsWithCategory function will validate eligibility at
  // replacement time and fail with a clear error if too few questions are usable.
  const { data, error } = await admin
    .from("trivia_questions")
    .select("id, slug, question, category, options, correct_answer, question_pool")
    .in("question_pool", ["live_showdown", "anytime_blitz"])
    .eq("status", "active");

  if (error) {
    throw new Error(error.message || "Failed to load categories.");
  }

  const byCategory = new Map<string, number>();
  for (const row of ((data ?? []) as LiveShowdownQuestionRow[])) {
    if (!String(row.slug ?? "").trim()) continue;
    if (isBlockedLiveShowdownCategory(row.category)) continue;
    const cat = normalizeCategory(row.category);
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
  }

  // 2. Also read file-based categories (e.g. us-states.v1.json) that may not
  //    exist in the database yet.  Only add a category if it isn't already
  //    present from the DB – the DB count is authoritative for existing ones.
  try {
    const filesDir = join(process.cwd(), "data", "live-trivia", "categories");
    const files = readdirSync(filesDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(filesDir, file), "utf-8")) as {
        categoryName?: string;
        questions: Array<{ slug: string }>;
      };
      const categoryName = String(raw.categoryName || "").trim() ||
        file.replace(/\.v\d+\.json$/i, "").replace(/-/g, " ");
      if (!categoryName || isBlockedLiveShowdownCategory(categoryName)) continue;
      if (!byCategory.has(categoryName)) {
        byCategory.set(categoryName, Array.isArray(raw.questions) ? raw.questions.length : 0);
      }
    }
  } catch {
    // If the files directory can't be read, fall back to DB-only categories
  }

  return Array.from(byCategory.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export async function replaceRoundQuestionsWithCategory(
  scheduleIdRaw: string,
  roundNumber: number,
  category: string
): Promise<AdminLiveShowdownScheduleQuestion[]> {
  const admin = getAdminClient();
  const scheduleId = String(scheduleIdRaw ?? "").trim();
  if (!scheduleId) throw new Error("scheduleId is required.");
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new Error("roundNumber must be a positive integer.");
  }
  const targetCategory = String(category ?? "").trim();
  if (!targetCategory) throw new Error("category is required.");

  // ---- Check if this category comes from a file-based bank ----
  type FileBasedQuestion = {
    slug: string;
    question: string;
    answer: string;
    acceptableAnswers?: unknown;
    answer_format: string;
    category: string;
    difficulty: string;
  };
  let fileQuestions: FileBasedQuestion[] | null = null;

  try {
    const filesDir = join(process.cwd(), "data", "live-trivia", "categories");
    const files = readdirSync(filesDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(filesDir, file), "utf-8")) as {
        categoryName?: string;
        questions: FileBasedQuestion[];
      };
      const catName = String(raw.categoryName || "").trim() ||
        file.replace(/\.v\d+\.json$/i, "").replace(/-/g, " ");
      if (catName === targetCategory) {
        fileQuestions = Array.isArray(raw.questions) ? raw.questions : [];
        break;
      }
    }
  } catch {
    // If files can't be read, fall through to DB-only logic below
  }

  // If we found the category in a file, upsert those questions into the DB
  // so the runtime engine can find them by slug.
  if (fileQuestions) {
    const eligible = fileQuestions.filter((q) => {
      const answer = String(q.answer ?? "").trim();
      return answer.length > 0 && isLiveShowdownEligibleAnswer(answer);
    });

    if (eligible.length < QUESTIONS_PER_ROUND) {
      throw new Error(
        `Category "${targetCategory}" only has ${eligible.length} eligible file-based questions; ${QUESTIONS_PER_ROUND} are required to fill a round.`
      );
    }

    const eligibleSlugs = eligible
      .map((q) => String(q.slug ?? "").trim())
      .filter(Boolean);
    const deletedSlugs = new Set<string>();

    if (eligibleSlugs.length > 0) {
      const { data: existingRows, error: existingError } = await admin
        .from("trivia_questions")
        .select("slug, status")
        .in("slug", eligibleSlugs);
      if (existingError) {
        throw new Error(existingError.message || "Failed to check deleted-question status.");
      }
      for (const row of (existingRows ?? []) as Array<{ slug: string | null; status: string | null }>) {
        const slug = String(row.slug ?? "").trim();
        if (slug && row.status === "deleted") {
          deletedSlugs.add(slug);
        }
      }
    }

    const importable = eligible.filter((q) => !deletedSlugs.has(String(q.slug ?? "").trim()));

    // Mark DB-active questions for this category that no longer exist in the JSON as deleted.
    // This handles the case where a question was manually removed from the JSON file.
    const jsonSlugSet = new Set(
      (fileQuestions ?? []).map((q) => String(q.slug ?? "").trim()).filter(Boolean)
    );
    const { data: dbActiveRows } = await admin
      .from("trivia_questions")
      .select("slug")
      .eq("question_pool", "live_showdown")
      .eq("status", "active")
      .eq("category", targetCategory);
    const slugsRemovedFromJson = ((dbActiveRows ?? []) as Array<{ slug: string | null }>)
      .map((r) => String(r.slug ?? "").trim())
      .filter((s) => s && !jsonSlugSet.has(s));
    if (slugsRemovedFromJson.length > 0) {
      await admin
        .from("trivia_questions")
        .update({ status: "deleted" })
        .in("slug", slugsRemovedFromJson);
    }

    if (importable.length < QUESTIONS_PER_ROUND) {
      throw new Error(
        `Category "${targetCategory}" only has ${importable.length} eligible non-deleted file-based questions; ${QUESTIONS_PER_ROUND} are required to fill a round.`
      );
    }

    // Upsert each eligible, non-deleted question into trivia_questions so slugs exist at runtime
    for (const q of importable) {
      const answer = String(q.answer ?? "").trim();
      const acceptableAnswers = Array.isArray(q.acceptableAnswers)
        ? Array.from(
            new Map(
              q.acceptableAnswers
                .map((entry) => String(entry ?? "").trim())
                .filter(Boolean)
                .filter((entry) => entry.toLowerCase().replace(/\s+/g, " ") !== answer.toLowerCase().replace(/\s+/g, " "))
                .map((entry) => [entry.toLowerCase().replace(/\s+/g, " "), entry])
            ).values()
          )
        : [];
      const upsertPayload = {
        slug: q.slug,
        question: q.question,
        category: targetCategory,
        options: [answer, ...acceptableAnswers],
        correct_answer: 0,
        question_pool: "live_showdown" as const,
        status: "active",
        difficulty: q.difficulty || "medium",
        answer_format: "write_in",
      };
      const { error: upsertError } = await admin
        .from("trivia_questions")
        .upsert(upsertPayload, { onConflict: "slug", ignoreDuplicates: false });

      if (upsertError) {
        throw new Error(upsertError.message || `Failed to upsert question "${q.slug}" into the question bank.`);
      }
    }

    // After upserting, re-fetch from DB to get full rows (including difficulty)
    const { data: refetched, error: refetchError } = await admin
      .from("trivia_questions")
      .select("id, slug, question, category, options, correct_answer, question_pool, difficulty")
      .in("slug", importable.map((q) => q.slug));

    if (refetchError) {
      throw new Error(refetchError.message || "Failed to re-fetch upserted questions.");
    }

    type EligibleRow = LiveShowdownQuestionRow & { slug: string; difficulty: string | null; question: string };

    const picked = shuffleInPlace(
      ((refetched ?? []) as Array<LiveShowdownQuestionRow & { difficulty: string | null; question: string }>)
        .filter((row) => String(row.slug ?? "").trim().length > 0)
        .map((row) => ({ ...row, slug: String(row.slug ?? "").trim() }) as EligibleRow)
    ).slice(0, QUESTIONS_PER_ROUND);

    // Delete existing session questions for this schedule + round
    const { error: deleteError } = await admin
      .from("trivia_session_questions")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("round_number", roundNumber);

    if (deleteError) {
      throw new Error(deleteError.message || "Failed to delete existing round questions.");
    }

    // Insert new questions
    const inserts = picked.map((row, idx) => ({
      schedule_id: scheduleId,
      question_id: row.slug,
      round_number: roundNumber,
      question_index: idx + 1,
    }));

    const { error: insertError } = await admin
      .from("trivia_session_questions")
      .insert(inserts);

    if (insertError) {
      throw new Error(insertError.message || "Failed to insert new round questions.");
    }

    return picked.map((row, idx) => ({
      id: "",
      scheduleId,
      questionId: row.slug,
      roundNumber,
      questionIndex: idx + 1,
      question: row.question,
      category: row.category,
      options: coerceOptions(row.options),
      correctAnswer: row.correct_answer,
      difficulty: row.difficulty,
    }));
  }

  // ---- DB-only fallback for categories already in the database ----
  const { data, error } = await admin
    .from("trivia_questions")
    .select("id, slug, question, category, options, correct_answer, question_pool, difficulty")
    .in("question_pool", ["live_showdown", "anytime_blitz"])
    .eq("status", "active");

  if (error) {
    throw new Error(error.message || "Failed to load question pool.");
  }

  type EligibleRow = LiveShowdownQuestionRow & { slug: string; difficulty: string | null; question: string };

  const rows = ((data ?? []) as Array<LiveShowdownQuestionRow & { difficulty: string | null; question: string }>)
    .filter((row) => String(row.slug ?? "").trim().length > 0)
    .map((row) => ({ ...row, slug: String(row.slug ?? "").trim() }) as EligibleRow);

  // Filter to the requested category
  const catRows = rows.filter(
    (row) =>
      normalizeCategory(row.category) === targetCategory &&
      !isBlockedLiveShowdownCategory(row.category) &&
      isLiveShowdownEligibleAnswer(getCorrectAnswer(row))
  );

  if (catRows.length < QUESTIONS_PER_ROUND) {
    throw new Error(
      `Category "${targetCategory}" only has ${catRows.length} eligible questions; ${QUESTIONS_PER_ROUND} are required to fill a round.`
    );
  }

  // Shuffle and pick QUESTIONS_PER_ROUND questions
  const shuffled = shuffleInPlace([...catRows]);
  const picked = shuffled.slice(0, QUESTIONS_PER_ROUND);

  // Delete existing session questions for this schedule + round
  const { error: deleteError } = await admin
    .from("trivia_session_questions")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("round_number", roundNumber);

  if (deleteError) {
    throw new Error(deleteError.message || "Failed to delete existing round questions.");
  }

  // Insert new questions
  const inserts = picked.map((row, idx) => ({
    schedule_id: scheduleId,
    question_id: row.slug,
    round_number: roundNumber,
    question_index: idx + 1,
  }));

  const { error: insertError } = await admin
    .from("trivia_session_questions")
    .insert(inserts);

  if (insertError) {
    throw new Error(insertError.message || "Failed to insert new round questions.");
  }

  // Build and return the inserted questions with full details
  return picked.map((row, idx) => ({
    id: "", // id won't be available since we didn't select after insert
    scheduleId,
    questionId: row.slug,
    roundNumber,
    questionIndex: idx + 1,
    question: row.question,
    category: row.category,
    options: coerceOptions(row.options),
    correctAnswer: row.correct_answer,
    difficulty: row.difficulty,
  }));
}
