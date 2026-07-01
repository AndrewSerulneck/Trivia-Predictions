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
import { inferSlugFamily, inferTemplateKey } from "@/lib/liveTriviaSeeding";

function makeQuestion(category: string, index: number, overrides: Partial<LiveTriviaSeedQuestion> = {}): LiveTriviaSeedQuestion {
  return {
    slug: `${category.toLowerCase().replace(/\s+/g, "-")}-${index}`,
    question: `What is ${category} question ${index}?`,
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

function withSourceOrder(questions: LiveTriviaSeedQuestion[], sourceFile = "test-category.json"): LiveTriviaSeedQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    source_file: sourceFile,
    source_order: index,
  }));
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
    range: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.range.mockReturnValue(query);
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
    recentCategories: params.recentCategories ?? [],
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
  seenRows?: Array<{ question_id: string; seen_at: string }>;
  questions?: LiveTriviaSeedQuestion[];
}) {
  const captures: {
    sessionRows: unknown[];
    sessionOptions: unknown;
    seenRows: unknown[];
    seenOptions: unknown;
    deletedSlugs: string[];
    resetRows: unknown[];
    questionRanges: Array<[number, number]>;
  } = {
    sessionRows: [],
    sessionOptions: null,
    seenRows: [],
    seenOptions: null,
    deletedSlugs: [],
    resetRows: [],
    questionRanges: [],
  };

  // Seen rows can be provided with explicit timestamps, or derived from a slug list.
  const seenRowData =
    params.seenRows ??
    (params.seenSlugs ?? []).map((questionId) => ({ question_id: questionId, seen_at: "2026-01-01T00:00:00Z" }));

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
        select: vi.fn(() => makeAwaitableQuery({ data: seenRowData, error: null })),
        upsert: vi.fn((rows: unknown[], options: unknown) => {
          captures.seenRows = rows;
          captures.seenOptions = options;
          return { error: null };
        }),
        delete: vi.fn(() => {
          const chain = {
            eq: vi.fn(() => chain),
            in: vi.fn((_column: string, values: string[]) => {
              captures.deletedSlugs.push(...values);
              return Promise.resolve({ error: null });
            }),
          };
          return chain;
        }),
      };
    }

    if (table === "trivia_questions") {
      return {
        select: vi.fn(() => {
          const query = makeAwaitableQuery({ data: params.questions ?? [], error: null });
          query.range.mockImplementation((from: number, to: number) => {
            captures.questionRanges.push([from, to]);
            query.data = (params.questions ?? []).slice(from, to + 1);
            return query;
          });
          return query;
        }),
      };
    }

    if (table === "trivia_schedules") {
      return {
        select: vi.fn(() => makeAwaitableQuery({ data: [], error: null })),
      };
    }

    if (table === "venue_question_warnings") {
      return {
        insert: vi.fn(() => Promise.resolve({ error: null })),
      };
    }

    if (table === "venue_category_resets") {
      return {
        insert: vi.fn((rows: unknown) => {
          captures.resetRows.push(rows);
          return Promise.resolve({ error: null });
        }),
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

  it("prefers a category that can fill the round with unseen questions", () => {
    const music = makeCategory("Music", 3);
    const sports = makeCategory("Sports", 3);
    const seenSlugs = ["music-1"];

    const result = seedSlots({
      questions: [...music, ...sports],
      seenSlugs,
      numRounds: 1,
      questionsPerRound: 3,
    });

    expect(result.slots).toHaveLength(3);
    expect(new Set(result.slots.map((slot) => slot.category))).toEqual(new Set(["Sports"]));
    expect(result.usedSeen).toBe(false);
  });

  it("reuses a category with enough unseen inventory before selecting a stale category", () => {
    const science = makeCategory("Science", 6);
    const history = makeCategory("History", 3);
    const seenSlugs = ["history-1"];

    const result = seedSlots({
      questions: [...science, ...history],
      seenSlugs,
      numRounds: 2,
      questionsPerRound: 3,
    });

    expect(result.slots).toHaveLength(6);
    expect(new Set(result.slots.map((slot) => slot.category))).toEqual(new Set(["Science"]));
    expect(new Set(result.slots.map((slot) => slot.slug)).size).toBe(6);
    expect(result.usedSeen).toBe(false);
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

  it("separates same-sounding movie adaptation questions when alternatives exist", () => {
    const questions: LiveTriviaSeedQuestion[] = [
      makeQuestion("Movies", 1, {
        slug: "movies-adaptation-1",
        question: "Which movie is based on the novel by Mario Puzo?",
      }),
      makeQuestion("Movies", 2, {
        slug: "movies-adaptation-2",
        question: "Which movie was adapted from the novel by Winston Groom?",
      }),
      makeQuestion("Movies", 3, {
        slug: "movies-award-1",
        question: "Which movie won the Academy Award for Best Picture in 1998?",
      }),
      makeQuestion("Movies", 4, {
        slug: "movies-director-1",
        question: "Which director made the movie Jaws?",
      }),
      makeQuestion("Movies", 5, {
        slug: "movies-character-1",
        question: "Which movie character says, I'll be back?",
      }),
    ];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 4 });
    const slugs = result.slots.map((slot) => slot.slug);

    expect(result.slots).toHaveLength(4);
    for (let index = 1; index < slugs.length; index += 1) {
      expect(slugs[index - 1]!.startsWith("movies-adaptation") && slugs[index]!.startsWith("movies-adaptation")).toBe(false);
    }
  });

  it("separates geography landmark questions when alternatives exist", () => {
    const questions: LiveTriviaSeedQuestion[] = [
      makeQuestion("Geography", 1, {
        slug: "geography-landmark-1",
        question: "Which landmark in Paris is known for its iron tower?",
      }),
      makeQuestion("Geography", 2, {
        slug: "geography-landmark-2",
        question: "Which landmark is a white marble monument in India?",
      }),
      makeQuestion("Geography", 3, {
        slug: "geography-river-1",
        question: "Which river flows through Cairo?",
      }),
      makeQuestion("Geography", 4, {
        slug: "geography-capital-1",
        question: "What is the capital city of Canada?",
      }),
      makeQuestion("Geography", 5, {
        slug: "geography-island-1",
        question: "Which island is the largest in the Mediterranean Sea?",
      }),
    ];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 4 });
    const slugs = result.slots.map((slot) => slot.slug);

    expect(result.slots).toHaveLength(4);
    for (let index = 1; index < slugs.length; index += 1) {
      expect(slugs[index - 1]!.startsWith("geography-landmark") && slugs[index]!.startsWith("geography-landmark")).toBe(false);
    }
  });

  it("keeps same slug families at least 5 positions apart when inventory allows", () => {
    const questions = withSourceOrder([
      makeQuestion("History", 1, {
        slug: "history-president-washington-01",
        question: "Who was the first U.S. president?",
      }),
      makeQuestion("History", 2, {
        slug: "history-president-washington-02",
        question: "Name the president who led the Continental Army.",
      }),
      makeQuestion("History", 3, {
        slug: "history-president-washington-03",
        question: "Which leader appears on the U.S. one-dollar bill?",
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        makeQuestion("History", index + 4, {
          slug: `history-distinct-topic-${String(index + 1).padStart(2, "0")}-era`,
          question: `Who was the historical figure connected to distinct topic ${index + 1}?`,
        })
      ),
    ]);

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 15 });
    const familyPositions = result.slots
      .map((slot, index) => ({ family: inferSlugFamily(slot.slug), index }))
      .filter((entry) => entry.family === "history-president-washington")
      .map((entry) => entry.index);

    expect(familyPositions).toHaveLength(3);
    for (let index = 1; index < familyPositions.length; index += 1) {
      expect(familyPositions[index]! - familyPositions[index - 1]!).toBeGreaterThanOrEqual(5);
    }
  });

  it("avoids adjacent template duplicates when alternatives exist", () => {
    const questions = withSourceOrder([
      ...Array.from({ length: 2 }, (_, index) =>
        makeQuestion("Pop Culture", index + 1, {
          slug: `pop-what-is-${index + 1}-artifact`,
          question: `What is the title of pop culture artifact ${index + 1}?`,
          options: [`Answer ${index + 1}`],
        })
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        makeQuestion("Pop Culture", index + 3, {
          slug: `pop-who-is-${index + 1}-performer`,
          question: `Who is the performer associated with pop culture artifact ${index + 1}?`,
          options: [`Answer ${index + 3}`],
        })
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        makeQuestion("Pop Culture", index + 5, {
          slug: `pop-name-this-${index + 1}-clue`,
          question: `Name this pop culture artifact from clue ${index + 1}.`,
          options: [`Answer ${index + 5}`],
        })
      ),
    ]);

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 6 });
    const templateKeys = result.slots.map((slot) => {
      const row = questions.find((question) => question.slug === slot.slug)!;
      return inferTemplateKey(String(row.question ?? ""));
    });

    expect(templateKeys).toHaveLength(6);
    for (let index = 1; index < templateKeys.length; index += 1) {
      expect(templateKeys[index]).not.toBe(templateKeys[index - 1]);
    }
  });

  it("spreads repeated topic clusters outside the rolling window when alternatives exist", () => {
    const oscarWildeSlugs = new Set(["literature-oscar-wilde-quote", "literature-wilde-dorian-gray", "literature-irish-playwright"]);
    const questions = withSourceOrder([
      makeQuestion("Literature", 1, {
        slug: "literature-oscar-wilde-quote",
        question: "Who wrote the Oscar Wilde quote about resisting everything except temptation?",
      }),
      makeQuestion("Literature", 2, {
        slug: "literature-wilde-dorian-gray",
        question: "Which author Oscar Wilde wrote The Picture of Dorian Gray?",
      }),
      makeQuestion("Literature", 3, {
        slug: "literature-irish-playwright",
        question: "Name this Irish playwright Oscar Wilde from a clue about epigrams.",
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        makeQuestion("Literature", index + 4, {
          slug: `literature-distinct-author-${String(index + 1).padStart(2, "0")}-work`,
          question: [
            "Who wrote the seafaring novel about a whale?",
            "Which poet composed verses about a raven?",
            "Name the novelist behind a magical realism family saga.",
            "What is the surname of the detective created by Arthur Conan Doyle?",
            "Who wrote the dystopian farm allegory?",
            "Which author created a hobbit named Bilbo?",
            "Name the poet associated with Leaves of Grass.",
            "Who wrote the courtroom novel set in Maycomb?",
            "Which playwright created Blanche DuBois?",
            "Name the novelist behind Pride and Prejudice.",
            "Who wrote the epic poem Paradise Lost?",
            "Which author created Hercule Poirot?",
          ][index]!,
        })
      ),
    ]);

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 15 });
    const positions = result.slots
      .map((slot, index) => ({ slug: slot.slug, index }))
      .filter((entry) => oscarWildeSlugs.has(entry.slug))
      .map((entry) => entry.index);

    expect(positions).toHaveLength(3);
    for (let index = 1; index < positions.length; index += 1) {
      expect(positions[index]! - positions[index - 1]!).toBeGreaterThanOrEqual(4);
    }
  });

  it("spreads same-subcategory questions apart when alternatives exist", () => {
    const questions: LiveTriviaSeedQuestion[] = [
      makeQuestion("Movies", 1, { slug: "movies-actor-1", question: "Which actor played Batman in The Dark Knight?", subcategory: "actors-performers" }),
      makeQuestion("Movies", 2, { slug: "movies-actor-2", question: "Which actor played Superman in Man of Steel?", subcategory: "actors-performers" }),
      makeQuestion("Movies", 3, { slug: "movies-actor-3", question: "Which actor played Iron Man in the MCU?", subcategory: "actors-performers" }),
      ...Array.from({ length: 12 }, (_, index) =>
        makeQuestion("Movies", index + 4, {
          slug: `movies-other-${String(index + 1).padStart(2, "0")}-topic`,
          question: `What is movies topic ${index + 1}?`,
          subcategory: `distinct-subcategory-${index + 1}`,
        })
      ),
    ];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 15 });
    const actorPositions = result.slots
      .map((slot, index) => ({ slug: slot.slug, index }))
      .filter((entry) => entry.slug.startsWith("movies-actor-"))
      .map((entry) => entry.index);

    expect(actorPositions).toHaveLength(3);
    for (let index = 1; index < actorPositions.length; index += 1) {
      expect(actorPositions[index]! - actorPositions[index - 1]!).toBeGreaterThanOrEqual(3);
    }
  });

  it("still fills a round when every available question has the same subtopic", () => {
    const questions: LiveTriviaSeedQuestion[] = [
      makeQuestion("Geography", 1, {
        question: "Which landmark in Paris is known for its iron tower?",
      }),
      makeQuestion("Geography", 2, {
        question: "Which landmark is a white marble monument in India?",
      }),
      makeQuestion("Geography", 3, {
        question: "Which landmark is a famous bridge in San Francisco?",
      }),
    ];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(new Set(result.slots.map((slot) => slot.slug)).size).toBe(3);
  });

  it("spreads round picks across derived source bands when inventory allows", () => {
    const questions = Array.from({ length: 15 }, (_, index) =>
      makeQuestion("Music", index + 1, { slug: `music-${String(index + 1).padStart(2, "0")}` })
    );

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 9 });
    const selectedNumbers = result.slots.map((slot) => Number(slot.slug.split("-").at(-1)));
    const bandCounts = selectedNumbers.reduce(
      (counts, number) => {
        if (number <= 5) counts.start += 1;
        else if (number <= 10) counts.middle += 1;
        else counts.end += 1;
        return counts;
      },
      { start: 0, middle: 0, end: 0 }
    );

    expect(result.slots).toHaveLength(9);
    expect(bandCounts).toEqual({ start: 3, middle: 3, end: 3 });
  });

  it("targets a 5 / 5 / 5 source-band distribution for 15-question rounds", () => {
    const questions = withSourceOrder(
      Array.from({ length: 15 }, (_, index) =>
        makeQuestion("Science", index + 1, {
          slug: `science-source-band-${String(index + 1).padStart(2, "0")}`,
          question: `Who discovered science topic ${index + 1}?`,
        })
      ),
      "science.v1.json"
    );

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 15 });
    const selectedIndexes = result.slots.map((slot) => Number(slot.slug.split("-").at(-1)));
    const bandCounts = selectedIndexes.reduce(
      (counts, number) => {
        if (number <= 5) counts.start += 1;
        else if (number <= 10) counts.middle += 1;
        else counts.end += 1;
        return counts;
      },
      { start: 0, middle: 0, end: 0 }
    );

    expect(result.slots).toHaveLength(15);
    expect(bandCounts).toEqual({ start: 5, middle: 5, end: 5 });
  });

  it("uses explicit source_order for source-band balancing before falling back to slug order", () => {
    const questions = Array.from({ length: 9 }, (_, index) =>
      makeQuestion("Music", index + 1, {
        slug: `music-${String(9 - index).padStart(2, "0")}`,
        source_file: "music.v1.json",
        source_order: index,
      })
    );
    const sourceOrderBySlug = new Map(questions.map((question) => [question.slug, question.source_order ?? -1]));

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 6 });
    const bandCounts = result.slots.reduce(
      (counts, slot) => {
        const sourceOrder = sourceOrderBySlug.get(slot.slug) ?? -1;
        if (sourceOrder <= 2) counts.start += 1;
        else if (sourceOrder <= 5) counts.middle += 1;
        else counts.end += 1;
        return counts;
      },
      { start: 0, middle: 0, end: 0 }
    );

    expect(result.slots).toHaveLength(6);
    expect(bandCounts).toEqual({ start: 2, middle: 2, end: 2 });
  });

  it("fills rounds from overrepresented source bands when a target band is thin", () => {
    const startBandQuestions = Array.from({ length: 13 }, (_, index) =>
      makeQuestion("Music", index + 1, {
        slug: `music-start-heavy-${String(index + 1).padStart(2, "0")}`,
        question: `Who recorded start-heavy music clue ${index + 1}?`,
        source_file: "music.v1.json",
        source_order: index,
      })
    );
    const middleBandQuestion = makeQuestion("Music", 14, {
      slug: "music-middle-thin",
      question: "Who recorded the only middle-band music clue?",
      source_file: "music.v1.json",
      source_order: 50,
    });
    const endBandQuestion = makeQuestion("Music", 15, {
      slug: "music-end-thin",
      question: "Who recorded the only end-band music clue?",
      source_file: "music.v1.json",
      source_order: 98,
    });

    const result = seedSlots({
      questions: [...startBandQuestions, middleBandQuestion, endBandQuestion],
      numRounds: 1,
      questionsPerRound: 9,
    });
    const selected = new Set(result.slots.map((slot) => slot.slug));

    expect(result.slots).toHaveLength(9);
    expect(result.repeatedQuestions).toBe(false);
    expect(selected.has("music-middle-thin")).toBe(true);
    expect(selected.has("music-end-thin")).toBe(true);
  });

  it("repeats questions only when category inventory cannot fill the requested slots", () => {
    const questions = makeCategory("Music", 2);

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.repeatedQuestions).toBe(true);
    expect(new Set(result.slots.map((slot) => slot.slug)).size).toBe(2);
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

  it("cooldown cap releases least-recently-used categories first, not alphabetically-first", () => {
    // 5 categories, 3 rounds: maxCooledCount = 5 - 3 = 2.
    // recentCategories ordered most-recently-used first: Sports > Music > Art.
    // The cap keeps the 2 most-recent cooled (Sports, Music) and releases the
    // stalest (Art) back to fresh priority alongside History and Movies.
    // Old (alphabetical) behavior would have released Sports instead of Art.
    const questions = [
      ...makeCategory("Art", 3),
      ...makeCategory("History", 3),
      ...makeCategory("Movies", 3),
      ...makeCategory("Music", 3),
      ...makeCategory("Sports", 3),
    ];

    const result = seedSlots({
      questions,
      recentCategories: ["Sports", "Music", "Art"], // most-recent first
      numRounds: 3,
      questionsPerRound: 3,
    });

    // effectiveFreshCategories = [History, Movies, Art] (3 items).
    // effectiveCooledCategories = [Sports, Music] (2 items, deprioritised).
    // 3 fresh categories exactly fill 3 rounds, so cooled are never reached.
    const selected = new Set(result.slots.map((slot) => slot.category));
    expect(result.slots).toHaveLength(9);
    expect(selected).toContain("Art");    // stalest cooled → released to fresh, selected
    expect(selected).not.toContain("Sports"); // most-recent → stays cooled, not needed
    expect(selected).not.toContain("Music");  // second-most-recent → stays cooled, not needed
  });

  // ── Phase 3: strict per-category exhaustion ───────────────────────────────

  it("never picks a seen question while any unseen question remains in the category", () => {
    // 2 unseen questions that belong to the same (clustered) slug family, so they
    // violate slug-family spacing against each other — under the old tiering a
    // spacing-clean SEEN question would have been preferred and these unseen ones
    // could be dropped from the round entirely.
    const unseen = [
      makeQuestion("Music", 1, { slug: "music-beatles-01", question: "Which band recorded Hey Jude?" }),
      makeQuestion("Music", 2, { slug: "music-beatles-02", question: "Which band recorded Let It Be?" }),
    ];
    // 18 spacing-clean, distinct-family questions, all already seen.
    const seen = Array.from({ length: 18 }, (_, index) =>
      makeQuestion("Music", index + 3, {
        slug: `music-distinct-${String(index + 1).padStart(2, "0")}-topic`,
        question: `Who composed distinct music topic ${index + 1}?`,
      })
    );
    const seenSlugs = seen.map((q) => String(q.slug));

    const result = seedSlots({
      questions: [...unseen, ...seen],
      seenSlugs,
      numRounds: 1,
      questionsPerRound: 15,
    });

    const slugs = result.slots.map((slot) => slot.slug);
    // Both unseen questions must appear despite clustering.
    expect(slugs).toContain("music-beatles-01");
    expect(slugs).toContain("music-beatles-02");
    // Every unseen pick must come before any seen pick.
    const firstSeenIndex = slugs.findIndex((slug) => seenSlugs.includes(slug));
    const lastUnseenIndex = Math.max(slugs.indexOf("music-beatles-01"), slugs.indexOf("music-beatles-02"));
    expect(lastUnseenIndex).toBeLessThan(firstSeenIndex);
  });

  // ── Category-pure shortage handling ───────────────────────────────────────

  it("does not fill a short round from other categories", () => {
    // Live Trivia rounds are category-pure. If every category is below
    // questionsPerRound, the selected category repeats instead of silently mixing
    // categories inside the round.
    const questions = [
      ...makeCategory("Music", 2),
      ...makeCategory("Sports", 2),
      ...makeCategory("History", 2),
    ];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.repeatedQuestions).toBe(true);
    expect(result.usedOverflow).toBe(false);
    expect(new Set(result.slots.map((slot) => slot.category)).size).toBe(1);
  });

  it("keeps a round category-pure even when other categories have unseen questions", () => {
    const questions = [
      makeQuestion("Music", 1),
      makeQuestion("Sports", 1),
      makeQuestion("History", 1),
    ];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.repeatedQuestions).toBe(true);
    expect(result.usedOverflow).toBe(false);
    expect(new Set(result.slots.map((slot) => slot.category)).size).toBe(1);
  });

  it("sets usedOverflow=false when the primary category can fill the round", () => {
    const questions = makeCategory("Music", 5);

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.usedOverflow).toBe(false);
    expect(result.repeatedQuestions).toBe(false);
  });

  it("still repeats when the primary category is short AND no other unseen questions exist", () => {
    const questions = makeCategory("Music", 2);
    // No other categories — overflow pool is empty. Must repeat from Music.
    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.repeatedQuestions).toBe(true);
    expect(result.usedOverflow).toBe(false);
    expect(new Set(result.slots.map((slot) => slot.slug)).size).toBe(2);
  });

  it("does not use overflow when every full-round category can fill its own round", () => {
    // Both Music (3) and Sports (5) meet the full-round threshold (>= questionsPerRound=3).
    // Whichever is selected by the seeded shuffle, it fills 3 slots from its own pool — no shortfall.
    const questions = [...makeCategory("Music", 3), ...makeCategory("Sports", 5)];

    const result = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(3);
    expect(result.usedOverflow).toBe(false);
    expect(result.repeatedQuestions).toBe(false);
  });

  it("category-pure shortage repeats are deterministic", () => {
    // All three categories below questionsPerRound: the selected category repeats
    // deterministically instead of drawing overflow questions from another category.
    const questions = [
      ...makeCategory("Music", 2),
      ...makeCategory("Sports", 2),
      ...makeCategory("History", 2),
    ];

    const first = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });
    const second = seedSlots({ questions, numRounds: 1, questionsPerRound: 3 });

    expect(second.slots).toEqual(first.slots);
    expect(second.usedOverflow).toBe(false);
    expect(second.repeatedQuestions).toBe(true);
    expect(new Set(second.slots.map((slot) => slot.category)).size).toBe(1);
  });

  it("keeps each short round category-pure across multiple rounds", () => {
    const questions = [
      ...makeCategory("Music", 2),
      ...makeCategory("Sports", 2),
      ...makeCategory("History", 2),
    ];

    const result = seedSlots({ questions, numRounds: 2, questionsPerRound: 3 });

    expect(result.slots).toHaveLength(6);
    for (const roundNumber of [1, 2]) {
      const roundCategories = new Set(
        result.slots.filter((slot) => slot.roundNumber === roundNumber).map((slot) => slot.category)
      );
      expect(roundCategories.size).toBe(1);
    }
    expect(result.usedOverflow).toBe(false);
    expect(result.repeatedQuestions).toBe(true);
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

  it("loads the active Live Trivia question pool across multiple pages", async () => {
    const captures = installSeedOccurrenceMocks({ questions: makeCategory("Music", 1005) });

    const result = await seedOccurrenceQuestions("schedule-1", "2026-06-12", "venue-1", 1);

    expect(result).toEqual({ seeded: 15, skipped: 0 });
    expect(captures.questionRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
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

  // ── Phase 3: per-category epoch reset ─────────────────────────────────────

  it("resets a fully-exhausted category, freeing oldest-seen questions and carrying forward recent ones", async () => {
    const questions = makeCategory("Music", 6); // music-1 … music-6
    // All 6 seen, oldest → newest (music-1 oldest, music-6 newest).
    const seenRows = questions.map((q, index) => ({
      question_id: String(q.slug),
      seen_at: `2026-01-0${index + 1}T00:00:00Z`,
    }));
    const captures = installSeedOccurrenceMocks({ questions, seenRows });

    await seedOccurrenceQuestions("schedule-1", "2026-06-12", "venue-1", 1);

    // carryForward = min(30, floor(6/2)=3) = 3 → free the 3 oldest, keep the 3 newest.
    expect(captures.deletedSlugs.slice().sort()).toEqual(["music-1", "music-2", "music-3"]);
    expect(captures.resetRows).toHaveLength(1);
    expect(captures.resetRows[0]).toMatchObject({
      venue_id: "venue-1",
      category: "Music",
      category_total: 6,
      freed_count: 3,
      carried_forward_count: 3,
    });
  });

  it("does not reset a category that still has unseen questions", async () => {
    const questions = makeCategory("Music", 6);
    // Only 4 of 6 seen — category is not exhausted.
    const seenRows = questions.slice(0, 4).map((q, index) => ({
      question_id: String(q.slug),
      seen_at: `2026-01-0${index + 1}T00:00:00Z`,
    }));
    const captures = installSeedOccurrenceMocks({ questions, seenRows });

    await seedOccurrenceQuestions("schedule-1", "2026-06-12", "venue-1", 1);

    expect(captures.deletedSlugs).toEqual([]);
    expect(captures.resetRows).toEqual([]);
  });

  it("does not reset categories when the occurrence is already seeded", async () => {
    const questions = makeCategory("Music", 6);
    const seenRows = questions.map((q, index) => ({
      question_id: String(q.slug),
      seen_at: `2026-01-0${index + 1}T00:00:00Z`,
    }));
    const captures = installSeedOccurrenceMocks({ existingCount: 15, questions, seenRows });

    const result = await seedOccurrenceQuestions("schedule-1", "2026-06-12", "venue-1", 1);

    expect(result).toEqual({ seeded: 0, skipped: 15 });
    expect(captures.deletedSlugs).toEqual([]);
    expect(captures.resetRows).toEqual([]);
  });
});
