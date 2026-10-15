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
    private countOnly = false;

    constructor(private table: string) {}

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      // select("id", { count: "exact", head: true }) → resolve to a count only.
      if (opts?.count) this.countOnly = true;
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
    then(
      resolve: (v: { data: Row[] | null; error: null; count?: number }) => unknown,
      reject?: (e: unknown) => unknown,
    ) {
      const result = this.countOnly
        ? { data: null, error: null, count: this.filtered().length }
        : { data: this.filtered(), error: null };
      return Promise.resolve(result).then(resolve, reject);
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

import letterIndexData from "@/data/category-blitz/category-letter-index.json";
import {
  driveContinuousCategoryBlitz,
  driveVenueCategoryBlitz,
  peekCategoryBlitz,
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

// A round in a continuous session, relative to SLEEP_NOW. Defaults to a round
// that finished and was scored long ago — the game is asleep.
function continuousRound(venueId: string, overrides: Partial<Row> = {}): Row {
  return {
    id: `round-${venueId}`,
    session_id: `session-${venueId}`,
    venue_id: venueId,
    letter: "T",
    category_set_index: 0,
    categories: [],
    started_at: "2026-07-15T00:00:00.000Z",
    ends_at: "2026-07-15T00:03:00.000Z",
    scored_at: "2026-07-15T00:03:05.000Z",
    status: "complete",
    mode: "standard",
    created_at: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

const SLEEP_NOW = new Date("2026-07-15T06:00:00.000Z");
const minutesBefore = (minutes: number): string => new Date(SLEEP_NOW.getTime() - minutes * 60_000).toISOString();

describe("runContinuousCategoryBlitzEngine — sleep when idle (how-to-play plan Phase 5)", () => {
  beforeEach(() => {
    store = {
      category_blitz_sessions: [],
      category_blitz_continuous_config: [],
      category_blitz_rounds: [],
    };
    mocks.broadcastCategoryBlitz.mockReset();
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;
  });

  it("never starts a round, even when an open session's intermission ended long ago", async () => {
    store.category_blitz_sessions = [openContinuousSession("venue-1"), openContinuousSession("venue-2")];
    store.category_blitz_continuous_config = [continuousConfigRow("venue-1"), continuousConfigRow("venue-2")];
    store.category_blitz_rounds = [continuousRound("venue-1"), continuousRound("venue-2")];

    const result = await runContinuousCategoryBlitzEngine();

    expect(result).toEqual({ scored: [], errors: [] });
    expect(store.category_blitz_rounds).toHaveLength(2);
    expect(mocks.broadcastCategoryBlitz).not.toHaveBeenCalled();
  });

  it("never creates a session for a venue that has continuous mode on but no session", async () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";
    store.category_blitz_continuous_config = [continuousConfigRow("venue-3")];

    await runContinuousCategoryBlitzEngine();

    expect(store.category_blitz_sessions).toEqual([]);
    expect(store.category_blitz_rounds).toEqual([]);
  });

  it("still grades a round every player left mid-round, and starts nothing after it", async () => {
    store.category_blitz_sessions = [openContinuousSession("venue-1")];
    store.category_blitz_continuous_config = [continuousConfigRow("venue-1")];
    store.category_blitz_rounds = [continuousRound("venue-1", { status: "active", scored_at: null })];

    const result = await runContinuousCategoryBlitzEngine();

    // The fake can't run scoreRound to completion; what matters is that the
    // expired round was picked up for grading (scored, or attempted).
    const attempted = [...result.scored, ...result.errors.map((e) => e.split(":")[0])];
    expect(attempted).toEqual(["round-venue-1"]);
    expect(store.category_blitz_rounds).toHaveLength(1);
  });
});

describe("peekCategoryBlitz — look without waking (how-to-play plan Phase 5)", () => {
  beforeEach(() => {
    store = {
      category_blitz_sessions: [],
      category_blitz_continuous_config: [continuousConfigRow("venue-1")],
      category_blitz_rounds: [],
    };
    mocks.broadcastCategoryBlitz.mockReset();
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;
  });

  it("continuous on with no session: asleep, and creates nothing", async () => {
    const peek = await peekCategoryBlitz("venue-1", SLEEP_NOW);

    expect(peek.continuousConfig).not.toBeNull();
    expect(peek.session).toBeNull();
    expect(peek.awake).toBe(false);
    expect(store.category_blitz_sessions).toEqual([]);
  });

  it("a round in play is awake", async () => {
    store.category_blitz_sessions = [openContinuousSession("venue-1")];
    store.category_blitz_rounds = [
      continuousRound("venue-1", { status: "active", scored_at: null, started_at: minutesBefore(1), ends_at: minutesBefore(-2) }),
    ];

    const peek = await peekCategoryBlitz("venue-1", SLEEP_NOW);

    expect(peek.awake).toBe(true);
    expect(peek.latestRound?.id).toBe("round-venue-1");
  });

  it("results/intermission still showing is awake (intermission 300s, scored 2 min ago)", async () => {
    store.category_blitz_sessions = [openContinuousSession("venue-1")];
    store.category_blitz_rounds = [
      continuousRound("venue-1", { started_at: minutesBefore(5), ends_at: minutesBefore(2), scored_at: minutesBefore(2) }),
    ];

    expect((await peekCategoryBlitz("venue-1", SLEEP_NOW)).awake).toBe(true);
  });

  it("next round overdue and nobody started it: asleep, and starts nothing", async () => {
    store.category_blitz_sessions = [openContinuousSession("venue-1")];
    store.category_blitz_rounds = [continuousRound("venue-1")];

    const peek = await peekCategoryBlitz("venue-1", SLEEP_NOW);

    expect(peek.session?.id).toBe("session-venue-1");
    expect(peek.awake).toBe(false);
    expect(store.category_blitz_rounds).toHaveLength(1);
    expect(mocks.broadcastCategoryBlitz).not.toHaveBeenCalled();
  });

  it("a scheduled venue (continuous off) with an open session reads as live, as before", async () => {
    store.category_blitz_continuous_config = [];
    store.category_blitz_sessions = [scheduledSession("venue-1")];

    const peek = await peekCategoryBlitz("venue-1", SLEEP_NOW);

    expect(peek.continuousConfig).toBeNull();
    expect(peek.session?.id).toBe("sched-session-venue-1");
    expect(peek.awake).toBe(true);
  });
});

describe("driveContinuousCategoryBlitz — a player wakes a sleeping game (how-to-play plan Phase 5)", () => {
  beforeEach(() => {
    store = {
      category_blitz_sessions: [openContinuousSession("venue-1")],
      category_blitz_continuous_config: [continuousConfigRow("venue-1")],
      category_blitz_rounds: [continuousRound("venue-1")],
    };
    mocks.broadcastCategoryBlitz.mockReset();
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;
  });

  it("starts a fresh round at once, with the full round length", async () => {
    const before = Date.now();
    const result = await driveContinuousCategoryBlitz("venue-1", SLEEP_NOW);

    expect(result?.action).toBe("started_round");
    const endsInMs = new Date(result!.round!.endsAt).getTime() - before;
    expect(endsInMs).toBeGreaterThanOrEqual(180_000);
    expect(endsInMs).toBeLessThan(185_000);
    expect(store.category_blitz_rounds).toHaveLength(2);
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

// Completed rounds already played in a session, oldest first, all long past
// their intermission relative to CADENCE_NOW.
function completedRounds(sessionId: string, venueId: string, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `prior-round-${i}`,
    session_id: sessionId,
    venue_id: venueId,
    letter: "T",
    category_set_index: 0,
    categories: [],
    started_at: `2026-07-15T00:${String(i).padStart(2, "0")}:00.000Z`,
    ends_at: "2026-07-15T00:03:00.000Z",
    scored_at: "2026-07-15T00:03:05.000Z",
    status: "complete",
    mode: "standard",
    created_at: `2026-07-15T00:${String(i).padStart(2, "0")}:00.000Z`,
  }));
}

const CADENCE_NOW = new Date("2026-07-15T06:00:00.000Z");
const B_LETTERS = letterIndexData.bLetters as Record<string, string[]>;
const STANDARD_LETTERS = letterIndexData.letters as Record<string, string[]>;

describe("startContinuousRound — every 5th round is Majority Rules (Phase 1)", () => {
  beforeEach(() => {
    store = {
      category_blitz_sessions: [openContinuousSession("venue-1")],
      category_blitz_continuous_config: [continuousConfigRow("venue-1")],
      category_blitz_rounds: [],
    };
    mocks.broadcastCategoryBlitz.mockReset();
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;
  });

  async function driveNextRound(priorRounds: number) {
    store.category_blitz_rounds = completedRounds("session-venue-1", "venue-1", priorRounds);
    const result = await driveContinuousCategoryBlitz("venue-1", CADENCE_NOW);
    expect(result?.action).toBe("started_round");
    return result!.round!;
  }

  it("the first four rounds of a session are standard", async () => {
    for (const prior of [0, 1, 2, 3]) {
      const round = await driveNextRound(prior);
      expect(round.mode).toBe("standard");
    }
  });

  it("rounds 5, 10 and 15 are Majority Rules; rounds 6 and 11 are standard", async () => {
    expect((await driveNextRound(4)).mode).toBe("reverse");
    expect((await driveNextRound(5)).mode).toBe("standard");
    expect((await driveNextRound(9)).mode).toBe("reverse");
    expect((await driveNextRound(10)).mode).toBe("standard");
    expect((await driveNextRound(14)).mode).toBe("reverse");
  });

  it("ignores the stored mode_selection — even weighted_reverse follows the cadence", async () => {
    store.category_blitz_continuous_config = [continuousConfigRow("venue-1", { mode_selection: "weighted_reverse" })];
    for (const prior of [0, 1, 2, 3]) {
      expect((await driveNextRound(prior)).mode).toBe("standard");
    }
  });

  it("a Majority Rules round draws its letter and every category from the Blend In! index", async () => {
    const round = await driveNextRound(4);
    expect(letterIndexData.bUsableLetters).toContain(round.letter);
    expect(round.categories).toHaveLength(letterIndexData.setSize);
    for (const category of round.categories) {
      expect(B_LETTERS[round.letter]).toContain(category);
    }
  });

  it("a standard round draws from the standard index", async () => {
    const round = await driveNextRound(0);
    expect(letterIndexData.usableLetters).toContain(round.letter);
    for (const category of round.categories) {
      expect(STANDARD_LETTERS[round.letter]).toContain(category);
    }
  });
});
