import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { resolveRankedPlaceRewards } from "@/lib/liveTriviaRankedRewards";
import { resolveGameWinnerRewards } from "@/lib/liveTriviaWinnerRewards";
import { sendLiveGameStartPushes } from "@/lib/push/gameReminders";

// Awards "winner of the game" rewards for Live Trivia occurrences that have
// finished, then settles weekly 1st/2nd/3rd ("ranked_places") rewards whose week's
// last game has finished. Live Trivia has no game-over event, so this sweep is
// what closes out a game and a week. Both are idempotent (see
// lib/liveTriviaWinnerRewards.ts and lib/liveTriviaRankedRewards.ts), so running
// every few minutes is safe and a missed run self-heals on the next sweep.
//
// It also sends the "Live Trivia starts soon" phone pushes (docs/native-app-store-plan.md Phase 5.1,
// lib/push/gameReminders.ts; once per game, nothing at all while push is not configured).
//
// Each sweep runs in its own try/catch: one throwing never stops the other. The
// game-winner report stays at the top level of the response (its shape before the
// weekly sweep existed); the weekly one is under `rankedPlaces`. Any sweep that
// threw makes the response a 500 with `ok: false`.

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  const nowMs = Date.now();

  let gameWinner: Awaited<ReturnType<typeof resolveGameWinnerRewards>> | null = null;
  let gameWinnerError: string | null = null;
  try {
    gameWinner = await resolveGameWinnerRewards(nowMs);
  } catch (error) {
    gameWinnerError = errorMessage(error, "Failed to resolve game winners.");
    console.error("[GameWinnerReward] sweep-failed", { message: gameWinnerError });
  }

  let rankedPlaces: Awaited<ReturnType<typeof resolveRankedPlaceRewards>> | null = null;
  let rankedPlacesError: string | null = null;
  try {
    rankedPlaces = await resolveRankedPlaceRewards(nowMs);
  } catch (error) {
    rankedPlacesError = errorMessage(error, "Failed to resolve weekly places rewards.");
    console.error("[RankedReward] sweep-failed", { message: rankedPlacesError });
  }

  let gameStartPushes: Awaited<ReturnType<typeof sendLiveGameStartPushes>> | null = null;
  let gameStartPushesError: string | null = null;
  try {
    gameStartPushes = await sendLiveGameStartPushes(nowMs);
  } catch (error) {
    gameStartPushesError = errorMessage(error, "Failed to send game-start pushes.");
    console.error("[Push] game-reminders-failed", { message: gameStartPushesError });
  }

  const ok = gameWinnerError === null && rankedPlacesError === null && gameStartPushesError === null;
  return NextResponse.json(
    {
      ok,
      ...(gameWinner ?? {}),
      ...(gameWinnerError !== null ? { error: gameWinnerError } : {}),
      rankedPlaces: rankedPlaces ?? { error: rankedPlacesError },
      gameStartPushes: gameStartPushes ?? { error: gameStartPushesError },
    },
    { status: ok ? 200 : 500 },
  );
}

export async function GET(request: Request) {
  return POST(request);
}
