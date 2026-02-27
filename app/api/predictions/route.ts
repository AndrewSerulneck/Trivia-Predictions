import { NextResponse } from "next/server";
import { listPredictionMarkets } from "@/lib/polymarket";
import { getPredictionQuota, submitPredictionPick } from "@/lib/userPredictions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await listPredictionMarkets({
      page: searchParams.get("page") ?? 1,
      pageSize: searchParams.get("pageSize") ?? 100,
      search: searchParams.get("search") ?? "",
      category: searchParams.get("category") ?? "",
      broadCategory: searchParams.get("broadCategory") ?? "",
      sort: searchParams.get("sort") ?? "closing-soon",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to load Polymarket markets right now.",
      },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      predictionId?: string;
      outcomeId?: string;
    };

    if (!body.userId || !body.predictionId || !body.outcomeId) {
      return NextResponse.json(
        { ok: false, error: "userId, predictionId, and outcomeId are required." },
        { status: 400 }
      );
    }

    const pick = await submitPredictionPick({
      userId: body.userId,
      predictionId: body.predictionId,
      outcomeId: body.outcomeId,
    });

    const quota = await getPredictionQuota(body.userId);

    return NextResponse.json({ ok: true, pick, quota });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to submit prediction pick." },
      { status: 500 }
    );
  }
}
