// Shared, client-safe Sports Bingo league + team display strings.
//
// Phase 3 of `docs/prop-bingo-page-simplification-plan.md`. Before this file the sport→emoji
// table was hand-copied into at least four places (`app/api/bingo/leagues/route.ts`,
// `components/bingo/SportsBingoSelectSport.tsx`, `SportsBingoSelectBoard.tsx`,
// `components/fantasy/FantasyHome.tsx`). This is the one static catalog they can all import.
//
// It is deliberately NOT in `lib/sportsBingo.ts`: that module is `import "server-only"`, so a
// client component (`BingoBoardCard`, `SportsBingoHome`, the pickers) cannot pull anything from
// it. `toMascotDisplayName` is duplicated from `lib/sportsBingo.ts:1697` on purpose for the same
// reason — the server copy stays where it is (it feeds resolver-key normalization); this copy is
// the display-layer one. Keep the two in sync if the mascot rules ever change.

export type LeagueDisplay = {
  sportKey: string;
  /** Short league label, e.g. "NBA". */
  label: string;
  /** Single emoji for the league. */
  emoji: string;
};

const LEAGUE_CATALOG: readonly LeagueDisplay[] = [
  { sportKey: "basketball_nba", label: "NBA", emoji: "🏀" },
  { sportKey: "basketball_wnba", label: "WNBA", emoji: "🏀" },
  { sportKey: "americanfootball_nfl", label: "NFL", emoji: "🏈" },
  { sportKey: "baseball_mlb", label: "MLB", emoji: "⚾" },
] as const;

export const SPORTS_BINGO_LEAGUES = LEAGUE_CATALOG;

const FALLBACK_LEAGUE: LeagueDisplay = { sportKey: "", label: "Sports", emoji: "🏆" };

/**
 * Display label + emoji for a sport key, with a safe fallback for an unknown/empty key so a
 * board header never renders `undefined`.
 */
export function getLeagueDisplay(sportKey: string | null | undefined): LeagueDisplay {
  const key = String(sportKey ?? "").trim().toLowerCase();
  const match = LEAGUE_CATALOG.find((league) => league.sportKey === key);
  if (match) {
    return match;
  }
  return { ...FALLBACK_LEAGUE, sportKey: key };
}

/**
 * "Denver Nuggets" -> "Nuggets". Two-word mascots ("Red Sox") are kept whole. Mirrors the
 * server copy in `lib/sportsBingo.ts` — see the file header for why it is duplicated.
 */
export function toMascotDisplayName(team: string): string {
  const trimmed = team.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return trimmed;
  }

  const lastTwo = parts.slice(-2).join(" ");
  const keepLastTwo = new Set([
    "Red Sox",
    "White Sox",
    "Blue Jays",
    "Trail Blazers",
    "Golden Knights",
    "Maple Leafs",
  ]);

  if (keepLastTwo.has(lastTwo)) {
    return lastTwo;
  }

  return parts[parts.length - 1] ?? trimmed;
}

/**
 * Mascot-only matchup string, same "{away} vs. {home}" order as `gameLabel` on the card.
 * `gameLabel` itself stays raw (full names) for the expanded modals — format here at render time.
 */
export function toMascotMatchup(awayTeam: string, homeTeam: string): string {
  return `${toMascotDisplayName(awayTeam)} vs. ${toMascotDisplayName(homeTeam)}`;
}
