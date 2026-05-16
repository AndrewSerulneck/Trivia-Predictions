import { NextResponse } from "next/server";
import { submitLiveShowdownAnswer } from "@/lib/liveShowdownSubmission";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      scheduleId?: string;
      roundNumber?: number;
      questionIndex?: number;
      submittedAnswer?: string;
    };

    const userId = String(body.userId ?? "").trim();
    const scheduleId = String(body.scheduleId ?? "").trim();
    const submittedAnswer = String(body.submittedAnswer ?? "").trim();
    const roundNumber = Number(body.roundNumber);
    const questionIndex = Number(body.questionIndex);

    if (!userId || !scheduleId || !submittedAnswer || !Number.isFinite(roundNumber) || !Number.isFinite(questionIndex)) {
      return NextResponse.json(
        {
          ok: false,
          error: "userId, scheduleId, roundNumber, questionIndex, and submittedAnswer are required.",
        },
        { status: 400 }
      );
    }

    const result = await submitLiveShowdownAnswer({
      userId,
      scheduleId,
      roundNumber,
      questionIndex,
      submittedAnswer,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit Live Showdown answer.";
    const status =
      /required|invalid/i.test(message)
        ? 400
        : /only accepted during the answering phase|currently active|does not match the currently active schedule slot/i.test(message)
        ? 409
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
