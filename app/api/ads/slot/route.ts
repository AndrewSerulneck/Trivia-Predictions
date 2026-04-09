import { NextResponse } from "next/server";
import { getActiveAdForSlot } from "@/lib/ads";
import type { AdSlot } from "@/types";

function isAdSlot(value: string): value is AdSlot {
  return [
    "header",
    "inline-content",
    "sidebar",
    "mid-content",
    "leaderboard-sidebar",
    "footer",
    "popup-on-entry",
    "popup-on-scroll",
  ].includes(value);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slotParam = (searchParams.get("slot") ?? "").trim();
    const venueId = (searchParams.get("venueId") ?? "").trim() || undefined;

    if (!isAdSlot(slotParam)) {
      return NextResponse.json({ ok: false, error: "Invalid ad slot." }, { status: 400 });
    }

    const ad = await getActiveAdForSlot(slotParam, venueId);
    return NextResponse.json({ ok: true, ad });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load ad slot.",
      },
      { status: 500 }
    );
  }
}
