import { NextResponse } from "next/server";
import { pollPairingCode } from "@/lib/tvPairing";

// Public (no auth) — the TV polls this to learn when its code has been claimed.
// Reachable via the proxy.ts carve-out. Returns the claimed venueId exactly once
// (the poll that flips the code to consumed), so the TV can redirect itself.
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const result = await pollPairingCode(code);
    // `not_found` is a 404 so a mistyped/expired-and-swept code reads correctly on the TV.
    const status = result.status === "not_found" ? 404 : 200;
    return NextResponse.json({ ok: result.status !== "not_found", ...result }, { status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to check pairing code." },
      { status: 500 },
    );
  }
}
