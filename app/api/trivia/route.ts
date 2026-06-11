import { NextResponse } from "next/server";
import { getTriviaQuestions, submitTriviaAnswer, TriviaLimitReachedError } from "@/lib/trivia";
import { isSessionEnforced, readSession } from "@/lib/serverSession";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId")?.trim() || undefined;
  const category = searchParams.get("category")?.trim() || undefined;
  const questions = await getTriviaQuestions(15, userId, category);
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

    const sessionUserId = readSession(request);
    if (isSessionEnforced() && !sessionUserId) {
      return NextResponse.json({ ok: false, error: "Session required." }, { status: 401 });
    }
    const userId = sessionUserId ?? body.userId;

    const result = await submitTriviaAnswer({
      userId,
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
