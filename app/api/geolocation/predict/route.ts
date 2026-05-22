import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getAddressPredictions } from "@/lib/geolocation";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as { query?: string; sessionToken?: string };
    const query = String(body.query ?? "").trim();
    const sessionToken = String(body.sessionToken ?? "").trim() || undefined;

    if (query.length < 3) {
      return NextResponse.json({ ok: true, predictions: [] });
    }

    const predictions = await getAddressPredictions(query, sessionToken);
    return NextResponse.json({ ok: true, predictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load address predictions from Places API.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
