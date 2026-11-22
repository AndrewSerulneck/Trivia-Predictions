import { NextResponse } from "next/server";
import { findVenueIdByDisplayCode } from "@/lib/displayCodeLookup";
import { rateLimit } from "@/lib/rateLimit";
import { parseTypedDisplayCode, TV_CONNECT_COPY, type TvDisplayCodeResult } from "@/lib/tvConnectShared";

/**
 * POST /api/tv-app/display-code — the TV typed a 4-character display code (docs/fire-tv-app-plan.md Phase 3).
 * Body `{ code }`. Answers the venue id only, the same exposure as the public short link /tv/<code>. Per-IP limited.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256;

const json = (body: TvDisplayCodeResult, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const POST = async (request: Request) => {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: TV_CONNECT_COPY.codeNotFound }, 400);
  let input: unknown = null;
  try {
    input = (JSON.parse(raw || "{}") as { code?: unknown }).code;
  } catch {
    input = null;
  }
  const code = parseTypedDisplayCode(typeof input === "string" ? input : "");
  // A malformed code never costs a database read or a rate-limit slot.
  if (!code) return json({ ok: false, error: TV_CONNECT_COPY.codeNotFound }, 400);

  const limit = await rateLimit(request, "tvDisplayCode");
  if (!limit.allowed) {
    return json({ ok: false, error: "Try again in a minute." }, limit.unavailable ? 503 : 429, {
      "Retry-After": String(Math.max(1, limit.retryAfterSeconds)),
    });
  }

  const venueId = await findVenueIdByDisplayCode(code);
  if (!venueId) return json({ ok: false, error: TV_CONNECT_COPY.codeNotFound }, 404);
  return json({ ok: true, venueId });
};
