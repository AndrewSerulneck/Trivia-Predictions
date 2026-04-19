import { NextResponse } from "next/server";
import { recordAdImpression } from "@/lib/ads";
import type { AdPageKey } from "@/types";

function isAdPageKey(value: string): value is AdPageKey {
  return ["global", "join", "venue", "trivia", "sports-predictions", "sports-bingo"].includes(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { adId?: string; pageKey?: string; venueId?: string };
    const adId = body.adId?.trim() ?? "";
    const pageKeyRaw = body.pageKey?.trim() ?? "";
    const venueId = body.venueId?.trim() || undefined;
    const pageKey = isAdPageKey(pageKeyRaw) ? pageKeyRaw : undefined;
    if (!adId) {
      return NextResponse.json({ ok: false, error: "adId is required." }, { status: 400 });
    }

    await recordAdImpression(adId, { pageKey, venueId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to record impression." },
      { status: 500 }
    );
  }
}
