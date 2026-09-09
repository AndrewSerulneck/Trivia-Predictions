import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OWNER_EMAIL_TAKEN_MESSAGE } from "@/lib/ownerEmailAvailability";

/**
 * Partner Self-Serve Signup — Phase 5, POST /api/owner/signup
 * (docs/partner-self-serve-signup-plan.md §4 Phase 5).
 *
 * This route creates a Supabase auth user, a `venue_owners` row, a `venues` row
 * and a `venue_owner_venues` row with NO cross-table transaction. Every unwind
 * path is therefore hand-written, and every one of them is exercised here —
 * that is the whole reason this file exists. The other half is the duplicate /
 * claim resolution, where the interesting case is not the happy claim but the
 * attacker-supplied `claimVenueId` pointing at a venue nowhere near the pin.
 */

vi.mock("server-only", () => ({}));

type VenueRow = {
  id: string;
  name: string | null;
  address: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  hidden: boolean;
  /** Non-null = this flow created the row. See lib/venueClaim.ts. */
  self_serve_created_at: string | null;
};

const mocks = vi.hoisted(() => ({
  // --- rate limiter ledger --------------------------------------------------
  /** Attempts already inside the signupSubmit window when the test starts. */
  attempts: [] as Array<{ created_at: string }>,
  /**
   * Every `claim_signup_attempt` RPC call and what it answered. The quota
   * decision moved into Postgres in review-fix Phase 2 (Finding #6), so an
   * "it spent a rate-limit slot" assertion reads this, not an INSERT.
   */
  rateLimitClaims: [] as Array<{ params: Record<string, unknown>; allowed: boolean }>,
  // --- table fixtures -------------------------------------------------------
  venues: [] as Array<Record<string, unknown>>,
  links: [] as Array<{ venue_id: string }>,
  existingOwner: null as { id: string; auth_id?: string | null; created_at?: string } | null,
  // --- pending-signup predicate (lib/pendingSignup.ts, reached via
  //     classifyEmailForSignup when `existingOwner` is set) ------------------
  /** venue_owner_venues rows for the existing owner, by owner_id. Empty (the
   *  default) means "no linked venue" -> not pending -> kind: "account". */
  pendingLinks: [] as Array<{ venue_id: string }>,
  /** venues rows the predicate's `.in("id", …)` read returns. */
  pendingVenues: [] as Array<Record<string, unknown>>,
  /** billing_subscriptions rows for the owner/venue. Any row -> not pending. */
  pendingBilling: [] as Array<Record<string, unknown>>,
  // --- injected failures ----------------------------------------------------
  ownerLookupError: null as { message: string } | null,
  ownerInsertError: null as { message: string } | null,
  linkInsertError: null as { message: string; code?: string } | null,
  venueScanError: null as { message: string } | null,
  // --- recorders ------------------------------------------------------------
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string; filters: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; filters: Record<string, unknown>; payload: Record<string, unknown> }>,
  venueScanBounds: {} as Record<string, unknown>,
  /** Phase 5a §4: the proximity scan must be ordered, not an arbitrary 200. */
  venueScanOrder: null as { column: string; ascending: boolean } | null,
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  createAdminVenue: vi.fn(),
}));

type Ctx = {
  table: string;
  mode: "select" | "insert" | "update" | "delete";
  filters: Record<string, unknown>;
  payload: Record<string, unknown> | null;
};

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };

/** Just enough of the PostgREST builder for the chains this route actually uses. */
type Builder = {
  select: () => Builder;
  order: (column: string, options?: { ascending?: boolean }) => Builder;
  eq: (column: string, value: unknown) => Builder;
  neq: (column: string, value: unknown) => Builder;
  in: (column: string, values: unknown[]) => Builder;
  not: (column: string, operator: string, value: unknown) => Builder;
  gte: (column: string, value: unknown) => Builder;
  lte: (column: string, value: unknown) => Builder;
  insert: (payload: Record<string, unknown>) => Builder;
  update: (payload: Record<string, unknown>) => Builder;
  delete: () => Builder;
  /** Chainable AND thenable: `await q.limit(1)` and `q.limit(1).returns()` both work. */
  limit: () => Builder;
  returns: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  /** `.delete().eq(...)` and a bare `.insert(...)` are awaited with no terminal call. */
  then: <T>(onOk: (result: QueryResult) => T, onErr?: (reason: unknown) => T) => Promise<T>;
};

function resolveQuery(ctx: Ctx): QueryResult {
  if (ctx.mode === "delete") {
    mocks.deletes.push({ table: ctx.table, filters: { ...ctx.filters } });
    return { data: [], error: null };
  }
  if (ctx.mode === "update") {
    mocks.updates.push({ table: ctx.table, filters: { ...ctx.filters }, payload: ctx.payload ?? {} });
    return { data: [], error: null };
  }

  switch (ctx.table) {
    case "signup_attempts":
      return ctx.mode === "insert" ? { data: null, error: null } : { data: mocks.attempts, error: null };

    case "venue_owners":
      if (ctx.mode === "insert") {
        return mocks.ownerInsertError
          ? { data: null, error: mocks.ownerInsertError }
          : { data: { id: "owner-1" }, error: null };
      }
      // The auth.users FK guard (lib/signupSweep.ts) checks venue_owners by
      // auth_id, with the pending owner's own row excluded via .neq — model that
      // as "no other owner references this auth user".
      if (ctx.filters.auth_id !== undefined) return { data: [], error: null };
      return mocks.ownerLookupError
        ? { data: null, error: mocks.ownerLookupError }
        : { data: mocks.existingOwner, error: null };

    case "billing_subscriptions":
      return { data: mocks.pendingBilling, error: null };

    // The pending-signup predicate's auth-guard reference checks — none of these
    // reference the auth user in this suite's fixtures.
    case "accounts":
    case "users":
    case "username_change_attempts":
    case "username_change_audit":
    case "category_blitz_submissions":
    case "category_blitz_session_participants":
      return { data: [], error: null };

    case "venues": {
      if (mocks.venueScanError) return { data: null, error: mocks.venueScanError };
      // The pending-signup predicate reads venues with `.in("id", venueIds)`.
      if (Array.isArray(ctx.filters.id)) {
        return { data: mocks.pendingVenues, error: null };
      }
      if (typeof ctx.filters.id === "string") {
        return { data: mocks.venues.find((row) => row.id === ctx.filters.id) ?? null, error: null };
      }
      // Proximity scan. The mock hands back every fixture and lets the route's
      // own haversine filter do the work — the bounding box is asserted
      // separately via `venueScanBounds`.
      return { data: mocks.venues, error: null };
    }

    case "venue_owner_venues":
      if (ctx.mode === "insert") {
        return mocks.linkInsertError ? { data: null, error: mocks.linkInsertError } : { data: null, error: null };
      }
      // The pending-signup predicate reads this by owner_id; the route's own
      // `venueHasOwner` reads it by venue_id.
      if (ctx.filters.owner_id !== undefined) {
        return { data: mocks.pendingLinks, error: null };
      }
      return { data: mocks.links.filter((link) => link.venue_id === ctx.filters.venue_id), error: null };

    default:
      throw new Error(`Unexpected table: ${ctx.table}`);
  }
}

function builderFor(table: string): Builder {
  const ctx: Ctx = { table, mode: "select", filters: {}, payload: null };
  const settle = () => Promise.resolve(resolveQuery(ctx));
  const builder: Builder = {
    select: () => builder,
    order: (column: string, options?: { ascending?: boolean }) => {
      if (table === "venues") {
        mocks.venueScanOrder = { column, ascending: options?.ascending !== false };
      }
      return builder;
    },
    eq: (column: string, value: unknown) => {
      ctx.filters[column] = value;
      return builder;
    },
    neq: () => builder,
    in: (column: string, values: unknown[]) => {
      ctx.filters[column] = values;
      return builder;
    },
    not: () => builder,
    gte: (column: string, value: unknown) => {
      if (table === "venues") mocks.venueScanBounds[`gte:${column}`] = value;
      ctx.filters[column] = value;
      return builder;
    },
    lte: (column: string, value: unknown) => {
      if (table === "venues") mocks.venueScanBounds[`lte:${column}`] = value;
      return builder;
    },
    insert: (payload: Record<string, unknown>) => {
      ctx.mode = "insert";
      ctx.payload = payload;
      mocks.inserts.push({ table, payload });
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      ctx.mode = "update";
      ctx.payload = payload;
      return builder;
    },
    delete: () => {
      ctx.mode = "delete";
      return builder;
    },
    limit: () => builder,
    returns: settle,
    maybeSingle: settle,
    single: settle,
    then: (onOk, onErr) => settle().then(onOk, onErr),
  };
  return builder;
}

/**
 * Stand-in for the `claim_signup_attempt` RPC (migration
 * 20260908120000_signup_attempt_atomic_rate_limit.sql).
 *
 * It decides against the SEEDED window only and does not accumulate its own
 * claims — several cases below drive more than `signupSubmit.max` POSTs inside
 * one `it` to sweep a table of invalid inputs, and a limiter that counted them
 * would turn those 400s into 429s. The limiter's own accumulation, window and
 * atomicity are covered where they belong, in
 * tests/api.signup.rate-limit.test.ts. This file only cares THAT a slot was
 * claimed, which `mocks.rateLimitClaims` records.
 */
function claimSignupAttempt(params: Record<string, unknown>): { allowed: boolean; retry_after_seconds: number } {
  const windowSeconds = Math.max(1, Number(params.p_window_seconds));
  const max = Math.max(1, Number(params.p_max));
  const allowed = mocks.attempts.length < max;
  mocks.rateLimitClaims.push({ params, allowed });
  return { allowed, retry_after_seconds: allowed ? 0 : windowSeconds };
}

vi.mock("@/lib/supabaseAdmin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {
    from: (table: string) => builderFor(table),
    rpc: (fn: string, params: Record<string, unknown>) => {
      if (fn !== "claim_signup_attempt") throw new Error(`Unexpected rpc: ${fn}`);
      return Promise.resolve({ data: [claimSignupAttempt(params)], error: null });
    },
    auth: {
      admin: {
        createUser: (...args: unknown[]) => mocks.createUser(...args),
        deleteUser: (...args: unknown[]) => mocks.deleteUser(...args),
      },
    },
  },
}));

// Mocked so the unwind branches can be driven, and so this test does not pull
// lib/admin's fs/Stripe/Polymarket import graph. The real function's new
// `hidden` / `selfServeCreatedAt` inputs are covered by
// tests/lib.admin.create-venue-self-serve.test.ts.
vi.mock("@/lib/admin", () => ({
  createAdminVenue: (...args: unknown[]) => mocks.createAdminVenue(...args),
}));

// docs/abandoned-signup-cleanup-plan.md Phase 2a: a pending-signup collision is
// superseded by `purgePendingSignup`, which cancels abandoned Stripe objects
// first. Stub that so this suite never reaches a real Stripe client.
vi.mock("@/lib/stripeIncomplete", () => ({
  sweepAbandonedIncompleteSubscriptions: vi.fn(async () => ({
    ok: true,
    cancelledSubscriptionIds: [],
    errors: [],
  })),
}));

const ORIGINAL_ENV = { ...process.env };

// Denver. VENUE_A sits at the pin; NEAR is ~50 m away (a duplicate); FAR is
// ~5 km away (not one).
const PIN = { latitude: 39.7392, longitude: -104.9903 };
const NEAR = { latitude: PIN.latitude + 0.00045, longitude: PIN.longitude };
const FAR = { latitude: PIN.latitude + 0.045, longitude: PIN.longitude };

/**
 * A hidden fixture defaults to SELF-SERVE provenance — "somebody else's
 * abandoned signup", which is what every hidden case in this file means. A
 * hidden row with a null stamp is an admin-created venue and is refused
 * outright; that case lives in tests/api.owner.signup.claim-guard.test.ts.
 */
const THREE_WEEKS_AGO = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();

const venueFixture = (
  id: string,
  coords: { latitude: number; longitude: number },
  hidden = false,
  selfServeCreatedAt: string | null = hidden ? THREE_WEEKS_AGO : null
): VenueRow => ({
  id,
  name: `${id} Tavern`,
  address: `1 Main St, Denver, CO`,
  street: "1 Main St",
  city: "Denver",
  state: "CO",
  latitude: coords.latitude,
  longitude: coords.longitude,
  hidden,
  self_serve_created_at: selfServeCreatedAt,
});

const VALID_BODY = {
  name: "Dana Fitzgerald",
  email: "dana@example.com",
  password: "correct-horse",
  venueName: "The Anchor",
  street: "1 Main St",
  city: "Denver",
  state: "CO",
  zipCode: "80202",
  placeId: "place-123",
  latitude: PIN.latitude,
  longitude: PIN.longitude,
  radius: 150,
};

const post = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/owner/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });

const load = async () => (await import("@/app/api/owner/signup/route")).POST;

const insertsTo = (table: string) => mocks.inserts.filter((entry) => entry.table === table);
const deletesTo = (table: string) => mocks.deletes.filter((entry) => entry.table === table);
const updatesTo = (table: string) => mocks.updates.filter((entry) => entry.table === table);

beforeEach(() => {
  vi.resetModules();
  mocks.attempts = [];
  mocks.rateLimitClaims = [];
  mocks.venues = [];
  mocks.links = [];
  mocks.existingOwner = null;
  mocks.pendingLinks = [];
  mocks.pendingVenues = [];
  mocks.pendingBilling = [];
  mocks.ownerLookupError = null;
  mocks.ownerInsertError = null;
  mocks.linkInsertError = null;
  mocks.venueScanError = null;
  mocks.inserts = [];
  mocks.deletes = [];
  mocks.updates = [];
  mocks.venueScanBounds = {};
  mocks.venueScanOrder = null;
  mocks.createUser.mockReset().mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
  mocks.deleteUser.mockReset().mockResolvedValue({ error: null });
  mocks.createAdminVenue.mockReset().mockResolvedValue({ id: "venue-the-anchor", name: "The Anchor" });

  process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED = "true";
  process.env.SESSION_SECRET = "test-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("gates", () => {
  it("404s when the flag is off, before any Supabase or account work", async () => {
    delete process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED;
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(404);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.inserts).toHaveLength(0);
  });

  it("429s once the signupSubmit window is full, and creates nothing", async () => {
    const { SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");
    mocks.attempts = Array.from({ length: SIGNUP_RATE_LIMITS.signupSubmit.max }, () => ({
      created_at: new Date(Date.now() - 60_000).toISOString(),
    }));

    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
    // Denied by the INNER (identity) bucket, which is checked first — so the
    // outer IP bucket was never consulted and spent nothing. §4.1b.
    expect(mocks.rateLimitClaims).toHaveLength(1);
  });

  it("spends two buckets — identity first, then IP — and keys the first on the email (§4.1b)", async () => {
    const { SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");
    const POST = await load();

    await POST(post(VALID_BODY));
    expect(mocks.rateLimitClaims).toHaveLength(2);
    expect(mocks.rateLimitClaims[0].params).toMatchObject({
      p_max: SIGNUP_RATE_LIMITS.signupSubmit.max,
    });
    expect(mocks.rateLimitClaims[1].params).toMatchObject({
      p_max: SIGNUP_RATE_LIMITS.signupSubmitIp.max,
    });

    // Same IP, different email → a different inner key but the SAME outer key.
    // The first half is why a fumbling partner cannot lock out their colleague;
    // the second is why varying the email cannot escape the limiter.
    const first = mocks.rateLimitClaims.slice();
    mocks.rateLimitClaims = [];
    await POST(post({ ...VALID_BODY, email: "someone.else@bar.test" }));

    expect(mocks.rateLimitClaims[0].params.p_ip_hash).not.toBe(first[0].params.p_ip_hash);
    expect(mocks.rateLimitClaims[1].params.p_ip_hash).toBe(first[1].params.p_ip_hash);
  });
});

describe("validation", () => {
  it("rejects a radius outside 50–200 m — the bound createAdminVenue does not enforce", async () => {
    const POST = await load();

    for (const radius of [30, 500]) {
      const response = await POST(post({ ...VALID_BODY, radius }));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: expect.stringContaining("50") });
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rejects a missing pin, a bad email and a blank venue name with the step's own message", async () => {
    const POST = await load();

    const noPin = await POST(post({ ...VALID_BODY, latitude: null, longitude: null }));
    expect(noPin.status).toBe(400);

    const badEmail = await POST(post({ ...VALID_BODY, email: "dana@" }));
    expect(badEmail.status).toBe(400);
    await expect(badEmail.json()).resolves.toMatchObject({ error: expect.stringContaining("email") });

    const noName = await POST(post({ ...VALID_BODY, venueName: "   " }));
    expect(noName.status).toBe(400);

    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rejects a venue name with no letters or digits (createAdminVenue could not build an id)", async () => {
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, venueName: "!!! ---" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("letter or number") });
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric latitude rather than smuggling NaN into the distance math", async () => {
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, latitude: "39.7392abc" }));

    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("existing account", () => {
  /** Seed a pending-signup collision (docs/abandoned-signup-cleanup-plan.md
   *  Phase 1's predicate): an owner row, one hidden self-serve venue, no billing
   *  row ever. `classifyEmailForSignup` classifies this `kind: "pending"`. */
  const seedPendingCollision = () => {
    mocks.existingOwner = {
      id: "owner-pending",
      auth_id: "auth-pending",
      created_at: "2026-09-01T00:00:00.000Z",
    };
    mocks.pendingLinks = [{ venue_id: "venue-pending" }];
    mocks.pendingVenues = [
      {
        id: "venue-pending",
        name: null,
        address: null,
        street: null,
        city: null,
        state: null,
        latitude: 40.7,
        longitude: -74,
        hidden: true,
        self_serve_created_at: "2026-09-01T00:00:00.000Z",
      },
    ];
    mocks.pendingBilling = [];
  };

  it("409s with code email_taken for a REAL account (paid, ever paid, or admin-activated)", async () => {
    mocks.existingOwner = { id: "owner-existing" };
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.code).toBe("email_taken");
    // The message is the one exported by lib/ownerEmailAvailability.ts, shared
    // with the step-2 pre-check so the two can never phrase it differently.
    expect(payload.error).toBe(OWNER_EMAIL_TAKEN_MESSAGE);
    // It tells the partner to sign in. The LINK is no longer smuggled into this
    // string as a raw path — EmailStep renders a real "Sign in to your account"
    // control beside the field instead, which is reachable by thumb.
    expect(payload.error).toMatch(/sign in/i);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("tells the truth about an ORPHANED auth user instead of sending them to sign in", async () => {
    // Phase 5a §1. Reaching this branch means the venue_owners-by-email
    // pre-check found nothing and Supabase still says the email is taken — so
    // this auth user has no owner profile and /owner/login WILL 401. Pointing
    // them at sign-in would be a provably false instruction and a dead end.
    mocks.createUser.mockResolvedValue({ data: null, error: { message: "User already registered" } });
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(409);
    const payload = await response.json();
    // The code is KEPT so the client needs no change; only the copy differs.
    expect(payload.code).toBe("email_taken");
    expect(payload.error).not.toContain("/owner/login");
    expect(payload.error).toContain("partnerships@hightopchallenge.com");
    expect(insertsTo("venue_owners")).toHaveLength(0);
    // The one thing this branch must NEVER do: adopt, delete or reset a
    // pre-existing auth.users row. It may belong to a PLAYER.
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("SUPERSEDES a pending-signup collision: purges it, then creates the new account", async () => {
    // Phase 2a. A returning partner types the same email; there is no 409 and no
    // branch shown to them. The old debris is destroyed synchronously first.
    seedPendingCollision();
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.code).toBeUndefined();

    // The pending signup was torn down: its venue, its owner row, its auth user.
    expect(deletesTo("venues")).toContainEqual({ table: "venues", filters: { id: "venue-pending" } });
    expect(deletesTo("venue_owners")).toContainEqual({
      table: "venue_owners",
      filters: { id: "owner-pending" },
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-pending");

    // ...and the new signup went through.
    expect(mocks.createUser).toHaveBeenCalled();
    expect(insertsTo("venue_owners")).toHaveLength(1);
  });

  it("a pending owner that ALSO has a billing row is a real account — 409s, never purged", async () => {
    // The billing row is the durable "has ever paid" proof; it flips the
    // classification from pending to account even though the venue is still
    // hidden. Nothing is torn down.
    seedPendingCollision();
    mocks.pendingBilling = [
      { id: "sub-1", status: "active", owner_id: "owner-pending", venue_id: "venue-pending" },
    ];
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "email_taken" });
    expect(deletesTo("venues")).toHaveLength(0);
    expect(deletesTo("venue_owners")).toHaveLength(0);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("duplicate venues", () => {
  it("409s venue_available for an unowned venue within 150 m, creating nothing", async () => {
    mocks.venues = [venueFixture("venue-anchor", NEAR)];
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "venue_available",
      venue: { id: "venue-anchor", name: "venue-anchor Tavern", address: "1 Main St, Denver, CO" },
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
  });

  it("409s venue_claimed when that venue already has an owner", async () => {
    mocks.venues = [venueFixture("venue-anchor", NEAR)];
    mocks.links = [{ venue_id: "venue-anchor" }];
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "venue_claimed" });
  });

  it("creates a new venue when the nearest existing one is kilometres away", async () => {
    mocks.venues = [venueFixture("venue-far", FAR)];
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(200);
    expect(mocks.createAdminVenue).toHaveBeenCalledTimes(1);
  });

  it("skips coordinate-less and (0, 0) placeholder rows such as the Category Blitz global room", async () => {
    mocks.venues = [
      { ...venueFixture("hc-cbz-live", { latitude: 0, longitude: 0 }) },
      { ...venueFixture("venue-no-coords", PIN), latitude: null, longitude: null },
    ];
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(200);
    expect(mocks.createAdminVenue).toHaveBeenCalledTimes(1);
  });

  it("bounds the proximity scan by latitude in the query, not only in JS", async () => {
    const POST = await load();
    await POST(post(VALID_BODY));

    const low = Number(mocks.venueScanBounds["gte:latitude"]);
    const high = Number(mocks.venueScanBounds["lte:latitude"]);
    expect(low).toBeLessThan(PIN.latitude);
    expect(high).toBeGreaterThan(PIN.latitude);
    // The box must be a superset of the 150 m circle, never a subset.
    expect((high - low) * 111_320).toBeGreaterThanOrEqual(300);
  });
});

describe("claiming an existing venue", () => {
  it("links to the existing row instead of creating one, and never re-hides it", async () => {
    mocks.venues = [venueFixture("venue-anchor", NEAR)];
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-anchor" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, venueId: "venue-anchor" });
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
    expect(insertsTo("venue_owner_venues")[0]?.payload).toMatchObject({ venue_id: "venue-anchor" });
    // A live venue must not be touched by a claim.
    expect(deletesTo("venues")).toHaveLength(0);
  });

  it("REFUSES a claimVenueId that is not at the submitted pin", async () => {
    // The whole attack: post any venue id in the product and become its owner.
    mocks.venues = [venueFixture("venue-far", FAR)];
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-far" }));

    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(insertsTo("venue_owner_venues")).toHaveLength(0);
  });

  it("restarts the unpaid clock when the claimed venue is HIDDEN", async () => {
    // Someone else's abandoned signup from three weeks ago. Inheriting its
    // stamp would let Phase 6's 7-day sweep delete this partner's venue while
    // they are still on the Stripe Checkout page.
    mocks.venues = [venueFixture("venue-anchor", NEAR, true)];
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-anchor" }));

    expect(response.status).toBe(200);
    const stamp = updatesTo("venues")[0];
    expect(stamp?.filters).toMatchObject({ id: "venue-anchor" });
    expect(typeof stamp?.payload.self_serve_created_at).toBe("string");
    // The clock is restarted, never the visibility.
    expect(stamp?.payload).not.toHaveProperty("hidden");
  });

  it("never stamps or hides a LIVE venue that is claimed", async () => {
    mocks.venues = [venueFixture("venue-anchor", NEAR, false)];
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-anchor" }));

    expect(response.status).toBe(200);
    // Stamping a live venue would hand Phase 6's sweep an admin-created one.
    expect(updatesTo("venues")).toHaveLength(0);
  });

  it("does not stamp when the link failed and the claim was unwound", async () => {
    mocks.venues = [venueFixture("venue-anchor", NEAR, true)];
    mocks.linkInsertError = { message: "fk violation" };
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-anchor" }));

    expect(response.status).toBe(500);
    // The row must keep its original stamp so it stays sweepable.
    expect(updatesTo("venues")).toHaveLength(0);
  });

  it("409s venue_claimed if someone else claimed it between the two POSTs", async () => {
    mocks.venues = [venueFixture("venue-anchor", NEAR)];
    mocks.links = [{ venue_id: "venue-anchor" }];
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-anchor" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "venue_claimed" });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("400s a claimVenueId for a venue that no longer exists", async () => {
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-gone" }));

    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("happy path", () => {
  it("creates user → owner → hidden stamped venue → link, and signs the partner in", async () => {
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, venueId: "venue-the-anchor" });

    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "dana@example.com",
      password: "correct-horse",
      email_confirm: true,
    });
    expect(insertsTo("venue_owners")[0]?.payload).toMatchObject({
      auth_id: "auth-1",
      email: "dana@example.com",
      name: "Dana Fitzgerald",
    });
    expect(insertsTo("venue_owner_venues")[0]?.payload).toMatchObject({
      owner_id: "owner-1",
      venue_id: "venue-the-anchor",
    });

    // The owner session cookie is what makes /owner/billing/setup reachable on
    // the very next navigation.
    expect(response.headers.get("Set-Cookie")).toContain("tp_owner_sess=");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("creates the venue hidden AND stamped, in one insert", async () => {
    const POST = await load();
    await POST(post(VALID_BODY));

    const input = mocks.createAdminVenue.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.hidden).toBe(true);
    // Phase 6's sweep keys off this; without it the row is unreapable and the
    // webhook will never reveal it.
    expect(typeof input.selfServeCreatedAt).toBe("string");
    expect(Number.isFinite(Date.parse(String(input.selfServeCreatedAt)))).toBe(true);
  });

  it("sets country server-side from DEFAULT_VENUE_COUNTRY and never from the body", async () => {
    const { DEFAULT_VENUE_COUNTRY } = await import("@/lib/adminVenueForm");
    const POST = await load();
    await POST(post({ ...VALID_BODY, country: "Cascadia" }));

    const input = mocks.createAdminVenue.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.country).toBe(DEFAULT_VENUE_COUNTRY);
  });

  it("normalizes email and state, and TRIMS the password so /owner/auth/login can match it", async () => {
    const POST = await load();
    await POST(post({ ...VALID_BODY, email: "  Dana@Example.COM ", state: "co", password: "  hunter2hunter2  " }));

    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dana@example.com", password: "hunter2hunter2" })
    );
    const input = mocks.createAdminVenue.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input.state).toBe("CO");
  });
});

describe("unwind", () => {
  it("deletes the auth user when the owner row fails", async () => {
    mocks.ownerInsertError = { message: "duplicate key" };
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(500);
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-1");
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
  });

  it("deletes the owner row and the auth user when the venue insert throws", async () => {
    mocks.createAdminVenue.mockRejectedValue(new Error("Failed to create venue."));
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(500);
    expect(deletesTo("venue_owners")[0]?.filters).toMatchObject({ id: "owner-1" });
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-1");
    expect(deletesTo("venues")).toHaveLength(0);
  });

  it("deletes the venue, the owner row and the auth user when the link fails", async () => {
    mocks.linkInsertError = { message: "fk violation" };
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(500);
    expect(deletesTo("venues")[0]?.filters).toMatchObject({ id: "venue-the-anchor" });
    expect(deletesTo("venue_owners")[0]?.filters).toMatchObject({ id: "owner-1" });
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-1");
  });

  it("on a CLAIM, unwinding the link never deletes the venue it was claiming", async () => {
    mocks.venues = [venueFixture("venue-anchor", NEAR)];
    mocks.linkInsertError = { message: "fk violation" };
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-anchor" }));

    expect(response.status).toBe(500);
    // This is somebody's real, possibly live venue. Only a row this request
    // created may be deleted.
    expect(deletesTo("venues")).toHaveLength(0);
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-1");
  });

  it("500s without creating anything when the duplicate scan itself errors", async () => {
    mocks.venueScanError = { message: "connection reset" };
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(500);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});


// --- Phase 5a — signup hardening -------------------------------------------
//
// docs/partner-self-serve-signup-plan.md §4 Phase 5a. Three things Phase 5 left
// open plus two robustness fixes. Item 1(a)'s copy is asserted in the "existing
// account" block above, beside the branch it replaced.

describe("field length caps (Phase 5a §2)", () => {
  it("REJECTS an over-length venue name rather than truncating it into venues.name", async () => {
    // venues.name is a `text` column rendered in the player venue list and on
    // the venue TV screen. Truncating would surface as a clipped name in front
    // of customers; rejecting surfaces on the screen that collected it.
    const { SIGNUP_FIELD_LIMITS } = await import("@/lib/selfServeSignup");
    const POST = await load();
    const response = await POST(
      post({ ...VALID_BODY, venueName: "A".repeat(SIGNUP_FIELD_LIMITS.venueName + 1) })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining(String(SIGNUP_FIELD_LIMITS.venueName)),
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
  });

  it("caps every other draft field too, before any account work", async () => {
    const { SIGNUP_FIELD_LIMITS } = await import("@/lib/selfServeSignup");
    const POST = await load();

    const cases: Array<[string, string]> = [
      ["name", "A".repeat(SIGNUP_FIELD_LIMITS.name + 1)],
      // Still a syntactically valid address — the pattern is not a size gate.
      ["email", `${"a".repeat(SIGNUP_FIELD_LIMITS.email)}@example.com`],
      ["password", "p".repeat(SIGNUP_FIELD_LIMITS.password + 1)],
      ["street", "1 ".repeat(SIGNUP_FIELD_LIMITS.street)],
      ["city", "D".repeat(SIGNUP_FIELD_LIMITS.city + 1)],
      ["state", "COLORADO"],
      ["zipCode", "8".repeat(SIGNUP_FIELD_LIMITS.zipCode + 1)],
      ["placeId", "p".repeat(SIGNUP_FIELD_LIMITS.placeId + 1)],
    ];

    for (const [field, value] of cases) {
      const response = await POST(post({ ...VALID_BODY, [field]: value }));
      expect(response.status, `${field} should be rejected`).toBe(400);
    }

    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("accepts every field at exactly its limit", async () => {
    const { SIGNUP_FIELD_LIMITS } = await import("@/lib/selfServeSignup");
    const POST = await load();
    const response = await POST(
      post({
        ...VALID_BODY,
        name: "A".repeat(SIGNUP_FIELD_LIMITS.name),
        venueName: "B".repeat(SIGNUP_FIELD_LIMITS.venueName),
        city: "C".repeat(SIGNUP_FIELD_LIMITS.city),
        zipCode: "8".repeat(SIGNUP_FIELD_LIMITS.zipCode),
      })
    );

    expect(response.status).toBe(200);
  });

  it("413s an oversized body BEFORE parsing it", async () => {
    const { SIGNUP_MAX_BODY_BYTES } = await import("@/lib/selfServeSignup");
    const POST = await load();
    const response = await POST(
      post({ ...VALID_BODY, venueName: "A".repeat(SIGNUP_MAX_BODY_BYTES + 1) })
    );

    expect(response.status).toBe(413);
    expect(mocks.createUser).not.toHaveBeenCalled();
    // It still costs a rate-limit slot in BOTH tiers. §4.1b moved the body read
    // in front of the limiter (the inner bucket keys on the submitted email), so
    // the 413 is deliberately deferred until after the limiter has spoken —
    // an oversized body is exactly the shape a scripted abuser sends, and it
    // must not become the one request that is free.
    expect(mocks.rateLimitClaims.filter((claim) => claim.allowed)).toHaveLength(2);
  });

  it("413s a body that is under the cap in UTF-16 units but over it in BYTES (Finding #12)", async () => {
    // The cap is a BYTE budget and Content-Length is a byte count, so measuring
    // the decoded body in `String.length` compared two different things: this
    // body is ~1/3 of the cap in code units and ~1.05x the cap in UTF-8 bytes,
    // and the pre-fix check waved it through.
    const { SIGNUP_MAX_BODY_BYTES } = await import("@/lib/selfServeSignup");
    const multibyte = "献".repeat(Math.ceil((SIGNUP_MAX_BODY_BYTES + 64) / 3));
    const body = { ...VALID_BODY, venueName: multibyte };

    expect(JSON.stringify(body).length).toBeLessThan(SIGNUP_MAX_BODY_BYTES);
    expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeGreaterThan(SIGNUP_MAX_BODY_BYTES);

    const POST = await load();
    const response = await POST(post(body));

    expect(response.status).toBe(413);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("claim races (Phase 5a §3)", () => {
  it("converts a 23505 unique violation on the link insert into 409 venue_claimed", async () => {
    // Inert until the venue_owner_venues(venue_id) unique index ships (there is
    // no constraint to violate yet), but the branch is the entire point of that
    // migration: without it the loser of a two-claim race gets a generic 500.
    mocks.venues = [venueFixture("venue-anchor", PIN, true)];
    mocks.linkInsertError = { message: "duplicate key value violates unique constraint", code: "23505" };
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-anchor" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "venue_claimed",
      venue: { id: "venue-anchor" },
    });
    // The loser's own half-built account is still torn down, and the venue they
    // were trying to claim — somebody else's — is never touched.
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-1");
    expect(deletesTo("venues")).toHaveLength(0);
    expect(deletesTo("venue_owners")).toHaveLength(1);
  });

  it("does NOT convert 23505 on the create path — a fresh venue id cannot collide", async () => {
    mocks.linkInsertError = { message: "duplicate key value violates unique constraint", code: "23505" };
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(500);
    expect(deletesTo("venues")).toHaveLength(1);
  });
});

describe("proximity scan determinism (Phase 5a §4)", () => {
  it("orders the bounding-box scan so a >200-row box returns a reproducible slice", async () => {
    const POST = await load();
    await POST(post(VALID_BODY));

    expect(mocks.venueScanOrder).toEqual({ column: "latitude", ascending: true });
  });
});


// --- Phase 1 — the claim-path vulnerability ---------------------------------
//
// docs/self-serve-signup-review-fixes-plan.md Phase 1, review findings #1 and
// #2. The shared predicate itself, and the "one rule, two call sites" static
// tripwire, live in tests/api.owner.signup.claim-guard.test.ts; these are the
// ROUTE behaviours, which need this file's Supabase/auth mock harness.

describe("claim guards (Phase 1)", () => {
  it("REFUSES a claimVenueId at (0, 0), even when the pin is standing on it", async () => {
    // Finding #1, end to end. The claim branch used to carry its own shorter
    // copy of the eligibility rule with no placeholder clause, so this exact
    // request returned an ownership link to the Category Blitz global room.
    mocks.venues = [
      { ...venueFixture("hc-cbz-live", { latitude: 0, longitude: 0 }, true, null), name: "Category Blitz Global Room (internal)" },
    ];
    const POST = await load();
    const response = await POST(
      post({ ...VALID_BODY, latitude: 0, longitude: 0, claimVenueId: "hc-cbz-live" })
    );

    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(insertsTo("venue_owner_venues")).toHaveLength(0);
    // Finding #2's half of the chain: nothing may stamp that row.
    expect(updatesTo("venues")).toHaveLength(0);
  });

  it("REFUSES a claim on an admin-created hidden venue, and never stamps it", async () => {
    // Hidden with a NULL self_serve_created_at = an internal room, or a venue
    // an admin hid. Refused outright rather than merely left unstamped: a
    // stranger must not hold a venue_owner_venues row to it at all.
    mocks.venues = [venueFixture("venue-admin-hidden", NEAR, true, null)];
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-admin-hidden" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "venue_claimed",
      venue: { id: "venue-admin-hidden" },
    });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(insertsTo("venue_owner_venues")).toHaveLength(0);
    // Stamping it would simultaneously arm maybeRevealVenue (publish it to
    // every player) and sweepAbandonedSignupVenues (delete it in 7 days).
    expect(updatesTo("venues")).toHaveLength(0);
  });

  it("does not OFFER an admin-created hidden venue as a claim on the discovery path either", async () => {
    // Otherwise the wizard shows "Is this your venue?" for a venue the claim
    // POST would then reject — an offered dead end. The row is still found,
    // not skipped: a second venue at an address we already hold would split one
    // bar's leaderboard in two.
    mocks.venues = [venueFixture("venue-admin-hidden", NEAR, true, null)];
    const POST = await load();
    const response = await POST(post(VALID_BODY));

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.code).toBe("venue_claimed");
    expect(payload.error).toContain("partnerships@hightopchallenge.com");
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
  });

  it("STILL allows the legitimate case: claiming somebody's abandoned self-serve signup", async () => {
    // The case Phase 5a's stamp refresh exists for, and the one these guards
    // must not break. Hidden, but stamped by this flow three weeks ago.
    mocks.venues = [venueFixture("venue-abandoned", NEAR, true)];
    const POST = await load();
    const response = await POST(post({ ...VALID_BODY, claimVenueId: "venue-abandoned" }));

    expect(response.status).toBe(200);
    expect(insertsTo("venue_owner_venues")[0]?.payload).toMatchObject({ venue_id: "venue-abandoned" });
    expect(mocks.createAdminVenue).not.toHaveBeenCalled();
    // And the unpaid clock is restarted, or the 7-day sweep deletes it out from
    // under them while they are still on the Stripe Checkout page.
    const stamp = updatesTo("venues")[0];
    expect(stamp?.filters).toMatchObject({ id: "venue-abandoned" });
    expect(typeof stamp?.payload.self_serve_created_at).toBe("string");
    expect(stamp?.payload).not.toHaveProperty("hidden");
  });
});
