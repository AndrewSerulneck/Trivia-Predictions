// The wire shapes of the Partner Dashboard's Results page (docs/partner-results-page-plan.md §5a).
// Every competition's adapter produces these, so the timeline, standings screen, search and player
// breakdown are shared and a new competition needs no new screens.
//
// Pure and client-safe (types only).
//
// PRIVACY. A partner sees USERNAMES and scores only. No shape here carries a player id: a player
// who deleted their account is `username: null` ("Deleted player"), and a standings row points at
// its breakdown through `entry`, an opaque per-venue, per-game token (Phase 3, plan §5d).

/** One game on the timeline. */
export type ResultsGameRow = {
  /** A lib/results/competitions.ts id. */
  competitionId: string;
  /** Opaque to everything but the competition's adapter, which parses it back. */
  gameKey: string;
  /** Venue-local date, YYYY-MM-DD. */
  date: string;
  /** The game's start instant (ISO), when the competition knows it; null otherwise. */
  startsAt: string | null;
  title: string;
  /** Everyone who took part, scored or not. */
  playerCount: number;
  /** The game hasn't finished yet: nobody is named. */
  inProgress: boolean;
  /** Everyone on the top score (a tie lists them all); empty when nobody scored or still playing. */
  winners: Array<string | null>;
  /** The top score; 0 when nobody scored or still playing. */
  topScore: number;
};

export type ResultsStanding = {
  /** Competition rank ("1, 2, 2, 4"). */
  rank: number;
  username: string | null;
  score: number;
  /** Opens this player's breakdown (Phase 3); null when there is none (or no SESSION_SECRET). */
  entry: string | null;
};

export type ResultsGameDetail = {
  game: ResultsGameRow;
  /** Scorers only, best first. Empty while the game is still being played. */
  standings: ResultsStanding[];
};

export type ResultsBreakdownRow = {
  /** "Round 1". */
  group: string;
  /** "Q3". */
  label: string;
  /** The question, for matching "the one about Elvis". Never the player's own answer. */
  detail: string;
  outcome: "right" | "wrong" | "none";
  points: number;
};

export type ResultsBreakdown = { rows: ResultsBreakdownRow[]; total: number };

/** Where a reward cycle sits on the timeline (plan §5b). */
export type ResultsRewardAttach =
  /** On that game's card: the reward was won at that game. */
  | { kind: "game"; competitionId: string; gameKey: string }
  /** Its own row on that day. */
  | { kind: "day"; date: string }
  /** A row at the end of the Monday–Sunday week starting `weekStart` (the row's `date` is inside it). */
  | { kind: "week"; weekStart: string };

export type ResultsRewardWinner = {
  /** 1st / 2nd / 3rd for a weekly places reward, else null. */
  place: number | null;
  username: string | null;
  points: number;
};

/** One reward cycle at this venue, placed on the timeline. */
export type ResultsRewardItem = {
  rewardId: string;
  name: string;
  /** "Top 3 players each week", "Winner of the game", "Reach 500 points". */
  howWon: string;
  /** The cycle's key (with rewardId, unique). */
  cycleStart: string;
  /** "Week of Wed, Oct 7", "Fri, Oct 9", "October 2026", "Won Fri, Oct 9". */
  cycleLabel: string;
  /** Venue-local YYYY-MM-DD the item is dated on; the timeline pages on it. */
  date: string;
  attach: ResultsRewardAttach;
  /** Place-ordered; empty for a week that paid nobody. */
  winners: ResultsRewardWinner[];
  /** Why nobody won ("Nobody scored this week."), or null. */
  note: string | null;
};

/** One page of the Results timeline: GET /api/owner/results. */
export type ResultsTimelinePage = {
  /** Newest first; whole dates only. */
  games: ResultsGameRow[];
  /** Newest first; every item's date is inside the page's date range. */
  rewards: ResultsRewardItem[];
  /** The next page's `before` (a date), or null when this was the last page. */
  nextBefore: string | null;
  /** The venue's first game (YYYY-MM-DD) for year grouping; first page only, null when unknown. */
  firstGameDate?: string | null;
};

/** One page of one competition's games. */
export type ResultsGamePage = {
  /** Newest first, strictly before `before`, never splitting a date. */
  games: ResultsGameRow[];
  /** True when no older games exist than the ones returned. */
  exhausted: boolean;
  /** Only when asked for (`withFirstGameDate`): the competition's first game date, null when unknown. */
  firstGameDate?: string | null;
};

/**
 * What a competition implements to appear on Results. `server-only` implementations live in
 * lib/results/adapters/<competition>.ts and are registered in lib/results/adapters/index.ts.
 * Every method scopes every read to `venueId` and throws ResultsNotFoundError for a game that
 * isn't that venue's.
 */
export type ResultsAdapter = {
  id: string;
  listGames(params: {
    venueId: string;
    /** Only games strictly before this venue-local date; null = newest. */
    before: string | null;
    limit: number;
    nowMs: number;
    withFirstGameDate?: boolean;
  }): Promise<ResultsGamePage>;
  /** `limit` = keep the top N plus ties (the old Game Results route); omitted = everyone. */
  getStandings(params: { venueId: string; gameKey: string; nowMs: number; limit?: number }): Promise<ResultsGameDetail>;
  getBreakdown?(params: { venueId: string; gameKey: string; entry: string }): Promise<ResultsBreakdown>;
};
