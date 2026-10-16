import "server-only";

import { enumerateScheduleOccurrences, loadLiveTriviaSchedulesForVenues, type TriviaScheduleRow } from "@/lib/liveShowdownEngine";
import { LiveTriviaWeekTotalsMissingError, loadLiveTriviaWeekTotals } from "@/lib/liveTriviaWeekTotals";
import { parseGamesCursor, rankScorers } from "@/lib/ownerHistoryDisplay";
import { findResultsEntry, makeResultsEntryTokens, resultsEntryTokensEnabled } from "@/lib/results/entryToken";
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
// one usernames read over that game's scorers (chunked). A player's breakdown is the schedules
// read + the totals RPC + one answers read (getBreakdown below).

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

/** The venue's schedule a gameKey names, or a 404. Every game read starts here. */
const venueGame = async (venueId: string, gameKey: string): Promise<{ schedule: TriviaScheduleRow; occurrenceDate: string }> => {
  const key = parseLiveTriviaGameKey(gameKey);
  if (!key) throw new ResultsNotFoundError("That game wasn't found.");
  const schedule = (await venueSchedules(venueId)).get(key.scheduleId);
  if (!schedule) throw new ResultsNotFoundError("That game wasn't found.");
  return { schedule, occurrenceDate: key.occurrenceDate };
};

/** Every player's total for one game (one RPC: the same aggregate the weekly reward ranks on). */
const gameTotals = async (scheduleId: string, occurrenceDate: string) => {
  try {
    return await loadLiveTriviaWeekTotals([{ scheduleId, occurrenceDate }]);
  } catch (error) {
    if (error instanceof LiveTriviaWeekTotalsMissingError) throw new ResultsUnavailableError("Past games aren't available yet.");
    throw error;
  }
};

const getStandings: ResultsAdapter["getStandings"] = async ({ venueId, gameKey, nowMs }): Promise<ResultsGameDetail> => {
  const { schedule, occurrenceDate } = await venueGame(venueId, gameKey);
  const totals = await gameTotals(schedule.id, occurrenceDate);
  const inProgress = isInProgress(schedule, occurrenceDate, nowMs);
  // A game still being played has no final standings yet.
  const ranked = inProgress
    ? []
    : rankScorers(totals.map((row) => ({ userId: row.userId, points: row.totalPoints, reachedAt: row.reachedAt })));
  // Names for the listed scorers only; 0-point players are counted in the total, never listed.
  const names = await loadUsernames(ranked.map(({ row }) => row.userId));
  const canonicalKey = liveTriviaGameKey(schedule.id, occurrenceDate);
  // A deleted player (no username) gets no token: their row is not tappable.
  const tokens = makeResultsEntryTokens(
    { venueId, competitionId: LIVE_TRIVIA_COMPETITION_ID, gameKey: canonicalKey },
    ranked.filter(({ row }) => names.has(row.userId)).map(({ row }) => row.userId),
  );
  const standings = ranked.map(({ rank, row }) => ({
    rank,
    username: names.get(row.userId) ?? null,
    score: row.points,
    entry: tokens.get(row.userId) ?? null,
  }));
  const leaders = standings.filter((row) => row.rank === 1);
  return {
    game: {
      competitionId: LIVE_TRIVIA_COMPETITION_ID,
      gameKey: canonicalKey,
      date: occurrenceDate,
      startsAt: occurrenceStartIso(schedule, occurrenceDate),
      title: scheduleTitle(schedule),
      playerCount: totals.length,
      inProgress,
      winners: leaders.map((row) => row.username),
      topScore: leaders[0]?.score ?? 0,
    },
    standings,
  };
};

/** The longest question text sent; the screen shows one line of it. */
const QUESTION_DETAIL_MAX = 160;
/** A game is at most 24 rounds × 15 questions = 360 answers per player. */
const BREAKDOWN_ROWS_CAP = 1000;

type BreakdownAnswerRow = {
  is_correct: boolean | null;
  points_awarded: number | null;
  round_number: number;
  question_index: number;
  question: { question: string | null } | null;
};

const questionDetail = (text: string | null | undefined): string => {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > QUESTION_DETAIL_MAX ? `${clean.slice(0, QUESTION_DETAIL_MAX - 1).trimEnd()}…` : clean;
};

/**
 * PRIVACY (plan §5d, R1). The answers read selects is_correct, points_awarded, round_number,
 * question_index and the question's text through its foreign key — NEVER the player's typed
 * answer (neither the raw nor the normalized column) and never user_id. tests/results-privacy-contract
 * .test.ts pins the select. The question text comes embedded (live_showdown_answers.question_id →
 * trivia_questions.slug), so it is ONE read; an `in()` over slugs (up to 192 characters each) would
 * pass the URL limit.
 *
 * COST: schedules read + the totals RPC (to resolve the token to a scorer of THIS game) + one
 * answers read on live_showdown_answers_occurrence_unique (schedule_id, occurrence_date, …, user_id)
 * — measured on production by `npm run results:explain-breakdown`.
 */
const getBreakdown: NonNullable<ResultsAdapter["getBreakdown"]> = async ({ venueId, gameKey, entry, nowMs }) => {
  if (!resultsEntryTokensEnabled()) throw new ResultsUnavailableError("Player breakdowns aren't available.");
  const { schedule, occurrenceDate } = await venueGame(venueId, gameKey);
  // No breakdown while the game is still being played: the standings don't list anyone yet.
  if (isInProgress(schedule, occurrenceDate, nowMs)) throw new ResultsNotFoundError("That player wasn't found.");

  const totals = await gameTotals(schedule.id, occurrenceDate);
  const scorers = totals.filter((row) => row.totalPoints > 0);
  const userId = findResultsEntry(
    { venueId, competitionId: LIVE_TRIVIA_COMPETITION_ID, gameKey: liveTriviaGameKey(schedule.id, occurrenceDate) },
    scorers.map((row) => row.userId),
    entry,
  );
  if (!userId) throw new ResultsNotFoundError("That player wasn't found.");

  const { data, error } = await client()
    .from("live_showdown_answers")
    .select("is_correct, points_awarded, round_number, question_index, question:trivia_questions(question)")
    .eq("schedule_id", schedule.id)
    .eq("occurrence_date", occurrenceDate)
    .eq("user_id", userId)
    .order("round_number", { ascending: true })
    .order("question_index", { ascending: true })
    .limit(BREAKDOWN_ROWS_CAP)
    .returns<BreakdownAnswerRow[]>();
  if (error) throw new Error(error.message ?? "Failed to load the player's answers.");

  const rows = (data ?? []).map((row) => ({
    group: `Round ${row.round_number}`,
    label: `Q${row.question_index}`,
    detail: questionDetail(row.question?.question),
    outcome: row.is_correct ? ("right" as const) : ("wrong" as const),
    points: Number(row.points_awarded) || 0,
  }));
  const total = rows.reduce((sum, row) => sum + row.points, 0);
  // The same rows the totals RPC sums, so these always agree; a mismatch means a read raced a write.
  const expected = scorers.find((row) => row.userId === userId)?.totalPoints;
  if (expected !== total) console.error("[Results] breakdown-total-mismatch", { gameKey, expected, total });
  return { rows, total };
};

export const liveTriviaResultsAdapter: ResultsAdapter = {
  id: LIVE_TRIVIA_COMPETITION_ID,
  listGames,
  getStandings,
  getBreakdown,
};
