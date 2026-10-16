import "server-only";

import { localDateOf } from "@/lib/ownerHistoryDisplay";
import { listResultsAdapters } from "@/lib/results/adapters";
import { createVenueRewardSource } from "@/lib/results/rewardSource";
import { buildResultsTimelinePage } from "@/lib/results/timeline";
import type { ResultsTimelinePage } from "@/lib/results/types";
import { getVenueTimezone } from "@/lib/timezone";

// The Partner Dashboard's Results page, server side (docs/partner-results-page-plan.md §5).
// Read-only. The route (app/api/owner/results) checks the partner controls `venueId` BEFORE calling
// anything here, and every read below is scoped to that venue.
//
// COST (plan §6): only on demand. One timeline page = per competition its games page (Live Trivia:
// schedules + summary RPC + winners' usernames), + the venue's timezone (cached 10 min), + one
// rewards window (ledger + settlements + campaigns by id + winners' usernames), + up to four
// `limit 1` probes when the games alone can't tell whether older results exist.

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
