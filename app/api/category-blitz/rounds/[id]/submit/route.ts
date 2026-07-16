import { NextResponse } from "next/server";
import { isSessionEnforced, readSession } from "@/lib/serverSession";
import { submitAnswer } from "@/lib/categoryBlitz";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { maybeRequireActiveVenuePresence, venuePresenceErrorResponse } from "@/lib/venuePresence";

/** POST /api/category-blitz/rounds/[id]/submit — player submits an answer for one category */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionUserId = readSession(request);
    if (isSessionEnforced() && !sessionUserId) {
      return NextResponse.json({ ok: false, error: "Session required." }, { status: 401 });
    }

    const body = (await request.json()) as {
      userId?: string;
      venueId?: string;
      categoryIndex?: number;
      answer?: string;
    };

    const venueId = String(body.venueId ?? "").trim();
    const categoryIndex = Number(body.categoryIndex ?? -1);
    const answer = String(body.answer ?? "").trim();

    if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    if (categoryIndex < 0 || categoryIndex > 11) {
      return NextResponse.json({ ok: false, error: "categoryIndex must be 0–11." }, { status: 400 });
    }
    if (!answer) return NextResponse.json({ ok: false, error: "answer is required." }, { status: 400 });

    // Resolve userId/authId from the session's user id (or body fallback in dev).
    let userId = String(body.userId ?? "").trim();
    let authId = "";

    if (sessionUserId && supabaseAdmin) {
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("id, auth_id")
        .eq("id", sessionUserId)
        .eq("venue_id", venueId)
        .maybeSingle<{ id: string; auth_id: string | null }>();

      if (!userRow) {
        return NextResponse.json({ ok: false, error: "User not found at this venue." }, { status: 404 });
      }
      userId = userRow.id;
      authId = userRow.auth_id ?? "";
    }

    // When session is enforced (production), we require userId resolved from
    // the session. When session is NOT enforced (dev), accept the
    // client-supplied userId from the request body — the client's getUserId()
    // reads the same tp:user-id source the entire UI uses for lookups.
    //
    // authId (the Supabase Auth identity) is best-effort only — accounts
    // created via username+PIN alone have no auth_id, and that's fine;
    // public.users.id is the durable identity for submissions.
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Could not resolve user." }, { status: 400 });
    }

    await maybeRequireActiveVenuePresence({ userId, venueId });

    const { id: roundId } = await params;
    const submission = await submitAnswer({ roundId, userId, authId, venueId, categoryIndex, answer });
    return NextResponse.json({ ok: true, submission });
  } catch (error) {
    const presenceResponse = venuePresenceErrorResponse(error);
    if (presenceResponse) return presenceResponse;

    const message = error instanceof Error ? error.message : "Failed to submit answer.";
    const status =
      message.includes("not found") ? 404 :
      message.includes("expired") || message.includes("no longer") ? 400 :
      message.includes("empty") || message.includes("too long") ? 400 :
      500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
