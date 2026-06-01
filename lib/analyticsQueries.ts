import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RAW_ROWS = 100_000;

export type AnalyticsDateInput = Date | string;
export type SessionMetricsGroupBy = "none" | "venue" | "zip_code" | "city" | "state_code" | "region_key";
export type AdPerformanceGroupBy = "venue" | "zip_code" | "city" | "state_code" | "region_key" | "region";

export type ActiveUsersByGeographyRow = {
  level: "state_code" | "city" | "zip_code";
  group: string;
  active_users: number;
  total_sessions: number;
};

export type GamePopularityByRegionRow = {
  game_type: string;
  plays: number;
  avg_duration: number;
  avg_duration_minutes: number;
  total_duration_minutes: number;
  rank: number;
};

export type SessionMetricsRow = {
  group: string;
  active_users: number;
  total_sessions: number;
  avg_duration: number;
  avg_duration_minutes: number;
  peak_hours: Array<{ hour: number; sessions: number }>;
};

export type CohortRetentionCurve = {
  cohort_week_start: string;
  cohort_size: number;
  retention: Array<{
    week_number: number;
    active_users: number;
    retention_rate: number;
  }>;
};

export type AdPerformanceByLocationRow = {
  group: string;
  impressions: number;
  clicks: number;
  ctr: number;
  trend: Array<{
    date: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
};

export type GeographicHierarchyNode = {
  key: string;
  label: string;
  level: "region" | "state" | "city" | "zip" | "venue";
  metrics?: {
    active_users: number;
    total_sessions: number;
    total_game_sessions: number;
    total_ad_clicks: number;
    total_duration_minutes: number;
  };
  children: GeographicHierarchyNode[];
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type VenueRow = {
  id: string;
  name: string | null;
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
};

type AdInteractionRow = {
  user_id: string | null;
  venue_id: string;
  interaction_type: string;
  interaction_at: string;
};

type DailyGeoRollupRow = {
  venue_id: string;
  activity_date: string;
  dimension_level: string;
  dimension_key: string;
  dimension_label: string | null;
  game_type: string | null;
  unique_users: number;
  site_sessions: number;
  game_sessions: number;
  ad_views: number;
  ad_clicks: number;
  site_duration_ms: number;
  game_duration_ms: number;
};

type CohortRollupRow = {
  user_id: string;
  activity_date: string;
  cohort_date: string;
};

type DateRange = {
  start: Date;
  end: Date;
};

const cache = new Map<string, CacheEntry<unknown>>();

function assertConfigured() {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }
}

function cached<T>(key: string, producer: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return Promise.resolve(entry.value as T);
  }

  return producer().then((value) => {
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  });
}

function parseDate(value: AnalyticsDateInput | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function dateRange(startDate?: AnalyticsDateInput, endDate?: AnalyticsDateInput): DateRange {
  const end = parseDate(endDate, new Date());
  const start = parseDate(startDate, new Date(end.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000));
  if (start >= end) {
    throw new Error("startDate must be before endDate.");
  }
  return { start, end };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toIso(value: Date): string {
  return value.toISOString();
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
}

function normalizeState(value: string | null | undefined): string {
  return normalizeText(value).toUpperCase();
}

function minutes(ms: number): number {
  return Math.round((ms / 60000) * 100) / 100;
}

function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
}

function assertRawLimit<T>(rows: T[]): T[] {
  if (rows.length > MAX_RAW_ROWS) {
    throw new Error(`Analytics query matched more than ${MAX_RAW_ROWS} raw rows. Narrow the date range or venue filter.`);
  }
  return rows;
}

function venueLabel(venue: VenueRow | undefined, venueId: string): string {
  return venue?.display_name || venue?.name || venueId;
}

async function fetchVenues(venueIds?: string[]): Promise<Map<string, VenueRow>> {
  assertConfigured();
  let query = supabaseAdmin!
    .from("venues")
    .select("id, name, display_name, zip_code, city, state, region, country");

  if (venueIds && venueIds.length > 0) {
    query = query.in("id", venueIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as VenueRow[]).map((venue) => [venue.id, venue]));
}

async function fetchUserGeo(userIds: string[]): Promise<Map<string, UserGeoRow>> {
  assertConfigured();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const rows = new Map<string, UserGeoRow>();

  for (let index = 0; index < uniqueIds.length; index += 500) {
    const chunk = uniqueIds.slice(index, index + 500);
    const { data, error } = await supabaseAdmin!
      .from("user_geographic_data")
      .select("user_id, zip_code, city, state_code, region_key, country")
      .in("user_id", chunk);

    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as UserGeoRow[]) {
      rows.set(row.user_id, row);
    }
  }

  return rows;
}

function locationValue(params: {
  groupBy: Exclude<SessionMetricsGroupBy, "none">;
  userId?: string | null;
  venueId: string;
  venues: Map<string, VenueRow>;
  geoByUserId: Map<string, UserGeoRow>;
}): string {
  if (params.groupBy === "venue") {
    return venueLabel(params.venues.get(params.venueId), params.venueId);
  }

  const venue = params.venues.get(params.venueId);
  const geo = params.userId ? params.geoByUserId.get(params.userId) : undefined;
  const value =
    params.groupBy === "zip_code"
      ? geo?.zip_code || venue?.zip_code
      : params.groupBy === "city"
        ? geo?.city || venue?.city
        : params.groupBy === "state_code"
          ? geo?.state_code || venue?.state
          : geo?.region_key || venue?.region;

  const normalized = normalizeText(value);
  return normalized || "Unknown";
}

function normalizeAdGroupBy(groupBy: AdPerformanceGroupBy): Exclude<SessionMetricsGroupBy, "none"> {
  return groupBy === "region" ? "region_key" : groupBy;
}

async function fetchRawUserSessions(range: DateRange, venueIds?: string[]): Promise<UserSessionRow[]> {
  assertConfigured();
  let query = supabaseAdmin!
    .from("user_sessions")
    .select("user_id, venue_id, session_start_at, duration_ms")
    .gte("session_start_at", toIso(range.start))
    .lt("session_start_at", toIso(range.end))
    .limit(MAX_RAW_ROWS + 1);

  if (venueIds && venueIds.length > 0) {
    query = query.in("venue_id", venueIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return assertRawLimit((data ?? []) as UserSessionRow[]);
}

async function fetchDailyGeoRollups(range: DateRange): Promise<DailyGeoRollupRow[]> {
  assertConfigured();
  const { data, error } = await supabaseAdmin!
    .from("analytics_daily_geographic_rollups_history")
    .select(
      "venue_id, activity_date, dimension_level, dimension_key, dimension_label, game_type, unique_users, site_sessions, game_sessions, ad_views, ad_clicks, site_duration_ms, game_duration_ms"
    )
    .gte("activity_date", isoDate(range.start))
    .lt("activity_date", isoDate(range.end))
    .limit(MAX_RAW_ROWS + 1);

  if (error) {
    return [];
  }

  return assertRawLimit((data ?? []) as DailyGeoRollupRow[]);
}

export async function getActiveUsersByGeography(
  state?: string | null,
  city?: string | null,
  zip?: string | null,
  startDate?: AnalyticsDateInput,
  endDate?: AnalyticsDateInput
): Promise<ActiveUsersByGeographyRow[]> {
  const range = dateRange(startDate, endDate);
  const cacheKey = JSON.stringify(["active-users-by-geography", state, city, zip, toIso(range.start), toIso(range.end)]);

  return cached(cacheKey, async () => {
    const rows = await fetchRawUserSessions(range);
    const venues = await fetchVenues();
    const geoByUserId = await fetchUserGeo(rows.map((row) => row.user_id));
    const stateFilter = normalizeState(state);
    const cityFilter = normalizeKey(city);
    const zipFilter = normalizeText(zip);
    const groupLevel: ActiveUsersByGeographyRow["level"] = zipFilter ? "zip_code" : cityFilter ? "zip_code" : stateFilter ? "city" : "state_code";
    const buckets = new Map<string, { users: Set<string>; sessions: number }>();

    for (const row of rows) {
      const venue = venues.get(row.venue_id);
      const geo = geoByUserId.get(row.user_id);
      const rowState = normalizeState(geo?.state_code || venue?.state);
      const rowCity = normalizeKey(geo?.city || venue?.city);
      const rowZip = normalizeText(geo?.zip_code || venue?.zip_code);

      if (stateFilter && rowState !== stateFilter) continue;
      if (cityFilter && rowCity !== cityFilter) continue;
      if (zipFilter && rowZip !== zipFilter) continue;

      const group =
        groupLevel === "zip_code"
          ? rowZip || "Unknown"
          : groupLevel === "city"
            ? normalizeText(geo?.city || venue?.city) || "Unknown"
            : rowState || "Unknown";
      const bucket = buckets.get(group) ?? { users: new Set<string>(), sessions: 0 };
      bucket.users.add(row.user_id);
      bucket.sessions += 1;
      buckets.set(group, bucket);
    }

    return Array.from(buckets.entries())
      .map(([group, bucket]) => ({
        level: groupLevel,
        group,
        active_users: bucket.users.size,
        total_sessions: bucket.sessions,
      }))
      .sort((a, b) => b.active_users - a.active_users || b.total_sessions - a.total_sessions || a.group.localeCompare(b.group));
  });
}

export async function getGamePopularityByRegion(
  regionKey: string,
  startDate?: AnalyticsDateInput,
  endDate?: AnalyticsDateInput
): Promise<GamePopularityByRegionRow[]> {
  const range = dateRange(startDate, endDate);
  const normalizedRegion = normalizeKey(regionKey);
  const cacheKey = JSON.stringify(["game-popularity-by-region", normalizedRegion, toIso(range.start), toIso(range.end)]);

  return cached(cacheKey, async () => {
    const rollups = await fetchDailyGeoRollups(range);
    const fromRollups = rollups.filter(
      (row) => row.dimension_level === "region" && normalizeKey(row.dimension_key) === normalizedRegion && row.game_type
    );

    if (fromRollups.length > 0) {
      const games = new Map<string, { plays: number; durationMs: number }>();
      for (const row of fromRollups) {
        const gameType = row.game_type || "unknown";
        const game = games.get(gameType) ?? { plays: 0, durationMs: 0 };
        game.plays += Number(row.game_sessions ?? 0);
        game.durationMs += Number(row.game_duration_ms ?? 0);
        games.set(gameType, game);
      }
      return rankGamePopularity(games);
    }

    assertConfigured();
    const { data, error } = await supabaseAdmin!
      .from("game_sessions")
      .select("user_id, venue_id, game_type, game_start_at, duration_ms")
      .gte("game_start_at", toIso(range.start))
      .lt("game_start_at", toIso(range.end))
      .limit(MAX_RAW_ROWS + 1);

    if (error) throw new Error(error.message);
    const rows = assertRawLimit((data ?? []) as GameSessionRow[]);
    const venues = await fetchVenues();
    const geoByUserId = await fetchUserGeo(rows.map((row) => row.user_id));
    const games = new Map<string, { plays: number; durationMs: number }>();

    for (const row of rows) {
      const venue = venues.get(row.venue_id);
      const geo = geoByUserId.get(row.user_id);
      if (normalizeKey(geo?.region_key || venue?.region) !== normalizedRegion) continue;
      const game = games.get(row.game_type) ?? { plays: 0, durationMs: 0 };
      game.plays += 1;
      game.durationMs += Number(row.duration_ms ?? 0);
      games.set(row.game_type, game);
    }

    return rankGamePopularity(games);
  });
}

function rankGamePopularity(games: Map<string, { plays: number; durationMs: number }>): GamePopularityByRegionRow[] {
  return Array.from(games.entries())
    .map(([gameType, game]) => {
      const avgDuration = game.plays > 0 ? minutes(game.durationMs / game.plays) : 0;
      return {
        game_type: gameType,
        plays: game.plays,
        avg_duration: avgDuration,
        avg_duration_minutes: avgDuration,
        total_duration_minutes: minutes(game.durationMs),
        rank: 0,
      };
    })
    .sort((a, b) => b.plays - a.plays || a.game_type.localeCompare(b.game_type))
    .map((game, index) => ({ ...game, rank: index + 1 }));
}

export async function getSessionMetrics(
  venueIds: string[] = [],
  groupBy: SessionMetricsGroupBy = "none",
  startDate?: AnalyticsDateInput,
  endDate?: AnalyticsDateInput
): Promise<SessionMetricsRow[]> {
  const range = dateRange(startDate, endDate);
  const normalizedVenueIds = Array.from(new Set(venueIds.map((id) => id.trim()).filter(Boolean)));
  const cacheKey = JSON.stringify(["session-metrics", normalizedVenueIds, groupBy, toIso(range.start), toIso(range.end)]);

  return cached(cacheKey, async () => {
    const rows = await fetchRawUserSessions(range, normalizedVenueIds);
    const venues = await fetchVenues(normalizedVenueIds);
    const geoByUserId = groupBy === "none" ? new Map<string, UserGeoRow>() : await fetchUserGeo(rows.map((row) => row.user_id));
    const buckets = new Map<string, { users: Set<string>; sessions: number; durationMs: number; hours: Map<number, number> }>();

    for (const row of rows) {
      const group =
        groupBy === "none"
          ? "All Users"
          : locationValue({ groupBy, userId: row.user_id, venueId: row.venue_id, venues, geoByUserId });
      const bucket = buckets.get(group) ?? { users: new Set<string>(), sessions: 0, durationMs: 0, hours: new Map<number, number>() };
      const hour = new Date(row.session_start_at).getUTCHours();
      bucket.users.add(row.user_id);
      bucket.sessions += 1;
      bucket.durationMs += Number(row.duration_ms ?? 0);
      bucket.hours.set(hour, (bucket.hours.get(hour) ?? 0) + 1);
      buckets.set(group, bucket);
    }

    return Array.from(buckets.entries())
      .map(([group, bucket]) => {
        const avgDuration = bucket.sessions > 0 ? minutes(bucket.durationMs / bucket.sessions) : 0;
        return {
          group,
          active_users: bucket.users.size,
          total_sessions: bucket.sessions,
          avg_duration: avgDuration,
          avg_duration_minutes: avgDuration,
          peak_hours: Array.from(bucket.hours.entries())
            .map(([hour, sessions]) => ({ hour, sessions }))
            .sort((a, b) => b.sessions - a.sessions || a.hour - b.hour)
            .slice(0, 6),
        };
      })
      .sort((a, b) => b.active_users - a.active_users || b.total_sessions - a.total_sessions || a.group.localeCompare(b.group));
  });
}

export async function getUserCohortRetention(cohortWeekStart: AnalyticsDateInput): Promise<CohortRetentionCurve> {
  const start = parseDate(cohortWeekStart, new Date());
  const weekStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const weekEnd = addDays(weekStart, 7);
  const cacheKey = JSON.stringify(["user-cohort-retention", isoDate(weekStart)]);

  return cached(cacheKey, async () => {
    assertConfigured();
    const { data, error } = await supabaseAdmin!
      .from("analytics_venue_user_daily_cohorts_history")
      .select("user_id, activity_date, cohort_date")
      .gte("cohort_date", isoDate(weekStart))
      .lt("cohort_date", isoDate(weekEnd))
      .limit(MAX_RAW_ROWS + 1);

    if (error) throw new Error(error.message);
    const rows = assertRawLimit((data ?? []) as CohortRollupRow[]);
    const cohortUsers = new Set(rows.map((row) => row.user_id));
    const weeklyUsers = new Map<number, Set<string>>();

    for (const row of rows) {
      const activityDate = new Date(`${row.activity_date}T00:00:00.000Z`);
      const weekNumber = Math.max(0, Math.floor((activityDate.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)));
      const users = weeklyUsers.get(weekNumber) ?? new Set<string>();
      users.add(row.user_id);
      weeklyUsers.set(weekNumber, users);
    }

    return {
      cohort_week_start: isoDate(weekStart),
      cohort_size: cohortUsers.size,
      retention: Array.from(weeklyUsers.entries())
        .map(([weekNumber, users]) => ({
          week_number: weekNumber,
          active_users: users.size,
          retention_rate: percent(users.size, cohortUsers.size),
        }))
        .sort((a, b) => a.week_number - b.week_number),
    };
  });
}

export async function getAdPerformanceByLocation(
  adId?: string | null,
  groupBy: AdPerformanceGroupBy = "region_key",
  startDate?: AnalyticsDateInput,
  endDate?: AnalyticsDateInput
): Promise<AdPerformanceByLocationRow[]> {
  const range = dateRange(startDate, endDate);
  const normalizedGroupBy = normalizeAdGroupBy(groupBy);
  const normalizedAdId = normalizeText(adId);
  const cacheKey = JSON.stringify(["ad-performance-by-location", normalizedAdId, normalizedGroupBy, toIso(range.start), toIso(range.end)]);

  return cached(cacheKey, async () => {
    assertConfigured();
    let query = supabaseAdmin!
      .from("ad_interactions")
      .select("user_id, venue_id, interaction_type, interaction_at")
      .gte("interaction_at", toIso(range.start))
      .lt("interaction_at", toIso(range.end))
      .limit(MAX_RAW_ROWS + 1);

    if (normalizedAdId) {
      query = query.eq("ad_id", normalizedAdId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = assertRawLimit((data ?? []) as AdInteractionRow[]);
    const venues = await fetchVenues();
    const geoByUserId = await fetchUserGeo(rows.map((row) => row.user_id ?? ""));
    const buckets = new Map<string, { impressions: number; clicks: number; trend: Map<string, { impressions: number; clicks: number }> }>();

    for (const row of rows) {
      const group = locationValue({ groupBy: normalizedGroupBy, userId: row.user_id, venueId: row.venue_id, venues, geoByUserId });
      const bucket = buckets.get(group) ?? { impressions: 0, clicks: 0, trend: new Map<string, { impressions: number; clicks: number }>() };
      const day = row.interaction_at.slice(0, 10);
      const trend = bucket.trend.get(day) ?? { impressions: 0, clicks: 0 };

      if (row.interaction_type === "view") {
        bucket.impressions += 1;
        trend.impressions += 1;
      }
      if (row.interaction_type === "click" || row.interaction_type === "convert") {
        bucket.clicks += 1;
        trend.clicks += 1;
      }

      bucket.trend.set(day, trend);
      buckets.set(group, bucket);
    }

    return Array.from(buckets.entries())
      .map(([group, bucket]) => ({
        group,
        impressions: bucket.impressions,
        clicks: bucket.clicks,
        ctr: percent(bucket.clicks, bucket.impressions),
        trend: Array.from(bucket.trend.entries())
          .map(([date, item]) => ({
            date,
            impressions: item.impressions,
            clicks: item.clicks,
            ctr: percent(item.clicks, item.impressions),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.group.localeCompare(b.group));
  });
}

export async function getGeographicHierarchy(
  withActivityMetrics = false,
  startDate?: AnalyticsDateInput,
  endDate?: AnalyticsDateInput
): Promise<GeographicHierarchyNode[]> {
  const range = dateRange(startDate, endDate);
  const cacheKey = JSON.stringify(["geographic-hierarchy", withActivityMetrics, toIso(range.start), toIso(range.end)]);

  return cached(cacheKey, async () => {
    const venues = await fetchVenues();
    const metricsByVenue = withActivityMetrics ? await fetchVenueMetrics(range) : new Map<string, GeographicHierarchyNode["metrics"]>();
    const root = new Map<string, GeographicHierarchyNode>();

    for (const venue of venues.values()) {
      const region = normalizeText(venue.region) || "Unknown";
      const state = normalizeState(venue.state) || "Unknown";
      const city = normalizeText(venue.city) || "Unknown";
      const zip = normalizeText(venue.zip_code) || "Unknown";
      const venueName = venueLabel(venue, venue.id);

      const regionNode = getOrCreateNode(root, normalizeKey(region) || "unknown", region, "region", withActivityMetrics);
      const stateNode = getOrCreateChild(regionNode, state, state, "state", withActivityMetrics);
      const cityNode = getOrCreateChild(stateNode, normalizeKey(city) || "unknown", city, "city", withActivityMetrics);
      const zipNode = getOrCreateChild(cityNode, zip, zip, "zip", withActivityMetrics);
      const venueNode = getOrCreateChild(zipNode, venue.id, venueName, "venue", withActivityMetrics);

      if (withActivityMetrics) {
        addMetrics(venueNode, metricsByVenue.get(venue.id));
        addMetrics(zipNode, metricsByVenue.get(venue.id));
        addMetrics(cityNode, metricsByVenue.get(venue.id));
        addMetrics(stateNode, metricsByVenue.get(venue.id));
        addMetrics(regionNode, metricsByVenue.get(venue.id));
      }
    }

    return sortHierarchy(Array.from(root.values()));
  });
}

async function fetchVenueMetrics(range: DateRange): Promise<Map<string, GeographicHierarchyNode["metrics"]>> {
  const rollups = await fetchDailyGeoRollups(range);
  const metrics = new Map<string, NonNullable<GeographicHierarchyNode["metrics"]> & { durationMs: number }>();

  for (const row of rollups) {
    if (row.dimension_level !== "venue") continue;
    const existing =
      metrics.get(row.venue_id) ?? {
        active_users: 0,
        total_sessions: 0,
        total_game_sessions: 0,
        total_ad_clicks: 0,
        total_duration_minutes: 0,
        durationMs: 0,
      };
    if (row.game_type) {
      existing.total_game_sessions += Number(row.game_sessions ?? 0);
      existing.durationMs += Number(row.game_duration_ms ?? 0);
    } else {
      existing.active_users += Number(row.unique_users ?? 0);
      existing.total_sessions += Number(row.site_sessions ?? 0);
      existing.total_ad_clicks += Number(row.ad_clicks ?? 0);
      existing.durationMs += Number(row.site_duration_ms ?? 0);
    }
    existing.total_duration_minutes = minutes(existing.durationMs);
    metrics.set(row.venue_id, existing);
  }

  return new Map(
    Array.from(metrics.entries()).map(([venueId, metric]) => [
      venueId,
      {
        active_users: metric.active_users,
        total_sessions: metric.total_sessions,
        total_game_sessions: metric.total_game_sessions,
        total_ad_clicks: metric.total_ad_clicks,
        total_duration_minutes: metric.total_duration_minutes,
      },
    ])
  );
}

function getOrCreateNode(
  nodes: Map<string, GeographicHierarchyNode>,
  key: string,
  label: string,
  level: GeographicHierarchyNode["level"],
  withMetrics: boolean
): GeographicHierarchyNode {
  const existing = nodes.get(key);
  if (existing) return existing;

  const node: GeographicHierarchyNode = {
    key,
    label,
    level,
    ...(withMetrics
      ? {
          metrics: {
            active_users: 0,
            total_sessions: 0,
            total_game_sessions: 0,
            total_ad_clicks: 0,
            total_duration_minutes: 0,
          },
        }
      : {}),
    children: [],
  };
  nodes.set(key, node);
  return node;
}

function getOrCreateChild(
  parent: GeographicHierarchyNode,
  key: string,
  label: string,
  level: GeographicHierarchyNode["level"],
  withMetrics: boolean
): GeographicHierarchyNode {
  const existing = parent.children.find((child) => child.level === level && child.key === key);
  if (existing) return existing;
  const child = getOrCreateNode(new Map<string, GeographicHierarchyNode>(), key, label, level, withMetrics);
  parent.children.push(child);
  return child;
}

function addMetrics(target: GeographicHierarchyNode, source: GeographicHierarchyNode["metrics"]) {
  if (!target.metrics || !source) return;
  target.metrics.active_users += source.active_users;
  target.metrics.total_sessions += source.total_sessions;
  target.metrics.total_game_sessions += source.total_game_sessions;
  target.metrics.total_ad_clicks += source.total_ad_clicks;
  target.metrics.total_duration_minutes = minutes(target.metrics.total_duration_minutes * 60000 + source.total_duration_minutes * 60000);
}

function sortHierarchy(nodes: GeographicHierarchyNode[]): GeographicHierarchyNode[] {
  return nodes
    .map((node) => ({ ...node, children: sortHierarchy(node.children) }))
    .sort((a, b) => {
      const activityDelta = (b.metrics?.total_sessions ?? 0) - (a.metrics?.total_sessions ?? 0);
      return activityDelta || a.label.localeCompare(b.label);
    });
}
