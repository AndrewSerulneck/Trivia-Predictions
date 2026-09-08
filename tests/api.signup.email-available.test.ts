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
  /** Emails that already have a `venue_owners` row. */
  takenEmails: ["taken@thecorner.example"] as string[],
  /** Injected Supabase failure. */
  lookupError: null as { message: string } | null,
  supabaseConfigured: true,
  /** Every email string the route actually queried with. */
  queried: [] as string[],
  rateLimitAllowed: true,
  rateLimitBuckets: [] as string[],
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  get supabaseAdmin() {
    if (!mocks.supabaseConfigured) return null;
    return {
      from: (table: string) => {
        if (table !== "venue_owners") throw new Error(`Unexpected table: ${table}`);
        return {
          select: () => ({
            eq: (_column: string, value: string) => {
              mocks.queried.push(value);
              return {
                maybeSingle: async () =>
                  mocks.lookupError
                    ? { data: null, error: mocks.lookupError }
                    : {
                        data: mocks.takenEmails.includes(value) ? { id: "owner-1" } : null,
                        error: null,
                      },
              };
            },
          }),
        };
      },
    };
  },
}));

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
  mocks.takenEmails = ["taken@thecorner.example"];
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

  it("reports a taken email as unavailable, with the shared message", async () => {
    const response = await post({ email: "taken@thecorner.example" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; available: boolean; error?: string };
    expect(body).toMatchObject({ ok: true, available: false, error: OWNER_EMAIL_TAKEN_MESSAGE });
  });

  it("reports an unused email as available and carries no error", async () => {
    const response = await post({ email: "brand-new@thecorner.example" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; available: boolean; error?: string };
    expect(body).toEqual({ ok: true, available: true });
  });

  it("normalises the address exactly as the submit route does", async () => {
    await post({ email: "  TAKEN@TheCorner.Example  " });
    expect(mocks.queried).toEqual(["taken@thecorner.example"]);
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
