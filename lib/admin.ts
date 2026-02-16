import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdSlot, Advertisement, TriviaQuestion } from "@/types";

type TriviaQuestionRow = {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
};

type AdvertisementRow = {
  id: string;
  slot: AdSlot;
  venue_id: string | null;
  advertiser_name: string;
  image_url: string;
  click_url: string;
  alt_text: string;
  width: number;
  height: number;
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

function mapTriviaRow(row: TriviaQuestionRow): TriviaQuestion {
  return {
    id: row.id,
    question: row.question,
    options: row.options,
    correctAnswer: row.correct_answer,
    category: row.category ?? undefined,
    difficulty: row.difficulty ?? undefined,
  };
}

function mapAdRow(row: AdvertisementRow): Advertisement {
  return {
    id: row.id,
    slot: row.slot,
    venueId: row.venue_id ?? undefined,
    advertiserName: row.advertiser_name,
    imageUrl: row.image_url,
    clickUrl: row.click_url,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    active: row.active,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    impressions: row.impressions,
    clicks: row.clicks,
  };
}

function assertAdminConfigured() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

export type AdminAdsDebugSnapshot = {
  generatedAt: string;
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

export async function listAdminTriviaQuestions(): Promise<TriviaQuestion[]> {
  assertAdminConfigured();

  const { data, error } = await supabaseAdmin!
    .from("trivia_questions")
    .select("id, question, options, correct_answer, category, difficulty")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load trivia questions.");
  }

  return data.map((row) => mapTriviaRow(row as TriviaQuestionRow));
}

export async function createAdminTriviaQuestion(input: {
  question: string;
  options: string[];
  correctAnswer: number;
  category?: string;
  difficulty?: string;
}): Promise<TriviaQuestion> {
  assertAdminConfigured();

  const question = input.question.trim();
  const options = input.options.map((option) => option.trim()).filter(Boolean);
  if (!question) {
    throw new Error("Question is required.");
  }
  if (options.length < 2) {
    throw new Error("At least two options are required.");
  }
  if (input.correctAnswer < 0 || input.correctAnswer >= options.length) {
    throw new Error("Correct answer index is out of range.");
  }

  const { data, error } = await supabaseAdmin!
    .from("trivia_questions")
    .insert({
      question,
      options,
      correct_answer: input.correctAnswer,
      category: input.category?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
    })
    .select("id, question, options, correct_answer, category, difficulty")
    .single<TriviaQuestionRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create trivia question.");
  }

  return mapTriviaRow(data);
}

export async function updateAdminTriviaQuestion(input: {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category?: string;
  difficulty?: string;
}): Promise<TriviaQuestion> {
  assertAdminConfigured();

  const id = input.id.trim();
  const question = input.question.trim();
  const options = input.options.map((option) => option.trim()).filter(Boolean);
  if (!id) {
    throw new Error("Question id is required.");
  }
  if (!question) {
    throw new Error("Question is required.");
  }
  if (options.length < 2) {
    throw new Error("At least two options are required.");
  }
  if (input.correctAnswer < 0 || input.correctAnswer >= options.length) {
    throw new Error("Correct answer index is out of range.");
  }

  const { data, error } = await supabaseAdmin!
    .from("trivia_questions")
    .update({
      question,
      options,
      correct_answer: input.correctAnswer,
      category: input.category?.trim() || null,
      difficulty: input.difficulty?.trim() || null,
    })
    .eq("id", id)
    .select("id, question, options, correct_answer, category, difficulty")
    .single<TriviaQuestionRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update trivia question.");
  }

  return mapTriviaRow(data);
}

export async function deleteAdminTriviaQuestion(id: string): Promise<void> {
  assertAdminConfigured();
  const { error } = await supabaseAdmin!.from("trivia_questions").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function listAdminAdvertisements(): Promise<Advertisement[]> {
  assertAdminConfigured();

  const { data, error } = await supabaseAdmin!
    .from("advertisements")
    .select(
      "id, slot, venue_id, advertiser_name, image_url, click_url, alt_text, width, height, active, start_date, end_date, impressions, clicks"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load advertisements.");
  }

  return data.map((row) => mapAdRow(row as AdvertisementRow));
}

export async function createAdminAdvertisement(input: {
  slot: AdSlot;
  venueId?: string;
  advertiserName: string;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
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
  if (!input.clickUrl.trim()) {
    throw new Error("Click URL is required.");
  }
  if (!input.altText.trim()) {
    throw new Error("Alt text is required.");
  }

  const { data, error } = await supabaseAdmin!
    .from("advertisements")
    .insert({
      slot: input.slot,
      venue_id: input.venueId?.trim() || null,
      advertiser_name: input.advertiserName.trim(),
      image_url: input.imageUrl.trim(),
      click_url: input.clickUrl.trim(),
      alt_text: input.altText.trim(),
      width: input.width,
      height: input.height,
      active: input.active,
      start_date: input.startDate,
      end_date: input.endDate?.trim() || null,
    })
    .select(
      "id, slot, venue_id, advertiser_name, image_url, click_url, alt_text, width, height, active, start_date, end_date, impressions, clicks"
    )
    .single<AdvertisementRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create advertisement.");
  }

  return mapAdRow(data);
}

export async function updateAdminAdvertisement(input: {
  id: string;
  slot: AdSlot;
  venueId?: string;
  advertiserName: string;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
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
  if (!input.clickUrl.trim()) {
    throw new Error("Click URL is required.");
  }
  if (!input.altText.trim()) {
    throw new Error("Alt text is required.");
  }

  const { data, error } = await supabaseAdmin!
    .from("advertisements")
    .update({
      slot: input.slot,
      venue_id: input.venueId?.trim() || null,
      advertiser_name: input.advertiserName.trim(),
      image_url: input.imageUrl.trim(),
      click_url: input.clickUrl.trim(),
      alt_text: input.altText.trim(),
      width: input.width,
      height: input.height,
      active: input.active,
      start_date: input.startDate,
      end_date: input.endDate?.trim() || null,
    })
    .eq("id", id)
    .select(
      "id, slot, venue_id, advertiser_name, image_url, click_url, alt_text, width, height, active, start_date, end_date, impressions, clicks"
    )
    .single<AdvertisementRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update advertisement.");
  }

  return mapAdRow(data);
}

export async function deleteAdminAdvertisement(id: string): Promise<void> {
  assertAdminConfigured();
  const { error } = await supabaseAdmin!.from("advertisements").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function getAdminAdsDebugSnapshot(windowHours = 24): Promise<AdminAdsDebugSnapshot> {
  const ads = await listAdminAdvertisements();
  const safeWindowHours = Number.isFinite(windowHours)
    ? Math.min(24 * 30, Math.max(1, Math.round(windowHours)))
    : 24;
  const now = Date.now();
  const windowStartDate = new Date(now - safeWindowHours * 60 * 60 * 1000);
  const windowStartIso = windowStartDate.toISOString();
  const slots: AdSlot[] = [
    "header",
    "inline-content",
    "sidebar",
    "mid-content",
    "leaderboard-sidebar",
    "footer",
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

  try {
    const { data: eventRows } = await supabaseAdmin!
      .from("ad_events")
      .select("ad_id, event_type, created_at")
      .gte("created_at", windowStartIso)
      .order("created_at", { ascending: false })
      .limit(10000);

    for (const event of (eventRows ?? []) as AdEventRow[]) {
      if (event.event_type === "impression") {
        windowImpressionCount.set(event.ad_id, (windowImpressionCount.get(event.ad_id) ?? 0) + 1);
      } else if (event.event_type === "click") {
        windowClickCount.set(event.ad_id, (windowClickCount.get(event.ad_id) ?? 0) + 1);
      }
    }
  } catch {
    // If ad_events table is not available yet, keep window stats at zero.
  }

  const windowImpressions = Array.from(windowImpressionCount.values()).reduce((sum, value) => sum + value, 0);
  const windowClicks = Array.from(windowClickCount.values()).reduce((sum, value) => sum + value, 0);
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

  return {
    generatedAt: new Date().toISOString(),
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
  };
}

export async function listAdminUsersByVenue(venueId: string, limit = 200): Promise<AdminVenueUser[]> {
  assertAdminConfigured();

  const normalizedVenueId = venueId.trim();
  if (!normalizedVenueId) {
    return [];
  }

  const { data, error } = await supabaseAdmin!
    .from("users")
    .select("id, username, venue_id, points, is_admin, created_at")
    .eq("venue_id", normalizedVenueId)
    .order("points", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 1000)));

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to load venue users.");
  }

  return (data as AdminUserRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    venueId: row.venue_id,
    points: row.points,
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  }));
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
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new Error("Username must be 3-20 characters and use letters, numbers, or underscore.");
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

  const { data, error } = await supabaseAdmin!.rpc("settle_prediction_market", {
    p_prediction_id: predictionId,
    p_winning_outcome_id: winningOutcomeId || null,
    p_settle_as_canceled: settleAsCanceled,
  });

  if (error) {
    const errorCode = (error as { code?: string }).code;
    const shouldFallbackToLegacy = errorCode === "PGRST202" || errorCode === "42883";
    if (shouldFallbackToLegacy) {
      return resolvePendingPredictionMarketLegacy(params);
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

async function resolvePendingPredictionMarketLegacy(params: {
  predictionId: string;
  winningOutcomeId?: string;
  settleAsCanceled?: boolean;
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
      message:
        status === "won"
          ? `Prediction resolved: ${row.outcome_title} won. You earned ${row.points} points.`
          : status === "canceled"
            ? `Prediction canceled: ${row.outcome_title} market was canceled.`
            : `Prediction resolved: ${row.outcome_title} did not win.`,
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
