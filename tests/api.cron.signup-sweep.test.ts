import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Partner Self-Serve Signup — Phase 6. /api/cron/signup-sweep.
 *
 * Three jobs: prune the rate-limit ledger, sweep abandoned self-serve venues,
 * reconcile orphaned auth users. The last two ship LOG-ONLY behind their own env
 * flags, and the assertions below are mostly about what the sweep REFUSES to
 * touch, because every mistake here is an irreversible delete.
 *
 * The sharpest one, and it is not in the plan text: `lib/auth.ts`'s
 * signInAnonymously() (three call sites in components/join/JoinFlow.tsx) mints an
 * EMAILLESS auth.users row for every anonymous player visit. A visitor who never
 * finishes joining a venue never gets an `accounts` or `users` row, so they are
 * an orphan by the seven-table test and they are a PLAYER. Production carried 768
 * such orphans on 2026-09-07, 765 of them emailless. The email filter is the only
 * thing standing between the first enabled run and 765 deleted player sessions.
 */

type Row = Record<string, unknown>;

type QueryRecord = {
  table: string;
  op: "select" | "delete";
  filters: Array<{ op: string; args: unknown[] }>;
};

const state = vi.hoisted(() => ({
  /** table -> rows returned by a select on it. */
  tables: {} as Record<string, Row[]>,
  /** table -> forced error on read. */
  readErrors: {} as Record<string, string>,
  deleteErrors: {} as Record<string, string>,
  authUsers: [] as Array<{ id: string; email: string | null; created_at: string }>,
  listUsersError: null as string | null,
  deletedAuthUserIds: [] as string[],
  deleteUserError: null as string | null,
  queries: [] as QueryRecord[],
  deletes: [] as Array<{ table: string; filters: Array<{ op: string; args: unknown[] }> }>,
}));

/** A chainable, thenable PostgREST stand-in that records what it was asked. */
const makeBuilder = (record: QueryRecord, rows: () => Row[]) => {
  const settle = async () => {
    if (record.op === "delete") {
      const forced = state.deleteErrors[record.table];
      if (forced) return { data: null, error: { message: forced } };
      state.deletes.push({ table: record.table, filters: record.filters });
      // Actually remove the rows, so the sweep's own follow-up reads (does this
      // owner still hold a venue?) see the world it just changed. Without this the
      // "delete the owner too" branch is unreachable in a test.
      const existing = state.tables[record.table] ?? [];
      const doomed = new Set(applyFilters(existing, record.filters));
      state.tables[record.table] = existing.filter((row) => !doomed.has(row));
      if (record.table === "venues") {
        // Model the real ON DELETE CASCADE on every venue_id FK
        // (tests/lib.venue-fk-cascade-guard.test.ts proves none is RESTRICT). The
        // sweep depends on it: it reads a venue's owners BEFORE the delete
        // precisely because the link rows go with it.
        const gone = new Set(Array.from(doomed, (row) => row.id));
        for (const dependent of ["venue_owner_venues", "billing_subscriptions"]) {
          state.tables[dependent] = (state.tables[dependent] ?? []).filter(
            (row) => !gone.has(row.venue_id as string)
          );
        }
      }
      return { data: [], error: null };
    }
    const forced = state.readErrors[record.table];
    if (forced) return { data: null, error: { message: forced } };
    return { data: rows(), error: null };
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

/**
 * Applies the recorded `eq`/`in` filters to the fixture rows so the sweep's own
 * narrowing (owner links, subscription lookups, per-table FK checks) behaves like
 * a database rather than always returning everything.
 */
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
    })
  );

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: (...selectArgs: unknown[]) => {
        const record: QueryRecord = { table, op: "select", filters: [{ op: "select", args: selectArgs }] };
        state.queries.push(record);
        return makeBuilder(record, () => applyFilters(state.tables[table] ?? [], record.filters));
      },
      delete: () => {
        const record: QueryRecord = { table, op: "delete", filters: [] };
        state.queries.push(record);
        return makeBuilder(record, () => []);
      },
    }),
    auth: {
      admin: {
        listUsers: async ({ page }: { page: number; perPage: number }) => {
          if (state.listUsersError) return { data: null, error: { message: state.listUsersError } };
          return { data: { users: page === 1 ? state.authUsers : [] }, error: null };
        },
        deleteUser: async (id: string) => {
          if (state.deleteUserError) return { data: null, error: { message: state.deleteUserError } };
          state.deletedAuthUserIds.push(id);
          return { data: null, error: null };
        },
      },
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  pruneSignupAttempts: vi.fn(async () => 7),
}));

import { GET, POST } from "@/app/api/cron/signup-sweep/route";
import { AUTH_USER_FK_CONSUMERS, SWEEP_ABANDON_AFTER_DAYS } from "@/lib/signupSweep";

const CRON_SECRET = "cron-secret-for-tests";

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const cronRequest = (query = "") =>
  new Request(`http://localhost/api/cron/signup-sweep${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });

type SweepBody = {
  ok: boolean;
  attemptsPruned?: number;
  venues?: {
    dryRun: boolean;
    candidates: number;
    deleted: number;
    abortedOverCap: boolean;
    errors: string[];
    venues: Array<{ venueId: string; ownerIdsDeleted: string[]; authUserIdsDeleted: string[]; ownerIdsKept: string[] }>;
  };
  orphans?: {
    dryRun: boolean;
    candidates: number;
    deleted: number;
    candidateEmails: string[];
    abortedOverCap: boolean;
    errors: string[];
  };
};

const run = async (query = ""): Promise<SweepBody> => (await POST(cronRequest(query))).json();

/** One abandoned self-serve venue with one owner, wired end to end. */
const seedAbandonedVenue = () => {
  state.tables.venues = [
    {
      id: "dead-bar",
      name: "Dead Bar",
      hidden: true,
      self_serve_created_at: daysAgo(SWEEP_ABANDON_AFTER_DAYS + 1),
    },
  ];
  state.tables.venue_owner_venues = [{ id: "link-1", owner_id: "owner-1", venue_id: "dead-bar" }];
  state.tables.venue_owners = [{ id: "owner-1", auth_id: "auth-1" }];
  state.tables.billing_subscriptions = [];
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  state.tables = {};
  state.readErrors = {};
  state.deleteErrors = {};
  state.authUsers = [];
  state.listUsersError = null;
  state.deletedAuthUserIds = [];
  state.deleteUserError = null;
  state.queries = [];
  state.deletes = [];
});

describe("/api/cron/signup-sweep — the gate", () => {
  it("rejects an unauthorized request", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/signup-sweep", { method: "POST" })
    );
    expect(response.status).toBe(401);
  });

  it("rejects when CRON_SECRET is unset — fails closed", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await POST(cronRequest());
    expect(response.status).toBe(401);
  });

  it("accepts GET with the same gate", async () => {
    const response = await GET(cronRequest());
    expect(response.status).toBe(200);
  });

  it("is NOT gated on NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED — debris outlives the flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED", "");
    const body = await run();
    expect(body.ok).toBe(true);
  });
});

describe("/api/cron/signup-sweep — signup_attempts pruning", () => {
  it("always prunes the rate-limit ledger, even with both delete flags off", async () => {
    const body = await run();
    expect(body.attemptsPruned).toBe(7);
  });
});

describe("/api/cron/signup-sweep — abandoned venue sweep", () => {
  it("reports candidates but deletes nothing while SIGNUP_SWEEP_DELETE_ENABLED is unset", async () => {
    seedAbandonedVenue();
    const body = await run();

    expect(body.venues?.dryRun).toBe(true);
    expect(body.venues?.candidates).toBe(1);
    expect(body.venues?.deleted).toBe(0);
    expect(state.deletes).toHaveLength(0);
  });

  it("deletes venue, owner and auth user in that order once enabled", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();

    const body = await run();

    expect(body.venues?.deleted).toBe(1);
    // Order matches unwind() in app/api/owner/signup/route.ts.
    expect(state.deletes.map((d) => d.table)).toEqual(["venues", "venue_owners"]);
    expect(state.deletedAuthUserIds).toEqual(["auth-1"]);
    expect(body.venues?.venues[0].ownerIdsDeleted).toEqual(["owner-1"]);
  });

  it("only ever deletes the candidate venue by id", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    await run();

    const venueDelete = state.deletes.find((d) => d.table === "venues");
    expect(venueDelete?.filters).toContainEqual({ op: "eq", args: ["id", "dead-bar"] });
  });

  it("REFUSES a venue with no self_serve_created_at stamp — that is the Category Blitz global rooms", async () => {
    // Production's only hidden venues are `category-blitz-global-room` and
    // `hc-cbz-live`, both stamp-null (verified 2026-09-07). The predicate is
    // asserted on the query, because a fixture cannot prove a filter exists.
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    await run();

    const venueScan = state.queries.find((q) => q.table === "venues" && q.op === "select");
    expect(venueScan?.filters).toContainEqual({ op: "eq", args: ["hidden", true] });
    expect(venueScan?.filters).toContainEqual({ op: "not", args: ["self_serve_created_at", "is", null] });
  });

  it("REFUSES a venue that has a billing_subscriptions row — a payer, past or present", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    // A cancelled subscriber KEEPS its row, which is exactly why the predicate is
    // "has no row" and not "has an active row".
    state.tables.billing_subscriptions = [
      { id: "sub-1", venue_id: "dead-bar", owner_id: "owner-1", status: "cancelled" },
    ];

    const body = await run();

    expect(body.venues?.candidates).toBe(0);
    expect(state.deletes).toHaveLength(0);
  });

  it("KEEPS an owner who still holds another venue", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    state.tables.venue_owner_venues.push({ id: "link-2", owner_id: "owner-1", venue_id: "live-bar" });

    const body = await run();

    expect(body.venues?.deleted).toBe(1);
    expect(body.venues?.venues[0].ownerIdsKept).toEqual(["owner-1"]);
    expect(state.deletes.map((d) => d.table)).toEqual(["venues"]);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("KEEPS an owner who still has a subscription of their own", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    state.tables.billing_subscriptions = [
      { id: "sub-1", venue_id: "other-bar", owner_id: "owner-1", status: "active" },
    ];

    const body = await run();

    expect(body.venues?.venues[0].ownerIdsKept).toEqual(["owner-1"]);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("KEEPS the auth user when it is shared with a PLAYER row", async () => {
    // A partner who also plays at their own bar. Deleting this auth user would
    // SET NULL their players row — silently, with no error.
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    state.tables.users = [{ id: "player-1", auth_id: "auth-1" }];

    const body = await run();

    expect(body.venues?.venues[0].ownerIdsDeleted).toEqual(["owner-1"]);
    expect(body.venues?.venues[0].authUserIdsDeleted).toEqual([]);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("KEEPS the auth user when a CASCADE table references it", async () => {
    // category_blitz_submissions is ON DELETE CASCADE — deleting this auth user
    // would delete that player's gameplay outright, not merely detach it.
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    state.tables.category_blitz_submissions = [{ id: "sub-x", auth_id: "auth-1" }];

    await run();

    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("KEEPS the auth user when the FK guard cannot be read — fails closed", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    state.readErrors.username_change_audit = "relation unavailable";

    const body = await run();

    expect(state.deletedAuthUserIds).toEqual([]);
    expect(body.venues?.errors.join(" ")).toContain("auth-guard-failed");
  });

  it("does nothing when the billing exclusion read fails — fails closed", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();
    state.readErrors.billing_subscriptions = "timeout";

    const body = await run();

    expect(state.deletes).toHaveLength(0);
    expect(body.venues?.errors.join(" ")).toContain("billing-read-failed");
  });

  it("?dryRun=1 overrides the enabled flag", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedAbandonedVenue();

    const body = await run("?dryRun=1");

    expect(body.venues?.dryRun).toBe(true);
    expect(state.deletes).toHaveLength(0);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  // Finding #8: the dry run used to return before the owner classification ran, so
  // it ALWAYS reported every owner kept and no auth users touched — a preview that
  // could not show the destructive half of the two-flag split. It must now project
  // the SAME split the live run produces, without deleting anything.
  describe("dry-run fidelity (Finding #8)", () => {
    it("projects the owner AND auth-user deletion, deleting nothing", async () => {
      seedAbandonedVenue();

      const body = await run(); // flag unset -> dry run

      expect(body.venues?.dryRun).toBe(true);
      expect(body.venues?.venues[0].ownerIdsDeleted).toEqual(["owner-1"]);
      expect(body.venues?.venues[0].authUserIdsDeleted).toEqual(["auth-1"]);
      expect(body.venues?.venues[0].ownerIdsKept).toEqual([]);
      // ...and still touched nothing.
      expect(state.deletes).toHaveLength(0);
      expect(state.deletedAuthUserIds).toEqual([]);
    });

    it("projects an owner KEPT when they still hold another venue", async () => {
      seedAbandonedVenue();
      state.tables.venue_owner_venues.push({ id: "link-2", owner_id: "owner-1", venue_id: "live-bar" });

      const body = await run();

      expect(body.venues?.venues[0].ownerIdsKept).toEqual(["owner-1"]);
      expect(body.venues?.venues[0].ownerIdsDeleted).toEqual([]);
      expect(body.venues?.venues[0].authUserIdsDeleted).toEqual([]);
      expect(state.deletes).toHaveLength(0);
    });

    it("projects an owner KEPT when they still have a subscription of their own", async () => {
      seedAbandonedVenue();
      state.tables.billing_subscriptions = [
        { id: "sub-1", venue_id: "other-bar", owner_id: "owner-1", status: "active" },
      ];

      const body = await run();

      expect(body.venues?.venues[0].ownerIdsKept).toEqual(["owner-1"]);
      expect(body.venues?.venues[0].ownerIdsDeleted).toEqual([]);
    });

    it("projects the owner deleted but the auth user KEPT when it is shared with a PLAYER row", async () => {
      seedAbandonedVenue();
      state.tables.users = [{ id: "player-1", auth_id: "auth-1" }];

      const body = await run();

      expect(body.venues?.venues[0].ownerIdsDeleted).toEqual(["owner-1"]);
      expect(body.venues?.venues[0].authUserIdsDeleted).toEqual([]);
      expect(body.venues?.venues[0].ownerIdsKept).toEqual([]);
      expect(state.deletedAuthUserIds).toEqual([]);
    });

    it("projects the same split a live run produces — dry then live, one seed", async () => {
      seedAbandonedVenue();
      state.tables.users = [{ id: "player-1", auth_id: "auth-1" }]; // auth user is shared

      const dry = await run(); // flag unset -> dry run
      const projected = dry.venues?.venues[0];

      // Now actually run it against the same world.
      vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
      const live = await run();
      const actual = live.venues?.venues[0];

      expect(projected?.ownerIdsDeleted).toEqual(actual?.ownerIdsDeleted);
      expect(projected?.authUserIdsDeleted).toEqual(actual?.authUserIdsDeleted);
      expect(projected?.ownerIdsKept).toEqual(actual?.ownerIdsKept);
    });

    it("surfaces a fail-closed auth-guard read error in the dry run too", async () => {
      seedAbandonedVenue();
      state.readErrors.username_change_audit = "relation unavailable";

      const body = await run();

      // Guard unreadable -> owner still projected for deletion, auth user not.
      expect(body.venues?.venues[0].ownerIdsDeleted).toEqual(["owner-1"]);
      expect(body.venues?.venues[0].authUserIdsDeleted).toEqual([]);
      expect(body.venues?.errors.join(" ")).toContain("auth-guard-failed");
      expect(state.deletes).toHaveLength(0);
    });
  });
});

describe("/api/cron/signup-sweep — orphaned auth user reconciliation", () => {
  const seedOrphan = (email: string | null, createdAt = hoursAgo(48)) => {
    state.authUsers = [{ id: "auth-orphan", email, created_at: createdAt }];
  };

  it("NEVER considers an emailless auth user — those are anonymous PLAYER sessions", async () => {
    // The single most important assertion in this file. lib/auth.ts's
    // signInAnonymously() creates these for every anonymous visit; production had
    // 765 of them on 2026-09-07 and all are orphans by the seven-table test.
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    seedOrphan(null);

    const body = await run();

    expect(body.orphans?.candidates).toBe(0);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("NEVER considers a reserved/non-routable domain — fixtures and backfill artifacts", async () => {
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    state.authUsers = [
      { id: "a", email: "sim-cb-legacy-8dc0992c@example.invalid", created_at: hoursAgo(48) },
      { id: "b", email: "backfill_abc@tp-auth-backfill.internal", created_at: hoursAgo(48) },
      { id: "c", email: "someone@fixtures.test", created_at: hoursAgo(48) },
    ];

    const body = await run();

    expect(body.orphans?.candidates).toBe(0);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("NEVER considers an auth user younger than 24h — it may be mid-signup", async () => {
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    seedOrphan("fresh@example.com", hoursAgo(2));

    const body = await run();

    expect(body.orphans?.candidates).toBe(0);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("reports but does not delete while SIGNUP_SWEEP_AUTH_DELETE_ENABLED is unset", async () => {
    seedOrphan("wedged@example.com");

    const body = await run();

    expect(body.orphans?.dryRun).toBe(true);
    expect(body.orphans?.candidates).toBe(1);
    expect(body.orphans?.candidateEmails).toEqual(["wedged@example.com"]);
    expect(body.orphans?.deleted).toBe(0);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("deletes a genuine orphan once enabled", async () => {
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    seedOrphan("wedged@example.com");

    const body = await run();

    expect(body.orphans?.deleted).toBe(1);
    expect(state.deletedAuthUserIds).toEqual(["auth-orphan"]);
  });

  it.each(AUTH_USER_FK_CONSUMERS.map((c) => [c.table, c.column] as const))(
    "KEEPS an auth user referenced by %s",
    async (table, column) => {
      vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
      seedOrphan("wedged@example.com");
      state.tables[table] = [{ id: "row-1", [column]: "auth-orphan" }];

      const body = await run();

      expect(body.orphans?.candidates).toBe(0);
      expect(state.deletedAuthUserIds).toEqual([]);
    }
  );

  it("checks ALL SEVEN FK tables, not just venue_owners", async () => {
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    seedOrphan("wedged@example.com");
    await run();

    const scanned = new Set(
      state.queries.filter((q) => q.op === "select" && q.filters.some((f) => f.op === "in")).map((q) => q.table)
    );
    for (const { table } of AUTH_USER_FK_CONSUMERS) expect(scanned).toContain(table);
  });

  it("deletes NOTHING when the candidate set blows past the cap", async () => {
    // The circuit breaker. A large candidate set means some code path is minting
    // emailed auth users this sweep does not understand — fail loud, not clever.
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    state.authUsers = Array.from({ length: 30 }, (_, i) => ({
      id: `auth-${i}`,
      email: `partner${i}@example.com`,
      created_at: hoursAgo(48),
    }));

    const body = await run();

    expect(body.orphans?.abortedOverCap).toBe(true);
    expect(body.orphans?.deleted).toBe(0);
    expect(state.deletedAuthUserIds).toEqual([]);
    expect(body.orphans?.errors.join(" ")).toContain("orphan-count-over-cap");
  });

  it("deletes nothing when an FK table cannot be read — fails closed", async () => {
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    seedOrphan("wedged@example.com");
    state.readErrors.category_blitz_session_participants = "timeout";

    const body = await run();

    expect(body.orphans?.deleted).toBe(0);
    expect(state.deletedAuthUserIds).toEqual([]);
    expect(body.orphans?.errors.join(" ")).toContain("fk-read-failed");
  });

  it("deletes nothing when listUsers fails", async () => {
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    state.listUsersError = "service unavailable";

    const body = await run();

    expect(body.orphans?.candidates).toBe(0);
    expect(body.orphans?.errors.join(" ")).toContain("list-users-failed");
  });

  it("?dryRun=1 overrides the enabled flag", async () => {
    vi.stubEnv("SIGNUP_SWEEP_AUTH_DELETE_ENABLED", "1");
    seedOrphan("wedged@example.com");

    const body = await run("?dryRun=1");

    expect(body.orphans?.dryRun).toBe(true);
    expect(body.orphans?.candidates).toBe(1);
    expect(state.deletedAuthUserIds).toEqual([]);
  });

  it("the two delete flags are independent — the venue flag does not enable auth deletion", async () => {
    vi.stubEnv("SIGNUP_SWEEP_DELETE_ENABLED", "1");
    seedOrphan("wedged@example.com");

    const body = await run();

    expect(body.venues?.dryRun).toBe(false);
    expect(body.orphans?.dryRun).toBe(true);
    expect(state.deletedAuthUserIds).toEqual([]);
  });
});
