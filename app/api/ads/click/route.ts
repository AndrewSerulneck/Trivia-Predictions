import { NextResponse } from "next/server";
import { getAdById, recordAdClick } from "@/lib/ads";
import type { AdPageKey } from "@/types";

function isAdPageKey(value: string): value is AdPageKey {
  return ["global", "join", "venue", "trivia", "sports-predictions", "sports-bingo"].includes(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const adId = (searchParams.get("id") ?? "").trim();
  const pageKeyRaw = (searchParams.get("pageKey") ?? "").trim();
  const venueId = (searchParams.get("venueId") ?? "").trim() || undefined;
  const pageKey = isAdPageKey(pageKeyRaw) ? pageKeyRaw : undefined;

  if (!adId) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const ad = await getAdById(adId);
  if (!ad) {
    return NextResponse.json({ ok: false, error: "Ad not found." }, { status: 404 });
  }

  await recordAdClick(adId, { pageKey, venueId });
  return NextResponse.redirect(ad.clickUrl, { status: 302 });
}
