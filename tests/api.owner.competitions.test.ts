import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChallengeCampaign, ChallengeGameType } from "@/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  listChallengeCampaigns: vi.fn(),
  createChallengeCampaign: vi.fn(),
  attachLeaderboardSnapshotsToCampaigns: vi.fn(),
  getChallengeCampaignOwnership: vi.fn(),
  deleteChallengeCampaign: vi.fn(),
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/challengeCampaigns", () => ({
  listChallengeCampaigns: mocks.listChallengeCampaigns,
  createChallengeCampaign: mocks.createChallengeCampaign,
  attachLeaderboardSnapshotsToCampaigns: mocks.attachLeaderboardSnapshotsToCampaigns,
  getChallengeCampaignOwnership: mocks.getChallengeCampaignOwnership,
  deleteChallengeCampaign: mocks.deleteChallengeCampaign,
}));

import { GET, POST } from "@/app/api/owner/competitions/route";
import { DELETE } from "@/app/api/owner/competitions/[id]/route";

const OWNER = { ownerId: "owner-1", venueIds: ["venue-1", "venue-2"] };

function makeCampaign(overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign {
  return {
    id: "camp-1",
    createdAt: "2026-07-30T00:00:00.000Z",
    name: "Pick'em Race",
    rules: "…",
    venueIds: ["venue-1"],
    scheduleType: "multi_day",
    activeDays: [],
    startDate: "2026-08-03",
    startTime: "18:00",
    endDate: "2026-08-09",
    endTime: "23:00",
    gameTypes: ["pickem"],
    challengeMode: "leaderboard",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "first_to_score",
    pointMultiplier: 1,
    pointsRequiredToWin: 100,
    recurringType: "none",
    winCondition: "points_threshold",
    winnerQuota: 1,
    isActive: true,
    createdByOwnerId: "owner-1",
    ...overrides,
  };
}

const postRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/owner/competitions", { method: "POST", body: JSON.stringify(body) });

// Valid 5-hour window for a Prop Bingo Night at an owned venue.
const validCreateBody = {
  venueId: "venue-1",
  templateId: "prop_bingo_night",
  startDate: "2026-08-01",
  startTime: "18:00",
  endDate: "2026-08-01",
  endTime: "23:00",
  timezone: "America/New_York",
};

const paramsFor = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.requireOwnerAuth.mockReset();
  mocks.listChallengeCampaigns.mockReset();
  mocks.createChallengeCampaign.mockReset();
  mocks.attachLeaderboardSnapshotsToCampaigns.mockReset();
  mocks.getChallengeCampaignOwnership.mockReset();
  mocks.deleteChallengeCampaign.mockReset();

  mocks.requireOwnerAuth.mockResolvedValue(OWNER);
  mocks.listChallengeCampaigns.mockResolvedValue([]); // no active competitions by default
  mocks.createChallengeCampaign.mockResolvedValue(makeCampaign());
  mocks.attachLeaderboardSnapshotsToCampaigns.mockImplementation(
    async ({ campaigns }: { campaigns: unknown[] }) => campaigns,
  );
});

describe("POST /api/owner/competitions", () => {
  it("expands the template into a venue-scoped engine campaign", async () => {
    const res = await POST(postRequest(validCreateBody));
    expect(res.status).toBe(200);
    expect(mocks.createChallengeCampaign).toHaveBeenCalledOnce();

    const arg = mocks.createChallengeCampaign.mock.calls[0][0];
    // CRITICAL: venue_ids is exactly the one venue — never empty (empty = global).
    expect(arg.venueIds).toEqual(["venue-1"]);
    expect(arg.gameTypes).toEqual(["bingo"]); // prop_bingo_night template
    expect(arg.challengeMode).toBe("leaderboard");
    expect(arg.createdByOwnerId).toBe("owner-1");
    expect(arg.recurringType).toBe("none");
  });

  it("attaches a gift-certificate prize via the engine's prize fields", async () => {
    await POST(postRequest({ ...validCreateBody, prize: { type: "gift_certificate", amount: 25 } }));
    const arg = mocks.createChallengeCampaign.mock.calls[0][0];
    expect(arg.prizeType).toBe("gift_certificate");
    expect(arg.prizeGiftCertificateAmount).toBe(25);
  });

  it("folds a free-text prize into the rules (no engine prizeType)", async () => {
    await POST(
      postRequest({ ...validCreateBody, prize: { type: "description", description: "Round of drinks" } }),
    );
    const arg = mocks.createChallengeCampaign.mock.calls[0][0];
    expect(arg.prizeType).toBeNull();
    expect(arg.rules).toContain("Round of drinks");
  });

  it("rejects a venue the owner does not control with 403, never touching the engine", async () => {
    const res = await POST(postRequest({ ...validCreateBody, venueId: "venue-999" }));
    expect(res.status).toBe(403);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects an unknown template with 400", async () => {
    const res = await POST(postRequest({ ...validCreateBody, templateId: "not_a_template" }));
    expect(res.status).toBe(400);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects a too-short window with 400", async () => {
    const res = await POST(postRequest({ ...validCreateBody, endTime: "18:30" })); // 30 min
    expect(res.status).toBe(400);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("rejects a too-long window (>31 days) with 400", async () => {
    const res = await POST(postRequest({ ...validCreateBody, endDate: "2026-09-15" }));
    expect(res.status).toBe(400);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("409s when the venue is already at the competition cap", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({ id: "a", gameTypes: ["pickem"] }),
      makeCampaign({ id: "b", gameTypes: ["fantasy"] }),
      makeCampaign({ id: "c", gameTypes: ["bingo"] }),
    ]);
    const res = await POST(postRequest(validCreateBody));
    expect(res.status).toBe(409);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("409s a same-template same-window duplicate", async () => {
    // Existing Prop Bingo Night ([bingo]) at the exact same window.
    mocks.listChallengeCampaigns.mockResolvedValue([
      makeCampaign({
        id: "dup",
        gameTypes: ["bingo"],
        startDate: "2026-08-01",
        startTime: "18:00",
        endDate: "2026-08-01",
        endTime: "23:00",
      }),
    ]);
    const res = await POST(postRequest(validCreateBody));
    expect(res.status).toBe(409);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });

  it("propagates the auth failure Response when unauthenticated", async () => {
    mocks.requireOwnerAuth.mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const res = await POST(postRequest(validCreateBody));
    expect(res.status).toBe(401);
    expect(mocks.createChallengeCampaign).not.toHaveBeenCalled();
  });
});

describe("GET /api/owner/competitions", () => {
  it("lists the owner's competitions for an owned venue (scoped by creator)", async () => {
    mocks.listChallengeCampaigns.mockResolvedValue([makeCampaign()]);
    const res = await GET(new Request("http://localhost/api/owner/competitions?venueId=venue-1"));
    const body = (await res.json()) as { ok: boolean; competitions: unknown[] };
    expect(res.status).toBe(200);
    expect(body.competitions).toHaveLength(1);
    // The engine list is scoped to THIS owner — admin campaigns never appear.
    expect(mocks.listChallengeCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ createdByOwnerId: "owner-1", venueId: "venue-1" }),
    );
  });

  it("returns 403 for a venue the owner does not control", async () => {
    const res = await GET(new Request("http://localhost/api/owner/competitions?venueId=venue-999"));
    expect(res.status).toBe(403);
    expect(mocks.listChallengeCampaigns).not.toHaveBeenCalled();
  });

  it("returns 400 when venueId is missing", async () => {
    const res = await GET(new Request("http://localhost/api/owner/competitions"));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/owner/competitions/[id]", () => {
  it("deletes a competition the owner created", async () => {
    mocks.getChallengeCampaignOwnership.mockResolvedValue({
      id: "camp-1",
      createdByOwnerId: "owner-1",
      venueIds: ["venue-1"],
    });
    const res = await DELETE(
      new Request("http://localhost/api/owner/competitions/camp-1", { method: "DELETE" }),
      paramsFor("camp-1"),
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteChallengeCampaign).toHaveBeenCalledWith("camp-1");
  });

  it("returns 404 for an unknown competition", async () => {
    mocks.getChallengeCampaignOwnership.mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://localhost/api/owner/competitions/missing", { method: "DELETE" }),
      paramsFor("missing"),
    );
    expect(res.status).toBe(404);
    expect(mocks.deleteChallengeCampaign).not.toHaveBeenCalled();
  });

  it("returns 403 for an admin-created (or another owner's) competition", async () => {
    mocks.getChallengeCampaignOwnership.mockResolvedValue({
      id: "camp-1",
      createdByOwnerId: null, // admin-created
      venueIds: ["venue-1"],
    });
    const res = await DELETE(
      new Request("http://localhost/api/owner/competitions/camp-1", { method: "DELETE" }),
      paramsFor("camp-1"),
    );
    expect(res.status).toBe(403);
    expect(mocks.deleteChallengeCampaign).not.toHaveBeenCalled();
  });

  it("returns 403 when the competition's venue isn't one the owner controls", async () => {
    mocks.getChallengeCampaignOwnership.mockResolvedValue({
      id: "camp-1",
      createdByOwnerId: "owner-1",
      venueIds: ["venue-999"],
    });
    const res = await DELETE(
      new Request("http://localhost/api/owner/competitions/camp-1", { method: "DELETE" }),
      paramsFor("camp-1"),
    );
    expect(res.status).toBe(403);
    expect(mocks.deleteChallengeCampaign).not.toHaveBeenCalled();
  });
});
