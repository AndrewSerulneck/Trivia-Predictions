import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  getVenueGameSettings: vi.fn(),
  updateVenueGameSettings: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/venueGameSettings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/venueGameSettings")>("@/lib/venueGameSettings");
  return {
    getVenueGameSettings: mocks.getVenueGameSettings,
    updateVenueGameSettings: mocks.updateVenueGameSettings,
    readGameSettingsChanges: actual.readGameSettingsChanges,
  };
});

import { GET, POST } from "@/app/api/owner/game-settings/route";

const OWNER = { ownerId: "owner-1", venueIds: ["venue-1", "venue-2"] };

describe("owner game settings API", () => {
  beforeEach(() => {
    mocks.requireOwnerAuth.mockReset();
    mocks.getVenueGameSettings.mockReset();
    mocks.updateVenueGameSettings.mockReset();

    mocks.requireOwnerAuth.mockResolvedValue(OWNER);
    mocks.getVenueGameSettings.mockResolvedValue({
      venueId: "venue-1",
      nflPickEmScoringMode: "standard",
      createdAt: null,
      updatedAt: null,
    });
    mocks.updateVenueGameSettings.mockResolvedValue({
      venueId: "venue-1",
      nflPickEmScoringMode: "spread",
      createdAt: null,
      updatedAt: "2026-08-02T12:00:00.000Z",
    });
  });

  it("allows an owner to read settings for a venue they control", async () => {
    const response = await GET(new Request("http://localhost/api/owner/game-settings?venueId=venue-1"));
    const body = (await response.json()) as { ok: boolean; settings: { nflPickEmScoringMode: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.settings.nflPickEmScoringMode).toBe("standard");
    expect(mocks.getVenueGameSettings).toHaveBeenCalledWith("venue-1");
  });

  it("rejects an unowned venue", async () => {
    const response = await GET(new Request("http://localhost/api/owner/game-settings?venueId=venue-999"));

    expect(response.status).toBe(403);
    expect(mocks.getVenueGameSettings).not.toHaveBeenCalled();
  });

  it("allows an owner to update settings for a venue they control", async () => {
    const response = await POST(
      new Request("http://localhost/api/owner/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: "venue-1", nflPickEmScoringMode: "spread" }),
      }),
    );
    const body = (await response.json()) as { ok: boolean; settings: { nflPickEmScoringMode: string } };

    expect(response.status).toBe(200);
    expect(body.settings.nflPickEmScoringMode).toBe("spread");
    expect(mocks.updateVenueGameSettings).toHaveBeenCalledWith("venue-1", { nflPickEmScoringMode: "spread" });
  });

  it("saves the College Football rule on its own, and refuses a bad value or an empty body", async () => {
    const post = (body: Record<string, unknown>) =>
      POST(
        new Request("http://localhost/api/owner/game-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId: "venue-1", ...body }),
        }),
      );

    expect((await post({ cfbPickEmScoringMode: "standard" })).status).toBe(200);
    expect(mocks.updateVenueGameSettings).toHaveBeenCalledWith("venue-1", { cfbPickEmScoringMode: "standard" });

    mocks.updateVenueGameSettings.mockClear();
    expect((await post({ cfbPickEmScoringMode: "moneyline" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect(mocks.updateVenueGameSettings).not.toHaveBeenCalled();
  });

  it("checks the venue is the owner's before reading the body's settings", async () => {
    const response = await POST(
      new Request("http://localhost/api/owner/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: "venue-999", cfbPickEmScoringMode: "standard" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.updateVenueGameSettings).not.toHaveBeenCalled();
  });
});
