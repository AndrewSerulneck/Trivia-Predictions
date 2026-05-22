import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getAddressDetails } from "@/lib/geolocation";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as { placeId?: string; sessionToken?: string };
    const placeId = String(body.placeId ?? "").trim();
    const sessionToken = String(body.sessionToken ?? "").trim() || undefined;
    if (!placeId) {
      return NextResponse.json({ ok: false, error: "placeId is required." }, { status: 400 });
    }

    const details = await getAddressDetails(placeId, sessionToken);
    return NextResponse.json({ ok: true, details });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load address details from Places API.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
