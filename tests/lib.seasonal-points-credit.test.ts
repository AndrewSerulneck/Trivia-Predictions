import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type RpcArgs = { p_source: string; p_credits: Array<{ user_id: string; source_key: string; points: number }> };

const h = vi.hoisted(() => ({
  calls: [] as RpcArgs[],
  error: null as { code?: string; message?: string } | null,
  enabled: true,
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    if (!h.enabled) return null;
    return {
      rpc: async (_name: string, args: RpcArgs) => {
        h.calls.push(args);
        if (h.error) return { data: null, error: h.error };
        return {
          data: args.p_credits.map((c) => ({
            credit_user_id: c.user_id,
            credit_source_key: c.source_key,
            credit_points: c.points,
            outcome: c.source_key.startsWith("old") ? "already_credited" : "credited",
            existing_user_id: c.source_key.startsWith("old") ? c.user_id : null,
            existing_points: c.source_key.startsWith("old") ? c.points : null,
          })),
          error: null,
        };
      },
    };
  },
}));

import { creditSeasonalPoints } from "@/lib/seasonalPointsCredit";

const USER = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  h.calls = [];
  h.error = null;
  h.enabled = true;
});

describe("creditSeasonalPoints", () => {
  it("sends the batch as the RPC's JSON shape and maps the answer", async () => {
    const res = await creditSeasonalPoints("squares", [
      { userId: USER, sourceKey: "b1:q1", points: 25 },
      { userId: USER, sourceKey: "old:q1", points: 25 },
    ]);
    expect(h.calls).toEqual([
      {
        p_source: "squares",
        p_credits: [
          { user_id: USER, source_key: "b1:q1", points: 25 },
          { user_id: USER, source_key: "old:q1", points: 25 },
        ],
      },
    ]);
    expect(res).toEqual({
      ok: true,
      results: [
        { userId: USER, sourceKey: "b1:q1", points: 25, outcome: "credited", existingUserId: null, existingPoints: null },
        { userId: USER, sourceKey: "old:q1", points: 25, outcome: "already_credited", existingUserId: USER, existingPoints: 25 },
      ],
    });
  });

  it("splits a large settlement into calls of at most 500", async () => {
    const credits = Array.from({ length: 1001 }, (_, i) => ({ userId: USER, sourceKey: `k${i}`, points: 1 }));
    const res = await creditSeasonalPoints("bracket", credits);
    expect(h.calls.map((c) => c.p_credits.length)).toEqual([500, 500, 1]);
    expect(res.ok && res.results.length).toBe(1001);
  });

  it("refuses an invalid or duplicate credit before sending anything", async () => {
    const bad = await creditSeasonalPoints("squares", [{ userId: USER, sourceKey: "k", points: 0 }]);
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    const dup = await creditSeasonalPoints("squares", [
      { userId: USER, sourceKey: "k", points: 1 },
      { userId: USER, sourceKey: "k", points: 1 },
    ]);
    expect(dup).toMatchObject({ ok: false, code: "invalid" });
    expect(h.calls).toEqual([]);
  });

  it("does nothing for an empty list", async () => {
    expect(await creditSeasonalPoints("squares", [])).toEqual({ ok: true, results: [] });
    expect(h.calls).toEqual([]);
  });

  it("fails closed when the RPC is missing or fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    h.error = { code: "PGRST202", message: "Could not find the function public.credit_seasonal_points" };
    expect(await creditSeasonalPoints("squares", [{ userId: USER, sourceKey: "k", points: 1 }])).toMatchObject({
      ok: false,
      code: "rpc_missing",
    });
    h.error = { code: "22023", message: "bad" };
    expect(await creditSeasonalPoints("squares", [{ userId: USER, sourceKey: "k", points: 1 }])).toMatchObject({
      ok: false,
      code: "rpc_failed",
    });
    expect(errors).toHaveBeenCalledWith("[SeasonalPoints] rpc-missing", expect.anything());
    errors.mockRestore();
  });

  it("keeps earlier committed batches in the results when a later one fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const credits = Array.from({ length: 600 }, (_, i) => ({ userId: USER, sourceKey: `k${i}`, points: 1 }));
    let n = 0;
    const realPush = h.calls.push.bind(h.calls);
    h.calls.push = (...items: RpcArgs[]) => {
      n += 1;
      if (n === 2) h.error = { message: "boom" };
      return realPush(...items);
    };
    const res = await creditSeasonalPoints("bracket", credits);
    expect(res.ok).toBe(false);
    expect(res.results).toHaveLength(500);
    errors.mockRestore();
  });

  it("reports unavailable without a server client", async () => {
    h.enabled = false;
    expect(await creditSeasonalPoints("squares", [{ userId: USER, sourceKey: "k", points: 1 }])).toMatchObject({
      ok: false,
      code: "unavailable",
    });
  });
});
