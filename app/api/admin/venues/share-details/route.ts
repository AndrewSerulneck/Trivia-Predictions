import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { venueShareDetailsGetResponse, venueShareDetailsPatchResponse } from "@/lib/venueShareDetailsStore";

/**
 * Admin twin of /api/owner/venues/share-details (Phase 9e): the same panel on the admin venue
 * form. Any venue, admin auth checked first.
 */

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  return venueShareDetailsGetResponse(venueId);
}

export async function PATCH(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const venueId = typeof body.venueId === "string" ? body.venueId.trim() : "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  return venueShareDetailsPatchResponse(venueId, body);
}
