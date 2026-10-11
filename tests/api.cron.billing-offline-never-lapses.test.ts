import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Check-paying (offline) accounts NEVER lapse automatically (Andrew, 2026-10-11).
 *
 * This cron used to flip an active offline row to status='cancelled' once its
 * paid-through date passed — which is how Garden State, still paying by check,
 * showed "cancelled" from 2026-08-26. That sweep is gone: an offline row now
 * stays active until an admin revokes it. These tests pin that the cron issues
 * no write of any kind against billing_subscriptions, and (the older SlimCD
 * teardown regression) no charge and no invoice either.
 *
 * The mock records every query-builder chain. The reconcilers run for real
 * against it and find zero candidates; their behaviour is covered in
 * tests/api.cron.billing.reveal.test.ts and tests/api.cron.billing.rehide.test.ts.
 */

type Call = {
  update?: Record<string, unknown>;
  insert?: Record<string, unknown>;
  eq: Array<[string, unknown]>;
  lte: Array<[string, unknown]>;
  neq: Array<[string, unknown]>;
  table: string;
};

const mocks = vi.hoisted(() => ({
  calls: [] as Call[],
  // Resolver for a read chain (no .update()).
  dueResult: { data: [] as unknown[], error: null as unknown },
  // Resolver for the expiry write chain (has .update()).
  expiryResult: { data: [] as unknown[], error: null as unknown },
}));

// Multi-venue billing Phase 3 added a fourth cron job (settling stuck "Add a venue" attempts); it has
// its own tests (tests/api.owner.venues-add.test.ts). Stubbed here so this file's mock stays scoped.
vi.mock("@/lib/venueAddition", () => ({
  reconcileStaleVenueAdditions: vi.fn(async () => ({ dryRun: false, scanned: 0, paid: 0, failed: 0, waiting: 0, errors: [] })),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const makeBuilder = (table: string) => {
    const call: Call = { eq: [], lte: [], neq: [], table };
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
    // Filter ops the reveal-repair scan uses. Unrecorded on purpose: this file
    // asserts the offline sweep, not that job.
    for (const op of ["not", "in", "order", "limit", "or"]) {
      builder[op] = vi.fn(chain);
    }
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      call.update = payload;
      return builder;
    });
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      call.insert = payload;
      return Promise.resolve({ error: null });
    });
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
      from: vi.fn((table: string) => makeBuilder(table)),
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

describe("/api/cron/billing — offline (check) accounts never lapse", () => {
  beforeEach(() => {
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

  it("never cancels an offline row, whatever its paid-through date", async () => {
    // If a sweep came back, this is what it would "find" — and it must not run.
    mocks.expiryResult = { data: [{ id: "sub-offline-past-date" }], error: null };

    const response = await POST(authedRequest());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty("offlineExpired");
    expect(mocks.calls.some((c) => c.table === "billing_subscriptions" && c.update)).toBe(false);
    expect(
      mocks.calls.some((c) => c.eq.some(([col, val]) => col === "billing_method" && val === "offline"))
    ).toBe(false);
  });

  /**
   * Phase 4 (SlimCD teardown) regression: this cron used to charge stored
   * recurring tokens and book the resulting invoices itself. That path is gone —
   * Stripe drives card renewals and its webhook books the invoices. If a charge
   * loop is ever reintroduced here it will show up as an invoice insert.
   */
  it("issues no charge, books no invoice and writes no billing row", async () => {
    await POST(authedRequest());

    expect(mocks.calls.some((c) => c.insert)).toBe(false);
    expect(mocks.calls.some((c) => c.table === "billing_subscriptions" && c.update)).toBe(false);
    expect(mocks.calls.some((c) => c.table === "billing_invoices")).toBe(false);
  });
});
