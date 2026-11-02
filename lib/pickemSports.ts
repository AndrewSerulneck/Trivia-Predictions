// The Pick 'Em sports and their leagues (docs/pickem-college-football-and-prize-plan.md Phase 4a).
// A leaf: no I/O, no "server-only", so lib/pickem.ts (the game), lib/pickemPrizes.ts (the Prize's
// "which games" rules) and the Prize wizard all read ONE list. A league is identified by its
// provider sport key (stored on every pick as pickem_picks.sport_key); its label is the one the
// game shows (pickem_picks.league), pinned equal to lib/pickem.ts's provider map by a test.

import { COLLEGE_FOOTBALL_SPORT_KEY } from "@/lib/pickemCollegeFootball";

export type PickEmSportSlug = "nba" | "mlb" | "nhl" | "soccer" | "ncaaf" | "nfl" | "mma" | "tennis";

export type PickEmLeague = {
  /** Provider sport key, e.g. "soccer_epl". The league's identity in a Prize's scope. */
  sportKey: string;
  /** "EPL", "NBA", "College Football" — exactly what the game shows. */
  label: string;
};

export type PickEmSportCatalogEntry = {
  slug: PickEmSportSlug;
  label: string;
  subtitle: string;
  /** In a sentence: "college football picks", "MLB picks". */
  phrase: string;
  isInSeason: boolean;
  isClickable: boolean;
  /**
   * Games with a final score (a Prize's tiebreaker is a total-points guess). MMA and tennis have
   * none, so a "most picks right" Prize needs at least one score sport in its scope.
   */
  hasScores: boolean;
  leagues: readonly PickEmLeague[];
};

export const PICKEM_SPORT_CATALOG: readonly PickEmSportCatalogEntry[] = [
  {
    slug: "nba",
    label: "Basketball",
    subtitle: "NBA + WNBA",
    phrase: "basketball",
    isInSeason: true,
    isClickable: true,
    hasScores: true,
    leagues: [
      { sportKey: "basketball_nba", label: "NBA" },
      { sportKey: "basketball_wnba", label: "WNBA" },
    ],
  },
  {
    slug: "mlb",
    label: "MLB",
    subtitle: "Major League Baseball",
    phrase: "MLB",
    isInSeason: true,
    isClickable: true,
    hasScores: true,
    leagues: [{ sportKey: "baseball_mlb", label: "MLB" }],
  },
  {
    slug: "nhl",
    label: "NHL",
    subtitle: "National Hockey League",
    phrase: "NHL",
    isInSeason: true,
    isClickable: true,
    hasScores: true,
    leagues: [{ sportKey: "icehockey_nhl", label: "NHL" }],
  },
  {
    slug: "soccer",
    label: "Soccer",
    subtitle: "Top Domestic & International Leagues",
    phrase: "soccer",
    isInSeason: true,
    isClickable: true,
    hasScores: true,
    leagues: [
      { sportKey: "soccer_usa_mls", label: "MLS" },
      { sportKey: "soccer_epl", label: "EPL" },
      { sportKey: "soccer_spain_la_liga", label: "La Liga" },
      { sportKey: "soccer_italy_serie_a", label: "Serie A" },
      { sportKey: "soccer_france_ligue_one", label: "Ligue 1" },
      { sportKey: "soccer_germany_bundesliga", label: "Bundesliga" },
      { sportKey: "soccer_uefa_champs_league", label: "UEFA Champions League" },
      { sportKey: "soccer_fifa_world_cup", label: "FIFA World Cup" },
    ],
  },
  {
    slug: "ncaaf",
    label: "College Football",
    subtitle: "FBS",
    phrase: "college football",
    isInSeason: true,
    isClickable: true,
    hasScores: true,
    leagues: [{ sportKey: COLLEGE_FOOTBALL_SPORT_KEY, label: "College Football" }],
  },
  {
    // NFL Pick 'Em is its own game with its own Prize; kept here because settlement and old pick
    // history still use the shared definition. Never in a Pick 'Em Prize's scope.
    slug: "nfl",
    label: "NFL",
    subtitle: "National Football League",
    phrase: "NFL",
    isInSeason: false,
    isClickable: false,
    hasScores: true,
    leagues: [{ sportKey: "americanfootball_nfl", label: "NFL" }],
  },
  {
    slug: "mma",
    label: "MMA",
    subtitle: "UFC & major cards",
    phrase: "MMA",
    isInSeason: true,
    isClickable: true,
    hasScores: false,
    leagues: [{ sportKey: "mma_ufc", label: "UFC" }],
  },
  {
    slug: "tennis",
    label: "Tennis",
    subtitle: "ATP + WTA",
    phrase: "tennis",
    isInSeason: true,
    isClickable: true,
    hasScores: false,
    leagues: [
      { sportKey: "tennis_atp", label: "ATP" },
      { sportKey: "tennis_wta", label: "WTA" },
    ],
  },
];

const CATALOG_BY_SLUG = new Map(PICKEM_SPORT_CATALOG.map((sport) => [sport.slug, sport]));
const SPORT_BY_LEAGUE = new Map(
  PICKEM_SPORT_CATALOG.flatMap((sport) => sport.leagues.map((league) => [league.sportKey, sport] as const)),
);
const LEAGUE_BY_KEY = new Map(
  PICKEM_SPORT_CATALOG.flatMap((sport) => sport.leagues.map((league) => [league.sportKey, league] as const)),
);

export const pickEmSportBySlug = (slug: string): PickEmSportCatalogEntry | null =>
  CATALOG_BY_SLUG.get(slug as PickEmSportSlug) ?? null;

/** The sport a league (provider sport key) belongs to, or null for an unknown key. */
export const pickEmSportOfLeague = (sportKey: string): PickEmSportCatalogEntry | null =>
  SPORT_BY_LEAGUE.get(sportKey) ?? null;

export const pickEmLeagueByKey = (sportKey: string): PickEmLeague | null => LEAGUE_BY_KEY.get(sportKey) ?? null;
