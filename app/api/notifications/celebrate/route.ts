import { NextResponse } from "next/server";
import { stampCelebrationNotifications } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; game?: string };
    const userId = (body.userId ?? "").trim();
    const game = (body.game ?? "").trim();

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
    }
    if (game !== "bingo" && game !== "fantasy" && game !== "pickem") {
      return NextResponse.json({ ok: false, error: "game must be bingo, fantasy, or pickem." }, { status: 400 });
    }

    const result = await stampCelebrationNotifications({ userId, game });
    return NextResponse.json({ ok: true, celebrate: result.celebrate, delta: result.delta });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to stamp celebration." },
      { status: 500 }
    );
  }
}
