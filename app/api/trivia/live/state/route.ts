import { NextResponse } from "next/server";
import { getLiveShowdownState } from "@/lib/liveShowdownEngine";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const venueId = String(url.searchParams.get("venueId") ?? "").trim();
    const userId = String(url.searchParams.get("userId") ?? "").trim();
    const state = await getLiveShowdownState(Date.now(), venueId, userId);
    return NextResponse.json({ ok: true, state, serverTimestamp: Date.now() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load live showdown state." },
      { status: 500 }
    );
  }
}
