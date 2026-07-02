import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { replaceSessionQuestion } from "@/lib/liveShowdownAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getInlineSlotRegistryEntries } from "@/lib/adSlotRegistry";
import {
  isAdTypeSupportedForPage,
  isDisplayTriggerSupportedForPlacement,
  isSlotCompatibleWithAdType,
  normalizeAdPlacementMeta,
} from "@/lib/adPlacements";
import { getPredictionMarketById, listResolvedPredictionOutcomes } from "@/lib/polymarket";
import { listPickEmGames, listPickEmSports, type PickEmSportSlug } from "@/lib/pickem";
import { buildGeographicHierarchy, type GeographicHierarchy } from "@/lib/geographicHierarchy";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType, Advertisement, TriviaQuestion, Venue } from "@/types";

type TriviaQuestionRow = {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
  question_pool: "anytime_blitz" | "live_showdown" | null;
  answer_format: "multiple_choice" | "write_in" | "numeric" | "true_false" | null;
  created_at: string;
};

type AdvertisementRow = {
  id: string;
  slot: AdSlot;
  slot_key: string;
  priority: number;
  is_placeholder: boolean | null;
  page_key: AdPageKey | null;
  ad_type: AdType | null;
  display_trigger: AdDisplayTrigger | null;
  placement_key: string | null;
  round_number: number | null;
  sequence_index: number | null;
  venue_id: string | null;
  venue_ids: string[] | null;
  target_all_venues: boolean | null;
  target_cities: string[] | null;
  target_zip_codes: string[] | null;
  target_counties: string[] | null;
  target_states: string[] | null;
  target_regions: string[] | null;
  advertiser_name: string;
  frequency_interval: number | null;
  image_url: string;
  click_url: string;
  alt_text: string;
  width: number;
  height: number;
  dismiss_delay_seconds: number | null;
  popup_cooldown_seconds: number | null;
  active: boolean;
  start_date: string;
  end_date: string | null;
  impressions: number;
  clicks: number;
};

type AdEventRow = {
  ad_id: string;
  event_type: "impression" | "click";
  created_at: string;
};

type PendingPredictionRow = {
  id: string;
  user_id: string;
  prediction_id: string;
  outcome_id: string;
  outcome_title: string;
  points: number;
  status: "pending" | "won" | "lost" | "push" | "canceled";
  market_question?: string | null;
  created_at: string;
};

type AdminUserRow = {
  id: string;
  username: string;
  venue_id: string;
  points: number;
  is_admin: boolean;
  created_at: string;
};

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
  logo_text: string | null;
  icon_emoji: string | null;
  street: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  county: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  place_id: string | null;
  screen_enabled?: boolean | null;
  screen_brand_image_url?: string | null;
  screen_brand_primary?: string | null;
  screen_brand_secondary?: string | null;
  screen_sponsor_rotation_enabled?: boolean | null;
};

type VenueScreenSponsorRow = {
  id: string;
  venue_id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

type PickEmPendingGameRow = {
  game_id: string;
  home_team: string;
  away_team: string;
  home_team_id: string | null;
  away_team_id: string | null;
  starts_at: string;
  league: string;
  sport_slug: string;
};

type PickEmPendingPickRow = {
  id: string;
  user_id: string;
  selected_team_id: string | null;
  reward_points: number;
};

type PickEmMatchupRow = {
  game_id: string;
  home_team: string;
  away_team: string;
  home_team_id: string | null;
  away_team_id: string | null;
  starts_at: string;
  league: string;
  sport_slug: string;
  status: "pending" | "won" | "lost" | "push" | "canceled";
  winning_team_id: string | null;
};

type VenueGeoRow = {
  id: string;
  name: string;
  display_name: string | null;
  street: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  region: string | null;
};

type GeographicAdFilterInput = {
  regionKey?: string;
  stateCode?: string;
  cityName?: string;
  zipCode?: string;
  venueId?: string;
};

let geographicHierarchyCache: { value: GeographicHierarchy; expiresAtMs: number } | null = null;
const GEOGRAPHIC_HIERARCHY_CACHE_MS = 5 * 60 * 1000;

function mapTriviaRow(row: TriviaQuestionRow): TriviaQuestion {
  const options = Array.isArray(row.options) ? row.options.map((option) => String(option ?? "").trim()) : [];
  const answerIndex = Number.isInteger(row.correct_answer) ? row.correct_answer : -1;
  const canonicalAnswer = answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] ?? "" : "";
  return {
    id: row.id,
    question: row.question,
    options,
    correctAnswer: row.correct_answer,
    acceptableAnswers:
      row.answer_format === "write_in" || row.answer_format === "numeric" || row.answer_format === "true_false"
        ? sanitizeAcceptableAnswers(options.filter((_, index) => index !== answerIndex), canonicalAnswer)
        : undefined,
    category: row.category ?? undefined,
    difficulty: row.difficulty ?? undefined,
    questionPool: row.question_pool === "live_showdown" ? "live_showdown" : "anytime_blitz",
    answerFormat:
      row.answer_format === "write_in" ||
      row.answer_format === "numeric" ||
      row.answer_format === "true_false"
        ? row.answer_format
        : "multiple_choice",
    createdAt: row.created_at,
  };
}

function normalizeAnswerKey(value: string): string {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function sanitizeAcceptableAnswers(values: unknown, canonicalAnswer: string): string[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set([normalizeAnswerKey(canonicalAnswer)]);
  const answers: string[] = [];
  for (const value of values) {
    const answer = String(value ?? "").trim();
    const key = normalizeAnswerKey(answer);
    if (!answer || !key || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }
  return answers;
}

function mapAdRow(row: AdvertisementRow): Advertisement {
  const venueIds = Array.isArray(row.venue_ids) ? row.venue_ids : row.venue_id ? [row.venue_id] : [];
  const cities = Array.isArray(row.target_cities) ? row.target_cities : [];
  const zipCodes = Array.isArray(row.target_zip_codes) ? row.target_zip_codes : [];
  const counties = Array.isArray(row.target_counties) ? row.target_counties : [];
  const states = Array.isArray(row.target_states) ? row.target_states : [];
  const regions = Array.isArray(row.target_regions) ? row.target_regions : [];

  return {
    id: row.id,
    slot: row.slot,
    slotKey: row.slot_key,
    priority: row.priority ?? 0,
    isPlaceholder: Boolean(row.is_placeholder ?? false),
    pageKey: (row.page_key ?? "global") as AdPageKey,
    adType: (row.ad_type ?? "inline") as AdType,
    displayTrigger: (row.display_trigger ?? "on-load") as AdDisplayTrigger,
    placementKey: row.placement_key ?? undefined,
    roundNumber: row.round_number ?? undefined,
    sequenceIndex: row.sequence_index ?? undefined,
    venueIds,
    targetAllVenues: Boolean(row.target_all_venues ?? false),
    cities,
    zipCodes,
    counties,
    states,
    regions,
    targetCities: cities,
    targetZipCodes: zipCodes,
    targetCounties: counties,
    targetStates: states,
    targetRegions: regions,
    advertiserName: row.advertiser_name,
    frequencyInterval: Number.isFinite(Number(row.frequency_interval)) ? Math.max(1, Number(row.frequency_interval)) : 1,
    imageUrl: row.image_url,
    clickUrl: row.click_url,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    dismissDelaySeconds: Number.isFinite(Number(row.dismiss_delay_seconds))
      ? Math.min(300, Math.max(0, Math.round(Number(row.dismiss_delay_seconds))))
      : 3,
    popupCooldownSeconds: Number.isFinite(Number(row.popup_cooldown_seconds))
      ? Math.min(86400, Math.max(0, Math.round(Number(row.popup_cooldown_seconds))))
      : 180,
    active: row.active,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    impressions: row.impressions,
    clicks: row.clicks,
  };
}

function mapVenueRow(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name ?? undefined,
    logoText: row.logo_text ?? undefined,
    iconEmoji: row.icon_emoji ?? undefined,
    street: row.street ?? row.address ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    zipCode: row.zip_code ?? undefined,
    country: row.country ?? undefined,
    county: row.county ?? undefined,
    region: row.region ?? undefined,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius: Number(row.radius),
    placeId: row.place_id ?? undefined,
    screenEnabled: typeof row.screen_enabled === "boolean" ? row.screen_enabled : undefined,
    screenBrandImageUrl: row.screen_brand_image_url ?? undefined,
    screenBrandPrimary: row.screen_brand_primary ?? undefined,
    screenBrandSecondary: row.screen_brand_secondary ?? undefined,
    screenSponsorRotationEnabled:
      typeof row.screen_sponsor_rotation_enabled === "boolean" ? row.screen_sponsor_rotation_enabled : undefined,
  };
}

export type AdminVenueScreenSponsor = {
  id: string;
  venueId: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  displayOrder: number;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
};

function mapVenueScreenSponsorRow(row: VenueScreenSponsorRow): AdminVenueScreenSponsor {
  return {
    id: row.id,
    venueId: row.venue_id,
    title: row.title,
    imageUrl: row.image_url,
    linkUrl: row.link_url ?? undefined,
    displayOrder: Number(row.display_order ?? 0),
    isActive: Boolean(row.is_active),
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    createdAt: row.created_at,
  };
}

const AD_SELECT =
  "id, slot, slot_key, priority, is_placeholder, page_key, ad_type, display_trigger, placement_key, round_number, sequence_index, venue_id, venue_ids, target_all_venues, target_cities, target_zip_codes, target_counties, target_states, target_regions, advertiser_name, frequency_interval, image_url, click_url, alt_text, width, height, dismiss_delay_seconds, popup_cooldown_seconds, active, start_date, end_date, impressions, clicks";
const VENUE_LEADERBOARD_SLOT_PATTERN = /^venue-leaderboard-rows-\d+-\d+$/;
const VENUE_LEADERBOARD_PLACEMENT_KEY = "venue-leaderboard-inline";

function computeSlotKey(
  slot: AdSlot,
  pageKey: AdPageKey,
  displayTrigger: AdDisplayTrigger,
  roundNumber?: number,
  placementKey?: string
): string {
  if (displayTrigger === "round-end") {
    return `${pageKey}-${slot}-round-end${roundNumber ? `-r${roundNumber}` : ""}`;
  }
  if (slot === "popup-on-entry") return `${pageKey}-popup-on-entry`;
  if (slot === "popup-on-scroll") return `${pageKey}-popup-on-scroll`;
  if (slot === "mobile-adhesion") return `${pageKey}-banner`;
  if (placementKey) return `${pageKey}-${slot}-${placementKey}`;
  return `${pageKey}-${slot}`;
}

function normalizeVenueId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidClickUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return true;
    }
    if (url.protocol === "mailto:") {
      return Boolean(url.pathname && url.pathname.trim().length > 0);
    }
    return false;
  } catch {
    return false;
  }
}

function isVenueLeaderboardInlineSlot(pageKey: AdPageKey, slot: AdSlot): boolean {
  return pageKey === "venue" && VENUE_LEADERBOARD_SLOT_PATTERN.test(slot);
}

function assertVenueLeaderboardInlineRequirements(input: {
  pageKey: AdPageKey;
  slot: AdSlot;
  placementKey?: string;
  sequenceIndex?: number;
}): void {
  if (!isVenueLeaderboardInlineSlot(input.pageKey, input.slot)) {
    return;
  }
  const placementKey = input.placementKey?.trim() ?? "";
  const sequenceIndex = Number(input.sequenceIndex);
  // Explicit server guard to keep leaderboard inline placement deterministic.
  if (
    placementKey !== VENUE_LEADERBOARD_PLACEMENT_KEY ||
    !Number.isInteger(sequenceIndex) ||
    sequenceIndex < 1 ||
    sequenceIndex > 5
  ) {
    throw new Error("Leaderboard inline ads require placementKey='venue-leaderboard-inline' and sequenceIndex 1-5.");
  }
}

function buildVenueAddressLabel(input: {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  fallbackAddress?: string;
}): string {
  const street = String(input.street ?? "").trim();
  const city = String(input.city ?? "").trim();
  const state = String(input.state ?? "").trim();
  const zipCode = String(input.zipCode ?? "").trim();
  const country = String(input.country ?? "").trim();
  const fallbackAddress = String(input.fallbackAddress ?? "").trim();
  const cityStateZip = [city, [state, zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const parts = [street, cityStateZip, country].filter(Boolean);
  const label = parts.join(", ").trim();
  return label || fallbackAddress;
}

function assertAdminConfigured() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

function normalizeQuestionPool(value: string | undefined): "anytime_blitz" | "live_showdown" {
  return String(value ?? "").trim().toLowerCase() === "live_showdown" ? "live_showdown" : "anytime_blitz";
}

function normalizeAnswerFormat(
  value: string | undefined
): "multiple_choice" | "write_in" | "numeric" | "true_false" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "write_in" || normalized === "numeric" || normalized === "true_false") {
    return normalized;
  }
  return "multiple_choice";
}

export type AdminAdsDebugSnapshot = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  rangeHours: number;
  rangeLabel: string;
  windowHours: number;
  windowStart: string;
  totalAds: number;
  activeAds: number;
  totalImpressions: number;
  totalClicks: number;
  overallCtr: number;
  windowImpressions: number;
  windowClicks: number;
  windowCtr: number;
  slotCoverage: Array<{ slot: AdSlot; hasActiveAd: boolean; activeCount: number }>;
  topByImpressions: Advertisement[];
  topByClicks: Advertisement[];
  topByCtr: Advertisement[];
  topByWindowImpressions: Advertisement[];
  topByWindowClicks: Advertisement[];
  topByWindowCtr: Advertisement[];
  windowMetricsByAd: Record<string, { impressions: number; clicks: number; ctr: number }>;
  campaignMetrics: Array<{
    adId: string;
    advertiserName: string;
    slotKey: string;
    pageKey: string;
    active: boolean;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
  placementMetrics: Array<{
    slotKey: string;
    adCount: number;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
  interactionTrend: Array<{
    bucketStart: string;
    bucketLabel: string;
    impressions: number;
    clicks: number;
  }>;
};

export type AdminPendingPredictionSummary = {
  predictionId: string;
  totalPicks: number;
  latestPickAt: string;
  outcomes: Array<{ outcomeId: string; outcomeTitle: string; pickCount: number }>;
};

export type AdminVenueUser = {
  id: string;
  username: string;
  venueId: string;
  points: number;
  isAdmin: boolean;
  createdAt: string;
};

export type AdminPickEmUnsettledGame = {
  gameId: string;
  sportSlug: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: string;
  pickCount: number;
};

export type AdminPickEmMatchup = {
  gameId: string;
  sportSlug: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  startsAt: string;
  pickCount: number;
  settled: boolean;
  outcome: "home" | "away" | null;
  status: "unsettled" | "settled" | "canceled";
  statusLabel: string;
  settledWinnerTeam: string | null;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PlaceholderAdTemplateInput = Partial<{
  adType: AdType;
  displayTrigger: AdDisplayTrigger;
  placementKey: string;
  sequenceIndex: number;
  priority: number;
  advertiserName: string;
  imageUrl: string;
  adImageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
  frequencyInterval: number;
  dismissDelaySeconds: number;
  popupCooldownSeconds: number;
  startDate: string;
  endDate: string | null;
}>;

export async function listAdminTriviaQuestions(opts?: {
  page?: number;
  pageSize?: number;
  questionPool?: string;
  answerFormat?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: "created_at" | "category" | "difficulty" | "question_pool" | "answer_format";
  sortDirection?: "asc" | "desc";
}): Promise<PaginatedResult<TriviaQuestion>> {
  assertAdminConfigured();

  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(opts?.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin!
    .from("trivia_questions")
    .select("id, question, options, correct_answer, category, difficulty, question_pool, answer_format, created_at", { count: "exact" });
  query = query.eq("status", "active");

  const normalizedPool = String(opts?.questionPool ?? "").trim();
  if (normalizedPool === "anytime_blitz" || normalizedPool === "live_showdown") {
    query = query.eq("question_pool", normalizedPool);
  }

  const normalizedAnswerFormat = String(opts?.answerFormat ?? "").trim();
  if (
    normalizedAnswerFormat === "multiple_choice" ||
    normalizedAnswerFormat === "write_in" ||
    normalizedAnswerFormat === "numeric" ||
    normalizedAnswerFormat === "true_false"
  ) {
    query = query.eq("answer_format", normalizedAnswerFormat);
  }

  const normalizedCategory = String(opts?.category ?? "").trim();
  if (normalizedCategory) {
    query = query.ilike("category", normalizedCategory);
  }

  const normalizedStartDate = String(opts?.startDate ?? "").trim();
  if (normalizedStartDate) {
    query = query.gte("created_at", normalizedStartDate);
  }

  const normalizedEndDate = String(opts?.endDate ?? "").trim();
  if (normalizedEndDate) {
    query = query.lte("created_at", normalizedEndDate);
  }

  const sortBy =
    opts?.sortBy === "category" ||
    opts?.sortBy === "difficulty" ||
    opts?.sortBy === "question_pool" ||
    opts?.sortBy === "answer_format"
      ? opts.sortBy
      : "created_at";
  const ascending = opts?.sortDirection === "asc";

  const { data, error, count } = await query
    .order(sortBy, { ascending, nullsFirst: false })
    .order("id", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load trivia questions.");
  }

  const total = count ?? 0;
  return {
    items: data.map((row) => mapTriviaRow(row as TriviaQuestionRow)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createAdminTriviaQuestion(input: {
  question: string;
  options?: string[];
  acceptableAnswers?: string[];
  correctAnswer?: number;
  category?: string;
  difficulty?: string;
  questionPool?: string;
  answerFormat?: string;
}): Promise<TriviaQuestion> {
  assertAdminConfigured();

  const question = input.question.trim();
  const answerFormat = normalizeAnswerFormat(input.answerFormat);
  const questionPool = normalizeQuestionPool(input.questionPool);
  const providedOptions = Array.isArray(input.options)
    ? input.options.map((option) => option.trim()).filter(Boolean)
    : [];
  let options = providedOptions;
  let correctAnswer = Number.isFinite(Number(input.correctAnswer)) ? Math.floor(Number(input.correctAnswer)) : 0;
  if (!question) {
    throw new Error("Question is required.");
  }
  if (answerFormat === "multiple_choice") {
    if (options.length < 2) {
      throw new Error("At least two options are required for multiple choice.");
    }
    if (correctAnswer < 0 || correctAnswer >= options.length) {
      throw new Error("Correct answer index is out of range.");
    }
  } else {
    const canonicalAnswer =
      options[correctAnswer] ??
      options[0] ??
      "";
    if (!canonicalAnswer) {
      throw new Error("A canonical answer value is required for write-in, numeric, or true/false questions.");
    }
    options = [canonicalAnswer, ...sanitizeAcceptableAnswers(input.acceptableAnswers ?? options, canonicalAnswer)];
    correctAnswer = 0;
  }

  const { data, error } = await supabaseAdmin!
    .from("trivia_questions")
    .insert({
      question,
      options,
      correct_answer: correctAnswer,
      category: input.category?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
      question_pool: questionPool,
      answer_format: answerFormat,
    })
    .select("id, question, options, correct_answer, category, difficulty, question_pool, answer_format, created_at")
    .single<TriviaQuestionRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create trivia question.");
  }

  return mapTriviaRow(data);
}

export async function updateAdminTriviaQuestion(input: {
  id: string;
  question: string;
  options?: string[];
  acceptableAnswers?: string[];
  correctAnswer?: number;
  category?: string;
  difficulty?: string;
  questionPool?: string;
  answerFormat?: string;
}): Promise<TriviaQuestion> {
  assertAdminConfigured();

  const id = input.id.trim();
  const question = input.question.trim();
  const answerFormat = normalizeAnswerFormat(input.answerFormat);
  const questionPool = normalizeQuestionPool(input.questionPool);
  const providedOptions = Array.isArray(input.options)
    ? input.options.map((option) => option.trim()).filter(Boolean)
    : [];
  let options = providedOptions;
  let correctAnswer = Number.isFinite(Number(input.correctAnswer)) ? Math.floor(Number(input.correctAnswer)) : 0;
  if (!id) {
    throw new Error("Question id is required.");
  }
  if (!question) {
    throw new Error("Question is required.");
  }
  if (answerFormat === "multiple_choice") {
    if (options.length < 2) {
      throw new Error("At least two options are required for multiple choice.");
    }
    if (correctAnswer < 0 || correctAnswer >= options.length) {
      throw new Error("Correct answer index is out of range.");
    }
  } else {
    const canonicalAnswer =
      options[correctAnswer] ??
      options[0] ??
      "";
    if (!canonicalAnswer) {
      throw new Error("A canonical answer value is required for write-in, numeric, or true/false questions.");
    }
    options = [canonicalAnswer, ...sanitizeAcceptableAnswers(input.acceptableAnswers ?? options, canonicalAnswer)];
    correctAnswer = 0;
  }

  const { data, error } = await supabaseAdmin!
    .from("trivia_questions")
    .update({
      question,
      options,
      correct_answer: correctAnswer,
      category: input.category?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
      question_pool: questionPool,
      answer_format: answerFormat,
    })
    .eq("id", id)
    .select("id, question, options, correct_answer, category, difficulty, question_pool, answer_format, created_at")
    .single<TriviaQuestionRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update trivia question.");
  }

  return mapTriviaRow(data);
}

export async function deleteAdminTriviaQuestion(id: string): Promise<void> {
  assertAdminConfigured();

  // Fetch the slug so we can remove any trivia_session_questions rows that
  // reference it (FK is on slug with ON DELETE RESTRICT).
  const { data: question, error: fetchError } = await supabaseAdmin!
    .from("trivia_questions")
    .select("slug")
    .eq("id", id)
    .single();
  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (question?.slug) {
    const { error: sessionQError } = await supabaseAdmin!
      .from("trivia_session_questions")
      .delete()
      .eq("question_id", question.slug);
    if (sessionQError) {
      throw new Error(sessionQError.message);
    }
  }

  const { error } = await supabaseAdmin!.from("trivia_questions").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function bulkUpdateAdminTriviaQuestions(input: {
  ids: string[];
  questionPool?: "anytime_blitz" | "live_showdown";
  answerFormat?: "multiple_choice" | "write_in" | "numeric" | "true_false";
}): Promise<void> {
  assertAdminConfigured();
  const ids = Array.from(new Set((input.ids ?? []).map((id) => String(id).trim()).filter(Boolean)));
  if (ids.length === 0) {
    throw new Error("At least one trivia id is required.");
  }

  const patch: Record<string, string> = {};
  if (input.questionPool === "anytime_blitz" || input.questionPool === "live_showdown") {
    patch.question_pool = input.questionPool;
  }
  if (
    input.answerFormat === "multiple_choice" ||
    input.answerFormat === "write_in" ||
    input.answerFormat === "numeric" ||
    input.answerFormat === "true_false"
  ) {
    patch.answer_format = input.answerFormat;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No bulk trivia fields were provided.");
  }

  const { error } = await supabaseAdmin!
    .from("trivia_questions")
    .update(patch)
    .in("id", ids);

  if (error) {
    throw new Error(error.message || "Failed to bulk update trivia questions.");
  }
}

export async function listAdminAdvertisements(opts?: {
  page?: number;
  pageSize?: number;
  search?: string;
  pageKey?: AdPageKey | "all";
  adType?: AdType | "all";
  active?: "all" | "active" | "inactive";
  venueIds?: string[];
  cities?: string[];
  zipCodes?: string[];
  states?: string[];
  regions?: string[];
}): Promise<PaginatedResult<Advertisement>> {
  assertAdminConfigured();

  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const pageSize = Math.min(10000, Math.max(1, Math.floor(opts?.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin!
    .from("advertisements")
    .select(AD_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  const search = String(opts?.search ?? "").trim();
  if (search) {
    const escaped = search.replace(/[%_]/g, "");
    query = query.or(`advertiser_name.ilike.%${escaped}%,slot_key.ilike.%${escaped}%`);
  }

  if (opts?.pageKey && opts.pageKey !== "all") {
    query = query.eq("page_key", opts.pageKey);
  }

  if (opts?.adType && opts.adType !== "all") {
    query = query.eq("ad_type", opts.adType);
  }

  if (opts?.active === "active") {
    query = query.eq("active", true);
  } else if (opts?.active === "inactive") {
    query = query.eq("active", false);
  }

  const normalizeList = (values?: string[], uppercase = false) =>
    Array.from(
      new Set(
        (values ?? [])
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => (uppercase ? value.toUpperCase() : value))
      )
    );

  const venueIds = normalizeList(opts?.venueIds);
  const cities = normalizeList(opts?.cities);
  const zipCodes = normalizeList(opts?.zipCodes);
  const states = normalizeList(opts?.states, true);
  const regions = normalizeList(opts?.regions, true);

  if (venueIds.length > 0) {
    query = query.overlaps("venue_ids", venueIds);
  }
  if (cities.length > 0) {
    query = query.overlaps("target_cities", cities);
  }
  if (zipCodes.length > 0) {
    query = query.overlaps("target_zip_codes", zipCodes);
  }
  if (states.length > 0) {
    query = query.overlaps("target_states", states);
  }
  if (regions.length > 0) {
    query = query.overlaps("target_regions", regions);
  }

  const { data, error, count } = await query.range(from, to);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load advertisements.");
  }

  const total = count ?? 0;
  return {
    items: data.map((row) => mapAdRow(row as AdvertisementRow)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getAdminAdvertisementById(id: string): Promise<Advertisement | null> {
  assertAdminConfigured();
  const normalizedId = String(id ?? "").trim();
  if (!normalizedId) {
    throw new Error("Advertisement id is required.");
  }
  const { data, error } = await supabaseAdmin!
    .from("advertisements")
    .select(AD_SELECT)
    .eq("id", normalizedId)
    .maybeSingle<AdvertisementRow>();
  if (error) {
    throw new Error(error.message ?? "Failed to load advertisement.");
  }
  if (!data) return null;
  return mapAdRow(data);
}

function normalizeAdGeoList(values?: string[] | null, uppercase = false): string[] {
  const base = Array.isArray(values) ? values : [];
  return Array.from(
    new Set(
      base
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .map((value) => (uppercase ? value.toUpperCase() : value))
    )
  );
}

function adHasNoGeoTargeting(ad: Advertisement): boolean {
  const venueIds = normalizeAdGeoList(ad.venueIds);
  const cities = normalizeAdGeoList(ad.cities);
  const zipCodes = normalizeAdGeoList(ad.zipCodes);
  const states = normalizeAdGeoList(ad.states, true);
  const regions = normalizeAdGeoList(ad.regions, true);
  return venueIds.length === 0 && cities.length === 0 && zipCodes.length === 0 && states.length === 0 && regions.length === 0;
}

function adMatchesGeographicScope(ad: Advertisement, filters: GeographicAdFilterInput): boolean {
  if (adHasNoGeoTargeting(ad)) {
    return true;
  }

  const regions = normalizeAdGeoList(ad.regions, true);
  const states = normalizeAdGeoList(ad.states, true);
  const cities = normalizeAdGeoList(ad.cities).map((city) => city.toLowerCase());
  const zipCodes = normalizeAdGeoList(ad.zipCodes);
  const venueIds = normalizeAdGeoList(ad.venueIds);

  if (filters.regionKey) {
    return regions.includes(filters.regionKey.toUpperCase());
  }
  if (filters.stateCode) {
    return states.includes(filters.stateCode.toUpperCase());
  }
  if (filters.cityName) {
    return cities.includes(filters.cityName.trim().toLowerCase());
  }
  if (filters.zipCode) {
    return zipCodes.includes(filters.zipCode.trim());
  }
  if (filters.venueId) {
    return venueIds.includes(filters.venueId.trim());
  }

  return true;
}

export async function getAdsByRegion(regionKey: string): Promise<Advertisement[]> {
  const { items } = await listAdminAdvertisements({ page: 1, pageSize: 10000 });
  return items.filter((ad) => adMatchesGeographicScope(ad, { regionKey }));
}

export async function getAdsByState(stateCode: string): Promise<Advertisement[]> {
  const { items } = await listAdminAdvertisements({ page: 1, pageSize: 10000 });
  return items.filter((ad) => adMatchesGeographicScope(ad, { stateCode }));
}

export async function getAdsByCity(cityName: string, stateCode?: string): Promise<Advertisement[]> {
  const { items } = await listAdminAdvertisements({ page: 1, pageSize: 10000 });
  return items.filter((ad) => {
    if (!adMatchesGeographicScope(ad, { cityName })) return false;
    if (!stateCode) return true;
    if (adHasNoGeoTargeting(ad)) return true;
    return normalizeAdGeoList(ad.states, true).includes(stateCode.toUpperCase());
  });
}

export async function getAdsByZipCode(zipCode: string): Promise<Advertisement[]> {
  const { items } = await listAdminAdvertisements({ page: 1, pageSize: 10000 });
  return items.filter((ad) => adMatchesGeographicScope(ad, { zipCode }));
}

export async function getAdsByVenue(venueId: string): Promise<Advertisement[]> {
  const { items } = await listAdminAdvertisements({ page: 1, pageSize: 10000 });
  return items.filter((ad) => adMatchesGeographicScope(ad, { venueId }));
}

export async function getAdminGeographicHierarchy(params?: {
  forceRefresh?: boolean;
}): Promise<GeographicHierarchy> {
  assertAdminConfigured();

  if (!params?.forceRefresh && geographicHierarchyCache && geographicHierarchyCache.expiresAtMs > Date.now()) {
    return geographicHierarchyCache.value;
  }

  const { data, error } = await supabaseAdmin!
    .from("venues")
    .select("id, name, display_name, street, address, city, state, zip_code, region")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load geographic hierarchy.");
  }

  const hierarchy = buildGeographicHierarchy(
    ((data ?? []) as VenueGeoRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name ?? undefined,
      street: row.street ?? undefined,
      address: row.address ?? undefined,
      city: row.city ?? undefined,
      state: row.state ?? undefined,
      zipCode: row.zip_code ?? undefined,
      region: row.region ?? undefined,
    }))
  );

  geographicHierarchyCache = {
    value: hierarchy,
    expiresAtMs: Date.now() + GEOGRAPHIC_HIERARCHY_CACHE_MS,
  };

  return hierarchy;
}

export async function createAdminAdvertisement(input: {
  slot: AdSlot;
  slotKey?: string;
  priority?: number;
  isPlaceholder?: boolean;
  pageKey?: AdPageKey;
  adType?: AdType;
  displayTrigger?: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
  venueIds?: string[];
  targetAllVenues?: boolean;
  cities?: string[];
  zipCodes?: string[];
  counties?: string[];
  states?: string[];
  regions?: string[];
  /** Backward-compat aliases while older callers migrate. */
  venueId?: string;
  targetCities?: string[];
  targetZipCodes?: string[];
  targetCounties?: string[];
  targetStates?: string[];
  targetRegions?: string[];
  advertiserName: string;
  frequencyInterval?: number;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
  dismissDelaySeconds?: number;
  popupCooldownSeconds?: number;
  active: boolean;
  startDate: string;
  endDate?: string;
}): Promise<Advertisement> {
  assertAdminConfigured();

  if (!input.advertiserName.trim()) {
    throw new Error("Advertiser name is required.");
  }
  if (!input.imageUrl.trim()) {
    throw new Error("Image URL is required.");
  }
  if (!isValidHttpUrl(input.imageUrl.trim())) {
    throw new Error("Image URL must be a valid http(s) URL.");
  }
  if (!input.clickUrl.trim()) {
    throw new Error("Click URL is required.");
  }
  if (!isValidClickUrl(input.clickUrl.trim())) {
    throw new Error("Click URL must be a valid http(s) URL or mailto: link.");
  }
  if (!input.altText.trim()) {
    throw new Error("Alt text is required.");
  }
  const width = Number(input.width);
  const height = Number(input.height);
  const placementMeta = normalizeAdPlacementMeta({
    slot: input.slot,
    pageKey: input.pageKey,
    adType: input.adType,
    displayTrigger: input.displayTrigger,
    placementKey: input.placementKey,
    roundNumber: input.roundNumber,
    sequenceIndex: input.sequenceIndex,
  });
  const dismissDelaySeconds = Number.isFinite(input.dismissDelaySeconds)
    ? Math.round(Number(input.dismissDelaySeconds))
    : 3;
  const popupCooldownSeconds = Number.isFinite(input.popupCooldownSeconds)
    ? Math.round(Number(input.popupCooldownSeconds))
    : 180;
  const frequencyInterval = Number.isFinite(input.frequencyInterval) ? Math.max(1, Math.round(Number(input.frequencyInterval))) : 1;
  const normalizedVenueIds = Array.from(
    new Set((input.venueIds ?? []).map((item) => item.trim()).filter(Boolean))
  );
  const normalizeTextList = (values?: string[]) =>
    Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
  const normalizedTargetCities = normalizeTextList(input.cities ?? input.targetCities);
  const normalizedTargetZipCodes = normalizeTextList(input.zipCodes ?? input.targetZipCodes);
  const normalizedTargetCounties = normalizeTextList(input.counties ?? input.targetCounties);
  const normalizedTargetStates = normalizeTextList(input.states ?? input.targetStates);
  const normalizedTargetRegions = normalizeTextList(input.regions ?? input.targetRegions).map((value) => value.toUpperCase());
  const fallbackVenueId = input.venueId?.trim() || "";
  const finalVenueIds = normalizedVenueIds.length > 0 ? normalizedVenueIds : fallbackVenueId ? [fallbackVenueId] : [];
  if (!Number.isFinite(width) || width < 1) {
    throw new Error("Width must be at least 1.");
  }
  if (!Number.isFinite(height) || height < 1) {
    throw new Error("Height must be at least 1.");
  }
  if (!Number.isFinite(dismissDelaySeconds) || dismissDelaySeconds < 0 || dismissDelaySeconds > 300) {
    throw new Error("Dismiss delay must be between 0 and 300 seconds.");
  }
  if (!Number.isFinite(popupCooldownSeconds) || popupCooldownSeconds < 0 || popupCooldownSeconds > 86400) {
    throw new Error("Popup cooldown must be between 0 and 86400 seconds.");
  }
  if (!Number.isFinite(frequencyInterval) || frequencyInterval < 1 || frequencyInterval > 999) {
    throw new Error("Frequency interval must be between 1 and 999.");
  }
  if (placementMeta.pageKey === "global") {
    throw new Error("Select a specific page for this advertisement.");
  }
  if (!isAdTypeSupportedForPage(placementMeta.pageKey, placementMeta.adType)) {
    throw new Error(`Ad type "${placementMeta.adType}" is not supported on page "${placementMeta.pageKey}".`);
  }
  if (!isSlotCompatibleWithAdType(placementMeta.slot, placementMeta.adType)) {
    throw new Error(`Slot "${placementMeta.slot}" is not compatible with ad type "${placementMeta.adType}".`);
  }
  if (!isDisplayTriggerSupportedForPlacement(placementMeta.pageKey, placementMeta.adType, placementMeta.displayTrigger)) {
    throw new Error(
      `Trigger "${placementMeta.displayTrigger}" is not supported for ${placementMeta.adType} ads on page "${placementMeta.pageKey}".`
    );
  }
  const isTriviaPage = placementMeta.pageKey === "trivia" || placementMeta.pageKey === "speed-trivia" || placementMeta.pageKey === "live-trivia";
  if (placementMeta.displayTrigger === "round-end" && !isTriviaPage) {
    throw new Error("Round-end trigger is only supported on Trivia pages.");
  }
  if (isTriviaPage && placementMeta.displayTrigger === "round-end" && !placementMeta.roundNumber) {
    throw new Error("Choose a round number for Trivia round-end ads.");
  }
  assertVenueLeaderboardInlineRequirements({
    pageKey: placementMeta.pageKey,
    slot: placementMeta.slot,
    placementKey: placementMeta.placementKey,
    sequenceIndex: placementMeta.sequenceIndex,
  });

  const derivedSlotKey =
    input.slotKey?.trim() ||
    computeSlotKey(placementMeta.slot, placementMeta.pageKey, placementMeta.displayTrigger, placementMeta.roundNumber, placementMeta.placementKey);

  const { data, error } = await supabaseAdmin!
    .from("advertisements")
    .insert({
      slot: placementMeta.slot,
      slot_key: derivedSlotKey,
      priority: Number.isFinite(input.priority) ? Math.max(0, Math.round(Number(input.priority))) : 0,
      is_placeholder: Boolean(input.isPlaceholder),
      page_key: placementMeta.pageKey,
      ad_type: placementMeta.adType,
      display_trigger: placementMeta.displayTrigger,
      placement_key: placementMeta.placementKey ?? null,
      round_number: placementMeta.roundNumber ?? null,
      sequence_index: placementMeta.sequenceIndex ?? null,
      venue_id: finalVenueIds.length === 1 ? finalVenueIds[0] : null,
      venue_ids: finalVenueIds.length > 0 ? finalVenueIds : null,
      target_all_venues: Boolean(input.targetAllVenues),
      target_cities: normalizedTargetCities.length > 0 ? normalizedTargetCities : null,
      target_zip_codes: normalizedTargetZipCodes.length > 0 ? normalizedTargetZipCodes : null,
      target_counties: normalizedTargetCounties.length > 0 ? normalizedTargetCounties : null,
      target_states: normalizedTargetStates.length > 0 ? normalizedTargetStates : null,
      target_regions: normalizedTargetRegions.length > 0 ? normalizedTargetRegions : null,
      advertiser_name: input.advertiserName.trim(),
      frequency_interval: frequencyInterval,
      image_url: input.imageUrl.trim(),
      click_url: input.clickUrl.trim(),
      alt_text: input.altText.trim(),
      width,
      height,
      dismiss_delay_seconds: dismissDelaySeconds,
      popup_cooldown_seconds: popupCooldownSeconds,
      active: input.active,
      start_date: input.startDate,
      end_date: input.endDate?.trim() || null,
    })
    .select(AD_SELECT)
    .single<AdvertisementRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create advertisement.");
  }

  return mapAdRow(data);
}

export async function updateAdminAdvertisement(input: {
  id: string;
  slot: AdSlot;
  slotKey?: string;
  priority?: number;
  isPlaceholder?: boolean;
  pageKey?: AdPageKey;
  adType?: AdType;
  displayTrigger?: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
  venueIds?: string[];
  targetAllVenues?: boolean;
  cities?: string[];
  zipCodes?: string[];
  counties?: string[];
  states?: string[];
  regions?: string[];
  /** Backward-compat aliases while older callers migrate. */
  venueId?: string;
  targetCities?: string[];
  targetZipCodes?: string[];
  targetCounties?: string[];
  targetStates?: string[];
  targetRegions?: string[];
  advertiserName: string;
  frequencyInterval?: number;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
  dismissDelaySeconds?: number;
  popupCooldownSeconds?: number;
  active: boolean;
  startDate: string;
  endDate?: string;
}): Promise<Advertisement> {
  assertAdminConfigured();

  const id = input.id.trim();
  if (!id) {
    throw new Error("Advertisement id is required.");
  }
  if (!input.advertiserName.trim()) {
    throw new Error("Advertiser name is required.");
  }
  if (!input.imageUrl.trim()) {
    throw new Error("Image URL is required.");
  }
  if (!isValidHttpUrl(input.imageUrl.trim())) {
    throw new Error("Image URL must be a valid http(s) URL.");
  }
  if (!input.clickUrl.trim()) {
    throw new Error("Click URL is required.");
  }
  if (!isValidClickUrl(input.clickUrl.trim())) {
    throw new Error("Click URL must be a valid http(s) URL or mailto: link.");
  }
  if (!input.altText.trim()) {
    throw new Error("Alt text is required.");
  }
  const width = Number(input.width);
  const height = Number(input.height);
  const placementMeta = normalizeAdPlacementMeta({
    slot: input.slot,
    pageKey: input.pageKey,
    adType: input.adType,
    displayTrigger: input.displayTrigger,
    placementKey: input.placementKey,
    roundNumber: input.roundNumber,
    sequenceIndex: input.sequenceIndex,
  });
  const dismissDelaySeconds = Number.isFinite(input.dismissDelaySeconds)
    ? Math.round(Number(input.dismissDelaySeconds))
    : 3;
  const popupCooldownSeconds = Number.isFinite(input.popupCooldownSeconds)
    ? Math.round(Number(input.popupCooldownSeconds))
    : 180;
  const frequencyInterval = Number.isFinite(input.frequencyInterval) ? Math.max(1, Math.round(Number(input.frequencyInterval))) : 1;
  const normalizedVenueIds = Array.from(
    new Set((input.venueIds ?? []).map((item) => item.trim()).filter(Boolean))
  );
  const normalizeTextList = (values?: string[]) =>
    Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
  const normalizedTargetCities = normalizeTextList(input.cities ?? input.targetCities);
  const normalizedTargetZipCodes = normalizeTextList(input.zipCodes ?? input.targetZipCodes);
  const normalizedTargetCounties = normalizeTextList(input.counties ?? input.targetCounties);
  const normalizedTargetStates = normalizeTextList(input.states ?? input.targetStates);
  const normalizedTargetRegions = normalizeTextList(input.regions ?? input.targetRegions).map((value) => value.toUpperCase());
  const fallbackVenueId = input.venueId?.trim() || "";
  const finalVenueIds = normalizedVenueIds.length > 0 ? normalizedVenueIds : fallbackVenueId ? [fallbackVenueId] : [];
  if (!Number.isFinite(width) || width < 1) {
    throw new Error("Width must be at least 1.");
  }
  if (!Number.isFinite(height) || height < 1) {
    throw new Error("Height must be at least 1.");
  }
  if (!Number.isFinite(dismissDelaySeconds) || dismissDelaySeconds < 0 || dismissDelaySeconds > 300) {
    throw new Error("Dismiss delay must be between 0 and 300 seconds.");
  }
  if (!Number.isFinite(popupCooldownSeconds) || popupCooldownSeconds < 0 || popupCooldownSeconds > 86400) {
    throw new Error("Popup cooldown must be between 0 and 86400 seconds.");
  }
  if (!Number.isFinite(frequencyInterval) || frequencyInterval < 1 || frequencyInterval > 999) {
    throw new Error("Frequency interval must be between 1 and 999.");
  }
  if (placementMeta.pageKey === "global") {
    throw new Error("Select a specific page for this advertisement.");
  }
  if (!isAdTypeSupportedForPage(placementMeta.pageKey, placementMeta.adType)) {
    throw new Error(`Ad type "${placementMeta.adType}" is not supported on page "${placementMeta.pageKey}".`);
  }
  if (!isSlotCompatibleWithAdType(placementMeta.slot, placementMeta.adType)) {
    throw new Error(`Slot "${placementMeta.slot}" is not compatible with ad type "${placementMeta.adType}".`);
  }
  if (!isDisplayTriggerSupportedForPlacement(placementMeta.pageKey, placementMeta.adType, placementMeta.displayTrigger)) {
    throw new Error(
      `Trigger "${placementMeta.displayTrigger}" is not supported for ${placementMeta.adType} ads on page "${placementMeta.pageKey}".`
    );
  }
  const isTriviaPage = placementMeta.pageKey === "trivia" || placementMeta.pageKey === "speed-trivia" || placementMeta.pageKey === "live-trivia";
  if (placementMeta.displayTrigger === "round-end" && !isTriviaPage) {
    throw new Error("Round-end trigger is only supported on Trivia pages.");
  }
  if (isTriviaPage && placementMeta.displayTrigger === "round-end" && !placementMeta.roundNumber) {
    throw new Error("Choose a round number for Trivia round-end ads.");
  }
  assertVenueLeaderboardInlineRequirements({
    pageKey: placementMeta.pageKey,
    slot: placementMeta.slot,
    placementKey: placementMeta.placementKey,
    sequenceIndex: placementMeta.sequenceIndex,
  });

  const derivedSlotKey =
    input.slotKey?.trim() ||
    computeSlotKey(placementMeta.slot, placementMeta.pageKey, placementMeta.displayTrigger, placementMeta.roundNumber, placementMeta.placementKey);

  const { data, error } = await supabaseAdmin!
    .from("advertisements")
    .update({
      slot: placementMeta.slot,
      slot_key: derivedSlotKey,
      priority: Number.isFinite(input.priority) ? Math.max(0, Math.round(Number(input.priority))) : 0,
      is_placeholder: Boolean(input.isPlaceholder),
      page_key: placementMeta.pageKey,
      ad_type: placementMeta.adType,
      display_trigger: placementMeta.displayTrigger,
      placement_key: placementMeta.placementKey ?? null,
      round_number: placementMeta.roundNumber ?? null,
      sequence_index: placementMeta.sequenceIndex ?? null,
      venue_id: finalVenueIds.length === 1 ? finalVenueIds[0] : null,
      venue_ids: finalVenueIds.length > 0 ? finalVenueIds : null,
      target_all_venues: Boolean(input.targetAllVenues),
      target_cities: normalizedTargetCities.length > 0 ? normalizedTargetCities : null,
      target_zip_codes: normalizedTargetZipCodes.length > 0 ? normalizedTargetZipCodes : null,
      target_counties: normalizedTargetCounties.length > 0 ? normalizedTargetCounties : null,
      target_states: normalizedTargetStates.length > 0 ? normalizedTargetStates : null,
      target_regions: normalizedTargetRegions.length > 0 ? normalizedTargetRegions : null,
      advertiser_name: input.advertiserName.trim(),
      frequency_interval: frequencyInterval,
      image_url: input.imageUrl.trim(),
      click_url: input.clickUrl.trim(),
      alt_text: input.altText.trim(),
      width,
      height,
      dismiss_delay_seconds: dismissDelaySeconds,
      popup_cooldown_seconds: popupCooldownSeconds,
      active: input.active,
      start_date: input.startDate,
      end_date: input.endDate?.trim() || null,
    })
    .eq("id", id)
    .select(AD_SELECT)
    .single<AdvertisementRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update advertisement.");
  }

  return mapAdRow(data);
}

/**
 * Creates fallback placeholders for every inline slot that currently lacks an active placeholder.
 * This operation is idempotent: slots already covered by an active placeholder are skipped.
 */
export async function applyPlaceholderAdToAllInlineSlots(input: {
  templateAdId?: string;
  template?: PlaceholderAdTemplateInput;
  adminUserId?: string;
}): Promise<{
  created: number;
  skipped: number;
  errors: Array<{ slotId: string; pageKey: string; error: string }>;
}> {
  assertAdminConfigured();

  const errors: Array<{ slotId: string; pageKey: string; error: string }> = [];
  let created = 0;
  let skipped = 0;

  let template: PlaceholderAdTemplateInput = { ...(input.template ?? {}) };
  const templateAdId = String(input.templateAdId ?? "").trim();
  if (templateAdId) {
    const source = await getAdminAdvertisementById(templateAdId);
    if (!source) {
      throw new Error("Template advertisement not found.");
    }
    template = {
      adType: source.adType,
      displayTrigger: source.displayTrigger,
      placementKey: source.placementKey,
      sequenceIndex: source.sequenceIndex,
      priority: source.priority,
      advertiserName: source.advertiserName,
      imageUrl: source.imageUrl,
      clickUrl: source.clickUrl,
      altText: source.altText,
      width: source.width,
      height: source.height,
      frequencyInterval: source.frequencyInterval,
      dismissDelaySeconds: source.dismissDelaySeconds,
      popupCooldownSeconds: source.popupCooldownSeconds,
      startDate: source.startDate,
      endDate: source.endDate ?? null,
      ...template,
    };
  }

  const inlineEntries = getInlineSlotRegistryEntries();
  const today = new Date().toISOString().slice(0, 10);

  for (const entry of inlineEntries) {
    try {
      const { count, error: existsError } = await supabaseAdmin!
        .from("advertisements")
        .select("id", { count: "exact", head: true })
        .eq("slot", entry.slot)
        .eq("page_key", entry.pageKey)
        .eq("is_placeholder", true)
        .eq("active", true);

      if (existsError) {
        throw new Error(existsError.message ?? "Failed to check existing placeholder.");
      }
      if ((count ?? 0) > 0) {
        skipped += 1;
        continue;
      }

      const fallbackImageUrl = "https://via.placeholder.com/300x250?text=Placeholder+Ad";
      const startDate = String(template.startDate ?? today).slice(0, 10);
      const endDate = template.endDate ? String(template.endDate).slice(0, 10) : undefined;

      await createAdminAdvertisement({
        slot: entry.slot,
        pageKey: entry.pageKey,
        adType: template.adType ?? "inline",
        displayTrigger: template.displayTrigger ?? entry.trigger ?? "on-load",
        placementKey: template.placementKey ?? undefined,
        sequenceIndex: Number.isFinite(template.sequenceIndex) ? Number(template.sequenceIndex) : undefined,
        priority: Number.isFinite(template.priority) ? Number(template.priority) : 1000,
        advertiserName: template.advertiserName?.trim()
          ? `${template.advertiserName.trim()} (${entry.label})`
          : `Placeholder (${entry.label})`,
        frequencyInterval: Number.isFinite(template.frequencyInterval) ? Number(template.frequencyInterval) : 1,
        imageUrl: String(template.imageUrl ?? template.adImageUrl ?? fallbackImageUrl),
        clickUrl: String(template.clickUrl ?? "https://example.com"),
        altText: String(template.altText ?? "Placeholder ad"),
        width: Number.isFinite(template.width) ? Number(template.width) : 300,
        height: Number.isFinite(template.height) ? Number(template.height) : 250,
        dismissDelaySeconds: Number.isFinite(template.dismissDelaySeconds) ? Number(template.dismissDelaySeconds) : 3,
        popupCooldownSeconds: Number.isFinite(template.popupCooldownSeconds) ? Number(template.popupCooldownSeconds) : 180,
        active: true,
        isPlaceholder: true,
        startDate,
        endDate,
        targetAllVenues: true,
      });

      created += 1;
    } catch (error) {
      errors.push({
        slotId: entry.id,
        pageKey: entry.pageKey,
        error: error instanceof Error ? error.message : "Unknown slot creation error.",
      });
    }
  }

  return { created, skipped, errors };
}

export async function deleteAdminAdvertisement(id: string): Promise<void> {
  assertAdminConfigured();
  const { error } = await supabaseAdmin!.from("advertisements").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function updateAdPlacements(
  updates: Array<{ id: string; slotKey: string; priority: number }>
): Promise<void> {
  assertAdminConfigured();
  if (updates.length === 0) return;
  await Promise.all(
    updates.map(({ id, slotKey, priority }) =>
      supabaseAdmin!
        .from("advertisements")
        .update({
          slot_key: slotKey.trim(),
          priority: Math.max(0, Math.round(Number(priority))),
        })
        .eq("id", id)
    )
  );
}

function parseAdminDateParam(value: string | undefined, fallback: Date): Date {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
    return fallback;
  }
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) {
    return parsed;
  }
  return fallback;
}

function toUtcDayEnd(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

function toDateBucketKey(date: Date, useHourlyBuckets: boolean): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  if (!useHourlyBuckets) {
    return `${year}-${month}-${day}`;
  }
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:00:00Z`;
}

function formatDateBucketLabel(bucketKey: string, useHourlyBuckets: boolean): string {
  const parsed = new Date(bucketKey);
  if (!Number.isFinite(parsed.getTime())) {
    return bucketKey;
  }
  if (useHourlyBuckets) {
    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
    });
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export async function getAdminAdsDebugSnapshot(params?: {
  startDate?: string;
  endDate?: string;
  windowHours?: number;
}): Promise<AdminAdsDebugSnapshot> {
  assertAdminConfigured();
  const { items: ads } = await listAdminAdvertisements({ page: 1, pageSize: 5000 });
  const windowHours = Number(params?.windowHours ?? 24);
  const safeWindowHours = Number.isFinite(windowHours) ? Math.min(24 * 365, Math.max(1, Math.round(windowHours))) : 24;
  const now = Date.now();
  const defaultStartDate = new Date(now - safeWindowHours * 60 * 60 * 1000);
  const parsedStart = parseAdminDateParam(params?.startDate, defaultStartDate);
  const parsedEndRaw = parseAdminDateParam(params?.endDate, new Date(now));
  const parsedEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(params?.endDate ?? "").trim())
    ? toUtcDayEnd(parsedEndRaw)
    : parsedEndRaw;
  const safeStartMs = Math.min(parsedStart.getTime(), parsedEnd.getTime());
  const safeEndMs = Math.max(parsedStart.getTime(), parsedEnd.getTime());
  const windowStartIso = new Date(safeStartMs).toISOString();
  const windowEndIso = new Date(safeEndMs).toISOString();
  const rangeHours = Math.max(1, Math.round((safeEndMs - safeStartMs) / (1000 * 60 * 60)));
  const useHourlyBuckets = rangeHours <= 48;
  const slots: AdSlot[] = [
    "header",
    "inline-content",
    "sidebar",
    "mid-content",
    "leaderboard-sidebar",
    "footer",
    "mobile-adhesion",
    "popup-on-entry",
    "popup-on-scroll",
  ];

  const isActiveNow = (ad: Advertisement) => {
    if (!ad.active) return false;
    const start = +new Date(ad.startDate);
    const end = ad.endDate ? +new Date(ad.endDate) : Number.POSITIVE_INFINITY;
    return start <= now && now <= end;
  };

  const activeAds = ads.filter(isActiveNow);
  const totalImpressions = ads.reduce((sum, ad) => sum + Number(ad.impressions ?? 0), 0);
  const totalClicks = ads.reduce((sum, ad) => sum + Number(ad.clicks ?? 0), 0);
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const windowImpressionCount = new Map<string, number>();
  const windowClickCount = new Map<string, number>();
  const trendByBucket = new Map<string, { impressions: number; clicks: number }>();

  let windowImpressions = 0;
  let windowClicks = 0;

  try {
    const [{ count: impressionTotal }, { count: clickTotal }] = await Promise.all([
      supabaseAdmin!
        .from("ad_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "impression")
        .gte("created_at", windowStartIso)
        .lte("created_at", windowEndIso),
      supabaseAdmin!
        .from("ad_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "click")
        .gte("created_at", windowStartIso)
        .lte("created_at", windowEndIso),
    ]);
    windowImpressions = Math.max(0, Number(impressionTotal ?? 0));
    windowClicks = Math.max(0, Number(clickTotal ?? 0));

    const { data: eventRows } = await supabaseAdmin!
      .from("ad_events")
      .select("ad_id, event_type, created_at")
      .gte("created_at", windowStartIso)
      .lte("created_at", windowEndIso)
      .in("event_type", ["impression", "click"])
      .order("created_at", { ascending: true })
      .limit(200000);

    for (const event of (eventRows ?? []) as AdEventRow[]) {
      const createdAtMs = +new Date(event.created_at);
      if (!Number.isFinite(createdAtMs)) {
        continue;
      }
      const bucketKey = toDateBucketKey(new Date(createdAtMs), useHourlyBuckets);
      const bucket = trendByBucket.get(bucketKey) ?? { impressions: 0, clicks: 0 };
      if (event.event_type === "impression") {
        windowImpressionCount.set(event.ad_id, (windowImpressionCount.get(event.ad_id) ?? 0) + 1);
        bucket.impressions += 1;
      } else if (event.event_type === "click") {
        windowClickCount.set(event.ad_id, (windowClickCount.get(event.ad_id) ?? 0) + 1);
        bucket.clicks += 1;
      }
      trendByBucket.set(bucketKey, bucket);
    }
  } catch {
    // If ad_events table is not available yet, keep window stats at zero.
  }

  const windowCtr = windowImpressions > 0 ? (windowClicks / windowImpressions) * 100 : 0;

  const byImpressions = [...ads].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));
  const byClicks = [...ads].sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0));
  const byCtr = [...ads].sort((a, b) => {
    const aImpr = a.impressions ?? 0;
    const bImpr = b.impressions ?? 0;
    const aCtr = aImpr > 0 ? (a.clicks ?? 0) / aImpr : 0;
    const bCtr = bImpr > 0 ? (b.clicks ?? 0) / bImpr : 0;
    return bCtr - aCtr;
  });
  const byWindowImpressions = [...ads].sort(
    (a, b) => (windowImpressionCount.get(b.id) ?? 0) - (windowImpressionCount.get(a.id) ?? 0)
  );
  const byWindowClicks = [...ads].sort(
    (a, b) => (windowClickCount.get(b.id) ?? 0) - (windowClickCount.get(a.id) ?? 0)
  );
  const byWindowCtr = [...ads].sort((a, b) => {
    const aImpressions = windowImpressionCount.get(a.id) ?? 0;
    const bImpressions = windowImpressionCount.get(b.id) ?? 0;
    const aCtr = aImpressions > 0 ? (windowClickCount.get(a.id) ?? 0) / aImpressions : 0;
    const bCtr = bImpressions > 0 ? (windowClickCount.get(b.id) ?? 0) / bImpressions : 0;
    return bCtr - aCtr;
  });
  const windowMetricsByAd = Object.fromEntries(
    ads.map((ad) => {
      const impressions = windowImpressionCount.get(ad.id) ?? 0;
      const clicks = windowClickCount.get(ad.id) ?? 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      return [ad.id, { impressions, clicks, ctr }];
    })
  );
  const campaignMetrics = ads
    .map((ad) => {
      const impressions = windowImpressionCount.get(ad.id) ?? 0;
      const clicks = windowClickCount.get(ad.id) ?? 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      return {
        adId: ad.id,
        advertiserName: ad.advertiserName,
        slotKey: ad.slotKey,
        pageKey: ad.pageKey,
        active: isActiveNow(ad),
        impressions,
        clicks,
        ctr,
      };
    })
    .filter((item) => item.active || item.impressions > 0 || item.clicks > 0)
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || b.ctr - a.ctr);

  const placementMetricsMap = new Map<string, { slotKey: string; adCount: number; impressions: number; clicks: number }>();
  for (const campaign of campaignMetrics) {
    const current = placementMetricsMap.get(campaign.slotKey) ?? {
      slotKey: campaign.slotKey,
      adCount: 0,
      impressions: 0,
      clicks: 0,
    };
    current.adCount += 1;
    current.impressions += campaign.impressions;
    current.clicks += campaign.clicks;
    placementMetricsMap.set(campaign.slotKey, current);
  }
  const placementMetrics = [...placementMetricsMap.values()]
    .map((item) => ({
      ...item,
      ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);

  const interactionTrend = [...trendByBucket.entries()]
    .sort((a, b) => +new Date(a[0]) - +new Date(b[0]))
    .map(([bucketStart, counts]) => ({
      bucketStart,
      bucketLabel: formatDateBucketLabel(bucketStart, useHourlyBuckets),
      impressions: counts.impressions,
      clicks: counts.clicks,
    }));

  return {
    generatedAt: new Date().toISOString(),
    startDate: windowStartIso,
    endDate: windowEndIso,
    rangeHours,
    rangeLabel: `${new Date(windowStartIso).toLocaleString()} → ${new Date(windowEndIso).toLocaleString()}`,
    windowHours: safeWindowHours,
    windowStart: windowStartIso,
    totalAds: ads.length,
    activeAds: activeAds.length,
    totalImpressions,
    totalClicks,
    overallCtr,
    windowImpressions,
    windowClicks,
    windowCtr,
    slotCoverage: slots.map((slot) => {
      const count = activeAds.filter((ad) => ad.slot === slot).length;
      return { slot, hasActiveAd: count > 0, activeCount: count };
    }),
    topByImpressions: byImpressions.slice(0, 5),
    topByClicks: byClicks.slice(0, 5),
    topByCtr: byCtr.slice(0, 5),
    topByWindowImpressions: byWindowImpressions.slice(0, 5),
    topByWindowClicks: byWindowClicks.slice(0, 5),
    topByWindowCtr: byWindowCtr.slice(0, 5),
    windowMetricsByAd,
    campaignMetrics,
    placementMetrics,
    interactionTrend,
  };
}

export async function listAdminUsersByVenue(
  venueId: string,
  opts?: { page?: number; pageSize?: number }
): Promise<PaginatedResult<AdminVenueUser>> {
  assertAdminConfigured();

  const normalizedVenueId = venueId.trim();
  if (!normalizedVenueId) {
    return { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
  }

  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(opts?.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabaseAdmin!
    .from("users")
    .select("id, username, venue_id, points, is_admin, created_at", { count: "exact" })
    .eq("venue_id", normalizedVenueId)
    .order("points", { ascending: false })
    .order("created_at", { ascending: true })
    .range(from, to);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load venue users.");
  }

  const total = count ?? 0;
  return {
    items: (data as AdminUserRow[]).map((row) => ({
      id: row.id,
      username: row.username,
      venueId: row.venue_id,
      points: row.points,
      isAdmin: row.is_admin,
      createdAt: row.created_at,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function createAdminVenue(input: {
  name: string;
  street?: string;
  address?: string;
  radius?: number;
  latitude?: number;
  longitude?: number;
  displayName?: string;
  logoText?: string;
  iconEmoji?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  county?: string;
  region?: string;
  placeId?: string;
  screenEnabled?: boolean;
  screenBrandImageUrl?: string;
  screenBrandPrimary?: string;
  screenBrandSecondary?: string;
  screenSponsorRotationEnabled?: boolean;
}): Promise<Venue> {
  assertAdminConfigured();

  const name = input.name.trim();
  const street = String(input.street ?? "").trim() || String(input.address ?? "").trim();
  const city = String(input.city ?? "").trim();
  const state = String(input.state ?? "").trim().toUpperCase();
  const zipCode = String(input.zipCode ?? "").trim();
  const country = String(input.country ?? "").trim();
  const address = buildVenueAddressLabel({
    street,
    city,
    state,
    zipCode,
    country,
    fallbackAddress: input.address,
  });
  if (!name) {
    throw new Error("Venue name is required.");
  }
  if (!street) {
    throw new Error("Street address is required.");
  }
  const screenBrandImageUrl = String(input.screenBrandImageUrl ?? "").trim();
  const screenBrandPrimary = String(input.screenBrandPrimary ?? "").trim();
  const screenBrandSecondary = String(input.screenBrandSecondary ?? "").trim();
  if (screenBrandImageUrl && !isValidHttpUrl(screenBrandImageUrl)) {
    throw new Error("Screen brand image URL must be a valid http(s) URL.");
  }
  if (screenBrandPrimary && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(screenBrandPrimary)) {
    throw new Error("Screen primary color must be a valid hex color.");
  }
  if (screenBrandSecondary && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(screenBrandSecondary)) {
    throw new Error("Screen secondary color must be a valid hex color.");
  }

  const radius = Number.isFinite(input.radius) ? Math.round(Number(input.radius)) : 150;
  if (radius < 25 || radius > 2000) {
    throw new Error("Radius must be between 25m and 2000m.");
  }

  const resolvedLatitude = Number(input.latitude);
  const resolvedLongitude = Number(input.longitude);
  if (!Number.isFinite(resolvedLatitude) || !Number.isFinite(resolvedLongitude)) {
    throw new Error("Latitude and longitude are required.");
  }

  if (
    resolvedLatitude < -90 ||
    resolvedLatitude > 90 ||
    resolvedLongitude < -180 ||
    resolvedLongitude > 180
  ) {
    throw new Error("Venue coordinates are outside valid bounds.");
  }

  const baseVenueId = normalizeVenueId(name);
  if (!baseVenueId) {
    throw new Error("Venue id could not be generated. Add letters or numbers.");
  }

  let nextVenueId = baseVenueId.startsWith("venue-") ? baseVenueId : `venue-${baseVenueId}`;
  let suffix = 2;
  while (true) {
    const { data, error } = await supabaseAdmin!.from("venues").select("id").eq("id", nextVenueId).maybeSingle();
    if (error) {
      throw new Error(error.message ?? "Failed to validate venue id uniqueness.");
    }
    if (!data) break;
    nextVenueId = `${baseVenueId}-${suffix}`;
    if (!nextVenueId.startsWith("venue-")) {
      nextVenueId = `venue-${nextVenueId}`;
    }
    suffix += 1;
  }

  const { data, error } = await supabaseAdmin!
    .from("venues")
    .insert({
      id: nextVenueId,
      name,
      display_name: input.displayName?.trim() || name,
      logo_text: input.logoText?.trim() || null,
      icon_emoji: input.iconEmoji?.trim() || null,
      street,
      address,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      country: country || null,
      county: input.county?.trim() || null,
      region: input.region?.trim() || null,
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
      radius,
      place_id: input.placeId?.trim() || null,
      screen_enabled: input.screenEnabled ?? true,
      screen_brand_image_url: screenBrandImageUrl || null,
      screen_brand_primary: screenBrandPrimary || null,
      screen_brand_secondary: screenBrandSecondary || null,
      screen_sponsor_rotation_enabled: Boolean(input.screenSponsorRotationEnabled),
    })
    .select("id, name, display_name, logo_text, icon_emoji, street, address, city, state, zip_code, country, county, region, latitude, longitude, radius, place_id, screen_enabled, screen_brand_image_url, screen_brand_primary, screen_brand_secondary, screen_sponsor_rotation_enabled")
    .single<VenueRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create venue.");
  }

  return mapVenueRow(data);
}

export async function updateAdminVenue(input: {
  id: string;
  name: string;
  displayName?: string;
  logoText?: string;
  iconEmoji?: string;
  street?: string;
  address?: string;
  radius: number;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  county?: string;
  region?: string;
  placeId?: string;
  screenEnabled?: boolean;
  screenBrandImageUrl?: string;
  screenBrandPrimary?: string;
  screenBrandSecondary?: string;
  screenSponsorRotationEnabled?: boolean;
}): Promise<Venue> {
  assertAdminConfigured();

  const id = input.id.trim();
  if (!id) {
    throw new Error("Venue id is required.");
  }

  const name = input.name.trim();
  const street = String(input.street ?? "").trim() || String(input.address ?? "").trim();
  const city = String(input.city ?? "").trim();
  const state = String(input.state ?? "").trim().toUpperCase();
  const zipCode = String(input.zipCode ?? "").trim();
  const country = String(input.country ?? "").trim();
  const address = buildVenueAddressLabel({
    street,
    city,
    state,
    zipCode,
    country,
    fallbackAddress: input.address,
  });
  if (!name) {
    throw new Error("Venue name is required.");
  }
  if (!street) {
    throw new Error("Street address is required.");
  }
  const screenBrandImageUrl = String(input.screenBrandImageUrl ?? "").trim();
  const screenBrandPrimary = String(input.screenBrandPrimary ?? "").trim();
  const screenBrandSecondary = String(input.screenBrandSecondary ?? "").trim();
  if (screenBrandImageUrl && !isValidHttpUrl(screenBrandImageUrl)) {
    throw new Error("Screen brand image URL must be a valid http(s) URL.");
  }
  if (screenBrandPrimary && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(screenBrandPrimary)) {
    throw new Error("Screen primary color must be a valid hex color.");
  }
  if (screenBrandSecondary && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(screenBrandSecondary)) {
    throw new Error("Screen secondary color must be a valid hex color.");
  }

  const radius = Number.isFinite(input.radius) ? Math.round(input.radius) : Number.NaN;
  if (!Number.isFinite(radius) || radius < 25 || radius > 2000) {
    throw new Error("Radius must be between 25m and 2000m.");
  }

  const resolvedLatitude = Number(input.latitude);
  const resolvedLongitude = Number(input.longitude);
  if (!Number.isFinite(resolvedLatitude) || !Number.isFinite(resolvedLongitude)) {
    throw new Error("Latitude and longitude are required.");
  }

  if (
    resolvedLatitude < -90 ||
    resolvedLatitude > 90 ||
    resolvedLongitude < -180 ||
    resolvedLongitude > 180
  ) {
    throw new Error("Venue coordinates are outside valid bounds.");
  }

  const { data, error } = await supabaseAdmin!
    .from("venues")
    .update({
      name,
      display_name: input.displayName?.trim() || name,
      logo_text: input.logoText?.trim() || null,
      icon_emoji: input.iconEmoji?.trim() || null,
      street,
      address,
      city: city || null,
      state: state || null,
      zip_code: zipCode || null,
      country: country || null,
      county: input.county?.trim() || null,
      region: input.region?.trim() || null,
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
      radius,
      place_id: input.placeId?.trim() || null,
      screen_enabled: input.screenEnabled ?? true,
      screen_brand_image_url: screenBrandImageUrl || null,
      screen_brand_primary: screenBrandPrimary || null,
      screen_brand_secondary: screenBrandSecondary || null,
      screen_sponsor_rotation_enabled: Boolean(input.screenSponsorRotationEnabled),
    })
    .eq("id", id)
    .select("id, name, display_name, logo_text, icon_emoji, street, address, city, state, zip_code, country, county, region, latitude, longitude, radius, place_id, screen_enabled, screen_brand_image_url, screen_brand_primary, screen_brand_secondary, screen_sponsor_rotation_enabled")
    .single<VenueRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update venue.");
  }

  return mapVenueRow(data);
}

export async function listAdminVenueScreenSponsors(venueId: string): Promise<AdminVenueScreenSponsor[]> {
  assertAdminConfigured();
  const normalizedVenueId = String(venueId ?? "").trim();
  if (!normalizedVenueId) {
    throw new Error("Venue id is required.");
  }

  const { data, error } = await supabaseAdmin!
    .from("venue_screen_sponsors")
    .select("id, venue_id, title, image_url, link_url, display_order, is_active, starts_at, ends_at, created_at")
    .eq("venue_id", normalizedVenueId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load venue screen sponsors.");
  }

  return ((data ?? []) as VenueScreenSponsorRow[]).map(mapVenueScreenSponsorRow);
}

function validateVenueScreenSponsorInput(input: {
  venueId?: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  displayOrder?: number;
  startsAt?: string;
  endsAt?: string;
}): {
  venueId: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  displayOrder: number;
  startsAt: string | null;
  endsAt: string | null;
} {
  const venueId = String(input.venueId ?? "").trim();
  const title = String(input.title ?? "").trim();
  const imageUrl = String(input.imageUrl ?? "").trim();
  const linkUrl = String(input.linkUrl ?? "").trim();
  const startsAt = String(input.startsAt ?? "").trim();
  const endsAt = String(input.endsAt ?? "").trim();
  const displayOrder = Number.isFinite(Number(input.displayOrder)) ? Math.round(Number(input.displayOrder)) : 0;

  if (!venueId) throw new Error("Venue id is required.");
  if (!title) throw new Error("Sponsor title is required.");
  if (!imageUrl) throw new Error("Sponsor image URL is required.");
  if (!isValidHttpUrl(imageUrl)) throw new Error("Sponsor image URL must be a valid http(s) URL.");
  if (linkUrl && !isValidHttpUrl(linkUrl)) throw new Error("Sponsor link URL must be a valid http(s) URL.");
  if (displayOrder < 0 || displayOrder > 999) throw new Error("Sponsor display order must be between 0 and 999.");
  if (startsAt && Number.isNaN(Date.parse(startsAt))) throw new Error("Sponsor start time must be a valid date.");
  if (endsAt && Number.isNaN(Date.parse(endsAt))) throw new Error("Sponsor end time must be a valid date.");
  if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) {
    throw new Error("Sponsor end time must be after the start time.");
  }

  return {
    venueId,
    title,
    imageUrl,
    linkUrl: linkUrl || null,
    displayOrder,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
  };
}

export async function createAdminVenueScreenSponsor(input: {
  venueId: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
}): Promise<AdminVenueScreenSponsor> {
  assertAdminConfigured();
  const normalized = validateVenueScreenSponsorInput(input);

  const { data, error } = await supabaseAdmin!
    .from("venue_screen_sponsors")
    .insert({
      venue_id: normalized.venueId,
      title: normalized.title,
      image_url: normalized.imageUrl,
      link_url: normalized.linkUrl,
      display_order: normalized.displayOrder,
      is_active: input.isActive ?? true,
      starts_at: normalized.startsAt,
      ends_at: normalized.endsAt,
    })
    .select("id, venue_id, title, image_url, link_url, display_order, is_active, starts_at, ends_at, created_at")
    .single<VenueScreenSponsorRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create venue screen sponsor.");
  }

  return mapVenueScreenSponsorRow(data);
}

export async function updateAdminVenueScreenSponsor(input: {
  id: string;
  venueId: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
}): Promise<AdminVenueScreenSponsor> {
  assertAdminConfigured();
  const id = String(input.id ?? "").trim();
  if (!id) throw new Error("Sponsor id is required.");
  const normalized = validateVenueScreenSponsorInput(input);

  const { data, error } = await supabaseAdmin!
    .from("venue_screen_sponsors")
    .update({
      venue_id: normalized.venueId,
      title: normalized.title,
      image_url: normalized.imageUrl,
      link_url: normalized.linkUrl,
      display_order: normalized.displayOrder,
      is_active: input.isActive ?? true,
      starts_at: normalized.startsAt,
      ends_at: normalized.endsAt,
    })
    .eq("id", id)
    .select("id, venue_id, title, image_url, link_url, display_order, is_active, starts_at, ends_at, created_at")
    .single<VenueScreenSponsorRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update venue screen sponsor.");
  }

  return mapVenueScreenSponsorRow(data);
}

export async function deleteAdminVenueScreenSponsor(id: string): Promise<void> {
  assertAdminConfigured();
  const normalizedId = String(id ?? "").trim();
  if (!normalizedId) {
    throw new Error("Sponsor id is required.");
  }

  const { error } = await supabaseAdmin!.from("venue_screen_sponsors").delete().eq("id", normalizedId);
  if (error) {
    throw new Error(error.message ?? "Failed to delete venue screen sponsor.");
  }
}

export async function deleteAdminVenue(venueId: string): Promise<void> {
  assertAdminConfigured();
  const id = venueId.trim();
  if (!id) {
    throw new Error("Venue id is required.");
  }

  const { error } = await supabaseAdmin!.from("venues").delete().eq("id", id);
  if (error) {
    throw new Error(error.message ?? "Failed to delete venue.");
  }
}

export async function bulkDeleteAdminAdvertisements(ids: string[]): Promise<number> {
  assertAdminConfigured();
  const uniqueIds = Array.from(new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new Error("At least one ad id is required.");
  }

  const { error, count } = await supabaseAdmin!
    .from("advertisements")
    .delete({ count: "exact" })
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message ?? "Failed to delete selected advertisements.");
  }

  return count ?? 0;
}

export async function bulkSetAdminAdvertisementsActive(ids: string[], active: boolean): Promise<number> {
  assertAdminConfigured();
  const uniqueIds = Array.from(new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    throw new Error("At least one ad id is required.");
  }

  const { data, error } = await supabaseAdmin!
    .from("advertisements")
    .update({ active })
    .in("id", uniqueIds)
    .select("id");

  if (error) {
    throw new Error(error.message ?? "Failed to update selected advertisements.");
  }

  return (data ?? []).length;
}

export async function listAdminPickEmUnsettledGames(): Promise<AdminPickEmUnsettledGame[]> {
  assertAdminConfigured();
  const { data, error } = await supabaseAdmin!
    .from("pickem_picks")
    .select("game_id, home_team, away_team, home_team_id, away_team_id, starts_at, league, sport_slug")
    .eq("status", "pending")
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load unsettled Pick 'Em games.");
  }

  const byGame = new Map<string, AdminPickEmUnsettledGame>();
  for (const row of (data ?? []) as PickEmPendingGameRow[]) {
    const gameId = String(row.game_id ?? "").trim();
    if (!gameId) continue;
    const existing = byGame.get(gameId);
    if (existing) {
      existing.pickCount += 1;
      continue;
    }
    byGame.set(gameId, {
      gameId,
      sportSlug: String(row.sport_slug ?? "").trim().toLowerCase(),
      league: String(row.league ?? "").trim(),
      homeTeam: String(row.home_team ?? "").trim(),
      awayTeam: String(row.away_team ?? "").trim(),
      homeTeamId: row.home_team_id,
      awayTeamId: row.away_team_id,
      startsAt: row.starts_at,
      pickCount: 1,
    });
  }

  return [...byGame.values()].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
}

export async function listAdminPickEmMatchupsByDate(params: {
  date: string;
  tzOffsetMinutes?: number | string;
}): Promise<AdminPickEmMatchup[]> {
  assertAdminConfigured();
  const rawDate = String(params.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    throw new Error("date must be in YYYY-MM-DD format.");
  }

  const parsedOffset = Number.parseInt(String(params.tzOffsetMinutes ?? ""), 10);
  const tzOffsetMinutes = Number.isFinite(parsedOffset) ? Math.max(-14 * 60, Math.min(14 * 60, parsedOffset)) : 0;
  const [yearRaw, monthRaw, dayRaw] = rawDate.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);
  const dayStartMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) + tzOffsetMinutes * 60_000;
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000 - 1;
  const dayStartIso = new Date(dayStartMs).toISOString();
  const dayEndIso = new Date(dayEndMs).toISOString();

  const sports = listPickEmSports()
    .filter((sport) => sport.isClickable)
    .map((sport) => sport.slug as PickEmSportSlug);

  const slateByGameId = new Map<
    string,
    {
      gameId: string;
      sportSlug: string;
      league: string;
      homeTeam: string;
      awayTeam: string;
      homeTeamId: string | null;
      awayTeamId: string | null;
      startsAt: string;
    }
  >();

  const gameLists = await Promise.all(
    sports.map(async (sportSlug) => {
      try {
        const result = await listPickEmGames({
          sportSlug,
          date: rawDate,
          tzOffsetMinutes,
        });
        return result.games;
      } catch {
        return [];
      }
    })
  );

  for (const games of gameLists) {
    for (const game of games) {
      const gameId = String(game.id ?? "").trim();
      if (!gameId) continue;
      slateByGameId.set(gameId, {
        gameId,
        sportSlug: String(game.sportSlug ?? "").trim().toLowerCase(),
        league: String(game.league ?? "").trim(),
        homeTeam: String(game.homeTeam ?? "").trim(),
        awayTeam: String(game.awayTeam ?? "").trim(),
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        startsAt: game.startsAt,
      });
    }
  }

  const { data, error } = await supabaseAdmin!
    .from("pickem_picks")
    .select(
      "game_id, home_team, away_team, home_team_id, away_team_id, starts_at, league, sport_slug, status, winning_team_id"
    )
    .gte("starts_at", dayStartIso)
    .lte("starts_at", dayEndIso)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load Pick 'Em matchups.");
  }

  const grouped = new Map<
    string,
    {
      gameId: string;
      sportSlug: string;
      league: string;
      homeTeam: string;
      awayTeam: string;
      homeTeamId: string | null;
      awayTeamId: string | null;
      startsAt: string;
      pickCount: number;
      statuses: Array<"pending" | "won" | "lost" | "push" | "canceled">;
      winningTeamIds: string[];
    }
  >();

  for (const row of (data ?? []) as PickEmMatchupRow[]) {
    const gameId = String(row.game_id ?? "").trim();
    if (!gameId) continue;
    const existing = grouped.get(gameId);
    if (existing) {
      existing.pickCount += 1;
      existing.statuses.push(row.status);
      if (row.winning_team_id) {
        existing.winningTeamIds.push(row.winning_team_id);
      }
      continue;
    }

    const slateGame = slateByGameId.get(gameId);
    grouped.set(gameId, {
      gameId,
      sportSlug: slateGame?.sportSlug ?? String(row.sport_slug ?? "").trim().toLowerCase(),
      league: slateGame?.league ?? String(row.league ?? "").trim(),
      homeTeam: slateGame?.homeTeam ?? String(row.home_team ?? "").trim(),
      awayTeam: slateGame?.awayTeam ?? String(row.away_team ?? "").trim(),
      homeTeamId: slateGame?.homeTeamId ?? row.home_team_id,
      awayTeamId: slateGame?.awayTeamId ?? row.away_team_id,
      startsAt: slateGame?.startsAt ?? row.starts_at,
      pickCount: 1,
      statuses: [row.status],
      winningTeamIds: row.winning_team_id ? [row.winning_team_id] : [],
    });
  }

  for (const [gameId, game] of slateByGameId.entries()) {
    if (grouped.has(gameId)) continue;
    grouped.set(gameId, {
      gameId,
      sportSlug: game.sportSlug,
      league: game.league,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      startsAt: game.startsAt,
      pickCount: 0,
      statuses: [],
      winningTeamIds: [],
    });
  }

  return [...grouped.values()]
    .map((matchup) => {
      const hasPending = matchup.statuses.includes("pending");
      const hasNoPicks = matchup.statuses.length === 0;
      const hasCanceled = matchup.statuses.every((status) => status === "canceled");
      const winnerTeamId = matchup.winningTeamIds[0] ?? null;
      const outcome: "home" | "away" | null =
        winnerTeamId && winnerTeamId === matchup.homeTeamId
          ? "home"
          : winnerTeamId && winnerTeamId === matchup.awayTeamId
            ? "away"
            : null;
      const winnerTeamName =
        outcome === "home"
          ? matchup.homeTeam
          : outcome === "away"
            ? matchup.awayTeam
            : null;

      if (hasPending || hasNoPicks) {
        return {
          ...matchup,
          settled: false,
          outcome: null,
          status: "unsettled" as const,
          statusLabel: "Unsettled",
          settledWinnerTeam: null,
        };
      }

      if (hasCanceled) {
        return {
          ...matchup,
          settled: true,
          outcome: null,
          status: "canceled" as const,
          statusLabel: "Canceled",
          settledWinnerTeam: null,
        };
      }

      return {
        ...matchup,
        settled: true,
        outcome,
        status: "settled" as const,
        statusLabel: winnerTeamName ? `Settled: ${winnerTeamName}` : "Settled",
        settledWinnerTeam: winnerTeamName,
      };
    })
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
}

export async function settleAdminPickEmGame(params: {
  gameId: string;
  winningTeamId: string;
}): Promise<{ affectedPicks: number; winners: number; losers: number }> {
  assertAdminConfigured();

  const gameId = params.gameId.trim();
  const winningTeamId = params.winningTeamId.trim();
  if (!gameId) {
    throw new Error("gameId is required.");
  }
  if (!winningTeamId) {
    throw new Error("winningTeamId is required.");
  }

  const { data: pendingRows, error } = await supabaseAdmin!
    .from("pickem_picks")
    .select("id, user_id, selected_team_id, reward_points")
    .eq("game_id", gameId)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message ?? "Failed to load pending picks for that game.");
  }

  const picks = (pendingRows ?? []) as PickEmPendingPickRow[];
  if (picks.length === 0) {
    return { affectedPicks: 0, winners: 0, losers: 0 };
  }

  const resolvedAt = new Date().toISOString();
  const winnerUserDeltas = new Map<string, number>();
  let winners = 0;
  let losers = 0;

  for (const pick of picks) {
    const isWinner = String(pick.selected_team_id ?? "").trim() === winningTeamId;
    const status = isWinner ? "won" : "lost";

    const { error: updateError } = await supabaseAdmin!
      .from("pickem_picks")
      .update({
        status,
        winning_team_id: winningTeamId,
        resolved_at: resolvedAt,
      })
      .eq("id", pick.id)
      .eq("status", "pending");

    if (updateError) {
      throw new Error(updateError.message ?? "Failed to settle one or more picks.");
    }

    if (isWinner) {
      winners += 1;
      const current = winnerUserDeltas.get(pick.user_id) ?? 0;
      winnerUserDeltas.set(pick.user_id, current + Math.max(0, Number(pick.reward_points ?? 0)));
    } else {
      losers += 1;
    }
  }

  for (const [userId, delta] of winnerUserDeltas.entries()) {
    const { data: userRow, error: userError } = await supabaseAdmin!
      .from("users")
      .select("points")
      .eq("id", userId)
      .maybeSingle<{ points: number }>();
    if (userError) {
      throw new Error(userError.message ?? "Failed to load user points during settlement.");
    }

    const nextPoints = Math.max(0, Number(userRow?.points ?? 0)) + delta;
    const { error: pointsError } = await supabaseAdmin!
      .from("users")
      .update({ points: nextPoints })
      .eq("id", userId);
    if (pointsError) {
      throw new Error(pointsError.message ?? "Failed to apply winner points.");
    }
  }

  return {
    affectedPicks: picks.length,
    winners,
    losers,
  };
}

export async function updateAdminUser(params: {
  userId: string;
  username?: string;
  points?: number;
}): Promise<AdminVenueUser> {
  assertAdminConfigured();

  const userId = params.userId.trim();
  if (!userId) {
    throw new Error("userId is required.");
  }

  const update: { username?: string; points?: number } = {};
  if (typeof params.username === "string") {
    const username = params.username.trim();
    if (!username) {
      throw new Error("Username is required.");
    }
    update.username = username;
  }
  if (typeof params.points === "number") {
    const nextPoints = Math.max(0, Math.round(params.points));
    update.points = nextPoints;
  }

  if (Object.keys(update).length === 0) {
    throw new Error("No user fields to update.");
  }

  const { data, error } = await supabaseAdmin!
    .from("users")
    .update(update)
    .eq("id", userId)
    .select("id, username, venue_id, points, is_admin, created_at")
    .single<AdminUserRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update user.");
  }

  return {
    id: data.id,
    username: data.username,
    venueId: data.venue_id,
    points: data.points,
    isAdmin: data.is_admin,
    createdAt: data.created_at,
  };
}

export async function listPendingPredictionSummaries(): Promise<AdminPendingPredictionSummary[]> {
  assertAdminConfigured();

  const { data, error } = await supabaseAdmin!
    .from("user_predictions")
    .select("id, user_id, prediction_id, outcome_id, outcome_title, points, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load pending predictions.");
  }

  const grouped = new Map<string, AdminPendingPredictionSummary>();
  for (const row of data as PendingPredictionRow[]) {
    const current = grouped.get(row.prediction_id);
    if (!current) {
      grouped.set(row.prediction_id, {
        predictionId: row.prediction_id,
        totalPicks: 1,
        latestPickAt: row.created_at,
        outcomes: [
          {
            outcomeId: row.outcome_id,
            outcomeTitle: row.outcome_title,
            pickCount: 1,
          },
        ],
      });
      continue;
    }

    current.totalPicks += 1;
    if (+new Date(row.created_at) > +new Date(current.latestPickAt)) {
      current.latestPickAt = row.created_at;
    }
    const outcome = current.outcomes.find((item) => item.outcomeId === row.outcome_id);
    if (outcome) {
      outcome.pickCount += 1;
    } else {
      current.outcomes.push({
        outcomeId: row.outcome_id,
        outcomeTitle: row.outcome_title,
        pickCount: 1,
      });
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => +new Date(b.latestPickAt) - +new Date(a.latestPickAt)
  );
}

export async function resolvePendingPredictionMarket(params: {
  predictionId: string;
  winningOutcomeId?: string;
  settleAsCanceled?: boolean;
  marketQuestion?: string;
  cancellationReason?: "tie";
}): Promise<{ affectedPicks: number; winners: number; losers: number; canceled: number }> {
  assertAdminConfigured();

  const predictionId = params.predictionId.trim();
  const winningOutcomeId = params.winningOutcomeId?.trim() ?? "";
  const settleAsCanceled = Boolean(params.settleAsCanceled);

  if (!predictionId) {
    throw new Error("predictionId is required.");
  }
  if (!settleAsCanceled && !winningOutcomeId) {
    throw new Error("winningOutcomeId is required unless settling as canceled.");
  }

  let marketQuestion = params.marketQuestion?.trim() ?? "";
  if (!marketQuestion) {
    try {
      const market = await getPredictionMarketById(predictionId);
      marketQuestion = market?.question?.trim() ?? "";
    } catch {
      marketQuestion = "";
    }
  }

  if (settleAsCanceled && params.cancellationReason === "tie") {
    return resolvePendingPredictionMarketLegacy({
      ...params,
      marketQuestion,
      cancellationReason: "tie",
    });
  }

  const { data, error } = await supabaseAdmin!.rpc("settle_prediction_market", {
    p_prediction_id: predictionId,
    p_winning_outcome_id: winningOutcomeId || null,
    p_settle_as_canceled: settleAsCanceled,
    p_market_question: marketQuestion || null,
  });

  if (error) {
    const errorCode = (error as { code?: string }).code;
    const shouldFallbackToLegacy = errorCode === "PGRST202" || errorCode === "42883";
    if (shouldFallbackToLegacy) {
      return resolvePendingPredictionMarketLegacy({ ...params, marketQuestion });
    }
    throw new Error(error.message ?? "Failed to settle prediction market.");
  }

  const row = (Array.isArray(data) ? data[0] : data ?? {}) as {
    affected_picks?: number;
    winners?: number;
    losers?: number;
    canceled?: number;
  };

  return {
    affectedPicks: Number(row.affected_picks ?? 0),
    winners: Number(row.winners ?? 0),
    losers: Number(row.losers ?? 0),
    canceled: Number(row.canceled ?? 0),
  };
}

export async function autoSettleResolvedPredictionMarkets(): Promise<{
  scannedMarkets: number;
  settledMarkets: number;
  affectedPicks: number;
  winners: number;
  losers: number;
  canceled: number;
}> {
  assertAdminConfigured();

  const pendingRows: Array<{ prediction_id: string; market_question?: string | null }> = [];
  const batchSize = 2_000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin!
      .from("user_predictions")
      .select("prediction_id, market_question")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to load pending markets for settlement.");
    }

    pendingRows.push(...(data as Array<{ prediction_id: string; market_question?: string | null }>));
    if (data.length < batchSize) {
      break;
    }
    offset += batchSize;
  }

  const marketQuestionByPredictionId = new Map<string, string>();
  for (const row of pendingRows) {
    const predictionId = String(row.prediction_id ?? "").trim();
    if (!predictionId) {
      continue;
    }
    const question = String(row.market_question ?? "").trim();
    if (!question || marketQuestionByPredictionId.has(predictionId)) {
      continue;
    }
    marketQuestionByPredictionId.set(predictionId, question);
  }
  const pendingPredictionIds = Array.from(
    new Set(
      pendingRows
        .map((row) => String(row.prediction_id ?? "").trim())
        .filter((predictionId) => predictionId.length > 0)
    )
  );
  if (pendingPredictionIds.length === 0) {
    return {
      scannedMarkets: 0,
      settledMarkets: 0,
      affectedPicks: 0,
      winners: 0,
      losers: 0,
      canceled: 0,
    };
  }

  const resolvedOutcomes = await listResolvedPredictionOutcomes(pendingPredictionIds);
  if (resolvedOutcomes.length === 0) {
    return {
      scannedMarkets: pendingPredictionIds.length,
      settledMarkets: 0,
      affectedPicks: 0,
      winners: 0,
      losers: 0,
      canceled: 0,
    };
  }

  let settledMarkets = 0;
  let affectedPicks = 0;
  let winners = 0;
  let losers = 0;
  let canceled = 0;

  for (const item of resolvedOutcomes) {
    const result = await resolvePendingPredictionMarket({
      predictionId: item.predictionId,
      winningOutcomeId: item.winningOutcomeId,
      settleAsCanceled: item.settleAsCanceled,
      marketQuestion: marketQuestionByPredictionId.get(item.predictionId),
      cancellationReason: item.cancellationReason,
    });
    settledMarkets += 1;
    affectedPicks += result.affectedPicks;
    winners += result.winners;
    losers += result.losers;
    canceled += result.canceled;
  }

  return {
    scannedMarkets: pendingPredictionIds.length,
    settledMarkets,
    affectedPicks,
    winners,
    losers,
    canceled,
  };
}

// ─── File-based trivia question bank ────────────────────────────────────────

type LiveTriviaFileQuestion = {
  slug: string;
  question: string;
  answer: string;
  acceptableAnswers?: string[];
  answer_format: "write_in";
  category: string;
  difficulty: string;
  imageUrl?: string;
  imageCredit?: string;
};

type SpeedTriviaFileQuestion = {
  slug: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category: string;
  difficulty: string;
};

function getLiveTriviaDir() {
  return join(process.cwd(), "data", "live-trivia", "categories");
}

function getSpeedTriviaDir() {
  return join(process.cwd(), "data", "trivia", "categories");
}

function readAllLiveTriviaFiles(): Array<{ file: string; categoryName: string; questions: LiveTriviaFileQuestion[] }> {
  const dir = getLiveTriviaDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf-8")) as {
        categoryName?: string;
        questions: LiveTriviaFileQuestion[];
      };
      const categoryName = String(raw.categoryName || "").trim() ||
        file.replace(/\.v\d+\.json$/i, "").replace(/-/g, " ");
      return { file, categoryName, questions: Array.isArray(raw.questions) ? raw.questions : [] };
    });
}

function readAllSpeedTriviaFiles(): Array<{ file: string; categoryName: string; questions: SpeedTriviaFileQuestion[] }> {
  const dir = getSpeedTriviaDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf-8")) as {
        categoryName?: string;
        normal_multiple_choice: SpeedTriviaFileQuestion[];
      };
      const categoryName = String(raw.categoryName || "").trim() ||
        file.replace(/\.v\d+\.json$/i, "").replace(/-/g, " ");
      return { file, categoryName, questions: Array.isArray(raw.normal_multiple_choice) ? raw.normal_multiple_choice : [] };
    });
}

function mapLiveFileQuestion(q: LiveTriviaFileQuestion, categoryName: string): TriviaQuestion {
  const acceptableAnswers = sanitizeAcceptableAnswers(q.acceptableAnswers, q.answer);
  return {
    id: q.slug,
    question: q.question,
    options: [q.answer, ...acceptableAnswers],
    correctAnswer: 0,
    acceptableAnswers,
    category: categoryName || q.category,
    difficulty: q.difficulty,
    questionPool: "live_showdown",
    answerFormat: "write_in",
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
    ...(q.imageCredit ? { imageCredit: q.imageCredit } : {}),
  };
}

function mapSpeedFileQuestion(q: SpeedTriviaFileQuestion, categoryName: string): TriviaQuestion {
  return {
    id: q.slug,
    question: q.question,
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: Number.isFinite(q.correctAnswer) ? q.correctAnswer : 0,
    category: categoryName || q.category,
    difficulty: q.difficulty,
    questionPool: "anytime_blitz",
    answerFormat: "multiple_choice",
  };
}

function sortFileQuestions(
  questions: TriviaQuestion[],
  sortBy: string | undefined,
  ascending: boolean
): TriviaQuestion[] {
  return [...questions].sort((a, b) => {
    const av = sortBy === "category" ? a.category : sortBy === "difficulty" ? a.difficulty : a.question;
    const bv = sortBy === "category" ? b.category : sortBy === "difficulty" ? b.difficulty : b.question;
    return ascending
      ? (av ?? "").localeCompare(bv ?? "")
      : (bv ?? "").localeCompare(av ?? "");
  });
}

/**
 * Find a live-trivia question in the JSON files by slug and return
 * the file info and its index within the questions array.
 * Returns null if not found in any file.
 */
function findLiveTriviaQuestionInFile(
  slug: string
): { file: string; index: number; question: LiveTriviaFileQuestion } | null {
  const dir = getLiveTriviaDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf-8")) as {
      categoryName?: string;
      questions: LiveTriviaFileQuestion[];
    };
    const questions = Array.isArray(raw.questions) ? raw.questions : [];
    const index = questions.findIndex((q) => q.slug === slug);
    if (index !== -1) {
      return { file, index, question: questions[index] };
    }
  }
  return null;
}

/**
 * Find a speed-trivia question in the JSON files by slug and return
 * the file info and its index within the normal_multiple_choice array.
 * Returns null if not found in any file.
 */
function findSpeedTriviaQuestionInFile(
  slug: string
): { file: string; index: number; question: SpeedTriviaFileQuestion } | null {
  const dir = getSpeedTriviaDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf-8")) as {
      categoryName?: string;
      normal_multiple_choice: SpeedTriviaFileQuestion[];
    };
    const questions = Array.isArray(raw.normal_multiple_choice) ? raw.normal_multiple_choice : [];
    const index = questions.findIndex((q) => q.slug === slug);
    if (index !== -1) {
      return { file, index, question: questions[index] };
    }
  }
  return null;
}

/**
 * Update a live-trivia question directly in its JSON file by slug.
 * Returns the updated question mapped to TriviaQuestion shape.
 */
function updateLiveTriviaQuestionFileBySlug(
  slug: string,
  patch: { question: string; answer: string; acceptableAnswers?: string[]; category?: string | null; difficulty?: string | null }
): TriviaQuestion {
  const found = findLiveTriviaQuestionInFile(slug);
  if (!found) {
    throw new Error(`Live trivia question with slug "${slug}" not found in any JSON file.`);
  }

  const filePath = join(getLiveTriviaDir(), found.file);
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as {
    categoryName?: string;
    questions: LiveTriviaFileQuestion[];
  };

  const acceptableAnswers = sanitizeAcceptableAnswers(
    patch.acceptableAnswers ?? raw.questions[found.index].acceptableAnswers,
    patch.answer
  );

  raw.questions[found.index] = {
    ...raw.questions[found.index],
    slug,
    question: patch.question,
    answer: patch.answer,
    acceptableAnswers,
    answer_format: "write_in" as const,
    category: patch.category !== undefined ? patch.category ?? "" : raw.questions[found.index].category,
    difficulty: patch.difficulty !== undefined ? patch.difficulty ?? "" : raw.questions[found.index].difficulty,
  };

  writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");

  const updated = raw.questions[found.index];
  return {
    id: updated.slug,
    question: updated.question,
    options: [updated.answer, ...acceptableAnswers],
    correctAnswer: 0,
    acceptableAnswers,
    category: raw.categoryName || updated.category,
    difficulty: updated.difficulty,
    questionPool: "live_showdown",
    answerFormat: "write_in",
  };
}

/**
 * Update a speed-trivia question directly in its JSON file by slug.
 * Returns the updated question mapped to TriviaQuestion shape.
 */
function updateSpeedTriviaQuestionFileBySlug(
  slug: string,
  patch: { question: string; options: string[]; correctAnswer: number; category?: string | null; difficulty?: string | null }
): TriviaQuestion {
  const found = findSpeedTriviaQuestionInFile(slug);
  if (!found) {
    throw new Error(`Speed trivia question with slug "${slug}" not found in any JSON file.`);
  }

  const filePath = join(getSpeedTriviaDir(), found.file);
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as {
    categoryName?: string;
    normal_multiple_choice: SpeedTriviaFileQuestion[];
  };

  raw.normal_multiple_choice[found.index] = {
    ...raw.normal_multiple_choice[found.index],
    slug,
    question: patch.question,
    options: patch.options,
    correctAnswer: patch.correctAnswer,
    category: patch.category !== undefined ? patch.category ?? "" : raw.normal_multiple_choice[found.index].category,
    difficulty: patch.difficulty !== undefined ? patch.difficulty ?? "" : raw.normal_multiple_choice[found.index].difficulty,
  };

  writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");

  const updated = raw.normal_multiple_choice[found.index];
  return {
    id: updated.slug,
    question: updated.question,
    options: updated.options,
    correctAnswer: updated.correctAnswer,
    category: raw.categoryName || updated.category,
    difficulty: updated.difficulty,
    questionPool: "anytime_blitz",
    answerFormat: "multiple_choice",
  };
}

/**
 * Delete a live-trivia question directly from its JSON file by slug.
 * Returns true if found and deleted.
 */
function deleteLiveTriviaQuestionFileBySlug(slug: string): boolean {
  const found = findLiveTriviaQuestionInFile(slug);
  if (!found) return false;

  const filePath = join(getLiveTriviaDir(), found.file);
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as {
    categoryName?: string;
    questions: LiveTriviaFileQuestion[];
  };

  raw.questions.splice(found.index, 1);
  writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");
  return true;
}

/**
 * Delete a speed-trivia question directly from its JSON file by slug.
 * Returns true if found and deleted.
 */
function deleteSpeedTriviaQuestionFileBySlug(slug: string): boolean {
  const found = findSpeedTriviaQuestionInFile(slug);
  if (!found) return false;

  const filePath = join(getSpeedTriviaDir(), found.file);
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as {
    categoryName?: string;
    normal_multiple_choice: SpeedTriviaFileQuestion[];
  };

  raw.normal_multiple_choice.splice(found.index, 1);
  writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");
  return true;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function logAdminTriviaBankError(params: {
  action: "list" | "update" | "delete";
  questionType: "live" | "speed";
  questionId?: string;
  category?: string;
  error: unknown;
}): void {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  console.error("[admin][trivia-bank]", {
    action: params.action,
    questionType: params.questionType,
    questionId: params.questionId ?? null,
    category: params.category ?? null,
    error: message,
  });
}

function canFallbackToFileDelete(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Supabase admin client is not configured.") ||
    message.includes("Trivia question not found in database.")
  );
}

async function listAdminTriviaQuestionsByPool(opts: {
  questionPool: "anytime_blitz" | "live_showdown";
  page?: number;
  pageSize?: number;
  category?: string;
  sortBy?: string;
  sortDirection?: string;
  answerFormat?: string;
}): Promise<PaginatedResult<TriviaQuestion>> {
  assertAdminConfigured();
  return listAdminTriviaQuestions({
    page: opts.page,
    pageSize: opts.pageSize,
    questionPool: opts.questionPool,
    category: opts.category,
    answerFormat: opts.answerFormat,
    sortBy:
      opts.sortBy === "created_at" ||
      opts.sortBy === "category" ||
      opts.sortBy === "difficulty" ||
      opts.sortBy === "question_pool" ||
      opts.sortBy === "answer_format"
        ? opts.sortBy
        : undefined,
    sortDirection: opts.sortDirection === "asc" || opts.sortDirection === "desc" ? opts.sortDirection : undefined,
  });
}

async function updateTriviaBankQuestionByIdOrSlug(params: {
  questionType: "live" | "speed";
  identifier: string;
  patch: Record<string, unknown>;
  categoryForLog?: string;
}): Promise<TriviaQuestion> {
  assertAdminConfigured();
  const idOrSlug = String(params.identifier ?? "").trim();
  if (!idOrSlug) {
    throw new Error("Question id is required.");
  }

  const questionPool = params.questionType === "live" ? "live_showdown" : "anytime_blitz";
  const selectColumns =
    "id, question, options, correct_answer, category, difficulty, question_pool, answer_format, created_at";

  const runUpdate = async (field: "id" | "slug", value: string): Promise<TriviaQuestion | null> => {
    const { data, error } = await supabaseAdmin!
      .from("trivia_questions")
      .update(params.patch)
      .eq("question_pool", questionPool)
      .eq(field, value)
      .select(selectColumns)
      .maybeSingle<TriviaQuestionRow>();

    if (error) {
      throw new Error(error.message ?? "Failed to update trivia question.");
    }
    if (!data) {
      return null;
    }
    return mapTriviaRow(data);
  };

  try {
    const byId = isUuidLike(idOrSlug) ? await runUpdate("id", idOrSlug) : null;
    if (byId) {
      return byId;
    }
    const bySlug = await runUpdate("slug", idOrSlug);
    if (bySlug) {
      return bySlug;
    }
    throw new Error("Trivia question not found in database. Run the question-bank backfill first.");
  } catch (error) {
    logAdminTriviaBankError({
      action: "update",
      questionType: params.questionType,
      questionId: idOrSlug,
      category: params.categoryForLog,
      error,
    });
    throw error;
  }
}

async function deleteTriviaBankQuestionByIdOrSlug(params: {
  questionType: "live" | "speed";
  identifier: string;
}): Promise<void> {
  assertAdminConfigured();
  const idOrSlug = String(params.identifier ?? "").trim();
  if (!idOrSlug) {
    throw new Error("Question id is required.");
  }

  const questionPool = params.questionType === "live" ? "live_showdown" : "anytime_blitz";

  try {
    const lookupField = isUuidLike(idOrSlug) ? "id" : "slug";
    const { data: questionRow, error: lookupError } = await supabaseAdmin!
      .from("trivia_questions")
      .select("id, slug")
      .eq("question_pool", questionPool)
      .eq(lookupField, idOrSlug)
      .maybeSingle<{ id: string; slug: string | null }>();
    if (lookupError) {
      throw new Error(lookupError.message ?? "Failed to look up trivia question.");
    }
    if (!questionRow?.id) {
      throw new Error("Trivia question not found in database. Run the question-bank backfill first.");
    }

    const { error: updateError } = await supabaseAdmin!
      .from("trivia_questions")
      .update({ status: "deleted" })
      .eq("id", questionRow.id);
    if (updateError) {
      throw new Error(updateError.message ?? "Failed to mark trivia question as deleted.");
    }

    const slug = String(questionRow.slug ?? "").trim();
    if (slug) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: affectedData, error: affectedError } = await supabaseAdmin!
        .from("trivia_session_questions")
        .select("schedule_id, occurrence_date, round_number, question_index")
        .eq("question_id", slug)
        .gte("occurrence_date", today);
      if (affectedError) {
        throw new Error(affectedError.message ?? "Failed to find affected session questions.");
      }

      const affectedRows = (affectedData ?? []) as Array<{
        schedule_id: string;
        occurrence_date: string;
        round_number: number;
        question_index: number;
      }>;

      if (affectedRows.length > 0) {
        const scheduleIds = Array.from(new Set(affectedRows.map((row) => row.schedule_id).filter(Boolean)));
        const { data: scheduleData, error: scheduleError } = await supabaseAdmin!
          .from("trivia_schedules")
          .select("id, venue_id")
          .in("id", scheduleIds);
        if (scheduleError) {
          throw new Error(scheduleError.message ?? "Failed to resolve affected schedule venues.");
        }

        const venueBySchedule = new Map(
          ((scheduleData ?? []) as Array<{ id: string; venue_id: string | null }>).map((row) => [
            String(row.id),
            String(row.venue_id ?? "").trim(),
          ])
        );

        for (const row of affectedRows) {
          await replaceSessionQuestion(
            row.schedule_id,
            row.occurrence_date,
            row.round_number,
            row.question_index,
            venueBySchedule.get(row.schedule_id) ?? "",
            slug
          );
        }
      }
    }
  } catch (error) {
    logAdminTriviaBankError({
      action: "delete",
      questionType: params.questionType,
      questionId: idOrSlug,
      error,
    });
    throw error;
  }
}

async function listDistinctTriviaCategories(
  questionPool: "live_showdown" | "anytime_blitz"
): Promise<string[]> {
  assertAdminConfigured();
  const categories = new Set<string>();
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin!
      .from("trivia_questions")
      .select("category")
      .eq("question_pool", questionPool)
      .not("category", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ category: string | null }>) {
      const category = String(row.category ?? "").trim();
      if (category) categories.add(category);
    }
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

export async function listAllLiveTriviaCategories(): Promise<string[]> {
  try {
    const categories = await listDistinctTriviaCategories("live_showdown");
    if (categories.length > 0) return categories;
  } catch (error) {
    logAdminTriviaBankError({ action: "list", questionType: "live", error });
  }

  const fallbackCategories = new Set<string>();
  for (const f of readAllLiveTriviaFiles()) {
    if (f.categoryName.trim()) fallbackCategories.add(f.categoryName.trim());
  }
  return Array.from(fallbackCategories).sort((a, b) => a.localeCompare(b));
}

export async function listAllSpeedTriviaCategories(): Promise<string[]> {
  try {
    const categories = await listDistinctTriviaCategories("anytime_blitz");
    if (categories.length > 0) return categories;
  } catch (error) {
    logAdminTriviaBankError({ action: "list", questionType: "speed", error });
  }

  const fallbackCategories = new Set<string>();
  for (const f of readAllSpeedTriviaFiles()) {
    if (f.categoryName.trim()) fallbackCategories.add(f.categoryName.trim());
  }
  return Array.from(fallbackCategories).sort((a, b) => a.localeCompare(b));
}

export async function listAdminLiveTriviaQuestionsFromFiles(opts?: {
  page?: number;
  pageSize?: number;
  category?: string;
  sortBy?: string;
  sortDirection?: string;
  answerFormat?: string;
}): Promise<PaginatedResult<TriviaQuestion>> {
  try {
    return await listAdminTriviaQuestionsByPool({
      questionPool: "live_showdown",
      page: opts?.page,
      pageSize: opts?.pageSize,
      category: opts?.category,
      sortBy: opts?.sortBy,
      sortDirection: opts?.sortDirection,
      answerFormat: opts?.answerFormat,
    });
  } catch (error) {
    logAdminTriviaBankError({
      action: "list",
      questionType: "live",
      category: opts?.category,
      error,
    });
  }

  let all = readAllLiveTriviaFiles().flatMap((f) => f.questions.map((q) => mapLiveFileQuestion(q, f.categoryName)));
  const cat = String(opts?.category ?? "").trim().toLowerCase();
  if (cat) all = all.filter((q) => (q.category ?? "").toLowerCase() === cat);
  const answerFormat = String(opts?.answerFormat ?? "").trim();
  if (answerFormat) all = all.filter((q) => (q.answerFormat ?? "") === answerFormat);
  all = sortFileQuestions(all, opts?.sortBy, opts?.sortDirection !== "desc");

  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const pageSize = Math.min(10000, Math.max(1, Math.floor(opts?.pageSize ?? 25)));
  const total = all.length;
  return { items: all.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listAdminSpeedTriviaQuestionsFromFiles(opts?: {
  page?: number;
  pageSize?: number;
  category?: string;
  sortBy?: string;
  sortDirection?: string;
  answerFormat?: string;
}): Promise<PaginatedResult<TriviaQuestion>> {
  try {
    return await listAdminTriviaQuestionsByPool({
      questionPool: "anytime_blitz",
      page: opts?.page,
      pageSize: opts?.pageSize,
      category: opts?.category,
      sortBy: opts?.sortBy,
      sortDirection: opts?.sortDirection,
      answerFormat: opts?.answerFormat,
    });
  } catch (error) {
    logAdminTriviaBankError({
      action: "list",
      questionType: "speed",
      category: opts?.category,
      error,
    });
  }

  let all = readAllSpeedTriviaFiles().flatMap((f) => f.questions.map((q) => mapSpeedFileQuestion(q, f.categoryName)));
  const cat = String(opts?.category ?? "").trim().toLowerCase();
  if (cat) all = all.filter((q) => (q.category ?? "").toLowerCase() === cat);
  const answerFormat = String(opts?.answerFormat ?? "").trim();
  if (answerFormat) all = all.filter((q) => (q.answerFormat ?? "") === answerFormat);
  all = sortFileQuestions(all, opts?.sortBy, opts?.sortDirection !== "desc");

  const page = Math.max(1, Math.floor(opts?.page ?? 1));
  const pageSize = Math.min(10000, Math.max(1, Math.floor(opts?.pageSize ?? 25)));
  const total = all.length;
  return { items: all.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function updateAdminLiveTriviaQuestionInFile(input: {
  slug: string;
  question: string;
  answer: string;
  acceptableAnswers?: string[];
  category?: string;
  difficulty?: string;
}): Promise<TriviaQuestion> {
  const slug = input.slug.trim();
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!slug) throw new Error("slug is required.");
  if (!question) throw new Error("Question is required.");
  if (!answer) throw new Error("Answer is required for write-in questions.");

  const acceptableAnswers = sanitizeAcceptableAnswers(input.acceptableAnswers, answer);
  const patch: Record<string, unknown> = {
    question,
    options: [answer, ...acceptableAnswers],
    correct_answer: 0,
    question_pool: "live_showdown",
    answer_format: "write_in",
  };
  if (input.category !== undefined) {
    patch.category = input.category.trim() || null;
  }
  if (input.difficulty !== undefined) {
    patch.difficulty = input.difficulty.trim() || null;
  }

  // Try Supabase first; fall back to direct file update on failure
  try {
    return await updateTriviaBankQuestionByIdOrSlug({
      questionType: "live",
      identifier: slug,
      patch,
      categoryForLog: input.category,
    });
  } catch (error) {
    logAdminTriviaBankError({
      action: "update",
      questionType: "live",
      questionId: slug,
      category: input.category,
      error,
    });
  }

  return updateLiveTriviaQuestionFileBySlug(slug, {
    question,
    answer,
    acceptableAnswers,
    category: input.category !== undefined ? (input.category.trim() || null) : undefined,
    difficulty: input.difficulty !== undefined ? (input.difficulty.trim() || null) : undefined,
  });
}

export async function deleteAdminLiveTriviaQuestionInFile(slug: string): Promise<void> {
  const normalizedSlug = String(slug ?? "").trim();
  if (!normalizedSlug) throw new Error("slug is required.");

  // Try Supabase first; fall back to direct file deletion on failure
  try {
    await deleteTriviaBankQuestionByIdOrSlug({
      questionType: "live",
      identifier: normalizedSlug,
    });
    // Also remove from the local JSON file so re-imports don't resurrect it.
    deleteLiveTriviaQuestionFileBySlug(normalizedSlug);
    return;
  } catch (error) {
    logAdminTriviaBankError({
      action: "delete",
      questionType: "live",
      questionId: normalizedSlug,
      error,
    });
    if (!canFallbackToFileDelete(error)) {
      throw error;
    }
  }

  const deleted = deleteLiveTriviaQuestionFileBySlug(normalizedSlug);
  if (!deleted) {
    throw new Error(`Live trivia question with slug "${normalizedSlug}" not found in database or any JSON file.`);
  }
}

export async function updateAdminSpeedTriviaQuestionInFile(input: {
  slug: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category?: string;
  difficulty?: string;
}): Promise<TriviaQuestion> {
  const slug = input.slug.trim();
  const question = input.question.trim();
  const options = (input.options ?? []).map((o) => o.trim()).filter(Boolean);
  const correctAnswer = Math.floor(Number(input.correctAnswer ?? 0));
  if (!slug) throw new Error("slug is required.");
  if (!question) throw new Error("Question is required.");
  if (options.length < 2) throw new Error("At least two options are required.");
  if (correctAnswer < 0 || correctAnswer >= options.length) throw new Error("Correct answer index is out of range.");

  const patch: Record<string, unknown> = {
    question,
    options,
    correct_answer: correctAnswer,
    question_pool: "anytime_blitz",
    answer_format: "multiple_choice",
  };
  if (input.category !== undefined) {
    patch.category = input.category.trim() || null;
  }
  if (input.difficulty !== undefined) {
    patch.difficulty = input.difficulty.trim() || null;
  }

  // Try Supabase first; fall back to direct file update on failure
  try {
    return await updateTriviaBankQuestionByIdOrSlug({
      questionType: "speed",
      identifier: slug,
      patch,
      categoryForLog: input.category,
    });
  } catch (error) {
    logAdminTriviaBankError({
      action: "update",
      questionType: "speed",
      questionId: slug,
      category: input.category,
      error,
    });
  }

  return updateSpeedTriviaQuestionFileBySlug(slug, {
    question,
    options,
    correctAnswer,
    category: input.category !== undefined ? (input.category.trim() || null) : undefined,
    difficulty: input.difficulty !== undefined ? (input.difficulty.trim() || null) : undefined,
  });
}

export async function deleteAdminSpeedTriviaQuestionInFile(slug: string): Promise<void> {
  const normalizedSlug = String(slug ?? "").trim();
  if (!normalizedSlug) throw new Error("slug is required.");

  // Try Supabase first; fall back to direct file deletion on failure
  try {
    await deleteTriviaBankQuestionByIdOrSlug({
      questionType: "speed",
      identifier: normalizedSlug,
    });
    return;
  } catch (error) {
    logAdminTriviaBankError({
      action: "delete",
      questionType: "speed",
      questionId: normalizedSlug,
      error,
    });
    if (!canFallbackToFileDelete(error)) {
      throw error;
    }
  }

  const deleted = deleteSpeedTriviaQuestionFileBySlug(normalizedSlug);
  if (!deleted) {
    throw new Error(`Speed trivia question with slug "${normalizedSlug}" not found in database or any JSON file.`);
  }
}

async function resolvePendingPredictionMarketLegacy(params: {
  predictionId: string;
  winningOutcomeId?: string;
  settleAsCanceled?: boolean;
  marketQuestion?: string;
  cancellationReason?: "tie";
}): Promise<{ affectedPicks: number; winners: number; losers: number; canceled: number }> {
  assertAdminConfigured();

  const predictionId = params.predictionId.trim();
  const winningOutcomeId = params.winningOutcomeId?.trim() ?? "";
  const settleAsCanceled = Boolean(params.settleAsCanceled);

  if (!predictionId) {
    throw new Error("predictionId is required.");
  }
  if (!settleAsCanceled && !winningOutcomeId) {
    throw new Error("winningOutcomeId is required unless settling as canceled.");
  }

  let marketQuestion = params.marketQuestion?.trim() ?? "";
  if (!marketQuestion) {
    const market = await getPredictionMarketById(predictionId);
    marketQuestion = market?.question?.trim() ?? "";
  }

  const asStatement = (question: string) => question.replace(/\?+$/, "").trim();
  const cancellationReason = params.cancellationReason;
  const buildNotificationMessage = (status: PendingPredictionRow["status"], row: PendingPredictionRow): string => {
    const outcome = row.outcome_title.trim();
    const outcomeLower = outcome.toLowerCase();
    const eventText = marketQuestion ? asStatement(marketQuestion) : "";
    const isBinaryOutcome = outcomeLower === "yes" || outcomeLower === "no";

    if (status === "canceled") {
      if (cancellationReason === "tie") {
        if (eventText) {
          return `${eventText} ended in a tie, so this prediction was canceled.`;
        }
        return "This game ended in a tie, so your prediction was canceled.";
      }
      if (eventText) {
        return `${eventText} market was canceled.`;
      }
      return `Prediction canceled: ${outcome} market was canceled.`;
    }

    if (status === "won") {
      if (eventText) {
        if (isBinaryOutcome) {
          const happened = outcomeLower === "yes";
          return happened
            ? `${eventText}. You won ${row.points} points.`
            : `${eventText} did not happen. You won ${row.points} points.`;
        }
        return `${eventText}. Result: ${outcome}. You won ${row.points} points.`;
      }
      return `Prediction resolved: ${outcome} won. You earned ${row.points} points.`;
    }

    return "You lost this prediction.";
  };

  const { data, error } = await supabaseAdmin!
    .from("user_predictions")
    .select("id, user_id, prediction_id, outcome_id, outcome_title, points, status, created_at")
    .eq("prediction_id", predictionId)
    .eq("status", "pending");

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load pending picks for settlement.");
  }

  const pendingRows = data as PendingPredictionRow[];
  if (pendingRows.length === 0) {
    return { affectedPicks: 0, winners: 0, losers: 0, canceled: 0 };
  }

  const winnerPointDelta = new Map<string, number>();
  const notifications: Array<{ user_id: string; message: string; type: string }> = [];
  let winners = 0;
  let losers = 0;
  let canceled = 0;
  const resolvedAt = new Date().toISOString();

  for (const row of pendingRows) {
    let status: PendingPredictionRow["status"];
    if (settleAsCanceled) {
      status = "canceled";
      canceled += 1;
    } else if (row.outcome_id === winningOutcomeId) {
      status = "won";
      winners += 1;
      winnerPointDelta.set(row.user_id, (winnerPointDelta.get(row.user_id) ?? 0) + row.points);
    } else {
      status = "lost";
      losers += 1;
    }

    await supabaseAdmin!
      .from("user_predictions")
      .update({ status, resolved_at: resolvedAt })
      .eq("id", row.id);

    notifications.push({
      user_id: row.user_id,
      type: status === "won" ? "success" : status === "canceled" ? "info" : "warning",
      message: buildNotificationMessage(status, row),
    });
  }

  for (const [userId, delta] of winnerPointDelta.entries()) {
    const { data: userRow } = await supabaseAdmin!
      .from("users")
      .select("points")
      .eq("id", userId)
      .maybeSingle<{ points: number }>();
    const nextPoints = (userRow?.points ?? 0) + delta;
    await supabaseAdmin!.from("users").update({ points: nextPoints }).eq("id", userId);
  }

  if (notifications.length > 0) {
    await supabaseAdmin!.from("notifications").insert(notifications);
  }

  return {
    affectedPicks: pendingRows.length,
    winners,
    losers,
    canceled,
  };
}

// ── Account management ────────────────────────────────────────────────────────

export type AdminAccount = {
  id: string;
  username: string;
  godMode: boolean;
  createdAt: string;
};

export async function listAdminAccounts(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ items: AdminAccount[]; total: number }> {
  assertAdminConfigured();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseAdmin!
    .from("accounts")
    .select("id, username, god_mode, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const search = (params.search ?? "").trim();
  if (search) {
    query = query.ilike("username", `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to list accounts.");
  }

  const items: AdminAccount[] = ((data ?? []) as Array<{
    id: string;
    username: string;
    god_mode: boolean;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    username: row.username,
    godMode: row.god_mode,
    createdAt: row.created_at,
  }));

  return { items, total: count ?? 0 };
}

export async function deleteAdminAccount(accountId: string): Promise<void> {
  assertAdminConfigured();
  const id = accountId.trim();
  if (!id) {
    throw new Error("Account id is required.");
  }

  const { error } = await supabaseAdmin!
    .from("accounts")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message ?? "Failed to delete account.");
  }
}

export async function setAccountGodMode(accountId: string, godMode: boolean): Promise<void> {
  assertAdminConfigured();
  const id = accountId.trim();
  if (!id) {
    throw new Error("Account id is required.");
  }

  const { error } = await supabaseAdmin!
    .from("accounts")
    .update({ god_mode: godMode })
    .eq("id", id);

  if (error) {
    throw new Error(error.message ?? "Failed to update account.");
  }
}
