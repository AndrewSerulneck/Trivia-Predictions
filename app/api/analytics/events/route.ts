import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AnalyticsEvent = {
  requestId?: string;
  type?: string;
  sessionId?: string;
  gameSessionId?: string;
  userSessionId?: string | null;
  userId?: string;
  venueId?: string;
  occurredAt?: string;
  gameType?: string;
  outcome?: string;
  adId?: string;
  adCampaignId?: string | null;
  interactionId?: string;
  interactionType?: string;
  referrerPage?: string | null;
  zipCode?: string | null;
  city?: string | null;
  stateCode?: string | null;
  regionKey?: string | null;
  country?: string | null;
  dataSource?: string | null;
};

const seenRequestIds = new Map<string, number>();
const REQUEST_ID_TTL_MS = 30 * 60 * 1000;

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableTrim(value: unknown): string | null {
  const normalized = trim(value);
  return normalized || null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readCookie(request: Request, name: string): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const safeName = `${encodeURIComponent(name)}=`;
  const match = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(safeName));
  if (!match) return "";
  try {
    return decodeURIComponent(match.slice(safeName.length));
  } catch {
    return match.slice(safeName.length);
  }
}

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

function pruneRequestIds() {
  const cutoff = Date.now() - REQUEST_ID_TTL_MS;
  for (const [requestId, seenAt] of seenRequestIds.entries()) {
    if (seenAt < cutoff) seenRequestIds.delete(requestId);
  }
}

function markRequestId(requestId: string): boolean {
  if (!requestId) return true;
  pruneRequestIds();
  if (seenRequestIds.has(requestId)) return false;
  seenRequestIds.set(requestId, Date.now());
  return true;
}

function eventTimestamp(value: unknown): string {
  const parsed = new Date(trim(value));
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

async function userBelongsToVenue(userId: string, venueId: string): Promise<boolean> {
  if (!supabaseAdmin || !userId || !venueId || !isUuid(userId)) return false;
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("venue_id", venueId)
    .maybeSingle();
  return Boolean(!error && data?.id);
}

async function handleEvent(event: AnalyticsEvent, request: Request, fallback: { userId: string; venueId: string }) {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  const requestId = trim(event.requestId);
  if (requestId && !markRequestId(requestId)) return;

  const type = trim(event.type);
  const userId = trim(event.userId) || fallback.userId;
  const venueId = trim(event.venueId) || fallback.venueId;
  const occurredAt = eventTimestamp(event.occurredAt);

  if (type === "session_start") {
    if (!userId || !venueId || !(await userBelongsToVenue(userId, venueId))) return;
    const sessionId = trim(event.sessionId);
    if (!isUuid(sessionId)) return;
    const { error } = await supabaseAdmin.from("user_sessions").upsert(
      {
        session_id: sessionId,
        user_id: userId,
        venue_id: venueId,
        session_start_at: occurredAt,
        ip_address: getClientIp(request),
        user_agent: request.headers.get("user-agent") ?? null,
      },
      { onConflict: "session_id" }
    );
    if (error) throw new Error(error.message);
    return;
  }

  if (type === "session_heartbeat" || type === "session_end") {
    const sessionId = trim(event.sessionId);
    if (!isUuid(sessionId)) return;
    const { error } = await supabaseAdmin
      .from("user_sessions")
      .update({ session_end_at: occurredAt })
      .eq("session_id", sessionId);
    if (error) throw new Error(error.message);
    return;
  }

  if (type === "game_start") {
    if (!userId || !venueId || !(await userBelongsToVenue(userId, venueId))) return;
    const sessionId = trim(event.gameSessionId);
    if (!isUuid(sessionId)) return;
    const userSessionId = nullableTrim(event.userSessionId);
    const { error } = await supabaseAdmin.from("game_sessions").upsert(
      {
        session_id: sessionId,
        user_id: userId,
        venue_id: venueId,
        user_session_id: userSessionId && isUuid(userSessionId) ? userSessionId : null,
        game_type: trim(event.gameType),
        game_start_at: occurredAt,
      },
      { onConflict: "session_id" }
    );
    if (error) throw new Error(error.message);
    return;
  }

  if (type === "game_end") {
    const sessionId = trim(event.gameSessionId);
    if (!isUuid(sessionId)) return;
    const outcome = trim(event.outcome);
    const { error } = await supabaseAdmin
      .from("game_sessions")
      .update({
        game_end_at: occurredAt,
        game_outcome: outcome === "won" || outcome === "lost" || outcome === "abandoned" ? outcome : "abandoned",
      })
      .eq("session_id", sessionId);
    if (error) throw new Error(error.message);
    return;
  }

  if (type === "ad_interaction") {
    const adId = trim(event.adId);
    const interactionId = trim(event.interactionId);
    const interactionType = trim(event.interactionType);
    if (!adId || !venueId || !isUuid(interactionId)) return;
    const { error } = await supabaseAdmin.from("ad_interactions").upsert(
      {
        interaction_id: interactionId,
        user_id: isUuid(userId) ? userId : null,
        venue_id: venueId,
        ad_id: adId,
        ad_campaign_id: nullableTrim(event.adCampaignId),
        interaction_type:
          interactionType === "view" || interactionType === "click" || interactionType === "convert"
            ? interactionType
            : "view",
        interaction_at: occurredAt,
        referrer_page: nullableTrim(event.referrerPage),
      },
      { onConflict: "interaction_id" }
    );
    if (error) throw new Error(error.message);
    return;
  }

  if (type === "geo_sync") {
    if (!userId || !isUuid(userId)) return;
    const { error } = await supabaseAdmin.from("user_geographic_data").upsert(
      {
        user_id: userId,
        zip_code: nullableTrim(event.zipCode),
        city: nullableTrim(event.city),
        state_code: nullableTrim(event.stateCode)?.toUpperCase() ?? null,
        region_key: nullableTrim(event.regionKey)?.toLowerCase() ?? null,
        country: nullableTrim(event.country)?.toUpperCase() ?? "US",
        data_source: trim(event.dataSource) === "geolocation" ? "geolocation" : "signup",
      },
      { onConflict: "user_id" }
    );
    if (error) throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { events?: AnalyticsEvent[] } | null;
    const events = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
    const fallback = {
      userId: readCookie(request, "tp_user_id").trim(),
      venueId: readCookie(request, "tp_venue_id").trim(),
    };

    for (const event of events) {
      await handleEvent(event, request, fallback);
    }

    return NextResponse.json({ ok: true, accepted: events.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to record analytics events." },
      { status: 500 }
    );
  }
}
