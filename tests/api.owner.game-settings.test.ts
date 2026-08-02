import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  getVenueGameSettings: vi.fn(),
  setVenueNFLPickEmScoringMode: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/venueGameSettings", () => ({
  getVenueGameSettings: mocks.getVenueGameSettings,
  setVenueNFLPickEmScoringMode: mocks.setVenueNFLPickEmScoringMode,
}));

import { GET, POST } from "@/app/api/owner/game-settings/route";

const OWNER = { ownerId: "owner-1", venueIds: ["venue-1", "venue-2"] };

describe("owner game settings API", () => {
  beforeEach(() => {
    mocks.requireOwnerAuth.mockReset();
    mocks.getVenueGameSettings.mockReset();
    mocks.setVenueNFLPickEmScoringMode.mockReset();

    mocks.requireOwnerAuth.mockResolvedValue(OWNER);
    mocks.getVenueGameSettings.mockResolvedValue({
      venueId: "venue-1",
      nflPickEmScoringMode: "standard",
      createdAt: null,
      updatedAt: null,
    });
    mocks.setVenueNFLPickEmScoringMode.mockResolvedValue({
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
    expect(mocks.setVenueNFLPickEmScoringMode).toHaveBeenCalledWith("venue-1", "spread");
  });
});
