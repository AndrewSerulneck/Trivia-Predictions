import { NextResponse } from "next/server";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_VENUE_BY_ID } from "@/lib/defaultVenues";
import { logAuthIncident } from "@/lib/authIncidentDebug";
import { normalizePin as normalizeCanonicalPin } from "@/lib/pin";
import { createSessionCookie, isSessionEnforced, readSession } from "@/lib/serverSession";
import {
  calculateDistanceMeters,
  getGeofenceThresholdMeters,
  isValidGeofenceCoordinates,
  type GeofenceCoordinates,
} from "@/lib/geofence";

function userResponse(userId: string, data: Record<string, unknown>): NextResponse {
  const res = NextResponse.json(data);
  res.headers.append("Set-Cookie", createSessionCookie(userId));
  return res;
}

type CreateProfileBody = {
  username?: string;
  venueId?: string;
  pin?: string;
  location?: GeofenceCoordinates;
  selectedVenueId?: string;
  authUserId?: string;
  accountId?: string;
  sessionUserId?: string;
};

type UserRow = {
  id: string;
  auth_id: string | null;
  account_id?: string | null;
  username: string;
  username_normalized?: string | null;
  venue_id: string;
  points: number;
  pin_salt?: string | null;
  pin_hash?: string | null;
  created_at: string;
};

type DbError = {
  code?: string;
  message?: string;
};

type VenueGeofenceRow = {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
};

function normalizeBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

const DISABLE_GEOFENCE_FOR_TESTING = true;

function normalizePin(pin: string): string {
  return normalizeCanonicalPin(pin);
}

function normalizeUsernameForLookup(username: string): string {
  return username.trim().toLowerCase();
}

function hashPin(pin: string, salt: string): string {
  const derived = scryptSync(pin, salt, 64);
  return derived.toString("hex");
}

function verifyPin(pin: string, salt: string, hash: string): boolean {
  const computedHex = hashPin(pin, salt);
  const computed = Buffer.from(computedHex, "hex");
  const expected = Buffer.from(hash, "hex");
  if (computed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(computed, expected);
}

function normalizeAuthUserId(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

function isMissingPinColumnError(error: unknown): boolean {
  const dbError = error as DbError | null;
  const message = (dbError?.message ?? "").toLowerCase();
  return dbError?.code === "42703" || message.includes("pin_salt") || message.includes("pin_hash");
}

async function ensureDefaultVenueExists(venueId: string): Promise<string | null> {
  const defaultVenue = DEFAULT_VENUE_BY_ID[venueId];
  if (!defaultVenue) {
    return null;
  }

  const { data: existingVenue, error: existingVenueError } = await supabaseAdmin!
    .from("venues")
    .select("id")
    .eq("id", defaultVenue.id)
    .maybeSingle();

  if (existingVenueError) {
    return existingVenueError.message;
  }

  if (existingVenue) {
    return null;
  }

  const { error: insertVenueError } = await supabaseAdmin!.from("venues").insert({
    id: defaultVenue.id,
    name: defaultVenue.name,
    address: defaultVenue.address,
    latitude: defaultVenue.latitude,
    longitude: defaultVenue.longitude,
    radius: defaultVenue.radius,
  });

  return insertVenueError?.message ?? null;
}

async function getVenueGeofenceRow(venueId: string): Promise<{ venue: VenueGeofenceRow | null; error: string | null }> {
  const defaultVenueError = await ensureDefaultVenueExists(venueId);
  if (defaultVenueError) {
    return { venue: null, error: defaultVenueError };
  }

  const { data, error } = await supabaseAdmin!
    .from("venues")
    .select("id, latitude, longitude, radius")
    .eq("id", venueId)
    .maybeSingle<VenueGeofenceRow>();

  if (error) {
    return { venue: null, error: error.message };
  }

  return { venue: data ? {
    id: data.id,
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    radius: Number(data.radius),
  } : null, error: null };
}

async function verifyJoinGeofence(params: {
  venueId: string;
  location?: GeofenceCoordinates;
  bypass?: boolean;
  traceId: string | null;
}): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { venueId, location, bypass, traceId } = params;
  if (DISABLE_GEOFENCE_FOR_TESTING || bypass) {
    return { ok: true };
  }

  if (!location || !isValidGeofenceCoordinates(location)) {
    logAuthIncident("join-profile-route", "post-reject-missing-location", { traceId, venueId });
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Location verification is required to enter this venue." },
        { status: 403 }
      ),
    };
  }

  const { venue, error } = await getVenueGeofenceRow(venueId);
  if (error) {
    return { ok: false, response: NextResponse.json({ ok: false, error }, { status: 500 }) };
  }
  if (!venue) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Selected venue is unavailable right now. Refresh and choose again." },
        { status: 409 }
      ),
    };
  }

  const distance = calculateDistanceMeters(location, {
    latitude: venue.latitude,
    longitude: venue.longitude,
  });
  const allowedDistance = getGeofenceThresholdMeters(venue.radius, location.accuracy);

  if (distance <= allowedDistance) {
    return { ok: true };
  }

  logAuthIncident("join-profile-route", "post-reject-geofence", {
    traceId,
    venueId,
    distance: Math.round(distance),
    allowedDistance: Math.round(allowedDistance),
  });
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error: `You are ${Math.round(distance)}m away. Required range is ${Math.round(allowedDistance)}m.` },
      { status: 403 }
    ),
  };
}

async function resolveVenueProfileForAccount(params: {
  accountId: string;
  venueId: string;
  location?: GeofenceCoordinates;
  traceId: string | null;
  startedAt: number;
}): Promise<NextResponse> {
  const { accountId, venueId, location, traceId, startedAt } = params;
  logAuthIncident("join-profile-route", "post-account-path-start", { traceId, accountId, venueId });

  const { data: account, error: accountLookupError } = await supabaseAdmin!
    .from("accounts")
    .select("id, auth_id, username, god_mode")
    .eq("id", accountId)
    .maybeSingle<{ id: string; auth_id: string | null; username: string; god_mode?: boolean | null }>();

  if (accountLookupError) {
    return NextResponse.json({ ok: false, error: accountLookupError.message }, { status: 500 });
  }
  if (!account) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  const geofence = await verifyJoinGeofence({ venueId, location, bypass: Boolean(account.god_mode), traceId });
  if (!geofence.ok) {
    return geofence.response;
  }

  const venueError = await ensureDefaultVenueExists(venueId);
  if (venueError) {
    return NextResponse.json({ ok: false, error: venueError }, { status: 500 });
  }

  const { data: existingProfile, error: profileLookupError } = await supabaseAdmin!
    .from("users")
    .select("id, auth_id, username, venue_id, points, created_at")
    .eq("account_id", accountId)
    .eq("venue_id", venueId)
    .maybeSingle<UserRow>();

  if (profileLookupError) {
    return NextResponse.json({ ok: false, error: profileLookupError.message }, { status: 500 });
  }

  if (existingProfile) {
    logAuthIncident("join-profile-route", "post-account-path-existing-profile", {
      traceId, accountId, venueId, userId: existingProfile.id, elapsedMs: Date.now() - startedAt,
    });
    return userResponse(existingProfile.id, {
      ok: true,
      user: {
        id: existingProfile.id,
        accountId,
        authId: existingProfile.auth_id ?? undefined,
        username: existingProfile.username,
        venueId: existingProfile.venue_id,
        points: existingProfile.points,
        createdAt: existingProfile.created_at,
      },
    });
  }

  const { data: newProfile, error: insertProfileError } = await supabaseAdmin!
    .from("users")
    .insert({
      account_id: accountId,
      auth_id: account.auth_id,
      username: account.username,
      venue_id: venueId,
      points: 0,
    })
    .select("id, auth_id, username, venue_id, points, created_at")
    .single<UserRow>();

  if (insertProfileError || !newProfile) {
    const code = (insertProfileError as { code?: string } | null)?.code;
    if (code === "23503") {
      return NextResponse.json(
        { ok: false, error: "Selected venue is unavailable right now. Refresh and choose again." },
        { status: 409 }
      );
    }
    if (code === "23505") {
      const { data: racedProfile } = await supabaseAdmin!
        .from("users")
        .select("id, auth_id, username, venue_id, points, created_at")
        .eq("account_id", accountId)
        .eq("venue_id", venueId)
        .maybeSingle<UserRow>();
      if (racedProfile) {
        return userResponse(racedProfile.id, {
          ok: true,
          user: {
            id: racedProfile.id,
            accountId,
            authId: racedProfile.auth_id ?? undefined,
            username: racedProfile.username,
            venueId: racedProfile.venue_id,
            points: racedProfile.points,
            createdAt: racedProfile.created_at,
          },
        });
      }
    }
    return NextResponse.json(
      { ok: false, error: insertProfileError?.message ?? "Failed to create venue profile." },
      { status: 500 }
    );
  }

  logAuthIncident("join-profile-route", "post-account-path-created-profile", {
    traceId, accountId, venueId, userId: newProfile.id, elapsedMs: Date.now() - startedAt,
  });
  return userResponse(newProfile.id, {
    ok: true,
    user: {
      id: newProfile.id,
      accountId,
      authId: newProfile.auth_id ?? undefined,
      username: newProfile.username,
      venueId: newProfile.venue_id,
      points: newProfile.points,
      createdAt: newProfile.created_at,
    },
  });
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateProfileBody;
  const accountId = normalizeAuthUserId(body.accountId);
  const bodySessionUserId = normalizeAuthUserId(body.sessionUserId);
  const cookieSessionUserId = normalizeAuthUserId(readSession(request));
  const venueId = (body.venueId ?? "").trim();
  const traceId = String(request.headers.get("x-auth-trace-id") ?? "").trim() || null;
  const startedAt = Date.now();
  const sessionUserId = isSessionEnforced() ? cookieSessionUserId : bodySessionUserId || cookieSessionUserId;

  if (isSessionEnforced() && bodySessionUserId && cookieSessionUserId && bodySessionUserId !== cookieSessionUserId) {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  // ── Account-first path ───────────────────────────────────────────────────────
  // When accountId is supplied the caller has already authenticated; we just
  // find or lazily create the venue-scoped profile (points start at 0).
  if (accountId) {
    if (!venueId) {
      return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
    }
    return resolveVenueProfileForAccount({ accountId, venueId, location: body.location, traceId, startedAt });
  }

  if (sessionUserId) {
    if (!venueId) {
      return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
    }

    logAuthIncident("join-profile-route", "post-session-path-start", {
      traceId,
      sessionUserId,
      venueId,
    });

    const { data: sessionUser, error: sessionUserLookupError } = await supabaseAdmin
      .from("users")
      .select("id, auth_id, account_id, username, username_normalized, venue_id, points, created_at")
      .eq("id", sessionUserId)
      .maybeSingle<UserRow>();

    if (sessionUserLookupError) {
      return NextResponse.json({ ok: false, error: sessionUserLookupError.message }, { status: 500 });
    }
    if (!sessionUser) {
      return NextResponse.json({ ok: false, error: "Session user not found." }, { status: 404 });
    }

    const linkedAccountId = String(sessionUser.account_id ?? "").trim();
    if (linkedAccountId) {
      return resolveVenueProfileForAccount({ accountId: linkedAccountId, venueId, location: body.location, traceId, startedAt });
    }

    const geofence = await verifyJoinGeofence({ venueId, location: body.location, traceId });
    if (!geofence.ok) {
      return geofence.response;
    }

    const normalizedUsername =
      String(sessionUser.username_normalized ?? "").trim() || normalizeUsernameForLookup(sessionUser.username);

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from("users")
      .select("id, auth_id, username, venue_id, points, created_at")
      .eq("username_normalized", normalizedUsername)
      .eq("venue_id", venueId)
      .limit(1);

    if (existingProfileError) {
      return NextResponse.json({ ok: false, error: existingProfileError.message }, { status: 500 });
    }

    const matchedProfile = ((existingProfile ?? []) as UserRow[])[0] ?? null;
    if (matchedProfile) {
      logAuthIncident("join-profile-route", "post-session-path-existing-profile", {
        traceId,
        sessionUserId,
        venueId,
        userId: matchedProfile.id,
        elapsedMs: Date.now() - startedAt,
      });
      return userResponse(matchedProfile.id, {
        ok: true,
        user: {
          id: matchedProfile.id,
          authId: matchedProfile.auth_id ?? undefined,
          username: matchedProfile.username,
          venueId: matchedProfile.venue_id,
          points: matchedProfile.points,
          createdAt: matchedProfile.created_at,
        },
      });
    }

    const { data: newProfile, error: insertProfileError } = await supabaseAdmin
      .from("users")
      .insert({
        auth_id: sessionUser.auth_id,
        username: sessionUser.username,
        venue_id: venueId,
        points: 0,
      })
      .select("id, auth_id, username, venue_id, points, created_at")
      .single<UserRow>();

    if (insertProfileError || !newProfile) {
      const code = (insertProfileError as { code?: string } | null)?.code;
      if (code === "23503") {
        return NextResponse.json(
          { ok: false, error: "Selected venue is unavailable right now. Refresh and choose again." },
          { status: 409 }
        );
      }
      if (code === "23505") {
        return NextResponse.json(
          { ok: false, error: "That username is already taken at this venue. Please sign in again to choose a different username." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: insertProfileError?.message ?? "Failed to create venue profile." },
        { status: 500 }
      );
    }

    logAuthIncident("join-profile-route", "post-session-path-created-profile", {
      traceId,
      sessionUserId,
      venueId,
      userId: newProfile.id,
      elapsedMs: Date.now() - startedAt,
    });
    return userResponse(newProfile.id, {
      ok: true,
      user: {
        id: newProfile.id,
        authId: newProfile.auth_id ?? undefined,
        username: newProfile.username,
        venueId: newProfile.venue_id,
        points: newProfile.points,
        createdAt: newProfile.created_at,
      },
    });
  }

  // ── Legacy username+PIN path (backward compatible) ───────────────────────────
  const username = (body.username ?? "").trim();
  const usernameNormalized = normalizeUsernameForLookup(username);
  const selectedVenueFromBody = (body.selectedVenueId ?? "").trim();
  const selectedVenueFromHeader = (request.headers.get("x-selected-venue-id") ?? "").trim();
  const selectedVenueId = selectedVenueFromBody || selectedVenueFromHeader || venueId;
  const authUserId = normalizeAuthUserId(body.authUserId);
  const pin = normalizePin(body.pin ?? "");
  logAuthIncident("join-profile-route", "post-start", {
    traceId,
    username,
    venueId,
    selectedVenueId,
    hasAuthUserId: Boolean(authUserId),
  });

  if (!username) {
    return NextResponse.json({ ok: false, error: "Username is required." }, { status: 400 });
  }
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  }
  if (selectedVenueId && selectedVenueId !== venueId) {
    logAuthIncident("join-profile-route", "post-reject-venue-mismatch", {
      traceId,
      username,
      venueId,
      selectedVenueId,
    });
    return NextResponse.json({ ok: false, error: "Venue selection mismatch. Please retry login." }, { status: 409 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ ok: false, error: "PIN must be exactly 4 digits." }, { status: 400 });
  }

  const geofence = await verifyJoinGeofence({ venueId, location: body.location, traceId });
  if (!geofence.ok) {
    return geofence.response;
  }

  // Ensure default demo venues are present when selected from public links,
  // but never overwrite an existing venue profile customized by admin.
  const defaultVenue = DEFAULT_VENUE_BY_ID[venueId];
  if (defaultVenue) {
    const { data: existingVenue, error: existingVenueError } = await supabaseAdmin
      .from("venues")
      .select("id")
      .eq("id", defaultVenue.id)
      .maybeSingle();

    if (existingVenueError) {
      return NextResponse.json({ ok: false, error: existingVenueError.message }, { status: 500 });
    }

    if (!existingVenue) {
      const { error: insertVenueError } = await supabaseAdmin.from("venues").insert({
        id: defaultVenue.id,
        name: defaultVenue.name,
        address: defaultVenue.address,
        latitude: defaultVenue.latitude,
        longitude: defaultVenue.longitude,
        radius: defaultVenue.radius,
      });

      if (insertVenueError) {
        return NextResponse.json({ ok: false, error: insertVenueError.message }, { status: 500 });
      }
    }
  }

  let pinColumnsAvailable = true;
  let existingByUsername: UserRow[] | null = null;
  const withPinColumns = await supabaseAdmin
    .from("users")
    .select("id, auth_id, username, username_normalized, venue_id, points, pin_salt, pin_hash, created_at")
    .eq("username_normalized", usernameNormalized)
    .eq("venue_id", venueId)
    .limit(1);
  if (withPinColumns.error) {
    if (!isMissingPinColumnError(withPinColumns.error)) {
      return NextResponse.json({ ok: false, error: withPinColumns.error.message }, { status: 500 });
    }
    pinColumnsAvailable = false;
    const fallbackQuery = await supabaseAdmin
      .from("users")
      .select("id, auth_id, username, venue_id, points, created_at")
      .eq("venue_id", venueId)
      .limit(200);
    if (fallbackQuery.error) {
      return NextResponse.json({ ok: false, error: fallbackQuery.error.message }, { status: 500 });
    }
    existingByUsername = ((fallbackQuery.data ?? []) as UserRow[]).filter(
      (row) => normalizeUsernameForLookup(row.username) === usernameNormalized
    );
  } else {
    existingByUsername = (withPinColumns.data ?? []) as UserRow[];
  }
  const existingUser = (existingByUsername?.[0] ?? null) as UserRow | null;
  if (existingUser) {
    logAuthIncident("join-profile-route", "post-existing-user-found", {
      traceId,
      username,
      venueId,
      userId: existingUser.id,
      elapsedMs: Date.now() - startedAt,
    });
    if (pinColumnsAvailable) {
      const existingSalt = (existingUser.pin_salt ?? "").trim();
      const existingHash = (existingUser.pin_hash ?? "").trim();

      if (existingSalt && existingHash) {
        const isValidPin = verifyPin(pin, existingSalt, existingHash);
        if (!isValidPin) {
          logAuthIncident("join-profile-route", "post-reject-incorrect-pin", {
            traceId,
            username,
            venueId,
            userId: existingUser.id,
            elapsedMs: Date.now() - startedAt,
          });
          return NextResponse.json({ ok: false, error: "Incorrect PIN." }, { status: 401 });
        }
      } else {
        const salt = randomBytes(16).toString("hex");
        const hash = hashPin(pin, salt);
        const { error: pinSetError } = await supabaseAdmin
          .from("users")
          .update({ pin_salt: salt, pin_hash: hash })
          .eq("id", existingUser.id);

        if (pinSetError) {
          return NextResponse.json({ ok: false, error: pinSetError.message }, { status: 500 });
        }
      }
    }

    if (!existingUser.auth_id && authUserId) {
      const { error: authLinkError } = await supabaseAdmin
        .from("users")
        .update({ auth_id: authUserId })
        .eq("id", existingUser.id)
        .is("auth_id", null);
      if (authLinkError) {
        return NextResponse.json({ ok: false, error: authLinkError.message }, { status: 500 });
      }
      existingUser.auth_id = authUserId;
    }

    return userResponse(existingUser.id, {
      ok: true,
      user: {
        id: existingUser.id,
        authId: existingUser.auth_id ?? undefined,
        username: existingUser.username,
        venueId: existingUser.venue_id,
        points: existingUser.points,
        createdAt: existingUser.created_at,
      },
    });
  }

  const salt = randomBytes(16).toString("hex");
  const hash = hashPin(pin, salt);
  const insertPayload = pinColumnsAvailable
    ? {
        auth_id: authUserId,
        username,
        venue_id: venueId,
        points: 0,
        pin_salt: salt,
        pin_hash: hash,
      }
    : {
        auth_id: authUserId,
        username,
        venue_id: venueId,
        points: 0,
      };

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert(insertPayload)
    .select("id, auth_id, username, venue_id, points, created_at")
    .single<UserRow>();

  if (error || !data) {
    const code = (error as { code?: string } | null)?.code;
    if (isMissingPinColumnError(error)) {
      return NextResponse.json(
        { ok: false, error: "PIN columns are missing in this environment. Run latest DB migrations and retry." },
        { status: 500 }
      );
    }
    if (code === "23503") {
      return NextResponse.json(
        { ok: false, error: "Selected venue is unavailable right now. Refresh and choose again." },
        { status: 409 }
      );
    }
    if (code === "23505") {
      logAuthIncident("join-profile-route", "post-reject-username-conflict", {
        traceId,
        username,
        venueId,
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json({ ok: false, error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error?.message ?? "Failed to create profile." }, { status: 500 });
  }

  logAuthIncident("join-profile-route", "post-created-user", {
    traceId,
    username,
    venueId,
    userId: data.id,
    elapsedMs: Date.now() - startedAt,
  });
  return userResponse(data.id, {
    ok: true,
    user: {
      id: data.id,
      authId: data.auth_id ?? undefined,
      username: data.username,
      venueId: data.venue_id,
      points: data.points,
      createdAt: data.created_at,
    },
  });
}

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("username") ?? "").trim();
  const venueId = (searchParams.get("venueId") ?? "").trim();

  if (!username) {
    return NextResponse.json({ ok: false, error: "username is required." }, { status: 400 });
  }

  // Without a venueId: check the global accounts table (account-first flow).
  if (!venueId) {
    const { data, error } = await supabaseAdmin
      .from("accounts")
      .select("id, pin_salt, pin_hash")
      .eq("username_normalized", normalizeUsernameForLookup(username))
      .maybeSingle<{ id?: string; pin_salt?: string | null; pin_hash?: string | null }>();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const exists = Boolean(data?.id);
    const hasPin = Boolean(String(data?.pin_salt ?? "").trim() && String(data?.pin_hash ?? "").trim());
    return NextResponse.json({ ok: true, exists, hasPin, isReturningUser: exists && hasPin });
  }

  // With venueId: per-venue check (legacy path).
  const query = await supabaseAdmin
    .from("users")
    .select("id, username, pin_salt, pin_hash")
    .eq("username_normalized", normalizeUsernameForLookup(username))
    .eq("venue_id", venueId)
    .limit(1);

  if (query.error) {
    if (isMissingPinColumnError(query.error)) {
      const fallback = await supabaseAdmin
        .from("users")
        .select("id, username")
        .eq("venue_id", venueId)
        .limit(200);
      if (fallback.error) {
        return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
      }
      const exists = ((fallback.data ?? []) as Array<{ id?: string; username?: string | null }>).some(
        (row) => normalizeUsernameForLookup(String(row.username ?? "")) === normalizeUsernameForLookup(username)
      );
      return NextResponse.json({ ok: true, exists, hasPin: false, isReturningUser: false });
    }
    return NextResponse.json({ ok: false, error: query.error.message }, { status: 500 });
  }

  const row = (query.data ?? [])[0] as { id?: string; pin_salt?: string | null; pin_hash?: string | null } | undefined;
  const exists = Boolean(row?.id);
  const hasPin = Boolean(String(row?.pin_salt ?? "").trim() && String(row?.pin_hash ?? "").trim());
  return NextResponse.json({ ok: true, exists, hasPin, isReturningUser: exists && hasPin });
}
