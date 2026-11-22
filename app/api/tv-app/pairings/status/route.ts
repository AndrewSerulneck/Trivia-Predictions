import { NextResponse } from "next/server";
import { parsePollSecret, readTvPairingStatus } from "@/lib/tvConnect";
import { TV_PAIR_SECRET_HEADER } from "@/lib/tvConnectShared";

/**
 * GET /api/tv-app/pairings/status — the TV asks "has anyone connected me?" every 3 s while its Connect screen is
 * visible (docs/fire-tv-app-plan.md Phase 3). The secret travels in the `x-tv-pair-secret` header, never the URL.
 * `connected` is read once (the row is deleted). No rate limit: a 32-byte secret can't be guessed, each call is
 * one indexed read, and a limiter would add a database write to every poll.
 */
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const GET = async (request: Request) => {
  const secret = parsePollSecret(request.headers.get(TV_PAIR_SECRET_HEADER));
  if (!secret) return json({ ok: false, error: "Missing secret." }, 400);
  const status = await readTvPairingStatus(secret);
  if (!status) return json({ ok: false, error: "Can't connect." }, 503);
  return json(status);
};
