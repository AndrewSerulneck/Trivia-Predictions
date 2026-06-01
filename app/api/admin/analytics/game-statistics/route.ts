import { NextResponse } from "next/server";
import { analyticsErrorResponse, getGameStatisticsAnalytics } from "@/lib/adminAnalytics";
import { requireAdminAuth } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const items = await getGameStatisticsAnalytics({
      adminUsername: auth.adminUsername,
      searchParams,
      endpoint: "game-statistics",
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const response = analyticsErrorResponse(error);
    return NextResponse.json({ ok: false, error: response.message }, { status: response.status });
  }
}
