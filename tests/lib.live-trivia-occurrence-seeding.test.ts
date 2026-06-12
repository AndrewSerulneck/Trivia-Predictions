import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import {
  buildLiveTriviaOccurrenceSeedSlots,
  seedOccurrenceQuestions,
  type LiveTriviaSeedQuestion,
} from "@/lib/liveShowdownEngine";

function makeQuestion(category: string, index: number, overrides: Partial<LiveTriviaSeedQuestion> = {}): LiveTriviaSeedQuestion {
  return {
    slug: `${category.toLowerCase().replace(/\s+/g, "-")}-${index}`,
    category,
    options: [`${category} ${index}`],
    correct_answer: 0,
    question_pool: "live_showdown",
    ...overrides,
  };
}

function makeCategory(category: string, count: number): LiveTriviaSeedQuestion[] {
  return Array.from({ length: count }, (_, index) => makeQuestion(category, index + 1));
}

function makeAwaitableQuery<T extends Record<string, unknown>>(result: T) {
  const query = {
    ...result,
    eq: vi.fn(),
    in: vi.fn(),
    lt: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function seedSlots(params: {
  questions: LiveTriviaSeedQuestion[];
  seenSlugs?: string[];
  recentCategories?: string[];
  venueId?: string;
  occurrenceDate?: string;
  numRounds?: number;
  questionsPerRound?: number;
}) {
  return buildLiveTriviaOccurrenceSeedSlots({
    questions: params.questions,
    seenSlugs: new Set(params.seenSlugs ?? []),
    recentCategories: new Set(params.recentCategories ?? []),
    scheduleId: "schedule-1",
    occurrenceDate: params.occurrenceDate ?? "2026-06-12",
    venueId: params.venueId ?? "venue-1",
    numRounds: params.numRounds ?? 2,
    questionsPerRound: params.questionsPerRound ?? 3,
  });
}

function installSeedOccurrenceMocks(params: {
  existingCount?: number;
  seenSlugs?: string[];
  questions?: LiveTriviaSeedQuestion[];
}) {
  const captures: {
    sessionRows: unknown[];
    sessionOptions: unknown;
    seenRows: unknown[];
    seenOptions: unknown;
  } = {
    sessionRows: [],
    sessionOptions: null,
    seenRows: [],
    seenOptions: null,
  };

  mocks.from.mockImplementation((table: string) => {
    if (table === "trivia_session_questions") {
      return {
        select: vi.fn((columns: string) => {
          if (columns === "id") {
            return makeAwaitableQuery({ data: [], count: params.existingCount ?? 0, error: null });
          }
          return makeAwaitableQuery({ data: [], error: null });
        }),
        upsert: vi.fn((rows: unknown[], options: unknown) => {
          captures.sessionRows = rows;
          captures.sessionOptions = options;
          return { error: null };
        }),
      };
    }

    if (table === "venue_seen_questions") {
      return {
        select: vi.fn(() =>
          makeAwaitableQuery({
            data: (params.seenSlugs ?? []).map((questionId) => ({ question_id: questionId })),
            error: null,
          })
        ),
        upsert: vi.fn((rows: unknown[], options: unknown) => {
          captures.seenRows = rows;
          captures.seenOptions = options;
          return { error: null };
        }),
      };
    }

    if (table === "trivia_questions") {
      return {
        select: vi.fn(() => makeAwaitableQuery({ data: params.questions ?? [], error: null })),
      };
    }

    if (table === "trivia_schedules") {
      return {
        select: vi.fn(() => makeAwaitableQuery({ data: [], error: null })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return captures;
}

describe("Live Trivia occurrence seeding", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("selects category-homogeneous rounds before assigning questions", () => {
    const result = seedSlots({
      questions: [...makeCategory("Music", 4), ...makeCategory("Sports", 4)],
    });

    expect(result.slots).toHaveLength(6);
    for (const roundNumber of [1, 2]) {
      const roundSlots = result.slots.filter((slot) => slot.roundNumber === roundNumber);
      expect(new Set(roundSlots.map((slot) => slot.category)).size).toBe(1);
      expect(roundSlots.map((slot) => slot.questionIndex)).toEqual([1, 2, 3]);
    }
    expect(new Set(result.slots.map((slot) => slot.slug)).size).toBe(6);
  });

  it("is deterministic for the same occurrence inputs", () => {
    const questions = [...makeCategory("Music", 5), ...makeCategory("Sports", 5), ...makeCategory("Movies", 5)];

    const first = seedSlots({ questions });
    const second = seedSlots({ questions });

    expect(second.slots).toEqual(first.slots);
  });

  it("varies question ordering by venue", () => {
    const questions = [...makeCategory("Music", 6), ...makeCategory("Sports", 6), ...makeCategory("Movies", 6)];

    const first = seedSlots({ questions, venueId: "venue-alpha" });
    const second = seedSlots({ questions, venueId: "venue-bravo" });

    expect(second.slots.map((slot) => slot.slug)).not.toEqual(first.slots.map((slot) => slot.slug));
  });

  it("varies question ordering by occurrence date", () => {
    const questions = [...makeCategory("Music", 6), ...makeCategory("Sports", 6), ...makeCategory("Movies", 6)];

    const first = seedSlots({ questions, occurrenceDate: "2026-06-12" });
    const second = seedSlots({ questions, occurrenceDate: "2026-06-13" });

    expect(second.slots.map((slot) => slot.slug)).not.toEqual(first.slots.map((slot) => slot.slug));
  });

  it("prefers unseen questions within the selected category", () => {
    const questions = makeCategory("Music", 5);
    const seenSlugs = ["music-1", "music-2"];

    const result = seedSlots({ questions, seenSlugs, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.slots.every((slot) => slot.wasSeen === false)).toBe(true);
    expect(result.usedSeen).toBe(false);
  });

  it("falls back to seen questions when a category lacks enough unseen inventory", () => {
    const questions = makeCategory("Music", 3);
    const seenSlugs = ["music-1", "music-2"];

    const result = seedSlots({ questions, seenSlugs, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.slots.some((slot) => slot.wasSeen)).toBe(true);
    expect(result.usedSeen).toBe(true);
  });

  it("prefers categories that can fill a complete round", () => {
    const questions = [
      ...makeCategory("Music", 2),
      ...makeCategory("Sports", 3),
      ...makeCategory("Movies", 3),
    ];

    const result = seedSlots({ questions, numRounds: 2, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(6);
    expect(result.slots.some((slot) => slot.category === "Music")).toBe(false);
    expect(result.repeatedQuestions).toBe(false);
  });

  it("avoids recently used categories when fresh categories can fill the game", () => {
    const questions = [...makeCategory("Music", 3), ...makeCategory("Sports", 3), ...makeCategory("Movies", 3)];

    const result = seedSlots({
      questions,
      recentCategories: ["Music"],
      numRounds: 2,
      questionsPerRound: 3,
    });

    expect(result.slots).toHaveLength(6);
    expect(result.slots.some((slot) => slot.category === "Music")).toBe(false);
    expect(result.usedRecentCategory).toBe(false);
  });

  it("uses a recent category before repeating a fresh category in the same game", () => {
    const questions = [...makeCategory("Music", 3), ...makeCategory("Sports", 3), ...makeCategory("Movies", 3)];

    const result = seedSlots({
      questions,
      recentCategories: ["Music"],
      numRounds: 3,
      questionsPerRound: 3,
    });
    const categories = new Set(result.slots.map((slot) => slot.category));

    expect(result.slots).toHaveLength(9);
    expect(categories).toEqual(new Set(["Music", "Sports", "Movies"]));
    expect(result.usedRecentCategory).toBe(true);
  });

  it("excludes blocked categories, non-live pools, and non-write-in-compatible answers", () => {
    const questions: LiveTriviaSeedQuestion[] = [
      ...makeCategory("Music", 3),
      ...makeCategory("Fantasy Epics", 3),
      makeQuestion("Sports", 1, { question_pool: "anytime_blitz" }),
      makeQuestion("Movies", 1, { options: ["A correct answer with too many words"] }),
    ];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(new Set(result.slots.map((slot) => slot.category))).toEqual(new Set(["Music"]));
  });

  it("skips an occurrence that already has seeded session rows", async () => {
    const captures = installSeedOccurrenceMocks({ existingCount: 15 });

    const result = await seedOccurrenceQuestions("schedule-1", "2026-06-12", "venue-1", 1);

    expect(result).toEqual({ seeded: 0, skipped: 15 });
    expect(captures.sessionRows).toEqual([]);
    expect(captures.seenRows).toEqual([]);
  });

  it("inserts occurrence-aware session rows and records unique venue seen questions", async () => {
    const questions = [...makeCategory("Music", 15), ...makeCategory("Sports", 15)];
    const captures = installSeedOccurrenceMocks({ questions });

    const result = await seedOccurrenceQuestions("schedule-1", "2026-06-12", "venue-1", 2);

    expect(result).toEqual({ seeded: 30, skipped: 0 });
    expect(captures.sessionRows).toHaveLength(30);
    expect(captures.sessionOptions).toEqual({
      onConflict: "schedule_id,occurrence_date,round_number,question_index",
      ignoreDuplicates: true,
    });

    const rows = captures.sessionRows as Array<{
      schedule_id: string;
      occurrence_date: string;
      question_id: string;
      round_number: number;
      question_index: number;
    }>;
    expect(rows.every((row) => row.schedule_id === "schedule-1")).toBe(true);
    expect(rows.every((row) => row.occurrence_date === "2026-06-12")).toBe(true);
    expect(rows.filter((row) => row.round_number === 1).map((row) => row.question_index)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1)
    );
    expect(rows.filter((row) => row.round_number === 2).map((row) => row.question_index)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1)
    );
    expect(new Set(rows.map((row) => row.question_id)).size).toBe(30);

    expect(captures.seenRows).toHaveLength(30);
    expect(captures.seenOptions).toEqual({
      onConflict: "venue_id,question_id",
      ignoreDuplicates: true,
    });
    expect(
      (captures.seenRows as Array<{ venue_id: string; question_id: string }>).every(
        (row) => row.venue_id === "venue-1"
      )
    ).toBe(true);
  });
});
