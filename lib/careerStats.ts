import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type StatusCountMap = Record<string, number>;

export type CareerStatsSummary = {
  generatedAt: string;
  trivia: {
    totalAnswered: number;
    correct: number;
    incorrect: number;
    accuracyPct: number;
  };
  bingo: {
    totalBoards: number;
    active: number;
    won: number;
    lost: number;
    canceled: number;
    winRatePct: number;
    totalClaimedPoints: number;
  };
  pickem: {
    totalPicks: number;
    pending: number;
    won: number;
    lost: number;
    push: number;
    canceled: number;
    winRatePct: number;
    totalClaimedPoints: number;
  };
  fantasy: {
    totalLineups: number;
    pending: number;
    live: number;
    final: number;
    canceled: number;
    bestScore: number;
    averageScore: number;
    venueAverageScore: number;
    globalAverageScore: number;
    vsVenueAverage: number;
    vsGlobalAverage: number;
    totalClaimedPoints: number;
  };
};

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function toFixed2(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

async function countRows(
  table: string,
  apply: (query: any) => any
): Promise<number> {
  if (!supabaseAdmin) {
    return 0;
  }
  const { count, error } = await apply(
    supabaseAdmin.from(table).select("id", { count: "exact", head: true })
  );
  if (error) {
    return 0;
  }
  return Math.max(0, count ?? 0);
}

async function sumNumberColumn(
  table: string,
  column: string,
  apply: (query: any) => any
): Promise<number> {
  if (!supabaseAdmin) {
    return 0;
  }

  const batchSize = 1000;
  let offset = 0;
  let total = 0;

  for (;;) {
    const { data, error } = await apply(
      supabaseAdmin
        .from(table)
        .select(column)
        .range(offset, offset + batchSize - 1)
    );
    if (error || !Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data as Array<Record<string, unknown>>) {
      const value = Number(row[column]);
      if (Number.isFinite(value)) {
        total += value;
      }
    }

    if (data.length < batchSize) {
      break;
    }
    offset += batchSize;
  }

  return total;
}

async function fetchNumberColumnValues(
  table: string,
  column: string,
  apply: (query: any) => any
): Promise<number[]> {
  if (!supabaseAdmin) {
    return [];
  }

  const batchSize = 1000;
  let offset = 0;
  const values: number[] = [];

  for (;;) {
    const { data, error } = await apply(
      supabaseAdmin
        .from(table)
        .select(column)
        .range(offset, offset + batchSize - 1)
    );
    if (error || !Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const row of data as Array<Record<string, unknown>>) {
      const value = Number(row[column]);
      if (Number.isFinite(value)) {
        values.push(value);
      }
    }

    if (data.length < batchSize) {
      break;
    }
    offset += batchSize;
  }

  return values;
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return toFixed2(total / values.length);
}

function maxValue(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return toFixed2(values.reduce((max, value) => (value > max ? value : max), Number.NEGATIVE_INFINITY));
}

async function countStatuses(
  table: string,
  userId: string,
  statuses: string[]
): Promise<StatusCountMap> {
  const output: StatusCountMap = {};
  await Promise.all(
    statuses.map(async (status) => {
      output[status] = await countRows(table, (query) =>
        query.eq("user_id", userId).eq("status", status)
      );
    })
  );
  return output;
}

export async function getCareerStatsForUser(userId: string): Promise<CareerStatsSummary> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId || !supabaseAdmin) {
    return {
      generatedAt: new Date().toISOString(),
      trivia: { totalAnswered: 0, correct: 0, incorrect: 0, accuracyPct: 0 },
      bingo: { totalBoards: 0, active: 0, won: 0, lost: 0, canceled: 0, winRatePct: 0, totalClaimedPoints: 0 },
      pickem: { totalPicks: 0, pending: 0, won: 0, lost: 0, push: 0, canceled: 0, winRatePct: 0, totalClaimedPoints: 0 },
      fantasy: {
        totalLineups: 0,
        pending: 0,
        live: 0,
        final: 0,
        canceled: 0,
        bestScore: 0,
        averageScore: 0,
        venueAverageScore: 0,
        globalAverageScore: 0,
        vsVenueAverage: 0,
        vsGlobalAverage: 0,
        totalClaimedPoints: 0,
      },
    };
  }

  const [{ data: userRow }] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("venue_id")
      .eq("id", normalizedUserId)
      .maybeSingle<{ venue_id: string | null }>(),
  ]);
  const venueId = String(userRow?.venue_id ?? "").trim();

  const [
    triviaTotalAnswered,
    triviaCorrect,
    bingoStatusCounts,
    bingoClaimedPoints,
    pickEmStatusCounts,
    pickEmClaimedPoints,
    fantasyStatusCounts,
    fantasyUserFinalPoints,
    fantasyVenueFinalPoints,
    fantasyGlobalFinalPoints,
    fantasyClaimedPoints,
  ] = await Promise.all([
    countRows("trivia_answers", (query) => query.eq("user_id", normalizedUserId)),
    countRows("trivia_answers", (query) =>
      query.eq("user_id", normalizedUserId).eq("is_correct", true)
    ),
    countStatuses("sports_bingo_cards", normalizedUserId, ["active", "won", "lost", "canceled"]),
    sumNumberColumn("sports_bingo_cards", "reward_points", (query) =>
      query.eq("user_id", normalizedUserId).not("reward_claimed_at", "is", null)
    ),
    countStatuses("pickem_picks", normalizedUserId, ["pending", "won", "lost", "push", "canceled"]),
    sumNumberColumn("pickem_picks", "reward_points", (query) =>
      query.eq("user_id", normalizedUserId).not("reward_claimed_at", "is", null)
    ),
    countStatuses("fantasy_entries", normalizedUserId, ["pending", "live", "final", "canceled"]),
    fetchNumberColumnValues("fantasy_entries", "points", (query) =>
      query.eq("user_id", normalizedUserId).eq("status", "final")
    ),
    venueId
      ? fetchNumberColumnValues("fantasy_entries", "points", (query) =>
          query.eq("venue_id", venueId).eq("status", "final")
        )
      : Promise.resolve([]),
    fetchNumberColumnValues("fantasy_entries", "points", (query) =>
      query.eq("status", "final")
    ),
    sumNumberColumn("fantasy_entries", "reward_points", (query) =>
      query.eq("user_id", normalizedUserId).not("reward_claimed_at", "is", null)
    ),
  ]);

  const triviaIncorrect = Math.max(0, triviaTotalAnswered - triviaCorrect);

  const bingoWon = bingoStatusCounts.won ?? 0;
  const bingoLost = bingoStatusCounts.lost ?? 0;
  const bingoSettled = bingoWon + bingoLost;
  const bingoTotalBoards =
    (bingoStatusCounts.active ?? 0) +
    (bingoStatusCounts.won ?? 0) +
    (bingoStatusCounts.lost ?? 0) +
    (bingoStatusCounts.canceled ?? 0);

  const pickEmWon = pickEmStatusCounts.won ?? 0;
  const pickEmLost = pickEmStatusCounts.lost ?? 0;
  const pickEmSettled = pickEmWon + pickEmLost;
  const pickEmTotalPicks =
    (pickEmStatusCounts.pending ?? 0) +
    (pickEmStatusCounts.won ?? 0) +
    (pickEmStatusCounts.lost ?? 0) +
    (pickEmStatusCounts.push ?? 0) +
    (pickEmStatusCounts.canceled ?? 0);

  const fantasyAverageScore = avg(fantasyUserFinalPoints);
  const fantasyVenueAverage = avg(fantasyVenueFinalPoints);
  const fantasyGlobalAverage = avg(fantasyGlobalFinalPoints);

  return {
    generatedAt: new Date().toISOString(),
    trivia: {
      totalAnswered: triviaTotalAnswered,
      correct: triviaCorrect,
      incorrect: triviaIncorrect,
      accuracyPct: toPct(triviaCorrect, triviaTotalAnswered),
    },
    bingo: {
      totalBoards: bingoTotalBoards,
      active: bingoStatusCounts.active ?? 0,
      won: bingoWon,
      lost: bingoLost,
      canceled: bingoStatusCounts.canceled ?? 0,
      winRatePct: toPct(bingoWon, bingoSettled),
      totalClaimedPoints: Math.max(0, Math.round(bingoClaimedPoints)),
    },
    pickem: {
      totalPicks: pickEmTotalPicks,
      pending: pickEmStatusCounts.pending ?? 0,
      won: pickEmWon,
      lost: pickEmLost,
      push: pickEmStatusCounts.push ?? 0,
      canceled: pickEmStatusCounts.canceled ?? 0,
      winRatePct: toPct(pickEmWon, pickEmSettled),
      totalClaimedPoints: Math.max(0, Math.round(pickEmClaimedPoints)),
    },
    fantasy: {
      totalLineups:
        (fantasyStatusCounts.pending ?? 0) +
        (fantasyStatusCounts.live ?? 0) +
        (fantasyStatusCounts.final ?? 0) +
        (fantasyStatusCounts.canceled ?? 0),
      pending: fantasyStatusCounts.pending ?? 0,
      live: fantasyStatusCounts.live ?? 0,
      final: fantasyStatusCounts.final ?? 0,
      canceled: fantasyStatusCounts.canceled ?? 0,
      bestScore: maxValue(fantasyUserFinalPoints),
      averageScore: fantasyAverageScore,
      venueAverageScore: fantasyVenueAverage,
      globalAverageScore: fantasyGlobalAverage,
      vsVenueAverage: toFixed2(fantasyAverageScore - fantasyVenueAverage),
      vsGlobalAverage: toFixed2(fantasyAverageScore - fantasyGlobalAverage),
      totalClaimedPoints: Math.max(0, Math.round(fantasyClaimedPoints)),
    },
  };
}

