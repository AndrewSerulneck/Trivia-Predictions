import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryBlitzSchedule } from "@/types";

type SessionRow = {
  id: string;
  venue_id: string;
  status: string;
  source: string;
  scheduled_end_at: string | null;
  starts_at: string | null;
  test_mode: boolean;
  created_at: string;
  completed_at: string | null;
};

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  listAllActiveSchedules: vi.fn(),
  insertedSessions: [] as Array<Record<string, unknown>>,
  activeSessionsByVenue: new Map<string, SessionRow | null>(),
  closableRows: [] as SessionRow[],
  sessionIdCounter: 1,
  latestRound: null as Record<string, unknown> | null,
  latestRoundReads: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: vi.fn() };
  },
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));
vi.mock("@/lib/categoryBlitzBroadcast", () => ({
  broadcastCategoryBlitz: vi.fn(),
}));
vi.mock("@/lib/challengeCampaigns", () => ({
  applyChallengeCampaignPoints: vi.fn(),
}));
vi.mock("@/lib/llmCostTracker", () => ({
  trackAnthropicUsage: vi.fn(),
}));
vi.mock("@/lib/categoryBlitzSchedules", async () => {
  const actual = await vi.importActual<typeof import("@/lib/categoryBlitzSchedules")>(
    "@/lib/categoryBlitzSchedules"
  );
  return {
    ...actual,
    listAllActiveSchedules: mocks.listAllActiveSchedules,
  };
});

import { runCategoryBlitzEngine } from "@/lib/categoryBlitz";

function makeSchedule(overrides: Partial<CategoryBlitzSchedule> = {}): CategoryBlitzSchedule {
  return {
    id: "schedule-1",
    venueId: "venue-1",
    title: "Recurring Category Blitz",
    startTime: "2026-07-01T23:00:00.000Z",
    endTime: "2026-07-02T00:00:00.000Z",
    timezone: "America/New_York",
    recurringType: "weekly",
    recurringDays: ["wed"],
    windowMinutes: 60,
    isActive: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "session-1",
    venue_id: "venue-1",
    status: "lobby",
    source: "auto",
    scheduled_end_at: "2026-07-02T00:00:00.000Z",
    starts_at: "2026-07-01T23:01:00.000Z",
    test_mode: false,
    created_at: "2026-07-01T23:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function installSupabaseMock() {
  mocks.from.mockImplementation((table: string) => {
    if (table === "category_blitz_rounds") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            // scoreExpiredRounds
            lt: vi.fn(async () => ({ data: [], error: null })),
            // getLatestRound — reached only once the window-fit check passes
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  mocks.latestRoundReads += 1;
                  return { data: mocks.latestRound, error: null };
                }),
              })),
            })),
          })),
        })),
      };
    }

    if (table === "category_blitz_sessions") {
      return {
        select: vi.fn(() => {
          const filters: Record<string, unknown> = {};
          // getActiveSession now chains two .eq()s (venue_id, session_type)
          // before .in("status", ...), and getRecentlyCompletedSession chains
          // .eq().eq().eq().gte().order().limit(). Model .eq (and the pass-
          // through filters) as fully chainable so the real query shape works.
          const builder: Record<string, unknown> = {
            eq: vi.fn((column: string, value: unknown) => {
              filters[column] = value;
              return builder;
            }),
            in: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                const venueId = String(filters.venue_id ?? "");
                const session = mocks.activeSessionsByVenue.get(venueId) ?? null;
                return { data: session, error: null };
              }),
              lte: vi.fn(async () => ({ data: mocks.closableRows, error: null })),
            })),
            gte: vi.fn(() => builder),
            order: vi.fn(() => builder),
            limit: vi.fn(() => builder),
            // getRecentlyCompletedSession terminal — no recently completed
            // session in these fixtures, so the engine opens a fresh one.
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          };
          return builder;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          mocks.insertedSessions.push(payload);
          const venueId = String(payload.venue_id);
          const session = makeSession({
            id: `inserted-${mocks.sessionIdCounter++}`,
            venue_id: venueId,
            status: "lobby",
            source: String(payload.source ?? "manual"),
            scheduled_end_at: typeof payload.scheduled_end_at === "string" ? payload.scheduled_end_at : null,
            starts_at: typeof payload.starts_at === "string" ? payload.starts_at : null,
            test_mode: Boolean(payload.test_mode),
            created_at: new Date().toISOString(),
          });
          mocks.activeSessionsByVenue.set(venueId, session);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: session, error: null })),
            })),
          };
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });
}

describe("Category Blitz recurring schedule engine", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.listAllActiveSchedules.mockReset();
    mocks.insertedSessions = [];
    mocks.activeSessionsByVenue = new Map();
    mocks.closableRows = [];
    mocks.sessionIdCounter = 1;
    mocks.latestRound = null;
    mocks.latestRoundReads = 0;
    installSupabaseMock();
  });

  it("opens an auto session for an active weekly recurring occurrence", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:05:00.000Z"));

    expect(result.opened).toEqual(["venue-1"]);
    expect(result.errors).toEqual([]);
    expect(mocks.insertedSessions).toHaveLength(1);
    expect(mocks.insertedSessions[0]).toMatchObject({
      venue_id: "venue-1",
      status: "lobby",
      source: "auto",
      scheduled_end_at: "2026-07-02T00:00:00.000Z",
      starts_at: "2026-07-01T23:01:00.000Z",
      test_mode: false,
    });
  });

  it("does not create a duplicate session while an auto session is already active", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession());

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:00:30.000Z"));

    expect(result.opened).toEqual([]);
    expect(result.started).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(mocks.insertedSessions).toHaveLength(0);
  });

  it("opens a fresh auto session for the next weekly occurrence after the prior one ended", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);

    const first = await runCategoryBlitzEngine(new Date("2026-07-01T23:05:00.000Z"));
    expect(first.opened).toEqual(["venue-1"]);

    mocks.activeSessionsByVenue.set("venue-1", null);
    mocks.insertedSessions = [];

    const second = await runCategoryBlitzEngine(new Date("2026-07-08T23:05:00.000Z"));

    expect(second.opened).toEqual(["venue-1"]);
    expect(second.errors).toEqual([]);
    expect(mocks.insertedSessions).toHaveLength(1);
    expect(mocks.insertedSessions[0]).toMatchObject({
      venue_id: "venue-1",
      scheduled_end_at: "2026-07-09T00:00:00.000Z",
      starts_at: "2026-07-08T23:01:00.000Z",
    });
  });

  it("does not open sessions for schedules outside the current recurring window", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([
      makeSchedule({
        id: "schedule-thu",
        recurringDays: ["thu"],
      }),
    ]);

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:05:00.000Z"));

    expect(result.opened).toEqual([]);
    expect(result.started).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(mocks.insertedSessions).toHaveLength(0);
  });

  it("does not open sessions when no active schedules are returned", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([]);

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:05:00.000Z"));

    expect(result.opened).toEqual([]);
    expect(result.started).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(mocks.insertedSessions).toHaveLength(0);
  });

  // docs/category-blitz-letter-die-plan.md Phase 12.1b: the cron's "does another
  // round fit?" is the shared roundFitsWindow at the session's own round length,
  // like driveVenueCategoryBlitz. Two minutes before the window ends (00:00Z), a
  // 30 s test-mode round fits and a 180 s round doesn't. A round still in play
  // means the engine stops right after reading it, so the latest-round read is
  // the sign the fit check passed.
  it("12.1b a test-mode session is judged at the test-mode round length", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession({ status: "active", test_mode: true }));
    mocks.latestRound = { status: "active", started_at: "2026-07-01T23:57:50.000Z", scored_at: null };

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:58:00.000Z"));

    expect(result.errors).toEqual([]);
    expect(mocks.latestRoundReads).toBe(1);
  });

  it("12.1b a real session two minutes before the end: no room for a 180 s round", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession({ status: "active", test_mode: false }));
    mocks.latestRound = { status: "active", started_at: "2026-07-01T23:57:50.000Z", scored_at: null };

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:58:00.000Z"));

    expect(result.errors).toEqual([]);
    expect(result.started).toEqual([]);
    expect(mocks.latestRoundReads).toBe(0);
  });

  // Phase 13.3b: the cron times the next start at the session's own
  // intermission, like driveVenueCategoryBlitz. Scored 60 s ago: due after a
  // 10 s test-mode intermission, not after the real 180 s one. A start attempt
  // (it reaches tables this fixture doesn't mock) shows as started or errors.
  it("13.3b a test-mode cron session is due after the test intermission", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession({ status: "active", test_mode: true }));
    mocks.latestRound = { status: "complete", started_at: "2026-07-01T23:28:00.000Z", scored_at: "2026-07-01T23:29:00.000Z" };

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:30:00.000Z"));

    expect(result.started.length + result.errors.length).toBe(1);
  });

  it("13.3b a real cron session scored 60 s ago is not yet due", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession({ status: "active", test_mode: false }));
    mocks.latestRound = { status: "complete", started_at: "2026-07-01T23:28:00.000Z", scored_at: "2026-07-01T23:29:00.000Z" };

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:30:00.000Z"));

    expect(result.started).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  // Phase 13.4: the cron fits a round against the EARLIER of the live window end
  // and the session's frozen scheduled_end_at. The window is extended to 00:30Z
  // (90 minutes) while the session froze 00:00Z. A round still in play means the
  // engine stops right after reading it, so the latest-round read is the sign
  // the fit check passed.
  it("13.4 an extended window: no round that would run past the frozen end", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule({ windowMinutes: 90 })]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession({ status: "active", scheduled_end_at: "2026-07-02T00:00:00.000Z" }));
    mocks.latestRound = { status: "active", started_at: "2026-07-01T23:58:50.000Z", scored_at: null };

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:59:00.000Z"));

    expect(result.errors).toEqual([]);
    expect(result.started).toEqual([]);
    expect(mocks.latestRoundReads).toBe(0);
  });

  it("13.4 a shortened window: the live end still wins", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule()]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession({ status: "active", scheduled_end_at: "2026-07-02T00:30:00.000Z" }));
    mocks.latestRound = { status: "active", started_at: "2026-07-01T23:58:50.000Z", scored_at: null };

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:59:00.000Z"));

    expect(result.errors).toEqual([]);
    expect(mocks.latestRoundReads).toBe(0);
  });

  it("13.4 no frozen end: the live end only", async () => {
    mocks.listAllActiveSchedules.mockResolvedValue([makeSchedule({ windowMinutes: 90 })]);
    mocks.activeSessionsByVenue.set("venue-1", makeSession({ status: "active", scheduled_end_at: null }));
    mocks.latestRound = { status: "active", started_at: "2026-07-01T23:58:50.000Z", scored_at: null };

    const result = await runCategoryBlitzEngine(new Date("2026-07-01T23:59:00.000Z"));

    expect(result.errors).toEqual([]);
    expect(mocks.latestRoundReads).toBe(1);
  });
});
