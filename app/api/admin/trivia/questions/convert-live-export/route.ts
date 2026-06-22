import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { convertSpeedQuestionToLiveTriviaExportQuestion } from "@/lib/liveTriviaExport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SpeedTriviaQuestionRow = {
  id: string;
  slug: string | null;
  question: string;
  options: unknown;
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
  question_pool: string;
  answer_format: string | null;
  status: string;
};

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
    }

    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.map((id) => String(id ?? "").trim()).filter(Boolean)))
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Select at least one question first." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("trivia_questions")
      .select("id, slug, question, options, correct_answer, category, difficulty, question_pool, answer_format, status")
      .in("id", ids)
      .eq("question_pool", "anytime_blitz")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Failed to load selected Speed Trivia questions.");
    }

    const rows = ((data ?? []) as SpeedTriviaQuestionRow[]).filter(
      (row) => row.question_pool === "anytime_blitz" && row.answer_format === "multiple_choice"
    );

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No eligible Speed Trivia questions were found." }, { status: 400 });
    }

    const converted = await Promise.all(
      rows.map(async (row) => {
        const options = coerceOptions(row.options);
        const answerIndex = Number(row.correct_answer);
        const answer =
          Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] : "";
        if (!answer) {
          throw new Error(`Question "${row.question}" is missing a usable correct answer.`);
        }

        return convertSpeedQuestionToLiveTriviaExportQuestion({
          id: row.id,
          slug: row.slug,
          question: row.question,
          options,
          correctAnswer: answerIndex,
          answer,
          category: row.category,
          difficulty: row.difficulty,
        });
      })
    );

    return NextResponse.json({
      ok: true,
      items: converted.sort((a, b) => {
        const category = a.category.localeCompare(b.category);
        return category !== 0 ? category : a.question.localeCompare(b.question);
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to convert selected questions.",
      },
      { status: 500 }
    );
  }
}
