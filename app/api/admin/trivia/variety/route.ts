import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  VARIETY_CATEGORIES,
  VarietyError,
  addCoverageArea,
  columnsFor,
  parseVarietyCategory,
  parseVarietyGame,
  readVarietyReport,
  setCoverageAreaActive,
} from "@/lib/questionVariety";
import { REVIEW_NO_CACHE } from "@/lib/triviaReviewTransport";

// Admin -> Trivia Questions -> Variety (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a, D14). Free.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: REVIEW_NO_CACHE });

const fail = (error: unknown) =>
  error instanceof VarietyError
    ? json({ ok: false, code: error.code, error: error.message }, error.status)
    : json({ ok: false, code: "failed", error: "Variety failed. Try again." }, 500);

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const url = new URL(request.url);
    const game = parseVarietyGame(url.searchParams.get("game")) ?? "speed";
    const category = parseVarietyCategory(game, url.searchParams.get("category")) ?? VARIETY_CATEGORIES[game][0];
    const report = await readVarietyReport(game, category);
    return json({ ok: true, categories: VARIETY_CATEGORIES, report, columns: columnsFor(category, report.eraSet) });
  } catch (error) {
    return fail(error);
  }
}

type PostBody = { action?: unknown; game?: unknown; category?: unknown; id?: unknown; active?: unknown; name?: unknown; eras?: unknown; note?: unknown };

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    const body = (await request.json().catch(() => ({}))) as PostBody;
    const game = parseVarietyGame(body.game);
    if (!game) return json({ ok: false, error: "Invalid request." }, 400);

    if (body.action === "add") {
      const category = parseVarietyCategory(game, body.category);
      if (!category) return json({ ok: false, error: "Invalid request." }, 400);
      await addCoverageArea({ game, category, name: body.name, eras: body.eras, note: body.note }, `admin:${auth.adminUsername}`);
      return json({ ok: true });
    }

    if (body.action === "toggle") {
      if (typeof body.id !== "string" || !UUID.test(body.id) || typeof body.active !== "boolean") {
        return json({ ok: false, error: "Invalid request." }, 400);
      }
      await setCoverageAreaActive(game, body.id, body.active);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (error) {
    return fail(error);
  }
}
