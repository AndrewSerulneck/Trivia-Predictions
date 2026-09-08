import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 9 — the lapsed-venue reconcile jobs in /api/cron/billing
 * (docs/lapsed-venue-rehide-plan.md Phases 3–5, sequenced as Phase 9 of
 * docs/self-serve-signup-review-fixes-plan.md).
 *
 * `reconcileLapsedVenues` runs three jobs: RESTORE a venue we hid once billing
 * is live again, RE-HIDE a self-serve venue whose subscription lapsed, and
 * REPORT (never touch) lapsed admin-activated venues.
 *
 * What this file pins:
 *   - flag OFF (the default) = restore + re-hide run in DRY-RUN: they log what
 *     they would do and write nothing; the report still runs;
 *   - flag ON: a lapsed self-serve venue is hidden and stamped `rehidden_at`;
 *   - `past_due` / `active` are NOT hidden — a card in dunning and a scheduled
 *     cancellation are Stripe's semantics, left alone;
 *   - an admin-activated (stamp-null) or (0,0) venue is never auto-hidden — the
 *     admin one lands in the report instead;
 *   - a venue we hid is restored (and un-stamped) once billing goes live;
 *   - an admin-hidden venue (no `rehidden_at`) is never restored;
 *   - a billing read failure acts on NOTHING (fail closed);
 *   - the re-hide job ABORTS over its per-run cap rather than hiding a pile;
 *   - `?dryRun=1` writes nothing even with the flag on;
 *   - a reconciler fault never fails the cron.
 */

type Chain = {
  table: string;
  update?: Record<string, unknown>;
  filters: Array<{ op: string; args: unknown[] }>;
};

type VenueRow = {
  id: string;
  hidden: boolean;
  latitude: number;
  longitude: number;
  self_serve_created_at: string | null;
  rehidden_at: string | null;
};

type BillingRow = {
  venue_id: string;
  status: string;
  stripe_subscription_id: string | null;
  billing_method: string;
};

const state = vi.hoisted(() => ({
  venues: [] as VenueRow[],
  billing: [] as BillingRow[],
  venueReadError: null as { message: string } | null,
  billingReadError: null as { message: string } | null,
  venueUpdateError: null as { message: string } | null,
  chains: [] as Chain[],
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const isPlaceholder = (v: VenueRow) => v.latitude === 0 && v.longitude === 0;

  const makeBuilder = (table: string) => {
    const chain: Chain = { table, filters: [] };
    state.chains.push(chain);
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "not", "in", "lte", "lt", "gte", "order", "limit", "or"]) {
      builder[op] = (...args: unknown[]) => {
        chain.filters.push({ op, args });
        return builder;
      };
    }
    builder.update = (payload: Record<string, unknown>) => {
      chain.update = payload;
      return builder;
    };

    const has = (op: string, pred: (args: unknown[]) => boolean) =>
      chain.filters.some((f) => f.op === op && pred(f.args));
    const eqValue = (column: string): unknown =>
      chain.filters.find((f) => f.op === "eq" && f.args[0] === column)?.args[1];
    const inValues = (column: string): string[] | undefined =>
      chain.filters.find((f) => f.op === "in" && f.args[0] === column)?.args[1] as string[] | undefined;

    const matchesVenueScan = (v: VenueRow): boolean => {
      const hiddenEq = eqValue("hidden");
      if (typeof hiddenEq === "boolean" && v.hidden !== hiddenEq) return false;
      if (has("not", (a) => a[0] === "self_serve_created_at" && a[1] === "is" && a[2] === null)) {
        if (v.self_serve_created_at === null) return false;
      }
      if (has("not", (a) => a[0] === "rehidden_at" && a[1] === "is" && a[2] === null)) {
        if (v.rehidden_at === null) return false;
      }
      if (has("or", (a) => a[0] === "latitude.neq.0,longitude.neq.0")) {
        if (isPlaceholder(v)) return false;
      }
      const ids = inValues("id");
      if (ids && !ids.includes(v.id)) return false;
      return true;
    };

    const settle = async () => {
      // The offline-grant expiry sweep — untouched by this phase.
      if (table === "billing_subscriptions" && chain.update) return { data: [], error: null };

      if (table === "billing_subscriptions") {
        if (state.billingReadError) return { data: null, error: state.billingReadError };
        const ids = inValues("venue_id");
        const rows = ids
          ? state.billing.filter((row) => ids.includes(row.venue_id))
          : state.billing; // the report's full scan has a .limit() but no .in()
        return { data: rows, error: null };
      }

      if (table === "venues" && !chain.update) {
        if (state.venueReadError) return { data: null, error: state.venueReadError };
        return { data: state.venues.filter(matchesVenueScan), error: null };
      }

      // venues UPDATE — returns the rows it actually changed.
      if (state.venueUpdateError) return { data: null, error: state.venueUpdateError };
      const id = eqValue("id");
      const target = state.venues.find((row) => row.id === id);
      if (!target) return { data: [], error: null };
      const hiddenEq = eqValue("hidden");
      if (typeof hiddenEq === "boolean" && target.hidden !== hiddenEq) return { data: [], error: null };
      if (
        has("not", (a) => a[0] === "self_serve_created_at" && a[1] === "is" && a[2] === null) &&
        target.self_serve_created_at === null
      ) {
        return { data: [], error: null };
      }
      if (has("or", (a) => a[0] === "latitude.neq.0,longitude.neq.0") && isPlaceholder(target)) {
        return { data: [], error: null };
      }
      target.hidden = chain.update!.hidden as boolean;
      if ("rehidden_at" in chain.update!) target.rehidden_at = chain.update!.rehidden_at as string | null;
      return { data: [{ id: target.id }], error: null };
    };

    builder.returns = () => settle();
    builder.then = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
      settle().then(resolve, reject);
    return builder;
  };

  return { supabaseAdmin: { from: vi.fn((table: string) => makeBuilder(table)) } };
});

import { POST } from "@/app/api/cron/billing/route";
import { REHIDE_MAX_PER_RUN, type LapsedVenueReconcileResult } from "@/lib/venueVisibilitySync";

const originalCronSecret = process.env.CRON_SECRET;
const originalRehideFlag = process.env.VENUE_REHIDE_ENABLED;

const authedRequest = (query = "") =>
  new Request(`http://localhost/api/cron/billing${query}`, {
    method: "POST",
    headers: { Authorization: "Bearer top-secret" },
  });

const run = async (query = "") => {
  const response = await POST(authedRequest(query));
  const body = (await response.json()) as {
    ok: boolean;
    offlineExpired: number;
    venueRehide: LapsedVenueReconcileResult;
  };
  return { response, body };
};

const venue = (over: Partial<VenueRow> = {}): VenueRow => ({
  id: "the-corner-tap",
  hidden: false,
  latitude: 41.8781,
  longitude: -87.6298,
  self_serve_created_at: "2026-09-01T12:00:00.000Z",
  rehidden_at: null,
  ...over,
});

const billing = (over: Partial<BillingRow> = {}): BillingRow => ({
  venue_id: "the-corner-tap",
  status: "cancelled",
  stripe_subscription_id: "sub_123",
  billing_method: "stripe",
  ...over,
});

const venueWrites = () => state.chains.filter((c) => c.table === "venues" && c.update);

describe("/api/cron/billing — lapsed venue reconcile (Phase 9)", () => {
  beforeEach(() => {
    state.venues = [];
    state.billing = [];
    state.venueReadError = null;
    state.billingReadError = null;
    state.venueUpdateError = null;
    state.chains.length = 0;
    process.env.CRON_SECRET = "top-secret";
    delete process.env.VENUE_REHIDE_ENABLED;
  });

  afterAll(() => {
    if (typeof originalCronSecret === "string") process.env.CRON_SECRET = originalCronSecret;
    else delete process.env.CRON_SECRET;
    if (typeof originalRehideFlag === "string") process.env.VENUE_REHIDE_ENABLED = originalRehideFlag;
    else delete process.env.VENUE_REHIDE_ENABLED;
  });

  describe("the flag", () => {
    it("off (default): re-hide runs in dry-run — reports the candidate, writes nothing", async () => {
      state.venues = [venue()];
      state.billing = [billing()];

      const { body } = await run();

      expect(body.venueRehide.enabled).toBe(false);
      expect(body.venueRehide.wrote).toBe(false);
      expect(body.venueRehide.rehide.candidates).toBe(1);
      expect(body.venueRehide.rehide.changed).toBe(0);
      expect(body.venueRehide.rehide.venueIds).toEqual(["the-corner-tap"]);
      expect(state.venues[0].hidden).toBe(false);
      expect(venueWrites()).toHaveLength(0);
    });

    it("on: hides the lapsed self-serve venue and stamps rehidden_at", async () => {
      process.env.VENUE_REHIDE_ENABLED = "1";
      state.venues = [venue()];
      state.billing = [billing()];

      const { body } = await run();

      expect(body.venueRehide.enabled).toBe(true);
      expect(body.venueRehide.wrote).toBe(true);
      expect(body.venueRehide.rehide.changed).toBe(1);
      expect(state.venues[0].hidden).toBe(true);
      expect(typeof state.venues[0].rehidden_at).toBe("string");

      const write = venueWrites()[0];
      expect(write.update?.hidden).toBe(true);
      expect(typeof write.update?.rehidden_at).toBe("string");
      expect(write.filters).toEqual(
        expect.arrayContaining([
          { op: "eq", args: ["hidden", false] },
          { op: "not", args: ["self_serve_created_at", "is", null] },
          { op: "or", args: ["latitude.neq.0,longitude.neq.0"] },
        ])
      );
    });
  });

  describe("what re-hide leaves alone (flag on)", () => {
    beforeEach(() => {
      process.env.VENUE_REHIDE_ENABLED = "1";
    });

    it("does not hide a past_due venue — a card in dunning is still live", async () => {
      state.venues = [venue()];
      state.billing = [billing({ status: "past_due" })];

      const { body } = await run();
      expect(body.venueRehide.rehide.candidates).toBe(0);
      expect(state.venues[0].hidden).toBe(false);
    });

    it("does not hide an active venue (a scheduled cancellation is still active)", async () => {
      state.venues = [venue()];
      state.billing = [billing({ status: "active" })];

      const { body } = await run();
      expect(body.venueRehide.rehide.candidates).toBe(0);
    });

    it("does not hide an expired OFFLINE grant — that is an ops decision, reported only", async () => {
      state.venues = [venue()];
      state.billing = [billing({ billing_method: "offline", stripe_subscription_id: null })];

      const { body } = await run();
      expect(body.venueRehide.rehide.candidates).toBe(0);
    });

    it("never hides an admin-activated (stamp-null) venue — it goes to the report", async () => {
      state.venues = [venue({ id: "admin-bar", self_serve_created_at: null })];
      state.billing = [billing({ venue_id: "admin-bar" })];

      const { body } = await run();
      expect(body.venueRehide.rehide.candidates).toBe(0);
      expect(body.venueRehide.report.lapsed).toBe(1);
      expect(body.venueRehide.report.venueIds).toEqual(["admin-bar"]);
      expect(venueWrites()).toHaveLength(0);
    });

    it("never hides a (0,0) placeholder even if stamped and lapsed", async () => {
      state.venues = [venue({ id: "hc-cbz-live", latitude: 0, longitude: 0 })];
      state.billing = [billing({ venue_id: "hc-cbz-live" })];

      const { body } = await run();
      expect(body.venueRehide.rehide.candidates).toBe(0);
      expect(state.venues[0].hidden).toBe(false);
    });
  });

  describe("restore (flag on)", () => {
    beforeEach(() => {
      process.env.VENUE_REHIDE_ENABLED = "1";
    });

    it("restores a venue WE hid once its billing is live again, clearing rehidden_at", async () => {
      state.venues = [venue({ hidden: true, rehidden_at: "2026-09-05T00:00:00.000Z" })];
      state.billing = [billing({ status: "active" })];

      const { body } = await run();

      expect(body.venueRehide.restore.changed).toBe(1);
      expect(state.venues[0].hidden).toBe(false);
      expect(state.venues[0].rehidden_at).toBeNull();

      const write = venueWrites().find((c) => c.update?.hidden === false);
      expect(write?.update).toEqual({ hidden: false, rehidden_at: null });
      expect(write?.filters).toEqual(
        expect.arrayContaining([
          { op: "not", args: ["self_serve_created_at", "is", null] },
          { op: "or", args: ["latitude.neq.0,longitude.neq.0"] },
        ])
      );
    });

    it("never restores an admin-hidden venue (rehidden_at is null)", async () => {
      state.venues = [venue({ hidden: true, self_serve_created_at: null, rehidden_at: null })];
      state.billing = [billing({ status: "active" })];

      const { body } = await run();
      expect(body.venueRehide.restore.candidates).toBe(0);
      expect(state.venues[0].hidden).toBe(true);
    });

    it("does not restore while billing is still not live", async () => {
      state.venues = [venue({ hidden: true, rehidden_at: "2026-09-05T00:00:00.000Z" })];
      state.billing = [billing({ status: "cancelled" })];

      const { body } = await run();
      expect(body.venueRehide.restore.candidates).toBe(0);
      expect(state.venues[0].hidden).toBe(true);
    });
  });

  describe("the report always runs", () => {
    it("counts lapsed admin-activated venues even with the flag off, and writes nothing", async () => {
      state.venues = [venue({ id: "admin-bar", hidden: false, self_serve_created_at: null })];
      state.billing = [billing({ venue_id: "admin-bar" })];

      const { body } = await run();
      expect(body.venueRehide.enabled).toBe(false);
      expect(body.venueRehide.report.lapsed).toBe(1);
      expect(venueWrites()).toHaveLength(0);
    });

    it("does not report an admin venue that is already hidden", async () => {
      state.venues = [venue({ id: "admin-bar", hidden: true, self_serve_created_at: null })];
      state.billing = [billing({ venue_id: "admin-bar" })];

      const { body } = await run();
      expect(body.venueRehide.report.lapsed).toBe(0);
    });
  });

  describe("failure handling", () => {
    it("fails closed when the billing read errors — acts on nothing", async () => {
      process.env.VENUE_REHIDE_ENABLED = "1";
      state.venues = [venue()];
      state.billing = [billing()];
      state.billingReadError = { message: "connection reset" };

      const { response, body } = await run();
      expect(response.status).toBe(200);
      expect(body.venueRehide.rehide.changed).toBe(0);
      expect(body.venueRehide.restore.changed).toBe(0);
      expect(state.venues[0].hidden).toBe(false);
      expect(body.venueRehide.rehide.errors.join(" ")).toContain("billing-read-failed");
    });

    it("aborts the re-hide job over its per-run cap instead of hiding a pile", async () => {
      process.env.VENUE_REHIDE_ENABLED = "1";
      const count = REHIDE_MAX_PER_RUN + 1;
      state.venues = Array.from({ length: count }, (_, i) => venue({ id: `bar-${i}` }));
      state.billing = state.venues.map((v) => billing({ venue_id: v.id }));

      const { body } = await run();
      expect(body.venueRehide.rehide.abortedOverCap).toBe(true);
      expect(body.venueRehide.rehide.changed).toBe(0);
      expect(body.venueRehide.rehide.errors.join(" ")).toContain("over-cap");
      expect(venueWrites()).toHaveLength(0);
      expect(state.venues.every((v) => v.hidden === false)).toBe(true);
    });

    it("reports a failed re-hide write and keeps going", async () => {
      process.env.VENUE_REHIDE_ENABLED = "1";
      state.venues = [venue(), venue({ id: "second-bar" })];
      state.billing = [billing(), billing({ venue_id: "second-bar" })];
      state.venueUpdateError = { message: "deadlock detected" };

      const { response, body } = await run();
      expect(response.status).toBe(200);
      expect(body.venueRehide.rehide.changed).toBe(0);
      expect(body.venueRehide.rehide.errors).toHaveLength(2);
      expect(body.venueRehide.rehide.errors[0]).toContain("rehide-failed venue=");
    });

    it("?dryRun=1 writes nothing even with the flag on", async () => {
      process.env.VENUE_REHIDE_ENABLED = "1";
      state.venues = [venue()];
      state.billing = [billing()];

      const { body } = await run("?dryRun=1");
      expect(body.venueRehide.dryRun).toBe(true);
      expect(body.venueRehide.wrote).toBe(false);
      expect(body.venueRehide.rehide.candidates).toBe(1);
      expect(body.venueRehide.rehide.changed).toBe(0);
      expect(venueWrites()).toHaveLength(0);
    });

    it("rejects an unauthorized caller before doing anything", async () => {
      const response = await POST(new Request("http://localhost/api/cron/billing", { method: "POST" }));
      expect(response.status).toBe(401);
      expect(state.chains).toHaveLength(0);
    });
  });
});
