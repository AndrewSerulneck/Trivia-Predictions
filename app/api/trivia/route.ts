import { NextResponse } from "next/server";
import { getTriviaQuestions, submitTriviaAnswer } from "@/lib/trivia";

export async function GET() {
  const questions = await getTriviaQuestions();
  return NextResponse.json({ ok: true, questions });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      questionId?: string;
      answer?: number;
      timeElapsed?: number;
    };

    if (!body.questionId || typeof body.answer !== "number") {
      return NextResponse.json(
        { ok: false, error: "questionId and numeric answer are required." },
        { status: 400 }
      );
    }

    const result = await submitTriviaAnswer({
      userId: body.userId,
      questionId: body.questionId,
      answer: body.answer,
      timeElapsed: body.timeElapsed ?? 0,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to submit answer." },
      { status: 500 }
    );
  }
}
