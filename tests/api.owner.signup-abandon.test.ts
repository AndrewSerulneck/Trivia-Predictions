import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Abandoned-signup cleanup — Phase 3, POST /api/owner/signup/abandon
 * (docs/abandoned-signup-cleanup-plan.md).
 *
 * The route is wiring — every decision belongs to lib/pendingSignup.ts — so this
 * file deliberately does NOT mock that module. The predicate runs for real
 * against a table-aware PostgREST stand-in (modelled on the one in
 * tests/api.owner.signup.test.ts, which already covers every table
 * `purgePendingSignup` touches), because the thing worth pinning is not "the
 * route called purge" but "the route cannot delete a real account" — this is an
 * endpoint whose teardown reaches an `auth.users` row, a table shared with
 * players (CLAUDE.md standing prohibition).
 *
 * The four cases the Phase 2 handoff named: pending ⇒ purged + cookie cleared +
 * 200; a real account ⇒ 409 with nothing deleted; unauthenticated ⇒ 401; a purge
 * failure ⇒ 500. Plus the flag gate and the never-purge clauses reached THROUGH
 * the route.
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  /** venue_owners row for the authenticated owner, or null (deleted/unknown). */
  owner: null as { id: string; auth_id: string | null; created_at: string } | null,
  /** venue_owner_venues rows, read by BOTH requireOwnerAuth and the predicate. */
  links: [] as Array<{ venue_id: string }>,
  /** venues rows returned for the `.in("id", …)` read. */
  venues: [] as Array<Record<string, unknown>>,
  /** billing_subscriptions rows. Any row at all ⇒ not pending ⇒ a real account. */
  billing: [] as Array<Record<string, unknown>>,
  /** Rows that make the auth user look like a player's (clause 4). */
  accounts: [] as Array<Record<string, unknown>>,
  // --- injected failures ----------------------------------------------------
  ownerReadError: null as { message: string } | null,
  venueDeleteError: null as { message: string } | null,
  stripeSweepOk: true,
  // --- recorders ------------------------------------------------------------
  deletes: [] as Array<{ table: string; filters: Record<string, unknown> }>,
  deleteUser: vi.fn(),
  stripeSweep: vi.fn(),
}));

type Ctx = { table: string; mode: "select" | "delete"; filters: Record<string, unknown> };
type QueryResult = { data: unknown; error: { message?: string } | null };

type Builder = {
  select: () => Builder;
  eq: (column: string, value: unknown) => Builder;
  neq: () => Builder;
  in: (column: string, values: unknown[]) => Builder;
  not: () => Builder;
  limit: () => Builder;
  delete: () => Builder;
  returns: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  then: <T>(onOk: (result: QueryResult) => T, onErr?: (reason: unknown) => T) => Promise<T>;
};

function resolveQuery(ctx: Ctx): QueryResult {
  if (ctx.mode === "delete") {
    mocks.deletes.push({ table: ctx.table, filters: { ...ctx.filters } });
    if (ctx.table === "venues" && mocks.venueDeleteError) {
      return { data: null, error: mocks.venueDeleteError };
    }
    return { data: [], error: null };
  }

  switch (ctx.table) {
    case "venue_owners":
      // The auth-guard's "does another owner row use this auth user?" read.
      if (ctx.filters.auth_id !== undefined) return { data: [], error: null };
      if (mocks.ownerReadError) return { data: null, error: mocks.ownerReadError };
      return { data: mocks.owner, error: null };

    case "venue_owner_venues":
      return { data: mocks.links, error: null };

    case "venues":
      // requireOwnerAuth reads `.select("id").in("id", …)`; the predicate reads
      // VENUE_CLAIM_COLUMNS with the same filter. One fixture serves both.
      return { data: mocks.venues, error: null };

    case "billing_subscriptions":
      return { data: mocks.billing, error: null };

    case "accounts":
      return { data: mocks.accounts, error: null };

    case "users":
    case "username_change_attempts":
    case "username_change_audit":
    case "category_blitz_submissions":
    case "category_blitz_session_participants":
      return { data: [], error: null };

    default:
      throw new Error(`Unexpected table: ${ctx.table}`);
  }
}

function builderFor(table: string): Builder {
  const ctx: Ctx = { table, mode: "select", filters: {} };
  const settle = () => Promise.resolve(resolveQuery(ctx));
  const builder: Builder = {
    select: () => builder,
    eq: (column, value) => {
      ctx.filters[column] = value;
      return builder;
    },
    neq: () => builder,
    in: (column, values) => {
      ctx.filters[column] = values;
      return builder;
    },
    not: () => builder,
    limit: () => builder,
    delete: () => {
      ctx.mode = "delete";
      return builder;
    },
    returns: settle,
    maybeSingle: settle,
    then: (onOk, onErr) => settle().then(onOk, onErr),
  };
  return builder;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  isSupabaseAdminConfigured: true,
  supabaseAdmin: {
    from: (table: string) => builderFor(table),
    auth: { admin: { deleteUser: (...args: unknown[]) => mocks.deleteUser(...args) } },
  },
}));

// A configured Stripe client, so `purgePendingSignup` takes the cancel-first path
// rather than the "payments unconfigured, skip it" shortcut.
vi.mock("@/lib/stripe", () => ({ stripe: {} }));

vi.mock("@/lib/stripeIncomplete", () => ({
  sweepAbandonedIncompleteSubscriptions: (...args: unknown[]) => mocks.stripeSweep(...args),
}));

const ORIGINAL_ENV = { ...process.env };

const OWNER_ID = "owner-pending";
const AUTH_ID = "auth-pending";
const VENUE_ID = "venue-pending";

/** A hidden, self-serve-stamped, non-(0,0) venue: this flow's own debris.
 *  `checkout_started_at` is set — the partner reached the Stripe page and bailed
 *  there — so `purgePendingSignup` runs the incomplete-subscription cancel sweep
 *  (§4.1a). Clear it in an override for the "never reached Checkout" case. */
const pendingVenue = (overrides: Record<string, unknown> = {}) => ({
  id: VENUE_ID,
  name: "The Dead Rabbit",
  address: null,
  street: null,
  city: null,
  state: null,
  latitude: 40.7032685,
  longitude: -74.0110218,
  hidden: true,
  self_serve_created_at: "2026-09-08T19:13:55.000Z",
  checkout_started_at: "2026-09-08T19:20:00.000Z",
  ...overrides,
});

const load = async () => (await import("@/app/api/owner/signup/abandon/route")).POST;

/** A real, signed owner session cookie for OWNER_ID — not a hand-written string. */
const signedCookie = async (ownerId = OWNER_ID): Promise<string> => {
  const { createOwnerSessionCookie } = await import("@/lib/ownerSession");
  return createOwnerSessionCookie(ownerId).split(";")[0];
};

const post = (cookie?: string) =>
  new Request("http://localhost/api/owner/signup/abandon", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });

const deletesTo = (table: string) => mocks.deletes.filter((entry) => entry.table === table);

beforeEach(() => {
  vi.resetModules();
  mocks.owner = { id: OWNER_ID, auth_id: AUTH_ID, created_at: "2026-09-08T19:13:55.000Z" };
  mocks.links = [{ venue_id: VENUE_ID }];
  mocks.venues = [pendingVenue()];
  mocks.billing = [];
  mocks.accounts = [];
  mocks.ownerReadError = null;
  mocks.venueDeleteError = null;
  mocks.deletes = [];
  mocks.deleteUser.mockReset().mockResolvedValue({ error: null });
  mocks.stripeSweep
    .mockReset()
    .mockResolvedValue({ ok: true, cancelledSubscriptionIds: [], errors: [] });

  process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED = "true";
  process.env.SESSION_SECRET = "test-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("gates", () => {
  it("404s when the self-serve flag is off, before any auth or Supabase work", async () => {
    delete process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED;
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(404);
    expect(mocks.deletes).toHaveLength(0);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("401s with no owner session cookie, and deletes nothing", async () => {
    const POST = await load();
    const response = await POST(post());

    expect(response.status).toBe(401);
    expect(mocks.deletes).toHaveLength(0);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("401s on a forged cookie — the signature is what identifies the owner", async () => {
    const POST = await load();
    // A payload that decodes to the right owner id, with a signature that is not
    // an HMAC of it. Without readOwnerSession's check this is a delete button.
    const payload = Buffer.from(JSON.stringify({ ownerId: OWNER_ID })).toString("base64url");
    const response = await POST(post(`tp_owner_sess=${payload}.not-a-real-signature`));

    expect(response.status).toBe(401);
    expect(mocks.deletes).toHaveLength(0);
    expect(mocks.deleteUser).not.toHaveBeenCalled();

    // Phase 3.1: an unusable cookie is "not signed in", so this one DOES belong
    // on the login page — the discriminator has to get both halves right.
    await expect(response.json()).resolves.toMatchObject({ code: "no_session" });
  });
});

describe("a pending signup", () => {
  it("purges it, clears the owner cookie and 200s", async () => {
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });

    expect(deletesTo("venues")).toContainEqual({ table: "venues", filters: { id: VENUE_ID } });
    expect(deletesTo("venue_owners")).toContainEqual({
      table: "venue_owners",
      filters: { id: OWNER_ID },
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith(AUTH_ID);

    // The owner row is gone; the cookie must not outlive it.
    const setCookie = response.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("tp_owner_sess=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("cancels abandoned Stripe objects BEFORE deleting any row", async () => {
    // If a still-`incomplete` subscription completed after the venue was gone,
    // the webhook would write a billing row against a venue that no longer
    // exists. Ordering is the whole guarantee, so it is asserted as ordering:
    // the sweep records how many deletes had already run when it was called.
    let deletesWhenStripeRan = -1;
    mocks.stripeSweep.mockImplementation(async () => {
      deletesWhenStripeRan = mocks.deletes.length;
      return { ok: true, cancelledSubscriptionIds: ["sub_1"], errors: [] };
    });
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(200);
    expect(deletesWhenStripeRan).toBe(0);
    expect(mocks.deletes.length).toBeGreaterThan(0);
    expect(mocks.stripeSweep).toHaveBeenCalledWith({}, VENUE_ID);
  });

  it("skips the Stripe sweep when no venue reached Checkout (§4.1a)", async () => {
    // A partner who never got past the wizard has no Stripe object at all, so a
    // sweep failure here would block a retry that has nothing to clean up.
    mocks.venues = [pendingVenue({ checkout_started_at: null })];
    mocks.stripeSweep.mockResolvedValue({
      ok: false,
      cancelledSubscriptionIds: [],
      errors: ["stripe down"],
    });
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(200);
    expect(mocks.stripeSweep).not.toHaveBeenCalled();
    expect(deletesTo("venues")).toContainEqual({ table: "venues", filters: { id: VENUE_ID } });
    expect(mocks.deleteUser).toHaveBeenCalledWith(AUTH_ID);
  });
});

describe("a real account is never purged", () => {
  /** Every one of these makes the owner NOT pending. All must 409, delete nothing. */
  const neverPurge: Array<[string, () => void]> = [
    [
      "any billing_subscriptions row, even cancelled",
      () => {
        mocks.billing = [{ id: "sub-1", status: "cancelled", owner_id: OWNER_ID, venue_id: VENUE_ID }];
      },
    ],
    ["a venue that is not hidden", () => {
      mocks.venues = [pendingVenue({ hidden: false })];
    }],
    ["an admin-activated venue (no self_serve_created_at)", () => {
      mocks.venues = [pendingVenue({ self_serve_created_at: null })];
    }],
    ["a (0,0) placeholder venue", () => {
      mocks.venues = [pendingVenue({ latitude: 0, longitude: 0 })];
    }],
    ["an auth user a player account is using", () => {
      mocks.accounts = [{ id: "account-1", auth_id: AUTH_ID }];
    }],
    ["a second venue that is a real one", () => {
      mocks.links = [{ venue_id: VENUE_ID }, { venue_id: "venue-real" }];
      mocks.venues = [pendingVenue(), pendingVenue({ id: "venue-real", hidden: false })];
    }],
  ];

  for (const [label, seed] of neverPurge) {
    it(`409s not_pending for ${label}`, async () => {
      seed();
      const POST = await load();
      const response = await POST(post(await signedCookie()));

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ ok: false, code: "not_pending" });
      expect(mocks.deletes).toHaveLength(0);
      expect(mocks.deleteUser).not.toHaveBeenCalled();
      // The cookie is a real owner's; a refused cancel must not sign them out.
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });
  }
});

describe("failures", () => {
  it("500s generically on a read error, and deletes nothing", async () => {
    // Fails CLOSED: an unanswered question is not permission to delete. The
    // upstream message must not reach the body.
    mocks.ownerReadError = { message: "connection reset by peer" };
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error).not.toContain("connection reset");
    expect(mocks.deletes).toHaveLength(0);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("500s and deletes NOTHING when the Stripe cancel fails", async () => {
    mocks.stripeSweep.mockResolvedValue({
      ok: false,
      cancelledSubscriptionIds: [],
      errors: ["stripe down"],
    });
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(500);
    expect(mocks.deletes).toHaveLength(0);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("500s and leaves the session cookie alone when a row delete fails", async () => {
    // A half-purged signup: the owner row may still exist, so signing the partner
    // out would strand them with no route back to the button they just tapped.
    mocks.venueDeleteError = { message: "deadlock detected" };
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("a double-tap after a successful purge is refused, not re-run", async () => {
    // The second request arrives on a cookie for rows that no longer exist.
    // requireOwnerAuth stops it at 401 (no linked venues remain) — earlier than
    // the 409 the plan describes, and the honest answer either way. What matters
    // is that a stale cookie never reaches a delete.
    mocks.owner = null;
    mocks.links = [];
    mocks.venues = [];
    const POST = await load();
    const response = await POST(post(await signedCookie()));

    expect(response.status).toBe(401);
    expect(mocks.deletes).toHaveLength(0);
    expect(mocks.deleteUser).not.toHaveBeenCalled();

    // Phase 3.1: and that 401 says WHY, so the page routes them to the signup
    // flow rather than to a login page for the account they just destroyed.
    await expect(response.json()).resolves.toMatchObject({ code: "no_venue" });
  });
});
