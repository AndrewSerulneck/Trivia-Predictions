import { NextResponse } from "next/server";
import {
  claimSportsBingoReward,
  createSportsBingoCard,
  generateSportsBingoBoard,
  listUserSportsBingoCards,
} from "@/lib/sportsBingo";

function normalizeBoolean(value: string | null, fallback = false): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get("userId") ?? "").trim();
    const includeSettled = normalizeBoolean(searchParams.get("includeSettled"), true);

    if (!userId) {
      return NextResponse.json({ ok: true, cards: [] });
    }

    const cards = await listUserSportsBingoCards({
      userId,
      includeSettled,
      refreshProgress: true,
    });

    return NextResponse.json({
      ok: true,
      cards,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Sports Bingo cards.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as
      | {
          action?: string;
          gameId?: string;
          sportKey?: string;
        }
      | {
          action?: string;
          userId?: string;
          venueId?: string;
          gameId?: string;
          sportKey?: string;
          squares?: unknown;
        };

    const action = String(body.action ?? "").trim().toLowerCase();

    if (action === "generate") {
      const gameId = String(body.gameId ?? "").trim();
      if (!gameId) {
        return NextResponse.json({ ok: false, error: "gameId is required for board generation." }, { status: 400 });
      }

      const board = await generateSportsBingoBoard({
        gameId,
        sportKey: String(body.sportKey ?? "basketball_nba"),
      });
      return NextResponse.json({ ok: true, board });
    }

    if (action === "play") {
      const userId = String((body as { userId?: string }).userId ?? "").trim();
      const venueId = String((body as { venueId?: string }).venueId ?? "").trim();
      const gameId = String((body as { gameId?: string }).gameId ?? "").trim();
      const squares = (body as { squares?: unknown }).squares;

      if (!userId || !venueId || !gameId || !squares) {
        return NextResponse.json(
          { ok: false, error: "userId, venueId, gameId, and squares are required to play." },
          { status: 400 }
        );
      }

      const card = await createSportsBingoCard({
        userId,
        venueId,
        gameId,
        sportKey: String((body as { sportKey?: string }).sportKey ?? "basketball_nba"),
        squares,
      });

      return NextResponse.json({ ok: true, card });
    }

    if (action === "claim") {
      const userId = String((body as { userId?: string }).userId ?? "").trim();
      const cardId = String((body as { cardId?: string }).cardId ?? "").trim();
      if (!userId || !cardId) {
        return NextResponse.json(
          { ok: false, error: "userId and cardId are required to claim Bingo points." },
          { status: 400 }
        );
      }

      const result = await claimSportsBingoReward({ userId, cardId });
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json(
      { ok: false, error: 'Unknown action. Use action="generate", action="play", or action="claim".' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to process Sports Bingo request.",
      },
      { status: 500 }
    );
  }
}
