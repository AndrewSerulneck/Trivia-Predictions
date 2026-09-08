import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Finding #3 — the reveal-repair job in /api/cron/billing.
 *
 * docs/self-serve-signup-review-fixes-plan.md §3 Phase 3. `maybeRevealVenue` in
 * the Stripe webhook fires on exactly one event and swallows its error by
 * design, so one transient Supabase blip left a paying $100/mo partner
 * permanently invisible to every player. Nothing detected it: the signup sweep
 * skips the row (it has a billing row) and no reconciler existed.
 *
 * What this file pins:
 *   - a hidden, self-serve, paying venue gets revealed, under BOTH the
 *     `hidden = true` idempotence guard and the `self_serve_created_at` scan;
 *   - `past_due` is revealed too — dunning is not a reason to go dark;
 *   - a cancelled / unpaid / admin-hidden / (0, 0) venue is left alone;
 *   - a billing read failure reveals NOTHING (fail closed);
 *   - `?dryRun=1` writes nothing;
 *   - the offline-expiry sweep still runs and is unaffected either way.
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

    const arg = (op: string, index: number): unknown =>
      chain.filters.find((f) => f.op === op)?.args[index];
    const eqValue = (column: string): unknown =>
      chain.filters.find((f) => f.op === "eq" && f.args[0] === column)?.args[1];

    const settle = async () => {
      // The offline-grant expiry sweep — untouched by this phase.
      if (table === "billing_subscriptions" && chain.update) return { data: [], error: null };

      if (table === "billing_subscriptions") {
        if (state.billingReadError) return { data: null, error: state.billingReadError };
        const ids = (arg("in", 1) ?? []) as string[];
        return { data: state.billing.filter((row) => ids.includes(row.venue_id)), error: null };
      }

      if (table === "venues" && !chain.update) {
        if (state.venueReadError) return { data: null, error: state.venueReadError };
        // Mirror the scan's own predicate so the module cannot "pass" by
        // omitting a filter: hidden = true AND the stamp is not null.
        const wantsHidden = eqValue("hidden") === true;
        const wantsStamped = chain.filters.some(
          (f) => f.op === "not" && f.args[0] === "self_serve_created_at"
        );
        return {
          data: state.venues.filter(
            (row) =>
              (!wantsHidden || row.hidden === true) &&
              (!wantsStamped || row.self_serve_created_at !== null)
          ),
          error: null,
        };
      }

      // venues UPDATE — returns the rows it actually changed.
      if (state.venueUpdateError) return { data: null, error: state.venueUpdateError };
      const id = eqValue("id");
      const target = state.venues.find((row) => row.id === id);
      if (!target || (eqValue("hidden") === true && target.hidden !== true)) {
        return { data: [], error: null };
      }
      target.hidden = false;
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
import { REVEAL_MAX_PER_RUN, type VenueRevealRepairResult } from "@/lib/venueVisibilitySync";

const originalCronSecret = process.env.CRON_SECRET;

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
    venueReveal: VenueRevealRepairResult;
  };
  return { response, body };
};

const paidVenue = (over: Partial<VenueRow> = {}): VenueRow => ({
  id: "the-corner-tap",
  hidden: true,
  latitude: 41.8781,
  longitude: -87.6298,
  self_serve_created_at: "2026-09-01T12:00:00.000Z",
  ...over,
});

const liveBilling = (over: Partial<BillingRow> = {}): BillingRow => ({
  venue_id: "the-corner-tap",
  status: "active",
  stripe_subscription_id: "sub_123",
  billing_method: "stripe",
  ...over,
});

describe("/api/cron/billing — venue reveal repair (Finding #3)", () => {
  beforeEach(() => {
    state.venues = [];
    state.billing = [];
    state.venueReadError = null;
    state.billingReadError = null;
    state.venueUpdateError = null;
    state.chains.length = 0;
    process.env.CRON_SECRET = "top-secret";
  });

  afterAll(() => {
    if (typeof originalCronSecret === "string") process.env.CRON_SECRET = originalCronSecret;
    else delete process.env.CRON_SECRET;
  });

  it("reveals a hidden self-serve venue whose subscription is live", async () => {
    state.venues = [paidVenue()];
    state.billing = [liveBilling()];

    const { response, body } = await run();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.venueReveal.revealed).toBe(1);
    expect(body.venueReveal.venueIds).toEqual(["the-corner-tap"]);
    expect(state.venues[0].hidden).toBe(false);

    // The write re-asserts hidden = true, so a webhook that wins the race makes
    // this a no-op rather than a second write. It also clears `rehidden_at` —
    // whatever un-hides a venue clears the stamp (Phase 9), no exceptions.
    const write = state.chains.find((c) => c.table === "venues" && c.update);
    expect(write?.update).toEqual({ hidden: false, rehidden_at: null });
    expect(write?.filters).toEqual(
      expect.arrayContaining([{ op: "eq", args: ["hidden", true] }])
    );
  });

  it("reveals a past_due venue — a card in dunning is still a paying customer", async () => {
    state.venues = [paidVenue()];
    state.billing = [liveBilling({ status: "past_due" })];

    const { body } = await run();
    expect(body.venueReveal.revealed).toBe(1);
  });

  it("leaves an unpaid abandoned signup hidden", async () => {
    state.venues = [paidVenue()];
    state.billing = [];

    const { body } = await run();
    expect(body.venueReveal.scanned).toBe(1);
    expect(body.venueReveal.candidates).toBe(0);
    expect(state.venues[0].hidden).toBe(true);
    expect(state.chains.some((c) => c.table === "venues" && c.update)).toBe(false);
  });

  it("leaves a cancelled subscriber hidden (that is Phase 9's job, and it is flagged off)", async () => {
    state.venues = [paidVenue()];
    state.billing = [liveBilling({ status: "cancelled" })];

    const { body } = await run();
    expect(body.venueReveal.revealed).toBe(0);
    expect(state.venues[0].hidden).toBe(true);
  });

  /**
   * The scan itself excludes stamp-null rows, so an admin-hidden venue never
   * even reaches the predicate. Both locks are asserted: the row is not scanned,
   * AND nothing is written.
   */
  it("never touches an admin-hidden venue, even one with a live subscription", async () => {
    state.venues = [paidVenue({ id: "admin-hidden-bar", self_serve_created_at: null })];
    state.billing = [liveBilling({ venue_id: "admin-hidden-bar" })];

    const { body } = await run();
    expect(body.venueReveal.scanned).toBe(0);
    expect(body.venueReveal.revealed).toBe(0);
    expect(state.venues[0].hidden).toBe(true);
  });

  it("never reveals a (0, 0) placeholder room, even mis-stamped and paying", async () => {
    // hc-cbz-live is the Category Blitz global room. Publishing it would put an
    // internal pooling room in every player's venue list.
    state.venues = [
      paidVenue({ id: "hc-cbz-live", latitude: 0, longitude: 0, self_serve_created_at: "2026-09-01T12:00:00.000Z" }),
    ];
    state.billing = [liveBilling({ venue_id: "hc-cbz-live" })];

    const { body } = await run();
    expect(body.venueReveal.scanned).toBe(1);
    expect(body.venueReveal.candidates).toBe(0);
    expect(state.venues[0].hidden).toBe(true);
  });

  it("fails closed when the billing read errors — reveals nothing", async () => {
    state.venues = [paidVenue()];
    state.billing = [liveBilling()];
    state.billingReadError = { message: "connection reset" };

    const { body } = await run();
    expect(body.venueReveal.revealed).toBe(0);
    expect(body.venueReveal.errors).toEqual(["billing-read-failed: connection reset"]);
    expect(state.venues[0].hidden).toBe(true);
  });

  it("fails closed when the venue read errors", async () => {
    state.venueReadError = { message: "timeout" };

    const { body } = await run();
    expect(body.venueReveal.errors).toEqual(["venues-read-failed: timeout"]);
  });

  it("reports a failed reveal instead of throwing, and keeps going", async () => {
    state.venues = [paidVenue(), paidVenue({ id: "second-bar" })];
    state.billing = [liveBilling(), liveBilling({ venue_id: "second-bar" })];
    state.venueUpdateError = { message: "deadlock detected" };

    const { response, body } = await run();
    expect(response.status).toBe(200);
    expect(body.venueReveal.revealed).toBe(0);
    expect(body.venueReveal.errors).toHaveLength(2);
    expect(body.venueReveal.errors[0]).toContain("venue-reveal-failed venue=the-corner-tap");
  });

  it("?dryRun=1 reports the candidates and writes nothing", async () => {
    state.venues = [paidVenue()];
    state.billing = [liveBilling()];

    const { body } = await run("?dryRun=1");
    expect(body.venueReveal.dryRun).toBe(true);
    expect(body.venueReveal.candidates).toBe(1);
    expect(body.venueReveal.revealed).toBe(0);
    expect(body.venueReveal.venueIds).toEqual(["the-corner-tap"]);
    expect(state.venues[0].hidden).toBe(true);
    expect(state.chains.some((c) => c.table === "venues" && c.update)).toBe(false);
  });

  it("defers candidates past the per-run cap instead of dropping them", async () => {
    const count = REVEAL_MAX_PER_RUN + 3;
    state.venues = Array.from({ length: count }, (_, i) => paidVenue({ id: `bar-${i}` }));
    state.billing = state.venues.map((v) => liveBilling({ venue_id: v.id }));

    const { body } = await run();
    expect(body.venueReveal.candidates).toBe(count);
    expect(body.venueReveal.revealed).toBe(REVEAL_MAX_PER_RUN);
    expect(body.venueReveal.deferred).toBe(3);
    // The deferred rows are still hidden, and a second run drains them — a
    // revealed venue leaves the candidate scan.
    const second = await run();
    expect(second.body.venueReveal.revealed).toBe(3);
    expect(state.venues.every((v) => v.hidden === false)).toBe(true);
  });

  it("still runs the offline-expiry sweep, and the sweep is unaffected by dryRun", async () => {
    state.venues = [paidVenue()];
    state.billing = [liveBilling()];

    const { body } = await run("?dryRun=1");
    expect(body.ok).toBe(true);
    expect(body.offlineExpired).toBe(0);
    expect(state.chains.some((c) => c.table === "billing_subscriptions" && c.update)).toBe(true);
  });

  it("rejects an unauthorized caller before doing anything", async () => {
    const response = await POST(new Request("http://localhost/api/cron/billing", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(state.chains).toHaveLength(0);
  });
});
