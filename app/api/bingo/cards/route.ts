import { NextResponse } from "next/server";
import {
  claimSportsBingoReward,
  createSportsBingoCard,
  generateSportsBingoBoard,
  listUserSportsBingoCardDates,
  listUserSportsBingoCards,
} from "@/lib/sportsBingo";
import { resolveLeagueBlockReason } from "@/lib/leagueSeasonStatus";
import {
  maybeRequireActiveVenuePresence,
  maybeRequireActiveVenuePresenceForUser,
  venuePresenceErrorResponse,
} from "@/lib/venuePresence";

// Deep-link bypass protection: the picker already hides out-of-season (and not-yet-activated)
// leagues, but a scripted client can POST straight here.
async function rejectIfLeagueUnavailable(sportKey: string): Promise<NextResponse | null> {
  const blockReason = await resolveLeagueBlockReason(sportKey);
  if (!blockReason) {
    return null;
  }
  return NextResponse.json({ ok: false, error: blockReason }, { status: 400 });
}

function normalizeBoolean(value: string | null, fallback = false): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeTzOffsetMinutes(value: string | null): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(-14 * 60, Math.min(14 * 60, parsed));
}

// Half-open UTC window for one LOCAL calendar day. `tzOffsetMinutes` follows the browser's
// `Date.getTimezoneOffset()` convention (minutes to ADD to local time to reach UTC), so local
// midnight in UTC is `Date.UTC(y, m, d) + offset * 60_000`. Returns null for a malformed date.
function resolveLocalDayWindow(
  date: string,
  tzOffsetMinutes: number
): { startsAtFrom: string; startsAtTo: string } | null {
  if (!LOCAL_DAY_PATTERN.test(date)) {
    return null;
  }
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  const utcMidnight = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utcMidnight)) {
    return null;
  }
  // `Date.UTC` silently rolls impossible dates over (2026-02-30 -> March 2), which would return
  // the wrong day's boards with a 200. Round-trip the constructed instant and reject on any
  // component mismatch so the malformed-date -> 400 path below actually fires.
  const roundTrip = new Date(utcMidnight);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  const startMs = utcMidnight + tzOffsetMinutes * 60_000;
  return {
    startsAtFrom: new Date(startMs).toISOString(),
    startsAtTo: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = (searchParams.get("userId") ?? "").trim();
    const includeSettled = normalizeBoolean(searchParams.get("includeSettled"), true);
    const refreshProgressRequested = normalizeBoolean(searchParams.get("refreshProgress"), false);
    // Historical/settled queries are immutable snapshots and must never trigger expensive refresh evaluation.
    const refreshProgress = includeSettled ? false : refreshProgressRequested;
    const requestedDate = (searchParams.get("date") ?? "").trim();
    const tzOffsetMinutes = normalizeTzOffsetMinutes(searchParams.get("tzOffsetMinutes"));
    const includeDates = normalizeBoolean(searchParams.get("includeDates"), false);

    if (!userId) {
      return NextResponse.json({ ok: true, cards: [] });
    }

    // A malformed `date` is refused rather than silently ignored: falling back to "every card"
    // would hand a past-day view the whole history and read as a data bug, not a bad request.
    let dayWindow: { startsAtFrom: string; startsAtTo: string } | null = null;
    if (requestedDate) {
      dayWindow = resolveLocalDayWindow(requestedDate, tzOffsetMinutes);
      if (!dayWindow) {
        return NextResponse.json(
          { ok: false, error: "date must be a local calendar day formatted as YYYY-MM-DD." },
          { status: 400 }
        );
      }
    }

    const cards = await listUserSportsBingoCards({
      userId,
      includeSettled,
      refreshProgress,
      ...(dayWindow ?? {}),
    });

    // The calendar dots are decorative. A failure here must not 500 the primary boards
    // response, so this query gets its own try/catch: on error the calendar simply renders
    // without dots (the response shape already treats `activeDates` as optional).
    let activeDates: string[] | undefined;
    if (includeDates) {
      try {
        activeDates = await listUserSportsBingoCardDates({ userId, tzOffsetMinutes });
      } catch (datesError) {
        console.error("[bingo][cards][dates] failed to load calendar dates", datesError);
        activeDates = undefined;
      }
    }

    return NextResponse.json({
      ok: true,
      cards,
      ...(activeDates ? { activeDates } : {}),
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

      const sportKey = String(body.sportKey ?? "basketball_nba").trim().toLowerCase();
      const leagueRejection = await rejectIfLeagueUnavailable(sportKey);
      if (leagueRejection) {
        return leagueRejection;
      }

      const board = await generateSportsBingoBoard({
        gameId,
        sportKey,
        generationMode: "preview",
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

      const sportKey = String((body as { sportKey?: string }).sportKey ?? "basketball_nba")
        .trim()
        .toLowerCase();
      const leagueRejection = await rejectIfLeagueUnavailable(sportKey);
      if (leagueRejection) {
        return leagueRejection;
      }

      await maybeRequireActiveVenuePresence({ userId, venueId });

      const card = await createSportsBingoCard({
        userId,
        venueId,
        gameId,
        sportKey,
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

      await maybeRequireActiveVenuePresenceForUser({ userId });

      const result = await claimSportsBingoReward({ userId, cardId });
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json(
      { ok: false, error: 'Unknown action. Use action="generate", action="play", or action="claim".' },
      { status: 400 }
    );
  } catch (error) {
    const presenceResponse = venuePresenceErrorResponse(error);
    if (presenceResponse) return presenceResponse;

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to process Sports Bingo request.",
      },
      { status: 500 }
    );
  }
}
