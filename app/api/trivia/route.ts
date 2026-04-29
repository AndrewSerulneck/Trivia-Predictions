import { NextResponse } from "next/server";
import { getTriviaQuestions, submitTriviaAnswer, TriviaLimitReachedError } from "@/lib/trivia";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId")?.trim() || undefined;
  const questions = await getTriviaQuestions(15, userId);
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
    if (error instanceof TriviaLimitReachedError) {
      return NextResponse.json(
        { ok: false, error: error.message, quota: error.quota },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to submit answer." },
      { status: 500 }
    );
  }
}
