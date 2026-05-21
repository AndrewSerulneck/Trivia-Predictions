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

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10)));

  try {
    const result = await listAdminUsersByVenue(venueId, { page, pageSize });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load users." },
      { status: 500 }
    );
  }
}
