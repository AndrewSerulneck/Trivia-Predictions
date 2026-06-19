import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import { GET, POST } from "@/app/api/join/profile/route";

const JOIN_LOCATION = { latitude: 40, longitude: -74, accuracy: 25 };
const VENUE_ROW = { id: "venue-qa", latitude: 40, longitude: -74, radius: 100 };

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString("hex");
}

function buildSelectChain<T>(result: { data: T; error: { message?: string; code?: string } | null }) {
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    ilike: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(),
    ilike: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.ilike.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

describe("/api/join/profile", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("authenticates returning users by exact username + venue + PIN", async () => {
    const salt = "abc123salt";
    const existingRow = {
      id: "u-1",
      auth_id: null,
      username: "ace_1",
      venue_id: "venue-qa",
      points: 12,
      pin_salt: salt,
      pin_hash: hashPin("1357", salt),
      created_at: "2026-05-26T12:00:00.000Z",
    };
    const usersSelect = buildSelectChain({ data: [existingRow], error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "venues") {
        return {
          select: vi.fn().mockReturnValue(buildSelectChain({ data: VENUE_ROW, error: null })),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue(usersSelect),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "ace_1",
          venueId: "venue-qa",
          selectedVenueId: "venue-qa",
          pin: "1357",
          location: JOIN_LOCATION,
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; user?: { id: string }; error?: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.user?.id).toBe("u-1");
    expect(usersSelect.eq).toHaveBeenCalledWith("username_normalized", "ace_1");
    expect(usersSelect.eq).toHaveBeenCalledWith("venue_id", "venue-qa");
    expect(usersSelect.ilike).not.toHaveBeenCalled();
  });

  it("returns 401 for incorrect PIN on returning user", async () => {
    const salt = "salt-2";
    const existingRow = {
      id: "u-2",
      auth_id: null,
      username: "player2",
      venue_id: "venue-qa",
      points: 20,
      pin_salt: salt,
      pin_hash: hashPin("1111", salt),
      created_at: "2026-05-26T12:00:00.000Z",
    };
    const usersSelect = buildSelectChain({ data: [existingRow], error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "venues") {
        return {
          select: vi.fn().mockReturnValue(buildSelectChain({ data: VENUE_ROW, error: null })),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue(usersSelect),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "player2",
          venueId: "venue-qa",
          selectedVenueId: "venue-qa",
          pin: "9999",
          location: JOIN_LOCATION,
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Incorrect PIN.");
  });

  it("returns 409 on venue mismatch before any DB access", async () => {
    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Selected-Venue-Id": "venue-b" },
        body: JSON.stringify({
          username: "player3",
          venueId: "venue-a",
          selectedVenueId: "venue-b",
          pin: "2468",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Venue selection mismatch");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects when no location is provided for username+PIN join", async () => {
    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice",
          venueId: "venue-qa",
          selectedVenueId: "venue-qa",
          pin: "1234",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Location verification is required");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects when location is outside the venue geofence for username+PIN join", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "venues") {
        return { select: vi.fn().mockReturnValue(buildSelectChain({ data: VENUE_ROW, error: null })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice",
          venueId: "venue-qa",
          selectedVenueId: "venue-qa",
          pin: "1234",
          location: { latitude: 41, longitude: -74, accuracy: 25 },
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Required range");
  });

  it("GET reports returning user only when exact username row has PIN", async () => {
    const usersSelect = buildSelectChain({
      data: [{ id: "u-4", username: "Exact_User", pin_salt: "salt", pin_hash: "hash" }],
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue(usersSelect),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await GET(new Request("http://localhost/api/join/profile?username=Exact_User&venueId=venue-z"));
    const body = (await response.json()) as { ok: boolean; exists: boolean; hasPin: boolean; isReturningUser: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.exists).toBe(true);
    expect(body.hasPin).toBe(true);
    expect(body.isReturningUser).toBe(true);
    expect(usersSelect.eq).toHaveBeenCalledWith("username_normalized", "exact_user");
    expect(usersSelect.eq).toHaveBeenCalledWith("venue_id", "venue-z");
    expect(usersSelect.ilike).not.toHaveBeenCalled();
  });
});
