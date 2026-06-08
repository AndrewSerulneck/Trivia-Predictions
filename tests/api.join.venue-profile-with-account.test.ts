import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { POST } from "@/app/api/join/profile/route";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const VENUE_ID = "venue-test-1";
const JOIN_LOCATION = { latitude: 40, longitude: -74, accuracy: 25 };
const VENUE_ROW = { id: VENUE_ID, latitude: 40, longitude: -74, radius: 100 };

function buildSingleChain<T>(result: { data: T; error: { message?: string; code?: string } | null }) {
  const chain = {
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

describe("POST /api/join/profile — account-first path", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("returns existing venue profile when one already exists for the account+venue", async () => {
    const existingProfile = {
      id: "user-profile-1",
      auth_id: null,
      username: "alice",
      venue_id: VENUE_ID,
      points: 42,
      created_at: "2026-05-28T10:00:00Z",
    };
    const accountChain = buildSingleChain({
      data: { id: ACCOUNT_ID, auth_id: null, username: "alice" },
      error: null,
    });
    const venueChain = buildSingleChain({ data: VENUE_ROW, error: null });
    const profileChain = buildSingleChain({ data: existingProfile, error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue(accountChain) };
      if (table === "venues") return { select: vi.fn().mockReturnValue(venueChain) };
      if (table === "users") return { select: vi.fn().mockReturnValue(profileChain) };
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID, venueId: VENUE_ID, location: JOIN_LOCATION }),
      })
    );
    const body = (await response.json()) as {
      ok: boolean;
      user?: { id: string; points: number; accountId: string };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.user?.id).toBe("user-profile-1");
    expect(body.user?.points).toBe(42);
    expect(body.user?.accountId).toBe(ACCOUNT_ID);
  });

  it("creates a new venue profile with points=0 when none exists for the account+venue", async () => {
    const newProfile = {
      id: "user-profile-new",
      auth_id: null,
      username: "bob",
      venue_id: VENUE_ID,
      points: 0,
      created_at: "2026-05-28T11:00:00Z",
    };
    const accountChain = buildSingleChain({
      data: { id: ACCOUNT_ID, auth_id: null, username: "bob" },
      error: null,
    });
    const venueChain = buildSingleChain({ data: VENUE_ROW, error: null });

    // First users.select (lookup) returns null; insert returns new profile.
    let usersCallCount = 0;
    const usersLookupChain = buildSingleChain({ data: null, error: null });
    const usersInsertChain = buildSingleChain({ data: newProfile, error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue(accountChain) };
      if (table === "venues") return { select: vi.fn().mockReturnValue(venueChain) };
      if (table === "users") {
        usersCallCount++;
        if (usersCallCount === 1) return { select: vi.fn().mockReturnValue(usersLookupChain) };
        return { insert: vi.fn().mockReturnValue(usersInsertChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID, venueId: VENUE_ID, location: JOIN_LOCATION }),
      })
    );
    const body = (await response.json()) as {
      ok: boolean;
      user?: { id: string; points: number; accountId: string };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.user?.id).toBe("user-profile-new");
    expect(body.user?.points).toBe(0);
    expect(body.user?.accountId).toBe(ACCOUNT_ID);
  });

  it("returns 404 when accountId does not match any account", async () => {
    const accountChain = buildSingleChain({ data: null, error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue(accountChain) };
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID, venueId: VENUE_ID }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Account not found");
  });

  it("rejects account joins when submitted location is outside the venue geofence", async () => {
    const accountChain = buildSingleChain({
      data: { id: ACCOUNT_ID, auth_id: null, username: "alice", god_mode: false },
      error: null,
    });
    const venueChain = buildSingleChain({ data: VENUE_ROW, error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue(accountChain) };
      if (table === "venues") return { select: vi.fn().mockReturnValue(venueChain) };
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: ACCOUNT_ID,
          venueId: VENUE_ID,
          location: { latitude: 41, longitude: -74, accuracy: 25 },
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Required range");
  });

  it("requires venueId in the account-first path", async () => {
    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Venue");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
