import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4c.7 (D32) of docs/speed-trivia-backlog-and-quality-plan.md: POST /api/trivia/report.
// Fake server client; no database.
vi.mock("server-only", () => ({}));

type Report = Record<string, unknown> & { user_id: string; question_id: string; created_at: string };
type Result = { data: unknown; error: unknown; count?: number | null };

const SPEED_ID = "11111111-2222-4333-8444-555555555555";
const LIVE_ID = "66666666-2222-4333-8444-555555555555";
const LIVE_SLUG = "sports-who-won-1999";
const USER = "aaaaaaaa-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  session: { userId: null as string | null, forbidden: false },
  speedAnswer: null as null | { answer: number },
  liveAnswer: null as null | { submitted_answer: string },
  reports: [] as Report[],
  upsertOptions: [] as unknown[],
  insertError: null as null | { code: string; message: string },
  logged: [] as unknown[],
}));

const chain = (table: string) => {
  const filters: Record<string, unknown> = {};
  const resolve = (): Result => {
    if (table === "trivia_questions") {
      if (filters.id === SPEED_ID && filters.question_pool === "anytime_blitz") {
        return { data: { id: SPEED_ID, options: ["Venus", "Jupiter", "Mars", "Mercury"] }, error: null };
      }
      if (filters.slug === LIVE_SLUG && filters.question_pool === "live_showdown") return { data: { id: LIVE_ID }, error: null };
      return { data: null, error: null };
    }
    if (table === "trivia_answers") return { data: mocks.speedAnswer, error: null };
    if (table === "live_showdown_answers") {
      return { data: filters.question_id === LIVE_SLUG ? mocks.liveAnswer : null, error: null };
    }
    if (table === "question_reports") throw new Error("The route no longer reads question_reports; the trigger counts.");
    return { data: null, error: null };
  };
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters[column] = value; return query; },
    order: () => query,
    limit: () => query,
    maybeSingle: async () => resolve(),
    upsert: async (row: Report, options: unknown) => {
      mocks.upsertOptions.push(options);
      if (mocks.insertError) return { error: mocks.insertError };
      // Acts like the question_reports_daily_limit trigger: skip a duplicate, then refuse the 21st in 24 hours.
      if (mocks.reports.some((r) => r.user_id === row.user_id && r.question_id === row.question_id)) return { error: null };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      if (mocks.reports.filter((r) => r.user_id === row.user_id && r.created_at > since).length >= 20) {
        return { error: { code: "P0001", message: "question-report-limit" } };
      }
      mocks.reports.push({ ...row, created_at: new Date().toISOString() });
      return { error: null };
    },
    then: (onFulfilled: (value: Result) => void) => onFulfilled(resolve()),
  };
  return query;
};

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (table: string) => chain(table) } }));
vi.mock("@/lib/serverSession", () => ({ resolveRequestUserId: () => mocks.session }));

import { POST } from "@/app/api/trivia/report/route";

const post = async (body: Record<string, unknown>) => {
  const response = await POST(
    new Request("https://example.invalid/api/trivia/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: (await response.json()) as { ok: boolean; error?: string; message?: string } };
};

const speed = (extra: Record<string, unknown> = {}) => post({ game: "speed", questionId: SPEED_ID, reason: "typo", ...extra });

beforeEach(() => {
  mocks.session = { userId: USER, forbidden: false };
  mocks.speedAnswer = { answer: 2 };
  mocks.liveAnswer = { submitted_answer: "the yankees" };
  mocks.reports = [];
  mocks.upsertOptions = [];
  mocks.insertError = null;
  vi.restoreAllMocks();
});

describe("POST /api/trivia/report", () => {
  it("needs a session", async () => {
    mocks.session = { userId: null, forbidden: false };
    expect((await speed()).status).toBe(401);
    mocks.session = { userId: null, forbidden: true };
    expect((await speed()).status).toBe(401);
    expect(mocks.reports).toHaveLength(0);
  });

  it("rejects a reason that belongs to the other game", async () => {
    expect((await speed({ reason: "my_answer_right" })).status).toBe(400);
    expect((await post({ game: "live", slug: LIVE_SLUG, reason: "two_right" })).status).toBe(400);
    expect((await speed({ reason: "spam" })).status).toBe(400);
    expect((await post({ game: "tv", questionId: SPEED_ID, reason: "typo" })).status).toBe(400);
    expect(mocks.reports).toHaveLength(0);
  });

  it("needs an answer first", async () => {
    mocks.speedAnswer = null;
    const result = await speed();
    expect(result).toEqual({ status: 403, body: { ok: false, error: "Answer it first." } });
    mocks.liveAnswer = null;
    expect((await post({ game: "live", slug: LIVE_SLUG, reason: "typo" })).status).toBe(403);
    expect(mocks.reports).toHaveLength(0);
  });

  it("copies player_answer from the answer row (stored index), never from the body", async () => {
    const result = await speed({ playerAnswer: "Pluto", player_answer: "Pluto" });
    expect(result).toEqual({ status: 200, body: { ok: true, message: "Sent." } });
    expect(mocks.reports[0]).toMatchObject({ question_id: SPEED_ID, game: "speed", user_id: USER, reason: "typo", note: null, player_answer: "Mars" });
  });

  it("a timed-out Speed answer (-1) and a Live forfeit report with no player_answer", async () => {
    mocks.speedAnswer = { answer: -1 };
    await speed();
    expect(mocks.reports[0].player_answer).toBeNull();
    mocks.liveAnswer = { submitted_answer: "__FORFEIT__" };
    await post({ game: "live", slug: LIVE_SLUG, reason: "my_answer_right" });
    expect(mocks.reports[1].player_answer).toBeNull();
  });

  it("Live resolves the slug to the question id and keeps the typed answer", async () => {
    const result = await post({ game: "live", slug: LIVE_SLUG, reason: "my_answer_right" });
    expect(result.status).toBe(200);
    expect(mocks.reports[0]).toMatchObject({ question_id: LIVE_ID, game: "live", reason: "my_answer_right", player_answer: "the yankees" });
    expect((await post({ game: "live", slug: "no-such-slug", reason: "typo" })).status).toBe(404);
  });

  it("a duplicate replies Sent. with no second row", async () => {
    expect((await speed()).body.message).toBe("Sent.");
    expect((await speed({ reason: "confusing" })).body).toEqual({ ok: true, message: "Sent." });
    expect(mocks.reports).toHaveLength(1);
    expect(mocks.upsertOptions[1]).toEqual({ onConflict: "user_id,question_id", ignoreDuplicates: true });
  });

  it("caps a player at 20 reports in a rolling 24 hours", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mocks.reports = Array.from({ length: 20 }, (_, i) => ({ user_id: USER, question_id: `q${i}`, created_at: recent }));
    expect(await speed()).toEqual({ status: 429, body: { ok: false, error: "Try again later." } });
    mocks.reports = Array.from({ length: 20 }, (_, i) => ({ user_id: USER, question_id: `q${i}`, created_at: i === 0 ? old : recent }));
    expect((await speed()).status).toBe(200);
  });

  it("a duplicate at the limit is skipped, not refused", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    mocks.reports = Array.from({ length: 20 }, (_, i) => ({ user_id: USER, question_id: i === 0 ? SPEED_ID : `q${i}`, created_at: recent }));
    expect(await speed()).toEqual({ status: 200, body: { ok: true, message: "Sent." } });
  });

  it("any other insert error is a 500", async () => {
    mocks.insertError = { code: "23503", message: "insert or update violates foreign key" };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await speed()).toEqual({ status: 500, body: { ok: false, error: "Couldn't send. Try again." } });
    expect(error).toHaveBeenCalledWith("[question-reports] insert failed", "23503");
  });

  it("Other needs a note, strips control characters and cuts it to 200", async () => {
    expect((await speed({ reason: "other", note: " \n\t " })).status).toBe(400);
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const raw = `bad\u0000 line\nbreak‮flip ${"x".repeat(250)}`;
    expect((await speed({ reason: "other", note: raw })).status).toBe(200);
    const note = String(mocks.reports[0].note);
    expect(Array.from(note)).toHaveLength(200);
    expect(note.startsWith("bad line break flip x")).toBe(true);
    expect(note).not.toMatch(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/);
    // The note is never logged.
    expect([...log.mock.calls, ...error.mock.calls].flat().join(" ")).not.toContain("flip");
  });

  it("drops a note sent with a reason other than Other", async () => {
    await speed({ reason: "typo", note: "ignored" });
    expect(mocks.reports[0].note).toBeNull();
  });
});
