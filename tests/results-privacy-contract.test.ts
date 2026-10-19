import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeCampaign } from "@/types";

// docs/partner-results-page-plan.md §5d, Phase 3: the Results page's privacy boundary.
// - No Results response ever carries a player id (every response JSON is scanned).
// - A player's typed answer is never selected, let alone returned (R1).
// - A standings `entry` token opens that player's breakdown for THAT venue's game only.
// - A breakdown's total equals the player's standings score.
// - No SESSION_SECRET → no tokens, and the breakdown fails closed (503) before any read.
//
// The real adapter, entry tokens, reward source and ownerResults run against a fake database that
// returns WHOLE rows (user_id, submitted_answer and all), so the test proves the code drops them.

type AnswerRow = {
  schedule_id: string;
  occurrence_date: string;
  user_id: string;
  round_number: number;
  question_index: number;
  is_correct: boolean;
  points_awarded: number;
  answered_at: string;
  submitted_answer: string;
  normalized_answer: string;
  question: { question: string };
};

const db = vi.hoisted(() => ({
  answers: [] as AnswerRow[],
  users: [] as Array<{ id: string; username: string | null }>,
  tables: {} as Record<string, unknown[]>,
  reads: [] as string[],
}));

const fns = vi.hoisted(() => ({
  enumerateScheduleOccurrences: vi.fn(
    (_row: unknown, _now: number): Array<{ occurrenceDate: string; startMs: number; endMs: number }> => [],
  ),
  listChallengeCampaignsByIds: vi.fn(async (_ids: readonly string[]): Promise<unknown[]> => []),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/timezone", () => ({ getVenueTimezone: async () => "America/New_York" }));
vi.mock("@/lib/challengeCampaigns", () => ({ listChallengeCampaignsByIds: fns.listChallengeCampaignsByIds }));
vi.mock("@/lib/liveShowdownAdmin", () => ({ listScheduleTimezones: async () => new Map() }));
vi.mock("@/lib/liveShowdownEngine", () => ({
  loadLiveTriviaSchedulesForVenues: async (venueIds: string[]) =>
    [
      { id: "aaaaaaaa-0000-0000-0000-00000000000a", venue_id: "venue-a", title: "Weekday Trivia", timezone: "America/New_York" },
      { id: "bbbbbbbb-0000-0000-0000-00000000000b", venue_id: "venue-b", title: "Pub Quiz", timezone: "America/New_York" },
    ].filter((row) => venueIds.includes(row.venue_id)),
  enumerateScheduleOccurrences: fns.enumerateScheduleOccurrences,
}));
// The same aggregate as the live_trivia_week_totals SQL: sum(points_awarded) per player over the
// games' rows, reached_at = their last scoring answer.
vi.mock("@/lib/liveTriviaWeekTotals", () => ({
  LiveTriviaWeekTotalsMissingError: class LiveTriviaWeekTotalsMissingError extends Error {},
  loadLiveTriviaWeekTotals: async (games: Array<{ scheduleId: string; occurrenceDate: string }>) => {
    db.reads.push("rpc:live_trivia_week_totals");
    const totals = new Map<string, { userId: string; totalPoints: number; reachedAt: string | null }>();
    for (const row of db.answers) {
      if (!games.some((game) => game.scheduleId === row.schedule_id && game.occurrenceDate === row.occurrence_date)) continue;
      const total = totals.get(row.user_id) ?? { userId: row.user_id, totalPoints: 0, reachedAt: null };
      total.totalPoints += row.points_awarded;
      if (row.points_awarded > 0 && (!total.reachedAt || row.answered_at > total.reachedAt)) total.reachedAt = row.answered_at;
      totals.set(row.user_id, total);
    }
    return [...totals.values()];
  },
}));
vi.mock("@/lib/supabaseAdmin", () => {
  const builder = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    const self: Record<string, unknown> = {};
    for (const method of ["select", "gt", "lt", "gte", "or", "order", "limit", "returns"]) self[method] = () => self;
    self.eq = (column: string, value: unknown) => {
      eqs.push([column, value]);
      return self;
    };
    self.in = (column: string, values: unknown[]) => {
      ins.push([column, values]);
      return self;
    };
    self.then = (resolve: (value: unknown) => unknown) => {
      db.reads.push(table);
      const source = table === "live_showdown_answers" ? db.answers : table === "users" ? db.users : db.tables[table] ?? [];
      const rows = (source as Array<Record<string, unknown>>).filter(
        (row) => eqs.every(([column, value]) => row[column] === value) && ins.every(([column, values]) => values.includes(row[column])),
      );
      return resolve({ data: rows, error: null });
    };
    return self;
  };
  // live_trivia_occurrence_summaries: games before p_before, newest first, whole dates.
  const summaries = (args: { p_schedule_ids: string[]; p_before: string | null; p_limit: number }) => {
    const games = new Map<string, { schedule_id: string; occurrence_date: string; players: Map<string, number> }>();
    for (const row of db.answers) {
      if (!args.p_schedule_ids.includes(row.schedule_id)) continue;
      if (args.p_before && row.occurrence_date >= args.p_before) continue;
      const key = `${row.schedule_id}|${row.occurrence_date}`;
      const game = games.get(key) ?? { schedule_id: row.schedule_id, occurrence_date: row.occurrence_date, players: new Map() };
      game.players.set(row.user_id, (game.players.get(row.user_id) ?? 0) + row.points_awarded);
      games.set(key, game);
    }
    const sorted = [...games.values()].sort((a, b) => (a.occurrence_date < b.occurrence_date ? 1 : -1));
    const cutDate = sorted[Math.min(args.p_limit, sorted.length) - 1]?.occurrence_date;
    return sorted
      .filter((game) => cutDate !== undefined && game.occurrence_date >= cutDate)
      .map((game) => {
        const top = Math.max(0, ...game.players.values());
        return {
          schedule_id: game.schedule_id,
          occurrence_date: game.occurrence_date,
          player_count: game.players.size,
          top_points: top,
          top_user_ids: top > 0 ? [...game.players].filter(([, points]) => points === top).map(([id]) => id) : [],
        };
      });
  };
  return {
    supabaseAdmin: {
      from: (table: string) => builder(table),
      rpc: async (name: string, args: { p_schedule_ids: string[]; p_before: string | null; p_limit: number }) => {
        db.reads.push(`rpc:${name}`);
        return { data: name === "live_trivia_occurrence_summaries" ? summaries(args) : [], error: null };
      },
    },
  };
});

import { ResultsNotFoundError, ResultsUnavailableError } from "@/lib/results/errors";
import { findResultsEntry, makeResultsEntryTokens } from "@/lib/results/entryToken";
import { getResultsBreakdown, getResultsGameScreen, getResultsTimelinePage } from "@/lib/results/ownerResults";

const SCHED_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const SCHED_B = "bbbbbbbb-0000-0000-0000-00000000000b";
const MURPH = "11111111-1111-4111-8111-111111111111";
const KATE = "22222222-2222-4222-8222-222222222222";
const ZERO = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-8444-444444444444";
const PLAYER_IDS = [MURPH, KATE, ZERO, GONE];
const NOW = Date.parse("2026-10-16T16:00:00Z");
const GAME_A = `${SCHED_A}:2026-10-09`;
const GAME_A_EARLIER = `${SCHED_A}:2026-10-08`;
const GAME_B = `${SCHED_B}:2026-10-09`;

let answerSeq = 0;
const answer = (scheduleId: string, date: string, userId: string, round: number, q: number, right: boolean): AnswerRow => {
  answerSeq += 1;
  return {
    schedule_id: scheduleId,
    occurrence_date: date,
    user_id: userId,
    round_number: round,
    question_index: q,
    is_correct: right,
    points_awarded: right ? 10 : 0,
    answered_at: `${date}T23:${String(answerSeq).padStart(2, "0")}:00Z`,
    submitted_answer: `TYPED-ANSWER-${answerSeq}`,
    normalized_answer: `typed-answer-${answerSeq}`,
    question: { question: `Round ${round} question ${q}: who sang   Hound Dog?` },
  };
};

const dailyCampaign = {
  id: "cccccccc-0000-4000-8000-00000000000c",
  name: "Nightly 20",
  winCondition: "points_threshold",
  rewardDefinitionId: null,
  recurringType: "daily",
  scheduleType: "recurring",
  activeDays: [],
  endDay: null,
  endTime: null,
  pointsRequiredToWin: 20,
  placePrizes: null,
  winnerQuota: 1,
  gameWinnerSlots: null,
} as unknown as ChallengeCampaign;

const venueA = { venueId: "venue-a", nowMs: NOW };
const screen = (gameKey = GAME_A) => getResultsGameScreen({ ...venueA, competitionId: "live_trivia", gameKey });
const breakdown = (entry: string, gameKey = GAME_A, venueId = "venue-a") =>
  getResultsBreakdown({ venueId, competitionId: "live_trivia", gameKey, entry, nowMs: NOW });

const expectNoPlayerData = (value: unknown) => {
  const json = JSON.stringify(value);
  for (const id of PLAYER_IDS) expect(json).not.toContain(id);
  expect(json).not.toMatch(/TYPED-ANSWER|typed-answer/);
  expect(json).not.toMatch(/user_?id/i);
};

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-for-results-entry-tokens");
  answerSeq = 0;
  db.reads = [];
  db.users = [
    { id: MURPH, username: "murph" },
    { id: KATE, username: "kate99" },
    { id: ZERO, username: "zero_hero" },
    // GONE has no users row: "Deleted player".
  ];
  db.answers = [
    answer(SCHED_A, "2026-10-09", MURPH, 1, 1, true),
    answer(SCHED_A, "2026-10-09", MURPH, 1, 2, false),
    answer(SCHED_A, "2026-10-09", MURPH, 2, 1, true),
    answer(SCHED_A, "2026-10-09", KATE, 1, 1, true),
    answer(SCHED_A, "2026-10-09", ZERO, 1, 1, false),
    answer(SCHED_A, "2026-10-09", GONE, 1, 2, true),
    answer(SCHED_A, "2026-10-08", MURPH, 1, 1, true),
    answer(SCHED_B, "2026-10-09", MURPH, 1, 1, true),
  ];
  db.tables = {
    challenge_cycle_winners: [
      { venue_id: "venue-a", challenge_id: dailyCampaign.id, cycle_start: "2026-10-09T04:00:00+00:00", winner_user_id: MURPH, points_earned: 20, finalized_at: "2026-10-10T00:30:00Z", place: null },
    ],
    challenge_cycle_settlements: [],
  };
  fns.enumerateScheduleOccurrences.mockReset().mockReturnValue([]);
  fns.listChallengeCampaignsByIds.mockReset().mockResolvedValue([dailyCampaign]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("never select the typed answer (R1)", () => {
  const ROOT = process.cwd();
  const sources = [
    "lib/results/adapters/liveTrivia.ts",
    "lib/results/adapters/squares.ts",
    "lib/results/ownerResults.ts",
    "lib/results/entryToken.ts",
    "lib/results/playerNames.ts",
    "lib/results/rewardSource.ts",
    "app/api/owner/results/games/[competition]/[gameKey]/route.ts",
    "app/api/owner/results/games/[competition]/[gameKey]/breakdown/route.ts",
  ];

  it("no Results server file names submitted_answer or normalized_answer", () => {
    for (const file of sources) {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      expect(source, file).not.toMatch(/submitted_answer|normalized_answer/);
    }
  });

  it("the breakdown reads exactly the allowed columns of live_showdown_answers", () => {
    const source = readFileSync(path.join(ROOT, "lib/results/adapters/liveTrivia.ts"), "utf8");
    const selects = [...source.matchAll(/\.from\("live_showdown_answers"\)\s*\.select\("([^"]*)"\)/g)].map((match) => match[1]);
    expect(selects).toContain("is_correct, points_awarded, round_number, question_index, question:trivia_questions(question)");
    for (const select of selects) {
      expect(select).not.toContain("*");
      expect(select).not.toMatch(/answer\b(?!ed)|user_id/);
    }
  });
});

describe("full standings with entry tokens", () => {
  it("lists every scorer, a token for each named one, none for a deleted player, and no ids", async () => {
    const result = await screen();
    expect(result.standings.map(({ rank, username, score }) => [rank, username, score])).toEqual([
      [1, "murph", 20],
      [2, "kate99", 10],
      [2, null, 10],
    ]);
    const [murph, kate, gone] = result.standings;
    expect(murph.entry).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(kate.entry).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(murph.entry).not.toBe(kate.entry);
    expect(gone.entry).toBeNull();
    expect(result.game).toEqual(expect.objectContaining({ playerCount: 4, winners: ["murph"], topScore: 20 }));
    expectNoPlayerData(result);
  });

  it("gives the same player a different token in another game", async () => {
    const [here] = (await screen()).standings;
    const [earlier] = (await screen(GAME_A_EARLIER)).standings;
    expect(here.username).toBe(earlier.username);
    expect(here.entry).not.toBe(earlier.entry);
  });

  it("names nobody and hands out no tokens while the game is still being played", async () => {
    fns.enumerateScheduleOccurrences.mockReturnValue([{ occurrenceDate: "2026-10-09", startMs: NOW - 1000, endMs: NOW + 60_000 }]);
    const result = await screen();
    expect(result.standings).toEqual([]);
    expect(result.rewards).toEqual([]);
  });

  it("has no tokens without SESSION_SECRET, and still no ids", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const result = await screen();
    expect(result.standings.length).toBe(3);
    for (const row of result.standings) expect(row.entry).toBeNull();
    expectNoPlayerData(result);
  });
});

describe("rewards won at this game", () => {
  it("lists the reward placed on this game's card, without its winner's id", async () => {
    const result = await screen();
    expect(result.rewards).toHaveLength(1);
    expect(result.rewards[0]).toEqual(
      expect.objectContaining({
        rewardId: dailyCampaign.id,
        attach: { kind: "game", competitionId: "live_trivia", gameKey: GAME_A },
        winners: [{ place: null, username: "murph", points: 20 }],
      }),
    );
    expectNoPlayerData(result);
  });

  it("does not list it on another game", async () => {
    expect((await screen(GAME_A_EARLIER)).rewards).toEqual([]);
  });
});

describe("player breakdown", () => {
  it("adds up to the standings score for every tappable player, question text but never the typed answer", async () => {
    const { standings } = await screen();
    for (const row of standings.filter((standing) => standing.entry)) {
      const result = await breakdown(row.entry as string);
      expect(result.total).toBe(row.score);
      expect(result.rows.reduce((sum, item) => sum + item.points, 0)).toBe(row.score);
      expectNoPlayerData(result);
    }
    const murph = await breakdown(standings[0].entry as string);
    expect(murph.rows).toEqual([
      { group: "Round 1", label: "Q1", detail: "Round 1 question 1: who sang Hound Dog?", outcome: "right", points: 10 },
      { group: "Round 1", label: "Q2", detail: "Round 1 question 2: who sang Hound Dog?", outcome: "wrong", points: 0 },
      { group: "Round 2", label: "Q1", detail: "Round 2 question 1: who sang Hound Dog?", outcome: "right", points: 10 },
    ]);
  });

  it("refuses a token from another game at the same venue", async () => {
    const [earlier] = (await screen(GAME_A_EARLIER)).standings;
    await expect(breakdown(earlier.entry as string, GAME_A)).rejects.toBeInstanceOf(ResultsNotFoundError);
  });

  it("refuses a token from another venue's game, even for the same player on the same date", async () => {
    const [here] = (await screen()).standings;
    // venue-b's partner, venue-b's game (MURPH played it too), venue-a's token.
    await expect(breakdown(here.entry as string, GAME_B, "venue-b")).rejects.toBeInstanceOf(ResultsNotFoundError);
    // venue-a's partner asking for venue-b's game is a 404 before any score is read.
    db.reads = [];
    await expect(breakdown(here.entry as string, GAME_B, "venue-a")).rejects.toBeInstanceOf(ResultsNotFoundError);
    expect(db.reads).toEqual([]);
  });

  it("a token minted for one scope never matches another (venue, competition or game)", () => {
    const scope = { venueId: "venue-a", competitionId: "live_trivia", gameKey: GAME_A };
    const token = makeResultsEntryTokens(scope, [MURPH]).get(MURPH) as string;
    expect(findResultsEntry(scope, [KATE, MURPH], token)).toBe(MURPH);
    expect(findResultsEntry({ ...scope, venueId: "venue-b" }, [MURPH], token)).toBeNull();
    expect(findResultsEntry({ ...scope, competitionId: "test_cup" }, [MURPH], token)).toBeNull();
    expect(findResultsEntry({ ...scope, gameKey: GAME_A_EARLIER }, [MURPH], token)).toBeNull();
    expect(findResultsEntry(scope, [MURPH], MURPH)).toBeNull();
  });

  it("refuses a 0-point player (never listed, so never given a token)", async () => {
    const token = makeResultsEntryTokens({ venueId: "venue-a", competitionId: "live_trivia", gameKey: GAME_A }, [ZERO]).get(ZERO) as string;
    await expect(breakdown(token)).rejects.toBeInstanceOf(ResultsNotFoundError);
  });

  it("refuses a malformed token or an unknown competition before reading anything", async () => {
    for (const entry of ["", "short", MURPH, "x".repeat(23), "has spaces in it......"]) {
      await expect(breakdown(entry)).rejects.toBeInstanceOf(ResultsNotFoundError);
    }
    await expect(
      getResultsBreakdown({ venueId: "venue-a", competitionId: "test_cup", gameKey: GAME_A, entry: "a".repeat(22), nowMs: NOW }),
    ).rejects.toBeInstanceOf(ResultsNotFoundError);
    expect(db.reads).toEqual([]);
  });

  it("refuses while the game is still being played", async () => {
    const [here] = (await screen()).standings;
    fns.enumerateScheduleOccurrences.mockReturnValue([{ occurrenceDate: "2026-10-09", startMs: NOW - 1000, endMs: NOW + 60_000 }]);
    await expect(breakdown(here.entry as string)).rejects.toBeInstanceOf(ResultsNotFoundError);
  });

  it("fails closed without SESSION_SECRET, before any read", async () => {
    const [here] = (await screen()).standings;
    vi.stubEnv("SESSION_SECRET", "");
    db.reads = [];
    await expect(breakdown(here.entry as string)).rejects.toBeInstanceOf(ResultsUnavailableError);
    expect(db.reads).toEqual([]);
  });
});

describe("the timeline carries no player id either", () => {
  it("scans a whole page", async () => {
    const page = await getResultsTimelinePage(venueA);
    expect(page.games.length).toBeGreaterThan(0);
    expect(page.rewards.length).toBeGreaterThan(0);
    expectNoPlayerData(page);
  });
});
