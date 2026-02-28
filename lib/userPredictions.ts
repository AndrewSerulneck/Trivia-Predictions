import { calculatePoints } from "@/lib/predictions";
import { getPredictionMarketById } from "@/lib/polymarket";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Prediction, UserPrediction } from "@/types";

type UserPredictionRow = {
  id: string;
  user_id: string;
  prediction_id: string;
  outcome_id: string;
  outcome_title: string;
  points: number;
  status: UserPrediction["status"];
  created_at: string;
  resolved_at: string | null;
};

type UserRow = {
  id: string;
  is_admin: boolean;
};

export type PredictionQuota = {
  limit: number;
  picksUsed: number;
  picksRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass: boolean;
};

export type UserPredictionHistoryParams = {
  status?: UserPrediction["status"] | "all";
  limit?: number;
  offset?: number;
};

const PICK_LIMIT_PER_HOUR = 10;
const WINDOW_MS = 60 * 60 * 1000;

function mapRow(row: UserPredictionRow): UserPrediction {
  return {
    id: row.id,
    userId: row.user_id,
    predictionId: row.prediction_id,
    outcomeId: row.outcome_id,
    outcomeTitle: row.outcome_title,
    points: row.points,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

function findOutcome(markets: Prediction[], predictionId: string, outcomeId: string) {
  const market = markets.find((item) => item.id === predictionId);
  if (!market) {
    return null;
  }

  const outcome = market.outcomes.find((item) => item.id === outcomeId);
  if (!outcome) {
    return null;
  }

  return { market, outcome };
}

async function getUserRow(userId: string): Promise<UserRow | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, is_admin")
    .eq("id", userId)
    .maybeSingle<UserRow>();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function getPredictionQuota(userId: string): Promise<PredictionQuota> {
  const emptyQuota: PredictionQuota = {
    limit: PICK_LIMIT_PER_HOUR,
    picksUsed: 0,
    picksRemaining: PICK_LIMIT_PER_HOUR,
    windowSecondsRemaining: 0,
    isAdminBypass: false,
  };

  if (!userId || !supabaseAdmin) {
    return emptyQuota;
  }

  const user = await getUserRow(userId);
  if (!user) {
    return emptyQuota;
  }

  if (user.is_admin) {
    return {
      ...emptyQuota,
      picksRemaining: PICK_LIMIT_PER_HOUR,
      isAdminBypass: true,
    };
  }

  const cutoffIso = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("user_predictions")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(PICK_LIMIT_PER_HOUR + 1);

  if (error || !data) {
    return emptyQuota;
  }

  const picksUsed = data.length;
  const picksRemaining = Math.max(0, PICK_LIMIT_PER_HOUR - picksUsed);

  let windowSecondsRemaining = 0;
  if (picksRemaining === 0 && data[0]?.created_at) {
    const oldestIncluded = new Date(data[0].created_at).getTime();
    const resetAt = oldestIncluded + WINDOW_MS;
    windowSecondsRemaining = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  }

  return {
    limit: PICK_LIMIT_PER_HOUR,
    picksUsed,
    picksRemaining,
    windowSecondsRemaining,
    isAdminBypass: false,
  };
}

export async function submitPredictionPick(params: {
  userId: string;
  predictionId: string;
  outcomeId: string;
}): Promise<UserPrediction> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const userId = params.userId.trim();
  const predictionId = params.predictionId.trim();
  const outcomeId = params.outcomeId.trim();
  if (!userId || !predictionId || !outcomeId) {
    throw new Error("userId, predictionId, and outcomeId are required.");
  }

  const quota = await getPredictionQuota(userId);
  if (!quota.isAdminBypass && quota.picksRemaining <= 0) {
    const minutes = Math.ceil(quota.windowSecondsRemaining / 60);
    throw new Error(`Hourly pick limit reached (10). Try again in about ${minutes} minute(s).`);
  }

  const { data: existing } = await supabaseAdmin
    .from("user_predictions")
    .select("id")
    .eq("user_id", userId)
    .eq("prediction_id", predictionId)
    .eq("status", "pending")
    .limit(1);

  if ((existing?.length ?? 0) > 0) {
    throw new Error("You already have a pending pick for this market.");
  }

  const market = await getPredictionMarketById(predictionId);
  const selected = market ? findOutcome([market], predictionId, outcomeId) : null;
  if (!selected) {
    throw new Error("Prediction market or outcome not found.");
  }

  const points = calculatePoints(selected.outcome.probability);
  const { data, error } = await supabaseAdmin
    .from("user_predictions")
    .insert({
      user_id: userId,
      prediction_id: predictionId,
      outcome_id: outcomeId,
      outcome_title: selected.outcome.title,
      points,
      status: "pending",
    })
    .select("id, user_id, prediction_id, outcome_id, outcome_title, points, status, created_at, resolved_at")
    .single<UserPredictionRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save prediction pick.");
  }

  return mapRow(data);
}

export async function getUserPredictions(userId: string): Promise<UserPrediction[]> {
  const { items } = await listUserPredictions(userId, { status: "all", limit: 50, offset: 0 });
  return items;
}

export async function listUserPredictions(
  userId: string,
  params: UserPredictionHistoryParams = {}
): Promise<{ items: UserPrediction[]; totalItems: number }> {
  if (!userId) {
    return { items: [], totalItems: 0 };
  }

  if (!supabaseAdmin) {
    return { items: [], totalItems: 0 };
  }

  const normalizedLimit = Math.max(1, Math.min(100, Number(params.limit ?? 25)));
  const normalizedOffset = Math.max(0, Number(params.offset ?? 0));
  const status = params.status ?? "all";

  let query = supabaseAdmin
    .from("user_predictions")
    .select("id, user_id, prediction_id, outcome_id, outcome_title, points, status, created_at, resolved_at", {
      count: "exact",
    })
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query.range(normalizedOffset, normalizedOffset + normalizedLimit - 1);

  if (error || !data) {
    return { items: [], totalItems: 0 };
  }

  return {
    items: data.map((row) => mapRow(row as UserPredictionRow)),
    totalItems: Math.max(0, count ?? 0),
  };
}
