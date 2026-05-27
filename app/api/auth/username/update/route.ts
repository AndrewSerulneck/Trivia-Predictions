import { NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  chooseUserAndVenueFromRequest,
  findUserByIdAndVenue,
  getSessionHintsFromCookies,
  getUsernameUpdateCooldownSeconds,
  mapUserForResponse,
  normalizeUsername,
  normalizeUsernameForLookup,
  resolveSupabaseAuthUserId,
} from "@/lib/webauthn";
import { normalizePin } from "@/lib/pin";

export const runtime = "nodejs";

type UsernameUpdateBody = {
  userId?: string;
  venueId?: string;
  newUsername?: string;
  currentPin?: string;
  reason?: string;
};

type UsernameChangeAuditRow = {
  changed_at: string;
};

type UsernameChangeAttemptRow = {
  id: string;
};

type DbError = {
  code?: string;
  message?: string;
};

function hashPin(pin: string, salt: string): string {
  const derived = scryptSync(pin, salt, 64);
  return derived.toString("hex");
}

function verifyPin(pin: string, salt: string, hash: string): boolean {
  const computedHex = hashPin(pin, salt);
  const computed = Buffer.from(computedHex, "hex");
  const expected = Buffer.from(hash, "hex");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

function isMissingColumnError(error: unknown, column: string): boolean {
  const dbError = error as DbError | null;
  const message = String(dbError?.message ?? "").toLowerCase();
  return dbError?.code === "42703" || message.includes(column.toLowerCase());
}

function isMissingTableError(error: unknown, table: string): boolean {
  const dbError = error as DbError | null;
  const message = String(dbError?.message ?? "").toLowerCase();
  return dbError?.code === "42P01" || message.includes(table.toLowerCase());
}

function deriveRequesterIp(request: Request): string {
  const forwardedFor = String(request.headers.get("x-forwarded-for") ?? "").trim();
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "";
  }
  return String(request.headers.get("x-real-ip") ?? "").trim();
}

async function recordUsernameChangeAttempt(params: {
  userId: string | null;
  venueId: string | null;
  requestedUsername: string;
  requestedUsernameNormalized: string;
  success: boolean;
  failureReason: string | null;
  requesterAuthId: string | null;
  requesterIp: string | null;
}) {
  if (!supabaseAdmin) return;

  const insert = await supabaseAdmin.from("username_change_attempts").insert({
    user_id: params.userId,
    venue_id: params.venueId,
    requested_username: params.requestedUsername || null,
    requested_username_normalized: params.requestedUsernameNormalized || null,
    success: params.success,
    failure_reason: params.failureReason,
    requester_auth_id: params.requesterAuthId,
    requester_ip: params.requesterIp,
  });

  if (insert.error && !isMissingTableError(insert.error, "username_change_attempts")) {
    console.info("[UsernameUpdate] attempt-log-error", { message: insert.error.message });
  }
}

async function countRecentFailedAttempts(params: {
  userId: string;
  venueId: string;
  windowMinutes: number;
}): Promise<number> {
  if (!supabaseAdmin) return 0;
  const windowMinutes = Math.max(1, Math.floor(params.windowMinutes));
  const lowerBound = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const query = await supabaseAdmin
    .from("username_change_attempts")
    .select("id")
    .eq("user_id", params.userId)
    .eq("venue_id", params.venueId)
    .eq("success", false)
    .gte("created_at", lowerBound)
    .limit(50);

  if (query.error) {
    if (isMissingTableError(query.error, "username_change_attempts")) {
      return 0;
    }
    console.info("[UsernameUpdate] failed-attempt-query-error", { message: query.error.message });
    return 0;
  }

  return ((query.data ?? []) as UsernameChangeAttemptRow[]).length;
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as UsernameUpdateBody;
    const normalizedNewUsername = normalizeUsername(String(body.newUsername ?? ""));
    const normalizedNewUsernameLookup = normalizeUsernameForLookup(normalizedNewUsername);
    const requesterIp = deriveRequesterIp(request) || null;
    if (!normalizedNewUsername) {
      return NextResponse.json({ ok: false, error: "newUsername is required." }, { status: 400 });
    }

    const sessionHints = chooseUserAndVenueFromRequest(request, body);
    if (!sessionHints.userId || !sessionHints.venueId) {
      await recordUsernameChangeAttempt({
        userId: null,
        venueId: null,
        requestedUsername: normalizedNewUsername,
        requestedUsernameNormalized: normalizedNewUsernameLookup,
        success: false,
        failureReason: "missing-session-context",
        requesterAuthId: null,
        requesterIp,
      });
      return NextResponse.json(
        { ok: false, error: "Missing active session context. Please log in again." },
        { status: 401 }
      );
    }

    const cookieSession = getSessionHintsFromCookies(request);
    if (
      !cookieSession.userId ||
      !cookieSession.venueId ||
      cookieSession.userId !== sessionHints.userId ||
      cookieSession.venueId !== sessionHints.venueId
    ) {
      await recordUsernameChangeAttempt({
        userId: sessionHints.userId || null,
        venueId: sessionHints.venueId || null,
        requestedUsername: normalizedNewUsername,
        requestedUsernameNormalized: normalizedNewUsernameLookup,
        success: false,
        failureReason: "cookie-session-mismatch",
        requesterAuthId: null,
        requesterIp,
      });
      return NextResponse.json(
        { ok: false, error: "Session validation failed. Please log in again." },
        { status: 401 }
      );
    }

    const user = await findUserByIdAndVenue(supabaseAdmin, {
      userId: sessionHints.userId,
      venueId: sessionHints.venueId,
    });
    if (!user) {
      await recordUsernameChangeAttempt({
        userId: sessionHints.userId || null,
        venueId: sessionHints.venueId || null,
        requestedUsername: normalizedNewUsername,
        requestedUsernameNormalized: normalizedNewUsernameLookup,
        success: false,
        failureReason: "user-not-found",
        requesterAuthId: null,
        requesterIp,
      });
      return NextResponse.json({ ok: false, error: "User profile was not found." }, { status: 404 });
    }

    const failedAttemptsLast15m = await countRecentFailedAttempts({
      userId: user.id,
      venueId: user.venue_id,
      windowMinutes: 15,
    });
    if (failedAttemptsLast15m >= 8) {
      await recordUsernameChangeAttempt({
        userId: user.id,
        venueId: user.venue_id,
        requestedUsername: normalizedNewUsername,
        requestedUsernameNormalized: normalizedNewUsernameLookup,
        success: false,
        failureReason: "too-many-failed-attempts",
        requesterAuthId: null,
        requesterIp,
      });
      return NextResponse.json(
        { ok: false, error: "Too many recent attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    let isAuthorized = false;
    const bearerAuthUserId = await resolveSupabaseAuthUserId(supabaseAdmin, request);
    if (bearerAuthUserId && user.auth_id && bearerAuthUserId === user.auth_id) {
      isAuthorized = true;
    }

    const currentPin = normalizePin(String(body.currentPin ?? ""));
    const userSalt = String(user.pin_salt ?? "").trim();
    const userHash = String(user.pin_hash ?? "").trim();
    if (!isAuthorized && userSalt && userHash && currentPin) {
      isAuthorized = verifyPin(currentPin, userSalt, userHash);
    }

    if (!isAuthorized) {
      await recordUsernameChangeAttempt({
        userId: user.id,
        venueId: user.venue_id,
        requestedUsername: normalizedNewUsername,
        requestedUsernameNormalized: normalizedNewUsernameLookup,
        success: false,
        failureReason: "reauth-failed",
        requesterAuthId: bearerAuthUserId,
        requesterIp,
      });
      return NextResponse.json(
        { ok: false, error: "Re-authentication required. Provide current PIN or valid auth token." },
        { status: 401 }
      );
    }

    const currentLookup = normalizeUsernameForLookup(user.username);
    const isCaseOnlyChange = currentLookup === normalizedNewUsernameLookup;

    const cooldownSeconds = getUsernameUpdateCooldownSeconds();
    const latestChange = await supabaseAdmin
      .from("username_change_audit")
      .select("changed_at")
      .eq("user_id", user.id)
      .order("changed_at", { ascending: false })
      .limit(1);

    if (latestChange.error && !isMissingTableError(latestChange.error, "username_change_audit")) {
      return NextResponse.json({ ok: false, error: latestChange.error.message }, { status: 500 });
    }

    const latestRow = ((latestChange.data ?? [])[0] ?? null) as UsernameChangeAuditRow | null;
    if (latestRow?.changed_at) {
      const changedAt = new Date(latestRow.changed_at).getTime();
      if (Number.isFinite(changedAt)) {
        const elapsedMs = Date.now() - changedAt;
        if (elapsedMs < cooldownSeconds * 1000) {
          const retryAfter = Math.ceil((cooldownSeconds * 1000 - elapsedMs) / 1000);
          await recordUsernameChangeAttempt({
            userId: user.id,
            venueId: user.venue_id,
            requestedUsername: normalizedNewUsername,
            requestedUsernameNormalized: normalizedNewUsernameLookup,
            success: false,
            failureReason: "cooldown-active",
            requesterAuthId: bearerAuthUserId,
            requesterIp,
          });
          return NextResponse.json(
            {
              ok: false,
              error: `Username was changed recently. Please wait ${retryAfter}s before changing again.`,
              retryAfterSeconds: retryAfter,
            },
            { status: 429 }
          );
        }
      }
    }

    if (!isCaseOnlyChange) {
      const conflictByNormalized = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("venue_id", user.venue_id)
        .eq("username_normalized", normalizedNewUsernameLookup)
        .neq("id", user.id)
        .limit(1);

      if (conflictByNormalized.error) {
        if (!isMissingColumnError(conflictByNormalized.error, "username_normalized")) {
          return NextResponse.json({ ok: false, error: conflictByNormalized.error.message }, { status: 500 });
        }
        const fallbackConflict = await supabaseAdmin
          .from("users")
          .select("id, username")
          .eq("venue_id", user.venue_id)
          .neq("id", user.id)
          .limit(200);
        if (fallbackConflict.error) {
          return NextResponse.json({ ok: false, error: fallbackConflict.error.message }, { status: 500 });
        }
        const hasFallbackConflict = ((fallbackConflict.data ?? []) as Array<{ id: string; username: string }>).some(
          (row) => normalizeUsernameForLookup(row.username) === normalizedNewUsernameLookup
        );
        if (hasFallbackConflict) {
          await recordUsernameChangeAttempt({
            userId: user.id,
            venueId: user.venue_id,
            requestedUsername: normalizedNewUsername,
            requestedUsernameNormalized: normalizedNewUsernameLookup,
            success: false,
            failureReason: "username-conflict",
            requesterAuthId: bearerAuthUserId,
            requesterIp,
          });
          return NextResponse.json({ ok: false, error: "That username is already taken." }, { status: 409 });
        }
      } else if ((conflictByNormalized.data ?? []).length > 0) {
        await recordUsernameChangeAttempt({
          userId: user.id,
          venueId: user.venue_id,
          requestedUsername: normalizedNewUsername,
          requestedUsernameNormalized: normalizedNewUsernameLookup,
          success: false,
          failureReason: "username-conflict",
          requesterAuthId: bearerAuthUserId,
          requesterIp,
        });
        return NextResponse.json({ ok: false, error: "That username is already taken." }, { status: 409 });
      }
    }

    const updateWithNormalized = await supabaseAdmin
      .from("users")
      .update({
        username: normalizedNewUsername,
        username_normalized: normalizedNewUsernameLookup,
      })
      .eq("id", user.id)
      .eq("venue_id", user.venue_id)
      .select("id, auth_id, username, username_normalized, venue_id, points, created_at, pin_salt, pin_hash")
      .single();

    let updatedUser = updateWithNormalized.data;
    if (updateWithNormalized.error) {
      if (!isMissingColumnError(updateWithNormalized.error, "username_normalized")) {
        return NextResponse.json({ ok: false, error: updateWithNormalized.error.message }, { status: 500 });
      }
      const fallbackUpdate = await supabaseAdmin
        .from("users")
        .update({ username: normalizedNewUsername })
        .eq("id", user.id)
        .eq("venue_id", user.venue_id)
        .select("id, auth_id, username, venue_id, points, created_at, pin_salt, pin_hash")
        .single();
      if (fallbackUpdate.error || !fallbackUpdate.data) {
        return NextResponse.json(
          { ok: false, error: fallbackUpdate.error?.message ?? "Failed to update username." },
          { status: 500 }
        );
      }
      updatedUser = {
        ...fallbackUpdate.data,
        username_normalized: normalizeUsernameForLookup(fallbackUpdate.data.username),
      };
    }

    const auditInsert = await supabaseAdmin.from("username_change_audit").insert({
      user_id: user.id,
      old_username: user.username,
      new_username: normalizedNewUsername,
      old_username_normalized: currentLookup,
      new_username_normalized: normalizedNewUsernameLookup,
      changed_by_auth_id: bearerAuthUserId,
      reason: String(body.reason ?? "").trim() || null,
    });

    if (auditInsert.error && !isMissingTableError(auditInsert.error, "username_change_audit")) {
      return NextResponse.json({ ok: false, error: auditInsert.error.message }, { status: 500 });
    }
    if (!updatedUser) {
      return NextResponse.json({ ok: false, error: "Failed to load updated user profile." }, { status: 500 });
    }

    await recordUsernameChangeAttempt({
      userId: user.id,
      venueId: user.venue_id,
      requestedUsername: normalizedNewUsername,
      requestedUsernameNormalized: normalizedNewUsernameLookup,
      success: true,
      failureReason: null,
      requesterAuthId: bearerAuthUserId,
      requesterIp,
    });
    console.info("[UsernameUpdate] success", {
      userId: user.id,
      venueId: user.venue_id,
      requesterAuthId: bearerAuthUserId,
    });

    return NextResponse.json({
      ok: true,
      user: mapUserForResponse(updatedUser),
      isCaseOnlyChange,
    });
  } catch (error) {
    console.info("[UsernameUpdate] error", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update username." },
      { status: 400 }
    );
  }
}
