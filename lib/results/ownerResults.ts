import "server-only";

import { localDateOf } from "@/lib/ownerHistoryDisplay";
import { getResultsAdapter, listResultsAdapters } from "@/lib/results/adapters";
import { getResultsCompetition } from "@/lib/results/competitions";
import { isResultsEntryToken, resultsEntryTokensEnabled } from "@/lib/results/entryToken";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";
import { addDays } from "@/lib/results/rewardPlacement";
import { createVenueRewardSource } from "@/lib/results/rewardSource";
import { buildResultsTimelinePage } from "@/lib/results/timeline";
import type { ResultsAdapter, ResultsBreakdown, ResultsGameRow, ResultsGameScreen, ResultsTimelinePage } from "@/lib/results/types";
import { getVenueTimezone } from "@/lib/timezone";

// The Partner Dashboard's Results page, server side (docs/partner-results-page-plan.md §5).
// Read-only. The route (app/api/owner/results) checks the partner controls `venueId` BEFORE calling
// anything here, and every read below is scoped to that venue.
//
// COST (plan §6): only on demand. One timeline page = per competition its games page (Live Trivia:
// schedules + summary RPC + winners' usernames), + the venue's timezone (cached 10 min), + one
// rewards window (ledger + settlements + campaigns by id + winners' usernames), + up to four
// `limit 1` probes when the games alone can't tell whether older results exist.
// A game screen = the game's full standings (adapter) + that day's games from every competition
// (each adapter's newest page before the next day, which never splits a date) + one rewards read
// for that one day — the same placement the timeline used, so a reward sits on the same game in
// both places. A player's breakdown is the adapter's getBreakdown only.

const currentYearIn = (timeZone: string, nowMs: number): number =>
  Number((localDateOf(nowMs, timeZone) ?? new Date(nowMs).toISOString()).slice(0, 4));

/** One page of the venue's Results timeline, newest first (`before` = the previous page's `nextBefore`). */
export const getResultsTimelinePage = async (params: {
  venueId: string;
  before?: string | null;
  nowMs?: number;
}): Promise<ResultsTimelinePage> => {
  const nowMs = params.nowMs ?? Date.now();
  const timeZone = await getVenueTimezone(params.venueId);
  const today = localDateOf(nowMs, timeZone) ?? new Date(nowMs).toISOString().slice(0, 10);
  return buildResultsTimelinePage({
    sources: listResultsAdapters().map((adapter) => ({
      id: adapter.id,
      listGames: ({ before, limit, withFirstGameDate }) =>
        adapter.listGames({ venueId: params.venueId, before, limit, nowMs, withFirstGameDate }),
    })),
    rewards: createVenueRewardSource({ venueId: params.venueId, timeZone, currentYear: currentYearIn(timeZone, nowMs) }),
    before: params.before ?? null,
    today,
  });
};

const adapterFor = (competitionId: string): ResultsAdapter => {
  const adapter = getResultsAdapter(competitionId);
  if (!adapter) throw new ResultsNotFoundError("That game wasn't found.");
  return adapter;
};

/** Every competition's games on `date` (venue-local): the newest page before the next day, kept to that date. */
const gamesOnDate = async (venueId: string, date: string, nowMs: number): Promise<ResultsGameRow[]> => {
  const pages = await Promise.all(
    listResultsAdapters().map((adapter) => adapter.listGames({ venueId, before: addDays(date, 1), limit: 1, nowMs })),
  );
  return pages.flatMap((page) => page.games.filter((game) => game.date === date));
};

/**
 * One game's screen: its full standings (every scorer, each with its breakdown `entry`), and the
 * rewards won at it. Another venue's game, an unknown competition or a malformed key is a 404.
 */
export const getResultsGameScreen = async (params: {
  venueId: string;
  competitionId: string;
  gameKey: string;
  nowMs?: number;
}): Promise<ResultsGameScreen> => {
  const nowMs = params.nowMs ?? Date.now();
  const adapter = adapterFor(params.competitionId);
  const [detail, timeZone] = await Promise.all([
    adapter.getStandings({ venueId: params.venueId, gameKey: params.gameKey, nowMs }),
    getVenueTimezone(params.venueId),
  ]);
  const { game } = detail;
  if (game.inProgress) return { ...detail, rewards: [] };

  const sameDay = await gamesOnDate(params.venueId, game.date, nowMs);
  // The game itself, even if the day's lists missed it (a game nobody played isn't listed).
  const games = sameDay.some((row) => row.competitionId === game.competitionId && row.gameKey === game.gameKey)
    ? sameDay
    : [...sameDay, game];
  const items = await createVenueRewardSource({
    venueId: params.venueId,
    timeZone,
    currentYear: currentYearIn(timeZone, nowMs),
  }).read({ lo: game.date, hi: addDays(game.date, 1), games });
  const rewards = items.filter(
    (item) => item.attach.kind === "game" && item.attach.competitionId === game.competitionId && item.attach.gameKey === game.gameKey,
  );
  return { ...detail, rewards };
};

/**
 * One player's breakdown of one game, by the `entry` token from that game's standings. Tokens off
 * (no SESSION_SECRET) → 503 before any read; a malformed token, a competition without a breakdown,
 * or a token from another venue / game → 404.
 */
export const getResultsBreakdown = async (params: {
  venueId: string;
  competitionId: string;
  gameKey: string;
  entry: string;
  nowMs?: number;
}): Promise<ResultsBreakdown> => {
  if (!resultsEntryTokensEnabled()) throw new ResultsUnavailableError("Player breakdowns aren't available.");
  const adapter = adapterFor(params.competitionId);
  if (!getResultsCompetition(params.competitionId)?.hasBreakdown || !adapter.getBreakdown || !isResultsEntryToken(params.entry)) {
    throw new ResultsNotFoundError("That player wasn't found.");
  }
  return adapter.getBreakdown({
    venueId: params.venueId,
    gameKey: params.gameKey,
    entry: params.entry,
    nowMs: params.nowMs ?? Date.now(),
  });
};
