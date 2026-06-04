import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  replaceSessionQuestion: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("fs", () => ({
  readFileSync: mocks.readFileSync,
  readdirSync: mocks.readdirSync,
  writeFileSync: mocks.writeFileSync,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

vi.mock("@/lib/liveShowdownAdmin", () => ({
  replaceSessionQuestion: mocks.replaceSessionQuestion,
}));

vi.mock("@/lib/polymarket", () => ({
  getPredictionMarketById: vi.fn(),
  listResolvedPredictionOutcomes: vi.fn(),
}));

import {
  deleteAdminLiveTriviaQuestionInFile,
  listAdminLiveTriviaQuestionsFromFiles,
} from "@/lib/admin";

function makeTriviaListQuery(result: { data: unknown[]; count: number | null; error: { message: string } | null }) {
  const query = {
    eq: vi.fn(),
    ilike: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.ilike.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lte.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockResolvedValue(result);
  return query;
}

describe("admin trivia deletion behavior", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.replaceSessionQuestion.mockReset();
    mocks.readdirSync.mockReset();
    mocks.readFileSync.mockReset();
    mocks.writeFileSync.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00.000Z"));
  });

  it("returns an empty DB result without falling back to local JSON files", async () => {
    const query = makeTriviaListQuery({ data: [], count: 0, error: null });
    const select = vi.fn().mockReturnValue(query);

    mocks.from.mockImplementation((table: string) => {
      if (table === "trivia_questions") {
        return { select };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.readdirSync.mockImplementation(() => {
      throw new Error("should not read local files");
    });

    const result = await listAdminLiveTriviaQuestionsFromFiles({ page: 1, pageSize: 25 });

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(mocks.readdirSync).not.toHaveBeenCalled();
  });

  it("soft-deletes a live trivia question and replaces future scheduled usages", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "db-question-1", slug: "slug-1" },
      error: null,
    });
    const lookupEqField = vi.fn().mockReturnValue({ maybeSingle });
    const lookupEqPool = vi.fn().mockReturnValue({ eq: lookupEqField });
    const triviaSelect = vi.fn().mockReturnValue({ eq: lookupEqPool });

    const triviaUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const triviaUpdate = vi.fn().mockReturnValue({ eq: triviaUpdateEq });

    const sessionGte = vi.fn().mockResolvedValue({
      data: [
        {
          schedule_id: "schedule-1",
          occurrence_date: "2026-06-05",
          round_number: 2,
          question_index: 7,
        },
      ],
      error: null,
    });
    const sessionEq = vi.fn().mockReturnValue({ gte: sessionGte });
    const sessionSelect = vi.fn().mockReturnValue({ eq: sessionEq });

    const scheduleIn = vi.fn().mockResolvedValue({
      data: [{ id: "schedule-1", venue_id: "venue-1" }],
      error: null,
    });
    const scheduleSelect = vi.fn().mockReturnValue({ in: scheduleIn });

    mocks.from.mockImplementation((table: string) => {
      if (table === "trivia_questions") {
        return {
          select: triviaSelect,
          update: triviaUpdate,
        };
      }
      if (table === "trivia_session_questions") {
        return {
          select: sessionSelect,
        };
      }
      if (table === "trivia_schedules") {
        return {
          select: scheduleSelect,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    await deleteAdminLiveTriviaQuestionInFile("slug-1");

    expect(triviaUpdate).toHaveBeenCalledWith({ status: "deleted" });
    expect(triviaUpdateEq).toHaveBeenCalledWith("id", "db-question-1");
    expect(sessionEq).toHaveBeenCalledWith("question_id", "slug-1");
    expect(sessionGte).toHaveBeenCalledWith("occurrence_date", "2026-06-04");
    expect(mocks.replaceSessionQuestion).toHaveBeenCalledWith(
      "schedule-1",
      "2026-06-05",
      2,
      7,
      "venue-1",
      "slug-1"
    );
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
});
