import { NextResponse } from "next/server";
import { analyticsErrorResponse, getGeographicBreakdownAnalytics } from "@/lib/adminAnalytics";
import { requireAdminAuth } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const hierarchy = await getGeographicBreakdownAnalytics({
      adminUsername: auth.adminUsername,
      searchParams,
      endpoint: "geographic-breakdown",
    });
    return NextResponse.json({ ok: true, hierarchy });
  } catch (error) {
    const response = analyticsErrorResponse(error);
    return NextResponse.json({ ok: false, error: response.message }, { status: response.status });
  }
}
