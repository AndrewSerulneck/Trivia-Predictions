import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fake Supabase query builder ──────────────────────────────────────────────
// A minimal in-memory stand-in for supabase-js's chainable, thenable query
// builder — just enough of the surface scoreRound/buildResults/
// awardCategoryBlitzPoints/mergeCumulativeSessionTotals actually use
// (select/eq/in/update + count:exact,head:true + maybeSingle), with real
// mutation semantics so assertions can read back DB state after scoreRound
// runs. No upsert support — nothing on this call path uses it (submissions/
// participants are seeded as fixtures, not written via submitAnswer).
type Row = Record<string, unknown>;
type FakeState = Record<string, Row[]>;

function matchRow(row: Row, filters: [string, string, unknown][]): boolean {
  return filters.every(([type, col, val]) => {
    if (type === "eq") return row[col] === val;
    if (type === "in") return Array.isArray(val) && val.includes(row[col]);
    return true;
  });
}

function makeBuilder(state: FakeState, table: string) {
  const filters: [string, string, unknown][] = [];
  let countMode: { count?: string; head?: boolean } | null = null;
  let pendingUpdate: Row | null = null;

  function currentRows(): Row[] {
    return (state[table] ?? []).filter((r) => matchRow(r, filters));
  }

  async function exec(): Promise<{ rows: Row[]; count: number | null }> {
    if (countMode) {
      return { rows: [], count: currentRows().length };
    }
    if (pendingUpdate) {
      const rows = currentRows();
      for (const r of rows) Object.assign(r, pendingUpdate);
      return { rows, count: null };
    }
    return { rows: currentRows(), count: null };
  }

  const builder = {
    select(_cols: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.count) countMode = opts;
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push(["eq", col, val]);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      filters.push(["in", col, vals]);
      return builder;
    },
    update(patch: Row) {
      pendingUpdate = patch;
      return builder;
    },
    async maybeSingle() {
      const { rows } = await exec();
      return { data: rows[0] ?? null, error: null };
    },
    async single() {
      const { rows } = await exec();
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
    },
    then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
      exec()
        .then(({ rows, count }) => (countMode ? { data: null, error: null, count } : { data: rows, error: null }))
        .then(resolve, reject);
    },
  };

  return builder;
}

function makeFakeDb(state: FakeState) {
  return (table: string) => makeBuilder(state, table);
}

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  anthropicCreate: vi.fn(),
  broadcastCategoryBlitz: vi.fn(),
  applyChallengeCampaignPoints: vi.fn(),
  trackAnthropicUsage: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: mocks.anthropicCreate };
  },
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));
vi.mock("@/lib/categoryBlitzBroadcast", () => ({
  broadcastCategoryBlitz: mocks.broadcastCategoryBlitz,
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  applyChallengeCampaignPoints: mocks.applyChallengeCampaignPoints,
}));
vi.mock("@/lib/llmCostTracker", () => ({
  trackAnthropicUsage: mocks.trackAnthropicUsage,
}));

import { scoreRound } from "@/lib/categoryBlitz";

// Answers every validate/moderate LLM call with all-clear (valid=true /
// safe=true) by index, regardless of which prompt fired — this harness pins
// scoring/attribution logic, not judge/moderator content decisions.
function installAnthropicMock() {
  mocks.anthropicCreate.mockImplementation(async (params: { messages: { content: string }[] }) => {
    const prompt = params.messages[0]?.content ?? "";
    const itemLines = prompt.match(/^\d+\.\s/gm) ?? [];
    const isModeration = prompt.includes("content-safety moderator");
    const arr = itemLines.map((_: string, i: number) =>
      isModeration ? { index: i + 1, safe: true, reason: null } : { index: i + 1, valid: true, reason: null }
    );
    return {
      content: [{ type: "text", text: JSON.stringify(arr) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
  });
}

const ROOM_VENUE_ID = "hc-cbz-live"; // the pooled room — deliberately never a real venue in these fixtures
const CATEGORIES = Array.from({ length: 12 }, (_, i) => (i === 0 ? "Animals" : `Category ${i}`));

function makeRound(overrides: Partial<Row> = {}): Row {
  return {
    id: "round-1",
    session_id: "sess-1",
    venue_id: ROOM_VENUE_ID,
    letter: "T",
    category_set_index: 0,
    categories: CATEGORIES,
    started_at: "2026-07-01T00:00:00.000Z",
    ends_at: "2026-07-01T00:03:00.000Z", // well in the past relative to any test run
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    scored_at: null,
    mode: "standard",
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<Row>): Row {
  return {
    id: `sub-${Math.random().toString(36).slice(2)}`,
    round_id: "round-1",
    category_index: 0,
    auth_id: null,
    is_unique: null,
    is_valid: null,
    invalid_reason: null,
    points_awarded: 0,
    submitted_at: "2026-07-01T00:01:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.anthropicCreate.mockReset();
  mocks.broadcastCategoryBlitz.mockReset();
  mocks.applyChallengeCampaignPoints.mockReset();
  mocks.applyChallengeCampaignPoints.mockResolvedValue(null);
  installAnthropicMock();
});

describe("scoreRound — Category Blitz global-room venue attribution (Phase 3 regression)", () => {
  it("standard mode, 3 pooled players from 2 different venues: each player's challenge-campaign points attribute to THEIR OWN real venue, not the pooled room", async () => {
    // Pooling scenario: round.venue_id is the shared hidden room (ROOM_VENUE_ID),
    // but the 3 players are physically at two different real venues. Before the
    // Phase 3 fix, awardCategoryBlitzPoints was called with round.venue_id for
    // every player — under pooling that would attribute every player's
    // challenge-campaign progress to the hidden room instead of their own venue.
    const state: FakeState = {
      category_blitz_rounds: [makeRound()],
      category_blitz_sessions: [{ id: "sess-1", cumulative_totals: {} }],
      category_blitz_session_participants: [
        { session_id: "sess-1", user_id: "u1", venue_id: ROOM_VENUE_ID },
        { session_id: "sess-1", user_id: "u2", venue_id: ROOM_VENUE_ID },
        { session_id: "sess-1", user_id: "u3", venue_id: ROOM_VENUE_ID },
      ],
      category_blitz_submissions: [
        makeSubmission({ id: "sub-1", user_id: "u1", venue_id: "venue-alpha", answer: "Tiger", normalized_answer: "tiger" }),
        makeSubmission({ id: "sub-2", user_id: "u2", venue_id: "venue-alpha", answer: "Turtle", normalized_answer: "turtle" }),
        makeSubmission({ id: "sub-3", user_id: "u3", venue_id: "venue-beta", answer: "Toad", normalized_answer: "toad" }),
      ],
      users: [
        { id: "u1", points: 0 },
        { id: "u2", points: 0 },
        { id: "u3", points: 0 },
      ],
    };
    mocks.from.mockImplementation(makeFakeDb(state));

    const results = await scoreRound("round-1");

    // Scoring itself: all 3 answers are unique, letter-correct, LLM-valid.
    const subs = state.category_blitz_submissions;
    expect(subs.find((s) => s.id === "sub-1")?.points_awarded).toBe(2);
    expect(subs.find((s) => s.id === "sub-2")?.points_awarded).toBe(2);
    expect(subs.find((s) => s.id === "sub-3")?.points_awarded).toBe(2);
    expect(results.playerCount).toBe(3);

    // The regression pin: attribution by the SUBMITTER'S OWN venue.
    const callsByUser = new Map(
      mocks.applyChallengeCampaignPoints.mock.calls.map((args: unknown[]) => {
        const call = args[0] as Row;
        return [call.userId, call.venueId];
      })
    );
    expect(callsByUser.get("u1")).toBe("venue-alpha");
    expect(callsByUser.get("u2")).toBe("venue-alpha");
    expect(callsByUser.get("u3")).toBe("venue-beta");
    // Never the pooled room — this is exactly what Phase 3 fixed.
    for (const [, venueId] of callsByUser) {
      expect(venueId).not.toBe(ROOM_VENUE_ID);
    }
    expect(mocks.applyChallengeCampaignPoints).toHaveBeenCalledTimes(3);

    // users.points reflects the awarded points (campaign mock returns null,
    // so finalPoints falls back to the raw awarded points).
    expect(state.users.find((u) => u.id === "u1")?.points).toBe(2);
    expect(state.users.find((u) => u.id === "u2")?.points).toBe(2);
    expect(state.users.find((u) => u.id === "u3")?.points).toBe(2);
  });

  it("reverse mode, 2 pooled players from 2 different venues matching on the same answer: attribution still uses each player's own venue", async () => {
    const state: FakeState = {
      category_blitz_rounds: [makeRound({ id: "round-2", session_id: "sess-2", mode: "reverse" })],
      category_blitz_sessions: [{ id: "sess-2", cumulative_totals: {} }],
      category_blitz_session_participants: [
        { session_id: "sess-2", user_id: "u4", venue_id: ROOM_VENUE_ID },
        { session_id: "sess-2", user_id: "u5", venue_id: ROOM_VENUE_ID },
      ],
      category_blitz_submissions: [
        makeSubmission({ id: "sub-4", round_id: "round-2", user_id: "u4", venue_id: "venue-alpha", answer: "Toad", normalized_answer: "toad" }),
        makeSubmission({ id: "sub-5", round_id: "round-2", user_id: "u5", venue_id: "venue-beta", answer: "Toad", normalized_answer: "toad" }),
      ],
      users: [
        { id: "u4", points: 0 },
        { id: "u5", points: 0 },
      ],
    };
    mocks.from.mockImplementation(makeFakeDb(state));

    await scoreRound("round-2");

    // Both matched the crowd (2 players, same answer) → reverseRoundPoints(2) = 2 each.
    const subs = state.category_blitz_submissions;
    expect(subs.find((s) => s.id === "sub-4")?.points_awarded).toBe(2);
    expect(subs.find((s) => s.id === "sub-5")?.points_awarded).toBe(2);

    const callsByUser = new Map(
      mocks.applyChallengeCampaignPoints.mock.calls.map((args: unknown[]) => {
        const call = args[0] as Row;
        return [call.userId, call.venueId];
      })
    );
    expect(callsByUser.get("u4")).toBe("venue-alpha");
    expect(callsByUser.get("u5")).toBe("venue-beta");
    for (const [, venueId] of callsByUser) {
      expect(venueId).not.toBe(ROOM_VENUE_ID);
    }
  });

  it("standard mode, below the 3-player minimum (2 pooled participants): everyone scores 0 and challenge points are never awarded to anyone", async () => {
    const state: FakeState = {
      category_blitz_rounds: [makeRound({ id: "round-3", session_id: "sess-3" })],
      category_blitz_sessions: [{ id: "sess-3", cumulative_totals: {} }],
      category_blitz_session_participants: [
        { session_id: "sess-3", user_id: "u6", venue_id: ROOM_VENUE_ID },
        { session_id: "sess-3", user_id: "u7", venue_id: ROOM_VENUE_ID },
      ],
      category_blitz_submissions: [
        makeSubmission({ id: "sub-6", round_id: "round-3", user_id: "u6", venue_id: "venue-alpha", answer: "Tiger", normalized_answer: "tiger" }),
        makeSubmission({ id: "sub-7", round_id: "round-3", user_id: "u7", venue_id: "venue-beta", answer: "Turtle", normalized_answer: "turtle" }),
      ],
      users: [
        { id: "u6", points: 0 },
        { id: "u7", points: 0 },
      ],
    };
    mocks.from.mockImplementation(makeFakeDb(state));

    const results = await scoreRound("round-3");

    const subs = state.category_blitz_submissions;
    expect(subs.find((s) => s.id === "sub-6")?.points_awarded).toBe(0);
    expect(subs.find((s) => s.id === "sub-7")?.points_awarded).toBe(0);
    expect(results.playerCount).toBe(2);

    // pts > 0 gates the award call entirely — below the minimum, no one's
    // challenge-campaign progress (real venue or otherwise) is touched.
    expect(mocks.applyChallengeCampaignPoints).not.toHaveBeenCalled();
    expect(state.users.find((u) => u.id === "u6")?.points).toBe(0);
    expect(state.users.find((u) => u.id === "u7")?.points).toBe(0);
  });
});
