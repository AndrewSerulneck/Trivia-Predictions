import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { createTvPairing } from "@/lib/tvConnect";
import type { TvPairingCreated } from "@/lib/tvConnectShared";

/**
 * POST /api/tv-app/pairings — the TV's Connect screen asks for a connect code (docs/fire-tv-app-plan.md Phase 3).
 * Public (a TV has no session) and rate-limited per IP. Answers `{ ok, pairCode, pollSecret, expiresAt }`; the
 * secret is shown only to this TV and only its hash is stored.
 */
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const POST = async (request: Request) => {
  const limit = await rateLimit(request, "tvPairCreate");
  if (!limit.allowed) {
    return json({ ok: false, error: "Try again in a minute." }, limit.unavailable ? 503 : 429, {
      "Retry-After": String(Math.max(1, limit.retryAfterSeconds)),
    });
  }
  const created = await createTvPairing();
  if (!created) return json({ ok: false, error: "Can't connect." }, 503);
  const body: TvPairingCreated = { ok: true, ...created };
  return json(body);
};
