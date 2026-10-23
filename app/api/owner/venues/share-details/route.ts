import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { venueShareDetailsGetResponse, venueShareDetailsPatchResponse } from "@/lib/venueShareDetailsStore";

/**
 * GET /api/owner/venues/share-details?venueId= — what this venue's share pictures show.
 * PATCH /api/owner/venues/share-details { venueId, instagramHandle, showName, showAddress, showInstagram }.
 * Owner auth and "the venue is theirs" are checked BEFORE any read or write (Phase 9e).
 * Called by the Partner Dashboard's "On shared pictures" panel (Schedule, Prizes, Game Settings).
 */

const forbidden = () =>
  NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });

export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!auth.venueIds.includes(venueId)) return forbidden();
  return venueShareDetailsGetResponse(venueId);
}

export async function PATCH(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!auth.venueIds.includes(venueId)) return forbidden();
  return venueShareDetailsPatchResponse(venueId, body);
}
