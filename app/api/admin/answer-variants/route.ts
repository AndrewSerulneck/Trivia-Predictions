import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getAnswerVariantsStats, regenerateAllAnswerVariants } from "@/lib/triviaAnswerVariants";

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as { action?: string };
    const action = String(body.action ?? "").trim().toLowerCase();

    if (action === "regenerate") {
      const result = await regenerateAllAnswerVariants();
      return NextResponse.json({
        ok: true,
        message: "Answer variants regeneration complete.",
        result,
      });
    }

    if (action === "stats") {
      const stats = await getAnswerVariantsStats();
      return NextResponse.json({ ok: true, stats });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action. Use 'regenerate' or 'stats'." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to process answer variants request." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const stats = await getAnswerVariantsStats();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch answer variants stats." },
      { status: 500 }
    );
  }
}

