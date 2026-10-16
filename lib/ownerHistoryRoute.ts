import "server-only";

import { NextResponse } from "next/server";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";

// The one gate every Game Results and Results route goes through (docs/live-trivia-weekly-places-reward-plan.md
// §5f, docs/partner-results-page-plan.md §5e): a signed-in partner, and a `venueId` they control — checked BEFORE any history is read.
// Partners only ever read; nothing here writes.

/** Run `read` for the partner's venue, or answer 401 / 400 / 403 / 404 / 503 / 500. */
export const withOwnerVenue = async (
  request: Request,
  read: (venueId: string) => Promise<Record<string, unknown>>,
): Promise<Response> => {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const venueId = new URL(request.url).searchParams.get("venueId")?.trim() ?? "";
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this venue." }, { status: 403 });
  }

  try {
    const body = await read(venueId);
    return NextResponse.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ResultsNotFoundError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
    }
    if (error instanceof ResultsUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    console.error("[OwnerHistory] read-failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Couldn't load game results." }, { status: 500 });
  }
};
