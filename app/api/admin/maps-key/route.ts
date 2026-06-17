import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Maps API not configured." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, apiKey });
}
