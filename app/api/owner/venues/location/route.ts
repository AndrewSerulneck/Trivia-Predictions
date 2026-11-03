import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateOwnerVenueLocation } from "@/lib/venueLocationRules";

/**
 * GET /api/owner/venues/location?venueId= — the venue's saved pin + radius.
 * PATCH /api/owner/venues/location { venueId, latitude, longitude, radius }.
 * Owner auth and "the venue is theirs" are checked BEFORE any read or write.
 * The PATCH writes latitude, longitude and radius ONLY — never place_id, address or name (D3).
 * place_id is left alone on purpose: only admin screens read it, nothing matches it against the
 * pin, and a move of at most 1 km (D6) keeps the same business.
 * Rules: lib/venueLocationRules.ts. Plan: docs/signup-price-copy-and-partner-geofence-plan.md.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

type LocationRow = {
  id: string;
  name: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  radius: number | string | null;
};

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const fail = (error: string, status: number) => json({ ok: false, error }, status);
const forbidden = () => fail("You do not have access to this venue.", 403);

/** venues.latitude/longitude are `decimal` columns, which may arrive as strings. */
const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const loadVenue = async (venueId: string) => {
  if (!supabaseAdmin) return { found: false, error: fail("Server configuration error.", 500) } as const;
  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("id, name, latitude, longitude, radius")
    .eq("id", venueId)
    .maybeSingle<LocationRow>();
  if (error) {
    console.error("[OwnerVenueLocation] read-failed", error.message);
    return { found: false, error: fail("Couldn't load your venue location.", 500) } as const;
  }
  if (!data) return { found: false, error: fail("Venue not found.", 404) } as const;
  return {
    found: true,
    venue: {
      id: data.id,
      name: data.name ?? "",
      latitude: toNumberOrNull(data.latitude),
      longitude: toNumberOrNull(data.longitude),
      radius: toNumberOrNull(data.radius),
    },
  } as const;
};

export async function GET(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) return fail("venueId is required.", 400);
  if (!auth.venueIds.includes(venueId)) return forbidden();

  const loaded = await loadVenue(venueId);
  if (!loaded.found) return loaded.error;
  return json({ ok: true, venue: loaded.venue });
}

export async function PATCH(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return fail("Invalid request.", 400);
  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  if (!venueId) return fail("venueId is required.", 400);
  if (!auth.venueIds.includes(venueId)) return forbidden();

  const { latitude, longitude, radius } = body;
  if (typeof latitude !== "number" || typeof longitude !== "number" || typeof radius !== "number") {
    return fail("latitude, longitude and radius must be numbers.", 400);
  }

  const loaded = await loadVenue(venueId);
  if (!loaded.found) return loaded.error;
  const saved = loaded.venue;

  const verdict = validateOwnerVenueLocation({ saved, next: { latitude, longitude, radius } });
  if (!verdict.ok) return json({ ok: false, code: verdict.code, error: verdict.message }, 400);

  if (!supabaseAdmin) return fail("Server configuration error.", 500);
  const { error } = await supabaseAdmin
    .from("venues")
    .update({ latitude, longitude, radius })
    .eq("id", venueId);
  if (error) {
    console.error("[OwnerVenueLocation] update-failed", error.message);
    return fail("Couldn't save your venue location.", 500);
  }

  // The audit trail for partner geofence edits — one line, no owner email.
  console.info(
    `[OwnerVenueLocation] updated venue=${venueId} moved_m=${Math.round(verdict.movedMeters)} radius=${saved.radius}->${radius}`,
  );
  return json({ ok: true, venue: { ...saved, latitude, longitude, radius } });
}
