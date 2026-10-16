// One page of the Results timeline (docs/partner-results-page-plan.md §5a): every competition's
// games plus the venue's reward cycles, merged newest first.
//
// Pure: the sources are passed in (lib/results/ownerResults.ts wires the real adapters and the
// venue's reward source; tests pass fixtures), so the paging rules are tested on their own. A
// paging bug here would silently hide results, so the rules are deliberately few:
//
// 1. A page never splits a date. `before` (a venue-local date) is exclusive; the page covers a date
//    range [lo, before) and holds EVERY game and reward dated in it; `nextBefore` = lo.
// 2. Every source that has older games bounds lo from below by the oldest date it returned (older
//    dates may be incomplete). An exhausted source bounds nothing. More than `limit` games in all
//    is trimmed back to `limit`, keeping the last date whole.
// 3. Rewards are read for the page's range only, and that range is never longer than
//    REWARD_WINDOW_DAYS, so a venue with sparse games (or none) still reads rewards in bounded
//    windows. Once every game source is exhausted the rewards keep paging on their own.
// 4. A range with nothing in it is skipped: the page jumps to the newest older game or reward
//    (up to MAX_EMPTY_JUMPS times), so "Show more" never shows an empty stretch.

import { addDays } from "@/lib/results/rewardPlacement";
import type { ResultsAdapter, ResultsGameRow, ResultsRewardItem, ResultsTimelinePage } from "@/lib/results/types";

/** Games per page (as the old Game Results lists). */
export const RESULTS_PAGE_SIZE = 20;
/** The longest date range one page reads rewards for. */
export const REWARD_WINDOW_DAYS = 56;
/** Empty ranges skipped per request before handing back an (empty) page and its cursor. */
export const MAX_EMPTY_JUMPS = 6;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A games source: an adapter already bound to the venue and the request time. */
export type ResultsGameSource = {
  id: string;
  listGames: (params: { before: string | null; limit: number; withFirstGameDate: boolean }) => ReturnType<ResultsAdapter["listGames"]>;
};

export type ResultsRewardSource = {
  /** Every reward item dated in [lo, hi), placed against `games` (the page's games). */
  read: (params: { lo: string; hi: string; games: ResultsGameRow[] }) => Promise<ResultsRewardItem[]>;
  /**
   * An exclusive upper bound (≤ lo) on the date of any reward item dated before `lo`, or null when
   * there is none. May over-estimate.
   */
  boundBefore: (lo: string) => Promise<string | null>;
};

const isDate = (value: string | null | undefined): value is string =>
  typeof value === "string" && DATE_PATTERN.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`));

const byDateDesc = (a: ResultsGameRow, b: ResultsGameRow): number => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const maxDate = (a: string | null, b: string | null): string | null => (a === null ? b : b === null ? a : a > b ? a : b);

/**
 * The games of one request, merged: newest first, strictly before `before`, every date on or after
 * `completeFrom` complete across all sources. `completeFrom` null = every source is exhausted, so
 * nothing older exists.
 */
export const mergeGamePages = (
  pages: ReadonlyArray<{ games: readonly ResultsGameRow[]; exhausted: boolean }>,
  options: { before: string | null; limit: number },
): { games: ResultsGameRow[]; completeFrom: string | null } => {
  let completeFrom: string | null = null;
  const all: ResultsGameRow[] = [];
  for (const page of pages) {
    const games = page.games.filter((game) => isDate(game.date) && (options.before === null || game.date < options.before));
    all.push(...games);
    // A source with more games bounds the page at its oldest date. One with more but nothing to show
    // can't bound anything; treat it as exhausted rather than page forever.
    if (!page.exhausted && games.length > 0) {
      const oldest = games.reduce((min, game) => (game.date < min ? game.date : min), games[0].date);
      completeFrom = maxDate(completeFrom, oldest);
    }
  }
  // Stable sort: same-date games keep their source order.
  let games = [...all].sort(byDateDesc);
  if (completeFrom !== null) games = games.filter((game) => game.date >= (completeFrom as string));
  if (games.length > options.limit) {
    const cut = games[options.limit - 1].date;
    games = games.filter((game) => game.date >= cut);
    completeFrom = maxDate(completeFrom, cut);
  }
  return { games, completeFrom };
};

/** One timeline page. `today` is the venue-local date (the first page's range ends after it). */
export const buildResultsTimelinePage = async (params: {
  sources: readonly ResultsGameSource[];
  rewards: ResultsRewardSource;
  before: string | null;
  today: string;
  limit?: number;
}): Promise<ResultsTimelinePage> => {
  const limit = params.limit ?? RESULTS_PAGE_SIZE;
  const before = isDate(params.before) ? params.before : null;
  const firstPage = before === null;
  const pages = await Promise.all(params.sources.map((source) => source.listGames({ before, limit, withFirstGameDate: firstPage })));
  const { games, completeFrom } = mergeGamePages(pages, { before, limit });

  const firstGameDates = pages.map((page) => page.firstGameDate).filter((date): date is string => isDate(date));
  const withFirstGameDate = (page: ResultsTimelinePage): ResultsTimelinePage =>
    firstPage
      ? { ...page, firstGameDate: firstGameDates.length > 0 ? firstGameDates.reduce((min, date) => (date < min ? date : min)) : null }
      : page;

  // The first page's range ends after today, or after its newest game if a schedule's own zone is
  // already a day ahead of the venue's (nothing dated later could ever be shown).
  let hi = before ?? (maxDate(addDays(params.today, 2), games[0] ? addDays(games[0].date, 1) : null) as string);
  let lo = hi;
  let pageGames: ResultsGameRow[] = [];
  let rewards: ResultsRewardItem[] = [];
  for (let jump = 0; ; jump += 1) {
    lo = addDays(hi, -REWARD_WINDOW_DAYS);
    // The games bound the page sooner than the window when they are dense.
    if (completeFrom !== null && completeFrom > lo) lo = completeFrom;
    const windowLo = lo;
    const windowHi = hi;
    pageGames = games.filter((game) => game.date >= windowLo && game.date < windowHi);
    rewards = await params.rewards.read({ lo, hi, games: pageGames });
    if (pageGames.length > 0 || rewards.length > 0) break;

    // Nothing in [lo, hi): jump to the newest older game or reward.
    const olderGame = games.find((game) => game.date < windowLo)?.date ?? null;
    const rewardBound = await params.rewards.boundBefore(lo);
    if (olderGame === null && rewardBound === null && completeFrom === null) {
      return withFirstGameDate({ games: [], rewards: [], nextBefore: null });
    }
    // completeFrom is a returned game's date, so when it is set an older game is in `games`.
    const next = maxDate(olderGame ? addDays(olderGame, 1) : null, rewardBound) ?? lo;
    hi = next < lo ? next : lo;
    if (jump + 1 >= MAX_EMPTY_JUMPS) return withFirstGameDate({ games: [], rewards: [], nextBefore: hi });
  }

  // More exists below lo when a game source has more, a fetched game was older than the range, or
  // a reward may be older.
  const moreBelow =
    completeFrom !== null || games.some((game) => game.date < lo) || (await params.rewards.boundBefore(lo)) !== null;
  return withFirstGameDate({ games: pageGames, rewards, nextBefore: moreBelow ? lo : null });
};
