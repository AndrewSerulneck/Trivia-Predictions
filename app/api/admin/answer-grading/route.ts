import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { explainWriteInAnswerMatchWithVariants } from "@/lib/liveShowdownGrading";

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function coerceOptionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as {
      submitted?: unknown;
      correct?: unknown;
      acceptableAnswers?: unknown;
      questionId?: unknown;
      answerIndex?: unknown;
      answerVariantIndexes?: unknown;
    };

    const submitted = String(body.submitted ?? "");
    const correct = String(body.correct ?? "");
    const acceptableAnswers = coerceStringArray(body.acceptableAnswers);
    const questionId = String(body.questionId ?? "").trim() || undefined;
    const answerIndex = coerceOptionalInteger(body.answerIndex);
    const answerVariantIndexes = coerceStringArray(body.answerVariantIndexes)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0);

    const evaluation = await explainWriteInAnswerMatchWithVariants(
      submitted,
      correct,
      questionId,
      answerIndex,
      acceptableAnswers,
      answerVariantIndexes
    );

    return NextResponse.json({ ok: true, evaluation });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to evaluate answer grading." },
      { status: 500 }
    );
  }
}
