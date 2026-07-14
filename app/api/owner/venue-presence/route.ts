import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadVenuePresenceDiagnostics } from "@/lib/venuePresenceDiagnostics";

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const url = new URL(request.url);
  const requestedVenueId = String(url.searchParams.get("venueId") ?? "").trim();
  const windowMinutesParam = Number(url.searchParams.get("windowMinutes"));
  const venueIds = requestedVenueId ? [requestedVenueId] : auth.venueIds;

  if (requestedVenueId && !auth.venueIds.includes(requestedVenueId)) {
    return NextResponse.json({ ok: false, error: "Venue not found." }, { status: 404 });
  }

  const diagnostics = await loadVenuePresenceDiagnostics({
    venueIds,
    windowMinutes: Number.isFinite(windowMinutesParam) ? windowMinutesParam : undefined,
  });

  return NextResponse.json({ ok: true, ...diagnostics });
}
