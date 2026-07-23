import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 1 of the offline-billing review fixes: the billing cron must expire
 * offline/check grants once their paid-through date passes. An offline row
 * carries no processor token, so nothing else ever flips it — without this
 * sweep it would stay status='active' forever, contradicting the admin copy
 * "then reverts to no access."
 *
 * The mock records every query-builder chain so we can assert the sweep's
 * filters (billing_method='offline', status='active', current_period_end <= now)
 * and its status='cancelled' write, while the unrelated rebilling due-query is
 * driven empty.
 */

type Call = {
  update?: Record<string, unknown>;
  eq: Array<[string, unknown]>;
  lte: Array<[string, unknown]>;
  neq: Array<[string, unknown]>;
};

const mocks = vi.hoisted(() => ({
  chargeRecurring: vi.fn(),
  calls: [] as Call[],
  // Resolver for a read chain (the due query — no .update()).
  dueResult: { data: [] as unknown[], error: null as unknown },
  // Resolver for the expiry write chain (has .update()).
  expiryResult: { data: [] as unknown[], error: null as unknown },
}));

vi.mock("@/lib/slimcd", () => ({
  chargeRecurring: mocks.chargeRecurring,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const makeBuilder = () => {
    const call: Call = { eq: [], lte: [], neq: [] };
    mocks.calls.push(call);
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn((col: string, val: unknown) => {
      call.eq.push([col, val]);
      return builder;
    });
    builder.lte = vi.fn((col: string, val: unknown) => {
      call.lte.push([col, val]);
      return builder;
    });
    builder.neq = vi.fn((col: string, val: unknown) => {
      call.neq.push([col, val]);
      return builder;
    });
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      call.update = payload;
      return builder;
    });
    builder.insert = vi.fn(() => Promise.resolve({ error: null }));
    builder.returns = vi.fn(() =>
      Promise.resolve(call.update ? mocks.expiryResult : mocks.dueResult)
    );
    // Allow bare `await builder` (write chains that don't call .returns()).
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve(call.update ? mocks.expiryResult : { error: null });
    return builder;
  };
  return {
    supabaseAdmin: {
      from: vi.fn(() => makeBuilder()),
    },
  };
});

import { POST } from "@/app/api/cron/billing/route";

const originalCronSecret = process.env.CRON_SECRET;

const authedRequest = () =>
  new Request("http://localhost/api/cron/billing", {
    method: "POST",
    headers: { Authorization: "Bearer top-secret" },
  });

describe("/api/cron/billing — offline expiry sweep", () => {
  beforeEach(() => {
    mocks.chargeRecurring.mockReset();
    mocks.calls.length = 0;
    mocks.dueResult = { data: [], error: null };
    mocks.expiryResult = { data: [], error: null };
    process.env.CRON_SECRET = "top-secret";
  });

  afterAll(() => {
    if (typeof originalCronSecret === "string") {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  it("cancels an active offline row whose paid-through date has passed", async () => {
    // The expiry update returns the row it flipped (one past-due offline grant).
    mocks.expiryResult = { data: [{ id: "sub-offline-expired" }], error: null };

    const response = await POST(authedRequest());
    const body = (await response.json()) as { ok: boolean; offlineExpired: number };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.offlineExpired).toBe(1);

    // Find the sweep chain: the one that issued an update.
    const sweep = mocks.calls.find((c) => c.update);
    expect(sweep).toBeDefined();
    expect(sweep?.update).toEqual({ status: "cancelled" });
    expect(sweep?.eq).toEqual(
      expect.arrayContaining([
        ["billing_method", "offline"],
        ["status", "active"],
      ])
    );
    // Bounded to rows whose paid-through date is in the past.
    expect(sweep?.lte.some(([col]) => col === "current_period_end")).toBe(true);
  });

  it("leaves offline rows still within their period untouched (none returned)", async () => {
    // A row still within its period is excluded by the current_period_end <= now
    // filter, so the update affects nothing.
    mocks.expiryResult = { data: [], error: null };

    const response = await POST(authedRequest());
    const body = (await response.json()) as { ok: boolean; offlineExpired: number };

    expect(response.status).toBe(200);
    expect(body.offlineExpired).toBe(0);
  });
});
