import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  applyChallengeCampaignPoints: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/challengeCampaigns", () => ({ applyChallengeCampaignPoints: mocks.applyChallengeCampaignPoints }));

import {
  PICKEM_PAYOUT_BATCH,
  PICKEM_POINTS_PER_CORRECT_PICK,
  PICKEM_PRIZE_ACCRUAL_MAX_AGE_MS,
  pickEmPrizeAccrualGroups,
  payPickEmPoints,
  type PaidPickEmPick,
} from "@/lib/pickemPoints";

const NOW = Date.parse("2026-11-01T03:00:00.000Z");
const recent = new Date(NOW - 60_000).toISOString();
const old = new Date(NOW - PICKEM_PRIZE_ACCRUAL_MAX_AGE_MS - 60_000).toISOString();

const row = (overrides: Record<string, unknown> = {}) => ({
  pick_id: "p1",
  user_id: "u1",
  venue_id: "v1",
  sport_slug: "nba",
  starts_at: "2026-11-01T00:00:00.000Z",
  resolved_at: recent,
  points_awarded: 10,
  ...overrides,
});

const paid = (overrides: Partial<PaidPickEmPick> = {}): PaidPickEmPick => ({
  pickId: "p1",
  userId: "u1",
  venueId: "v1",
  sportSlug: "nba",
  startsAt: "2026-11-01T00:00:00.000Z",
  resolvedAt: recent,
  points: 10,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.rpc.mockReset();
  mocks.applyChallengeCampaignPoints.mockReset();
  mocks.applyChallengeCampaignPoints.mockResolvedValue({ finalPoints: 0, multiplierApplied: 1, campaignUpdates: [] });
});

describe("payPickEmPoints", () => {
  it("pays through the RPC only, everyone's picks when no player is given", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await payPickEmPoints();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("pay_pickem_points", { p_user_id: null, p_limit: PICKEM_PAYOUT_BATCH });
  });

  it("scopes to one player when asked", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await payPickEmPoints({ userId: " u7 " });
    expect(mocks.rpc).toHaveBeenCalledWith("pay_pickem_points", { p_user_id: "u7", p_limit: PICKEM_PAYOUT_BATCH });
  });

  it("reports what the RPC paid: a flat 10 per correct pick, NFL included", async () => {
    mocks.rpc.mockResolvedValue({
      data: [row(), row({ pick_id: "p2", sport_slug: "nfl" }), row({ pick_id: "p3", user_id: "u2" })],
      error: null,
    });
    const report = await payPickEmPoints();
    expect(report).toEqual({ picksPaid: 3, pointsPaid: 30, picksAccruedToPrizes: 2, error: null });
  });

  it("feeds regular picks to 'pickem' prizes per player and venue, 10 per pick, at payment time", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        row(),
        row({ pick_id: "p2", sport_slug: "mlb" }),
        row({ pick_id: "p3", venue_id: "v2" }),
      ],
      error: null,
    });
    await payPickEmPoints();
    expect(mocks.applyChallengeCampaignPoints).toHaveBeenCalledTimes(2);
    expect(mocks.applyChallengeCampaignPoints).toHaveBeenCalledWith({
      userId: "u1",
      venueId: "v1",
      gameType: "pickem",
      basePoints: 20,
      occurredAt: new Date(NOW),
    });
    expect(mocks.applyChallengeCampaignPoints).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v2", basePoints: 10, gameType: "pickem" })
    );
  });

  it("never feeds NFL picks to 'pickem' prizes (NFL Pick 'Em has its own accrual sweep)", async () => {
    mocks.rpc.mockResolvedValue({ data: [row({ sport_slug: "nfl" })], error: null });
    const report = await payPickEmPoints();
    expect(report.picksPaid).toBe(1);
    expect(mocks.applyChallengeCampaignPoints).not.toHaveBeenCalled();
  });

  it("pays the cutover backlog its points but adds no prize progress for long-graded picks", async () => {
    mocks.rpc.mockResolvedValue({ data: [row({ resolved_at: old }), row({ pick_id: "p2", resolved_at: null })], error: null });
    const report = await payPickEmPoints();
    expect(report).toMatchObject({ picksPaid: 2, pointsPaid: 20, picksAccruedToPrizes: 0 });
    expect(mocks.applyChallengeCampaignPoints).not.toHaveBeenCalled();
  });

  it("never throws when the RPC is missing (app deployed before its migration)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.pay_pickem_points" } });
    const report = await payPickEmPoints();
    expect(report).toEqual({ picksPaid: 0, pointsPaid: 0, picksAccruedToPrizes: 0, error: "pay_pickem_points is not installed." });
    expect(mocks.applyChallengeCampaignPoints).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never throws on any other RPC failure, and pays nothing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockRejectedValueOnce(new Error("network down"));
    expect(await payPickEmPoints()).toMatchObject({ picksPaid: 0, error: "network down" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "40P01", message: "deadlock detected" } });
    expect(await payPickEmPoints()).toMatchObject({ picksPaid: 0, error: "deadlock detected" });
    expect(mocks.applyChallengeCampaignPoints).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("a prize-accrual failure never un-pays or throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: [row()], error: null });
    mocks.applyChallengeCampaignPoints.mockRejectedValueOnce(new Error("prize engine down"));
    expect(await payPickEmPoints()).toEqual({ picksPaid: 1, pointsPaid: 10, picksAccruedToPrizes: 0, error: null });
    errorSpy.mockRestore();
  });
});

describe("pickEmPrizeAccrualGroups", () => {
  it("groups regular picks per player + venue and skips NFL and old grades", () => {
    expect(
      pickEmPrizeAccrualGroups(
        [
          paid(),
          paid({ pickId: "p2" }),
          paid({ pickId: "p3", sportSlug: "nfl" }),
          paid({ pickId: "p4", resolvedAt: old }),
          paid({ pickId: "p5", userId: "u2" }),
        ],
        NOW
      )
    ).toEqual([
      { userId: "u1", venueId: "v1", picks: 2, points: 20 },
      { userId: "u2", venueId: "v1", picks: 1, points: 10 },
    ]);
  });

  it("keeps the point value equal to the SQL literal", () => {
    expect(PICKEM_POINTS_PER_CORRECT_PICK).toBe(10);
  });
});
