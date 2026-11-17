import { NextResponse } from "next/server";
import { getTriviaQuota } from "@/lib/trivia";
import { getHiddenSpeedCategories } from "@/lib/speedTriviaCategoryVisibility";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();
  // D11: the category picker reads gated-category visibility from this response it already loads.
  const hiddenCategories = [...(await getHiddenSpeedCategories())];

  if (!userId) {
    return NextResponse.json({ ok: true, quota: null, hiddenCategories });
  }

  const quota = await getTriviaQuota(userId);
  return NextResponse.json({ ok: true, quota, hiddenCategories });
}
