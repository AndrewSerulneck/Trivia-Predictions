import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { replaceSessionQuestion } from "@/lib/liveShowdownAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PatchBody = {
  question?: string;
  options?: unknown;
  correctAnswer?: number;
  answer?: string;
  status?: string;
};

type QuestionUpdate = {
  question?: string;
  options?: string[];
  correct_answer?: number;
  status?: "active" | "deleted";
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
    }

    const routeParams = await params;
    const id = (routeParams.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }

    const body = (await request.json()) as PatchBody;
    const update: QuestionUpdate = {};

    if (typeof body.question === "string") {
      const question = body.question.trim();
      if (!question) {
        return NextResponse.json({ ok: false, error: "question cannot be empty." }, { status: 400 });
      }
      update.question = question;
    }

    // Write-in answer takes precedence: store as the single option with index 0.
    if (typeof body.answer === "string") {
      const answer = body.answer.trim();
      if (!answer) {
        return NextResponse.json({ ok: false, error: "answer cannot be empty." }, { status: 400 });
      }
      update.options = [answer];
      update.correct_answer = 0;
    } else if (Array.isArray(body.options)) {
      const options = body.options.map((entry) => String(entry ?? "").trim()).filter(Boolean);
      if (options.length < 2) {
        return NextResponse.json({ ok: false, error: "options must contain at least 2 entries." }, { status: 400 });
      }
      update.options = options;

      if (body.correctAnswer !== undefined) {
        const correctAnswer = Number(body.correctAnswer);
        if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
          return NextResponse.json({ ok: false, error: "correctAnswer is out of range." }, { status: 400 });
        }
        update.correct_answer = correctAnswer;
      }
    } else if (body.correctAnswer !== undefined) {
      // correctAnswer without new options — validate against the stored options.
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("trivia_questions")
        .select("options")
        .eq("id", id)
        .limit(1)
        .maybeSingle<{ options: unknown }>();
      if (existingError) {
        throw new Error(existingError.message || "Failed to load question for validation.");
      }
      if (!existing) {
        return NextResponse.json({ ok: false, error: "Question not found." }, { status: 404 });
      }
      const optionCount = Array.isArray(existing.options) ? existing.options.length : 0;
      const correctAnswer = Number(body.correctAnswer);
      if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= optionCount) {
        return NextResponse.json({ ok: false, error: "correctAnswer is out of range." }, { status: 400 });
      }
      update.correct_answer = correctAnswer;
    }

    if (body.status !== undefined) {
      const status = String(body.status).trim();
      if (status !== "active" && status !== "deleted") {
        return NextResponse.json({ ok: false, error: "status must be 'active' or 'deleted'." }, { status: 400 });
      }
      update.status = status;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("trivia_questions")
      .update(update)
      .eq("id", id)
      .select("id, slug, question, options, correct_answer, category, difficulty, question_pool, status, answer_format, created_at")
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to update question.");
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Question not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, question: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update question." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
    }

    const routeParams = await params;
    const id = (routeParams.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }

    // Soft delete — keep the row so seeded games referencing it stay intact.
    const { data, error } = await supabaseAdmin
      .from("trivia_questions")
      .update({ status: "deleted" })
      .eq("id", id)
      .select("id, slug")
      .limit(1)
      .maybeSingle<{ id: string; slug: string | null }>();

    if (error) {
      throw new Error(error.message || "Failed to delete question.");
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Question not found." }, { status: 404 });
    }

    // Replace this slug wherever it is still mapped to today's or a future
    // occurrence. Past occurrences are left untouched (their answers already exist).
    let replacementsPerformed = 0;
    const deletedSlug = String(data.slug ?? "").trim();
    if (deletedSlug) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: affectedData, error: affectedError } = await supabaseAdmin
        .from("trivia_session_questions")
        .select("schedule_id, occurrence_date, round_number, question_index")
        .eq("question_id", deletedSlug)
        .gte("occurrence_date", today);

      if (affectedError) {
        throw new Error(affectedError.message || "Failed to find affected session questions.");
      }

      const affected = (affectedData ?? []) as Array<{
        schedule_id: string;
        occurrence_date: string;
        round_number: number;
        question_index: number;
      }>;

      if (affected.length > 0) {
        const scheduleIds = Array.from(new Set(affected.map((row) => row.schedule_id).filter(Boolean)));
        const { data: scheduleData, error: scheduleError } = await supabaseAdmin
          .from("trivia_schedules")
          .select("id, venue_id")
          .in("id", scheduleIds);
        if (scheduleError) {
          throw new Error(scheduleError.message || "Failed to resolve schedule venues.");
        }
        const venueBySchedule = new Map(
          ((scheduleData ?? []) as Array<{ id: string; venue_id: string | null }>).map((row) => [
            String(row.id),
            String(row.venue_id ?? "").trim(),
          ])
        );

        for (const row of affected) {
          try {
            await replaceSessionQuestion(
              row.schedule_id,
              row.occurrence_date,
              row.round_number,
              row.question_index,
              venueBySchedule.get(row.schedule_id) ?? "",
              deletedSlug
            );
            replacementsPerformed += 1;
          } catch (replacementError) {
            // Don't fail the whole delete if one slot can't be replaced.
            console.warn(
              `[trivia delete] Failed to replace slot ${row.schedule_id}/${row.occurrence_date}/R${row.round_number}Q${row.question_index}:`,
              replacementError instanceof Error ? replacementError.message : replacementError
            );
          }
        }
      }
    }

    return NextResponse.json({ ok: true, id, replacementsPerformed });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete question." },
      { status: 500 }
    );
  }
}
