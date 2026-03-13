import { NextResponse } from "next/server";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_VENUE_BY_ID } from "@/lib/defaultVenues";

type CreateProfileBody = {
  username?: string;
  venueId?: string;
  pin?: string;
};

type UserRow = {
  id: string;
  auth_id: string | null;
  username: string;
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

function normalizePin(pin: string): string {
  return pin.trim();
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

function isMissingPinColumnError(error: unknown): boolean {
  const dbError = error as DbError | null;
  const message = (dbError?.message ?? "").toLowerCase();
  return dbError?.code === "42703" || message.includes("pin_salt") || message.includes("pin_hash");
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateProfileBody;
  const username = (body.username ?? "").trim();
  const venueId = (body.venueId ?? "").trim();
  const pin = normalizePin(body.pin ?? "");

  if (!username) {
    return NextResponse.json({ ok: false, error: "Username is required." }, { status: 400 });
  }
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Venue is required." }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ ok: false, error: "PIN must be exactly 4 digits." }, { status: 400 });
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
    .select("id, auth_id, username, venue_id, points, pin_salt, pin_hash, created_at")
    .ilike("username", username)
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
      .ilike("username", username)
      .eq("venue_id", venueId)
      .limit(1);
    if (fallbackQuery.error) {
      return NextResponse.json({ ok: false, error: fallbackQuery.error.message }, { status: 500 });
    }
    existingByUsername = (fallbackQuery.data ?? []) as UserRow[];
  } else {
    existingByUsername = (withPinColumns.data ?? []) as UserRow[];
  }
  const existingUser = (existingByUsername?.[0] ?? null) as UserRow | null;
  if (existingUser) {
    if (pinColumnsAvailable) {
      const existingSalt = (existingUser.pin_salt ?? "").trim();
      const existingHash = (existingUser.pin_hash ?? "").trim();

      if (existingSalt && existingHash) {
        const isValidPin = verifyPin(pin, existingSalt, existingHash);
        if (!isValidPin) {
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

    return NextResponse.json({
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
        auth_id: null,
        username,
        venue_id: venueId,
        points: 0,
        pin_salt: salt,
        pin_hash: hash,
      }
    : {
        auth_id: null,
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
      return NextResponse.json({ ok: false, error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error?.message ?? "Failed to create profile." }, { status: 500 });
  }

  return NextResponse.json({
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
