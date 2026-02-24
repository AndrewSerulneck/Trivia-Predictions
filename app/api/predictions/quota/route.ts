import { NextResponse } from "next/server";
import { getPredictionQuota } from "@/lib/userPredictions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();

  if (!userId) {
    return NextResponse.json({ ok: true, quota: null });
  }

  const quota = await getPredictionQuota(userId);
  return NextResponse.json({ ok: true, quota });
}
