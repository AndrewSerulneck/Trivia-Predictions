import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guard test for the check/offline-payment feature: the renewal cron must NEVER
 * charge an offline (billing_method='offline') subscription. Two independent
 * layers protect this — a `.neq('billing_method', 'offline')` filter on the due
 * query, and the tokenless skip inside the loop. This test asserts both.
 */

const mocks = vi.hoisted(() => ({
  chargeRecurring: vi.fn(),
  neq: vi.fn(),
  returns: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/slimcd", () => ({
  chargeRecurring: mocks.chargeRecurring,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  // Chainable query-builder stub. Read chains resolve via `.returns()`; write
  // chains (update/insert) resolve to { error: null }.
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.lte = vi.fn(chain);
    builder.update = vi.fn(chain);
    builder.insert = vi.fn(() => Promise.resolve({ error: null }));
    builder.neq = vi.fn((...args: unknown[]) => {
      mocks.neq(...args);
      return builder;
    });
    builder.returns = vi.fn(() => mocks.returns());
    // Allow `await builder` (e.g. update().eq()) to resolve.
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
    return builder;
  };
  return {
    supabaseAdmin: {
      from: vi.fn(() => {
        mocks.from();
        return makeBuilder();
      }),
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

describe("/api/cron/billing — manual subscription guard", () => {
  beforeEach(() => {
    mocks.chargeRecurring.mockReset();
    mocks.neq.mockReset();
    mocks.returns.mockReset();
    process.env.CRON_SECRET = "top-secret";
  });

  afterAll(() => {
    if (typeof originalCronSecret === "string") {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  it("excludes offline subscriptions from the due query", async () => {
    mocks.returns.mockResolvedValue({ data: [], error: null });

    const response = await POST(authedRequest());
    expect(response.status).toBe(200);

    // The due query must filter out offline/check subscriptions at the DB level.
    expect(mocks.neq).toHaveBeenCalledWith("billing_method", "offline");
  });

  it("never charges an offline/tokenless row even if one slips through the query", async () => {
    // Simulate a DB that returned an offline row anyway (no recurring token).
    mocks.returns.mockResolvedValue({
      data: [
        {
          id: "sub-offline",
          venue_id: "venue-1",
          plan_type: "subscription",
          amount_cents: 10000,
          slimcd_recurring_token: null,
          current_period_end: new Date(Date.now() - 1000).toISOString(),
        },
      ],
      error: null,
    });

    const response = await POST(authedRequest());
    const body = (await response.json()) as { ok: boolean; results: { skipped: number } };

    expect(response.status).toBe(200);
    expect(mocks.chargeRecurring).not.toHaveBeenCalled();
    expect(body.results.skipped).toBe(1);
  });
});
