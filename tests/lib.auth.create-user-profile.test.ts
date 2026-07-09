import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getSession: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      signInAnonymously: mocks.signInAnonymously,
      signOut: mocks.signOut,
    },
  },
}));

import { createUserProfile } from "@/lib/auth";

describe("createUserProfile", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.getSession.mockReset();
    mocks.signInAnonymously.mockReset();
    mocks.signOut.mockReset();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("falls back after auth user lookup timeout and still calls /api/join/profile", async () => {
    vi.useFakeTimers();
    mocks.signInAnonymously.mockImplementation(() => new Promise(() => {}));
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: "user-1",
            authId: "00000000-0000-4000-8000-000000000001",
            username: "player_1",
            venueId: "venue-1",
            points: 10,
            createdAt: "2026-05-26T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const pending = createUserProfile({
      username: "player_1",
      venueId: "venue-1",
      selectedVenueId: "venue-1",
      pin: "1234",
      traceId: "trace-timeout-1",
    });

    expect(mocks.fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1200);
    await Promise.resolve();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const user = await pending;
    expect(user.id).toBe("user-1");
  });

  it("forwards trace + venue headers to /api/join/profile", async () => {
    mocks.signInAnonymously.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000010" } } });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: "user-2",
            username: "player_2",
            venueId: "venue-2",
            points: 0,
            createdAt: "2026-05-26T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await createUserProfile({
      username: "player_2",
      venueId: "venue-2",
      selectedVenueId: "venue-2",
      pin: "9876",
      traceId: "trace-header-2",
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const requestInit = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Selected-Venue-Id": "venue-2",
      "X-Auth-Trace-Id": "trace-header-2",
    });
  });

  it("surfaces incorrect PIN errors from /api/join/profile", async () => {
    mocks.signInAnonymously.mockResolvedValue({ data: { user: { id: "00000000-0000-4000-8000-000000000011" } } });
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: "Incorrect PIN.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      createUserProfile({
        username: "player_3",
        venueId: "venue-3",
        selectedVenueId: "venue-3",
        pin: "0000",
        traceId: "trace-pin-3",
      })
    ).rejects.toThrow("Incorrect PIN.");
  });
});
