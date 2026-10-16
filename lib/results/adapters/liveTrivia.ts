import "server-only";

import { enumerateScheduleOccurrences, loadLiveTriviaSchedulesForVenues, type TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import { LiveTriviaWeekTotalsMissingError, loadLiveTriviaWeekTotals } from "@/lib/liveTriviaWeekTotals";
import { parseGamesCursor, rankGameStandings } from "@/lib/ownerHistoryDisplay";
import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";
import { loadUsernames } from "@/lib/results/playerNames";
import type { ResultsAdapter, ResultsGameDetail, ResultsGamePage, ResultsGameRow } from "@/lib/results/types";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";

// Live Trivia on the Results page (docs/partner-results-page-plan.md §5a). Moved here from
// lib/ownerHistory.ts (Phase 2), whose Game Results functions are now thin wrappers over this file.
//
// A game is one occurrence of one of the venue's Live Trivia schedules: gameKey
// "<scheduleId>:<YYYY-MM-DD>" (the schedule's own local date, as live_showdown_answers stores it).
// Every read is scoped to the venue's own schedules, so another venue's game is a 404.
//
// COST: a page is one schedules read + the live_trivia_occurrence_summaries RPC (paged in SQL, never
// splits a date) + one usernames read for the page's winners (+ one index probe per schedule for the
// first game date, first page only). A game's standings are the schedules read + one totals RPC +
// one usernames read over that game's scorers.

export const LIVE_TRIVIA_COMPETITION_ID = "live_trivia";

/** The 1970-01-01 backfill sentinel rows from before occurrence dates existed are never a game date. */
const OCCURRENCE_DATE_SENTINEL = "1970-01-01";

const client = () => {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
  return supabaseAdmin;
};

export const liveTriviaGameKey = (scheduleId: string, occurrenceDate: string): string => `${scheduleId}:${occurrenceDate}`;

/** The schedule and date a gameKey names, or null for anything malformed. */
export const parseLiveTriviaGameKey = (gameKey: string): { scheduleId: string; occurrenceDate: string } | null => {
  const value = String(gameKey ?? "").trim();
  const split = value.lastIndexOf(":");
  if (split <= 0) return null;
  const scheduleId = value.slice(0, split);
  const occurrenceDate = parseGamesCursor(value.slice(split + 1));
  return occurrenceDate && /^[A-Za-z0-9-]{1,64}$/.test(scheduleId) ? { scheduleId, occurrenceDate } : null;
};

const scheduleTitle = (schedule: TriviaScheduleRow): string => String(schedule.title ?? "").trim() || "Live Trivia";

/** Has this occurrence of `schedule` started but not ended at `nowMs`? */
const isInProgress = (schedule: TriviaScheduleRow, occurrenceDate: string, nowMs: number): boolean =>
  enumerateScheduleOccurrences(schedule, nowMs).some(
    (occurrence) => occurrence.occurrenceDate === occurrenceDate && occurrence.endMs > nowMs,
  );

/**
 * When this occurrence started (ISO), from the schedule as it is configured now — the instant a
 * game-winner reward keys its cycle on. enumerateScheduleOccurrences lists games 7 days either side
 * of its probe, so probing at noon UTC of the date always sees it. Null when the schedule doesn't
 * run that date any more (it was edited since): placement then falls back to the date alone.
 */
const occurrenceStartIso = (schedule: TriviaScheduleRow, occurrenceDate: string): string | null => {
  const [year, month, day] = occurrenceDate.split("-").map(Number);
  const probeMs = Date.UTC(year, month - 1, day, 12);
  const match = enumerateScheduleOccurrences(schedule, probeMs).find((occurrence) => occurrence.occurrenceDate === occurrenceDate);
  return match && Number.isFinite(match.startMs) ? new Date(match.startMs).toISOString() : null;
};

const venueSchedules = async (venueId: string): Promise<Map<string, TriviaScheduleRow>> => {
  const schedules = await loadLiveTriviaSchedulesForVenues([venueId]);
  return new Map(schedules.filter((row) => row.venue_id === venueId).map((row) => [row.id, row]));
};

/**
 * The venue's first Live Trivia game date. One `order by occurrence_date limit 1` per schedule — an
 * index probe on idx_lsa_occurrence (schedule_id, occurrence_date), never a scan. Best-effort: a
 * failed probe means "unknown" (no year grouping), never a failed page.
 */
const loadFirstGameDate = async (scheduleIds: string[]): Promise<string | null> => {
  try {
    const dates = await Promise.all(
      scheduleIds.map(async (scheduleId) => {
        const { data, error } = await client()
          .from("live_showdown_answers")
          .select("occurrence_date")
          .eq("schedule_id", scheduleId)
          .gt("occurrence_date", OCCURRENCE_DATE_SENTINEL)
          .order("occurrence_date", { ascending: true })
          .limit(1)
          .returns<Array<{ occurrence_date: string | null }>>();
        if (error) throw new Error(error.message ?? "first game date read failed");
        const date = data?.[0]?.occurrence_date;
        return date ? String(date).slice(0, 10) : null;
      }),
    );
    return dates.reduce<string | null>((min, date) => (date && (min === null || date < min) ? date : min), null);
  } catch (error) {
    console.error("[OwnerHistory] first-game-date-failed", error instanceof Error ? error.message : error);
    return null;
  }
};

type OccurrenceSummaryRpcRow = {
  schedule_id: string;
  occurrence_date: string;
  player_count: number | string;
  top_points: number | string | null;
  top_user_ids: string[] | null;
};

const listGames: ResultsAdapter["listGames"] = async ({ venueId, before, limit, nowMs, withFirstGameDate }) => {
  const byId = await venueSchedules(venueId);
  if (byId.size === 0) return { games: [], exhausted: true };

  const cursor = parseGamesCursor(before);
  const [{ data, error }, firstGameDate] = await Promise.all([
    client().rpc("live_trivia_occurrence_summaries", {
      p_schedule_ids: [...byId.keys()],
      p_before: cursor,
      p_limit: limit,
    }),
    withFirstGameDate ? loadFirstGameDate([...byId.keys()]) : Promise.resolve(undefined),
  ]);
  if (error) {
    if (isMissingFunction(error, "live_trivia_occurrence_summaries")) {
      console.error("[OwnerHistory] rpc-missing live_trivia_occurrence_summaries");
      throw new ResultsUnavailableError("Past games aren't available yet.");
    }
    throw new Error(`live_trivia_occurrence_summaries RPC failed: ${error.message}`);
  }

  const rows = ((data ?? []) as OccurrenceSummaryRpcRow[]).filter((row) => byId.has(row.schedule_id));
  const names = await loadUsernames(rows.flatMap((row) => row.top_user_ids ?? []));
  const games: ResultsGameRow[] = rows.map((row) => {
    const schedule = byId.get(row.schedule_id) as TriviaScheduleRow;
    const date = String(row.occurrence_date).slice(0, 10);
    const inProgress = isInProgress(schedule, date, nowMs);
    return {
      competitionId: LIVE_TRIVIA_COMPETITION_ID,
      gameKey: liveTriviaGameKey(schedule.id, date),
      date,
      startsAt: occurrenceStartIso(schedule, date),
      title: scheduleTitle(schedule),
      playerCount: Number(row.player_count) || 0,
      inProgress,
      // A game still being played names nobody: its leader isn't its winner yet.
      winners: inProgress ? [] : (row.top_user_ids ?? []).map((id) => names.get(id) ?? null),
      topScore: inProgress ? 0 : Number(row.top_points) || 0,
    };
  });

  // The RPC returns `limit` games (a few more when several schedules share the page's oldest date,
  // which it never splits), so a short page is the last one.
  const page: ResultsGamePage = { games, exhausted: rows.length < limit };
  return firstGameDate === undefined ? page : { ...page, firstGameDate };
};

const getStandings: ResultsAdapter["getStandings"] = async ({ venueId, gameKey, nowMs, limit }): Promise<ResultsGameDetail> => {
  const key = parseLiveTriviaGameKey(gameKey);
  if (!key) throw new ResultsNotFoundError("That game wasn't found.");
  const schedule = (await venueSchedules(venueId)).get(key.scheduleId);
  if (!schedule) throw new ResultsNotFoundError("That game wasn't found.");

  let totals: Awaited<ReturnType<typeof loadLiveTriviaWeekTotals>>;
  try {
    totals = await loadLiveTriviaWeekTotals([{ scheduleId: schedule.id, occurrenceDate: key.occurrenceDate }]);
  } catch (error) {
    if (error instanceof LiveTriviaWeekTotalsMissingError) throw new ResultsUnavailableError("Past games aren't available yet.");
    throw error;
  }
  const inProgress = isInProgress(schedule, key.occurrenceDate, nowMs);
  // Names for the scorers only; 0-point players are counted in the total, never listed.
  const names = inProgress
    ? new Map<string, string>()
    : await loadUsernames(totals.filter((row) => row.totalPoints > 0).map((row) => row.userId));
  // A game still being played has no final standings yet.
  const ranked = inProgress
    ? []
    : rankGameStandings(
        totals.map((row) => ({ username: names.get(row.userId) ?? null, points: row.totalPoints, reachedAt: row.reachedAt })),
        limit ?? Number.POSITIVE_INFINITY,
      );
  const leaders = ranked.filter((row) => row.rank === 1);
  return {
    game: {
      competitionId: LIVE_TRIVIA_COMPETITION_ID,
      gameKey: liveTriviaGameKey(schedule.id, key.occurrenceDate),
      date: key.occurrenceDate,
      startsAt: occurrenceStartIso(schedule, key.occurrenceDate),
      title: scheduleTitle(schedule),
      playerCount: totals.length,
      inProgress,
      winners: leaders.map((row) => row.username),
      topScore: leaders[0]?.points ?? 0,
    },
    standings: ranked.map((row) => ({ rank: row.rank, username: row.username, score: row.points, entry: null })),
  };
};

export const liveTriviaResultsAdapter: ResultsAdapter = {
  id: LIVE_TRIVIA_COMPETITION_ID,
  listGames,
  getStandings,
};
