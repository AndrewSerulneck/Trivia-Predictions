import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

import { resolvePendingPredictionMarket } from "@/lib/admin";

describe("resolvePendingPredictionMarket", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
  });

  it("uses RPC settlement result when function exists", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ affected_picks: 3, winners: 2, losers: 1, canceled: 0 }],
      error: null,
    });

    const result = await resolvePendingPredictionMarket({
      predictionId: "market-1",
      winningOutcomeId: "outcome-a",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("settle_prediction_market", {
      p_prediction_id: "market-1",
      p_winning_outcome_id: "outcome-a",
      p_settle_as_canceled: false,
    });
    expect(result).toEqual({
      affectedPicks: 3,
      winners: 2,
      losers: 1,
      canceled: 0,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("falls back to legacy settlement when RPC function is missing", async () => {
    const pendingRows = [
      {
        id: "pick-1",
        user_id: "user-1",
        prediction_id: "market-2",
        outcome_id: "outcome-a",
        outcome_title: "Outcome A",
        points: 40,
        status: "pending",
        created_at: "2026-02-16T10:00:00.000Z",
      },
      {
        id: "pick-2",
        user_id: "user-2",
        prediction_id: "market-2",
        outcome_id: "outcome-b",
        outcome_title: "Outcome B",
        points: 20,
        status: "pending",
        created_at: "2026-02-16T10:01:00.000Z",
      },
    ];

    const notificationInsert = vi.fn().mockResolvedValue({ error: null });
    const userPredictionsUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const userPredictionsUpdate = vi.fn().mockReturnValue({ eq: userPredictionsUpdateEq });

    const pendingSelectEqFinal = vi.fn().mockResolvedValue({ data: pendingRows, error: null });
    const pendingSelectEqFirst = vi.fn().mockReturnValue({ eq: pendingSelectEqFinal });
    const userPredictionsSelect = vi.fn().mockReturnValue({ eq: pendingSelectEqFirst });

    const usersMaybeSingle = vi.fn().mockResolvedValue({ data: { points: 100 }, error: null });
    const usersSelectEq = vi.fn().mockReturnValue({ maybeSingle: usersMaybeSingle });
    const usersSelect = vi.fn().mockReturnValue({ eq: usersSelectEq });

    const usersUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const usersUpdate = vi.fn().mockReturnValue({ eq: usersUpdateEq });

    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function does not exist" },
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "user_predictions") {
        return {
          select: userPredictionsSelect,
          update: userPredictionsUpdate,
        };
      }
      if (table === "users") {
        return {
          select: usersSelect,
          update: usersUpdate,
        };
      }
      if (table === "notifications") {
        return {
          insert: notificationInsert,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await resolvePendingPredictionMarket({
      predictionId: "market-2",
      winningOutcomeId: "outcome-a",
    });

    expect(result).toEqual({
      affectedPicks: 2,
      winners: 1,
      losers: 1,
      canceled: 0,
    });

    expect(userPredictionsUpdate).toHaveBeenCalledTimes(2);
    expect(usersMaybeSingle).toHaveBeenCalledTimes(1);
    expect(usersUpdate).toHaveBeenCalledWith({ points: 140 });

    expect(notificationInsert).toHaveBeenCalledTimes(1);
    const insertedNotifications = notificationInsert.mock.calls[0][0] as Array<{
      user_id: string;
      message: string;
      type: string;
    }>;
    expect(insertedNotifications).toHaveLength(2);
    expect(insertedNotifications.some((item) => item.type === "success")).toBe(true);
    expect(insertedNotifications.some((item) => item.type === "warning")).toBe(true);
  });

  it("rejects invalid input before querying", async () => {
    await expect(
      resolvePendingPredictionMarket({ predictionId: "market-3" })
    ).rejects.toThrow("winningOutcomeId is required unless settling as canceled.");

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
