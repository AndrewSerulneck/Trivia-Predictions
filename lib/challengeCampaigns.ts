import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  ChallengeCampaign,
  ChallengeCampaignProgress,
  ChallengeCampaignWin,
  ChallengeGameType,
  CampaignRecurringType,
  ChallengeImageFitMode,
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
  active_days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  end_date: string | null;
  game_types: string[] | null;
  point_multiplier: number | string;
  points_required_to_win: number;
  recurring_type: CampaignRecurringType;
  winner_user_id: string | null;
  is_active: boolean;
};

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
};

const VALID_GAME_TYPES: ChallengeGameType[] = ["pickem", "fantasy", "trivia", "bingo"];
const VALID_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const VALID_IMAGE_FITS: ChallengeImageFitMode[] = ["cover", "contain"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapCampaignRow(
  row: ChallengeCampaignRow,
  winnerUsername?: string | null,
  prizeClaimedAt?: string | null
): ChallengeCampaign {
  const gameTypes = (row.game_types ?? [])
    .map((value) => String(value).trim().toLowerCase())
    .filter((value): value is ChallengeGameType => VALID_GAME_TYPES.includes(value as ChallengeGameType));

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
    activeDays: Array.isArray(row.active_days) ? row.active_days : [],
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    endDate: row.end_date ?? undefined,
    gameTypes: gameTypes.length > 0 ? gameTypes : [...VALID_GAME_TYPES],
    pointMultiplier: Math.max(0.001, Number(row.point_multiplier ?? 1)),
    pointsRequiredToWin: Math.max(1, Number(row.points_required_to_win ?? 100)),
    recurringType: row.recurring_type,
    winnerUserId: row.winner_user_id,
    winnerUsername: winnerUsername ?? null,
    prizeClaimedAt: prizeClaimedAt ?? null,
    isActive: Boolean(row.is_active),
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

function normalizeGameTypes(input: string[] | undefined): ChallengeGameType[] {
  const normalized = new Set<ChallengeGameType>();
  for (const value of input ?? []) {
    const key = String(value ?? "").trim().toLowerCase() as ChallengeGameType;
    if (VALID_GAME_TYPES.includes(key)) {
      normalized.add(key);
    }
  }
  return normalized.size > 0 ? [...normalized] : [...VALID_GAME_TYPES];
}

function getWeekdayKey(date: Date): string {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()] ?? "sun";
}

function isTimeInWindow(now: Date, startTime?: string, endTime?: string): boolean {
  if (!startTime || !endTime) {
    return true;
  }
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
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

function isCampaignEligibleAtTime(campaign: ChallengeCampaign, now: Date, gameType: ChallengeGameType): boolean {
  if (!campaign.isActive || campaign.winnerUserId) return false;
  if (!campaign.gameTypes.includes(gameType)) return false;
  if (campaign.endDate) {
    const endDate = new Date(`${campaign.endDate}T23:59:59.999Z`);
    if (Number.isFinite(endDate.getTime()) && now.getTime() > endDate.getTime()) {
      return false;
    }
  }
  if (campaign.activeDays.length > 0 && !campaign.activeDays.includes(getWeekdayKey(now))) {
    return false;
  }
  if (!isTimeInWindow(now, campaign.startTime, campaign.endTime)) {
    return false;
  }
  return true;
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
} = {}): Promise<ChallengeCampaign[]> {
  assertConfigured();
  const includeInactive = Boolean(params.includeInactive);
  const includeResolved = Boolean(params.includeResolved);

  let query = supabaseAdmin!
    .from("challenge_campaigns")
    .select(
      "id, created_at, name, image_url, image_scale, image_focus_x, image_focus_y, image_fit, rules, venue_ids, active_days, start_time, end_time, end_date, game_types, point_multiplier, points_required_to_win, recurring_type, winner_user_id, is_active"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }
  if (!includeResolved) {
    query = query.is("winner_user_id", null);
  }

  const { data, error } = await query.returns<ChallengeCampaignRow[]>();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load challenge campaigns.");
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

  const mapped = data.map((row) => mapCampaignRow(row, row.winner_user_id ? winnerNameById.get(row.winner_user_id) ?? null : null));
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
  activeDays?: string[];
  startTime?: string;
  endTime?: string;
  endDate?: string;
  gameTypes?: string[];
  pointMultiplier?: number;
  pointsRequiredToWin?: number;
  recurringType?: CampaignRecurringType;
  isActive?: boolean;
}): Promise<ChallengeCampaign> {
  assertConfigured();
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("Challenge name is required.");
  const rules = String(input.rules ?? "").trim();
  if (!rules) throw new Error("Challenge rules are required.");

  const row = {
    name,
    image_url: String(input.imageUrl ?? "").trim() || null,
    image_scale: Number.isFinite(input.imageScale) ? clamp(Number(input.imageScale), 0.6, 2.5) : 1,
    image_focus_x: Number.isFinite(input.imageFocusX) ? clamp(Number(input.imageFocusX), 0, 100) : 50,
    image_focus_y: Number.isFinite(input.imageFocusY) ? clamp(Number(input.imageFocusY), 0, 100) : 50,
    image_fit: VALID_IMAGE_FITS.includes((input.imageFit ?? "cover") as ChallengeImageFitMode) ? (input.imageFit ?? "cover") : "cover",
    rules,
    venue_ids: Array.from(new Set((input.venueIds ?? []).map((value) => String(value).trim()).filter(Boolean))),
    active_days: normalizeDays(input.activeDays),
    start_time: String(input.startTime ?? "").trim() || null,
    end_time: String(input.endTime ?? "").trim() || null,
    end_date: String(input.endDate ?? "").trim() || null,
    game_types: normalizeGameTypes(input.gameTypes),
    point_multiplier: Number.isFinite(input.pointMultiplier) ? Math.max(0.001, Number(input.pointMultiplier)) : 1,
    points_required_to_win: Number.isFinite(input.pointsRequiredToWin)
      ? Math.max(1, Math.round(Number(input.pointsRequiredToWin)))
      : 100,
    recurring_type: (input.recurringType ?? "none") as CampaignRecurringType,
    is_active: input.isActive ?? true,
  };

  const { data, error } = await supabaseAdmin!
    .from("challenge_campaigns")
    .insert(row)
    .select(
      "id, created_at, name, image_url, image_scale, image_focus_x, image_focus_y, image_fit, rules, venue_ids, active_days, start_time, end_time, end_date, game_types, point_multiplier, points_required_to_win, recurring_type, winner_user_id, is_active"
    )
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
  activeDays?: string[];
  startTime?: string;
  endTime?: string;
  endDate?: string;
  gameTypes?: string[];
  pointMultiplier?: number;
  pointsRequiredToWin?: number;
  recurringType?: CampaignRecurringType;
  winnerUserId?: string | null;
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
  if (Array.isArray(input.activeDays)) update.active_days = normalizeDays(input.activeDays);
  if (typeof input.startTime === "string") update.start_time = input.startTime.trim() || null;
  if (typeof input.endTime === "string") update.end_time = input.endTime.trim() || null;
  if (typeof input.endDate === "string") update.end_date = input.endDate.trim() || null;
  if (Array.isArray(input.gameTypes)) update.game_types = normalizeGameTypes(input.gameTypes);
  if (Number.isFinite(input.pointMultiplier)) update.point_multiplier = Math.max(0.001, Number(input.pointMultiplier));
  if (Number.isFinite(input.pointsRequiredToWin)) update.points_required_to_win = Math.max(1, Math.round(Number(input.pointsRequiredToWin)));
  if (typeof input.recurringType === "string") update.recurring_type = input.recurringType;
  if (input.winnerUserId !== undefined) update.winner_user_id = input.winnerUserId;
  if (typeof input.isActive === "boolean") update.is_active = input.isActive;

  const { data, error } = await supabaseAdmin!
    .from("challenge_campaigns")
    .update(update)
    .eq("id", id)
    .select(
      "id, created_at, name, image_url, image_scale, image_focus_x, image_focus_y, image_fit, rules, venue_ids, active_days, start_time, end_time, end_date, game_types, point_multiplier, points_required_to_win, recurring_type, winner_user_id, is_active"
    )
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

export async function getActiveChallengeMultiplier(
  venueId: string,
  gameType: ChallengeGameType,
  now?: Date
): Promise<{ multiplier: number; campaign: ChallengeCampaign | null }> {
  const vid = String(venueId ?? "").trim();
  if (!vid || !supabaseAdmin) return { multiplier: 1, campaign: null };

  const effectiveNow = now ?? new Date();
  let campaigns: ChallengeCampaign[];
  try {
    campaigns = await listChallengeCampaigns({ venueId: vid, includeInactive: false, includeResolved: false });
  } catch {
    return { multiplier: 1, campaign: null };
  }

  const eligible = campaigns.filter((c) => isCampaignEligibleAtTime(c, effectiveNow, gameType));
  if (eligible.length === 0) return { multiplier: 1, campaign: null };

  const best = eligible.reduce((a, b) => (b.pointMultiplier > a.pointMultiplier ? b : a));
  return { multiplier: best.pointMultiplier, campaign: best };
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
  const campaigns = await listChallengeCampaigns({
    venueId,
    includeInactive: false,
    includeResolved: false,
  });

  const eligible = campaigns.filter((campaign) => isCampaignEligibleAtTime(campaign, now, gameType));
  if (eligible.length === 0) {
    return { finalPoints: basePoints, multiplierApplied: 1, campaignUpdates: [] };
  }

  const maxMultiplier = eligible.reduce((max, campaign) => Math.max(max, campaign.pointMultiplier), 1);
  const finalPoints = Math.max(1, Math.round(basePoints * maxMultiplier));

  const campaignUpdates: Array<{ challengeId: string; progress: number; won: boolean }> = [];

  for (const campaign of eligible) {
    const increment = Math.max(1, Math.round(basePoints * campaign.pointMultiplier));
    const { data: existing } = await supabaseAdmin!
      .from("challenge_campaign_progress")
      .select("id, points_earned")
      .eq("challenge_id", campaign.id)
      .eq("user_id", userId)
      .eq("venue_id", venueId)
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
        points_earned: nextProgress,
      });
    }

    let won = false;
    if (nextProgress >= campaign.pointsRequiredToWin && !campaign.winnerUserId) {
      const { data: updatedWinner } = await supabaseAdmin!
        .from("challenge_campaigns")
        .update({ winner_user_id: userId, is_active: false })
        .eq("id", campaign.id)
        .is("winner_user_id", null)
        .select("id")
        .maybeSingle<{ id: string }>();
      won = Boolean(updatedWinner?.id);
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
  const winnerCampaignIds = campaigns
    .filter((campaign) => campaign.winnerUserId && campaign.winnerUserId === userId)
    .map((campaign) => campaign.id);
  const claimedAtByChallengeId = new Map<string, string>();
  if (winnerCampaignIds.length > 0) {
    const { data: redemptionRows } = await supabaseAdmin!
      .from("challenge_campaign_redemptions")
      .select("challenge_id, winner_user_id, venue_id, claimed_at")
      .eq("winner_user_id", userId)
      .eq("venue_id", venueId)
      .in("challenge_id", winnerCampaignIds)
      .returns<ChallengeCampaignRedemptionRow[]>();
    for (const row of redemptionRows ?? []) {
      if (row.challenge_id) {
        claimedAtByChallengeId.set(row.challenge_id, row.claimed_at);
      }
    }
  }

  return campaigns.map((campaign) => ({
    ...campaign,
    progressPoints: progressByChallenge.get(campaign.id) ?? 0,
    prizeClaimedAt: claimedAtByChallengeId.get(campaign.id) ?? null,
  }));
}

export async function listChallengeCampaignWinsForUser(params: {
  userId: string;
  venueId: string;
}): Promise<ChallengeCampaignWin[]> {
  assertConfigured();
  const userId = String(params.userId ?? "").trim();
  const venueId = String(params.venueId ?? "").trim();
  if (!userId || !venueId) {
    return [];
  }

  const campaigns = await listChallengeCampaigns({
    venueId,
    includeInactive: true,
    includeResolved: true,
  });
  const wins = campaigns.filter((campaign) => campaign.winnerUserId === userId);
  if (wins.length === 0) {
    return [];
  }

  const { data: redemptionRows } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("challenge_id, winner_user_id, venue_id, claimed_at")
    .eq("winner_user_id", userId)
    .eq("venue_id", venueId)
    .in(
      "challenge_id",
      wins.map((campaign) => campaign.id)
    )
    .returns<ChallengeCampaignRedemptionRow[]>();

  const claimedAtByChallenge = new Map<string, string>();
  for (const row of redemptionRows ?? []) {
    claimedAtByChallenge.set(row.challenge_id, row.claimed_at);
  }

  return wins.map((campaign) => ({
    challengeId: campaign.id,
    venueId,
    challengeName: campaign.name,
    challengeRules: campaign.rules,
    winnerUserId: userId,
    winnerUsername: campaign.winnerUsername ?? null,
    claimedAt: claimedAtByChallenge.get(campaign.id) ?? null,
  }));
}

export async function claimChallengeCampaignPrize(params: {
  userId: string;
  venueId: string;
  challengeId: string;
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
    .select("id, name, winner_user_id")
    .eq("id", challengeId)
    .maybeSingle<{ id: string; name: string; winner_user_id: string | null }>();
  if (campaignError) {
    throw new Error(campaignError.message ?? "Failed to verify challenge winner.");
  }
  if (!campaign?.id) {
    throw new Error("Challenge not found.");
  }
  if (!campaign.winner_user_id || campaign.winner_user_id !== userId) {
    throw new Error("Only the winner can claim this challenge prize.");
  }

  const { data: existingClaim, error: existingClaimError } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .select("claimed_at")
    .eq("challenge_id", challengeId)
    .eq("winner_user_id", userId)
    .maybeSingle<{ claimed_at: string }>();
  if (existingClaimError) {
    throw new Error(existingClaimError.message ?? "Failed to verify challenge claim status.");
  }
  if (existingClaim?.claimed_at) {
    return { claimed: false, claimedAt: existingClaim.claimed_at, challengeName: campaign.name };
  }

  const nowIso = new Date().toISOString();
  const { data: claimedRow, error: claimError } = await supabaseAdmin!
    .from("challenge_campaign_redemptions")
    .insert({
      challenge_id: challengeId,
      winner_user_id: userId,
      venue_id: venueId,
      claimed_at: nowIso,
    })
    .select("claimed_at")
    .maybeSingle<{ claimed_at: string }>();

  if (claimError) {
    if (claimError.code === "23505") {
      const { data: duplicateClaim } = await supabaseAdmin!
        .from("challenge_campaign_redemptions")
        .select("claimed_at")
        .eq("challenge_id", challengeId)
        .eq("winner_user_id", userId)
        .maybeSingle<{ claimed_at: string }>();
      return { claimed: false, claimedAt: duplicateClaim?.claimed_at ?? nowIso, challengeName: campaign.name };
    }
    throw new Error(claimError.message ?? "Failed to claim challenge prize.");
  }

  return {
    claimed: true,
    claimedAt: claimedRow?.claimed_at ?? nowIso,
    challengeName: campaign.name,
  };
}
