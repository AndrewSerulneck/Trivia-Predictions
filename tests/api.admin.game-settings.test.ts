import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  getVenueGameSettings: vi.fn(),
  updateVenueGameSettings: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.requireAdminAuth }));
vi.mock("@/lib/venueGameSettings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/venueGameSettings")>("@/lib/venueGameSettings");
  return {
    getVenueGameSettings: mocks.getVenueGameSettings,
    updateVenueGameSettings: mocks.updateVenueGameSettings,
    readGameSettingsChanges: actual.readGameSettingsChanges,
  };
});

import { GET, POST } from "@/app/api/admin/game-settings/route";

describe("admin game settings API", () => {
  beforeEach(() => {
    mocks.requireAdminAuth.mockReset();
    mocks.getVenueGameSettings.mockReset();
    mocks.updateVenueGameSettings.mockReset();

    mocks.requireAdminAuth.mockResolvedValue({ ok: true, authUserId: "admin", adminUsername: "andrew" });
    mocks.getVenueGameSettings.mockResolvedValue({
      venueId: "venue-9",
      nflPickEmScoringMode: "standard",
      createdAt: null,
      updatedAt: null,
    });
    mocks.updateVenueGameSettings.mockResolvedValue({
      venueId: "venue-9",
      nflPickEmScoringMode: "spread",
      createdAt: null,
      updatedAt: "2026-08-02T12:00:00.000Z",
    });
  });

  it("lets an admin read any venue's game settings", async () => {
    const response = await GET(new Request("http://localhost/api/admin/game-settings?venueId=venue-9"));
    const body = (await response.json()) as { ok: boolean; settings: { venueId: string } };

    expect(response.status).toBe(200);
    expect(body.settings.venueId).toBe("venue-9");
    expect(mocks.getVenueGameSettings).toHaveBeenCalledWith("venue-9");
  });

  it("lets an admin update any venue's NFL Pick 'Em scoring mode", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: "venue-9", nflPickEmScoringMode: "spread" }),
      }),
    );
    const body = (await response.json()) as { ok: boolean; settings: { nflPickEmScoringMode: string } };

    expect(response.status).toBe(200);
    expect(body.settings.nflPickEmScoringMode).toBe("spread");
    expect(mocks.updateVenueGameSettings).toHaveBeenCalledWith("venue-9", { nflPickEmScoringMode: "spread" });
  });

  it("saves the College Football rule on its own, and refuses a bad value or an empty body", async () => {
    const post = (body: Record<string, unknown>) =>
      POST(
        new Request("http://localhost/api/admin/game-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId: "venue-9", ...body }),
        }),
      );

    expect((await post({ cfbPickEmScoringMode: "standard" })).status).toBe(200);
    expect(mocks.updateVenueGameSettings).toHaveBeenCalledWith("venue-9", { cfbPickEmScoringMode: "standard" });

    mocks.updateVenueGameSettings.mockClear();
    expect((await post({ cfbPickEmScoringMode: "moneyline" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mocks.updateVenueGameSettings).not.toHaveBeenCalled();
  });
});
