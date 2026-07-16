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
            lt: vi.fn(async () => ({ data: [], error: null })),
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
});
