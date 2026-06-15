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

import { replaceSessionQuestion } from "@/lib/liveShowdownAdmin";

function makeAwaitableQuery<T extends Record<string, unknown>>(result: T) {
  const query = {
    ...result,
    eq: vi.fn(),
    neq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockReturnValue(query);
  return query;
}

type ReplacementQuestion = {
  slug: string;
  category: string;
  options: string[];
  correct_answer: number;
  question_pool: "live_showdown";
};

function makeQuestion(slug: string, category: string): ReplacementQuestion {
  return {
    slug,
    category,
    options: [`${slug} answer`],
    correct_answer: 0,
    question_pool: "live_showdown",
  };
}

function installReplacementMocks(params: {
  excludedCategory?: string | null;
  usedSlugs?: string[];
  venueSeenSlugs?: string[];
  pool: ReplacementQuestion[];
}) {
  const captures = {
    updatedQuestionId: "",
    upsertedSeenQuestionId: "",
  };

  mocks.from.mockImplementation((table: string) => {
    if (table === "trivia_session_questions") {
      return {
        select: vi.fn(() =>
          makeAwaitableQuery({
            data: (params.usedSlugs ?? []).map((question_id) => ({ question_id })),
            error: null,
          })
        ),
        update: vi.fn((patch: { question_id?: string }) => {
          captures.updatedQuestionId = String(patch.question_id ?? "");
          return makeAwaitableQuery({ error: null });
        }),
      };
    }

    if (table === "trivia_questions") {
      return {
        select: vi.fn((columns: string) => {
          if (columns === "category") {
            return makeAwaitableQuery({
              data: { category: params.excludedCategory ?? null },
              error: null,
            });
          }
          return makeAwaitableQuery({
            data: params.pool,
            error: null,
          });
        }),
      };
    }

    if (table === "venue_seen_questions") {
      return {
        select: vi.fn(() =>
          makeAwaitableQuery({
            data: (params.venueSeenSlugs ?? []).map((question_id) => ({ question_id })),
            error: null,
          })
        ),
        upsert: vi.fn((row: { question_id?: string }) => {
          captures.upsertedSeenQuestionId = String(row.question_id ?? "");
          return { error: null };
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return captures;
}

describe("Live Showdown admin replacement questions", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("prefers a venue-unseen replacement from the deleted question's category", async () => {
    const captures = installReplacementMocks({
      excludedCategory: "Music",
      usedSlugs: ["old-music"],
      venueSeenSlugs: ["music-seen"],
      pool: [
        makeQuestion("music-seen", "Music"),
        makeQuestion("music-fresh", "Music"),
        makeQuestion("sports-fresh", "Sports"),
      ],
    });

    await replaceSessionQuestion("schedule-1", "2026-06-16", 1, 3, "venue-1", "old-music");

    expect(captures.updatedQuestionId).toBe("music-fresh");
    expect(captures.upsertedSeenQuestionId).toBe("music-fresh");
  });

  it("falls back to a venue-seen question only after that category has no unseen replacements", async () => {
    const captures = installReplacementMocks({
      excludedCategory: "Music",
      usedSlugs: ["old-music"],
      venueSeenSlugs: ["music-seen"],
      pool: [
        makeQuestion("music-seen", "Music"),
        makeQuestion("sports-fresh", "Sports"),
      ],
    });

    await replaceSessionQuestion("schedule-1", "2026-06-16", 1, 3, "venue-1", "old-music");

    expect(captures.updatedQuestionId).toBe("music-seen");
    expect(captures.upsertedSeenQuestionId).toBe("music-seen");
  });
});
