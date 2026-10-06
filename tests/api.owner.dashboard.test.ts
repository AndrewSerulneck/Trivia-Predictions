import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_AUTH_NO_SESSION, OWNER_AUTH_NO_VENUE } from "@/lib/ownerAuthCodes";
import type { OwnerSchedule } from "@/types";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 5 — the Partner
// Dashboard's first paint in ONE round trip. The dangerous part of collapsing
// three authenticated routes into one is the venue boundary, so most of this file
// is about `?venueId=`.

vi.mock("server-only", () => ({}));
// Truthy: the route's own configuration guard must not short-circuit.
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: {} }));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  listOwnerVenues: vi.fn(),
  listOwnerSchedules: vi.fn(),
  listOwnerCompetitions: vi.fn(),
  venuesNeedingPosAttention: vi.fn(),
}));
vi.mock("@/lib/pos/connections", () => ({ venuesNeedingPosAttention: mocks.venuesNeedingPosAttention }));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/ownerVenueList", () => ({ listOwnerVenues: mocks.listOwnerVenues }));
vi.mock("@/lib/ownerCompetitions", () => ({ listOwnerCompetitions: mocks.listOwnerCompetitions }));
// `ownsVenue` is the shared predicate the route must use — keep the real one.
vi.mock("@/lib/ownerSchedule", () => ({
  listOwnerSchedules: mocks.listOwnerSchedules,
  ownsVenue: (auth: { venueIds: string[] }, venueId: string) => auth.venueIds.includes(venueId),
}));

import { GET } from "@/app/api/owner/dashboard/route";

const OWNER = { ownerId: "owner-1", venueIds: ["venue-1", "venue-2"] };

const VENUES = [
  { id: "venue-1", name: "The Hightop" },
  { id: "venue-2", name: "Second Spot" },
];

const schedule = (id: string): OwnerSchedule =>
  ({
    id,
    venueId: "venue-1",
    title: "Live Trivia",
    startTime: "2026-10-02T23:00:00.000Z",
    endTime: "2026-10-03T01:00:00.000Z",
    timezone: "America/New_York",
    gameType: "live_trivia",
    rounds: 1,
    recurringType: "none",
    recurringDays: [],
    isActive: true,
  }) as unknown as OwnerSchedule;

const get = (search = "") => GET(new Request(`http://localhost/api/owner/dashboard${search}`));

type Body = {
  ok: boolean;
  error?: string;
  venues?: Array<{ id: string; name: string }>;
  venueId?: string | null;
  schedules?: { ok: boolean; items?: unknown[]; error?: string } | null;
  competitions?: { ok: boolean; items?: unknown[]; error?: string } | null;
  posAttentionVenueIds?: string[];
};

beforeEach(() => {
  mocks.requireOwnerAuth.mockReset();
  mocks.listOwnerVenues.mockReset();
  mocks.listOwnerSchedules.mockReset();
  mocks.listOwnerCompetitions.mockReset();

  mocks.requireOwnerAuth.mockResolvedValue(OWNER);
  mocks.listOwnerVenues.mockResolvedValue(VENUES);
  mocks.listOwnerSchedules.mockResolvedValue([schedule("sched-1")]);
  mocks.listOwnerCompetitions.mockResolvedValue([{ id: "camp-1" }]);
  mocks.venuesNeedingPosAttention.mockReset().mockResolvedValue([]);
});

describe("POS nudge (POS plan Phase 2c)", () => {
  it("rides the same call: one read for ALL the owner's venues, so a venue switch needs nothing", async () => {
    mocks.venuesNeedingPosAttention.mockResolvedValue(["venue-2"]);
    const body = (await (await get()).json()) as Body;
    expect(body.posAttentionVenueIds).toEqual(["venue-2"]);
    expect(mocks.venuesNeedingPosAttention).toHaveBeenCalledOnce();
    expect(mocks.venuesNeedingPosAttention).toHaveBeenCalledWith(["venue-1", "venue-2"]);
  });

  it("never fails the dashboard: a broken read is just 'no nudge'", async () => {
    mocks.venuesNeedingPosAttention.mockRejectedValue(new Error("boom"));
    const res = await get();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.posAttentionVenueIds).toEqual([]);
    expect(body.schedules).toMatchObject({ ok: true });
  });
});

describe("GET /api/owner/dashboard — one round trip", () => {
  it("returns the venue list and both sections for the first venue, with ONE auth check", async () => {
    const res = await get();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.venues).toEqual(VENUES);
    expect(body.venueId).toBe("venue-1");
    expect(body.schedules).toEqual({ ok: true, items: [schedule("sched-1")] });
    expect(body.competitions).toEqual({ ok: true, items: [{ id: "camp-1" }] });

    // The whole point of the route: the three per-list routes each ran
    // requireOwnerAuth (2 queries apiece). This runs it once.
    expect(mocks.requireOwnerAuth).toHaveBeenCalledOnce();
    expect(mocks.listOwnerVenues).toHaveBeenCalledOnce();
  });

  it("asks the listers for the merged calendar and the owner's own competitions", async () => {
    await get();
    // No gameType -> both engines, same as GET /api/owner/schedule with no filter.
    expect(mocks.listOwnerSchedules).toHaveBeenCalledWith("venue-1");
    expect(mocks.listOwnerCompetitions).toHaveBeenCalledWith("owner-1", "venue-1");
  });

  it("reads the venue list through the SAME lister as /api/owner/venues", async () => {
    await get();
    expect(mocks.listOwnerVenues).toHaveBeenCalledWith(OWNER.venueIds);
  });
});

describe("the ?venueId= boundary", () => {
  it("honours a venueId the caller owns", async () => {
    const body = (await (await get("?venueId=venue-2")).json()) as Body;
    expect(body.venueId).toBe("venue-2");
    expect(mocks.listOwnerSchedules).toHaveBeenCalledWith("venue-2");
    expect(mocks.listOwnerCompetitions).toHaveBeenCalledWith("owner-1", "venue-2");
  });

  it("NEVER reads a venue the caller does not own — it falls back to their first venue", async () => {
    const body = (await (await get("?venueId=venue-999")).json()) as Body;
    expect(body.venueId).toBe("venue-1");
    expect(mocks.listOwnerSchedules).toHaveBeenCalledWith("venue-1");
    expect(mocks.listOwnerSchedules).not.toHaveBeenCalledWith("venue-999");
    expect(mocks.listOwnerCompetitions).not.toHaveBeenCalledWith("owner-1", "venue-999");
    expect(body.venues).toEqual(VENUES);
  });

  it("treats a blank or whitespace venueId as 'no preference'", async () => {
    const body = (await (await get("?venueId=%20%20")).json()) as Body;
    expect(body.venueId).toBe("venue-1");
    expect(mocks.listOwnerSchedules).toHaveBeenCalledWith("venue-1");
  });
});

describe("one failing list still shows the other section", () => {
  it("returns the rewards when the schedules query throws", async () => {
    mocks.listOwnerSchedules.mockRejectedValue(new Error("schedule table is down"));
    const res = await get();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schedules).toEqual({ ok: false, error: "schedule table is down" });
    expect(body.competitions).toEqual({ ok: true, items: [{ id: "camp-1" }] });
  });

  it("returns the games when the competitions query throws", async () => {
    mocks.listOwnerCompetitions.mockRejectedValue(new Error("campaigns are down"));
    const body = (await (await get()).json()) as Body;
    expect(body.schedules).toEqual({ ok: true, items: [schedule("sched-1")] });
    expect(body.competitions).toEqual({ ok: false, error: "campaigns are down" });
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    mocks.listOwnerSchedules.mockRejectedValue("nope");
    const body = (await (await get()).json()) as Body;
    expect(body.schedules).toEqual({ ok: false, error: "Failed to load schedules." });
  });
});

describe("auth and degenerate accounts", () => {
  it("propagates the 401 Response with its code when there is no session", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized", code: OWNER_AUTH_NO_SESSION }), {
        status: 401,
      }),
    );
    const res = await get();
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe(OWNER_AUTH_NO_SESSION);
    expect(mocks.listOwnerVenues).not.toHaveBeenCalled();
  });

  it("propagates no_venue, which is what a purged pending signup looks like", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized", code: OWNER_AUTH_NO_VENUE }), {
        status: 401,
      }),
    );
    const res = await get();
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe(OWNER_AUTH_NO_VENUE);
  });

  it("answers an account with no venue without querying either list", async () => {
    mocks.listOwnerVenues.mockResolvedValue([]);
    const res = await get();
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.venues).toEqual([]);
    expect(body.venueId).toBeNull();
    // Null, not `{ ok: true, items: [] }` — nothing was asked for.
    expect(body.schedules).toBeNull();
    expect(body.competitions).toBeNull();
    expect(mocks.listOwnerSchedules).not.toHaveBeenCalled();
    expect(mocks.listOwnerCompetitions).not.toHaveBeenCalled();
  });

  it("500s when the venue list itself fails, rather than pretending there are none", async () => {
    mocks.listOwnerVenues.mockRejectedValue(new Error("venues table is down"));
    const res = await get();
    expect(res.status).toBe(500);
    expect(((await res.json()) as Body).ok).toBe(false);
    expect(mocks.listOwnerSchedules).not.toHaveBeenCalled();
  });
});
