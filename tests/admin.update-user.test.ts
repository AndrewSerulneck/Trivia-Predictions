import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import { updateAdminUser } from "@/lib/admin";

describe("updateAdminUser validation", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("rejects empty username", async () => {
    await expect(
      updateAdminUser({ userId: "u1", username: "   " })
    ).rejects.toThrow("Username is required.");

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects when no fields are provided", async () => {
    await expect(updateAdminUser({ userId: "u1" })).rejects.toThrow("No user fields to update.");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("normalizes points and persists update", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: "u1",
        username: "player_1",
        venue_id: "venue-1",
        points: 0,
        is_admin: false,
        created_at: "2026-02-16T10:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });

    mocks.from.mockReturnValue({ update });

    const result = await updateAdminUser({ userId: "u1", points: -9.7 });

    expect(mocks.from).toHaveBeenCalledWith("users");
    expect(update).toHaveBeenCalledWith({ points: 0 });
    expect(eq).toHaveBeenCalledWith("id", "u1");
    expect(result).toEqual({
      id: "u1",
      username: "player_1",
      venueId: "venue-1",
      points: 0,
      isAdmin: false,
      createdAt: "2026-02-16T10:00:00.000Z",
    });
  });
});
