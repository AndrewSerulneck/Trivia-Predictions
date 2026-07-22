import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createNotification } from "@/lib/notifications";
import { isRewardsEnabled } from "@/lib/rewardsFlags";
import type {
  ChallengeCampaign,
  ChallengeCampaignProgress,
  ChallengeCampaignWin,
  ChallengeGameType,
  CampaignRecurringType,
  ChallengeScheduleType,
  ChallengeImageFitMode,
  ChallengeLeaderboardEntry,
  ChallengeLeaderboardTiebreaker,
  ChallengeLeaderboardViewer,
  ChallengeMode,
  ChallengeWinCondition,
  PrizeType,
  RewardPrizeKind,
  RewardMenuItem,
  RewardDiscountKind,
} from "@/types";

type ChallengeCampaignRow = {
  id: string;
  created_at: string;
  name: string;
  image_url: string | null;
  image_scale: number | null;
  image_focus_x: number | null;
  image_focus_y: number | null;
  image_fit: ChallengeImageFitMode | null;
  rules: string;
  venue_ids: string[] | null;
  schedule_type: string;
  active_days: string[] | null;
  start_date: string | null;
  start_time: string | null;
  end_day: string | null;
  end_time: string | null;
  end_date: string | null;
  game_types: string[] | null;
  point_multiplier: number | string;
  points_required_to_win: number;
  recurring_type: CampaignRecurringType;
  display_order: number | null;
  challenge_mode: ChallengeMode | null;
  leaderboard_display_limit: number | null;
  leaderboard_tiebreaker: ChallengeLeaderboardTiebreaker | null;
  winner_user_id: string | null;
  prize_type: string | null;
  prize_gift_certificate_amount: number | null;
  is_active: boolean;
  // Phase 9a: the venue owner who created this campaign, or null for admin-created.
  created_by_owner_id: string | null;
  // Rewards Phase 2: quota + richer prize model (nullable on legacy rows).
  win_condition: string | null;
  winner_quota: number | null;
  reward_definition_id: string | null;
  prize_kind: string | null;
  prize_menu_item: string | null;
  prize_menu_item_name: string | null;
  prize_discount_kind: string | null;
  prize_discount_value: number | null;
};

// Single source of truth for the campaign SELECT list (was duplicated across the
// list + create-insert queries). Includes created_by_owner_id (Phase 9a).
const CAMPAIGN_SELECT_COLUMNS =
  "id, created_at, name, image_url, image_scale, image_focus_x, image_focus_y, image_fit, rules, venue_ids, schedule_type, active_days, start_date, start_time, end_day, end_time, end_date, game_types, challenge_mode, leaderboard_display_limit, leaderboard_tiebreaker, point_multiplier, points_required_to_win, recurring_type, display_order, winner_user_id, prize_type, prize_gift_certificate_amount, is_active, created_by_owner_id, win_condition, winner_quota, reward_definition_id, prize_kind, prize_menu_item, prize_menu_item_name, prize_discount_kind, prize_discount_value";

type ChallengeCampaignProgressRow = {
  id: string;
  challenge_id: string;
  user_id: string;
  venue_id: string;
  points_earned: number;
  updated_at: string;
};

type ChallengeCampaignRedemptionRow = {
  challenge_id: string;
  winner_user_id: string;
  venue_id: string;
  claimed_at: string;
  prize_expires_at: string | null;
  prize_redeemed_at: string | null;
  cycle_start: string;
};

type ChallengeLeaderboardProgressRow = {
  userId: string;
  username: string;
  pointsEarned: number;
  updatedAt: string;
};

type ChallengeLeaderboardRpcRow = {
  rank_position: number;
  user_id: string;
  username: string | null;
  points_earned: number;
  updated_at: string;
  is_viewer: boolean;
  in_top: boolean;
};

const VALID_PRIZE_TYPES: PrizeType[] = ["wine_bottle", "free_appetizer", "gift_certificate"];

// ── Rewards prize model (Phase 2) ──
const VALID_PRIZE_KINDS: RewardPrizeKind[] = ["menu_item", "gift_card"];
const VALID_MENU_ITEMS: RewardMenuItem[] = [
  "whole_order",
  "appetizer",
  "entree",
  "dessert",
  "wine_bottle",
  "other",
];
const VALID_DISCOUNT_KINDS: RewardDiscountKind[] = ["dollar", "percent"];

function normalizePrizeKind(value: string | null | undefined): RewardPrizeKind | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_PRIZE_KINDS.includes(normalized as RewardPrizeKind) ? (normalized as RewardPrizeKind) : null;
}
function normalizeMenuItem(value: string | null | undefined): RewardMenuItem | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_MENU_ITEMS.includes(normalized as RewardMenuItem) ? (normalized as RewardMenuItem) : null;
}
function normalizeDiscountKind(value: string | null | undefined): RewardDiscountKind | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_DISCOUNT_KINDS.includes(normalized as RewardDiscountKind) ? (normalized as RewardDiscountKind) : null;
}
function normalizeWinnerQuota(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(Number(value)));
}

// Unknown/legacy/null values fall back to the historical points-threshold
// behavior, so a row written before the win_condition column existed keeps
// resolving exactly as it did.
function normalizeWinCondition(value: string | null | undefined): ChallengeWinCondition {
  return String(value ?? "").trim() === "game_winner" ? "game_winner" : "points_threshold";
}

// Coupons are minted for winners of any campaign that carries a prize. Rewards
// (Phase 2+) may set only the new-model `prizeKind` with `prizeType = null`, so
// the win engine gates on "has any prize" — legacy prizeType OR new prizeKind —
// rather than the old `prizeType`-only check.
export function campaignHasPrize(
  campaign: Pick<ChallengeCampaign, "prizeType" | "prizeKind">
): boolean {
  return Boolean(campaign.prizeType || campaign.prizeKind);
}

const PRIZE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolve the new prize-model fields for a campaign row. New-model rows carry
 * prize_kind directly; pre-Rewards rows carry only the legacy prize_type, which we
 * derive into the new shape so downstream renderers see one consistent prize shape.
 *   gift_certificate → gift_card (amount = prize_gift_certificate_amount)
 *   free_appetizer   → 100% off appetizer
 *   wine_bottle      → 100% off (free) bottle of wine
 */
type RewardPrizeSourceRow = Pick<
  ChallengeCampaignRow,
  "prize_kind" | "prize_menu_item" | "prize_menu_item_name" | "prize_discount_kind" | "prize_discount_value" | "prize_type"
>;

function resolveRewardPrize(row: RewardPrizeSourceRow): {
  prizeKind: RewardPrizeKind | null;
  prizeMenuItem: RewardMenuItem | null;
  prizeMenuItemName: string | null;
  prizeDiscountKind: RewardDiscountKind | null;
  prizeDiscountValue: number | null;
} {
  const explicitKind = normalizePrizeKind(row.prize_kind);
  if (explicitKind) {
    return {
      prizeKind: explicitKind,
      prizeMenuItem: normalizeMenuItem(row.prize_menu_item),
      prizeMenuItemName: row.prize_menu_item_name?.trim() || null,
      prizeDiscountKind: normalizeDiscountKind(row.prize_discount_kind),
      prizeDiscountValue:
        row.prize_discount_value === null || row.prize_discount_value === undefined
          ? null
          : Math.max(0, Number(row.prize_discount_value)),
    };
  }

  // Legacy fallback (prize_kind is null): derive the new shape from prize_type.
  const legacy = VALID_PRIZE_TYPES.includes(row.prize_type as PrizeType) ? (row.prize_type as PrizeType) : null;
  if (legacy === "gift_certificate") {
    return { prizeKind: "gift_card", prizeMenuItem: null, prizeMenuItemName: null, prizeDiscountKind: null, prizeDiscountValue: null };
  }
  if (legacy === "free_appetizer") {
    return { prizeKind: "menu_item", prizeMenuItem: "appetizer", prizeMenuItemName: null, prizeDiscountKind: "percent", prizeDiscountValue: 100 };
  }
  if (legacy === "wine_bottle") {
    return { prizeKind: "menu_item", prizeMenuItem: "wine_bottle", prizeMenuItemName: null, prizeDiscountKind: "percent", prizeDiscountValue: 100 };
  }
  return { prizeKind: null, prizeMenuItem: null, prizeMenuItemName: null, prizeDiscountKind: null, prizeDiscountValue: null };
}

const VALID_GAME_TYPES: Array<Exclude<ChallengeGameType, "trivia">> = [
  "pickem",
  "fantasy",
  "speed-trivia",
  "live-trivia",
  "bingo",
];
const VALID_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const VALID_IMAGE_FITS: ChallengeImageFitMode[] = ["cover", "contain"];
const VALID_CHALLENGE_MODES: ChallengeMode[] = ["progress", "leaderboard"];
const VALID_LEADERBOARD_TIEBREAKERS: ChallengeLeaderboardTiebreaker[] = ["first_to_score", "latest_activity"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeChallengeMode(value: string | undefined | null): ChallengeMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_CHALLENGE_MODES.includes(normalized as ChallengeMode) ? (normalized as ChallengeMode) : "progress";
}

function normalizeLeaderboardDisplayLimit(value: number | undefined | null): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(50, Math.round(Number(value))));
}

function normalizeLeaderboardTiebreaker(value: string | undefined | null): ChallengeLeaderboardTiebreaker {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_LEADERBOARD_TIEBREAKERS.includes(normalized as ChallengeLeaderboardTiebreaker)
    ? (normalized as ChallengeLeaderboardTiebreaker)
    : "first_to_score";
}

function toSortableTimestamp(value: string): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Deterministic tie-breaking:
 * 1) Higher points wins.
 * 2) If tied:
 *    - first_to_score: earlier updatedAt wins.
 *    - latest_activity: later updatedAt wins.
 * 3) Final fallback: lexical userId.
 */
export function compareChallengeLeaderboardRows(
  a: ChallengeLeaderboardProgressRow,
  b: ChallengeLeaderboardProgressRow,
  tiebreaker: ChallengeLeaderboardTiebreaker
): number {
  if (a.pointsEarned !== b.pointsEarned) {
    return b.pointsEarned - a.pointsEarned;
  }

  const aTime = toSortableTimestamp(a.updatedAt);
  const bTime = toSortableTimestamp(b.updatedAt);
  if (aTime !== bTime) {
    return tiebreaker === "latest_activity" ? bTime - aTime : aTime - bTime;
  }

  return a.userId.localeCompare(b.userId);
}

export function buildChallengeLeaderboardSnapshot(
  rows: ChallengeLeaderboardProgressRow[],
  options: {
    displayLimit: number;
    viewerUserId?: string;
    tiebreaker: ChallengeLeaderboardTiebreaker;
  }
): {
  topEntries: ChallengeLeaderboardEntry[];
  viewer: ChallengeLeaderboardViewer | null;
  ordered: ChallengeLeaderboardProgressRow[];
} {
  const displayLimit = normalizeLeaderboardDisplayLimit(options.displayLimit);
  const viewerUserId = String(options.viewerUserId ?? "").trim();
  const ordered = [...rows].sort((a, b) => compareChallengeLeaderboardRows(a, b, options.tiebreaker));

  const topEntries = ordered.slice(0, displayLimit).map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    username: row.username,
    points: row.pointsEarned,
    updatedAt: row.updatedAt,
  }));

  if (!viewerUserId) {
    return { topEntries, viewer: null, ordered };
  }

  const viewerIndex = ordered.findIndex((row) => row.userId === viewerUserId);
  if (viewerIndex < 0) {
    return {
      topEntries,
      viewer: {
        rank: null,
        userId: viewerUserId,
        username: null,
        points: 0,
        inTop: false,
      },
      ordered,
    };
  }

  const viewerRow = ordered[viewerIndex];
  return {
    topEntries,
    viewer: {
      rank: viewerIndex + 1,
      userId: viewerRow.userId,
      username: viewerRow.username,
      points: viewerRow.pointsEarned,
      inTop: viewerIndex < displayLimit,
    },
    ordered,
  };
}

export function pickLeaderboardWinner(
  rows: ChallengeLeaderboardProgressRow[],
  tiebreaker: ChallengeLeaderboardTiebreaker
): ChallengeLeaderboardProgressRow | null {
  if (rows.length === 0) return null;
  const ordered = [...rows].sort((a, b) => compareChallengeLeaderboardRows(a, b, tiebreaker));
  return ordered[0] ?? null;
}

function normalizeGameTypeAlias(value: string): ChallengeGameType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "trivia") return "speed-trivia";
  if (normalized === "live_trivia") return "live-trivia";
  return normalized as ChallengeGameType;
}

function mapCampaignRow(
  row: ChallengeCampaignRow,
  winnerUsername?: string | null,
  prizeClaimedAt?: string | null
): ChallengeCampaign {
  const gameTypes = (row.game_types ?? [])
    .map((value) => normalizeGameTypeAlias(value))
    .filter(
      (value): value is Exclude<ChallengeGameType, "trivia"> =>
        VALID_GAME_TYPES.includes(value as Exclude<ChallengeGameType, "trivia">)
    );

  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    imageUrl: row.image_url ?? undefined,
    imageScale: row.image_scale === null || row.image_scale === undefined ? 1 : clamp(Number(row.image_scale), 0.6, 2.5),
    imageFocusX: row.image_focus_x === null || row.image_focus_x === undefined ? 50 : clamp(Number(row.image_focus_x), 0, 100),
    imageFocusY: row.image_focus_y === null || row.image_focus_y === undefined ? 50 : clamp(Number(row.image_focus_y), 0, 100),
    imageFit: VALID_IMAGE_FITS.includes((row.image_fit ?? "cover") as ChallengeImageFitMode)
      ? (row.image_fit as ChallengeImageFitMode)
      : "cover",
    rules: row.rules,
    venueIds: Array.isArray(row.venue_ids) ? row.venue_ids : [],
    scheduleType: (row.schedule_type === "multi_day" || row.schedule_type === "one_time") ? "multi_day" : "single_day",
    activeDays: Array.isArray(row.active_days) ? row.active_days : [],
    startDate: row.start_date ?? undefined,
    startTime: row.start_time ?? undefined,
    endDay: row.end_day ?? undefined,
    endTime: row.end_time ?? undefined,
    endDate: row.end_date ?? undefined,
    gameTypes: gameTypes.length > 0 ? gameTypes : [...VALID_GAME_TYPES],
    challengeMode: normalizeChallengeMode(row.challenge_mode),
    leaderboardDisplayLimit: normalizeLeaderboardDisplayLimit(row.leaderboard_display_limit),
    leaderboardTiebreaker: normalizeLeaderboardTiebreaker(row.leaderboard_tiebreaker),
    pointMultiplier: Math.max(0.001, Number(row.point_multiplier ?? 1)),
    pointsRequiredToWin: Math.max(1, Number(row.points_required_to_win ?? 100)),
    recurringType: row.recurring_type,
    displayOrder: row.display_order ?? null,
    winnerUserId: row.winner_user_id,
    winnerUsername: winnerUsername ?? null,
    prizeClaimedAt: prizeClaimedAt ?? null,
    prizeType: VALID_PRIZE_TYPES.includes(row.prize_type as PrizeType) ? (row.prize_type as PrizeType) : null,
    prizeGiftCertificateAmount: row.prize_gift_certificate_amount ?? null,
    winCondition: normalizeWinCondition(row.win_condition),
    winnerQuota: normalizeWinnerQuota(row.winner_quota),
    rewardDefinitionId: row.reward_definition_id?.trim() || null,
    ...resolveRewardPrize(row),
    isActive: Boolean(row.is_active),
    createdByOwnerId: row.created_by_owner_id ?? null,
  };
}

function mapProgressRow(row: ChallengeCampaignProgressRow): ChallengeCampaignProgress {
  return {
    id: row.id,
    challengeId: row.challenge_id,
    userId: row.user_id,
    venueId: row.venue_id,
    pointsEarned: Math.max(0, Number(row.points_earned ?? 0)),
    updatedAt: row.updated_at,
  };
}

function normalizeDays(input: string[] | undefined): string[] {
  const normalized = new Set<string>();
  for (const value of input ?? []) {
    const key = String(value ?? "").trim().toLowerCase().slice(0, 3);
    if ((VALID_DAYS as readonly string[]).includes(key)) {
      normalized.add(key);
    }
  }
  return [...normalized];
}

function normalizeGameTypes(input: string[] | undefined): Array<Exclude<ChallengeGameType, "trivia">> {
  const normalized = new Set<Exclude<ChallengeGameType, "trivia">>();
  for (const value of input ?? []) {
    const key = normalizeGameTypeAlias(value);
    if (VALID_GAME_TYPES.includes(key as Exclude<ChallengeGameType, "trivia">)) {
      normalized.add(key as Exclude<ChallengeGameType, "trivia">);
    }
  }
  return normalized.size > 0 ? [...normalized] : [...VALID_GAME_TYPES];
}

function toLocalParts(date: Date, timezone: string): { dow: number; hour: number; minute: number } {
  const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const dowStr = get("weekday").toLowerCase().slice(0, 3);
  const rawHour = parseInt(get("hour"), 10);
  return {
    dow: Math.max(0, DOW_KEYS.indexOf(dowStr)),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: parseInt(get("minute"), 10),
  };
}

function getWeekdayKey(date: Date, timezone: string): string {
  const { dow } = toLocalParts(date, timezone);
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dow] ?? "sun";
}

// Convert a local wall-clock date/time to its UTC equivalent using a probe+offset approach.
// Accurate for all but the ambiguous DST hour (acceptable for cycle boundary math).
function localDateTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const probe = new Date(Date.UTC(year, month, day, hour, minute, 0));
  const { hour: localH, minute: localM } = toLocalParts(probe, timezone);
  let offsetMinutes = (localH * 60 + localM) - (hour * 60 + minute);
  if (offsetMinutes > 12 * 60) offsetMinutes -= 24 * 60;
  if (offsetMinutes < -12 * 60) offsetMinutes += 24 * 60;
  return new Date(probe.getTime() - offsetMinutes * 60 * 1000);
}

// Return the canonical UTC start timestamp of the recurrence cycle that `now` falls in.
// For recurring challenges this is the most recent activeDays[0] at startTime in local time.
// For one-time challenges it is always startDate + startTime.
function computeCycleStart(campaign: ChallengeCampaign, now: Date, timezone: string): Date {
  const isRecurring = campaign.recurringType && campaign.recurringType !== "none";
  if (!isRecurring) {
    if (campaign.startDate) {
      const [h, m] = (campaign.startTime ?? "00:00").split(":").map(Number);
      const [y, mo, d] = campaign.startDate.split("-").map(Number);
      return localDateTimeToUtc(y, mo - 1, d, h, m, timezone);
    }
    return new Date(0);
  }

  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const startDayKey = campaign.activeDays[0];
  if (!startDayKey) return new Date(0);
  const startDowIndex = DOW.indexOf(startDayKey);
  if (startDowIndex < 0) return new Date(0);

  const [startH, startM] = (campaign.startTime ?? "00:00").split(":").map(Number);
  const { dow: nowDow, hour: nowH, minute: nowM } = toLocalParts(now, timezone);
  const daysFromStart = ((nowDow - startDowIndex) + 7) % 7;
  const minutesFromCycleStart = daysFromStart * 1440 + (nowH * 60 + nowM) - (startH * 60 + startM);

  // If negative, we haven't reached this week's start yet — roll back to prior week
  const daysBack = minutesFromCycleStart < 0 ? daysFromStart + 7 : daysFromStart;

  // Derive local calendar date of `now`, then step back daysBack days
  const localDateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const getP = (type: string) => localDateParts.find((p) => p.type === type)?.value ?? "1";
  const localNowMs = Date.UTC(parseInt(getP("year")), parseInt(getP("month")) - 1, parseInt(getP("day")));
  const cycleDate = new Date(localNowMs - daysBack * 86400000);

  return localDateTimeToUtc(cycleDate.getUTCFullYear(), cycleDate.getUTCMonth(), cycleDate.getUTCDate(), startH, startM, timezone);
}

// Returns the UTC timestamp when the cycle that started at cycleStart ends.
function computeCycleEnd(campaign: ChallengeCampaign, cycleStart: Date, timezone: string): Date {
  const isRecurring = campaign.recurringType && campaign.recurringType !== "none";
  if (!isRecurring) {
    if (campaign.endDate) {
      const [h, m] = (campaign.endTime ?? "23:59").split(":").map(Number);
      const [y, mo, d] = campaign.endDate.split("-").map(Number);
      return localDateTimeToUtc(y, mo - 1, d, h, m, timezone);
    }
    return new Date(8640000000000000);
  }

  const [startH, startM] = (campaign.startTime ?? "00:00").split(":").map(Number);
  const [endH, endM] = (campaign.endTime ?? "23:59").split(":").map(Number);

  const isMultiDay = campaign.scheduleType === "multi_day" || campaign.scheduleType === "one_time";
  if (isMultiDay && campaign.endDay) {
    const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const startDowIndex = DOW.indexOf(campaign.activeDays[0] ?? "");
    const endDowIndex = DOW.indexOf(campaign.endDay);
    if (startDowIndex >= 0 && endDowIndex >= 0) {
      const daySpan = ((endDowIndex - startDowIndex) + 7) % 7;
      const durationMinutes = (daySpan === 0 ? 7 : daySpan) * 1440 + (endH * 60 + endM) - (startH * 60 + startM);
      return new Date(cycleStart.getTime() + durationMinutes * 60 * 1000);
    }
  }

  const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  const safeDuration = durationMinutes > 0 ? durationMinutes : durationMinutes + 24 * 60;
  return new Date(cycleStart.getTime() + safeDuration * 60 * 1000);
}

async function getCycleWinnerForCampaign(params: {
  campaignId: string;
  cycleStart: Date;
  tiebreaker: ChallengeLeaderboardTiebreaker;
}): Promise<{ userId: string; venueId: string; pointsEarned: number } | null> {
  assertConfigured();
  const updatedAtAscending = params.tiebreaker !== "latest_activity";
  const { data, error } = await supabaseAdmin!
    .from("challenge_campaign_progress")
    .select("user_id, venue_id, points_earned")
    .eq("challenge_id", params.campaignId)
    .eq("cycle_start", params.cycleStart.toISOString())
    .order("points_earned", { ascending: false })
    .order("updated_at", { ascending: updatedAtAscending })
    .order("user_id", { ascending: true })
    .limit(1)
    .maybeSingle<{ user_id: string; venue_id: string; points_earned: number }>();
  if (error) throw new Error(error.message ?? "Failed to determine cycle winner.");
  return data ? { userId: data.user_id, venueId: data.venue_id, pointsEarned: data.points_earned } : null;
}

function isMultiDayCampaignActive(campaign: ChallengeCampaign, now: Date, timezone: string): boolean {
  const isRecurring = campaign.recurringType && campaign.recurringType !== "none";
  if (isRecurring) {
    return isMultiDayRecurringActive(campaign, now, timezone);
  }
  // One-time: absolute start_date → end_date window
  if (!campaign.startDate || !campaign.endDate) return false;
  const startMs = Date.parse(campaign.startTime ? `${campaign.startDate}T${campaign.startTime}:00` : `${campaign.startDate}T00:00:00`);
  const endMs = Date.parse(campaign.endTime ? `${campaign.endDate}T${campaign.endTime}:59` : `${campaign.endDate}T23:59:59`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return now.getTime() >= startMs && now.getTime() <= endMs;
}

function isMultiDayRecurringActive(campaign: ChallengeCampaign, now: Date, timezone: string): boolean {
  const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const startDayKey = campaign.activeDays[0];
  const endDayKey = campaign.endDay;
  if (!startDayKey || !endDayKey) return false;
  const startDowIndex = DOW.indexOf(startDayKey as typeof DOW[number]);
  const endDowIndex = DOW.indexOf(endDayKey as typeof DOW[number]);
  if (startDowIndex < 0 || endDowIndex < 0) return false;

  const [startH, startM] = (campaign.startTime ?? "00:00").split(":").map(Number);
  const [endH, endM] = (campaign.endTime ?? "23:59").split(":").map(Number);

  // Day span from start dow to end dow in local time (0 = treat as full 7-day span)
  const daySpan = ((endDowIndex - startDowIndex) + 7) % 7;

  const { dow: nowDow, hour: nowH, minute: nowM } = toLocalParts(now, timezone);
  const daysFromStart = ((nowDow - startDowIndex) + 7) % 7;

  const nowMinOfDay = nowH * 60 + nowM;
  const startMinOfDay = startH * 60 + startM;
  const endMinOfDay = endH * 60 + endM;
  const windowDurationMinutes = (daySpan === 0 ? 7 : daySpan) * 1440 + (endMinOfDay - startMinOfDay);
  const minutesFromWindowStart = daysFromStart * 1440 + nowMinOfDay - startMinOfDay;

  let inWindow: boolean;
  if (minutesFromWindowStart < 0) {
    // May still be inside the previous week's window
    const minutesFromPrevWindowStart = minutesFromWindowStart + 7 * 1440;
    inWindow = minutesFromPrevWindowStart >= 0 && minutesFromPrevWindowStart <= windowDurationMinutes;
  } else {
    inWindow = minutesFromWindowStart <= windowDurationMinutes;
  }
  if (!inWindow) return false;

  // Optional expiry: end_date as the last date this recurring challenge runs
  if (campaign.endDate) {
    const expiryMs = Date.parse(`${campaign.endDate}T23:59:59`);
    if (Number.isFinite(expiryMs) && now.getTime() > expiryMs) return false;
  }

  return true;
}

function isTimeInWindow(now: Date, startTime: string | undefined, endTime: string | undefined, timezone: string): boolean {
  if (!startTime || !endTime) {
    return true;
  }
  const { hour, minute } = toLocalParts(now, timezone);
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  if (start <= end) {
    return hhmm >= start && hhmm <= end;
  }
  // Overnight window (e.g. 22:00 -> 02:00)
  return hhmm >= start || hhmm <= end;
}

function campaignMatchesVenue(campaign: ChallengeCampaign, venueId: string): boolean {
  if (!venueId) return false;
  if (!campaign.venueIds || campaign.venueIds.length === 0) return true;
  return campaign.venueIds.includes(venueId);
}

function isCampaignEligibleAtTime(campaign: ChallengeCampaign, now: Date, gameType: ChallengeGameType, timezone: string): boolean {
  if (!campaign.isActive || campaign.winnerUserId) return false;
  if (!campaign.gameTypes.includes(gameType)) return false;
  if (campaign.scheduleType === "multi_day" || campaign.scheduleType === "one_time") {
    return isMultiDayCampaignActive(campaign, now, timezone);
  }
  // Recurring single-day path
  if (campaign.endDate) {
    const endDate = new Date(`${campaign.endDate}T23:59:59.999Z`);
    if (Number.isFinite(endDate.getTime()) && now.getTime() > endDate.getTime()) {
      return false;
    }
  }
  if (campaign.activeDays.length > 0 && !campaign.activeDays.includes(getWeekdayKey(now, timezone))) {
    return false;
  }
  if (!isTimeInWindow(now, campaign.startTime, campaign.endTime, timezone)) {
    return false;
  }
  return true;
}

// Exported for the game-winner resolver (lib/liveTriviaWinnerRewards.ts), which
// needs the same close boundary to avoid awarding a game that ran after the
// campaign's end date — kept here rather than copied so the two can't drift.
export function getCampaignCloseTimestampMs(campaign: ChallengeCampaign): number | null {
  const isMultiDay = campaign.scheduleType === "multi_day" || campaign.scheduleType === "one_time";
  if (isMultiDay) {
    // Recurring multi-day campaigns have no fixed close — they repeat each period.
    if (campaign.recurringType && campaign.recurringType !== "none") return null;
    if (!campaign.endDate) return null;
    const endTime = String(campaign.endTime ?? "").trim();
    const boundary = endTime ? `${campaign.endDate}T${endTime}:59` : `${campaign.endDate}T23:59:59`;
    const parsed = Date.parse(boundary);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!campaign.endDate) return null;
  const endTime = String(campaign.endTime ?? "").trim();
  const boundary = endTime
    ? `${campaign.endDate}T${endTime}:59.999Z`
    : `${campaign.endDate}T23:59:59.999Z`;
  const parsed = Date.parse(boundary);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLeaderboardCampaignClosed(campaign: ChallengeCampaign, now: Date): boolean {
  if (campaign.challengeMode !== "leaderboard" || campaign.winnerUserId) return false;
  const closeAt = getCampaignCloseTimestampMs(campaign);
  if (closeAt !== null) {
    return now.getTime() > closeAt;
  }
  return !campaign.isActive;
}

async function listLeaderboardProgressRows(params: {
  challengeId: string;
  venueId?: string;
  cycleStart?: Date;
}): Promise<ChallengeLeaderboardProgressRow[]> {
  assertConfigured();
  let query = supabaseAdmin!
    .from("challenge_campaign_progress")
    .select("user_id, points_earned, updated_at")
    .eq("challenge_id", params.challengeId)
    .limit(5000);
  if (params.venueId) {
    query = query.eq("venue_id", params.venueId);
  }
  if (params.cycleStart) {
    query = query.eq("cycle_start", params.cycleStart.toISOString());
  }

  const { data, error } = await query.returns<Array<{ user_id: string; points_earned: number; updated_at: string }>>();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load challenge leaderboard progress.");
  }
  if (data.length === 0) return [];

  const userIds = Array.from(new Set(data.map((row) => row.user_id).filter(Boolean)));
  const { data: userRows, error: userError } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .in("id", userIds)
    .returns<Array<{ id: string; username: string }>>();
  if (userError) {
    throw new Error(userError.message ?? "Failed to load challenge leaderboard users.");
  }
  const usernameById = new Map<string, string>((userRows ?? []).map((row) => [row.id, row.username]));

  return data.map((row) => ({
    userId: row.user_id,
    username: usernameById.get(row.user_id) ?? "Player",
    pointsEarned: Math.max(0, Number(row.points_earned ?? 0)),
    updatedAt: row.updated_at,
  }));
}

async function getLeaderboardSnapshotViaRpc(params: {
  challengeId: string;
  venueId: string;
  viewerUserId?: string;
  displayLimit: number;
  tiebreaker: ChallengeLeaderboardTiebreaker;
  cycleStart?: Date;
}): Promise<{ topEntries: ChallengeLeaderboardEntry[]; viewer: ChallengeLeaderboardViewer | null } | null> {
  assertConfigured();
  const viewerUserId = String(params.viewerUserId ?? "").trim();
  const { data, error } = await supabaseAdmin!.rpc("get_challenge_leaderboard_snapshot", {
    p_challenge_id: params.challengeId,
    p_venue_id: params.venueId,
    p_viewer_user_id: viewerUserId || null,
    p_limit: normalizeLeaderboardDisplayLimit(params.displayLimit),
    p_tiebreaker: params.tiebreaker,
    p_cycle_start: params.cycleStart ? params.cycleStart.toISOString() : null,
  });

  if (error || !Array.isArray(data)) {
    return null;
  }

  const rows = data as ChallengeLeaderboardRpcRow[];
  const topEntries = rows
    .filter((row) => row.in_top)
    .sort((a, b) => Number(a.rank_position) - Number(b.rank_position))
    .map((row) => ({
      rank: Math.max(1, Number(row.rank_position)),
      userId: row.user_id,
      username: row.username ?? "Player",
      points: Math.max(0, Number(row.points_earned ?? 0)),
      updatedAt: row.updated_at,
    }));

  const viewerRow = rows.find((row) => row.is_viewer);
  const viewer: ChallengeLeaderboardViewer | null = viewerUserId
    ? viewerRow
      ? {
          rank: Math.max(1, Number(viewerRow.rank_position)),
          userId: viewerRow.user_id,
          username: viewerRow.username ?? "Player",
          points: Math.max(0, Number(viewerRow.points_earned ?? 0)),
          inTop: Boolean(viewerRow.in_top),
        }
      : {
          rank: null,
          userId: viewerUserId,
          username: null,
          points: 0,
          inTop: false,
        }
    : null;

  return { topEntries, viewer };
}

async function getLeaderboardWinnerUserId(params: {
  campaignId: string;
  tiebreaker: ChallengeLeaderboardTiebreaker;
}): Promise<{ userId: string; venueId: string } | null> {
  assertConfigured();
  const updatedAtAscending = params.tiebreaker !== "latest_activity";
  const { data, error } = await supabaseAdmin!
    .from("challenge_campaign_progress")
    .select("user_id, venue_id")
    .eq("challenge_id", params.campaignId)
    .order("points_earned", { ascending: false })
    .order("updated_at", { ascending: updatedAtAscending })
    .order("user_id", { ascending: true })
    .limit(1)
    .maybeSingle<{ user_id: string; venue_id: string }>();
  if (error) {
    throw new Error(error.message ?? "Failed to determine leaderboard winner.");
  }
  return data ? { userId: data.user_id, venueId: data.venue_id } : null;
}

async function getLeaderboardSnapshotForCampaign(params: {
  campaign: ChallengeCampaign;
  venueId: string;
  viewerUserId?: string;
  now?: Date;
}): Promise<{ topEntries: ChallengeLeaderboardEntry[]; viewer: ChallengeLeaderboardViewer | null; isBetweenCycles?: boolean; nextCycleStart?: string }> {
  const effectiveNow = params.now ?? new Date();
  const venueTimezone = await getVenueTimezone(params.venueId);
  const cycleStart = computeCycleStart(params.campaign, effectiveNow, venueTimezone);

  const isRecurring = params.campaign.recurringType && params.campaign.recurringType !== "none";
  if (isRecurring) {
    const cycleEnd = computeCycleEnd(params.campaign, cycleStart, venueTimezone);
    if (effectiveNow.getTime() > cycleEnd.getTime()) {
      const periodMs = params.campaign.recurringType === "daily" ? 86400000
        : params.campaign.recurringType === "monthly" ? 30 * 86400000
        : 7 * 86400000;
      const nextCycleStart = new Date(cycleStart.getTime() + periodMs);
      const prevRpc = await getLeaderboardSnapshotViaRpc({
        challengeId: params.campaign.id,
        venueId: params.venueId,
        viewerUserId: params.viewerUserId,
        displayLimit: params.campaign.leaderboardDisplayLimit,
        tiebreaker: params.campaign.leaderboardTiebreaker,
        cycleStart,
      });
      const prevData = prevRpc ?? { topEntries: [], viewer: null };
      return { ...prevData, isBetweenCycles: true, nextCycleStart: nextCycleStart.toISOString() };
    }
  }

  const viaRpc = await getLeaderboardSnapshotViaRpc({
    challengeId: params.campaign.id,
    venueId: params.venueId,
    viewerUserId: params.viewerUserId,
    displayLimit: params.campaign.leaderboardDisplayLimit,
    tiebreaker: params.campaign.leaderboardTiebreaker,
    cycleStart,
  });
  if (viaRpc) return viaRpc;

  const rows = await listLeaderboardProgressRows({
    challengeId: params.campaign.id,
    venueId: params.venueId,
    cycleStart,
  });

  const snapshot = buildChallengeLeaderboardSnapshot(rows, {
    displayLimit: params.campaign.leaderboardDisplayLimit,
    viewerUserId: params.viewerUserId,
    tiebreaker: params.campaign.leaderboardTiebreaker,
  });
  return { topEntries: snapshot.topEntries, viewer: snapshot.viewer };
}

async function finalizeClosedLeaderboardCampaigns(
  campaigns: ChallengeCampaign[],
  now: Date
): Promise<Map<string, string>> {
  assertConfigured();
  const finalizedWinnerByCampaignId = new Map<string, string>();
  const candidates = campaigns.filter((campaign) => isLeaderboardCampaignClosed(campaign, now));
  for (const campaign of candidates) {
    const winner = await getLeaderboardWinnerUserId({
      campaignId: campaign.id,
      tiebreaker: campaign.leaderboardTiebreaker,
    });
    if (!winner) continue;

    const { data: updatedRow } = await supabaseAdmin!
      .from("challenge_campaigns")
      .update({ winner_user_id: winner.userId, is_active: false })
      .eq("id", campaign.id)
      .is("winner_user_id", null)
      .select("id, winner_user_id")
      .maybeSingle<{ id: string; winner_user_id: string | null }>();
    if (updatedRow?.id && updatedRow.winner_user_id) {
      finalizedWinnerByCampaignId.set(updatedRow.id, updatedRow.winner_user_id);
      if (campaignHasPrize(campaign)) {
        const prizeExpiresAt = new Date(now.getTime() + PRIZE_EXPIRY_MS).toISOString();
        await supabaseAdmin!
          .from("challenge_campaign_redemptions")
          .upsert(
            { challenge_id: campaign.id, winner_user_id: winner.userId, venue_id: winner.venueId, cycle_start: new Date(0).toISOString(), prize_expires_at: prizeExpiresAt },
            { onConflict: "challenge_id,winner_user_id,cycle_start", ignoreDuplicates: true }
          );
        await createNotification({
          userId: winner.userId,
          message: `You won a prize in "${campaign.name}"! Tap here to view your coupon before it expires.`,
          type: "success",
          linkUrl: "/redeem-prizes",
        });
      }
    }
  }
  return finalizedWinnerByCampaignId;
}

// For each closed cycle of recurring leaderboard campaigns, record the winner in
// challenge_cycle_winners and create a redemption row — but leave the campaign
// active so it recurs next week.
async function finalizeClosedRecurringCycles(campaigns: ChallengeCampaign[], now: Date): Promise<void> {
  assertConfigured();
  const candidates = campaigns.filter(
    (c) =>
      c.challengeMode === "leaderboard" &&
      c.recurringType &&
      c.recurringType !== "none" &&
      c.isActive &&
      !c.winnerUserId
  );
  if (candidates.length === 0) return;

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  for (const campaign of candidates) {
    const venueIds = campaign.venueIds ?? [];
    if (venueIds.length === 0) continue;
    const venueId = venueIds[0];

    const timezone = await getVenueTimezone(venueId);
    const currentCycleStart = computeCycleStart(campaign, now, timezone);
    const createdAt = new Date(campaign.createdAt ?? 0);

    let probe = currentCycleStart;
    for (let i = 0; i < 8; i++) {
      if (probe.getTime() < createdAt.getTime()) break;
      const cycleEnd = computeCycleEnd(campaign, probe, timezone);

      if (now.getTime() <= cycleEnd.getTime()) {
        // Cycle still open — step back one week
        probe = new Date(probe.getTime() - ONE_WEEK_MS);
        continue;
      }

      const cycleStartIso = probe.toISOString();

      const { data: existingWinner } = await supabaseAdmin!
        .from("challenge_cycle_winners")
        .select("id")
        .eq("challenge_id", campaign.id)
        .eq("cycle_start", cycleStartIso)
        .maybeSingle<{ id: string }>();

      if (existingWinner) break; // All earlier cycles already handled

      const winner = await getCycleWinnerForCampaign({
        campaignId: campaign.id,
        cycleStart: probe,
        tiebreaker: campaign.leaderboardTiebreaker,
      });

      if (winner) {
        await supabaseAdmin!
          .from("challenge_cycle_winners")
          .insert({
            challenge_id: campaign.id,
            cycle_start: cycleStartIso,
            winner_user_id: winner.userId,
            venue_id: winner.venueId,
            points_earned: winner.pointsEarned,
            prize_type: campaign.prizeType ?? null,
            prize_gift_certificate_amount: campaign.prizeGiftCertificateAmount ?? null,
          })
          .select()
          .maybeSingle();

        if (campaignHasPrize(campaign)) {
          const prizeExpiresAt = new Date(now.getTime() + PRIZE_EXPIRY_MS).toISOString();
          await supabaseAdmin!
            .from("challenge_campaign_redemptions")
            .upsert(
              {
                challenge_id: campaign.id,
                winner_user_id: winner.userId,
                venue_id: winner.venueId,
                cycle_start: cycleStartIso,
                prize_expires_at: prizeExpiresAt,
              },
              { onConflict: "challenge_id,winner_user_id,cycle_start", ignoreDuplicates: true }
            );
          await createNotification({
            userId: winner.userId,
            message: `You won a prize in "${campaign.name}"! Tap here to view your coupon before it expires.`,
            type: "success",
            linkUrl: "/redeem-prizes",
          });
        }
      }

      probe = new Date(probe.getTime() - ONE_WEEK_MS);
    }
  }
}

function assertConfigured() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

export async function listChallengeCampaigns(params: {
  venueId?: string;
  includeInactive?: boolean;
  includeResolved?: boolean;
  /** Phase 9a: scope to campaigns created by this owner (null/absent = all). */
  createdByOwnerId?: string | null;
} = {}): Promise<ChallengeCampaign[]> {
  assertConfigured();
  const includeInactive = Boolean(params.includeInactive);
  const includeResolved = Boolean(params.includeResolved);

  let query = supabaseAdmin!
    .from("challenge_campaigns")
    .select(CAMPAIGN_SELECT_COLUMNS)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }
  if (!includeResolved) {
    query = query.is("winner_user_id", null);
  }
  // Phase 9a: owner-scoped listing filters to a single owner's campaigns.
  if (params.createdByOwnerId) {
    query = query.eq("created_by_owner_id", params.createdByOwnerId);
  }
  // Push the venue scope into the WHERE clause (not just the in-memory filter
  // below) so the 200-row cap applies PER VENUE instead of globally — without
  // this, a venue's campaign can be truncated by unrelated campaigns at other
  // venues filling the cap first. venue_ids = '{}' means "global" (matches
  // every venue), so it's kept alongside the overlap check.
  if (params.venueId) {
    query = query.or(`venue_ids.ov.{${params.venueId}},venue_ids.eq.{}`);
  }

  const { data, error } = await query.returns<ChallengeCampaignRow[]>();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load challenge campaigns.");
  }

  const now = new Date();
  const parsedCampaigns = data.map((row) => mapCampaignRow(row));
  const [finalizedWinnerByCampaignId] = await Promise.all([
    finalizeClosedLeaderboardCampaigns(parsedCampaigns, now),
    finalizeClosedRecurringCycles(parsedCampaigns, now),
  ]);
  if (finalizedWinnerByCampaignId.size > 0) {
    for (const row of data) {
      const winnerUserId = finalizedWinnerByCampaignId.get(row.id);
      if (winnerUserId) {
        row.winner_user_id = winnerUserId;
        row.is_active = false;
      }
    }
  }

  const winnerIds = Array.from(new Set(data.map((row) => row.winner_user_id).filter(Boolean))) as string[];
  const winnerNameById = new Map<string, string>();
  if (winnerIds.length > 0) {
    const { data: winners } = await supabaseAdmin!
      .from("users")
      .select("id, username")
      .in("id", winnerIds)
      .returns<Array<{ id: string; username: string }>>();
    for (const winner of winners ?? []) {
      winnerNameById.set(winner.id, winner.username);
    }
  }

  let mapped = data.map((row) => mapCampaignRow(row, row.winner_user_id ? winnerNameById.get(row.winner_user_id) ?? null : null));
  if (!includeInactive) {
    mapped = mapped.filter((campaign) => campaign.isActive);
  }
  if (!includeResolved) {
    mapped = mapped.filter((campaign) => !campaign.winnerUserId);
  }
  if (!params.venueId) {
    return mapped;
  }
  return mapped.filter((campaign) => campaignMatchesVenue(campaign, params.venueId ?? ""));
}

export async function listChallengeCampaignProgress(params: {
  challengeId?: string;
  venueId?: string;
  userId?: string;
} = {}): Promise<ChallengeCampaignProgress[]> {
  assertConfigured();
  let query = supabaseAdmin!
    .from("challenge_campaign_progress")
    .select("id, challenge_id, user_id, venue_id, points_earned, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (params.challengeId) query = query.eq("challenge_id", params.challengeId);
  if (params.venueId) query = query.eq("venue_id", params.venueId);
  if (params.userId) query = query.eq("user_id", params.userId);
  const { data, error } = await query.returns<ChallengeCampaignProgressRow[]>();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load challenge progress.");
  }
  return data.map((row) => mapProgressRow(row));
}

export async function createChallengeCampaign(input: {
  name: string;
  imageUrl?: string;
  imageScale?: number;
  imageFocusX?: number;
  imageFocusY?: number;
  imageFit?: ChallengeImageFitMode;
  rules: string;
  venueIds?: string[];
  scheduleType?: ChallengeScheduleType;
  activeDays?: string[];
  startDate?: string;
  startTime?: string;
  endDay?: string;
  endTime?: string;
  endDate?: string;
  gameTypes?: string[];
  challengeMode?: ChallengeMode;
  leaderboardDisplayLimit?: number;
  leaderboardTiebreaker?: ChallengeLeaderboardTiebreaker;
  pointMultiplier?: number;
  pointsRequiredToWin?: number;
  recurringType?: CampaignRecurringType;
  displayOrder?: number | null;
  prizeType?: PrizeType | null;
  prizeGiftCertificateAmount?: number | null;
  // ── Rewards (Phase 2) ──
  winnerQuota?: number;
  rewardDefinitionId?: string | null;
  prizeKind?: RewardPrizeKind | null;
  prizeMenuItem?: RewardMenuItem | null;
  prizeMenuItemName?: string | null;
  prizeDiscountKind?: RewardDiscountKind | null;
  prizeDiscountValue?: number | null;
  isActive?: boolean;
  /** Phase 9a: stamp the creating owner (null/absent = admin-created). */
  createdByOwnerId?: string | null;
  /** Rewards: "game_winner" resolves via the resolver cron, not points accrual. */
  winCondition?: ChallengeWinCondition;
}): Promise<ChallengeCampaign> {
  assertConfigured();
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Challenge name is required.");
  const rules = String(input.rules ?? "").trim();
  if (!rules) throw new Error("Challenge rules are required.");
  const challengeMode = normalizeChallengeMode(input.challengeMode);
  const prizeKind = normalizePrizeKind(input.prizeKind);
  // Gift-card amount lives in prize_gift_certificate_amount (reused). It's set by
  // either a legacy gift_certificate prizeType or a new gift_card prizeKind.
  const giftCardAmount =
    (input.prizeType === "gift_certificate" || prizeKind === "gift_card") && Number.isFinite(input.prizeGiftCertificateAmount)
      ? Math.max(0.01, Number(input.prizeGiftCertificateAmount))
      : null;

  const row = {
    name,
    image_url: String(input.imageUrl ?? "").trim() || null,
    image_scale: Number.isFinite(input.imageScale) ? clamp(Number(input.imageScale), 0.6, 2.5) : 1,
    image_focus_x: Number.isFinite(input.imageFocusX) ? clamp(Number(input.imageFocusX), 0, 100) : 50,
    image_focus_y: Number.isFinite(input.imageFocusY) ? clamp(Number(input.imageFocusY), 0, 100) : 50,
    image_fit: VALID_IMAGE_FITS.includes((input.imageFit ?? "cover") as ChallengeImageFitMode) ? (input.imageFit ?? "cover") : "cover",
    rules,
    venue_ids: Array.from(new Set((input.venueIds ?? []).map((value) => String(value).trim()).filter(Boolean))),
    schedule_type: (() => {
      const isMulti = input.scheduleType === "multi_day" || input.scheduleType === "one_time";
      if (!isMulti) return "recurring";
      return (input.recurringType && input.recurringType !== "none") ? "multi_day" : "one_time";
    })() as ChallengeScheduleType,
    active_days: normalizeDays(input.activeDays),
    start_date: String(input.startDate ?? "").trim() || null,
    start_time: String(input.startTime ?? "").trim() || null,
    end_day: String(input.endDay ?? "").trim() || null,
    end_time: String(input.endTime ?? "").trim() || null,
    end_date: String(input.endDate ?? "").trim() || null,
    game_types: normalizeGameTypes(input.gameTypes),
    challenge_mode: challengeMode,
    leaderboard_display_limit: normalizeLeaderboardDisplayLimit(input.leaderboardDisplayLimit),
    leaderboard_tiebreaker: normalizeLeaderboardTiebreaker(input.leaderboardTiebreaker),
    point_multiplier: Number.isFinite(input.pointMultiplier) ? Math.max(0.001, Number(input.pointMultiplier)) : 1,
    points_required_to_win: Number.isFinite(input.pointsRequiredToWin)
      ? Math.max(1, Math.round(Number(input.pointsRequiredToWin)))
      : 100,
    recurring_type: (input.recurringType ?? "none") as CampaignRecurringType,
    display_order: input.displayOrder ?? null,
    prize_type: VALID_PRIZE_TYPES.includes(input.prizeType as PrizeType) ? input.prizeType : null,
    prize_gift_certificate_amount: giftCardAmount,
    win_condition: normalizeWinCondition(input.winCondition),
    winner_quota: normalizeWinnerQuota(input.winnerQuota),
    reward_definition_id: String(input.rewardDefinitionId ?? "").trim() || null,
    prize_kind: prizeKind,
    prize_menu_item: prizeKind === "menu_item" ? normalizeMenuItem(input.prizeMenuItem) : null,
    prize_menu_item_name:
      prizeKind === "menu_item" && normalizeMenuItem(input.prizeMenuItem) === "other"
        ? String(input.prizeMenuItemName ?? "").trim() || null
        : null,
    prize_discount_kind: prizeKind === "menu_item" ? normalizeDiscountKind(input.prizeDiscountKind) : null,
    prize_discount_value:
      prizeKind === "menu_item" && Number.isFinite(input.prizeDiscountValue)
        ? Math.max(0, Number(input.prizeDiscountValue))
        : null,
    is_active: input.isActive ?? true,
    created_by_owner_id: input.createdByOwnerId ?? null,
  };

  const { data, error } = await supabaseAdmin!
    .from("challenge_campaigns")
    .insert(row)
    .select(CAMPAIGN_SELECT_COLUMNS)
    .single<ChallengeCampaignRow>();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create challenge campaign.");
  }
  return mapCampaignRow(data);
}

export async function updateChallengeCampaign(input: {
  id: string;
  name?: string;
  imageUrl?: string;
  imageScale?: number;
  imageFocusX?: number;
  imageFocusY?: number;
  imageFit?: ChallengeImageFitMode;
  rules?: string;
  venueIds?: string[];
  scheduleType?: ChallengeScheduleType;
  activeDays?: string[];
  startDate?: string;
  startTime?: string;
  endDay?: string;
  endTime?: string;
  endDate?: string;
  gameTypes?: string[];
  challengeMode?: ChallengeMode;
  leaderboardDisplayLimit?: number;
  leaderboardTiebreaker?: ChallengeLeaderboardTiebreaker;
  pointMultiplier?: number;
  pointsRequiredToWin?: number;
  recurringType?: CampaignRecurringType;
  displayOrder?: number | null;
  winnerUserId?: string | null;
  prizeType?: PrizeType | null;
  prizeGiftCertificateAmount?: number | null;
  // ── Rewards (Phase 2) ──
  winnerQuota?: number;
  rewardDefinitionId?: string | null;
  prizeKind?: RewardPrizeKind | null;
  prizeMenuItem?: RewardMenuItem | null;
  prizeMenuItemName?: string | null;
  prizeDiscountKind?: RewardDiscountKind | null;
  prizeDiscountValue?: number | null;
  isActive?: boolean;
}): Promise<ChallengeCampaign> {
  assertConfigured();
  const id = String(input.id ?? "").trim();
  if (!id) throw new Error("Challenge id is required.");

  const update: Record<string, unknown> = {};
  if (typeof input.name === "string") update.name = input.name.trim();
  if (typeof input.imageUrl === "string") update.image_url = input.imageUrl.trim() || null;
  if (Number.isFinite(input.imageScale)) update.image_scale = clamp(Number(input.imageScale), 0.6, 2.5);
  if (Number.isFinite(input.imageFocusX)) update.image_focus_x = clamp(Number(input.imageFocusX), 0, 100);
  if (Number.isFinite(input.imageFocusY)) update.image_focus_y = clamp(Number(input.imageFocusY), 0, 100);
  if (typeof input.imageFit === "string" && VALID_IMAGE_FITS.includes(input.imageFit)) update.image_fit = input.imageFit;
  if (typeof input.rules === "string") update.rules = input.rules.trim();
  if (Array.isArray(input.venueIds)) update.venue_ids = Array.from(new Set(input.venueIds.map((v) => String(v).trim()).filter(Boolean)));
  if (typeof input.scheduleType === "string") {
    const isMulti = input.scheduleType === "multi_day" || input.scheduleType === "one_time";
    if (!isMulti) {
      update.schedule_type = "recurring";
    } else {
      const isRecurring = typeof input.recurringType === "string" && input.recurringType !== "none";
      update.schedule_type = isRecurring ? "multi_day" : "one_time";
    }
  }
  if (Array.isArray(input.activeDays)) update.active_days = normalizeDays(input.activeDays);
  if (typeof input.startDate === "string") update.start_date = input.startDate.trim() || null;
  if (typeof input.startTime === "string") update.start_time = input.startTime.trim() || null;
  if (typeof input.endDay === "string") update.end_day = input.endDay.trim() || null;
  if (typeof input.endTime === "string") update.end_time = input.endTime.trim() || null;
  if (typeof input.endDate === "string") update.end_date = input.endDate.trim() || null;
  if (Array.isArray(input.gameTypes)) update.game_types = normalizeGameTypes(input.gameTypes);
  if (typeof input.challengeMode === "string") update.challenge_mode = normalizeChallengeMode(input.challengeMode);
  if (Number.isFinite(input.leaderboardDisplayLimit)) {
    update.leaderboard_display_limit = normalizeLeaderboardDisplayLimit(input.leaderboardDisplayLimit);
  }
  if (typeof input.leaderboardTiebreaker === "string") {
    update.leaderboard_tiebreaker = normalizeLeaderboardTiebreaker(input.leaderboardTiebreaker);
  }
  if (Number.isFinite(input.pointMultiplier)) update.point_multiplier = Math.max(0.001, Number(input.pointMultiplier));
  if (Number.isFinite(input.pointsRequiredToWin)) update.points_required_to_win = Math.max(1, Math.round(Number(input.pointsRequiredToWin)));
  if (typeof input.recurringType === "string") update.recurring_type = input.recurringType;
  if (input.displayOrder !== undefined) update.display_order = input.displayOrder;
  if (input.winnerUserId !== undefined) update.winner_user_id = input.winnerUserId;
  if (input.prizeType !== undefined) {
    update.prize_type = VALID_PRIZE_TYPES.includes(input.prizeType as PrizeType) ? input.prizeType : null;
    update.prize_gift_certificate_amount =
      input.prizeType === "gift_certificate" && Number.isFinite(input.prizeGiftCertificateAmount)
        ? Math.max(0.01, Number(input.prizeGiftCertificateAmount))
        : null;
  }
  // ── Rewards (Phase 2) ── new prize model + quota. When prizeKind is provided it
  // takes precedence for the gift-card amount over the legacy prizeType block above.
  if (input.winnerQuota !== undefined && Number.isFinite(input.winnerQuota)) {
    update.winner_quota = normalizeWinnerQuota(input.winnerQuota);
  }
  if (input.rewardDefinitionId !== undefined) {
    update.reward_definition_id = String(input.rewardDefinitionId ?? "").trim() || null;
  }
  if (input.prizeKind !== undefined) {
    const kind = normalizePrizeKind(input.prizeKind);
    const menuItem = kind === "menu_item" ? normalizeMenuItem(input.prizeMenuItem) : null;
    update.prize_kind = kind;
    update.prize_menu_item = menuItem;
    update.prize_menu_item_name =
      menuItem === "other" ? String(input.prizeMenuItemName ?? "").trim() || null : null;
    update.prize_discount_kind = kind === "menu_item" ? normalizeDiscountKind(input.prizeDiscountKind) : null;
    update.prize_discount_value =
      kind === "menu_item" && Number.isFinite(input.prizeDiscountValue)
        ? Math.max(0, Number(input.prizeDiscountValue))
        : null;
    update.prize_gift_certificate_amount =
      kind === "gift_card" && Number.isFinite(input.prizeGiftCertificateAmount)
        ? Math.max(0.01, Number(input.prizeGiftCertificateAmount))
        : null;
  }
  if (typeof input.isActive === "boolean") update.is_active = input.isActive;

  const { data, error } = await supabaseAdmin!
    .from("challenge_campaigns")
    .update(update)
    .eq("id", id)
    .select(CAMPAIGN_SELECT_COLUMNS)
    .single<ChallengeCampaignRow>();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update challenge campaign.");
  }

  let winnerUsername: string | null = null;
  if (data.winner_user_id) {
    const { data: winner } = await supabaseAdmin!
      .from("users")
      .select("username")
      .eq("id", data.winner_user_id)
      .maybeSingle<{ username: string }>();
    winnerUsername = winner?.username ?? null;
  }
  return mapCampaignRow(data, winnerUsername);
}

export async function deleteChallengeCampaign(id: string): Promise<void> {
  assertConfigured();
  const challengeId = String(id ?? "").trim();
  if (!challengeId) throw new Error("Challenge id is required.");
  const { error } = await supabaseAdmin!.from("challenge_campaigns").delete().eq("id", challengeId);
  if (error) throw new Error(error.message ?? "Failed to delete challenge campaign.");
}

/**
 * Minimal ownership lookup for the owner-scoped competitions surface (Phase 9a):
 * just the fields needed to enforce "is this the creator, and does the owner
 * control the venue" before a delete. Returns null when the id doesn't exist.
 */
export async function getChallengeCampaignOwnership(
  id: string,
): Promise<{ id: string; createdByOwnerId: string | null; venueIds: string[] } | null> {
  assertConfigured();
  const challengeId = String(id ?? "").trim();
  if (!challengeId) return null;
  const { data, error } = await supabaseAdmin!
    .from("challenge_campaigns")
    .select("id, created_by_owner_id, venue_ids")
    .eq("id", challengeId)
    .maybeSingle<{ id: string; created_by_owner_id: string | null; venue_ids: string[] | null }>();
  if (error) throw new Error(error.message ?? "Failed to load campaign.");
  if (!data) return null;
  return {
    id: data.id,
    createdByOwnerId: data.created_by_owner_id ?? null,
    venueIds: Array.isArray(data.venue_ids) ? data.venue_ids : [],
  };
}

export type ChallengeCycleWinnerRecord = {
  id: string;
  challengeId: string;
  cycleStart: string;
  winnerUserId: string;
  winnerUsername: string | null;
  venueId: string;
  pointsEarned: number;
  finalizedAt: string;
  prizeType: string | null;
  prizeRedeemedAt: string | null;
};

export async function listChallengeCycleWinners(challengeId: string): Promise<ChallengeCycleWinnerRecord[]> {
  assertConfigured();
  const cid = String(challengeId ?? "").trim();
  if (!cid) throw new Error("challengeId is required.");

  const { data, error } = await supabaseAdmin!
    .from("challenge_cycle_winners")
    .select("id, challenge_id, cycle_start, winner_user_id, venue_id, points_earned, finalized_at, prize_type")
    .eq("challenge_id", cid)
    .order("cycle_start", { ascending: false })
    .returns<Array<{
      id: string; challenge_id: string; cycle_start: string; winner_user_id: string;
      venue_id: string; points_earned: number; finalized_at: string; prize_type: string | null;
    }>>();
  if (error) throw new Error(error.message ?? "Failed to load cycle winners.");
  if (!data || data.length === 0) return [];

  const userIds = [...new Set(data.map((r) => r.winner_user_id))];
  const { data: users } = await supabaseAdmin!
    .from("users")
    .select("id, username")
    .in("id", userIds)
    .returns<Array<{ id: string; username: string }>>();
  const usernameById = new Map((users ?? []).map((u) => [u.id, u.username]));

  const { data: redemptions } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("winner_user_id, cycle_start, prize_redeemed_at")
    .eq("challenge_id", cid)
    .returns<Array<{ winner_user_id: string; cycle_start: string; prize_redeemed_at: string | null }>>();
  const redemptionMap = new Map(
    (redemptions ?? []).map((r) => [`${r.winner_user_id}:${r.cycle_start}`, r.prize_redeemed_at])
  );

  return data.map((r) => ({
    id: r.id,
    challengeId: r.challenge_id,
    cycleStart: r.cycle_start,
    winnerUserId: r.winner_user_id,
    winnerUsername: usernameById.get(r.winner_user_id) ?? null,
    venueId: r.venue_id,
    pointsEarned: r.points_earned,
    finalizedAt: r.finalized_at,
    prizeType: r.prize_type,
    prizeRedeemedAt: redemptionMap.get(`${r.winner_user_id}:${r.cycle_start}`) ?? null,
  }));
}

export type ChallengeFinalizedPrize = {
  winnerUserId: string;
  winnerUsername: string | null;
  prizeType: string | null;
  prizeGiftCertificateAmount: number | null;
  prizeExpiresAt: string | null;
  prizeRedeemedAt: string | null;
  claimedAt: string | null;
};

export async function getChallengeFinalizedPrize(challengeId: string): Promise<ChallengeFinalizedPrize | null> {
  assertConfigured();
  const cid = String(challengeId ?? "").trim();
  if (!cid) throw new Error("challengeId is required.");

  const epochIso = new Date(0).toISOString();
  const { data, error } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("winner_user_id, prize_type, prize_gift_certificate_amount, prize_expires_at, prize_redeemed_at, claimed_at, cycle_start")
    .eq("challenge_id", cid)
    .eq("cycle_start", epochIso)
    .order("claimed_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      winner_user_id: string; prize_type: string | null; prize_gift_certificate_amount: number | null;
      prize_expires_at: string | null; prize_redeemed_at: string | null; claimed_at: string | null; cycle_start: string;
    }>();
  if (error) throw new Error(error.message ?? "Failed to load prize status.");
  if (!data) return null;

  const { data: user } = await supabaseAdmin!
    .from("users")
    .select("username")
    .eq("id", data.winner_user_id)
    .maybeSingle<{ username: string }>();

  return {
    winnerUserId: data.winner_user_id,
    winnerUsername: user?.username ?? null,
    prizeType: data.prize_type,
    prizeGiftCertificateAmount: data.prize_gift_certificate_amount,
    prizeExpiresAt: data.prize_expires_at,
    prizeRedeemedAt: data.prize_redeemed_at,
    claimedAt: data.claimed_at,
  };
}

const venueTimezoneCache = new Map<string, string>();

async function getVenueTimezone(venueId: string): Promise<string> {
  const cached = venueTimezoneCache.get(venueId);
  if (cached) return cached;
  const { data } = await supabaseAdmin!
    .from("venues")
    .select("timezone")
    .eq("id", venueId)
    .maybeSingle<{ timezone: string }>();
  const tz = data?.timezone ?? "America/New_York";
  venueTimezoneCache.set(venueId, tz);
  return tz;
}

export async function getActiveChallengeMultiplier(
  venueId: string,
  gameType: ChallengeGameType,
  now?: Date
): Promise<{ multiplier: number; campaign: ChallengeCampaign | null }> {
  const vid = String(venueId ?? "").trim();
  if (!vid || !supabaseAdmin) return { multiplier: 1, campaign: null };

  const effectiveNow = now ?? new Date();
  let campaigns: ChallengeCampaign[];
  let venueTimezone: string;
  try {
    [campaigns, venueTimezone] = await Promise.all([
      listChallengeCampaigns({ venueId: vid, includeInactive: false, includeResolved: false }),
      getVenueTimezone(vid),
    ]);
  } catch {
    return { multiplier: 1, campaign: null };
  }

  const eligible = campaigns.filter((c) => isCampaignEligibleAtTime(c, effectiveNow, gameType, venueTimezone));
  if (eligible.length === 0) return { multiplier: 1, campaign: null };

  const best = eligible.reduce((a, b) => (b.pointMultiplier > a.pointMultiplier ? b : a));
  return { multiplier: best.pointMultiplier, campaign: best };
}

type AwardCycleWinnerRpcRow = { won: boolean; exhausted: boolean };

/**
 * Rewards (Phase 3): atomically record a threshold-crossing winner in the
 * challenge_cycle_winners ledger, capped at `campaign.winnerQuota` by the
 * `award_cycle_winner` RPC (advisory-locked count-then-insert — see
 * supabase/migrations/20260720130000_rewards_multi_winner.sql). On a fresh win
 * for a prize-bearing campaign it mints the redemption coupon + win
 * notification. The canonical ledger for BOTH cadences: recurring passes the
 * real `cycleStart`, one-time passes the epoch sentinel (`new Date(0)`).
 *
 * `winnerQuota` is passed explicitly (not read off the campaign) so the caller
 * can clamp it — with NEXT_PUBLIC_REWARDS_ENABLED off, callers pass 1 to force
 * strictly single-winner behavior even if a quota>1 row somehow exists.
 *
 * Returns `won` (did THIS user just win — false for a repeat crosser already in
 * the ledger, or an already-full cycle) and `exhausted` (the cycle has now
 * reached its winner_quota).
 */
export async function awardCycleWinner(params: {
  campaign: ChallengeCampaign;
  userId: string;
  venueId: string;
  cycleStart: Date;
  pointsEarned: number;
  winnerQuota: number;
  now: Date;
}): Promise<{ won: boolean; exhausted: boolean }> {
  assertConfigured();
  const { campaign, userId, venueId, pointsEarned, now } = params;
  const cycleStartIso = params.cycleStart.toISOString();

  // Compute the coupon expiry up front and hand it to the RPC, which mints the
  // challenge_campaign_redemptions row in the SAME transaction as the winner
  // ledger row (see supabase/migrations/20260720150000_rewards_atomic_redemption.sql).
  // A non-null expiry is how we signal "this reward has a prize" to the RPC; a
  // non-prize reward passes null and no coupon is minted. This closes the old
  // window where a crash between the ledger commit and a separate coupon write
  // left a ledgered winner with no coupon.
  const prizeExpiresAtIso = campaignHasPrize(campaign)
    ? new Date(now.getTime() + PRIZE_EXPIRY_MS).toISOString()
    : null;

  const { data, error } = await supabaseAdmin!.rpc("award_cycle_winner", {
    p_challenge_id: campaign.id,
    p_cycle_start: cycleStartIso,
    p_winner_user_id: userId,
    p_venue_id: venueId,
    p_points_earned: pointsEarned,
    p_winner_quota: Math.max(1, Math.round(params.winnerQuota)),
    p_prize_type: campaign.prizeType ?? null,
    p_prize_gift_certificate_amount: campaign.prizeGiftCertificateAmount ?? null,
    p_prize_expires_at: prizeExpiresAtIso,
  });
  if (error) {
    throw new Error(`award_cycle_winner RPC failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as AwardCycleWinnerRpcRow | null;
  const won = Boolean(row?.won);
  const exhausted = Boolean(row?.exhausted);

  // The durable coupon is already committed atomically above; the win
  // notification is the only remaining external side effect, so it is
  // best-effort — a failure here must never fail the award or lose the coupon
  // (which /redeem-prizes reads directly, not the notification).
  if (won && prizeExpiresAtIso) {
    await notifyPrizeWinBestEffort({ userId, campaignId: campaign.id, campaignName: campaign.name });
  }

  return { won, exhausted };
}

/**
 * Fire the prize-win notification without ever throwing. The redemption coupon
 * is already durably committed by the award_cycle_winner RPC, so a transient
 * notification failure must not bubble up (it would look like the award failed)
 * — we retry a couple of times, then log and move on. The winner still sees
 * their coupon on /redeem-prizes regardless.
 */
async function notifyPrizeWinBestEffort(params: {
  userId: string;
  campaignId: string;
  campaignName: string;
}): Promise<void> {
  const { userId, campaignId, campaignName } = params;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await createNotification({
        userId,
        message: `You won a prize in "${campaignName}"! Tap here to view your coupon before it expires.`,
        type: "success",
        linkUrl: "/redeem-prizes",
      });
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(
          `[rewards] prize-win notification failed after ${maxAttempts} attempts (coupon already minted) for user ${userId} / campaign ${campaignId}`,
          err
        );
      }
    }
  }
}

export async function applyChallengeCampaignPoints(params: {
  userId: string;
  venueId: string;
  gameType: ChallengeGameType;
  basePoints: number;
  occurredAt?: Date;
}): Promise<{ finalPoints: number; multiplierApplied: number; campaignUpdates: Array<{ challengeId: string; progress: number; won: boolean }> }> {
  assertConfigured();
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const gameType = params.gameType;
  const basePoints = Math.max(0, Math.round(Number(params.basePoints ?? 0)));
  if (!userId || !venueId || basePoints <= 0) {
    return { finalPoints: basePoints, multiplierApplied: 1, campaignUpdates: [] };
  }

  const now = params.occurredAt ?? new Date();
  const [campaigns, venueTimezone] = await Promise.all([
    listChallengeCampaigns({ venueId, includeInactive: false, includeResolved: false }),
    getVenueTimezone(venueId),
  ]);

  const eligible = campaigns.filter((campaign) => isCampaignEligibleAtTime(campaign, now, gameType, venueTimezone));
  if (eligible.length === 0) {
    return { finalPoints: basePoints, multiplierApplied: 1, campaignUpdates: [] };
  }

  const maxMultiplier = eligible.reduce((max, campaign) => Math.max(max, campaign.pointMultiplier), 1);
  const finalPoints = Math.max(1, Math.round(basePoints * maxMultiplier));

  const campaignUpdates: Array<{ challengeId: string; progress: number; won: boolean }> = [];

  for (const campaign of eligible) {
    const increment = Math.max(1, Math.round(basePoints * campaign.pointMultiplier));
    const cycleStart = computeCycleStart(campaign, now, venueTimezone);
    const cycleStartIso = cycleStart.toISOString();

    const { data: existing } = await supabaseAdmin!
      .from("challenge_campaign_progress")
      .select("id, points_earned")
      .eq("challenge_id", campaign.id)
      .eq("user_id", userId)
      .eq("venue_id", venueId)
      .eq("cycle_start", cycleStartIso)
      .maybeSingle<{ id: string; points_earned: number }>();

    const nextProgress = Math.max(0, Number(existing?.points_earned ?? 0)) + increment;

    if (existing?.id) {
      await supabaseAdmin!
        .from("challenge_campaign_progress")
        .update({ points_earned: nextProgress })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin!.from("challenge_campaign_progress").insert({
        challenge_id: campaign.id,
        user_id: userId,
        venue_id: venueId,
        cycle_start: cycleStartIso,
        points_earned: nextProgress,
      });
    }

    let won = false;
    // One engine for both cadences (Phase 3): the award_cycle_winner RPC records
    // winners in the challenge_cycle_winners ledger, atomically capped at quota.
    // The Phase-3 migration replaced the old unique(challenge_id, cycle_start)
    // ledger key with unique(challenge_id, cycle_start, winner_user_id), so the
    // pre-Rewards ON CONFLICT single-winner insert no longer caps a cycle — the
    // RPC's count-guard is now the only cap. With NEXT_PUBLIC_REWARDS_ENABLED off
    // we clamp the quota to 1, reproducing exactly today's single-winner behavior;
    // a one-time reward already resolved is inactive and never reaches here.
    const alreadyResolved = !isRewardsEnabled() && Boolean(campaign.winnerUserId);
    // A "game_winner" reward is NOT won by accruing points — it is awarded to the
    // top scorer(s) of a finished Live Trivia occurrence by the
    // resolve-live-trivia-winners cron (lib/liveTriviaWinnerRewards.ts). Its
    // points_required_to_win is a NOT NULL sentinel, so without this guard every
    // such campaign would fire here on the player's very first point.
    const resolvedByCron = campaign.winCondition === "game_winner";
    if (
      campaign.challengeMode === "progress" &&
      !resolvedByCron &&
      nextProgress >= campaign.pointsRequiredToWin &&
      !alreadyResolved
    ) {
      const isRecurring = Boolean(campaign.recurringType && campaign.recurringType !== "none");
      const effectiveQuota = isRewardsEnabled() ? campaign.winnerQuota : 1;
      // One-time rewards use the epoch-sentinel cycle_start; recurring use the
      // real cycle (so the quota resets each cycle and prior winners may win again).
      const awardCycleStart = isRecurring ? cycleStart : new Date(0);
      const { won: didWin, exhausted } = await awardCycleWinner({
        campaign,
        userId,
        venueId,
        cycleStart: awardCycleStart,
        pointsEarned: nextProgress,
        winnerQuota: effectiveQuota,
        now,
      });
      won = didWin;
      // A one-time reward that has filled its quota is permanently resolved:
      // deactivate it so it stops accruing points and leaves the eligible set.
      // winner_user_id is retained only as a non-null "resolved/exhausted" marker
      // for legacy readers (it no longer means "the winner" under multi-winner).
      if (!isRecurring && exhausted) {
        await supabaseAdmin!
          .from("challenge_campaigns")
          .update({ is_active: false, winner_user_id: campaign.winnerUserId ?? userId })
          .eq("id", campaign.id);
      }
    }

    campaignUpdates.push({
      challengeId: campaign.id,
      progress: nextProgress,
      won,
    });
  }

  return {
    finalPoints,
    multiplierApplied: maxMultiplier,
    campaignUpdates,
  };
}

// Current-cycle winners for MANY progress-mode campaigns in a single batched read.
// One-time rewards use the epoch sentinel cycle_start; recurring use the real
// cycle so quota + winner list reset each cycle (mirrors applyChallengeCampaignPoints).
//
// This replaces a per-campaign listChallengeCycleWinners() fan-out that pulled
// each campaign's ENTIRE historical ledger (plus a usernames + redemptions join)
// only to filter to the current cycle in JS — cost that grew unbounded with cycle
// count and multiplied by campaign count on every venue-home load. Here we fetch
// ONLY the ledger rows at each campaign's current cycle_start in one query, plus
// one usernames lookup: two queries total, independent of history depth or
// campaign count. (prizeRedeemedAt is intentionally not resolved — the snapshot
// never reads it; the caller resolves prizeClaimedAt separately from redemptions.)
//
// "game_winner" rewards are the one exception to the batched read — they have no
// computable cycle anchor and cost one small bounded query each. That branch is
// skipped entirely for venues with no such reward, so the two-query shape above
// still describes the common path.
async function resolveCurrentCycleWinnersForSnapshot(params: {
  campaigns: ChallengeCampaign[];
  venueTimezone: string;
  now: Date;
}): Promise<Map<string, { cycleStartIso: string; winners: ChallengeCycleWinnerRecord[] }>> {
  const { campaigns, venueTimezone, now } = params;
  const result = new Map<string, { cycleStartIso: string; winners: ChallengeCycleWinnerRecord[] }>();
  if (campaigns.length === 0) return result;

  // A "game_winner" reward has NO computable cycle anchor. The resolver cron keys
  // each award on the Live Trivia occurrence's own start instant (one game, one
  // cycle — see lib/liveTriviaWinnerRewards.ts), which by design never equals the
  // epoch sentinel or a computeCycleStart result. Resolving those campaigns the
  // normal way therefore matches zero ledger rows and the winner is never shown
  // as having won. They are resolved below from their most recent ledger row
  // instead of from a computed anchor.
  const cycleKeyedCampaigns = campaigns.filter((c) => c.winCondition !== "game_winner");
  const gameWinnerCampaigns = campaigns.filter((c) => c.winCondition === "game_winner");

  // Per-campaign target cycle start (recurring: real cycle; one-time: epoch).
  const targetMsById = new Map<string, number>();
  const targetIsoById = new Map<string, string>();
  for (const campaign of cycleKeyedCampaigns) {
    const isRecurring = Boolean(campaign.recurringType && campaign.recurringType !== "none");
    const cycleStartDate = isRecurring ? computeCycleStart(campaign, now, venueTimezone) : new Date(0);
    const iso = cycleStartDate.toISOString();
    targetMsById.set(campaign.id, cycleStartDate.getTime());
    targetIsoById.set(campaign.id, iso);
    result.set(campaign.id, { cycleStartIso: iso, winners: [] });
  }

  const challengeIds = cycleKeyedCampaigns.map((c) => c.id);
  const targetIsos = [...new Set(targetIsoById.values())];

  type CycleWinnerRow = {
    id: string; challenge_id: string; cycle_start: string; winner_user_id: string;
    venue_id: string; points_earned: number; finalized_at: string; prize_type: string | null;
  };
  const CYCLE_WINNER_COLUMNS =
    "id, challenge_id, cycle_start, winner_user_id, venue_id, points_earned, finalized_at, prize_type";

  // One batched read: only rows at one of the campaigns' current cycle starts.
  // The .in("cycle_start", …) matches by instant at the DB (timestamptz parses
  // each ISO string), so it never pulls prior cycles regardless of how the DB
  // renders the stored value.
  let rows: CycleWinnerRow[] = [];
  if (challengeIds.length > 0) {
    const { data, error } = await supabaseAdmin!
      .from("challenge_cycle_winners")
      .select(CYCLE_WINNER_COLUMNS)
      .in("challenge_id", challengeIds)
      .in("cycle_start", targetIsos)
      .returns<CycleWinnerRow[]>();
    if (error) throw new Error(error.message ?? "Failed to load cycle winners.");
    rows = data ?? [];
  }

  // Game-winner campaigns: one small bounded read each, resolving "current cycle"
  // as the most recent game that produced a winner. This list is venue-scoped and
  // in practice 0–2 entries, and the loop is skipped entirely when a venue has
  // none — so the common path (and the venue-home hot path) is unchanged.
  if (gameWinnerCampaigns.length > 0) {
    const gameWinnerRowSets = await Promise.all(
      gameWinnerCampaigns.map(async (campaign) => {
        const { data, error } = await supabaseAdmin!
          .from("challenge_cycle_winners")
          .select(CYCLE_WINNER_COLUMNS)
          .eq("challenge_id", campaign.id)
          .order("cycle_start", { ascending: false })
          // A single cycle holds at most GAME_WINNER_TIE_QUOTA_CAP winners, so the
          // newest rows always contain the whole latest cycle well inside this cap.
          .limit(50)
          .returns<CycleWinnerRow[]>();
        if (error) throw new Error(error.message ?? "Failed to load game-winner cycle winners.");
        return { campaign, rows: data ?? [] };
      })
    );

    for (const { campaign, rows: campaignRows } of gameWinnerRowSets) {
      if (campaignRows.length === 0) {
        // Never resolved yet — fall back to the epoch sentinel so quotaRemaining
        // reads as "full" and viewerWon as false, exactly like a fresh campaign.
        result.set(campaign.id, { cycleStartIso: new Date(0).toISOString(), winners: [] });
        continue;
      }
      // Compare by instant, not string — same Postgres "+00:00" vs JS "...Z"
      // reason noted throughout this file.
      const latestMs = Math.max(...campaignRows.map((r) => new Date(r.cycle_start).getTime()));
      const latestRows = campaignRows.filter((r) => new Date(r.cycle_start).getTime() === latestMs);
      targetMsById.set(campaign.id, latestMs);
      result.set(campaign.id, {
        cycleStartIso: new Date(latestMs).toISOString(),
        winners: [],
      });
      rows = rows.concat(latestRows);
    }
  }

  const userIds = [...new Set(rows.map((r) => r.winner_user_id))];
  let usernameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabaseAdmin!
      .from("users")
      .select("id, username")
      .in("id", userIds)
      .returns<Array<{ id: string; username: string }>>();
    usernameById = new Map((users ?? []).map((u) => [u.id, u.username]));
  }

  // Bucket each row to its OWN campaign's current cycle. A one-time reward and a
  // recurring reward can share the epoch/other cycle_start value, so match on the
  // row's own challenge_id target — and compare by instant, not string equality,
  // for the same Postgres "+00:00" vs JS "...Z" reason noted throughout this file.
  for (const r of rows) {
    const targetMs = targetMsById.get(r.challenge_id);
    if (targetMs === undefined) continue;
    if (new Date(r.cycle_start).getTime() !== targetMs) continue;
    result.get(r.challenge_id)!.winners.push({
      id: r.id,
      challengeId: r.challenge_id,
      cycleStart: r.cycle_start,
      winnerUserId: r.winner_user_id,
      winnerUsername: usernameById.get(r.winner_user_id) ?? null,
      venueId: r.venue_id,
      pointsEarned: r.points_earned,
      finalizedAt: r.finalized_at,
      prizeType: r.prize_type,
      prizeRedeemedAt: null, // not consumed by the snapshot (see fn header)
    });
  }

  // Oldest-first within each cycle (winner list + quota ordering).
  for (const state of result.values()) {
    state.winners.sort((a, b) => new Date(a.finalizedAt).getTime() - new Date(b.finalizedAt).getTime());
  }
  return result;
}

export async function getChallengeCampaignSnapshotForUser(params: {
  userId: string;
  venueId: string;
}): Promise<Array<ChallengeCampaign & { progressPoints: number }>> {
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  if (!userId || !venueId) return [];

  const campaigns = await listChallengeCampaigns({
    venueId,
    includeInactive: true,
    includeResolved: true,
  });
  if (campaigns.length === 0) return [];

  const progressRows = await listChallengeCampaignProgress({ venueId, userId });
  const progressByChallenge = new Map(progressRows.map((row) => [row.challengeId, row.pointsEarned]));

  // Multi-winner (Phase 6): resolve each progress-mode campaign's CURRENT cycle
  // winners from the challenge_cycle_winners ledger — campaign.winnerUserId no
  // longer identifies "the winner" once winnerQuota > 1 (see plan §7).
  const venueTimezone = await getVenueTimezone(venueId);
  const now = new Date();
  const progressCampaigns = campaigns.filter((campaign) => campaign.challengeMode === "progress");
  const cycleStateById = await resolveCurrentCycleWinnersForSnapshot({
    campaigns: progressCampaigns,
    venueTimezone,
    now,
  });

  const winnerCampaignIds = progressCampaigns
    .filter((campaign) => (cycleStateById.get(campaign.id)?.winners ?? []).some((winner) => winner.winnerUserId === userId))
    .map((campaign) => campaign.id);
  const claimedAtByKey = new Map<string, string>();
  if (winnerCampaignIds.length > 0) {
    const { data: redemptionRows } = await supabaseAdmin!
      .from("challenge_campaign_redemptions")
      .select("challenge_id, winner_user_id, venue_id, claimed_at, cycle_start")
      .eq("winner_user_id", userId)
      .eq("venue_id", venueId)
      .in("challenge_id", winnerCampaignIds)
      .returns<ChallengeCampaignRedemptionRow[]>();
    for (const row of redemptionRows ?? []) {
      if (row.challenge_id) {
        // Same instant-vs-string-format fix as getCurrentCycleWinnerState above.
        claimedAtByKey.set(`${row.challenge_id}:${new Date(row.cycle_start).getTime()}`, row.claimed_at);
      }
    }
  }

  const baseCampaigns = campaigns.map((campaign) => {
    const cycleState = cycleStateById.get(campaign.id);
    const winners = cycleState?.winners ?? [];
    const viewerWon = winners.some((winner) => winner.winnerUserId === userId);
    const prizeClaimedAt = cycleState
      ? claimedAtByKey.get(`${campaign.id}:${new Date(cycleState.cycleStartIso).getTime()}`) ?? null
      : null;
    return {
      ...campaign,
      progressPoints: progressByChallenge.get(campaign.id) ?? 0,
      prizeClaimedAt,
      winnerUsernames: winners.map((winner) => winner.winnerUsername ?? "Champion"),
      quotaRemaining: Math.max(0, campaign.winnerQuota - winners.length),
      viewerWon,
    };
  });

  return attachLeaderboardSnapshotsToCampaigns({
    campaigns: baseCampaigns,
    venueId,
    viewerUserId: userId,
  });
}

export async function attachLeaderboardSnapshotsToCampaigns(params: {
  campaigns: Array<ChallengeCampaign & { progressPoints: number }>;
  venueId: string;
  viewerUserId?: string;
}): Promise<Array<ChallengeCampaign & { progressPoints: number }>> {
  const venueId = String(params.venueId ?? "").trim();
  if (!venueId || params.campaigns.length === 0) return params.campaigns;

  const leaderboardByChallengeId = new Map<string, { topEntries: ChallengeLeaderboardEntry[]; viewer: ChallengeLeaderboardViewer | null }>();
  await Promise.all(
    params.campaigns
      .filter((campaign) => campaign.challengeMode === "leaderboard")
      .map(async (campaign) => {
        const snapshot = await getLeaderboardSnapshotForCampaign({
          campaign,
          venueId,
          viewerUserId: params.viewerUserId,
        });
        leaderboardByChallengeId.set(campaign.id, snapshot);
      })
  );

  return params.campaigns.map((campaign) => ({
    ...campaign,
    leaderboard: leaderboardByChallengeId.get(campaign.id) ?? campaign.leaderboard,
  }));
}

export async function listChallengeCampaignWinsForUser(params: {
  userId: string;
  venueId: string;
}): Promise<ChallengeCampaignWin[]> {
  assertConfigured();
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  if (!userId || !venueId) return [];

  // Read directly from redemptions — covers both one-time and per-cycle recurring prizes.
  const { data: redemptionRows, error: redemptionError } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("challenge_id, winner_user_id, venue_id, claimed_at, prize_expires_at, prize_redeemed_at, cycle_start")
    .eq("winner_user_id", userId)
    .eq("venue_id", venueId)
    .order("cycle_start", { ascending: false })
    .returns<ChallengeCampaignRedemptionRow[]>();

  if (redemptionError) throw new Error(redemptionError.message ?? "Failed to load challenge wins.");
  if (!redemptionRows || redemptionRows.length === 0) return [];

  const challengeIds = Array.from(new Set(redemptionRows.map((r) => r.challenge_id)));
  const { data: campaignRows } = await supabaseAdmin!
    .from("challenge_campaigns")
    .select(
      "id, name, rules, prize_type, prize_gift_certificate_amount, winner_user_id, prize_kind, prize_menu_item, prize_menu_item_name, prize_discount_kind, prize_discount_value"
    )
    .in("id", challengeIds)
    .returns<
      Array<
        RewardPrizeSourceRow & {
          id: string;
          name: string;
          rules: string;
          prize_gift_certificate_amount: number | null;
          winner_user_id: string | null;
        }
      >
    >();

  const campaignById = new Map((campaignRows ?? []).map((c) => [c.id, c]));

  return redemptionRows.map((row) => {
    const campaign = campaignById.get(row.challenge_id);
    // Compare by instant, not string equality: Postgres/PostgREST renders
    // timestamptz as "+00:00"-offset text, which never string-equals a JS
    // Date's toISOString() ("...Z", millisecond-padded) even for the same instant.
    const cycleStart = !row.cycle_start || new Date(row.cycle_start).getTime() === 0 ? null : row.cycle_start;
    const rewardPrize = campaign
      ? resolveRewardPrize(campaign)
      : { prizeKind: null, prizeMenuItem: null, prizeMenuItemName: null, prizeDiscountKind: null, prizeDiscountValue: null };
    return {
      challengeId: row.challenge_id,
      venueId: row.venue_id,
      challengeName: campaign?.name ?? "Challenge",
      challengeRules: campaign?.rules ?? "",
      winnerUserId: userId,
      cycleStart,
      claimedAt: row.claimed_at ?? null,
      prizeType: VALID_PRIZE_TYPES.includes(campaign?.prize_type as PrizeType) ? (campaign?.prize_type as PrizeType) : null,
      prizeGiftCertificateAmount: campaign?.prize_gift_certificate_amount ?? null,
      prizeExpiresAt: row.prize_expires_at ?? null,
      prizeRedeemedAt: row.prize_redeemed_at ?? null,
      ...rewardPrize,
    };
  });
}

export async function redeemChallengePrize(params: {
  userId: string;
  venueId: string;
  challengeId: string;
}): Promise<{ redeemed: boolean; redeemedAt: string }> {
  assertConfigured();
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const challengeId = String(params.challengeId ?? "").trim();
  if (!userId || !venueId || !challengeId) {
    throw new Error("userId, venueId, and challengeId are required.");
  }

  const { data: campaign } = await supabaseAdmin!
    .from("challenge_campaigns")
    .select("id, winner_user_id, prize_type")
    .eq("id", challengeId)
    .maybeSingle<{ id: string; winner_user_id: string | null; prize_type: string | null }>();

  if (!campaign?.id) throw new Error("Challenge not found.");
  if (!campaign.prize_type) throw new Error("This challenge does not have a prize coupon.");

  // Find the oldest unredeemed prize row for this user/challenge (or the most recent if all redeemed).
  const { data: rows } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("cycle_start, prize_expires_at, prize_redeemed_at")
    .eq("challenge_id", challengeId)
    .eq("winner_user_id", userId)
    .is("prize_redeemed_at", null)
    .order("cycle_start", { ascending: true })
    .limit(1)
    .returns<Array<{ cycle_start: string; prize_expires_at: string | null; prize_redeemed_at: string | null }>>();

  const row = rows?.[0] ?? null;
  if (!row) throw new Error("No redemption record found for this prize.");
  if (row.prize_expires_at && new Date(row.prize_expires_at) < new Date()) {
    throw new Error("This prize has expired.");
  }
  if (row.prize_redeemed_at) {
    return { redeemed: false, redeemedAt: row.prize_redeemed_at };
  }

  const nowIso = new Date().toISOString();
  await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .update({ prize_redeemed_at: nowIso })
    .eq("challenge_id", challengeId)
    .eq("winner_user_id", userId)
    .eq("cycle_start", row.cycle_start);

  return { redeemed: true, redeemedAt: nowIso };
}

export async function claimChallengeCampaignPrize(params: {
  userId: string;
  venueId: string;
  challengeId: string;
  cycleStart?: string;
}): Promise<{ claimed: boolean; claimedAt?: string | null; challengeName: string }> {
  assertConfigured();
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  const challengeId = String(params.challengeId ?? "").trim();
  if (!userId || !venueId || !challengeId) {
    throw new Error("userId, venueId, and challengeId are required.");
  }

  const { data: campaign, error: campaignError } = await supabaseAdmin!
    .from("challenge_campaigns")
    .select("id, name")
    .eq("id", challengeId)
    .maybeSingle<{ id: string; name: string }>();
  if (campaignError) throw new Error(campaignError.message ?? "Failed to verify challenge.");
  if (!campaign?.id) throw new Error("Challenge not found.");

  // Authorization: a redemption row pre-created at win time is the proof of winning.
  const epochIso = new Date(0).toISOString();
  const effectiveCycleStart = params.cycleStart && params.cycleStart !== epochIso ? params.cycleStart : null;

  let lookupQuery = supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("claimed_at, cycle_start")
    .eq("challenge_id", challengeId)
    .eq("winner_user_id", userId)
    .eq("venue_id", venueId);

  if (effectiveCycleStart) {
    lookupQuery = lookupQuery.eq("cycle_start", effectiveCycleStart);
  } else {
    // Claim the oldest unclaimed row — handles both epoch (one-time) and legacy rows.
    lookupQuery = lookupQuery.order("cycle_start", { ascending: true }).limit(1);
  }

  const { data: existingClaim, error: existingClaimError } = await lookupQuery
    .maybeSingle<{ claimed_at: string | null; cycle_start: string }>();
  if (existingClaimError) throw new Error(existingClaimError.message ?? "Failed to verify challenge claim status.");
  if (!existingClaim) throw new Error("Only the winner can claim this challenge prize.");
  if (existingClaim.claimed_at) {
    return { claimed: false, claimedAt: existingClaim.claimed_at, challengeName: campaign.name };
  }

  const nowIso = new Date().toISOString();
  const { data: updatedRow, error: updateError } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .update({ claimed_at: nowIso })
    .eq("challenge_id", challengeId)
    .eq("winner_user_id", userId)
    .eq("venue_id", venueId)
    .eq("cycle_start", existingClaim.cycle_start)
    .select("claimed_at")
    .maybeSingle<{ claimed_at: string }>();
  if (updateError) throw new Error(updateError.message ?? "Failed to claim challenge prize.");

  return { claimed: true, claimedAt: updatedRow?.claimed_at ?? nowIso, challengeName: campaign.name };
}
