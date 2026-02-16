import { calculatePoints } from "@/lib/predictions";
import { getPredictionMarkets } from "@/lib/polymarket";
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

  const markets = await getPredictionMarkets();
  const selected = findOutcome(markets, predictionId, outcomeId);
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
  if (!userId) {
    return [];
  }

  if (!supabaseAdmin) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("user_predictions")
    .select("id, user_id, prediction_id, outcome_id, outcome_title, points, status, created_at, resolved_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  return data.map((row) => mapRow(row as UserPredictionRow));
}
