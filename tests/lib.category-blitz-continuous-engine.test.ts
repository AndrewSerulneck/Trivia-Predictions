import { beforeEach, describe, expect, it, vi } from "vitest";

// Generic in-memory fake for the small slice of the Supabase query builder
// that driveContinuousCategoryBlitz's call chain actually uses (select/eq/in/
// lt/order/limit/maybeSingle, plus insert().select().single() and
// update().eq()). This lets the test exercise the real engine code — the
// point of Phase 2 is the *venue-selection* query in
// runContinuousCategoryBlitzEngine, so we want the rest of the pipeline
// (resolveContinuousConfig, getContinuousSession, startContinuousRound, …)
// running for real against fixture data, not re-mocked function-by-function.
type Row = Record<string, unknown>;

function createFakeSupabase(store: Record<string, Row[]>) {
  let counter = 0;

  class Builder {
    private filters: Array<(row: Row) => boolean> = [];
    private orderCol: string | null = null;
    private orderAscending = true;
    private limitN: number | null = null;

    constructor(private table: string) {}

    select(_cols?: string) {
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push((r) => r[col] === val);
      return this;
    }
    in(col: string, vals: unknown[]) {
      this.filters.push((r) => vals.includes(r[col]));
      return this;
    }
    lt(col: string, val: string) {
      this.filters.push((r) => new Date(String(r[col])).getTime() < new Date(val).getTime());
      return this;
    }
    lte(col: string, val: string) {
      // NULL columns (e.g. a continuous session's scheduled_end_at) never match
      // a <= comparison — matches Postgres semantics and keeps the scheduled
      // "close expired windows" query from ever touching continuous sessions.
      this.filters.push((r) => new Date(String(r[col])).getTime() <= new Date(val).getTime());
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.orderCol = col;
      this.orderAscending = opts?.ascending ?? true;
      return this;
    }
    limit(n: number) {
      this.limitN = n;
      return this;
    }

    private filtered(): Row[] {
      let rows = (store[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
      if (this.orderCol) {
        const col = this.orderCol;
        rows = [...rows].sort((a, b) => {
          const av = String(a[col]);
          const bv = String(b[col]);
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return this.orderAscending ? cmp : -cmp;
        });
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return rows;
    }

    async maybeSingle() {
      const rows = this.filtered();
      return { data: rows[0] ?? null, error: null };
    }

    // Plain `await builder` (no maybeSingle) resolves to the full row list —
    // this is the shape runContinuousCategoryBlitzEngine's venue-listing
    // query uses.
    then(resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve({ data: this.filtered(), error: null }).then(resolve, reject);
    }

    insert(payload: Row) {
      const table = this.table;
      return {
        select: (_cols?: string) => ({
          single: async () => {
            const row: Row = { id: `${table}-${++counter}`, created_at: new Date().toISOString(), ...payload };
            (store[table] ??= []).push(row);
            return { data: row, error: null };
          },
        }),
      };
    }

    update(payload: Row) {
      const table = this.table;
      return {
        eq: (col: string, val: unknown) => {
          for (const row of store[table] ?? []) {
            if (row[col] === val) Object.assign(row, payload);
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
  }

  return {
    from: (table: string) => new Builder(table),
  };
}

const mocks = vi.hoisted(() => ({
  broadcastCategoryBlitz: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: vi.fn() };
  },
}));
vi.mock("@/lib/categoryBlitzBroadcast", () => ({
  broadcastCategoryBlitz: mocks.broadcastCategoryBlitz,
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  applyChallengeCampaignPoints: vi.fn(),
}));
vi.mock("@/lib/llmCostTracker", () => ({
  trackAnthropicUsage: vi.fn(),
}));

let store: Record<string, Row[]>;

vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    return createFakeSupabase(store);
  },
}));

import {
  driveContinuousCategoryBlitz,
  driveVenueCategoryBlitz,
  runCategoryBlitzEngine,
  runContinuousCategoryBlitzEngine,
} from "@/lib/categoryBlitz";

function continuousConfigRow(venueId: string, overrides: Partial<Row> = {}): Row {
  return {
    venue_id: venueId,
    is_active: true,
    round_duration_seconds: 180,
    intermission_seconds: 300,
    mode_selection: "random",
    category_pool: [],
    min_categories_per_letter: 12,
    ...overrides,
  };
}

function openContinuousSession(venueId: string, overrides: Partial<Row> = {}): Row {
  return {
    id: `session-${venueId}`,
    venue_id: venueId,
    status: "active",
    source: "auto",
    session_type: "continuous",
    scheduled_end_at: null,
    starts_at: "2026-07-15T00:00:00.000Z",
    test_mode: false,
    created_at: "2026-07-15T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

describe("runContinuousCategoryBlitzEngine — venue selection (Phase 2)", () => {
  beforeEach(() => {
    store = {
      category_blitz_sessions: [],
      category_blitz_continuous_config: [],
      category_blitz_rounds: [],
    };
    mocks.broadcastCategoryBlitz.mockReset();
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;
  });

  it("drives venues with an open continuous session and dedupes duplicate rows", async () => {
    store.category_blitz_sessions = [
      openContinuousSession("venue-1"),
      openContinuousSession("venue-2"),
    ];
    store.category_blitz_continuous_config = [
      continuousConfigRow("venue-1"),
      continuousConfigRow("venue-2"),
    ];

    const result = await runContinuousCategoryBlitzEngine(new Date("2026-07-15T00:00:05.000Z"));

    expect(result.errors).toEqual([]);
    expect(new Set(result.driven)).toEqual(new Set(["venue-1", "venue-2"]));
  });

  it("ignores venues with a completed continuous session and venues with no session at all", async () => {
    store.category_blitz_sessions = [
      openContinuousSession("venue-1"),
      openContinuousSession("venue-2", { status: "complete" }),
    ];
    // venue-3 has an active override config row but has never been opened by
    // a player — no session exists yet, so it must NOT be swept.
    store.category_blitz_continuous_config = [
      continuousConfigRow("venue-1"),
      continuousConfigRow("venue-3"),
    ];

    const result = await runContinuousCategoryBlitzEngine(new Date("2026-07-15T00:00:05.000Z"));

    expect(result.driven).toEqual(["venue-1"]);
  });

  it("also drives a venue whose session exists only because of the global default (no override row)", async () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";
    store.category_blitz_sessions = [openContinuousSession("venue-default")];
    // No category_blitz_continuous_config row for venue-default at all.

    const result = await runContinuousCategoryBlitzEngine(new Date("2026-07-15T00:00:05.000Z"));

    expect(result.errors).toEqual([]);
    expect(result.driven).toEqual(["venue-default"]);
  });
});

function scheduledSession(venueId: string, overrides: Partial<Row> = {}): Row {
  return {
    id: `sched-session-${venueId}`,
    venue_id: venueId,
    status: "active",
    source: "auto",
    session_type: "scheduled",
    scheduled_end_at: "2026-07-15T02:00:00.000Z",
    starts_at: "2026-07-15T00:00:00.000Z",
    test_mode: false,
    created_at: "2026-07-15T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

// A minimally-valid active schedule row so the venue enters
// runCategoryBlitzEngine's Step 3 loop. Window openness is irrelevant to these
// tests — the Phase 4 stand-down check fires at the top of the loop, before any
// window math.
function activeScheduleRow(venueId: string, overrides: Partial<Row> = {}): Row {
  return {
    id: `schedule-${venueId}`,
    venue_id: venueId,
    title: "Nightly Blitz",
    start_time: "2026-07-15T00:00:00.000Z",
    timezone: "America/New_York",
    recurring_type: "daily",
    recurring_days: [],
    window_minutes: 120,
    is_active: true,
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("scheduled engine stands down for continuous venues (Phase 4)", () => {
  beforeEach(() => {
    store = {
      category_blitz_sessions: [],
      category_blitz_continuous_config: [],
      category_blitz_rounds: [],
      category_blitz_schedules: [],
    };
    mocks.broadcastCategoryBlitz.mockReset();
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;
  });

  it("driveVenueCategoryBlitz no-ops and retires a lingering scheduled session when the venue is now continuous", async () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";
    // Default venue (no override row) → continuous is active via global default.
    store.category_blitz_sessions = [scheduledSession("venue-1")];

    const result = await driveVenueCategoryBlitz("venue-1", new Date("2026-07-15T00:00:05.000Z"));

    // Scheduled engine stands down (returns no scheduled session)…
    expect(result).toBeNull();
    // …and the lingering scheduled session was abandoned so it stops holding
    // the venue's single open-session slot.
    const session = store.category_blitz_sessions.find((s) => s.id === "sched-session-venue-1");
    expect(session?.status).toBe("abandoned");
    expect(mocks.broadcastCategoryBlitz).toHaveBeenCalledWith(
      "venue-1",
      "session_abandoned",
      expect.objectContaining({ sessionId: "sched-session-venue-1" }),
    );
  });

  it("runCategoryBlitzEngine skips a continuous venue and retires its stale scheduled session instead of driving it", async () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";
    store.category_blitz_schedules = [activeScheduleRow("venue-1")];
    store.category_blitz_sessions = [scheduledSession("venue-1")];

    const result = await runCategoryBlitzEngine(new Date("2026-07-15T00:30:00.000Z"));

    expect(result.errors).toEqual([]);
    // Never opened or advanced a scheduled session for the continuous venue…
    expect(result.opened).not.toContain("venue-1");
    expect(result.started).not.toContain("venue-1");
    // …and its stale scheduled session got retired.
    const session = store.category_blitz_sessions.find((s) => s.id === "sched-session-venue-1");
    expect(session?.status).toBe("abandoned");
  });

  it("does NOT stand down when the flag is off — legacy scheduled behavior is preserved", async () => {
    // Flag off (deleted in beforeEach). Even a venue with an ACTIVE continuous
    // override still goes through the scheduled engine here, because Phase 4 is
    // gated on the rollout flag for byte-for-byte rollback safety.
    store.category_blitz_continuous_config = [continuousConfigRow("venue-1")];
    store.category_blitz_sessions = [scheduledSession("venue-1", { source: "manual" })];

    const result = await driveVenueCategoryBlitz("venue-1", new Date("2026-07-15T00:00:05.000Z"));

    // Manual session is left untouched (engine never abandons it) and returned.
    expect(result?.id).toBe("sched-session-venue-1");
    expect(store.category_blitz_sessions[0].status).toBe("active");
    expect(mocks.broadcastCategoryBlitz).not.toHaveBeenCalledWith(
      "venue-1",
      "session_abandoned",
      expect.anything(),
    );
  });

  it("driveContinuousCategoryBlitz retires a competing scheduled session before creating the continuous one", async () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";
    // Default venue: a scheduled session is still open from before the switch,
    // and no continuous session exists yet.
    store.category_blitz_sessions = [scheduledSession("venue-1")];

    const result = await driveContinuousCategoryBlitz("venue-1", new Date("2026-07-15T00:00:05.000Z"));

    // The lingering scheduled session was retired so it couldn't block the
    // venue's single open-session slot…
    const scheduled = store.category_blitz_sessions.find((s) => s.id === "sched-session-venue-1");
    expect(scheduled?.status).toBe("abandoned");
    // …and a continuous session was created and its first round started.
    expect(result?.action).toBe("started_round");
    expect(result?.session.sessionType).toBe("continuous");
  });

  it("does NOT stand down a venue that explicitly opted out (flag on, is_active=false)", async () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";
    store.category_blitz_continuous_config = [continuousConfigRow("venue-1", { is_active: false })];
    store.category_blitz_sessions = [scheduledSession("venue-1", { source: "manual" })];

    const result = await driveVenueCategoryBlitz("venue-1", new Date("2026-07-15T00:00:05.000Z"));

    // Opted-out venue keeps running scheduled — its (manual) session is untouched.
    expect(result?.id).toBe("sched-session-venue-1");
    expect(store.category_blitz_sessions[0].status).toBe("active");
    expect(mocks.broadcastCategoryBlitz).not.toHaveBeenCalledWith(
      "venue-1",
      "session_abandoned",
      expect.anything(),
    );
  });
});
