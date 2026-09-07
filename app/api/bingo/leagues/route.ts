import { NextResponse } from "next/server";
import {
  isNflGameplayEnabled,
  isSeasonGatingEnabled,
  NFL_SPORT_KEY,
  resolveLeagueSeasonStatus,
} from "@/lib/leagueSeasonStatus";
import { SPORTS_BINGO_LEAGUES } from "@/lib/sportsBingoLeagues";

// The static key/label/emoji catalog is now shared (`lib/sportsBingoLeagues.ts`). What stays
// deliberately NOT shared is the fallback in components/bingo/SportsBingoSelectSport.tsx that
// renders every league *enabled* if this route errors — that fail-open status behavior is the
// intentional duplication, not the emoji table.
const LEAGUES = SPORTS_BINGO_LEAGUES.map((league) => ({
  key: league.sportKey,
  label: league.label,
  icon: league.emoji,
}));

export async function GET() {
  try {
    const seasonGatingEnabled = isSeasonGatingEnabled();
    const nflGameplayEnabled = isNflGameplayEnabled();

    const leagues = await Promise.all(
      LEAGUES.map(async (league) => {
        if (league.key === NFL_SPORT_KEY && !nflGameplayEnabled) {
          // Distinct from `out_of_season`: the flag being off is why NFL is dark, not the
          // calendar — NFL is in season in September. Keeping this its own status stops the
          // client from ever rendering the self-contradictory "Out of season · Coming soon".
          return { ...league, status: "coming_soon" as const, note: "Coming soon" };
        }
        if (!seasonGatingEnabled) {
          return { ...league, status: "in_season" as const, resumesLabel: undefined };
        }
        const info = await resolveLeagueSeasonStatus(league.key);
        return { ...league, status: info.status, resumesLabel: info.resumesLabel };
      })
    );

    return NextResponse.json({ ok: true, leagues });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Sports Bingo leagues.",
      },
      { status: 500 }
    );
  }
}
