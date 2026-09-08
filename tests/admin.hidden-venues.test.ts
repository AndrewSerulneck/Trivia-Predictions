import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock("@/lib/stripe", () => ({ stripe: null, OFFLINE_BILLING_METHOD: "offline" }));

import { listHiddenVenues, restoreLapsedVenue } from "@/lib/admin";

/** A fluent stub: every filter method returns the builder; `returns` resolves. */
const builder = (result: { data: unknown; error: unknown }, record?: (op: string, args: unknown[]) => void) => {
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq", "not", "in", "or", "update", "order", "limit"]) {
    b[op] = (...args: unknown[]) => {
      record?.(op, args);
      return b;
    };
  }
  b.returns = () => Promise.resolve(result);
  return b;
};

describe("listHiddenVenues", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("classifies lapsed / admin-hidden / system-room and orders lapsed first", async () => {
    const venues = [
      { id: "sys", name: "Global Room", latitude: 0, longitude: 0, self_serve_created_at: null, rehidden_at: null },
      {
        id: "lapsed-b",
        name: "Bravo Bar",
        latitude: 40,
        longitude: -80,
        self_serve_created_at: "2026-08-01T00:00:00Z",
        rehidden_at: "2026-09-05T00:00:00Z",
      },
      {
        id: "admin",
        name: "Admin Hid This",
        latitude: 41,
        longitude: -87,
        self_serve_created_at: null,
        rehidden_at: null,
      },
      {
        id: "lapsed-a",
        name: "Alpha Bar",
        latitude: 42,
        longitude: -83,
        self_serve_created_at: "2026-08-02T00:00:00Z",
        rehidden_at: "2026-09-06T00:00:00Z",
      },
    ];
    const billing = [
      { venue_id: "lapsed-a", status: "cancelled", billing_method: "stripe", stripe_subscription_id: "sub_a" },
    ];

    mocks.from.mockImplementation((table: string) => {
      if (table === "venues") return builder({ data: venues, error: null });
      if (table === "billing_subscriptions") return builder({ data: billing, error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    const rows = await listHiddenVenues();

    expect(rows.map((r) => r.venueId)).toEqual(["lapsed-a", "lapsed-b", "admin", "sys"]);
    expect(rows[0]).toMatchObject({ classification: "lapsed", billingStatus: "cancelled", billingMethod: "stripe" });
    expect(rows[1]).toMatchObject({ classification: "lapsed", billingStatus: null });
    expect(rows[2].classification).toBe("admin-hidden");
    expect(rows[3].classification).toBe("system-room");
  });

  it("returns [] when nothing is hidden and never reads billing", async () => {
    const seen: string[] = [];
    mocks.from.mockImplementation((table: string) => {
      seen.push(table);
      if (table === "venues") return builder({ data: [], error: null });
      throw new Error(`Unexpected table ${table}`);
    });

    expect(await listHiddenVenues()).toEqual([]);
    expect(seen).toEqual(["venues"]);
  });

  it("throws when the venue read errors", async () => {
    mocks.from.mockImplementation(() => builder({ data: null, error: { message: "boom" } }));
    await expect(listHiddenVenues()).rejects.toThrow("boom");
  });
});

describe("restoreLapsedVenue", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("un-hides and clears rehidden_at, guarded to a genuine lapsed row", async () => {
    const ops: Array<{ op: string; args: unknown[] }> = [];
    let payload: unknown;
    mocks.from.mockImplementation((table: string) => {
      const b = builder({ data: [{ id: "lapsed-a" }], error: null }, (op, args) => {
        ops.push({ op, args });
        if (op === "update") payload = args[0];
      });
      return b;
    });

    const result = await restoreLapsedVenue("lapsed-a");

    expect(mocks.from).toHaveBeenCalledWith("venues");
    expect(result).toEqual({ restored: true });
    expect(payload).toEqual({ hidden: false, rehidden_at: null });
    // The guard filters that keep this off an admin-hidden venue / a system room.
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: "eq", args: ["hidden", true] },
        { op: "not", args: ["rehidden_at", "is", null] },
        { op: "not", args: ["self_serve_created_at", "is", null] },
        { op: "or", args: ["latitude.neq.0,longitude.neq.0"] },
      ])
    );
  });

  it("reports not-lapsed when the guarded update matches no row", async () => {
    mocks.from.mockImplementation(() => builder({ data: [], error: null }));
    expect(await restoreLapsedVenue("admin-hidden-venue")).toEqual({ restored: false, reason: "not-lapsed" });
  });

  it("rejects a blank id", async () => {
    await expect(restoreLapsedVenue("   ")).rejects.toThrow("Venue id is required.");
  });

  it("throws on a write error", async () => {
    mocks.from.mockImplementation(() => builder({ data: null, error: { message: "deadlock" } }));
    await expect(restoreLapsedVenue("lapsed-a")).rejects.toThrow("deadlock");
  });
});
