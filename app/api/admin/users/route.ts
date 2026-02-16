import { NextResponse } from "next/server";
import { listAdminUsersByVenue } from "@/lib/admin";
import { requireAdminAuth } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const venueId = (searchParams.get("venueId") ?? "").trim();

  if (!venueId) {
    return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  }

  const users = await listAdminUsersByVenue(venueId);
  return NextResponse.json({ ok: true, users });
}
