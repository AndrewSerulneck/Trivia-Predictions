import "server-only";

import { NextResponse } from "next/server";
import {
  calculateDistanceMeters,
  isValidGeofenceCoordinates,
  type GeofenceCoordinates,
} from "@/lib/geofence";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Server-side presence lease lifetime. Must stay in sync with the client
// re-check cadence (PRESENCE_CHECK_INTERVAL_MS in
// components/venue/VenuePresenceBoundary.tsx). Raised from 3 min to 15 min to
// cut battery/permission churn; see the TRADEOFF note there — a departed user
// keeps access for up to one TTL. Lower both together to tighten enforcement.
export const VENUE_PRESENCE_TTL_MS = 15 * 60 * 1000;
export const VENUE_PRESENCE_FALSE_POSITIVE_WINDOW_MS = 5 * 60 * 1000;

// God Mode accounts (Andrew, Marc — `accounts.god_mode`) may access any venue from
// anywhere on Earth, so they bypass all presence/geofence checks. The presence system
// keys on `users.id`, but god mode lives on `accounts.god_mode` (keyed by `account_id`),
// so this must join users -> accounts. A user with a null/missing `account_id` (legacy
// rows) fails closed to NOT god mode. This is server-authoritative: the client
// `getGodMode()` localStorage flag is a UX hint only and is never trusted for enforcement.
const GOD_MODE_CACHE_TTL_MS = 60 * 1000;
const godModeCache = new Map<string, { value: boolean; expiresAt: number }>();

export async function isGodModeUser(userId: string): Promise<boolean> {
  const normalizedUserId = userId.trim();
  if (!supabaseAdmin || !normalizedUserId) return false;

  const cached = godModeCache.get(normalizedUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value = false;
  try {
    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("account_id")
      .eq("id", normalizedUserId)
      .maybeSingle<{ account_id: string | null }>();

    const accountId = String(userRow?.account_id ?? "").trim();
    if (!userError && accountId) {
      const { data: accountRow, error: accountError } = await supabaseAdmin
        .from("accounts")
        .select("god_mode")
        .eq("id", accountId)
        .maybeSingle<{ god_mode: boolean | null }>();
      if (!accountError) {
        value = Boolean(accountRow?.god_mode);
      }
    }
  } catch {
    // Fail closed: if the god-mode lookup errors, treat the user as a normal
    // account so geofencing/presence enforcement still applies. God accounts are a
    // small allowlist; a transient miss recovers on the next (cached) check.
    value = false;
  }

  godModeCache.set(normalizedUserId, { value, expiresAt: Date.now() + GOD_MODE_CACHE_TTL_MS });
  return value;
}

export type VenuePresenceCode =
  | "AUTH_REQUIRED"
  | "VENUE_PRESENCE_REQUIRED"
  | "VENUE_PRESENCE_EXPIRED"
  | "VENUE_OUT_OF_RANGE"
  | "VENUE_LOCATION_UNAVAILABLE"
  | "VENUE_PROFILE_MISMATCH"
  | "VENUE_PRESENCE_UNAVAILABLE";

export type VenuePresenceStatus =
  | "active"
  | "out_of_range"
  | "location_unavailable"
  | "expired"
  | "revoked";

type VenuePresenceRow = {
  id: string;
  user_id: string;
  venue_id: string;
  status: VenuePresenceStatus;
  expires_at: string;
  last_verified_at: string | null;
  last_distance_meters: number | null;
  last_accuracy_meters: number | null;
};

type VenueGeofenceRow = {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
};

type VenuePresenceTelemetryEventType =
  | "verified"
  | "out_of_range"
  | "location_unavailable"
  | "expired"
  | "required"
  | "profile_mismatch"
  | "unavailable";

export type VenuePresenceTuningConfig = {
  ttlMs: number;
  minRadiusMeters: number;
  accuracyBufferMinMeters: number;
  accuracyBufferDefaultMeters: number;
  accuracyBufferMaxMeters: number;
  accuracyMultiplier: number;
  falsePositiveWindowMs: number;
};

export type VenuePresenceSuccess = {
  ok: true;
  status: "active";
  expiresAt: string;
  lastVerifiedAt: string;
  distanceMeters?: number;
  allowedDistanceMeters?: number;
  accuracyMeters?: number;
};

export type VenuePresenceFailure = {
  ok: false;
  code: VenuePresenceCode;
  status: Exclude<VenuePresenceStatus, "active"> | "missing";
  httpStatus: number;
  userMessage: string;
  expiresAt?: string;
  distanceMeters?: number;
  allowedDistanceMeters?: number;
  accuracyMeters?: number;
};

export type VenuePresenceResult = VenuePresenceSuccess | VenuePresenceFailure;

export class VenuePresenceError extends Error {
  code: VenuePresenceCode;
  httpStatus: number;
  userMessage: string;

  constructor(result: VenuePresenceFailure) {
    super(result.userMessage);
    this.name = "VenuePresenceError";
    this.code = result.code;
    this.httpStatus = result.httpStatus;
    this.userMessage = result.userMessage;
  }
}

function normalizeBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function isVenuePresenceMutationEnforcementEnabled(): boolean {
  return normalizeBooleanEnv(process.env.VENUE_PRESENCE_ENFORCEMENT, false);
}

function normalizeNumberEnv(value: string | undefined, fallback: number, bounds: { min: number; max: number }): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}

function normalizeIntegerEnv(value: string | undefined, fallback: number, bounds: { min: number; max: number }): number {
  return Math.round(normalizeNumberEnv(value, fallback, bounds));
}

export function getVenuePresenceTuningConfig(): VenuePresenceTuningConfig {
  return {
    ttlMs: normalizeIntegerEnv(process.env.VENUE_PRESENCE_TTL_MS, VENUE_PRESENCE_TTL_MS, {
      min: 30_000,
      max: 15 * 60 * 1000,
    }),
    minRadiusMeters: normalizeIntegerEnv(process.env.VENUE_PRESENCE_MIN_RADIUS_METERS, 300, {
      min: 100,
      max: 2_000,
    }),
    accuracyBufferMinMeters: normalizeIntegerEnv(process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MIN_METERS, 120, {
      min: 0,
      max: 2_000,
    }),
    accuracyBufferDefaultMeters: normalizeIntegerEnv(process.env.VENUE_PRESENCE_ACCURACY_BUFFER_DEFAULT_METERS, 320, {
      min: 0,
      max: 5_000,
    }),
    accuracyBufferMaxMeters: normalizeIntegerEnv(process.env.VENUE_PRESENCE_ACCURACY_BUFFER_MAX_METERS, 5_000, {
      min: 500,
      max: 20_000,
    }),
    accuracyMultiplier: normalizeNumberEnv(process.env.VENUE_PRESENCE_ACCURACY_MULTIPLIER, 1.5, {
      min: 0,
      max: 5,
    }),
    falsePositiveWindowMs: normalizeIntegerEnv(
      process.env.VENUE_PRESENCE_FALSE_POSITIVE_WINDOW_MS,
      VENUE_PRESENCE_FALSE_POSITIVE_WINDOW_MS,
      {
        min: 60_000,
        max: 30 * 60 * 1000,
      }
    ),
  };
}

export function getVenuePresenceTtlMs(): number {
  return getVenuePresenceTuningConfig().ttlMs;
}

export function getVenuePresenceThresholdMeters(venueRadius: number, accuracy?: number): number {
  const config = getVenuePresenceTuningConfig();
  const normalizedVenueRadius = Number.isFinite(venueRadius) ? Math.max(0, Math.round(venueRadius)) : 0;
  const baseRadius = Math.max(config.minRadiusMeters, normalizedVenueRadius);
  const accuracyBuffer = Number.isFinite(accuracy)
    ? Math.min(
        config.accuracyBufferMaxMeters,
        Math.max(config.accuracyBufferMinMeters, Math.round(Number(accuracy) * config.accuracyMultiplier))
      )
    : config.accuracyBufferDefaultMeters;
  return baseRadius + accuracyBuffer;
}

const USER_MESSAGE_BY_CODE: Record<VenuePresenceCode, string> = {
  AUTH_REQUIRED: "Please sign in again to continue playing.",
  VENUE_PRESENCE_REQUIRED: "Return to the venue to keep playing.",
  VENUE_PRESENCE_EXPIRED: "Return to the venue to keep playing.",
  VENUE_OUT_OF_RANGE:
    "Your game access has been paused because you're no longer within range of this partner venue. Return to the venue to keep playing.",
  VENUE_LOCATION_UNAVAILABLE:
    "We need to confirm you're still at the venue. Turn on location access and recheck to keep playing.",
  VENUE_PROFILE_MISMATCH: "Please re-enter from the venue to continue playing.",
  VENUE_PRESENCE_UNAVAILABLE: "We could not confirm venue access. Please recheck your location to keep playing.",
};

function failure(params: {
  code: VenuePresenceCode;
  status: VenuePresenceFailure["status"];
  httpStatus?: number;
  expiresAt?: string;
  distanceMeters?: number;
  allowedDistanceMeters?: number;
  accuracyMeters?: number;
}): VenuePresenceFailure {
  return {
    ok: false,
    code: params.code,
    status: params.status,
    httpStatus: params.httpStatus ?? 403,
    userMessage: USER_MESSAGE_BY_CODE[params.code],
    expiresAt: params.expiresAt,
    distanceMeters: params.distanceMeters,
    allowedDistanceMeters: params.allowedDistanceMeters,
    accuracyMeters: params.accuracyMeters,
  };
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function normalizeInteger(value: unknown): number | null {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function telemetryEventTypeForCode(code: VenuePresenceCode): VenuePresenceTelemetryEventType {
  if (code === "VENUE_OUT_OF_RANGE") return "out_of_range";
  if (code === "VENUE_LOCATION_UNAVAILABLE") return "location_unavailable";
  if (code === "VENUE_PRESENCE_EXPIRED") return "expired";
  if (code === "VENUE_PROFILE_MISMATCH") return "profile_mismatch";
  if (code === "VENUE_PRESENCE_UNAVAILABLE") return "unavailable";
  return "required";
}

async function recordVenuePresenceTelemetry(params: {
  userId: string;
  venueId: string;
  eventType: VenuePresenceTelemetryEventType;
  source: "join" | "heartbeat" | "server";
  code?: VenuePresenceCode;
  status: VenuePresenceFailure["status"] | "active";
  expiresAt?: string;
  distanceMeters?: number | null;
  allowedDistanceMeters?: number | null;
  accuracyMeters?: number | null;
}): Promise<void> {
  if (!supabaseAdmin) return;
  const venueId = params.venueId.trim();
  if (!venueId) return;

  try {
    const { error } = await supabaseAdmin.from("venue_presence_events").insert({
      user_id: isUuid(params.userId.trim()) ? params.userId.trim() : null,
      venue_id: venueId,
      event_type: params.eventType,
      presence_code: params.code ?? null,
      status: params.status,
      source: params.source,
      expires_at: params.expiresAt ?? null,
      distance_meters: normalizeInteger(params.distanceMeters),
      allowed_distance_meters: normalizeInteger(params.allowedDistanceMeters),
      accuracy_meters: normalizeInteger(params.accuracyMeters),
      lease_ttl_ms: getVenuePresenceTtlMs(),
    });
    if (error) {
      console.warn("[venue-presence] telemetry write failed", error.message);
    }
  } catch {
    // Telemetry is production-hardening only. It must never block gameplay,
    // joins, or location recovery if the migration is not present yet.
  }
}

async function recordVenuePresenceFailureTelemetry(params: {
  userId: string;
  venueId: string;
  source: "join" | "heartbeat" | "server";
  failure: VenuePresenceFailure;
}): Promise<void> {
  await recordVenuePresenceTelemetry({
    userId: params.userId,
    venueId: params.venueId,
    source: params.source,
    eventType: telemetryEventTypeForCode(params.failure.code),
    code: params.failure.code,
    status: params.failure.status,
    expiresAt: params.failure.expiresAt,
    distanceMeters: params.failure.distanceMeters,
    allowedDistanceMeters: params.failure.allowedDistanceMeters,
    accuracyMeters: params.failure.accuracyMeters,
  });
}

async function getVenueGeofenceRow(venueId: string): Promise<VenueGeofenceRow | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, latitude, longitude, radius")
    .eq("id", venueId)
    .maybeSingle<VenueGeofenceRow>();

  if (error || !data) return null;
  return {
    id: String(data.id),
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    radius: Number(data.radius),
  };
}

async function userBelongsToVenue(userId: string, venueId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("venue_id", venueId)
    .maybeSingle<{ id: string }>();
  return Boolean(!error && data?.id);
}

export async function getVenueIdForUser(userId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("venue_id")
    .eq("id", normalizedUserId)
    .maybeSingle<{ venue_id: string }>();

  if (error) return null;
  const venueId = String(data?.venue_id ?? "").trim();
  return venueId || null;
}

async function upsertPresence(params: {
  userId: string;
  venueId: string;
  status: VenuePresenceStatus;
  expiresAt: string;
  lastVerifiedAt?: string | null;
  distanceMeters?: number | null;
  accuracyMeters?: number | null;
  source: "join" | "heartbeat" | "server";
}): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("venue_presence_sessions").upsert(
      {
        user_id: params.userId,
        venue_id: params.venueId,
        status: params.status,
        expires_at: params.expiresAt,
        last_verified_at: params.lastVerifiedAt ?? null,
        last_distance_meters: normalizeInteger(params.distanceMeters),
        last_accuracy_meters: normalizeInteger(params.accuracyMeters),
        source: params.source,
      },
      { onConflict: "user_id,venue_id" }
    );
  } catch {
    // Presence writes are rollout-safe: join must not fail because the lease
    // table has not been migrated yet or a test double does not include it.
  }
}

export async function recordVerifiedVenuePresence(params: {
  userId: string;
  venueId: string;
  source?: "join" | "heartbeat" | "server";
  ttlMs?: number;
  distanceMeters?: number | null;
  allowedDistanceMeters?: number | null;
  accuracyMeters?: number | null;
}): Promise<VenuePresenceSuccess | null> {
  if (!supabaseAdmin) return null;
  const now = Date.now();
  const lastVerifiedAt = toIso(now);
  const expiresAt = toIso(now + Math.max(30_000, params.ttlMs ?? getVenuePresenceTtlMs()));

  await upsertPresence({
    userId: params.userId,
    venueId: params.venueId,
    status: "active",
    expiresAt,
    lastVerifiedAt,
    distanceMeters: params.distanceMeters,
    accuracyMeters: params.accuracyMeters,
    source: params.source ?? "server",
  });

  await recordVenuePresenceTelemetry({
    userId: params.userId,
    venueId: params.venueId,
    eventType: "verified",
    source: params.source ?? "server",
    status: "active",
    expiresAt,
    distanceMeters: params.distanceMeters,
    allowedDistanceMeters: params.allowedDistanceMeters,
    accuracyMeters: params.accuracyMeters,
  });

  return {
    ok: true,
    status: "active",
    expiresAt,
    lastVerifiedAt,
    distanceMeters: params.distanceMeters ?? undefined,
    accuracyMeters: params.accuracyMeters ?? undefined,
  };
}

export async function verifyVenuePresenceLocation(params: {
  userId: string;
  venueId: string;
  location?: GeofenceCoordinates;
  source?: "join" | "heartbeat";
  ttlMs?: number;
}): Promise<VenuePresenceResult> {
  const userId = params.userId.trim();
  const venueId = params.venueId.trim();
  const now = Date.now();
  const expiredAt = toIso(now);

  if (!supabaseAdmin || !userId || !venueId) {
    return failure({ code: "VENUE_PRESENCE_UNAVAILABLE", status: "missing", httpStatus: 503 });
  }

  // God Mode: bypass location/distance/belongs checks entirely. A god account stays
  // active from anywhere on Earth. Still write a verified lease so Partner Dashboard
  // diagnostics stay coherent. Server-authoritative — never trusts a client flag.
  if (await isGodModeUser(userId)) {
    const presence = await recordVerifiedVenuePresence({
      userId,
      venueId,
      source: params.source ?? "heartbeat",
      ttlMs: params.ttlMs,
    });
    if (presence) return presence;
    return {
      ok: true,
      status: "active",
      expiresAt: toIso(now + getVenuePresenceTtlMs()),
      lastVerifiedAt: toIso(now),
    };
  }

  if (!params.location || !isValidGeofenceCoordinates(params.location)) {
    await upsertPresence({
      userId,
      venueId,
      status: "location_unavailable",
      expiresAt: expiredAt,
      source: params.source ?? "heartbeat",
    });
    const result = failure({ code: "VENUE_LOCATION_UNAVAILABLE", status: "location_unavailable" });
    await recordVenuePresenceFailureTelemetry({
      userId,
      venueId,
      source: params.source ?? "heartbeat",
      failure: result,
    });
    return result;
  }

  const belongs = await userBelongsToVenue(userId, venueId);
  if (!belongs) {
    const result = failure({ code: "VENUE_PROFILE_MISMATCH", status: "revoked", httpStatus: 403 });
    await recordVenuePresenceFailureTelemetry({
      userId,
      venueId,
      source: params.source ?? "heartbeat",
      failure: result,
    });
    return result;
  }

  const venue = await getVenueGeofenceRow(venueId);
  if (!venue) {
    const result = failure({ code: "VENUE_PRESENCE_UNAVAILABLE", status: "missing", httpStatus: 503 });
    await recordVenuePresenceFailureTelemetry({
      userId,
      venueId,
      source: params.source ?? "heartbeat",
      failure: result,
    });
    return result;
  }

  const distance = calculateDistanceMeters(params.location, {
    latitude: venue.latitude,
    longitude: venue.longitude,
  });
  const allowedDistance = getVenuePresenceThresholdMeters(venue.radius, params.location.accuracy);
  const accuracyMeters = normalizeInteger(params.location.accuracy);

  if (distance > allowedDistance) {
    await upsertPresence({
      userId,
      venueId,
      status: "out_of_range",
      expiresAt: expiredAt,
      distanceMeters: distance,
      accuracyMeters,
      source: params.source ?? "heartbeat",
    });
    const result = failure({
      code: "VENUE_OUT_OF_RANGE",
      status: "out_of_range",
      distanceMeters: Math.round(distance),
      allowedDistanceMeters: Math.round(allowedDistance),
      accuracyMeters: accuracyMeters ?? undefined,
    });
    await recordVenuePresenceFailureTelemetry({
      userId,
      venueId,
      source: params.source ?? "heartbeat",
      failure: result,
    });
    return result;
  }

  const presence = await recordVerifiedVenuePresence({
    userId,
    venueId,
    source: params.source ?? "heartbeat",
    ttlMs: params.ttlMs,
    distanceMeters: distance,
    allowedDistanceMeters: allowedDistance,
    accuracyMeters,
  });
  if (!presence) {
    const result = failure({ code: "VENUE_PRESENCE_UNAVAILABLE", status: "missing", httpStatus: 503 });
    await recordVenuePresenceFailureTelemetry({
      userId,
      venueId,
      source: params.source ?? "heartbeat",
      failure: result,
    });
    return result;
  }
  return {
    ...presence,
    distanceMeters: Math.round(distance),
    allowedDistanceMeters: Math.round(allowedDistance),
    accuracyMeters: accuracyMeters ?? undefined,
  };
}

export async function getActiveVenuePresence(params: {
  userId: string;
  venueId: string;
}): Promise<VenuePresenceResult> {
  if (!supabaseAdmin) {
    return failure({ code: "VENUE_PRESENCE_UNAVAILABLE", status: "missing", httpStatus: 503 });
  }

  const userId = params.userId.trim();
  const venueId = params.venueId.trim();
  if (!userId || !venueId) {
    return failure({ code: "VENUE_PRESENCE_REQUIRED", status: "missing" });
  }

  // God Mode: mutation guards read this function. A god account must pass even with an
  // expired lease or no lease row at all (the client heartbeat loop may not be running).
  // This is the load-bearing bypass — every mutation-guarded route ultimately depends on it.
  if (await isGodModeUser(userId)) {
    const now = Date.now();
    return {
      ok: true,
      status: "active",
      expiresAt: toIso(now + getVenuePresenceTtlMs()),
      lastVerifiedAt: toIso(now),
    };
  }

  const { data, error } = await supabaseAdmin
    .from("venue_presence_sessions")
    .select("id, user_id, venue_id, status, expires_at, last_verified_at, last_distance_meters, last_accuracy_meters")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .maybeSingle<VenuePresenceRow>();

  if (error || !data) {
    return failure({ code: "VENUE_PRESENCE_REQUIRED", status: "missing" });
  }

  if (data.status !== "active") {
    const code: VenuePresenceCode =
      data.status === "out_of_range"
        ? "VENUE_OUT_OF_RANGE"
        : data.status === "location_unavailable"
          ? "VENUE_LOCATION_UNAVAILABLE"
          : "VENUE_PRESENCE_REQUIRED";
    const result = failure({
      code,
      status: data.status === "revoked" ? "revoked" : data.status,
      expiresAt: data.expires_at,
      distanceMeters: data.last_distance_meters ?? undefined,
      accuracyMeters: data.last_accuracy_meters ?? undefined,
    });
    await recordVenuePresenceFailureTelemetry({
      userId,
      venueId,
      source: "server",
      failure: result,
    });
    return result;
  }

  const expiresAtMs = Date.parse(data.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await upsertPresence({
      userId,
      venueId,
      status: "expired",
      expiresAt: data.expires_at,
      lastVerifiedAt: data.last_verified_at,
      distanceMeters: data.last_distance_meters,
      accuracyMeters: data.last_accuracy_meters,
      source: "server",
    });
    const result = failure({
      code: "VENUE_PRESENCE_EXPIRED",
      status: "expired",
      expiresAt: data.expires_at,
      distanceMeters: data.last_distance_meters ?? undefined,
      accuracyMeters: data.last_accuracy_meters ?? undefined,
    });
    await recordVenuePresenceFailureTelemetry({
      userId,
      venueId,
      source: "server",
      failure: result,
    });
    return result;
  }

  return {
    ok: true,
    status: "active",
    expiresAt: data.expires_at,
    lastVerifiedAt: data.last_verified_at ?? data.expires_at,
    distanceMeters: data.last_distance_meters ?? undefined,
    accuracyMeters: data.last_accuracy_meters ?? undefined,
  };
}

export async function requireActiveVenuePresence(params: {
  userId: string;
  venueId: string;
}): Promise<VenuePresenceSuccess> {
  const result = await getActiveVenuePresence(params);
  if (!result.ok) {
    throw new VenuePresenceError(result);
  }
  return result;
}

export async function maybeRequireActiveVenuePresence(params: {
  userId: string;
  venueId: string;
}): Promise<VenuePresenceSuccess | null> {
  if (!isVenuePresenceMutationEnforcementEnabled()) {
    return null;
  }
  return requireActiveVenuePresence(params);
}

export async function maybeRequireActiveVenuePresenceForUser(params: {
  userId: string;
}): Promise<VenuePresenceSuccess | null> {
  if (!isVenuePresenceMutationEnforcementEnabled()) {
    return null;
  }

  const venueId = await getVenueIdForUser(params.userId);
  if (!venueId) {
    throw new VenuePresenceError(
      failure({ code: "VENUE_PRESENCE_REQUIRED", status: "missing" })
    );
  }
  return requireActiveVenuePresence({ userId: params.userId, venueId });
}

export function venuePresenceResponse(result: VenuePresenceResult): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      presence: result,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      code: result.code,
      error: result.userMessage,
      userMessage: result.userMessage,
      presence: {
        status: result.status,
        expiresAt: result.expiresAt,
        distanceMeters: result.distanceMeters,
        allowedDistanceMeters: result.allowedDistanceMeters,
        accuracyMeters: result.accuracyMeters,
      },
    },
    { status: result.httpStatus }
  );
}

export function venuePresenceErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof VenuePresenceError)) {
    return null;
  }
  return NextResponse.json(
    {
      ok: false,
      code: error.code,
      error: error.userMessage,
      userMessage: error.userMessage,
    },
    { status: error.httpStatus }
  );
}
