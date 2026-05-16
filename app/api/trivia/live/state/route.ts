import { NextResponse } from "next/server";
import { getLiveShowdownState } from "@/lib/liveShowdownEngine";

export async function GET() {
  try {
    const state = await getLiveShowdownState(Date.now());
    return NextResponse.json({ ok: true, state, serverTimestamp: Date.now() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load live showdown state." },
      { status: 500 }
    );
  }
}
