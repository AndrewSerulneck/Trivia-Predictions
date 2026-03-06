import { NextResponse } from "next/server";
import { getTriviaQuota } from "@/lib/trivia";
import { requireAdminAuth } from "@/lib/adminAuth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();

  if (!userId) {
    return NextResponse.json({ ok: true, quota: null });
  }

  const adminAuth = await requireAdminAuth(request);
  const quota = await getTriviaQuota(userId, { forceAdminBypass: adminAuth.ok });
  return NextResponse.json({ ok: true, quota });
}
