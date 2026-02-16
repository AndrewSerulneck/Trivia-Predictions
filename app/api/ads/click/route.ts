import { NextResponse } from "next/server";
import { getAdById, recordAdClick } from "@/lib/ads";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const adId = (searchParams.get("id") ?? "").trim();

  if (!adId) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  const ad = await getAdById(adId);
  if (!ad) {
    return NextResponse.json({ ok: false, error: "Ad not found." }, { status: 404 });
  }

  await recordAdClick(adId);
  return NextResponse.redirect(ad.clickUrl, { status: 302 });
}
