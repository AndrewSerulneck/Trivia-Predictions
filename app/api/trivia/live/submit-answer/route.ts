import { NextResponse } from "next/server";
import { submitLiveShowdownAnswer } from "@/lib/liveShowdownSubmission";
import { maybeRequireActiveVenuePresence, venuePresenceErrorResponse } from "@/lib/venuePresence";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      venueId?: string;
      scheduleId?: string;
      roundNumber?: number;
      questionIndex?: number;
      submittedAnswer?: string;
      occurrenceDate?: string;
    };

    const userId = String(body.userId ?? "").trim();
    const venueId = String(body.venueId ?? "").trim();
    const scheduleId = String(body.scheduleId ?? "").trim();
    const submittedAnswer = String(body.submittedAnswer ?? "").trim();
    const roundNumber = Number(body.roundNumber);
    const questionIndex = Number(body.questionIndex);
    // Accept client hint but server derives the authoritative value independently.
    const occurrenceDateHint = String(body.occurrenceDate ?? "").trim() || undefined;

    if (!userId || !venueId || !scheduleId || !submittedAnswer || !Number.isFinite(roundNumber) || !Number.isFinite(questionIndex)) {
      return NextResponse.json(
        {
          ok: false,
          error: "userId, venueId, scheduleId, roundNumber, questionIndex, and submittedAnswer are required.",
        },
        { status: 400 }
      );
    }

    await maybeRequireActiveVenuePresence({ userId, venueId });

    const result = await submitLiveShowdownAnswer({
      userId,
      venueId,
      scheduleId,
      roundNumber,
      questionIndex,
      submittedAnswer,
      occurrenceDate: occurrenceDateHint,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const presenceResponse = venuePresenceErrorResponse(error);
    if (presenceResponse) return presenceResponse;

    const message = error instanceof Error ? error.message : "Failed to submit Live Showdown answer.";
    const status =
      /required|invalid/i.test(message)
        ? 400
        : /only accepted during the answering phase|currently active|does not match the currently active schedule slot|venue does not match/i.test(
            message
          )
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
