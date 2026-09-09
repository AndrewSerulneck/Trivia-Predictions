import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Abandoned-signup cleanup — the predicate and the teardown
 * (docs/abandoned-signup-cleanup-plan.md Phases 1 + 2).
 *
 * `lib/pendingSignup.ts` is the ONLY thing standing between a public,
 * unauthenticated signup form and a row in `auth.users` — a table shared with
 * players. "This email has no live subscription, so delete its auth user" is an
 * account-takeover vector if the predicate is even slightly loose, so the
 * assertions below are mostly a NEVER-PURGE truth table: every clause, stated as
 * a refusal, with the read-error paths pinned to fail closed.
 *
 * Phase 1 shipped untested; the plan's Phase 2 handoff says to pull this file
 * forward and land it WITH the Phase 2a supersede branch, because 2a is a
 * destructive branch in a public route. This is that file.
 */

vi.mock("server-only", () => ({}));

// `purgePendingSignup` null-checks `stripe` before cancelling incompletes; a
// truthy object is enough — the actual Stripe calls are behind the mocked
// `sweepAbandonedIncompleteSubscriptions`.
vi.mock("@/lib/stripe", () => ({ stripe: {} }));

const stripeSweep = vi.hoisted(() => ({
  fn: vi.fn(async () => ({ ok: true, cancelledSubscriptionIds: [] as string[], errors: [] as string[] })),
}));
vi.mock("@/lib/stripeIncomplete", () => ({
  sweepAbandonedIncompleteSubscriptions: stripeSweep.fn,
}));

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  /** table -> rows a select on it returns. */
  tables: {} as Record<string, Row[]>,
  /** table -> forced read error. */
  readErrors: {} as Record<string, string>,
  /** table -> forced delete error. */
  deleteErrors: {} as Record<string, string>,
  deleteUserError: null as string | null,
  /** An ordered log of every mutation, for the "Stripe first" ordering check. */
  timeline: [] as string[],
  deletedAuthUserIds: [] as string[],
}));

type QueryRecord = { table: string; op: "select" | "delete"; filters: Array<{ op: string; args: unknown[] }> };

const applyFilters = (rows: Row[], filters: Array<{ op: string; args: unknown[] }>): Row[] =>
  rows.filter((row) =>
    filters.every((filter) => {
      if (filter.op === "eq") {
        const [column, value] = filter.args as [string, unknown];
        return row[column] === value;
      }
      if (filter.op === "neq") {
        const [column, value] = filter.args as [string, unknown];
        return row[column] !== value;
      }
      if (filter.op === "in") {
        const [column, values] = filter.args as [string, unknown[]];
        return values.includes(row[column]);
      }
      return true;
    }),
  );

/** A chainable, thenable PostgREST stand-in. Supports both `.limit(1)` awaited
 *  directly (the auth guard) and `.returns()` (everything else). */
const makeBuilder = (record: QueryRecord) => {
  const settle = async () => {
    if (record.op === "delete") {
      const forced = state.deleteErrors[record.table];
      if (forced) return { data: null, error: { message: forced } };
      const existing = state.tables[record.table] ?? [];
      const doomed = new Set(applyFilters(existing, record.filters));
      state.tables[record.table] = existing.filter((row) => !doomed.has(row));
      state.timeline.push(`delete:${record.table}`);
      return { data: [], error: null };
    }
    const forced = state.readErrors[record.table];
    if (forced) return { data: null, error: { message: forced } };
    return { data: applyFilters(state.tables[record.table] ?? [], record.filters), error: null };
  };

  const builder: Record<string, unknown> = {};
  for (const op of ["eq", "neq", "in", "not", "lt", "gte", "gt", "order", "limit", "select"]) {
    builder[op] = (...args: unknown[]) => {
      record.filters.push({ op, args });
      return builder;
    };
  }
  builder.returns = () => settle();
  builder.maybeSingle = async () => {
    const result = await settle();
    if (result.error) return { data: null, error: result.error };
    return { data: (result.data as Row[])[0] ?? null, error: null };
  };
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    settle().then(resolve, reject);
  return builder;
};

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: (...selectArgs: unknown[]) =>
        makeBuilder({ table, op: "select", filters: [{ op: "select", args: selectArgs }] }),
      delete: () => makeBuilder({ table, op: "delete", filters: [] }),
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          if (state.deleteUserError) return { data: null, error: { message: state.deleteUserError } };
          state.deletedAuthUserIds.push(id);
          state.timeline.push(`deleteUser:${id}`);
          return { data: null, error: null };
        },
      },
    },
  },
}));

import {
  classifyEmailForSignup,
  findPendingSignupByEmail,
  findPendingSignupByOwnerId,
  purgePendingSignup,
} from "@/lib/pendingSignup";

const OWNER = "owner-1";
const AUTH = "auth-1";
const VENUE = "venue-1";
const EMAIL = "partner@example.com";

/** A textbook pending signup: one hidden, self-serve-stamped, located venue,
 *  no billing row ever, an auth user nobody else references. The venue carries
 *  `checkout_started_at` — the partner reached the Stripe page and bailed there
 *  — so `reachedCheckout` is true and the Stripe cancel sweep runs. The §4.1a
 *  "never reached Checkout" case clears that stamp explicitly. */
const seedPending = () => {
  state.tables.venue_owners = [
    { id: OWNER, auth_id: AUTH, email: EMAIL, created_at: "2026-09-01T00:00:00.000Z" },
  ];
  state.tables.venue_owner_venues = [{ id: "link-1", owner_id: OWNER, venue_id: VENUE }];
  state.tables.venues = [
    {
      id: VENUE,
      name: "The Dead Rabbit",
      address: null,
      street: null,
      city: null,
      state: null,
      latitude: 40.7032685,
      longitude: -74.0110218,
      hidden: true,
      self_serve_created_at: "2026-09-01T00:00:00.000Z",
      checkout_started_at: "2026-09-01T00:05:00.000Z",
    },
  ];
  state.tables.billing_subscriptions = [];
};

beforeEach(() => {
  state.tables = {};
  state.readErrors = {};
  state.deleteErrors = {};
  state.deleteUserError = null;
  state.timeline = [];
  state.deletedAuthUserIds = [];
  stripeSweep.fn.mockReset();
  stripeSweep.fn.mockImplementation(async () => ({
    ok: true,
    cancelledSubscriptionIds: [],
    errors: [],
  }));
});

describe("findPendingSignupByOwnerId — the happy path", () => {
  it("recognises a textbook pending signup", async () => {
    seedPending();
    const result = await findPendingSignupByOwnerId(OWNER);
    expect(result).toEqual({
      ok: true,
      pending: {
        ownerId: OWNER,
        authUserId: AUTH,
        venueIds: [VENUE],
        createdAt: "2026-09-01T00:00:00.000Z",
        reachedCheckout: true,
      },
    });
  });

  it("reachedCheckout is false when no linked venue is stamped (§4.1a)", async () => {
    seedPending();
    state.tables.venues[0].checkout_started_at = null;
    expect(await findPendingSignupByOwnerId(OWNER)).toMatchObject({
      ok: true,
      pending: { reachedCheckout: false },
    });
  });

  it("reachedCheckout is true when ANY linked venue is stamped", async () => {
    seedPending();
    state.tables.venues[0].checkout_started_at = null;
    state.tables.venue_owner_venues.push({ id: "link-2", owner_id: OWNER, venue_id: "venue-2" });
    state.tables.venues.push({
      ...state.tables.venues[0],
      id: "venue-2",
      checkout_started_at: "2026-09-02T00:00:00.000Z",
    });
    expect(await findPendingSignupByOwnerId(OWNER)).toMatchObject({
      ok: true,
      pending: { reachedCheckout: true },
    });
  });

  it("still pending when the owner row carries no auth user", async () => {
    seedPending();
    state.tables.venue_owners[0].auth_id = null;
    const result = await findPendingSignupByOwnerId(OWNER);
    expect(result).toMatchObject({ ok: true, pending: { authUserId: null } });
  });
});

describe("findPendingSignupByOwnerId — NEVER pending (each clause, as a refusal)", () => {
  it("no owner row at all", async () => {
    const result = await findPendingSignupByOwnerId("nobody");
    expect(result).toEqual({ ok: true, pending: null });
  });

  it("owner has no linked venue", async () => {
    seedPending();
    state.tables.venue_owner_venues = [];
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it("a linked venue row is missing", async () => {
    seedPending();
    state.tables.venues = [];
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it("a linked venue is not hidden — it has been revealed to players", async () => {
    seedPending();
    state.tables.venues[0].hidden = false;
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it("a linked venue has no self_serve_created_at — admin-activated", async () => {
    seedPending();
    state.tables.venues[0].self_serve_created_at = null;
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it("a linked venue sits at the (0, 0) placeholder — a Category Blitz global room", async () => {
    seedPending();
    state.tables.venues[0].latitude = 0;
    state.tables.venues[0].longitude = 0;
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it("the owner holds a SECOND venue that is a real live one", async () => {
    seedPending();
    state.tables.venue_owner_venues.push({ id: "link-2", owner_id: OWNER, venue_id: "live-bar" });
    state.tables.venues.push({
      id: "live-bar",
      name: "A Real Bar",
      address: null,
      street: null,
      city: null,
      state: null,
      latitude: 41,
      longitude: -73,
      hidden: false,
      self_serve_created_at: null,
    });
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it.each([
    ["cancelled", "owner_id"],
    ["active", "owner_id"],
    ["past_due", "venue_id"],
    ["incomplete", "venue_id"],
  ] as const)("has a billing_subscriptions row (status=%s, on %s) — a payer, ever", async (status, dimension) => {
    seedPending();
    state.tables.billing_subscriptions = [
      {
        id: "sub-1",
        status,
        owner_id: dimension === "owner_id" ? OWNER : "someone-else",
        venue_id: dimension === "venue_id" ? VENUE : "some-other-venue",
      },
    ];
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it.each(["accounts", "users", "category_blitz_submissions", "category_blitz_session_participants"])(
    "the auth user is referenced by a player table (%s)",
    async (table) => {
      seedPending();
      // All four of these consumers key on `auth_id` (see AUTH_USER_FK_CONSUMERS).
      state.tables[table] = [{ id: "row-1", auth_id: AUTH }];
      expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
    },
  );

  it("the auth user is referenced by a username-change ledger", async () => {
    seedPending();
    state.tables.username_change_audit = [{ id: "row-1", changed_by_auth_id: AUTH }];
    expect(await findPendingSignupByOwnerId(OWNER)).toEqual({ ok: true, pending: null });
  });

  it("the owner's OWN venue_owners row does not count as an auth reference", async () => {
    // The guard passes `ignoreVenueOwnerId`; without it, every pending signup
    // would look auth-shared with itself and never be purgeable.
    seedPending();
    const result = await findPendingSignupByOwnerId(OWNER);
    expect(result).toMatchObject({ ok: true, pending: { ownerId: OWNER } });
  });
});

describe("findPendingSignupByOwnerId — every read error fails CLOSED", () => {
  it.each([
    "venue_owners",
    "venue_owner_venues",
    "venues",
    "billing_subscriptions",
  ])("a read error on %s returns ok:false, never a pending verdict", async (table) => {
    seedPending();
    state.readErrors[table] = "connection reset";
    const result = await findPendingSignupByOwnerId(OWNER);
    expect(result.ok).toBe(false);
  });

  it("an auth-guard read error returns ok:false", async () => {
    seedPending();
    state.readErrors.username_change_attempts = "relation unavailable";
    const result = await findPendingSignupByOwnerId(OWNER);
    expect(result.ok).toBe(false);
  });
});

describe("findPendingSignupByEmail", () => {
  it("resolves the email and delegates to the by-id predicate", async () => {
    seedPending();
    expect(await findPendingSignupByEmail(EMAIL)).toMatchObject({
      ok: true,
      pending: { ownerId: OWNER },
    });
  });

  it("no owner for the email is not pending, not an error", async () => {
    expect(await findPendingSignupByEmail("stranger@example.com")).toEqual({ ok: true, pending: null });
  });

  it("a lookup failure fails closed", async () => {
    state.readErrors.venue_owners = "timeout";
    expect((await findPendingSignupByEmail(EMAIL)).ok).toBe(false);
  });
});

describe("classifyEmailForSignup — the Phase 2 discriminator", () => {
  it("no owner row => exists:false (signup proceeds)", async () => {
    expect(await classifyEmailForSignup("new@example.com")).toEqual({ ok: true, exists: false });
  });

  it("a pending signup => kind:'pending' (signup STILL proceeds, superseded at submit)", async () => {
    seedPending();
    expect(await classifyEmailForSignup(EMAIL)).toEqual({
      ok: true,
      exists: true,
      kind: "pending",
      ownerId: OWNER,
    });
  });

  it("a real account => kind:'account' (the only value that blocks a signup)", async () => {
    seedPending();
    state.tables.billing_subscriptions = [
      { id: "sub-1", status: "cancelled", owner_id: OWNER, venue_id: VENUE },
    ];
    expect(await classifyEmailForSignup(EMAIL)).toEqual({
      ok: true,
      exists: true,
      kind: "account",
      ownerId: OWNER,
    });
  });

  it("an owner-lookup failure fails closed (no kind)", async () => {
    state.readErrors.venue_owners = "timeout";
    expect((await classifyEmailForSignup(EMAIL)).ok).toBe(false);
  });

  it("a predicate read failure fails closed (no kind)", async () => {
    seedPending();
    state.readErrors.billing_subscriptions = "timeout";
    expect((await classifyEmailForSignup(EMAIL)).ok).toBe(false);
  });
});

describe("purgePendingSignup", () => {
  it("re-verifies the predicate itself and refuses a non-pending owner", async () => {
    seedPending();
    state.tables.billing_subscriptions = [
      { id: "sub-1", status: "active", owner_id: OWNER, venue_id: VENUE },
    ];
    const result = await purgePendingSignup(OWNER);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("not-pending");
    expect(state.timeline).toEqual([]);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("cancels abandoned Stripe subscriptions BEFORE deleting any row", async () => {
    seedPending();
    stripeSweep.fn.mockImplementation(async () => {
      state.timeline.push("stripe-sweep");
      return { ok: true, cancelledSubscriptionIds: [], errors: [] };
    });

    const result = await purgePendingSignup(OWNER);

    expect(result.ok).toBe(true);
    expect(stripeSweep.fn).toHaveBeenCalledWith(expect.anything(), VENUE);
    // Stripe first, then venues -> venue_owners -> auth user.
    expect(state.timeline).toEqual([
      "stripe-sweep",
      "delete:venues",
      "delete:venue_owners",
      `deleteUser:${AUTH}`,
    ]);
    expect(result).toMatchObject({
      ok: true,
      deletedVenueIds: [VENUE],
      deletedAuthUserId: AUTH,
    });
  });

  it("aborts with NOTHING deleted when the Stripe sweep fails", async () => {
    seedPending();
    stripeSweep.fn.mockImplementation(async () => ({
      ok: false,
      cancelledSubscriptionIds: [],
      errors: ["list-failed: boom"],
    }));

    const result = await purgePendingSignup(OWNER);

    expect(result.ok).toBe(false);
    expect(state.timeline).toEqual([]);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("does not delete the auth user when it is shared with a player (predicate re-check catches it)", async () => {
    seedPending();
    state.tables.users = [{ id: "player-1", auth_id: AUTH }];
    const result = await purgePendingSignup(OWNER);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("not-pending");
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  describe("§4.1a — a signup that never reached Stripe skips the cancel sweep", () => {
    it("purges even when sweepAbandonedIncompleteSubscriptions would throw", async () => {
      seedPending();
      state.tables.venues[0].checkout_started_at = null;
      stripeSweep.fn.mockImplementation(async () => {
        throw new Error("stripe list exploded");
      });

      const result = await purgePendingSignup(OWNER);

      expect(result.ok).toBe(true);
      expect(stripeSweep.fn).not.toHaveBeenCalled();
      expect(state.timeline).toEqual([
        "delete:venues",
        "delete:venue_owners",
        `deleteUser:${AUTH}`,
      ]);
      expect(result).toMatchObject({ deletedVenueIds: [VENUE], deletedAuthUserId: AUTH });
    });

    it("purges even when the sweep would report ok:false", async () => {
      seedPending();
      state.tables.venues[0].checkout_started_at = null;
      stripeSweep.fn.mockImplementation(async () => ({
        ok: false,
        cancelledSubscriptionIds: [],
        errors: ["list-failed: boom"],
      }));

      const result = await purgePendingSignup(OWNER);

      expect(result.ok).toBe(true);
      expect(stripeSweep.fn).not.toHaveBeenCalled();
    });

    it("STILL runs the sweep (and aborts on its failure) when a venue IS stamped", async () => {
      seedPending(); // seedPending stamps checkout_started_at by default
      stripeSweep.fn.mockImplementation(async () => ({
        ok: false,
        cancelledSubscriptionIds: [],
        errors: ["list-failed: boom"],
      }));

      const result = await purgePendingSignup(OWNER);

      expect(result.ok).toBe(false);
      expect(stripeSweep.fn).toHaveBeenCalledWith(expect.anything(), VENUE);
      expect(state.timeline).toEqual([]);
      expect(state.deletedAuthUserIds).toEqual([]);
    });
  });
});
