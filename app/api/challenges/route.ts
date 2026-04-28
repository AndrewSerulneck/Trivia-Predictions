import { NextResponse } from "next/server";
import {
  createChallengeInvite,
  listUserChallenges,
  respondToChallengeInvite,
} from "@/lib/competition";
import type { ChallengeGameType } from "@/types";

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("not found") ||
    normalized.includes("cannot") ||
    normalized.includes("must") ||
    normalized.includes("only") ||
    normalized.includes("pending")
  ) {
    return 400;
  }
  return 500;
}

function normalizeBoolean(value: string | null, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("userId") ?? "").trim();
    const venueId = String(searchParams.get("venueId") ?? "").trim();
    const includeResolved = normalizeBoolean(searchParams.get("includeResolved"), true);
    const challenges = await listUserChallenges({
      userId,
      venueId: venueId || undefined,
      includeResolved,
      limit: 300,
    });
    return NextResponse.json({ ok: true, challenges });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load challenges.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      senderUserId?: string;
      userId?: string;
      venueId?: string;
      receiverUsername?: string;
      gameType?: ChallengeGameType;
      challengeTitle?: string;
      challengeDetails?: string;
      expiresAt?: string;
      challengeId?: string;
      response?: "accept" | "decline" | "cancel" | "complete";
    };

    const action = String(body.action ?? "").trim().toLowerCase();
    if (action === "create") {
      const challenge = await createChallengeInvite({
        senderUserId: String(body.senderUserId ?? body.userId ?? "").trim(),
        venueId: String(body.venueId ?? "").trim() || undefined,
        receiverUsername: String(body.receiverUsername ?? "").trim(),
        gameType: String(body.gameType ?? "").trim().toLowerCase() as ChallengeGameType,
        challengeTitle: String(body.challengeTitle ?? "").trim() || undefined,
        challengeDetails: String(body.challengeDetails ?? "").trim() || undefined,
        expiresAt: String(body.expiresAt ?? "").trim() || undefined,
      });
      return NextResponse.json({ ok: true, challenge });
    }

    if (action === "respond") {
      const response = String(body.response ?? "").trim().toLowerCase() as
        | "accept"
        | "decline"
        | "cancel"
        | "complete";
      const challenge = await respondToChallengeInvite({
        userId: String(body.userId ?? "").trim(),
        challengeId: String(body.challengeId ?? "").trim(),
        action: response,
      });
      return NextResponse.json({ ok: true, challenge });
    }

    return NextResponse.json(
      { ok: false, error: 'Unknown action. Use action="create" or action="respond".' },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process challenge request.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
