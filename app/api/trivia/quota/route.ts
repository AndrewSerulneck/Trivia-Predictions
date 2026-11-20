import { NextResponse } from "next/server";
import { getTriviaQuota } from "@/lib/trivia";
import { getHiddenSpeedCategories } from "@/lib/speedTriviaCategoryVisibility";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();
  // D11: the category picker reads gated-category visibility from this response it already loads.
  // Both reads run at once; a request with no user id gets the categories only.
  const [hidden, quota] = await Promise.all([getHiddenSpeedCategories(), userId ? getTriviaQuota(userId) : null]);
  return NextResponse.json({ ok: true, quota, hiddenCategories: [...hidden] });
}
