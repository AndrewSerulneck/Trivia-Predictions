import ncaabBracket from "./ncaab-bracket-season-2025.json";
import ncaawBracket from "./ncaaw-bracket-season-2025.json";
import type { BracketEntryView, BracketGameView, BracketTournamentView } from "@/lib/bracketsEntries";
import {
  bracketWinnerSeats,
  maskBracketFeedAt,
  mergeBracketFeed,
  type BracketFeedGame,
  type BracketGameState,
} from "@/lib/brackets/games";
import type { BracketGender, BracketKind } from "@/lib/brackets/tree";

// A BracketTournamentView built from the saved 2026 feeds (what GET /api/bracket/state returns), for the
// Phase 8 screen and view tests. `asOfMs` replays the tournament at that moment (undefined = finished).

const FEEDS: Record<BracketGender, BracketFeedGame[]> = {
  men: ncaabBracket as BracketFeedGame[],
  women: ncaawBracket as BracketFeedGame[],
};

const teamView = (team: BracketGameState["homeTeam"]) =>
  team ? { name: team.college || team.name, abbreviation: team.abbreviation, seed: team.seed } : null;

export const toGameView = (game: BracketGameState): BracketGameView => ({
  round: game.round,
  location: game.location,
  slot: game.slot,
  tipAt: game.tipAt,
  status: game.statusDetail,
  home: teamView(game.homeTeam),
  away: teamView(game.awayTeam),
  homeScore: game.homeScore,
  awayScore: game.awayScore,
  winnerSide: game.winnerSide,
  feedsSeat: game.round === 0 ? game.feedsSeat : null,
});

export const replayGames = (gender: BracketGender, asOfMs?: number) => {
  const feed = asOfMs === undefined ? FEEDS[gender] : maskBracketFeedAt(FEEDS[gender], asOfMs);
  const games = mergeBracketFeed([], feed).games;
  return { games, views: games.map(toGameView), winnerSeats: bracketWinnerSeats(games) };
};

type KindInput = {
  phase: BracketTournamentView["kinds"][BracketKind]["phase"];
  lockAt?: string | null;
  mine?: BracketEntryView | null;
  copyFrom?: BracketTournamentView["kinds"][BracketKind]["copyFrom"];
};

export const makeTournament = (params: {
  id?: string;
  gender?: BracketGender;
  asOfMs?: number;
  rehearsal?: boolean;
  main?: KindInput;
  second?: KindInput;
}): BracketTournamentView => {
  const gender = params.gender ?? "men";
  const { views, winnerSeats } = replayGames(gender, params.asOfMs);
  const kind = (input: KindInput | undefined): BracketTournamentView["kinds"]["main"] => ({
    phase: input?.phase ?? "not_open",
    lockAt: input?.lockAt ?? null,
    mine: input?.mine ?? null,
    copyFrom: input?.copyFrom ?? [],
  });
  return {
    id: params.id ?? `t-${gender}`,
    gender,
    season: 2025,
    rehearsal: params.rehearsal ?? false,
    regionNames: ["East", "West", "South", "Midwest"],
    winnerSeats,
    championshipTotal: null,
    games: views,
    kinds: { main: kind(params.main), second: kind(params.second) },
  };
};

export const entryOf = (picks: Array<number | null>, over: Partial<BracketEntryView> = {}): BracketEntryView => ({
  picks,
  tiebreaker: null,
  pickCount: picks.filter((seat) => seat !== null).length,
  score: 0,
  maxPossible: 0,
  savedAt: "2026-03-17T12:00:00.000Z",
  ...over,
});
