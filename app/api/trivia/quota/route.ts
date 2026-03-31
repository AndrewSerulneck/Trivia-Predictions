import { NextResponse } from "next/server";
import { getTriviaQuota } from "@/lib/trivia";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();

  if (!userId) {
    return NextResponse.json({ ok: true, quota: null });
  }

  const quota = await getTriviaQuota(userId);
  return NextResponse.json({ ok: true, quota });
}
