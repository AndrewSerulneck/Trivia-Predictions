import "server-only";

import { getVenuePresenceTuningConfig } from "@/lib/venuePresence";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type VenuePresenceSessionDiagnosticRow = {
  venue_id: string;
  status: string;
  expires_at: string;
  last_verified_at: string | null;
  last_distance_meters: number | null;
  last_accuracy_meters: number | null;
};

type VenuePresenceEventDiagnosticRow = {
  venue_id: string;
  user_id: string | null;
  event_type: string;
  presence_code: string | null;
  status: string;
  source: string;
  distance_meters: number | null;
  allowed_distance_meters: number | null;
  accuracy_meters: number | null;
  created_at: string;
};

type VenuePresenceEventCounts = {
  verified: number;
  outOfRange: number;
  locationUnavailable: number;
  expired: number;
  required: number;
  profileMismatch: number;
  unavailable: number;
};

export type VenuePresenceRecentEvent = {
  at: string;
  type: string;
  code: string | null;
  status: string;
  source: string;
  distanceMeters: number | null;
  allowedDistanceMeters: number | null;
  accuracyMeters: number | null;
};

export type VenuePresenceVenueDiagnostics = {
  venueId: string;
  activeSessions: number;
  pausedSessions: number;
  expiredSessions: number;
  eventCounts: VenuePresenceEventCounts;
  quickRecoveries: number;
  quickRecoveryRate: number;
  lastEventAt: string | null;
  recentEvents: VenuePresenceRecentEvent[];
};

export type VenuePresenceDiagnostics = {
  telemetryAvailable: boolean;
  windowMinutes: number;
  falsePositiveWindowMs: number;
  tuning: ReturnType<typeof getVenuePresenceTuningConfig>;
  venues: VenuePresenceVenueDiagnostics[];
  warnings: string[];
};

const DEFAULT_DIAGNOSTICS_WINDOW_MINUTES = 60;
const RECENT_EVENTS_PER_VENUE = 10;

function configuredWindowMinutes(): number {
  const parsed = Number(process.env.VENUE_PRESENCE_DIAGNOSTICS_WINDOW_MINUTES);
  if (!Number.isFinite(parsed)) return DEFAULT_DIAGNOSTICS_WINDOW_MINUTES;
  return Math.min(24 * 60, Math.max(5, Math.round(parsed)));
}

function normalizeWindowMinutes(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return configuredWindowMinutes();
  return Math.min(24 * 60, Math.max(5, Math.round(value)));
}

function emptyCounts(): VenuePresenceEventCounts {
  return {
    verified: 0,
    outOfRange: 0,
    locationUnavailable: 0,
    expired: 0,
    required: 0,
    profileMismatch: 0,
    unavailable: 0,
  };
}

function incrementEventCount(counts: VenuePresenceEventCounts, eventType: string) {
  if (eventType === "verified") counts.verified += 1;
  else if (eventType === "out_of_range") counts.outOfRange += 1;
  else if (eventType === "location_unavailable") counts.locationUnavailable += 1;
  else if (eventType === "expired") counts.expired += 1;
  else if (eventType === "required") counts.required += 1;
  else if (eventType === "profile_mismatch") counts.profileMismatch += 1;
  else if (eventType === "unavailable") counts.unavailable += 1;
}

function eventToRecentEvent(event: VenuePresenceEventDiagnosticRow): VenuePresenceRecentEvent {
  return {
    at: event.created_at,
    type: event.event_type,
    code: event.presence_code,
    status: event.status,
    source: event.source,
    distanceMeters: event.distance_meters,
    allowedDistanceMeters: event.allowed_distance_meters,
    accuracyMeters: event.accuracy_meters,
  };
}

function createVenueSummary(venueId: string): VenuePresenceVenueDiagnostics {
  return {
    venueId,
    activeSessions: 0,
    pausedSessions: 0,
    expiredSessions: 0,
    eventCounts: emptyCounts(),
    quickRecoveries: 0,
    quickRecoveryRate: 0,
    lastEventAt: null,
    recentEvents: [],
  };
}

function countQuickRecoveries(events: VenuePresenceEventDiagnosticRow[], falsePositiveWindowMs: number): Map<string, number> {
  const recoveriesByVenue = new Map<string, number>();
  const lastOutOfRangeByUserVenue = new Map<string, number>();

  for (const event of [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))) {
    if (!event.user_id) continue;
    const key = `${event.venue_id}:${event.user_id}`;
    if (event.event_type === "out_of_range") {
      lastOutOfRangeByUserVenue.set(key, Date.parse(event.created_at));
      continue;
    }

    if (event.event_type !== "verified") continue;
    const lastOutOfRangeAt = lastOutOfRangeByUserVenue.get(key);
    const verifiedAt = Date.parse(event.created_at);
    if (typeof lastOutOfRangeAt !== "number" || !Number.isFinite(lastOutOfRangeAt) || !Number.isFinite(verifiedAt)) {
      continue;
    }

    const recoveryMs = verifiedAt - lastOutOfRangeAt;
    if (recoveryMs > 0 && recoveryMs <= falsePositiveWindowMs) {
      recoveriesByVenue.set(event.venue_id, (recoveriesByVenue.get(event.venue_id) ?? 0) + 1);
      lastOutOfRangeByUserVenue.delete(key);
    }
  }

  return recoveriesByVenue;
}

export async function loadVenuePresenceDiagnostics(params: {
  venueIds: string[];
  windowMinutes?: number;
}): Promise<VenuePresenceDiagnostics> {
  const venueIds = [...new Set(params.venueIds.map((id) => id.trim()).filter(Boolean))];
  const windowMinutes = normalizeWindowMinutes(params.windowMinutes);
  const tuning = getVenuePresenceTuningConfig();
  const summaries = new Map(venueIds.map((venueId) => [venueId, createVenueSummary(venueId)]));
  const warnings: string[] = [];

  if (!supabaseAdmin || venueIds.length === 0) {
    return {
      telemetryAvailable: Boolean(supabaseAdmin),
      windowMinutes,
      falsePositiveWindowMs: tuning.falsePositiveWindowMs,
      tuning,
      venues: [...summaries.values()],
      warnings,
    };
  }

  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const now = Date.now();

  const { data: sessions, error: sessionsError } = await supabaseAdmin
    .from("venue_presence_sessions")
    .select("venue_id, status, expires_at, last_verified_at, last_distance_meters, last_accuracy_meters")
    .in("venue_id", venueIds)
    .returns<VenuePresenceSessionDiagnosticRow[]>();

  if (sessionsError) {
    warnings.push("Presence session diagnostics are temporarily unavailable.");
  } else {
    for (const session of sessions ?? []) {
      const summary = summaries.get(session.venue_id);
      if (!summary) continue;

      const expiresAt = Date.parse(session.expires_at);
      if (session.status === "active" && Number.isFinite(expiresAt) && expiresAt > now) {
        summary.activeSessions += 1;
      } else if (session.status === "expired" || (session.status === "active" && Number.isFinite(expiresAt) && expiresAt <= now)) {
        summary.expiredSessions += 1;
      } else {
        summary.pausedSessions += 1;
      }
    }
  }

  const { data: events, error: eventsError } = await supabaseAdmin
    .from("venue_presence_events")
    .select(
      "venue_id, user_id, event_type, presence_code, status, source, distance_meters, allowed_distance_meters, accuracy_meters, created_at"
    )
    .in("venue_id", venueIds)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(Math.min(5_000, Math.max(250, venueIds.length * 500)))
    .returns<VenuePresenceEventDiagnosticRow[]>();

  if (eventsError) {
    warnings.push("Presence event telemetry is not available yet.");
  } else {
    const recentEvents = events ?? [];
    const quickRecoveriesByVenue = countQuickRecoveries(recentEvents, tuning.falsePositiveWindowMs);

    for (const event of recentEvents) {
      const summary = summaries.get(event.venue_id);
      if (!summary) continue;

      incrementEventCount(summary.eventCounts, event.event_type);
      if (!summary.lastEventAt || Date.parse(event.created_at) > Date.parse(summary.lastEventAt)) {
        summary.lastEventAt = event.created_at;
      }
      if (summary.recentEvents.length < RECENT_EVENTS_PER_VENUE) {
        summary.recentEvents.push(eventToRecentEvent(event));
      }
    }

    for (const [venueId, recoveries] of quickRecoveriesByVenue.entries()) {
      const summary = summaries.get(venueId);
      if (!summary) continue;
      summary.quickRecoveries = recoveries;
      summary.quickRecoveryRate =
        summary.eventCounts.outOfRange > 0 ? Number((recoveries / summary.eventCounts.outOfRange).toFixed(3)) : 0;
    }
  }

  return {
    telemetryAvailable: !eventsError,
    windowMinutes,
    falsePositiveWindowMs: tuning.falsePositiveWindowMs,
    tuning,
    venues: [...summaries.values()],
    warnings,
  };
}
