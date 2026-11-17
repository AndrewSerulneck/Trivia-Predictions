import { beforeEach, describe, expect, it, vi } from "vitest";

// D31 (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c.6): the player GET serves shuffled options without the
// answer; the POST maps the shown pick back, grades and stores in stored order, and replies with the shown index.
// Fake server client; no database.
vi.mock("server-only", () => ({}));

type Row = { id: string; question: string; options: string[]; correct_answer: number; category: string | null; difficulty: string };
type Result = { data: unknown; error: unknown; count?: number };

const mocks = vi.hoisted(() => ({
  rows: [] as { id: string; question: string; options: string[]; correct_answer: number; category: string | null; difficulty: string }[],
  existing: null as null | { id: string; question_id: string; is_correct: boolean },
  inserts: [] as Record<string, unknown>[],
  insertError: null as null | { code: string },
  userUpdates: [] as Record<string, unknown>[],
}));

// A chain that records `.eq` filters and resolves per table when awaited or `.maybeSingle()`d.
const chain = (table: string) => {
  const filters: Record<string, unknown> = {};
  let columns = "";
  let head = false;
  const resolve = (single: boolean): Result => {
    if (table === "trivia_questions") {
      const rows = mocks.rows.filter((row) => (filters.id === undefined ? true : row.id === filters.id));
      return single ? { data: rows[0] ?? null, error: null } : { data: head ? null : rows, count: rows.length, error: null };
    }
    if (table === "trivia_answers") {
      if (columns.startsWith("id, question_id")) return { data: mocks.existing, error: null };
      return { data: [], error: null };
    }
    if (table === "users") return { data: { points: 10, venue_id: null }, error: null };
    return { data: null, error: null };
  };
  const query = {
    select: (value: string, options?: { head?: boolean }) => { columns = value; head = Boolean(options?.head); return query; },
    eq: (column: string, value: unknown) => { filters[column] = value; return query; },
    gte: () => query,
    order: () => query,
    limit: () => query,
    range: () => query,
    or: () => query,
    maybeSingle: async () => resolve(true),
    insert: async (row: Record<string, unknown>) => { mocks.inserts.push(row); return { error: mocks.insertError }; },
    update: (patch: Record<string, unknown>) => { mocks.userUpdates.push(patch); return query; },
    then: (onFulfilled: (value: Result) => void) => onFulfilled(resolve(false)),
  };
  return query;
};

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (table: string) => chain(table) } }));
vi.mock("@/lib/speedTriviaCategoryVisibility", () => ({ getHiddenSpeedCategories: async () => new Set<string>() }));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: async () => ({ finalPoints: 2, multiplierApplied: 1 }) }));
vi.mock("@/lib/serverSession", () => ({ isSessionEnforced: () => false, readSession: () => null }));
vi.mock("@/lib/venuePresence", () => ({
  maybeRequireActiveVenuePresenceForUser: async () => null,
  venuePresenceErrorResponse: () => null,
}));

import { GET, POST } from "@/app/api/trivia/route";
import { questionOptionOrder } from "@/lib/triviaOptionOrder";

const ROW: Row = {
  id: "11111111-2222-4333-8444-555555555555",
  question: "Which planet is known as the Red Planet?",
  options: ["Venus", "Jupiter", "Mars", "Mercury"],
  correct_answer: 2,
  category: "Science",
  difficulty: "easy",
};
const PERM = questionOptionOrder(ROW.id, ROW.options);
const SHOWN_CORRECT = PERM.indexOf(ROW.correct_answer);
const SHOWN_WRONG = PERM.findIndex((stored) => stored !== ROW.correct_answer);

const post = async (body: Record<string, unknown>) => {
  const response = await POST(
    new Request("https://example.invalid/api/trivia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user-1", questionId: ROW.id, timeElapsed: 3, ...body }),
    })
  );
  return (await response.json()) as { ok: boolean; result: { isCorrect: boolean; correctAnswer: number; saved: boolean; alreadyAnswered?: boolean } };
};

beforeEach(() => {
  mocks.rows = [ROW];
  mocks.existing = null;
  mocks.inserts = [];
  mocks.insertError = null;
  mocks.userUpdates = [];
});

describe("this fixture", () => {
  it("is actually shuffled, so the tests below can tell shown from stored", () => {
    expect(PERM).not.toEqual([0, 1, 2, 3]);
    expect(SHOWN_CORRECT).not.toBe(ROW.correct_answer);
  });
});

describe("GET /api/trivia", () => {
  it("serves the options in the fixed shuffled order, marked order 1, with no correct answer anywhere", async () => {
    const response = await GET(new Request("https://example.invalid/api/trivia"));
    const text = await response.text();
    expect(text).not.toMatch(/correctAnswer|correct_answer/);
    const body = JSON.parse(text) as { ok: boolean; questions: Record<string, unknown>[] };
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]).toMatchObject({ id: ROW.id, question: ROW.question, category: "Science", order: 1 });
    expect(body.questions[0].options).toEqual(PERM.map((stored) => ROW.options[stored]));
  });
});

describe("POST /api/trivia with order 1", () => {
  it("grades the shown right answer correct, stores the stored index and replies with the shown index", async () => {
    const body = await post({ answer: SHOWN_CORRECT, order: 1 });
    expect(body.result).toMatchObject({ isCorrect: true, correctAnswer: SHOWN_CORRECT, saved: true });
    expect(mocks.inserts).toEqual([expect.objectContaining({ question_id: ROW.id, answer: ROW.correct_answer, is_correct: true })]);
    expect(mocks.userUpdates).toEqual([{ points: 12 }]);
  });

  it("grades a shown wrong pick wrong and stores its stored index", async () => {
    const body = await post({ answer: SHOWN_WRONG, order: 1 });
    expect(body.result).toMatchObject({ isCorrect: false, correctAnswer: SHOWN_CORRECT });
    expect(mocks.inserts[0]).toMatchObject({ answer: PERM[SHOWN_WRONG], is_correct: false });
    expect(mocks.userUpdates).toEqual([]);
  });

  it("stores a time-out as -1", async () => {
    const body = await post({ answer: -1, order: 1 });
    expect(body.result).toMatchObject({ isCorrect: false, correctAnswer: SHOWN_CORRECT });
    expect(mocks.inserts[0]).toMatchObject({ answer: -1, is_correct: false });
  });

  it("replies with the shown index when already answered", async () => {
    mocks.existing = { id: "a1", question_id: ROW.id, is_correct: true };
    const body = await post({ answer: SHOWN_WRONG, order: 1 });
    expect(body.result).toMatchObject({ alreadyAnswered: true, isCorrect: true, correctAnswer: SHOWN_CORRECT, saved: false });
    expect(mocks.inserts).toEqual([]);
  });

  it("replies with the shown index when a duplicate insert races", async () => {
    mocks.insertError = { code: "23505" };
    const body = await post({ answer: SHOWN_CORRECT, order: 1 });
    expect(body.result).toMatchObject({ alreadyAnswered: true, correctAnswer: SHOWN_CORRECT });
  });
});

// Post-4c.4 review #1 (Phase 4c.8): an open tab or app on the pre-D31 script shows the new GET's shuffled options but
// posts the shown index without `order`. Grading that as a stored index could score a right tap wrong, permanently.
describe("POST /api/trivia without order (an open tab on the old script)", () => {
  const postRaw = (body: Record<string, unknown>) =>
    POST(
      new Request("https://example.invalid/api/trivia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user-1", questionId: ROW.id, timeElapsed: 3, ...body }),
      })
    );

  it.each([0, 1, 2, 3])("refuses an unmarked pick %i with 409 refresh, storing nothing", async (answer) => {
    const response = await postRaw({ answer });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "Refresh to keep playing.", code: "refresh" });
    expect(mocks.inserts).toEqual([]);
    expect(mocks.userUpdates).toEqual([]);
  });

  it("refuses any order other than 1", async () => {
    const response = await postRaw({ answer: SHOWN_CORRECT, order: 2 });
    expect(response.status).toBe(409);
    expect(mocks.inserts).toEqual([]);
  });

  it("still accepts an unmarked time-out (-1) and grades it wrong", async () => {
    const response = await postRaw({ answer: -1 });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; result: { isCorrect: boolean; correctAnswer: number } };
    expect(body.result).toMatchObject({ isCorrect: false, correctAnswer: ROW.correct_answer });
    expect(mocks.inserts).toEqual([expect.objectContaining({ answer: -1, is_correct: false })]);
    expect(mocks.userUpdates).toEqual([]);
  });
});
