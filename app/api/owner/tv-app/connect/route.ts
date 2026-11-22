import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { claimTvPairing } from "@/lib/tvConnect";
import type { TvConnectResult } from "@/lib/tvConnectShared";

/**
 * POST /api/owner/tv-app/connect — a signed-in partner connects the TV showing a QR code to one of their venues
 * (docs/fire-tv-app-plan.md Phase 3). Body `{ pairCode, venueId }`.
 *
 * Gate order: owner session → owner rate limit → body → ownership + unexpired, unclaimed code (lib/tvConnect.ts).
 * The TV gets the venue id only (plan D9); no session or privilege moves to it.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;

const STATUS: Record<Exclude<TvConnectResult, { ok: true }>["code"], number> = {
  expired: 410,
  not_your_venue: 403,
  invalid: 400,
  rate_limited: 429,
  unavailable: 503,
};

const json = (body: TvConnectResult, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const POST = async (request: Request) => {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const limit = await rateLimit(request, "tvConnectOwner", { identity: auth.ownerId, ignoreIp: true });
  if (!limit.allowed) {
    const code = limit.unavailable ? "unavailable" : "rate_limited";
    return json({ ok: false, code, error: "Try again in a minute." }, STATUS[code], {
      "Retry-After": String(Math.max(1, limit.retryAfterSeconds)),
    });
  }

  const raw = await request.text().catch(() => "");
  let body: Record<string, unknown> = {};
  if (raw.length <= MAX_BODY_BYTES) {
    try {
      const parsed: unknown = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const result = await claimTvPairing({
    rawPairCode: body.pairCode,
    venueId: body.venueId,
    ownerVenueIds: auth.venueIds,
  });
  return result.ok ? json(result) : json(result, STATUS[result.code]);
};
