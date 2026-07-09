import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type QuestionStatus = "pending_review" | "active" | "deleted";
type QuestionPool = "live_showdown" | "anytime_blitz";

type TriviaQuestionRow = {
  id: string;
  slug: string | null;
  question: string;
  options: unknown;
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
  question_pool: QuestionPool;
  status: QuestionStatus;
  answer_format: string | null;
  created_at: string;
};

const VALID_STATUSES: ReadonlySet<string> = new Set(["pending_review", "active", "deleted"]);
const VALID_POOLS: ReadonlySet<string> = new Set(["live_showdown", "anytime_blitz"]);
const SELECT_COLUMNS =
  "id, slug, question, options, correct_answer, category, difficulty, question_pool, status, answer_format, created_at";

function coerceOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry ?? "").trim());
}

function normalizeAnswerKey(value: string): string {
  return String(value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function sanitizeAcceptableAnswers(values: string[], canonicalAnswer: string): string[] {
  const seen = new Set([normalizeAnswerKey(canonicalAnswer)]);
  const answers: string[] = [];
  for (const value of values) {
    const answer = String(value ?? "").trim();
    const key = normalizeAnswerKey(answer);
    if (!answer || !key || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }
  return answers;
}

function mapRow(row: TriviaQuestionRow) {
  const options = coerceOptions(row.options);
  const answerIndex = Number.isInteger(row.correct_answer) ? row.correct_answer : -1;
  const answer = answerIndex >= 0 && answerIndex < options.length ? options[answerIndex] : "";
  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    options,
    correctAnswer: answerIndex,
    answer,
    acceptableAnswers:
      row.answer_format === "write_in" || row.answer_format === "numeric" || row.answer_format === "true_false"
        ? sanitizeAcceptableAnswers(options.filter((_, index) => index !== answerIndex), answer)
        : [],
    category: row.category,
    difficulty: row.difficulty,
    pool: row.question_pool,
    status: row.status,
    answerFormat: row.answer_format,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
    }

    const url = new URL(request.url);
    const statusParam = String(url.searchParams.get("status") ?? "pending_review").trim();
    const status = VALID_STATUSES.has(statusParam) ? statusParam : "pending_review";
    const poolParam = String(url.searchParams.get("pool") ?? "").trim();
    const pool = VALID_POOLS.has(poolParam) ? poolParam : null;
    const categoryParam = String(url.searchParams.get("category") ?? "").trim();
    const limit = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get("limit")) || 50)));
    const offset = Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0));

    let query = supabaseAdmin
      .from("trivia_questions")
      .select(SELECT_COLUMNS, { count: "exact" })
      .eq("status", status);
    if (pool) query = query.eq("question_pool", pool);
    if (categoryParam) query = query.eq("category", categoryParam);

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(error.message || "Failed to load trivia questions.");
    }

    const items = ((data ?? []) as unknown as TriviaQuestionRow[]).map(mapRow);
    return NextResponse.json({ ok: true, items, total: count ?? 0, limit, offset });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load trivia questions." },
      { status: 500 }
    );
  }
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

    const body = (await request.json()) as { action?: string; ids?: unknown; pool?: string };
    const action = String(body.action ?? "").trim().toLowerCase();
    const poolParam = String(body.pool ?? "").trim();
    const pool = VALID_POOLS.has(poolParam) ? poolParam : null;
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.map((id) => String(id ?? "").trim()).filter(Boolean)))
      : [];

    if (action !== "approve" && action !== "delete") {
      return NextResponse.json({ ok: false, error: "Unknown action. Use 'approve' or 'delete'." }, { status: 400 });
    }
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "ids is required." }, { status: 400 });
    }

    const nextStatus: QuestionStatus = action === "approve" ? "active" : "deleted";
    let query = supabaseAdmin
      .from("trivia_questions")
      .update({ status: nextStatus })
      .in("id", ids);
    if (pool) query = query.eq("question_pool", pool);

    const { data, error } = await query.select("id");

    if (error) {
      throw new Error(error.message || "Failed to update trivia questions.");
    }

    return NextResponse.json({ ok: true, action, status: nextStatus, updated: (data ?? []).length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update trivia questions." },
      { status: 500 }
    );
  }
}
