import { NextResponse } from "next/server";
import { mintPairingCode } from "@/lib/tvPairing";

// Public (no auth) — a TV browser has no cookies. Reachable via the proxy.ts
// carve-out. Mints a short-lived pairing code for the TV to display.
export const runtime = "nodejs";

export async function POST() {
  try {
    const { code, expiresAt } = await mintPairingCode();
    return NextResponse.json({ ok: true, code, expiresAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create pairing code." },
      { status: 500 },
    );
  }
}
