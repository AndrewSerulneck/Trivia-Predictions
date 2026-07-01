import "server-only";

import fs from "node:fs";
import path from "node:path";
import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import {
  buildClosestGuessAnnouncement,
  computeClosestGuessWinners,
  parseLargePureNumberAnswer,
} from "@/lib/liveShowdownClosestGuess";
import {
  buildBandTargets,
  buildQuestionProfile,
  createEmptyBandCounts,
  getSourceBand,
  getSourcePercentile,
  normalizeDiversityText,
  RECENT_TOPIC_WINDOW,
  scoreCandidate,
  violatesHardSpacing,
  violatesSlugFamilySpacing,
  violatesTemplateSpacing,
  type LiveTriviaQuestionProfile,
  type LiveTriviaSourceBand,
} from "@/lib/liveTriviaSeeding";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const QUESTIONS_PER_ROUND = 15;
const ANSWERING_MS = 60_000;
const REST_WARNING_MS = 15_000;
const QUESTION_BLOCK_MS = ANSWERING_MS + REST_WARNING_MS; // 75 sec
const QUESTION_WINDOW_MS = QUESTIONS_PER_ROUND * QUESTION_BLOCK_MS; // 18 min 45 sec
const MID_GAME_BREAK_MS = 525_000; // 8 min 45 sec
const ROUND_MS = QUESTION_WINDOW_MS + MID_GAME_BREAK_MS; // 27 min 30 sec
const BLOCKED_LIVE_SHOWDOWN_CATEGORIES = new Set(["fantasy epics"]);
const RECENT_CATEGORY_COOLDOWN_OCCURRENCES = 3;
const RECENT_CATEGORY_SLOT_LOOKBACK_LIMIT = 360;
const LIVE_TRIVIA_POOL_PAGE_SIZE = 1000;

export type LiveShowdownPhase = "answering" | "rest_warning" | "mid_game_break";

export type TriviaScheduleRow = {
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

export type LiveTriviaSeedQuestion = {
  slug: string | null;
  question?: string | null;
  category: string | null;
  subcategory?: string | null;
  options: unknown;
  correct_answer: number;
  question_pool: "anytime_blitz" | "live_showdown";
  source_order?: number | null;
  source_file?: string | null;
};

export type LiveTriviaSeedSlot = {
  slug: string;
  category: string;
  roundNumber: number;
  questionIndex: number;
  wasSeen: boolean;
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

let cachedLiveTriviaSourceMetadata: Map<string, { sourceFile: string; sourceOrder: number; subcategory: string | null }> | null = null;

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

function normalizeLiveTriviaCategory(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
  return normalized || "General";
}

function isBlockedLiveTriviaCategory(value: string | null | undefined): boolean {
  return BLOCKED_LIVE_SHOWDOWN_CATEGORIES.has(normalizeLiveTriviaCategory(value).toLowerCase());
}

function getLiveTriviaCorrectAnswer(row: Pick<LiveTriviaSeedQuestion, "options" | "correct_answer">): string {
  const options = coerceOptions(row.options);
  const answerIndex = Number.isInteger(row.correct_answer) ? row.correct_answer : -1;
  if (answerIndex < 0 || answerIndex >= options.length) return "";
  return String(options[answerIndex] ?? "").trim();
}

function countAnswerWords(answer: string): number {
  if (!answer) return 0;
  return answer.split(/\s+/).map((part) => part.trim()).filter(Boolean).length;
}

function isLiveTriviaSeedAnswerAllowed(answerRaw: unknown): boolean {
  const answer = String(answerRaw ?? "").trim().replace(/\s+/g, " ");
  if (!answer) return false;
  if (parseLargePureNumberAnswer(answer) !== null) return true;
  return countAnswerWords(answer) <= 2;
}

type NormalizedLiveTriviaSeedQuestion = LiveTriviaSeedQuestion & {
  slug: string;
  category: string;
  question: string;
  sourceOrder: number;
  sourcePercentile: number;
  sourceBand: LiveTriviaSourceBand;
};

function buildSeedKey(parts: readonly string[]): number {
  return djb2(parts.join(":"));
}

function getFiniteSourceOrder(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function getLiveTriviaSourceFile(value: unknown): string {
  return String(value ?? "").trim();
}

function readLiveTriviaSourceMetadata(): Map<string, { sourceFile: string; sourceOrder: number; subcategory: string | null }> {
  if (cachedLiveTriviaSourceMetadata) return cachedLiveTriviaSourceMetadata;

  const metadata = new Map<string, { sourceFile: string; sourceOrder: number; subcategory: string | null }>();
  const directory = path.join(process.cwd(), "data", "live-trivia", "categories");
  try {
    if (!fs.existsSync(directory)) {
      cachedLiveTriviaSourceMetadata = metadata;
      return metadata;
    }

    const files = fs.readdirSync(directory).filter((file) => file.endsWith(".json")).sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      const filePath = path.join(directory, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const questions = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions)
          ? (parsed as { questions: unknown[] }).questions
          : [];

      questions.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const slug = String((item as { slug?: unknown }).slug ?? "").trim();
        if (!slug) return;
        const subcategoryRaw = (item as { subcategory?: unknown }).subcategory;
        const subcategory = subcategoryRaw != null ? String(subcategoryRaw).trim() || null : null;
        metadata.set(slug, { sourceFile: file, sourceOrder: index, subcategory });
      });
    }
    cachedLiveTriviaSourceMetadata = metadata;
  } catch (error) {
    console.warn(
      `[live-trivia][source-metadata] Unable to load canonical JSON source metadata: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return cachedLiveTriviaSourceMetadata ?? metadata;
}

function mergeLiveTriviaSourceMetadata(rows: readonly LiveTriviaSeedQuestion[]): LiveTriviaSeedQuestion[] {
  const metadata = readLiveTriviaSourceMetadata();
  if (metadata.size === 0) return rows.slice();

  return rows.map((row) => {
    const slug = String(row.slug ?? "").trim();
    const fallback = metadata.get(slug);
    if (!fallback) return row;

    return {
      ...row,
      source_order: getFiniteSourceOrder(row.source_order) ?? fallback.sourceOrder,
      source_file: getLiveTriviaSourceFile(row.source_file) || fallback.sourceFile,
      subcategory: String(row.subcategory ?? "").trim() || fallback.subcategory,
    };
  });
}

export async function loadActiveLiveTriviaSeedQuestionPool(
  admin: NonNullable<typeof supabaseAdmin>
): Promise<LiveTriviaSeedQuestion[]> {
  const rows: LiveTriviaSeedQuestion[] = [];

  for (let from = 0; ; from += LIVE_TRIVIA_POOL_PAGE_SIZE) {
    const { data, error } = await admin
      .from("trivia_questions")
      .select("slug, question, category, subcategory, options, correct_answer, question_pool, source_order, source_file")
      .eq("status", "active")
      .eq("question_pool", "live_showdown")
      .not("slug", "is", null)
      .order("slug", { ascending: true })
      .range(from, from + LIVE_TRIVIA_POOL_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message || "Failed to load active Live Trivia question pool.");
    }

    const batch = (data ?? []) as LiveTriviaSeedQuestion[];
    rows.push(...batch);
    if (batch.length < LIVE_TRIVIA_POOL_PAGE_SIZE) break;
  }

  return mergeLiveTriviaSourceMetadata(rows);
}

type LiveTriviaCandidatePick = {
  row: NormalizedLiveTriviaSeedQuestion;
  wasSeen: boolean;
  profile: LiveTriviaQuestionProfile;
};

function isBelowBandTarget(profile: LiveTriviaQuestionProfile, bandCounts: Record<LiveTriviaSourceBand, number>, targetBandCounts: Record<LiveTriviaSourceBand, number>): boolean {
  return bandCounts[profile.sourceBand] < targetBandCounts[profile.sourceBand];
}

function pickLowestPenaltyCandidate(
  candidates: readonly LiveTriviaCandidatePick[],
  state: {
    recentProfiles: readonly LiveTriviaQuestionProfile[];
    bandCounts: Record<LiveTriviaSourceBand, number>;
    targetBandCounts: Record<LiveTriviaSourceBand, number>;
  }
): LiveTriviaCandidatePick | null {
  let best: LiveTriviaCandidatePick | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const penalty = scoreCandidate(candidate.profile, state, candidate.wasSeen);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = candidate;
    }
  }

  return best;
}

function countTopicTokenOverlap(left: Set<string>, right: Set<string>, ignoredTokens: ReadonlySet<string> = new Set()): number {
  let overlap = 0;
  for (const token of left) {
    if (ignoredTokens.has(token)) continue;
    if (right.has(token)) overlap += 1;
  }
  return overlap;
}

function getCategoryTokens(...categories: readonly string[]): Set<string> {
  return new Set(
    categories.flatMap((category) => normalizeDiversityText(category).split(" ").filter(Boolean))
  );
}

function hasRecentTopicOverlap(
  profile: LiveTriviaQuestionProfile,
  recentProfiles: readonly LiveTriviaQuestionProfile[]
): boolean {
  return recentProfiles.slice(-RECENT_TOPIC_WINDOW).some((recent) => {
    const ignoredTokens = getCategoryTokens(profile.category, recent.category);
    return recent.cluster === profile.cluster || countTopicTokenOverlap(recent.topicTokens, profile.topicTokens, ignoredTokens) > 0;
  });
}

function pickBalancedRoundQuestions(params: {
  rows: readonly NormalizedLiveTriviaSeedQuestion[];
  seenSlugs: ReadonlySet<string>;
  usedInOccurrence: Set<string>;
  recentProfiles: LiveTriviaQuestionProfile[];
  scheduleSeed: number;
  count: number;
}): LiveTriviaCandidatePick[] {
  const candidates = seededShuffle(params.rows, params.scheduleSeed)
    .map((row) => ({ row, wasSeen: params.seenSlugs.has(row.slug), profile: buildQuestionProfile(row) }))
    .filter((candidate) => !params.usedInOccurrence.has(candidate.row.slug));
  const picked: LiveTriviaCandidatePick[] = [];
  const bandCounts = createEmptyBandCounts();
  const targetBandCounts = buildBandTargets(params.count);

  while (picked.length < params.count && candidates.length > 0) {
    const state = { recentProfiles: params.recentProfiles, bandCounts, targetBandCounts };
    const hardSpacing = candidates.filter((candidate) => !violatesHardSpacing(candidate.profile, params.recentProfiles));
    const hardSpacingWithoutTopicOverlap = hardSpacing.filter(
      (candidate) => !hasRecentTopicOverlap(candidate.profile, params.recentProfiles)
    );
    const templateRelaxed = candidates.filter(
      (candidate) =>
        !violatesSlugFamilySpacing(candidate.profile, params.recentProfiles) &&
        violatesTemplateSpacing(candidate.profile, params.recentProfiles)
    );
    const slugRelaxed = candidates.filter((candidate) => violatesSlugFamilySpacing(candidate.profile, params.recentProfiles));
    // Phase 3 — strict per-category exhaustion: every UNSEEN candidate must be
    // preferred over any SEEN candidate, regardless of how far spacing has to be
    // relaxed. Spacing/topic/band quality only breaks ties *within* the unseen set
    // (and within the seen set). This guarantees a question never repeats at a venue
    // until that category's entire unseen pool is consumed.
    const orderedBySpacing = [
      hardSpacingWithoutTopicOverlap.filter((candidate) => isBelowBandTarget(candidate.profile, bandCounts, targetBandCounts)),
      hardSpacingWithoutTopicOverlap,
      hardSpacing.filter((candidate) => isBelowBandTarget(candidate.profile, bandCounts, targetBandCounts)),
      hardSpacing,
      templateRelaxed,
      slugRelaxed,
      candidates,
    ];
    const unseenOf = (tier: LiveTriviaCandidatePick[]) => tier.filter((candidate) => !candidate.wasSeen);
    const seenOf = (tier: LiveTriviaCandidatePick[]) => tier.filter((candidate) => candidate.wasSeen);
    const tiers = [
      ...orderedBySpacing.map(unseenOf),
      ...orderedBySpacing.map(seenOf),
    ];
    const activeTier = tiers.find((tier) => tier.length > 0) ?? [];
    const selected = pickLowestPenaltyCandidate(activeTier, state);
    if (!selected) break;
    const bestIndex = candidates.indexOf(selected);
    const [candidate] = candidates.splice(bestIndex, 1);
    if (!candidate) break;
    params.usedInOccurrence.add(candidate.row.slug);
    params.recentProfiles.push(candidate.profile);
    bandCounts[candidate.profile.sourceBand] += 1;
    picked.push(candidate);
  }

  return picked;
}

function applySourceMetadata(
  row: Omit<NormalizedLiveTriviaSeedQuestion, "sourceOrder" | "sourcePercentile" | "sourceBand">,
  index: number,
  total: number,
  explicitSourceTotal?: number
): NormalizedLiveTriviaSeedQuestion {
  const explicitSourceOrder = getFiniteSourceOrder(row.source_order);
  const sourceOrder = explicitSourceOrder ?? index;
  const sourceTotal = explicitSourceOrder === null ? total : Math.max(total, explicitSourceTotal ?? total);
  const sourcePercentile = getSourcePercentile(sourceOrder, sourceTotal);
  return {
    ...row,
    sourceOrder,
    sourcePercentile,
    sourceBand: getSourceBand(sourcePercentile),
  };
}

export function buildLiveTriviaOccurrenceSeedSlots(params: {
  questions: readonly LiveTriviaSeedQuestion[];
  seenSlugs: ReadonlySet<string>;
  recentCategories?: ReadonlyArray<string>;
  scheduleId: string;
  occurrenceDate: string;
  venueId: string;
  numRounds: number;
  questionsPerRound?: number;
}): { slots: LiveTriviaSeedSlot[]; usedSeen: boolean; repeatedQuestions: boolean; usedRecentCategory: boolean; usedOverflow: boolean } {
  const safeVenueId = toSafeVenueId(params.venueId);
  const rounds = clampRounds(params.numRounds);
  const questionsPerRound = Math.max(1, Math.min(100, Math.floor(Number(params.questionsPerRound ?? QUESTIONS_PER_ROUND))));
  const totalSlots = rounds * questionsPerRound;
  const byCategory = new Map<string, NormalizedLiveTriviaSeedQuestion[]>();
  // recentCategories is ordered most-recently-used first; normalize in place so
  // the ordering is preserved for the cooldown cap.
  const recentCategoryNormalized = (params.recentCategories ?? [])
    .map((category) => normalizeLiveTriviaCategory(category))
    .filter(Boolean);
  const recentCategorySet = new Set(recentCategoryNormalized);

  for (const row of params.questions) {
    const slug = String(row.slug ?? "").trim();
    if (!slug) continue;
    if (row.question_pool !== "live_showdown") continue;
    if (isBlockedLiveTriviaCategory(row.category)) continue;
    if (!isLiveTriviaSeedAnswerAllowed(getLiveTriviaCorrectAnswer(row))) continue;

    const category = normalizeLiveTriviaCategory(row.category);
    const question = String(row.question ?? "").trim();
    const list = byCategory.get(category) ?? [];
    list.push({ ...row, slug, category, question, sourceOrder: list.length, sourcePercentile: 0, sourceBand: "middle" });
    byCategory.set(category, list);
  }

  for (const [category, list] of byCategory.entries()) {
    const sorted = list.slice().sort((a, b) => {
      const leftOrder = getFiniteSourceOrder(a.source_order);
      const rightOrder = getFiniteSourceOrder(b.source_order);
      if (leftOrder !== null && rightOrder !== null) {
        const fileCompare = getLiveTriviaSourceFile(a.source_file).localeCompare(getLiveTriviaSourceFile(b.source_file));
        if (fileCompare !== 0) return fileCompare;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      }
      if (leftOrder !== null) return -1;
      if (rightOrder !== null) return 1;
      return a.slug.localeCompare(b.slug);
    });
    const explicitSourceOrders = sorted.map((row) => getFiniteSourceOrder(row.source_order)).filter((value): value is number => value !== null);
    const explicitSourceTotal = explicitSourceOrders.length > 0 ? Math.max(...explicitSourceOrders) + 1 : sorted.length;
    byCategory.set(
      category,
      sorted.map((row, index) => applySourceMetadata(row, index, sorted.length, explicitSourceTotal))
    );
  }

  const fullRoundCategories = Array.from(byCategory.entries())
    .filter(([, list]) => list.length >= questionsPerRound)
    .map(([category]) => category)
    .sort((a, b) => a.localeCompare(b));
  const fallbackCategories = Array.from(byCategory.entries())
    .filter(([, list]) => list.length > 0)
    .map(([category]) => category)
    .sort((a, b) => a.localeCompare(b));
  const baseCategories = fullRoundCategories.length > 0 ? fullRoundCategories : fallbackCategories;
  const freshCategories = baseCategories.filter((category) => !recentCategorySet.has(category));
  // Build cooledCategories in recency order (most-recently-used first) by walking
  // the recency-ordered input array and keeping only categories present in baseCategories.
  const baseCategorySet = new Set(baseCategories);
  const seenInCooled = new Set<string>();
  const cooledCategories = recentCategoryNormalized.filter((c) => {
    if (!baseCategorySet.has(c) || seenInCooled.has(c)) return false;
    seenInCooled.add(c);
    return true;
  });
  // Cap: never put more categories in cooldown than what leaves at least `rounds`
  // fresh categories. With 8 categories and 5 rounds, at most 3 can be cooled.
  // Without this cap, RECENT_CATEGORY_COOLDOWN_OCCURRENCES × rounds-per-night
  // can exceed the total category count and make freshCategories always empty.
  // The cap keeps the most-recently-used categories cooled and releases the
  // stalest ones back to fresh priority (front of array = most recent = stays cooled).
  const maxCooledCount = Math.max(0, baseCategories.length - rounds);
  const effectiveCooledCategories = cooledCategories.slice(0, maxCooledCount);
  const effectiveFreshCategories = [...freshCategories, ...cooledCategories.slice(maxCooledCount)];
  const eligibleCategories = [...effectiveFreshCategories, ...effectiveCooledCategories];

  if (eligibleCategories.length === 0) {
    return { slots: [], usedSeen: false, repeatedQuestions: false, usedRecentCategory: false, usedOverflow: false };
  }

  const selectedCategories: string[] = [];
  const selectedSet = new Set<string>();
  let cycleIndex = 0;
  while (selectedCategories.length < rounds) {
    const freshSeed = buildSeedKey([
      "live-trivia",
      "categories",
      "fresh",
      safeVenueId,
      params.occurrenceDate,
      params.scheduleId,
      String(cycleIndex),
    ]);
    const cooledSeed = buildSeedKey([
      "live-trivia",
      "categories",
      "cooled",
      safeVenueId,
      params.occurrenceDate,
      params.scheduleId,
      String(cycleIndex),
    ]);
    const cycle = [
      ...seededShuffle(effectiveFreshCategories, freshSeed),
      ...seededShuffle(effectiveCooledCategories, cooledSeed),
    ];
    let addedThisCycle = 0;
    for (const category of cycle) {
      if (selectedCategories.length >= rounds) break;
      // Allow repeats only after all eligible categories have been used once
      if (selectedSet.has(category) && selectedSet.size < eligibleCategories.length) continue;
      selectedCategories.push(category);
      selectedSet.add(category);
      addedThisCycle += 1;
    }
    // Safety valve: if a full cycle added nothing (e.g. eligibleCategories is empty), stop
    if (addedThisCycle === 0) break;
    cycleIndex += 1;
  }

  const slots: LiveTriviaSeedSlot[] = [];
  const usedInOccurrence = new Set<string>();
  const recentProfiles: LiveTriviaQuestionProfile[] = [];
  let usedSeen = false;
  let repeatedQuestions = false;
  let usedRecentCategory = false;
  let usedOverflow = false;

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const category = selectedCategories[roundIndex] ?? eligibleCategories[0]!;
    if (recentCategorySet.has(category)) usedRecentCategory = true;
    const categoryRows = byCategory.get(category) ?? [];
    const roundQuestionSeed = buildSeedKey([
      "live-trivia",
      "questions",
      safeVenueId,
      params.occurrenceDate,
      params.scheduleId,
      category,
      String(roundIndex + 1),
    ]);

    const picked = pickBalancedRoundQuestions({
      rows: categoryRows,
      seenSlugs: params.seenSlugs,
      usedInOccurrence,
      recentProfiles,
      count: questionsPerRound,
      scheduleSeed: roundQuestionSeed,
    });
    if (picked.some((candidate) => candidate.wasSeen)) usedSeen = true;

    if (picked.length < questionsPerRound) {
      // Phase 2: before repeating, draw unseen questions from other categories.
      const overflowRows = Array.from(byCategory.entries())
        .filter(([cat]) => cat !== category)
        .flatMap(([, rows]) => rows)
        .filter((row) => !params.seenSlugs.has(row.slug));

      if (overflowRows.length > 0) {
        const overflowSeed = buildSeedKey([
          "live-trivia",
          "questions",
          "overflow",
          safeVenueId,
          params.occurrenceDate,
          params.scheduleId,
          category,
          String(roundIndex + 1),
        ]);
        const overflowPicked = pickBalancedRoundQuestions({
          rows: overflowRows,
          seenSlugs: params.seenSlugs,
          usedInOccurrence,
          recentProfiles,
          count: questionsPerRound - picked.length,
          scheduleSeed: overflowSeed,
        });
        if (overflowPicked.length > 0) usedOverflow = true;
        for (const p of overflowPicked) {
          picked.push(p);
        }
      }
    }

    if (picked.length < questionsPerRound) {
      // Last resort: repeat from the primary category (seen questions allowed).
      const repeatPool = seededShuffle(categoryRows, roundQuestionSeed ^ 0x9e3779b9);
      let repeatIndex = 0;
      while (picked.length < questionsPerRound && repeatPool.length > 0) {
        const repeatRow = repeatPool[repeatIndex % repeatPool.length]!;
        const repeatSlug = repeatRow.slug;
        const profile = buildQuestionProfile(repeatRow);
        const wasSeen = params.seenSlugs.has(repeatSlug);
        picked.push({ row: repeatRow, wasSeen, profile });
        recentProfiles.push(profile);
        if (wasSeen) usedSeen = true;
        repeatedQuestions = true;
        repeatIndex += 1;
      }
    }

    for (let questionIndex = 0; questionIndex < picked.length; questionIndex += 1) {
      const candidate = picked[questionIndex]!;
      slots.push({
        slug: candidate.row.slug,
        category: candidate.profile.category,
        roundNumber: roundIndex + 1,
        questionIndex: questionIndex + 1,
        wasSeen: candidate.wasSeen,
      });
    }

    if (slots.length >= totalSlots) break;
  }

  return { slots: slots.slice(0, totalSlots), usedSeen, repeatedQuestions, usedRecentCategory, usedOverflow };
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

// A single concrete occurrence of a schedule: when it starts, when it ends, and
// the calendar date (in the schedule's timezone) used to key its seeded questions.
export type ScheduleOccurrence = {
  startMs: number;
  endMs: number;
  occurrenceDate: string; // YYYY-MM-DD in the schedule's timezone
};

// SINGLE SOURCE OF TRUTH for occurrence enumeration. Every code path that needs to
// know when a schedule's games happen — the seeding cron, the live-state resolver,
// and the grader (via the live-state resolver) — derives occurrences from this one
// function, so they can never disagree on a game's start/end window or its
// occurrence date. Returns all candidate occurrences within a window around nowMs,
// sorted ascending by start time, honoring recurring_type / recurring_days in the
// schedule's timezone. One-time / monthly / yearly schedules yield their single
// fixed start. Returns [] when start_time is unparseable.
export function enumerateScheduleOccurrences(row: TriviaScheduleRow, nowMs: number): ScheduleOccurrence[] {
  const baseStartMs = Date.parse(String(row.start_time ?? ""));
  if (!Number.isFinite(baseStartMs)) return [];

  const recurringType = normalizeRecurringType(row.recurring_type);
  const rowTimezone = String(row.timezone ?? "America/New_York").trim() || "America/New_York";
  const rounds = clampRounds(Number(row.num_rounds));
  const dayMs = 24 * 60 * 60 * 1000;

  const toOccurrence = (startMs: number): ScheduleOccurrence => ({
    startMs,
    endMs: startMs + rounds * ROUND_MS,
    occurrenceDate: formatZonedDate(startMs, rowTimezone),
  });

  // none / monthly / yearly are treated as a single fixed start at baseStartMs.
  if (recurringType !== "daily" && recurringType !== "weekly") {
    return [toOccurrence(baseStartMs)];
  }

  const baseStartParts = getTimeZoneParts(new Date(baseStartMs), rowTimezone);
  const recurringDays = normalizeRecurringDays(row.recurring_days);
  const effectiveDays =
    recurringType === "daily"
      ? WEEKDAY_KEYS
      : recurringDays.length > 0
      ? recurringDays
      : [baseStartParts.weekday];

  const occurrences: ScheduleOccurrence[] = [];
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
    occurrences.push(toOccurrence(occurrenceMs));
  }
  occurrences.sort((a, b) => a.startMs - b.startMs);
  return occurrences;
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
  let activeCandidate: { row: TriviaScheduleRow; occurrence: ScheduleOccurrence } | null = null;
  let upcomingCandidate: { row: TriviaScheduleRow; occurrence: ScheduleOccurrence } | null = null;

  for (const row of rows) {
    for (const occurrence of enumerateScheduleOccurrences(row, nowMs)) {
      if (nowMs >= occurrence.startMs && nowMs < occurrence.endMs) {
        // Most-recently-started active occurrence wins.
        if (!activeCandidate || occurrence.startMs > activeCandidate.occurrence.startMs) {
          activeCandidate = { row, occurrence };
        }
      } else if (occurrence.startMs > nowMs) {
        // Soonest upcoming occurrence wins.
        if (!upcomingCandidate || occurrence.startMs < upcomingCandidate.occurrence.startMs) {
          upcomingCandidate = { row, occurrence };
        }
      }
    }
  }

  const active = activeCandidate
    ? {
        ...activeCandidate.row,
        start_time: new Date(activeCandidate.occurrence.startMs).toISOString(),
        occurrenceDate: activeCandidate.occurrence.occurrenceDate,
      }
    : null;
  const upcoming = upcomingCandidate
    ? {
        ...upcomingCandidate.row,
        start_time: new Date(upcomingCandidate.occurrence.startMs).toISOString(),
        occurrenceDate: upcomingCandidate.occurrence.occurrenceDate,
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

  const { data: sessionRowData, error: sessionRowError } = await admin
    .from("trivia_session_questions")
    .select("id, schedule_id, question_id, round_number, question_index")
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate)
    .eq("round_number", roundNumber)
    .eq("question_index", questionIndex)
    .limit(1)
    .maybeSingle();

  if (sessionRowError) {
    throw new Error(sessionRowError.message || "Failed to load session question mapping.");
  }

  let sessionRow = (sessionRowData as TriviaSessionQuestionRow | null) ?? null;

  // If no occurrence-specific row found, fall back to template rows (occurrence_date IS NULL).
  // These are inserted by admin round-replace/reorder operations, which write without an occurrence_date.
  if (!sessionRow) {
    const { data: templateData, error: templateError } = await admin
      .from("trivia_session_questions")
      .select("id, schedule_id, question_id, round_number, question_index")
      .eq("schedule_id", scheduleId)
      .is("occurrence_date", null)
      .eq("round_number", roundNumber)
      .eq("question_index", questionIndex)
      .limit(1)
      .maybeSingle();

    if (templateError) {
      throw new Error(templateError.message || "Failed to load template session question mapping.");
    }
    sessionRow = (templateData as TriviaSessionQuestionRow | null) ?? null;
  }

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

  const { data, error } = await admin
    .from("live_showdown_answers")
    .select("submitted_answer, is_correct, points_awarded")
    .eq("user_id", userId)
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate)
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

  const { data, error } = await admin
    .from("live_showdown_answers")
    .select("id, user_id, submitted_answer, normalized_answer, is_correct, points_awarded")
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate)
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
    const { error: clearError } = await admin
      .from("live_showdown_answers")
      .update({ is_correct: false })
      .eq("schedule_id", scheduleId)
      .eq("occurrence_date", occurrenceDate)
      .eq("round_number", roundNumber)
      .eq("question_index", questionIndex);

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
export async function findOccurrencesToSeed(
  nowMs: number,
  lookaheadMs = SEED_LOOKAHEAD_MS
): Promise<LiveOccurrenceSeedTarget[]> {
  const rows = await loadScheduleRows();
  const targets: LiveOccurrenceSeedTarget[] = [];

  for (const row of rows) {
    const venueId = toSafeVenueId(String(row.venue_id ?? ""));
    if (!venueId) continue;

    const rounds = clampRounds(Number(row.num_rounds));

    // Seed every occurrence that's active now or starting within the lookahead
    // window — not just the first match. A currently-active occurrence (e.g. a
    // prior night's session still inside its round window) must not block
    // seeding of the next upcoming occurrence; seedOccurrenceQuestions is
    // idempotent per (scheduleId, occurrenceDate), so seeding both is safe.
    const seenOccurrenceDates = new Set<string>();
    for (const occurrence of enumerateScheduleOccurrences(row, nowMs)) {
      const isActive = nowMs >= occurrence.startMs && nowMs < occurrence.endMs;
      const isUpcoming = occurrence.startMs > nowMs && occurrence.startMs - nowMs <= lookaheadMs;
      if (!isActive && !isUpcoming) continue;
      if (seenOccurrenceDates.has(occurrence.occurrenceDate)) continue;
      seenOccurrenceDates.add(occurrence.occurrenceDate);
      targets.push({
        scheduleId: row.id,
        occurrenceDate: occurrence.occurrenceDate,
        venueId,
        numRounds: rounds,
      });
    }
  }

  return targets;
}

async function loadRecentVenueLiveTriviaCategories(
  venueId: string,
  occurrenceDate: string
): Promise<string[]> {
  const admin = supabaseAdmin;
  const safeVenueId = toSafeVenueId(venueId);
  if (!admin || !safeVenueId) return [];

  try {
    const venueSchedules = await loadScheduleRows(safeVenueId);
    const scheduleIds = venueSchedules.map((row) => String(row.id ?? "").trim()).filter(Boolean);
    if (scheduleIds.length === 0) return [];

    const { data: slotData, error: slotError } = await admin
      .from("trivia_session_questions")
      .select("occurrence_date, question_id")
      .in("schedule_id", scheduleIds)
      .lt("occurrence_date", occurrenceDate)
      .order("occurrence_date", { ascending: false })
      .limit(RECENT_CATEGORY_SLOT_LOOKBACK_LIMIT);
    if (slotError) {
      console.warn(
        `[seedOccurrenceQuestions] skipped recent category cooldown for venue ${safeVenueId}: ` +
          `${slotError.message ?? "failed to load recent occurrence slots"}.`
      );
      return [];
    }

    const recentRows = ((slotData ?? []) as Array<{ occurrence_date: string | null; question_id: string | null }>)
      .map((row) => ({
        occurrenceDate: String(row.occurrence_date ?? "").trim(),
        questionId: String(row.question_id ?? "").trim(),
      }))
      .filter((row) => row.occurrenceDate && row.questionId);

    const recentDates: string[] = [];
    const recentDateSet = new Set<string>();
    for (const row of recentRows) {
      if (recentDateSet.has(row.occurrenceDate)) continue;
      recentDateSet.add(row.occurrenceDate);
      recentDates.push(row.occurrenceDate);
      if (recentDates.length >= RECENT_CATEGORY_COOLDOWN_OCCURRENCES) break;
    }

    if (recentDates.length === 0) return [];
    const recentQuestionIds = Array.from(
      new Set(
        recentRows
          .filter((row) => recentDateSet.has(row.occurrenceDate))
          .map((row) => row.questionId)
      )
    );
    if (recentQuestionIds.length === 0) return [];

    // Track the most recent occurrence date each question ID appeared in.
    // recentRows is ordered DESC by occurrence_date so first seen = most recent.
    const mostRecentDateByQuestionId = new Map<string, string>();
    for (const row of recentRows) {
      if (!mostRecentDateByQuestionId.has(row.questionId)) {
        mostRecentDateByQuestionId.set(row.questionId, row.occurrenceDate);
      }
    }

    const { data: questionData, error: questionError } = await admin
      .from("trivia_questions")
      .select("slug, category")
      .in("slug", recentQuestionIds)
      .eq("question_pool", "live_showdown")
      .limit(RECENT_CATEGORY_SLOT_LOOKBACK_LIMIT);
    if (questionError) {
      console.warn(
        `[seedOccurrenceQuestions] skipped recent category cooldown for venue ${safeVenueId}: ` +
          `${questionError.message ?? "failed to load recent categories"}.`
      );
      return [];
    }

    // For each category, find the most recent occurrence date any of its questions appeared in.
    const mostRecentDateByCategory = new Map<string, string>();
    for (const row of (questionData ?? []) as Array<{ slug: string | null; category: string | null }>) {
      const category = normalizeLiveTriviaCategory(row.category);
      if (!category) continue;
      const questionId = String(row.slug ?? "").trim();
      const occDate = mostRecentDateByQuestionId.get(questionId) ?? "";
      const existing = mostRecentDateByCategory.get(category) ?? "";
      if (!existing || occDate > existing) {
        mostRecentDateByCategory.set(category, occDate);
      }
    }

    // Return categories sorted most-recently-used first so the cooldown cap in
    // buildLiveTriviaOccurrenceSeedSlots releases the stalest categories first.
    return Array.from(mostRecentDateByCategory.keys()).sort((a, b) => {
      const dateA = mostRecentDateByCategory.get(a) ?? "";
      const dateB = mostRecentDateByCategory.get(b) ?? "";
      return dateB.localeCompare(dateA);
    });
  } catch (error) {
    console.warn(
      `[seedOccurrenceQuestions] skipped recent category cooldown for venue ${safeVenueId}: ` +
        `${error instanceof Error ? error.message : "unknown error"}.`
    );
    return [];
  }
}

// How many full rounds' worth of recently-seen questions to carry forward (hold
// back) when a category's epoch resets, so a question never reappears back-to-back
// across the reset seam.
const CATEGORY_RESET_CARRY_FORWARD_ROUNDS = 2;

// Phase 3 — per-category epoch reset. For each category whose entire active pool
// has been seen at this venue, free the oldest-seen questions (making them eligible
// again) while keeping the most-recent `carryForward` as still-seen. Returns the set
// of freed slugs so the caller can drop them from the in-memory seen set. Best-effort:
// a failure to reset one category never blocks seeding.
async function resetExhaustedVenueCategories(
  admin: NonNullable<typeof supabaseAdmin>,
  venueId: string,
  pool: readonly LiveTriviaSeedQuestion[],
  seenAtBySlug: ReadonlyMap<string, string>
): Promise<Set<string>> {
  const slugsByCategory = new Map<string, string[]>();
  for (const row of pool) {
    const slug = String(row.slug ?? "").trim();
    if (!slug) continue;
    if (row.question_pool !== "live_showdown") continue;
    if (isBlockedLiveTriviaCategory(row.category)) continue;
    if (!isLiveTriviaSeedAnswerAllowed(getLiveTriviaCorrectAnswer(row))) continue;
    const category = normalizeLiveTriviaCategory(row.category);
    const list = slugsByCategory.get(category) ?? [];
    list.push(slug);
    slugsByCategory.set(category, list);
  }

  const freed = new Set<string>();
  for (const [category, slugs] of slugsByCategory) {
    const seenInCategory = slugs.filter((slug) => seenAtBySlug.has(slug));
    // Only reset once a category is fully exhausted. A 1-question category can't be
    // meaningfully rotated, so leave it alone (its repeats are unavoidable).
    if (seenInCategory.length < slugs.length || slugs.length < 2) continue;

    const carryForward = Math.min(
      QUESTIONS_PER_ROUND * CATEGORY_RESET_CARRY_FORWARD_ROUNDS,
      Math.floor(slugs.length / 2)
    );
    // Free the oldest-seen questions; keep the most-recent `carryForward` as seen.
    const oldestFirst = seenInCategory
      .slice()
      .sort((a, b) => (seenAtBySlug.get(a) ?? "").localeCompare(seenAtBySlug.get(b) ?? ""));
    const toFree = oldestFirst.slice(0, Math.max(0, seenInCategory.length - carryForward));
    if (toFree.length === 0) continue;

    let deleteFailed = false;
    for (let start = 0; start < toFree.length; start += 100) {
      const batch = toFree.slice(start, start + 100);
      const { error: deleteError } = await admin
        .from("venue_seen_questions")
        .delete()
        .eq("venue_id", venueId)
        .in("question_id", batch);
      if (deleteError) {
        console.error(
          `[seedOccurrenceQuestions] Failed to reset category "${category}" for venue ${venueId}: ${deleteError.message}`
        );
        deleteFailed = true;
        break;
      }
      for (const slug of batch) freed.add(slug);
    }
    if (deleteFailed) continue;

    // Best-effort audit row — never blocks seeding.
    void admin
      .from("venue_category_resets")
      .insert({
        venue_id: venueId,
        category,
        category_total: slugs.length,
        freed_count: toFree.length,
        carried_forward_count: seenInCategory.length - toFree.length,
      })
      .then(({ error }) => {
        if (error) {
          console.error("[seedOccurrenceQuestions] Failed to record category reset:", error.message);
        }
      });
  }
  return freed;
}

// Seeds trivia_session_questions for one occurrence. Idempotent: if rows already
// exist for (schedule_id, occurrence_date) it returns without re-seeding.
// Questions are selected category-first, deduplicated against venue_seen_questions
// when inventory allows, and shuffled with per-(venue, date, schedule) seeds.
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
  const { count: existingCount, error: existingError } = await admin
    .from("trivia_session_questions")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate);
  if (existingError) {
    throw new Error(existingError.message || "Failed to check existing occurrence questions.");
  }
  if ((existingCount ?? 0) > 0) {
    return { seeded: 0, skipped: totalSlots };
  }

  // Slugs already used at this venue, with recency for per-category epoch resets.
  const { data: seenData, error: seenError } = await admin
    .from("venue_seen_questions")
    .select("question_id, seen_at")
    .eq("venue_id", safeVenueId);
  if (seenError) {
    throw new Error(seenError.message || "Failed to load venue seen questions.");
  }
  const seenAtBySlug = new Map<string, string>();
  for (const r of (seenData ?? []) as Array<{ question_id: string | null; seen_at?: string | null }>) {
    const slug = String(r.question_id ?? "").trim();
    if (slug) seenAtBySlug.set(slug, String(r.seen_at ?? ""));
  }

  // Active question pool in a deterministic base order, with source metadata
  // from DB columns or canonical JSON fallback.
  const poolData = await loadActiveLiveTriviaSeedQuestionPool(admin);

  // Phase 3 — recycle fully-exhausted categories (per-category epoch reset) before
  // seeding, holding back the most-recent questions to avoid back-to-back repeats.
  const freedSlugs = await resetExhaustedVenueCategories(admin, safeVenueId, poolData, seenAtBySlug);
  const seenSlugs = new Set(
    Array.from(seenAtBySlug.keys()).filter((slug) => !freedSlugs.has(slug))
  );

  const recentCategories = await loadRecentVenueLiveTriviaCategories(safeVenueId, occurrenceDate);
  const seedResult = buildLiveTriviaOccurrenceSeedSlots({
    questions: poolData,
    seenSlugs,
    recentCategories,
    scheduleId,
    occurrenceDate,
    venueId: safeVenueId,
    numRounds: rounds,
    questionsPerRound: QUESTIONS_PER_ROUND,
  });

  if (seedResult.slots.length === 0) {
    // No active questions at all — nothing we can seed.
    return { seeded: 0, skipped: totalSlots };
  }

  if (
    seedResult.usedSeen ||
    seedResult.repeatedQuestions ||
    seedResult.usedOverflow ||
    seedResult.slots.length < totalSlots
  ) {
    console.warn(
      `[seedOccurrenceQuestions] venue ${safeVenueId} question inventory pressure for ${occurrenceDate} ` +
        `(seeded=${seedResult.slots.length}, needed=${totalSlots}, usedSeen=${seedResult.usedSeen}, ` +
        `repeatedQuestions=${seedResult.repeatedQuestions}, usedOverflow=${seedResult.usedOverflow}, ` +
        `usedRecentCategory=${seedResult.usedRecentCategory}, recentCategoryCount=${recentCategories.length}).`
    );
    // Persist warning row — best-effort, never blocks seeding.
    void admin
      .from("venue_question_warnings")
      .insert({
        venue_id: safeVenueId,
        schedule_id: scheduleId,
        occurrence_date: occurrenceDate,
        used_seen: seedResult.usedSeen,
        repeated_questions: seedResult.repeatedQuestions,
        used_recent_category: seedResult.usedRecentCategory,
        used_overflow: seedResult.usedOverflow,
        seeded_count: seedResult.slots.length,
        needed_count: totalSlots,
      })
      .then(({ error }) => {
        if (error) {
          console.error("[seedOccurrenceQuestions] Failed to persist question warning:", error.message);
        }
      });
  }

  const sessionRows = seedResult.slots.map((slot) => ({
    schedule_id: scheduleId,
    occurrence_date: occurrenceDate,
    question_id: slot.slug,
    round_number: slot.roundNumber,
    question_index: slot.questionIndex,
  }));

  const { error: insertError } = await admin
    .from("trivia_session_questions")
    .upsert(sessionRows, {
      onConflict: "schedule_id,occurrence_date,round_number,question_index",
      ignoreDuplicates: true,
    });
  if (insertError) {
    throw new Error(insertError.message || "Failed to seed occurrence questions.");
  }

  const seenRows = Array.from(new Set(seedResult.slots.map((slot) => slot.slug))).map((slug) => ({
    venue_id: safeVenueId,
    question_id: slug,
  }));
  const { error: seenUpsertError } = await admin
    .from("venue_seen_questions")
    .upsert(seenRows, { onConflict: "venue_id,question_id", ignoreDuplicates: true });
  if (seenUpsertError) {
    throw new Error(seenUpsertError.message || "Failed to record venue seen questions.");
  }

  return { seeded: seedResult.slots.length, skipped: Math.max(0, totalSlots - seedResult.slots.length) };
}

// Returns how many questions are seeded for a given occurrence and whether the
// count meets the expected total. Used by the pre-game verification cron so it
// can surface genuine under-fill even after the idempotency guard exits early.
export async function getOccurrenceReadiness(
  scheduleId: string,
  occurrenceDate: string,
  numRounds: number
): Promise<{ seededCount: number; expectedCount: number; ready: boolean }> {
  const admin = supabaseAdmin;
  const expectedCount = clampRounds(numRounds) * QUESTIONS_PER_ROUND;
  if (!admin) return { seededCount: 0, expectedCount, ready: false };

  const { count, error } = await admin
    .from("trivia_session_questions")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate);
  if (error) throw new Error(error.message || "Failed to check occurrence readiness.");

  const seededCount = count ?? 0;
  return { seededCount, expectedCount, ready: seededCount >= expectedCount };
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

  const { data: slotData, error: slotError } = await admin
    .from("trivia_session_questions")
    .select("round_number, question_id")
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate)
    .eq("question_index", 1);
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

  const { data: answerData, error: answerError } = await admin
    .from("live_showdown_answers")
    .select("user_id, round_number, points_awarded, is_correct")
    .eq("schedule_id", scheduleId)
    .eq("occurrence_date", occurrenceDate);
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

// In-process guard for lazy seeding. Keyed by "scheduleId:occurrenceDate".
// Prevents concurrent client polls from all racing through the idempotency
// COUNT check before the first insert commits and launching N parallel seeds.
const lazySeedInFlight = new Set<string>();

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

  // Lazy seeding safety net: if the cron missed this occurrence, seed it now.
  // The in-process guard lets exactly one concurrent poll trigger the seed; the
  // rest skip silently and rely on the seeded rows being visible on their next
  // poll (or on a subsequent DB read within the same request via the state query).
  const lazySeedKey = `${active.id}:${occurrenceDate}`;
  if (!lazySeedInFlight.has(lazySeedKey)) {
    lazySeedInFlight.add(lazySeedKey);
    seedOccurrenceQuestions(active.id, occurrenceDate, String(venueId), totalRounds)
      .catch((err) => {
        console.error(
          "[getLiveShowdownState] lazy seed failed for",
          active.id,
          occurrenceDate,
          ":",
          err instanceof Error ? err.message : err
        );
      })
      .finally(() => {
        lazySeedInFlight.delete(lazySeedKey);
      });
  }
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
    currentRound === totalRounds;
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
