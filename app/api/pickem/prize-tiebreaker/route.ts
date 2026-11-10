import { NextResponse } from "next/server";
import { listActivePickEmPrizeCampaigns } from "@/lib/challengeCampaigns";
import { PICKEM_PRIZE_DEFINITION_ID, pickemPrizeCycleStart, pickemPrizePeriodAt, pickemPrizeWinKind } from "@/lib/pickemPrizes";
import {
  PICKEM_PRIZE_TIEBREAKER_LOCKED_MESSAGE,
  PICKEM_PRIZE_TIEBREAKER_RANGE_MESSAGE,
  findPickEmPrizeTiebreakerGame,
  getPickEmPrizeGuess,
  savePickEmPrizeGuess,
} from "@/lib/pickemPrizeTiebreaker";
import {
  assertPickEmPickWindowOpenAtVenue,
  isPickEmPickWindowClosedError,
  pickWindowViewAtVenue,
} from "@/lib/pickemPickWindowGate";
import type { PickEmPickWindowView } from "@/lib/pickemPickWindow";
import { pickEmSportOfLeague } from "@/lib/pickemSports";
import { resolveRequestUserId } from "@/lib/serverSession";
import { getVenueTimezone } from "@/lib/timezone";
import { maybeRequireActiveVenuePresence, venuePresenceErrorResponse } from "@/lib/venuePresence";

// The Pick 'Em Prize tiebreaker (docs/pickem-college-football-and-prize-plan.md D8, Phase 4b): a
// "most picks right" prize's question for TODAY's period at the venue — "total points in the last
// game?". GET returns the game and the player's own guess (never anyone else's); POST saves the guess
// until that game starts. The player is always the signed session's (a claimed userId must match it).
// The player screen that calls this is Phase 6.

const NO_TIEBREAKER_MESSAGE = "This prize has no tiebreaker today.";

type Resolved =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      campaignId: string;
      periodStart: Date;
      game: NonNullable<Awaited<ReturnType<typeof findPickEmPrizeTiebreakerGame>>>;
    };

/** The venue's active "most picks right" prize, today's period of it, and that period's game. */
async function resolveTiebreaker(venueId: string, campaignId: string): Promise<Resolved> {
  if (!venueId || !campaignId) return { ok: false, status: 400, error: "venueId and campaignId are required." };
  const campaign = (await listActivePickEmPrizeCampaigns(venueId)).find(
    (entry) => entry.id === campaignId && entry.rewardDefinitionId === PICKEM_PRIZE_DEFINITION_ID,
  );
  if (!campaign || pickemPrizeWinKind(campaign) !== "most_right") {
    return { ok: false, status: 404, error: "Prize not found." };
  }
  const timeZone = await getVenueTimezone(venueId);
  const period = pickemPrizePeriodAt(campaign.pickemWindow, new Date(), timeZone);
  const periodStart = period ? pickemPrizeCycleStart(period, 0) : null;
  if (!period || !periodStart) return { ok: false, status: 404, error: NO_TIEBREAKER_MESSAGE };
  const game = await findPickEmPrizeTiebreakerGame({ scope: campaign.pickemScope, period, timeZone });
  if (!game) return { ok: false, status: 404, error: NO_TIEBREAKER_MESSAGE };
  return { ok: true, campaignId: campaign.id, periodStart, game };
}

/**
 * The card's lock follows the sport's pick window too (away-mode plan B2): shut = locked, with the
 * window's words; open with a close before kickoff = "Locks at" that close. Same rule as the POST.
 */
const withPickWindow = <T extends { startsAt: string; isLocked: boolean }>(
  game: T,
  window: PickEmPickWindowView | null,
): T & { locksAt: string; pickWindowMessage?: string } => {
  if (!window) return { ...game, locksAt: game.startsAt };
  if (!window.isOpen) return { ...game, isLocked: true, locksAt: game.startsAt, pickWindowMessage: window.line };
  const locksAt = Date.parse(window.closesAt) < Date.parse(game.startsAt) ? window.closesAt : game.startsAt;
  return { ...game, locksAt };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const viewer = resolveRequestUserId(request, searchParams.get("userId"));
    if (viewer.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

    const resolved = await resolveTiebreaker(
      (searchParams.get("venueId") ?? "").trim(),
      (searchParams.get("campaignId") ?? "").trim(),
    );
    if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });

    const venueId = (searchParams.get("venueId") ?? "").trim();
    const sportSlug = pickEmSportOfLeague(resolved.game.sportKey)?.slug;
    const [guess, window] = await Promise.all([
      viewer.userId
        ? getPickEmPrizeGuess({ challengeId: resolved.campaignId, periodStart: resolved.periodStart, userId: viewer.userId })
        : Promise.resolve(null),
      sportSlug ? pickWindowViewAtVenue({ venueId, sportSlug, startsAt: resolved.game.startsAt }) : Promise.resolve(null),
    ]);
    return NextResponse.json(
      {
        ok: true,
        game: withPickWindow(resolved.game, window),
        guess: guess ? { predictedTotal: guess.predictedTotal, updatedAt: guess.savedAt } : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[PickEmPrize] tiebreaker-read-failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't load the tiebreaker." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      venueId?: string;
      campaignId?: string;
      predictedTotal?: unknown;
    };
    const actor = resolveRequestUserId(request, body.userId);
    if (actor.forbidden) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    if (!actor.userId) return NextResponse.json({ ok: false, error: "Session required." }, { status: 401 });

    const venueId = String(body.venueId ?? "").trim();
    await maybeRequireActiveVenuePresence({ userId: actor.userId, venueId });

    const resolved = await resolveTiebreaker(venueId, String(body.campaignId ?? "").trim());
    if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });

    // A guess locks with its game's pick window too, when that comes before kickoff (away-mode plan B1, §4).
    const sportSlug = pickEmSportOfLeague(resolved.game.sportKey)?.slug;
    if (sportSlug) {
      await assertPickEmPickWindowOpenAtVenue({ venueId, sportSlug, startsAt: resolved.game.startsAt });
    }

    const guess = await savePickEmPrizeGuess({
      challengeId: resolved.campaignId,
      periodStart: resolved.periodStart,
      userId: actor.userId,
      venueId,
      game: resolved.game,
      predictedTotal: body.predictedTotal,
    });
    return NextResponse.json({ ok: true, guess: { predictedTotal: guess.predictedTotal, updatedAt: guess.savedAt } });
  } catch (error) {
    const presenceResponse = venuePresenceErrorResponse(error);
    if (presenceResponse) return presenceResponse;
    if (isPickEmPickWindowClosedError(error)) return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    const message = error instanceof Error ? error.message : "";
    if (message === PICKEM_PRIZE_TIEBREAKER_LOCKED_MESSAGE) return NextResponse.json({ ok: false, error: message }, { status: 409 });
    if (message === PICKEM_PRIZE_TIEBREAKER_RANGE_MESSAGE) return NextResponse.json({ ok: false, error: message }, { status: 400 });
    console.error("[PickEmPrize] tiebreaker-save-failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't save your guess." }, { status: 500 });
  }
}
