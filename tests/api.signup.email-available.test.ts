import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/signup/email-available — the step-2 "is this email already taken?"
 * pre-check.
 *
 * It is public, unauthenticated, and an email-enumeration oracle, so the same
 * four properties its /api/signup/* siblings are pinned on apply here:
 *
 *   1. Flag off → 404, before any Supabase work happens.
 *   2. Rate limited — on its own `emailCheck` bucket, not shared with the
 *      submit bucket, and refused when the limiter says no.
 *   3. Generic errors only (Finding #7): a Postgres message never reaches the
 *      body, and a lookup failure is NEVER collapsed into `available: true`.
 *   4. It answers about the SAME normalised string the submit route stores, or
 *      the pre-check and the authority would disagree about the same address.
 */

const mocks = vi.hoisted(() => ({
  /** email -> owner id for addresses that already have a `venue_owners` row. */
  ownersByEmail: { "taken@thecorner.example": "owner-1" } as Record<string, string>,
  /**
   * Owner ids whose signup is PENDING (unpaid, never finished). Phase 2b:
   * classifyEmailForSignup answers `available: true` for these — the submit
   * supersedes them — and `available: false` only for a real account.
   */
  pendingOwnerIds: [] as string[],
  /** Injected Supabase failure on the venue_owners read. */
  lookupError: null as { message: string } | null,
  supabaseConfigured: true,
  /** Every value the route queried venue_owners with (emails, then owner ids). */
  queried: [] as string[],
  rateLimitAllowed: true,
  rateLimitBuckets: [] as string[],
}));

/** A hidden, self-serve-stamped, located venue — clause 2 of the pending predicate. */
const PENDING_VENUE = {
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
};

vi.mock("@/lib/supabaseAdmin", () => {
  const ownerIdFor = (value: string): string | null =>
    Object.values(mocks.ownersByEmail).includes(value)
      ? value // already an owner id (the by-id re-read)
      : (mocks.ownersByEmail[value] ?? null);

  const rowsFor = (table: string, filters: Record<string, unknown>): unknown[] => {
    const ownerId = typeof filters.id === "string" ? filters.id : (filters.owner_id as string | undefined);
    const isPending = ownerId ? mocks.pendingOwnerIds.includes(ownerId) : false;
    switch (table) {
      case "venue_owner_venues":
        return isPending ? [{ venue_id: PENDING_VENUE.id }] : [];
      case "venues":
        // The predicate reads venues with `.in("id", venueIds)`.
        return Array.isArray(filters.id) && (filters.id as string[]).includes(PENDING_VENUE.id)
          ? [PENDING_VENUE]
          : [];
      case "billing_subscriptions":
        return []; // a pending signup has none, ever
      // The auth.users FK guard tables — none reference the pending auth user.
      case "accounts":
      case "users":
      case "username_change_attempts":
      case "username_change_audit":
      case "category_blitz_submissions":
      case "category_blitz_session_participants":
        return [];
      default:
        return [];
    }
  };

  return {
    get supabaseAdmin() {
      if (!mocks.supabaseConfigured) return null;
      const makeBuilder = (table: string, filters: Record<string, unknown>) => {
        const settle = async () => ({ data: rowsFor(table, filters), error: null });
        const builder: Record<string, unknown> = {};
        for (const op of ["eq", "neq", "in", "not", "limit", "order", "select"]) {
          builder[op] = (column?: string, value?: unknown) => {
            if (typeof column === "string" && value !== undefined) filters[column] = value;
            return builder;
          };
        }
        builder.returns = settle;
        builder.then = (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
          settle().then(resolve, reject);
        builder.maybeSingle = async () => {
          const rows = rowsFor(table, filters) as unknown[];
          return { data: rows[0] ?? null, error: null };
        };
        return builder;
      };

      return {
        from: (table: string) => {
          if (table === "venue_owners") {
            return {
              select: () => ({
                eq: (_column: string, value: string) => {
                  mocks.queried.push(value);
                  const filters: Record<string, unknown> = { [_column]: value };
                  const chain = {
                    neq: () => chain,
                    limit: () => chain,
                    returns: async () => ({ data: [], error: null }), // auth-guard: owner's own row excluded
                    then: (r: (v: unknown) => unknown) =>
                      Promise.resolve({ data: [], error: null }).then(r),
                    maybeSingle: async () => {
                      if (mocks.lookupError) return { data: null, error: mocks.lookupError };
                      const id = ownerIdFor(value);
                      return { data: id ? { id, auth_id: `${id}-auth`, created_at: "2026-09-01T00:00:00.000Z" } : null, error: null };
                    },
                  };
                  void filters;
                  return chain;
                },
              }),
            };
          }
          return { select: () => makeBuilder(table, {}), delete: () => makeBuilder(table, {}) };
        },
      };
    },
  };
});

vi.mock("@/lib/rateLimit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rateLimit")>("@/lib/rateLimit");
  return {
    ...actual,
    rateLimit: vi.fn(async (_request: Request, bucket: string) => {
      mocks.rateLimitBuckets.push(bucket);
      return mocks.rateLimitAllowed
        ? { allowed: true as const }
        : { allowed: false as const, retryAfterSeconds: 900 };
    }),
  };
});

import { POST } from "@/app/api/signup/email-available/route";
import { SIGNUP_RATE_LIMITS } from "@/lib/rateLimit";
import { OWNER_EMAIL_TAKEN_MESSAGE } from "@/lib/ownerEmailAvailability";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/signup/email-available", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const reset = () => {
  mocks.ownersByEmail = { "taken@thecorner.example": "owner-1" };
  mocks.pendingOwnerIds = [];
  mocks.lookupError = null;
  mocks.supabaseConfigured = true;
  mocks.queried = [];
  mocks.rateLimitAllowed = true;
  mocks.rateLimitBuckets = [];
  process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED = "true";
};

beforeEach(reset);
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED;
  vi.restoreAllMocks();
});

describe("POST /api/signup/email-available", () => {
  it("404s with the flag off, before touching Supabase", async () => {
    delete process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED;
    const response = await post({ email: "taken@thecorner.example" });
    expect(response.status).toBe(404);
    expect(mocks.queried).toEqual([]);
    expect(mocks.rateLimitBuckets).toEqual([]);
  });

  it("reports a REAL account (taken, not pending) as unavailable, with the shared message", async () => {
    const response = await post({ email: "taken@thecorner.example" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; available: boolean; error?: string };
    expect(body).toMatchObject({ ok: true, available: false, error: OWNER_EMAIL_TAKEN_MESSAGE });
  });

  it("reports a PENDING signup as AVAILABLE, with no error (Phase 2b)", async () => {
    // The email has a venue_owners row, but it is an unpaid, never-finished
    // signup — POST /api/owner/signup supersedes it at submit, so surfacing it
    // here as "taken" would strand a returning partner on a dead end.
    mocks.ownersByEmail = { "comeback@thecorner.example": "owner-pending" };
    mocks.pendingOwnerIds = ["owner-pending"];

    const response = await post({ email: "comeback@thecorner.example" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; available: boolean; error?: string };
    expect(body).toEqual({ ok: true, available: true });
  });

  it("reports an unused email as available and carries no error", async () => {
    const response = await post({ email: "brand-new@thecorner.example" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; available: boolean; error?: string };
    expect(body).toEqual({ ok: true, available: true });
  });

  it("normalises the address exactly as the submit route does", async () => {
    await post({ email: "  TAKEN@TheCorner.Example  " });
    // The FIRST venue_owners read is the by-email lookup (Phase 2b routes it
    // through classifyEmailForSignup, which then resolves the owner id and
    // re-reads by id — hence any trailing entries are owner ids, not emails).
    expect(mocks.queried[0]).toEqual("taken@thecorner.example");
  });

  it("uses its own rate-limit bucket, not the submit one", async () => {
    await post({ email: "brand-new@thecorner.example" });
    expect(mocks.rateLimitBuckets).toEqual(["emailCheck"]);
    expect(SIGNUP_RATE_LIMITS.emailCheck.windowSeconds).toBeGreaterThanOrEqual(3600);
  });

  it("refuses when the limiter says no, without a lookup", async () => {
    mocks.rateLimitAllowed = false;
    const response = await post({ email: "taken@thecorner.example" });
    expect(response.status).toBe(429);
    expect(mocks.queried).toEqual([]);
  });

  it.each([
    ["a malformed address", "not-an-email"],
    ["an empty address", ""],
    ["an over-long address", `${"a".repeat(250)}@example.com`],
  ])("400s on %s without a lookup", async (_label, email) => {
    const response = await post({ email });
    expect(response.status).toBe(400);
    expect(mocks.queried).toEqual([]);
  });

  // The important one: a lookup failure must NOT read as "available". Collapsing
  // it would wave a duplicate through to a submit that then 409s on the review
  // screen — exactly the dead end this route exists to remove.
  it("503s on a lookup failure and never reports available", async () => {
    mocks.lookupError = { message: 'relation "venue_owners" does not exist' };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post({ email: "taken@thecorner.example" });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; available?: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.available).toBeUndefined();

    // The Postgres text goes to the log, never to the body (Finding #7).
    expect(body.error).not.toContain("venue_owners");
    expect(body.error).not.toContain("relation");
    expect(errorLog).toHaveBeenCalledWith(
      "[SignupEmailCheck] lookup-failed",
      expect.objectContaining({ message: expect.stringContaining("venue_owners") })
    );
  });

  it("503s rather than reporting available when Supabase is unconfigured", async () => {
    mocks.supabaseConfigured = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post({ email: "taken@thecorner.example" });
    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; available?: boolean };
    expect(body.available).toBeUndefined();
  });

  it("never sets a cache header that would let an answer be reused", async () => {
    const response = await post({ email: "brand-new@thecorner.example" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
