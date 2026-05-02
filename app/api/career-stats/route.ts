import { NextResponse } from "next/server";
import { getCareerStatsForUser } from "@/lib/careerStats";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  }

  try {
    const stats = await getCareerStatsForUser(userId);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load career stats.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
