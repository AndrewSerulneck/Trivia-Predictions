import { NextResponse } from "next/server";
import { recordAdImpression } from "@/lib/ads";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { adId?: string };
    const adId = body.adId?.trim() ?? "";
    if (!adId) {
      return NextResponse.json({ ok: false, error: "adId is required." }, { status: 400 });
    }

    await recordAdImpression(adId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to record impression." },
      { status: 500 }
    );
  }
}
