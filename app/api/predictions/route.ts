import { NextResponse } from "next/server";
import { getPredictionMarkets } from "@/lib/polymarket";
import { submitPredictionPick } from "@/lib/userPredictions";

export async function GET() {
  const markets = await getPredictionMarkets();
  return NextResponse.json({ ok: true, markets });
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

    return NextResponse.json({ ok: true, pick });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to submit prediction pick." },
      { status: 500 }
    );
  }
}
