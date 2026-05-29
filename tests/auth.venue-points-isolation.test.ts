import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { POST } from "@/app/api/join/profile/route";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000099";
const VENUE_A = "venue-alpha";
const VENUE_B = "venue-beta";

function buildChain<T>(result: { data: T; error: { message?: string; code?: string } | null }) {
  const chain = {
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
    insert: vi.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  return chain;
}

describe("Points isolation across venues", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("returns separate points for the same account at two different venues", async () => {
    const account = { id: ACCOUNT_ID, auth_id: null, username: "shared_user" };
    const profileA = {
      id: "user-A",
      auth_id: null,
      username: "shared_user",
      venue_id: VENUE_A,
      points: 150,
      created_at: "2026-05-28T10:00:00Z",
    };
    const profileB = {
      id: "user-B",
      auth_id: null,
      username: "shared_user",
      venue_id: VENUE_B,
      points: 20,
      created_at: "2026-05-28T11:00:00Z",
    };

    function usersChainForVenue(venueId: string) {
      const profile = venueId === VENUE_A ? profileA : profileB;
      return buildChain({ data: profile, error: null });
    }

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue(buildChain({ data: account, error: null })) };
      if (table === "venues") return { select: vi.fn().mockReturnValue(buildChain({ data: { id: "any" }, error: null })) };
      if (table === "users") {
        // Return a fresh chain each call; the first eq sets venue_id context.
        let capturedVenue = "";
        const chain = {
          eq: vi.fn(),
          is: vi.fn(),
          maybeSingle: vi.fn().mockImplementation(() => {
            return Promise.resolve({ data: usersChainForVenue(capturedVenue).maybeSingle.mock.results[0]?.value ?? null, error: null });
          }),
          select: vi.fn(),
        };
        chain.eq.mockImplementation((col: string, val: string) => {
          if (col === "venue_id") capturedVenue = val;
          return chain;
        });
        chain.select.mockReturnValue(chain);
        const profile = { data: profileA, error: null }; // will be overridden by capturedVenue
        chain.maybeSingle = vi.fn().mockImplementation(async () => {
          return { data: capturedVenue === VENUE_A ? profileA : profileB, error: null };
        });
        return { select: vi.fn().mockReturnValue(chain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const responseA = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID, venueId: VENUE_A }),
      })
    );
    const bodyA = (await responseA.json()) as { ok: boolean; user?: { points: number; venueId: string } };

    const responseB = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID, venueId: VENUE_B }),
      })
    );
    const bodyB = (await responseB.json()) as { ok: boolean; user?: { points: number; venueId: string } };

    expect(responseA.status).toBe(200);
    expect(bodyA.ok).toBe(true);
    expect(bodyA.user?.venueId).toBe(VENUE_A);
    expect(bodyA.user?.points).toBe(150);

    expect(responseB.status).toBe(200);
    expect(bodyB.ok).toBe(true);
    expect(bodyB.user?.venueId).toBe(VENUE_B);
    expect(bodyB.user?.points).toBe(20);

    // Key assertion: points do not cross venues.
    expect(bodyA.user?.points).not.toBe(bodyB.user?.points);
  });

  it("creates a new venue profile with points=0 when joining a second venue", async () => {
    const account = { id: ACCOUNT_ID, auth_id: null, username: "traveler" };
    const newProfileB = {
      id: "user-B-new",
      auth_id: null,
      username: "traveler",
      venue_id: VENUE_B,
      points: 0,
      created_at: "2026-05-28T12:00:00Z",
    };

    let usersCallCount = 0;

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") {
        return { select: vi.fn().mockReturnValue(buildChain({ data: account, error: null })) };
      }
      if (table === "venues") {
        return { select: vi.fn().mockReturnValue(buildChain({ data: { id: VENUE_B }, error: null })) };
      }
      if (table === "users") {
        usersCallCount++;
        if (usersCallCount === 1) {
          // Lookup: no existing profile for venue B.
          return { select: vi.fn().mockReturnValue(buildChain({ data: null, error: null })) };
        }
        // Insert: create profile for venue B.
        return { insert: vi.fn().mockReturnValue(buildChain({ data: newProfileB, error: null })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID, venueId: VENUE_B }),
      })
    );
    const body = (await response.json()) as { ok: boolean; user?: { points: number; venueId: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.user?.venueId).toBe(VENUE_B);
    expect(body.user?.points).toBe(0);
  });
});
