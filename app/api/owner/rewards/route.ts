import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import {
  REWARD_GAME_WINNER_UNSUPPORTED_MESSAGE,
  REWARD_INVALID_PRIZE_MESSAGE,
  REWARD_INVALID_QUANTITY_MESSAGE,
  REWARD_INVALID_THRESHOLD_MESSAGE,
  REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE,
  REWARD_THRESHOLD_NOT_MULTIPLE_OF_TEN_MESSAGE,
  REWARD_UNKNOWN_DEFINITION_MESSAGE,
  REWARD_UNSUPPORTED_CADENCE_MESSAGE,
  createReward,
  type RewardPrizeInput,
} from "@/lib/rewards";
import type { CampaignRecurringType, ChallengeWinCondition } from "@/types";

/** POST /api/owner/rewards — create a Reward for a venue the owner controls. */
export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    venueId?: string;
    definitionId?: string;
    cadence?: CampaignRecurringType;
    winCondition?: ChallengeWinCondition;
    threshold?: number;
    winnerQuota?: number;
    prize?: RewardPrizeInput;
  };

  const venueId = String(body.venueId ?? "").trim();
  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });

  // Venue ownership is enforced before anything touches the engine.
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }

  try {
    const reward = await createReward({
      venueId,
      definitionId: String(body.definitionId ?? "").trim(),
      cadence: body.cadence ?? "none",
      winCondition: body.winCondition ?? "points_threshold",
      threshold: Number(body.threshold),
      winnerQuota: Number(body.winnerQuota),
      prize: body.prize as RewardPrizeInput,
      createdByOwnerId: auth.ownerId,
    });
    return NextResponse.json({ ok: true, reward });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create reward.";
    const status =
      message === REWARD_UNKNOWN_DEFINITION_MESSAGE ||
      message === REWARD_UNSUPPORTED_CADENCE_MESSAGE ||
      message === REWARD_INVALID_THRESHOLD_MESSAGE ||
      message === REWARD_THRESHOLD_NOT_MULTIPLE_OF_TEN_MESSAGE ||
      message === REWARD_INVALID_QUANTITY_MESSAGE ||
      message === REWARD_INVALID_PRIZE_MESSAGE ||
      message === REWARD_REQUIRES_SCHEDULED_GAME_MESSAGE ||
      message === REWARD_GAME_WINNER_UNSUPPORTED_MESSAGE
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
