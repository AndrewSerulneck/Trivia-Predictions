import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  chooseUserAndVenueFromRequest: vi.fn(),
  findUserByIdAndVenue: vi.fn(),
  getSessionHintsFromCookies: vi.fn(),
  getUsernameUpdateCooldownSeconds: vi.fn(),
  mapUserForResponse: vi.fn(),
  normalizeUsername: vi.fn(),
  normalizeUsernameForLookup: vi.fn(),
  resolveSupabaseAuthUserId: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

vi.mock("@/lib/webauthn", () => ({
  chooseUserAndVenueFromRequest: mocks.chooseUserAndVenueFromRequest,
  findUserByIdAndVenue: mocks.findUserByIdAndVenue,
  getSessionHintsFromCookies: mocks.getSessionHintsFromCookies,
  getUsernameUpdateCooldownSeconds: mocks.getUsernameUpdateCooldownSeconds,
  mapUserForResponse: mocks.mapUserForResponse,
  normalizeUsername: mocks.normalizeUsername,
  normalizeUsernameForLookup: mocks.normalizeUsernameForLookup,
  resolveSupabaseAuthUserId: mocks.resolveSupabaseAuthUserId,
}));

import { POST } from "@/app/api/auth/username/update/route";

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString("hex");
}

function createChain(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const chain: Record<string, any> = {
    eq: vi.fn(),
    neq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.neq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.insert.mockResolvedValue({ error: null });
  chain.limit.mockResolvedValue(result);
  chain.single.mockResolvedValue(result);
  return chain;
}

describe("POST /api/auth/username/update", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if ("mockReset" in mock) {
        mock.mockReset();
      }
    });

    mocks.chooseUserAndVenueFromRequest.mockReturnValue({
      userId: "00000000-0000-4000-8000-000000000001",
      venueId: "venue-a",
    });
    mocks.getSessionHintsFromCookies.mockReturnValue({
      userId: "00000000-0000-4000-8000-000000000001",
      venueId: "venue-a",
    });
    mocks.getUsernameUpdateCooldownSeconds.mockReturnValue(3600);
    mocks.normalizeUsername.mockImplementation((value: string) => value.trim());
    mocks.normalizeUsernameForLookup.mockImplementation((value: string) => value.trim().toLowerCase());
    mocks.resolveSupabaseAuthUserId.mockResolvedValue(null);
    mocks.mapUserForResponse.mockImplementation((user: any) => ({
      id: user.id,
      username: user.username,
      venueId: user.venue_id,
      points: user.points,
      createdAt: user.created_at,
    }));
  });

  it("updates username successfully for case-only change", async () => {
    const salt = "salt-a";
    mocks.findUserByIdAndVenue.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      auth_id: null,
      username: "PlayerOne",
      venue_id: "venue-a",
      points: 15,
      created_at: "2026-05-27T00:00:00.000Z",
      pin_salt: salt,
      pin_hash: hashPin("1234", salt),
    });

    const attemptsSelect = createChain({ data: [], error: null });
    const attemptsInsert = createChain({ data: [], error: null });
    const auditSelect = createChain({ data: [], error: null });
    const auditInsert = createChain({ data: [], error: null });
    const usersUpdate = createChain({
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        auth_id: null,
        username: "PLAYERONE",
        username_normalized: "playerone",
        venue_id: "venue-a",
        points: 15,
        created_at: "2026-05-27T00:00:00.000Z",
        pin_salt: salt,
        pin_hash: hashPin("1234", salt),
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "username_change_attempts") {
        return {
          select: vi.fn().mockReturnValue(attemptsSelect),
          insert: attemptsInsert.insert,
        };
      }
      if (table === "username_change_audit") {
        return {
          select: vi.fn().mockReturnValue(auditSelect),
          insert: auditInsert.insert,
        };
      }
      if (table === "users") {
        return {
          update: vi.fn().mockReturnValue(usersUpdate),
          select: vi.fn().mockReturnValue(createChain({ data: [], error: null })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/auth/username/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "00000000-0000-4000-8000-000000000001",
          venueId: "venue-a",
          newUsername: "PLAYERONE",
          currentPin: "1234",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; isCaseOnlyChange?: boolean; user?: { username: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.isCaseOnlyChange).toBe(true);
    expect(body.user?.username).toBe("PLAYERONE");
  });

  it("returns conflict when normalized username is already taken", async () => {
    const salt = "salt-b";
    mocks.findUserByIdAndVenue.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      auth_id: null,
      username: "PlayerOne",
      venue_id: "venue-a",
      points: 15,
      created_at: "2026-05-27T00:00:00.000Z",
      pin_salt: salt,
      pin_hash: hashPin("1234", salt),
    });

    const attemptsSelect = createChain({ data: [], error: null });
    const attemptsInsert = createChain({ data: [], error: null });
    const auditSelect = createChain({ data: [], error: null });
    const conflictSelect = createChain({
      data: [{ id: "00000000-0000-4000-8000-000000000099" }],
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "username_change_attempts") {
        return {
          select: vi.fn().mockReturnValue(attemptsSelect),
          insert: attemptsInsert.insert,
        };
      }
      if (table === "username_change_audit") {
        return {
          select: vi.fn().mockReturnValue(auditSelect),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue(conflictSelect),
          update: vi.fn().mockReturnValue(createChain({ data: null, error: null })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/auth/username/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "00000000-0000-4000-8000-000000000001",
          venueId: "venue-a",
          newUsername: "new_name",
          currentPin: "1234",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("That username is already taken.");
  });

  it("updates username successfully for a non-case change with no collision", async () => {
    const salt = "salt-c";
    mocks.findUserByIdAndVenue.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      auth_id: null,
      username: "PlayerOne",
      venue_id: "venue-a",
      points: 21,
      created_at: "2026-05-27T00:00:00.000Z",
      pin_salt: salt,
      pin_hash: hashPin("1234", salt),
    });

    const attemptsSelect = createChain({ data: [], error: null });
    const attemptsInsert = createChain({ data: [], error: null });
    const auditSelect = createChain({ data: [], error: null });
    const auditInsert = createChain({ data: [], error: null });
    const conflictSelect = createChain({ data: [], error: null });
    const usersUpdate = createChain({
      data: {
        id: "00000000-0000-4000-8000-000000000001",
        auth_id: null,
        username: "Champion2",
        username_normalized: "champion2",
        venue_id: "venue-a",
        points: 21,
        created_at: "2026-05-27T00:00:00.000Z",
        pin_salt: salt,
        pin_hash: hashPin("1234", salt),
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "username_change_attempts") {
        return {
          select: vi.fn().mockReturnValue(attemptsSelect),
          insert: attemptsInsert.insert,
        };
      }
      if (table === "username_change_audit") {
        return {
          select: vi.fn().mockReturnValue(auditSelect),
          insert: auditInsert.insert,
        };
      }
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue(conflictSelect),
          update: vi.fn().mockReturnValue(usersUpdate),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/auth/username/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "00000000-0000-4000-8000-000000000001",
          venueId: "venue-a",
          newUsername: "Champion2",
          currentPin: "1234",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; isCaseOnlyChange?: boolean; user?: { username: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.isCaseOnlyChange).toBe(false);
    expect(body.user?.username).toBe("Champion2");
  });
});
