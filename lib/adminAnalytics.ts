import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_RAW_RANGE_DAYS = 90;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RAW_ROWS = 50_000;

// Keep the admin reads intentionally boring and cheap: short cache TTL, hard
// raw-query windows, and row caps. Client telemetry should pair with this by
// pausing hidden-tab heartbeats, batching emissions, and flushing final session
// close events with navigator.sendBeacon.

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const analyticsCache = new Map<string, CacheEntry<unknown>>();

type VenueRow = {
  id: string;
  name: string;
  display_name: string | null;
  zip_code: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  country: string | null;
};

type UserGeoRow = {
  user_id: string;
  zip_code: string | null;
  city: string | null;
  state_code: string | null;
  region_key: string | null;
  country: string | null;
};

type UserSessionRow = {
  user_id: string;
  venue_id: string;
  session_start_at: string;
  duration_ms: number | null;
};

type GameSessionRow = {
  user_id: string;
  venue_id: string;
  game_type: string;
  game_start_at: string;
  duration_ms: number | null;
  game_outcome: string | null;
};

type AdInteractionRow = {
  user_id: string | null;
  venue_id: string;
  ad_id: string;
  interaction_type: string;
  interaction_at: string;
};

type AdvertisementRow = {
  id: string;
  advertiser_name: string;
  alt_text: string;
};

type GroupBy = "venue" | "zip_code" | "city" | "state_code" | "region_key" | "country";
type GeoBreakdownGroupBy = "venue" | "region" | "state" | "city" | "zip";
type CohortSize = "weekly" | "monthly";

export type AnalyticsQueryContext = {
  adminUsername: string;
  searchParams: URLSearchParams;
  endpoint: string;
};

type PreparedQuery = {
  cacheKey: string;
  venueIds: string[];
  venuesById: Map<string, VenueRow>;
  range: { start: Date; end: Date };
};

function assertConfigured() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

function normalizeList(values: Array<string | null>): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function parseVenues(searchParams: URLSearchParams): string[] {
  return normalizeList([
    ...searchParams.getAll("venues"),
    searchParams.get("venueIds"),
    searchParams.get("venueId"),
  ]);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseDateRange(searchParams: URLSearchParams): { start: Date; end: Date } {
  const rawDateRange = String(searchParams.get("date_range") ?? "").trim();
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;

  if (rawDateRange) {
    try {
      const parsed = JSON.parse(rawDateRange) as { start?: string; end?: string };
      rangeStart = parsed.start ?? null;
      rangeEnd = parsed.end ?? null;
    } catch {
      const [startPart, endPart] = rawDateRange.split(",");
      rangeStart = startPart?.trim() || null;
      rangeEnd = endPart?.trim() || null;
    }
  }

  const end = parseDate(searchParams.get("end") ?? searchParams.get("endDate") ?? rangeEnd) ?? new Date();
  const start =
    parseDate(searchParams.get("start") ?? searchParams.get("startDate") ?? rangeStart) ??
    new Date(end.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  if (start >= end) {
    throw new AnalyticsInputError("date_range start must be before end.");
  }

  const rangeDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (rangeDays > MAX_RAW_RANGE_DAYS) {
    throw new AnalyticsInputError(`date_range cannot exceed ${MAX_RAW_RANGE_DAYS} days for raw analytics endpoints.`);
  }

  return { start, end };
}

function normalizeGroupBy(value: string | null): GroupBy {
  const normalized = String(value ?? "venue").trim().toLowerCase();
  if (normalized === "state") return "state_code";
  if (normalized === "zip") return "zip_code";
  if (
    normalized === "venue" ||
    normalized === "zip_code" ||
    normalized === "city" ||
    normalized === "state_code" ||
    normalized === "region_key" ||
    normalized === "country"
  ) {
    return normalized;
  }
  throw new AnalyticsInputError("group_by must be venue, zip_code, city, state_code, region_key, or country.");
}

function normalizeGeoBreakdownGroupBy(value: string | null): GeoBreakdownGroupBy {
  const normalized = String(value ?? "region").trim().toLowerCase();
  if (normalized === "zip_code") return "zip";
  if (normalized === "state_code") return "state";
  if (normalized === "region_key") return "region";
  if (normalized === "venue" || normalized === "region" || normalized === "state" || normalized === "city" || normalized === "zip") {
    return normalized;
  }
  throw new AnalyticsInputError("group_by must be venue, region, state, city, or zip.");
}

function normalizeCohortSize(value: string | null): CohortSize {
  const normalized = String(value ?? "weekly").trim().toLowerCase();
  if (normalized === "weekly" || normalized === "monthly") return normalized;
  throw new AnalyticsInputError("cohort_size must be weekly or monthly.");
}

function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeekUtc(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return isoDateOnly(copy);
}

function startOfMonthUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function periodStart(date: Date, cohortSize: CohortSize): string {
  return cohortSize === "weekly" ? startOfWeekUtc(date) : startOfMonthUtc(date);
}

function periodIndex(cohortStart: string, activityStart: string, cohortSize: CohortSize): number {
  const cohort = new Date(`${cohortStart}T00:00:00.000Z`);
  const activity = new Date(`${activityStart}T00:00:00.000Z`);
  if (cohortSize === "monthly") {
    return (activity.getUTCFullYear() - cohort.getUTCFullYear()) * 12 + activity.getUTCMonth() - cohort.getUTCMonth();
  }
  return Math.max(0, Math.floor((activity.getTime() - cohort.getTime()) / (7 * 24 * 60 * 60 * 1000)));
}

export class AnalyticsInputError extends Error {
  status = 400;
}

class AnalyticsTooLargeError extends Error {
  status = 413;
}

function getCached<T>(key: string): T | null {
  const entry = analyticsCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) analyticsCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T): T {
  analyticsCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function getVenueScope(adminUsername: string, requestedVenueIds: string[]): Promise<{
  venueIds: string[];
  venuesById: Map<string, VenueRow>;
}> {
  assertConfigured();

  const { data: venues, error: venuesError } = await supabaseAdmin!
    .from("venues")
    .select("id, name, display_name, zip_code, city, state, region, country")
    .order("name", { ascending: true });

  if (venuesError || !venues) {
    throw new Error(venuesError?.message ?? "Failed to load venues.");
  }

  const venuesById = new Map((venues as VenueRow[]).map((venue) => [venue.id, venue]));

  const { data: adminRows, error: adminRowsError } = await supabaseAdmin!
    .from("users")
    .select("venue_id")
    .eq("username", adminUsername)
    .eq("is_admin", true);

  if (adminRowsError) {
    throw new Error(adminRowsError.message);
  }

  const scopedVenueIds = normalizeList(((adminRows ?? []) as Array<{ venue_id: string | null }>).map((row) => row.venue_id));
  const allowedVenueIds = scopedVenueIds.length > 0 ? scopedVenueIds : Array.from(venuesById.keys());
  const requested = requestedVenueIds.length > 0 ? requestedVenueIds : allowedVenueIds;
  const unauthorized = requested.filter((venueId) => !allowedVenueIds.includes(venueId));

  if (unauthorized.length > 0) {
    throw new AnalyticsInputError("One or more requested venues are outside this admin's venue scope.");
  }

  const venueIds = requested.filter((venueId) => venuesById.has(venueId));
  return { venueIds, venuesById };
}

async function prepareQuery(context: AnalyticsQueryContext): Promise<PreparedQuery> {
  const range = parseDateRange(context.searchParams);
  const requestedVenueIds = parseVenues(context.searchParams);
  const { venueIds, venuesById } = await getVenueScope(context.adminUsername, requestedVenueIds);
  const cacheKey = JSON.stringify({
    endpoint: context.endpoint,
    adminUsername: context.adminUsername,
    params: Array.from(context.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b)),
    venues: venueIds,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  return { cacheKey, venueIds, venuesById, range };
}

async function fetchUserGeo(userIds: string[]): Promise<Map<string, UserGeoRow>> {
  assertConfigured();
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, UserGeoRow>();
  for (let index = 0; index < uniqueUserIds.length; index += 500) {
    const chunk = uniqueUserIds.slice(index, index + 500);
    const { data, error } = await supabaseAdmin!
      .from("user_geographic_data")
      .select("user_id, zip_code, city, state_code, region_key, country")
      .in("user_id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as UserGeoRow[]) {
      result.set(row.user_id, row);
    }
  }
  return result;
}

async function fetchRows<T extends { venue_id: string }>(
  table: string,
  select: string,
  venueIds: string[],
  timeColumn: string,
  range: { start: Date; end: Date }
): Promise<T[]> {
  assertConfigured();
  if (venueIds.length === 0) return [];

  const { data, error } = await supabaseAdmin!
    .from(table)
    .select(select)
    .in("venue_id", venueIds)
    .gte(timeColumn, range.start.toISOString())
    .lt(timeColumn, range.end.toISOString())
    .limit(MAX_RAW_ROWS + 1);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as T[];
  if (rows.length > MAX_RAW_ROWS) {
    throw new AnalyticsTooLargeError("Analytics query matched too many raw rows. Narrow the date range or selected venues.");
  }
  return rows;
}

function venueLabel(venue: VenueRow | undefined, venueId: string): string {
  return venue?.display_name || venue?.name || venueId;
}

function groupFor(params: {
  groupBy: GroupBy;
  venueId: string;
  userId?: string | null;
  venuesById: Map<string, VenueRow>;
  geoByUserId: Map<string, UserGeoRow>;
}): { key: string; label: string } {
  const venue = params.venuesById.get(params.venueId);
  const geo = params.userId ? params.geoByUserId.get(params.userId) : undefined;

  if (params.groupBy === "venue") {
    return { key: params.venueId, label: venueLabel(venue, params.venueId) };
  }

  const value =
    params.groupBy === "zip_code"
      ? geo?.zip_code || venue?.zip_code
      : params.groupBy === "city"
        ? geo?.city || venue?.city
        : params.groupBy === "state_code"
          ? geo?.state_code || venue?.state
          : params.groupBy === "region_key"
            ? geo?.region_key || venue?.region
            : geo?.country || venue?.country;
  const normalized = String(value ?? "").trim();
  if (!normalized) return { key: "unknown", label: "Unknown" };
  const key = params.groupBy === "state_code" || params.groupBy === "country" ? normalized.toUpperCase() : normalized.toLowerCase();
  return { key, label: normalized };
}

function minutes(ms: number): number {
  return Math.round((ms / 60000) * 100) / 100;
}

export async function getUserSessionAnalytics(context: AnalyticsQueryContext) {
  const prepared = await prepareQuery(context);
  const groupBy = normalizeGroupBy(context.searchParams.get("group_by"));
  const cacheKey = `${prepared.cacheKey}:group:${groupBy}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await fetchRows<UserSessionRow>(
    "user_sessions",
    "user_id, venue_id, session_start_at, duration_ms",
    prepared.venueIds,
    "session_start_at",
    prepared.range
  );
  const geoByUserId = await fetchUserGeo(rows.map((row) => row.user_id));
  const buckets = new Map<string, {
    group: string;
    activeUsers: Set<string>;
    totalSessions: number;
    durationMs: number;
    peakHours: Map<number, number>;
    dailyActivity: Map<string, { users: Set<string>; sessions: number }>;
    heatmap: Map<string, { dayOfWeek: number; hour: number; users: Set<string>; sessions: number }>;
  }>();

  for (const row of rows) {
    const group = groupFor({ groupBy, venueId: row.venue_id, userId: row.user_id, venuesById: prepared.venuesById, geoByUserId });
    const bucket = buckets.get(group.key) ?? {
      group: group.label,
      activeUsers: new Set<string>(),
      totalSessions: 0,
      durationMs: 0,
      peakHours: new Map<number, number>(),
      dailyActivity: new Map<string, { users: Set<string>; sessions: number }>(),
      heatmap: new Map<string, { dayOfWeek: number; hour: number; users: Set<string>; sessions: number }>(),
    };
    bucket.group = group.label;
    bucket.activeUsers.add(row.user_id);
    bucket.totalSessions += 1;
    bucket.durationMs += Number(row.duration_ms ?? 0);
    const startedAt = new Date(row.session_start_at);
    const hour = startedAt.getUTCHours();
    const day = isoDateOnly(startedAt);
    const heatKey = `${startedAt.getUTCDay()}:${hour}`;
    bucket.peakHours.set(hour, (bucket.peakHours.get(hour) ?? 0) + 1);
    const daily = bucket.dailyActivity.get(day) ?? { users: new Set<string>(), sessions: 0 };
    daily.users.add(row.user_id);
    daily.sessions += 1;
    bucket.dailyActivity.set(day, daily);
    const heat = bucket.heatmap.get(heatKey) ?? {
      dayOfWeek: startedAt.getUTCDay(),
      hour,
      users: new Set<string>(),
      sessions: 0,
    };
    heat.users.add(row.user_id);
    heat.sessions += 1;
    bucket.heatmap.set(heatKey, heat);
    buckets.set(group.key, bucket);
  }

  return setCached(cacheKey, Array.from(buckets.values()).map((bucket) => ({
    group: bucket.group,
    active_users: bucket.activeUsers.size,
    total_sessions: bucket.totalSessions,
    avg_session_duration_minutes: bucket.totalSessions > 0 ? minutes(bucket.durationMs / bucket.totalSessions) : 0,
    peak_hours: Array.from(bucket.peakHours.entries())
      .map(([hour, sessions]) => ({ hour, sessions }))
      .sort((a, b) => b.sessions - a.sessions || a.hour - b.hour)
      .slice(0, 6),
    daily_activity: Array.from(bucket.dailyActivity.entries())
      .map(([date, item]) => ({ date, active_users: item.users.size, sessions: item.sessions }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    activity_heatmap: Array.from(bucket.heatmap.values())
      .map((item) => ({
        day_of_week: item.dayOfWeek,
        hour: item.hour,
        active_users: item.users.size,
        sessions: item.sessions,
      }))
      .sort((a, b) => a.day_of_week - b.day_of_week || a.hour - b.hour),
  })).sort((a, b) => b.active_users - a.active_users || b.total_sessions - a.total_sessions));
}

export async function getGameStatisticsAnalytics(context: AnalyticsQueryContext) {
  const prepared = await prepareQuery(context);
  const groupBy = normalizeGroupBy(context.searchParams.get("group_by"));
  const gameTypeFilter = String(context.searchParams.get("game_type") ?? "").trim();
  const cacheKey = `${prepared.cacheKey}:group:${groupBy}:game:${gameTypeFilter}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  let rows = await fetchRows<GameSessionRow>(
    "game_sessions",
    "user_id, venue_id, game_type, game_start_at, duration_ms, game_outcome",
    prepared.venueIds,
    "game_start_at",
    prepared.range
  );
  if (gameTypeFilter) rows = rows.filter((row) => row.game_type === gameTypeFilter);
  const geoByUserId = await fetchUserGeo(rows.map((row) => row.user_id));
  const groups = new Map<string, { group: string; games: Map<string, { plays: number; durationMs: number; wins: number }> }>();

  for (const row of rows) {
    const group = groupFor({ groupBy, venueId: row.venue_id, userId: row.user_id, venuesById: prepared.venuesById, geoByUserId });
    const grouped = groups.get(group.key) ?? { group: group.label, games: new Map() };
    grouped.group = group.label;
    const game = grouped.games.get(row.game_type) ?? { plays: 0, durationMs: 0, wins: 0 };
    game.plays += 1;
    game.durationMs += Number(row.duration_ms ?? 0);
    if (row.game_outcome === "won") game.wins += 1;
    grouped.games.set(row.game_type, game);
    groups.set(group.key, grouped);
  }

  return setCached(cacheKey, Array.from(groups.values()).map((grouped) => {
    const games = Array.from(grouped.games.entries())
      .map(([game_type, game]) => ({
        game_type,
        total_plays: game.plays,
        avg_duration_minutes: game.plays > 0 ? minutes(game.durationMs / game.plays) : 0,
        win_rate: game.plays > 0 ? Math.round((game.wins / game.plays) * 10000) / 100 : 0,
        popularity_rank: 0,
      }))
      .sort((a, b) => b.total_plays - a.total_plays || a.game_type.localeCompare(b.game_type))
      .map((game, index) => ({ ...game, popularity_rank: index + 1 }));
    return { group: grouped.group, games };
  }).sort((a, b) => (b.games[0]?.total_plays ?? 0) - (a.games[0]?.total_plays ?? 0)));
}

export async function getAdPerformanceAnalytics(context: AnalyticsQueryContext) {
  const prepared = await prepareQuery(context);
  const groupBy = normalizeGroupBy(context.searchParams.get("group_by"));
  const cacheKey = `${prepared.cacheKey}:group:${groupBy}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const rows = await fetchRows<AdInteractionRow>(
    "ad_interactions",
    "user_id, venue_id, ad_id, interaction_type, interaction_at",
    prepared.venueIds,
    "interaction_at",
    prepared.range
  );
  const geoByUserId = await fetchUserGeo(rows.map((row) => row.user_id ?? ""));
  const adIds = Array.from(new Set(rows.map((row) => row.ad_id)));
  const adsById = new Map<string, AdvertisementRow>();
  if (adIds.length > 0) {
    const { data, error } = await supabaseAdmin!
      .from("advertisements")
      .select("id, advertiser_name, alt_text")
      .in("id", adIds);
    if (error) throw new Error(error.message);
    for (const ad of (data ?? []) as AdvertisementRow[]) adsById.set(ad.id, ad);
  }

  const groups = new Map<string, {
    group: string;
    impressions: number;
    clicks: number;
    ads: Map<string, { impressions: number; clicks: number }>;
    trend: Map<string, { impressions: number; clicks: number }>;
  }>();

  for (const row of rows) {
    const group = groupFor({ groupBy, venueId: row.venue_id, userId: row.user_id, venuesById: prepared.venuesById, geoByUserId });
    const grouped = groups.get(group.key) ?? {
      group: group.label,
      impressions: 0,
      clicks: 0,
      ads: new Map(),
      trend: new Map<string, { impressions: number; clicks: number }>(),
    };
    const ad = grouped.ads.get(row.ad_id) ?? { impressions: 0, clicks: 0 };
    const day = isoDateOnly(new Date(row.interaction_at));
    const trend = grouped.trend.get(day) ?? { impressions: 0, clicks: 0 };
    if (row.interaction_type === "view") {
      grouped.impressions += 1;
      ad.impressions += 1;
      trend.impressions += 1;
    }
    if (row.interaction_type === "click" || row.interaction_type === "convert") {
      grouped.clicks += 1;
      ad.clicks += 1;
      trend.clicks += 1;
    }
    grouped.ads.set(row.ad_id, ad);
    grouped.trend.set(day, trend);
    grouped.group = group.label;
    groups.set(group.key, grouped);
  }

  return setCached(cacheKey, Array.from(groups.values()).map((grouped) => ({
    group: grouped.group,
    total_impressions: grouped.impressions,
    total_clicks: grouped.clicks,
    ctr: grouped.impressions > 0 ? Math.round((grouped.clicks / grouped.impressions) * 10000) / 100 : 0,
    top_ads: Array.from(grouped.ads.entries())
      .map(([ad_id, ad]) => ({
        ad_id,
        ad_name: adsById.get(ad_id)?.advertiser_name || adsById.get(ad_id)?.alt_text || ad_id,
        clicks: ad.clicks,
        ctr: ad.impressions > 0 ? Math.round((ad.clicks / ad.impressions) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks || b.ctr - a.ctr)
      .slice(0, 10),
    ctr_trend: Array.from(grouped.trend.entries())
      .map(([date, item]) => ({
        date,
        impressions: item.impressions,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? Math.round((item.clicks / item.impressions) * 10000) / 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  })).sort((a, b) => b.total_clicks - a.total_clicks || b.total_impressions - a.total_impressions));
}

type GeoNode = {
  key: string;
  label: string;
  level: string;
  active_users: number;
  total_sessions: number;
  total_game_sessions: number;
  total_ad_clicks: number;
  total_duration_minutes: number;
  children: GeoNode[];
};

type GeoTreeNode = GeoNode & {
  userSet: Set<string>;
  childMap: Map<string, GeoTreeNode>;
};

function blankGeoNode(key: string, label: string, level: string): GeoNode {
  return {
    key,
    label,
    level,
    active_users: 0,
    total_sessions: 0,
    total_game_sessions: 0,
    total_ad_clicks: 0,
    total_duration_minutes: 0,
    children: [],
  };
}

export async function getGeographicBreakdownAnalytics(context: AnalyticsQueryContext) {
  const prepared = await prepareQuery(context);
  const groupBy = normalizeGeoBreakdownGroupBy(context.searchParams.get("group_by"));
  const minUsers = Math.max(0, parseInt(context.searchParams.get("min_users") ?? "0", 10) || 0);
  const cacheKey = `${prepared.cacheKey}:geo:${groupBy}:min:${minUsers}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [sessions, games, ads] = await Promise.all([
    fetchRows<UserSessionRow>("user_sessions", "user_id, venue_id, session_start_at, duration_ms", prepared.venueIds, "session_start_at", prepared.range),
    fetchRows<GameSessionRow>("game_sessions", "user_id, venue_id, game_type, game_start_at, duration_ms, game_outcome", prepared.venueIds, "game_start_at", prepared.range),
    fetchRows<AdInteractionRow>("ad_interactions", "user_id, venue_id, ad_id, interaction_type, interaction_at", prepared.venueIds, "interaction_at", prepared.range),
  ]);
  const geoByUserId = await fetchUserGeo([
    ...sessions.map((row) => row.user_id),
    ...games.map((row) => row.user_id),
    ...ads.map((row) => row.user_id ?? ""),
  ]);

  const levelsByStart: Record<GeoBreakdownGroupBy, GroupBy[]> = {
    venue: ["venue"],
    region: ["region_key", "state_code", "city", "zip_code"],
    state: ["state_code", "city", "zip_code"],
    city: ["city", "zip_code"],
    zip: ["zip_code"],
  };
  const levels = levelsByStart[groupBy];
  const rootMap = new Map<string, GeoTreeNode>();

  function applyMetric(row: { venue_id: string; user_id?: string | null }, metric: "session" | "game" | "adClick", durationMs = 0) {
    let currentMap = rootMap;
    for (const level of levels) {
      const group = groupFor({ groupBy: level, venueId: row.venue_id, userId: row.user_id, venuesById: prepared.venuesById, geoByUserId });
      let node = currentMap.get(group.key);
      if (!node) {
        node = { ...blankGeoNode(group.key, group.label, level), userSet: new Set<string>(), childMap: new Map() };
        currentMap.set(group.key, node);
      }
      if (row.user_id) node.userSet.add(row.user_id);
      if (metric === "session") {
        node.total_sessions += 1;
        node.total_duration_minutes += durationMs / 60000;
      }
      if (metric === "game") node.total_game_sessions += 1;
      if (metric === "adClick") node.total_ad_clicks += 1;

      currentMap = node.childMap;
    }
  }

  for (const row of sessions) applyMetric(row, "session", Number(row.duration_ms ?? 0));
  for (const row of games) applyMetric(row, "game");
  for (const row of ads) {
    if (row.interaction_type === "click" || row.interaction_type === "convert") applyMetric(row, "adClick");
  }

  function finalize(nodes: GeoTreeNode[]): GeoNode[] {
    return nodes
      .map((node) => ({
        key: node.key,
        label: node.label,
        level: node.level,
        active_users: node.userSet.size,
        total_sessions: node.total_sessions,
        total_game_sessions: node.total_game_sessions,
        total_ad_clicks: node.total_ad_clicks,
        total_duration_minutes: Math.round(node.total_duration_minutes * 100) / 100,
        children: finalize(Array.from(node.childMap.values())),
      }))
      .filter((node) => node.active_users >= minUsers)
      .sort((a, b) => b.active_users - a.active_users || b.total_sessions - a.total_sessions);
  }

  return setCached(cacheKey, finalize(Array.from(rootMap.values())));
}

export async function getUserCohortsAnalytics(context: AnalyticsQueryContext) {
  const prepared = await prepareQuery(context);
  const cohortSize = normalizeCohortSize(context.searchParams.get("cohort_size"));
  const cacheKey = `${prepared.cacheKey}:cohort:${cohortSize}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [sessions, games, ads] = await Promise.all([
    fetchRows<UserSessionRow>("user_sessions", "user_id, venue_id, session_start_at, duration_ms", prepared.venueIds, "session_start_at", prepared.range),
    fetchRows<GameSessionRow>("game_sessions", "user_id, venue_id, game_type, game_start_at, duration_ms, game_outcome", prepared.venueIds, "game_start_at", prepared.range),
    fetchRows<AdInteractionRow>("ad_interactions", "user_id, venue_id, ad_id, interaction_type, interaction_at", prepared.venueIds, "interaction_at", prepared.range),
  ]);

  const firstSeen = new Map<string, string>();
  const activePeriodsByUser = new Map<string, Set<string>>();

  function record(userId: string | null | undefined, occurredAt: string) {
    if (!userId) return;
    const period = periodStart(new Date(occurredAt), cohortSize);
    const previous = firstSeen.get(userId);
    if (!previous || period < previous) firstSeen.set(userId, period);
    const periods = activePeriodsByUser.get(userId) ?? new Set<string>();
    periods.add(period);
    activePeriodsByUser.set(userId, periods);
  }

  for (const row of sessions) record(row.user_id, row.session_start_at);
  for (const row of games) record(row.user_id, row.game_start_at);
  for (const row of ads) record(row.user_id, row.interaction_at);

  const cohortUsers = new Map<string, Set<string>>();
  for (const [userId, cohort] of firstSeen.entries()) {
    const users = cohortUsers.get(cohort) ?? new Set<string>();
    users.add(userId);
    cohortUsers.set(cohort, users);
  }

  const output = Array.from(cohortUsers.entries())
    .map(([cohort_start, users]) => {
      const periodCounts = new Map<number, Set<string>>();
      for (const userId of users) {
        for (const activityPeriod of activePeriodsByUser.get(userId) ?? []) {
          const index = periodIndex(cohort_start, activityPeriod, cohortSize);
          if (index < 0) continue;
          const retained = periodCounts.get(index) ?? new Set<string>();
          retained.add(userId);
          periodCounts.set(index, retained);
        }
      }
      const cohort_users = users.size;
      return {
        cohort_start,
        cohort_size: cohortSize,
        cohort_users,
        retention: Array.from(periodCounts.entries())
          .map(([period_index, retained]) => ({
            period_index,
            active_users: retained.size,
            retention_rate: cohort_users > 0 ? Math.round((retained.size / cohort_users) * 10000) / 100 : 0,
          }))
          .sort((a, b) => a.period_index - b.period_index),
      };
    })
    .sort((a, b) => a.cohort_start.localeCompare(b.cohort_start));

  return setCached(cacheKey, output);
}

export function analyticsErrorResponse(error: unknown): { status: number; message: string } {
  if (error instanceof AnalyticsInputError || error instanceof AnalyticsTooLargeError) {
    return { status: error.status, message: error.message };
  }
  return { status: 500, message: error instanceof Error ? error.message : "Failed to load analytics." };
}
