import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Partner Self-Serve Signup — Phase 1 rate limiter
 * (docs/partner-self-serve-signup-plan.md §4 Phase 1), hardened by review-fix
 * Phase 2 (docs/self-serve-signup-review-fixes-plan.md §3 Phase 2).
 *
 * Every route under /api/signup/* is reachable by a signed-out stranger and
 * every call bills Google. Four things must hold and are pinned here:
 *
 *   1. Flag off  → 404, before any Supabase or Google work happens.
 *   2. Rate limit → the window boundary is exclusive of expired attempts and
 *      inclusive of live ones; the decision is ATOMIC (Finding #6); and the
 *      limiter fails CLOSED, including when the RPC itself is missing.
 *   3. The IP hash is stable, salted, bucket-scoped, and never a raw IP.
 *   4. /api/signup/maps-key serves the browser key or 503s — it never falls
 *      back to the unrestricted server key (Finding #5).
 *
 * THE SUPABASE MOCK MODELS BOTH ACCESS PATHS ON ONE LEDGER, on purpose:
 *   - `.rpc("claim_signup_attempt")` decides and records inside a single
 *     synchronous critical section — that synchronicity is what the Postgres
 *     advisory lock buys, and it is what the concurrency test below measures.
 *   - `.from("signup_attempts")` reads and writes the same rows the ordinary
 *     asynchronous PostgREST way. Nothing in lib/rateLimit.ts's quota path may
 *     use it any more; keeping it wired means the concurrency test genuinely
 *     fails against a read-then-write implementation instead of erroring.
 */

type LedgerRow = { ip_hash: string; created_at: string };

const mocks = vi.hoisted(() => ({
  /**
   * Attempts already in the ledger before the test runs. Seeded rows apply to
   * EVERY hash (the fixtures below only ever exercise one bucket at a time).
   */
  rows: [] as Array<{ created_at: string }>,
  /** Rows the limiter actually recorded, in `signup_attempts` shape. */
  inserted: [] as Array<{ ip_hash: string; created_at: string }>,
  /** Every `claim_signup_attempt` call, with its parameters. */
  rpcCalls: [] as Array<Record<string, unknown>>,
  /** Injected RPC failure — the fail-closed paths. */
  rpcError: null as { code?: string; message?: string } | null,
  /** Injected non-row RPC payload — the malformed-response path. */
  rpcData: undefined as unknown,
  supabaseConfigured: true,
  predictions: vi.fn(async () => [{ placeId: "p1", mainText: "A", secondaryText: "B", fullText: "A, B" }]),
  details: vi.fn(async () => ({ street: "1 Main", city: "Denver", state: "CO", zipCode: "80202", country: "United States", latitude: 1, longitude: 2, placeId: "p1" })),
}));

/** Live attempts for one hash inside the window, oldest first. */
const liveAttempts = (ipHash: string, windowSeconds: number, now: number): number[] => {
  const since = now - windowSeconds * 1000;
  return [
    ...mocks.rows.map((row) => Date.parse(row.created_at)),
    ...mocks.inserted.filter((row) => row.ip_hash === ipHash).map((row) => Date.parse(row.created_at)),
  ]
    .filter((at) => Number.isFinite(at) && at >= since)
    .sort((a, b) => a - b);
};

/**
 * In-memory `claim_signup_attempt`. Count and insert happen with no `await`
 * between them, which is the whole point: it stands in for
 * `pg_advisory_xact_lock` + count-then-insert.
 */
const claimSignupAttempt = (params: Record<string, unknown>): { allowed: boolean; retry_after_seconds: number } => {
  const ipHash = String(params.p_ip_hash ?? "");
  const windowSeconds = Math.max(1, Number(params.p_window_seconds));
  const max = Math.max(1, Number(params.p_max));
  if (!ipHash) return { allowed: false, retry_after_seconds: windowSeconds };

  const now = Date.now();
  const live = liveAttempts(ipHash, windowSeconds, now);
  if (live.length >= max) {
    const retry = Math.ceil((live[0] + windowSeconds * 1000 - now) / 1000);
    return { allowed: false, retry_after_seconds: Math.max(1, Math.min(windowSeconds, retry)) };
  }

  mocks.inserted.push({ ip_hash: ipHash, created_at: new Date(now).toISOString() });
  return { allowed: true, retry_after_seconds: 0 };
};

/** The ordinary asynchronous PostgREST path over the same ledger. */
function signupAttemptsBuilder() {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    gte: (column: string, value: unknown) => {
      filters[`gte:${column}`] = value;
      return builder;
    },
    order: () => builder,
    limit: (count: number) =>
      Promise.resolve({
        data: mocks.inserted
          .concat(mocks.rows.map((row) => ({ ip_hash: String(filters.ip_hash ?? ""), ...row })) as LedgerRow[])
          .filter((row) => row.ip_hash === filters.ip_hash)
          .filter((row) => Date.parse(row.created_at) >= Date.parse(String(filters["gte:created_at"] ?? "")))
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
          .slice(0, count)
          .map((row) => ({ created_at: row.created_at })),
        error: null,
      }),
    insert: (payload: Record<string, unknown>) => {
      mocks.inserted.push({
        ip_hash: String(payload.ip_hash ?? ""),
        created_at: new Date().toISOString(),
      });
      return Promise.resolve({ error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  isSupabaseAdminConfigured: true,
  get supabaseAdmin() {
    if (!mocks.supabaseConfigured) return null;
    return {
      from: (table: string) => {
        if (table !== "signup_attempts") throw new Error(`Unexpected table: ${table}`);
        return signupAttemptsBuilder();
      },
      rpc: (fn: string, params: Record<string, unknown>) => {
        if (fn !== "claim_signup_attempt") throw new Error(`Unexpected rpc: ${fn}`);
        mocks.rpcCalls.push(params);
        if (mocks.rpcError) return Promise.resolve({ data: null, error: mocks.rpcError });
        if (mocks.rpcData !== undefined) return Promise.resolve({ data: mocks.rpcData, error: null });
        return Promise.resolve({ data: [claimSignupAttempt(params)], error: null });
      },
    };
  },
}));

vi.mock("@/lib/geolocation", () => ({
  getAddressPredictions: (...args: unknown[]) => mocks.predictions(...(args as [])),
  getAddressDetails: (...args: unknown[]) => mocks.details(...(args as [])),
}));

const ORIGINAL_ENV = { ...process.env };

const reset = () => {
  mocks.rows = [];
  mocks.inserted = [];
  mocks.rpcCalls = [];
  mocks.rpcError = null;
  mocks.rpcData = undefined;
  mocks.supabaseConfigured = true;
  mocks.predictions.mockClear();
  mocks.details.mockClear();
  vi.resetModules();
};

const enableFlag = () => {
  process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED = "true";
  process.env.SESSION_SECRET = "test-salt";
  // Both keys are set so every maps-key assertion below is about which one the
  // route CHOSE, not about which one happened to exist.
  process.env.GOOGLE_MAPS_BROWSER_KEY = "browser-key-abc";
  process.env.GOOGLE_MAPS_API_KEY = "server-key-xyz";
};

const req = (url: string, init?: RequestInit & { ip?: string }) =>
  new Request(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.ip ? { "x-forwarded-for": init.ip } : {}),
    },
  });

const isoAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

beforeEach(reset);
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("flag gate", () => {
  it("404s /api/signup/maps-key when the flag is off, without touching Supabase", async () => {
    delete process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED;
    const { GET } = await import("@/app/api/signup/maps-key/route");
    const response = await GET(req("http://localhost/api/signup/maps-key", { ip: "1.2.3.4" }));

    expect(response.status).toBe(404);
    expect(mocks.rpcCalls).toHaveLength(0);
    expect(mocks.inserted).toHaveLength(0);
  });

  it("404s /api/signup/places when the flag is off, without calling Google", async () => {
    delete process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED;
    const { POST } = await import("@/app/api/signup/places/route");
    const response = await POST(
      req("http://localhost/api/signup/places", {
        method: "POST",
        body: JSON.stringify({ query: "120 Main St" }),
        ip: "1.2.3.4",
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.predictions).not.toHaveBeenCalled();
    expect(mocks.inserted).toHaveLength(0);
  });
});

describe("maps-key", () => {
  it("returns the BROWSER key and records exactly one attempt when under quota", async () => {
    enableFlag();
    const { GET } = await import("@/app/api/signup/maps-key/route");
    const response = await GET(req("http://localhost/api/signup/maps-key", { ip: "9.9.9.9" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, apiKey: "browser-key-abc" });
    expect(mocks.inserted).toHaveLength(1);
    expect(mocks.inserted[0]).toHaveProperty("ip_hash");
    // Never a raw IP.
    expect(JSON.stringify(mocks.inserted[0])).not.toContain("9.9.9.9");
  });

  it("503s rather than falling back to the server key when GOOGLE_MAPS_BROWSER_KEY is unset (Finding #5)", async () => {
    enableFlag();
    delete process.env.GOOGLE_MAPS_BROWSER_KEY;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await import("@/app/api/signup/maps-key/route");
    const response = await GET(req("http://localhost/api/signup/maps-key", { ip: "9.9.9.9" }));

    expect(response.status).toBe(503);
    const body = await response.text();
    // The unrestricted server key must not appear anywhere in the response.
    expect(body).not.toContain("server-key-xyz");
    expect(errors.mock.calls.flat().join(" ")).toContain("[SignupMapsKey] browser-key-unset");
    errors.mockRestore();
  });

  it("429s with Retry-After once the window is full", async () => {
    enableFlag();
    const { SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");
    // Oldest attempt is 20s into a 60s window → ~40s until a slot frees.
    mocks.rows = Array.from({ length: SIGNUP_RATE_LIMITS.mapsKey.max }, (_, index) => ({
      created_at: isoAgo(20 - index),
    }));

    const { GET } = await import("@/app/api/signup/maps-key/route");
    const response = await GET(req("http://localhost/api/signup/maps-key", { ip: "9.9.9.9" }));

    expect(response.status).toBe(429);
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(35);
    expect(retryAfter).toBeLessThanOrEqual(SIGNUP_RATE_LIMITS.mapsKey.windowSeconds);
    // Denied calls are not recorded — one row means one billed call.
    expect(mocks.inserted).toHaveLength(0);
  });
});

describe("the quota decision is delegated to Postgres (Finding #6)", () => {
  it("hands claim_signup_attempt the rule's window and max, and nothing else", async () => {
    enableFlag();
    const { rateLimit, SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");

    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "mapsKey")
    ).resolves.toMatchObject({ allowed: true, retryAfterSeconds: 0 });

    expect(mocks.rpcCalls).toHaveLength(1);
    expect(mocks.rpcCalls[0]).toEqual({
      p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_window_seconds: SIGNUP_RATE_LIMITS.mapsKey.windowSeconds,
      p_max: SIGNUP_RATE_LIMITS.mapsKey.max,
    });
  });

  it("counts nothing in TypeScript: lib/rateLimit.ts's quota path is one RPC call", async () => {
    // Static half of Finding #6. A re-introduced read-then-write shows up as a
    // `.from("signup_attempts").select(` in the limiter, which is exactly what
    // the previous implementation did. `pruneSignupAttempts` still uses
    // `.from(...).delete()`, so this asserts on `select`, not on `from`.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "lib", "rateLimit.ts"), "utf8");

    expect(src).toMatch(/\.rpc\(\s*["']claim_signup_attempt["']/);
    expect(src, "the limiter must not read signup_attempts to decide a quota").not.toMatch(
      /from\(["']signup_attempts["']\)\s*\.\s*select/,
    );
  });

  it("N concurrent calls from one IP consume exactly `max` slots, not N", async () => {
    enableFlag();
    const { rateLimit, SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");
    const max = SIGNUP_RATE_LIMITS.signupSubmit.max;
    const burst = max * 8;

    const results = await Promise.all(
      Array.from({ length: burst }, () =>
        rateLimit(req("http://localhost/api/owner/signup", { ip: "203.0.113.42" }), "signupSubmit")
      )
    );

    // Against the pre-fix read-then-write limiter every one of these read the
    // same under-quota count and every one of them was allowed — ~40 accounts
    // against a cap of 5.
    expect(results.filter((r) => r.allowed)).toHaveLength(max);
    expect(results.filter((r) => !r.allowed)).toHaveLength(burst - max);
    expect(mocks.inserted).toHaveLength(max);
    // A denied burst is over quota, not a limiter outage.
    expect(results.some((r) => r.unavailable)).toBe(false);
  });

  it("allows the call when the window holds max - 1 attempts, and denies at max", async () => {
    enableFlag();
    const { rateLimit, SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");
    const max = SIGNUP_RATE_LIMITS.placesPredict.max;

    mocks.rows = Array.from({ length: max - 1 }, () => ({ created_at: isoAgo(5) }));
    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "placesPredict")
    ).resolves.toMatchObject({ allowed: true, retryAfterSeconds: 0 });

    mocks.inserted = [];
    mocks.rows = Array.from({ length: max }, () => ({ created_at: isoAgo(5) }));
    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "placesPredict")
    ).resolves.toMatchObject({ allowed: false });
  });

  it("ignores attempts that have aged out of the window", async () => {
    enableFlag();
    const { rateLimit, SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");
    const rule = SIGNUP_RATE_LIMITS.mapsKey;
    mocks.rows = Array.from({ length: rule.max }, () => ({
      created_at: isoAgo(rule.windowSeconds + 5),
    }));

    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "mapsKey")
    ).resolves.toMatchObject({ allowed: true });
  });
});

describe("fail-closed", () => {
  const failClosedCases: Array<[string, { code?: string; message?: string }]> = [
    ["the ledger table is missing", { code: "42P01", message: 'relation "signup_attempts" does not exist' }],
    ["the RPC is missing from the PostgREST schema cache", { code: "PGRST202", message: "Could not find the function public.claim_signup_attempt" }],
    ["the RPC is missing in Postgres", { code: "42883", message: "function claim_signup_attempt(text, integer, integer) does not exist" }],
    ["Supabase errors for any other reason", { code: "57014", message: "canceling statement due to statement timeout" }],
  ];

  it.each(failClosedCases)("denies the call when %s", async (_label, error) => {
    enableFlag();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimit } = await import("@/lib/rateLimit");

    mocks.rpcError = error;
    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "mapsKey")
    ).resolves.toMatchObject({ allowed: false, unavailable: true });
    expect(mocks.inserted).toHaveLength(0);
    errors.mockRestore();
  });

  it("denies the call when Supabase is unconfigured or the RPC answers with an unknown shape", async () => {
    enableFlag();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rateLimit } = await import("@/lib/rateLimit");

    mocks.rpcData = [];
    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "mapsKey")
    ).resolves.toMatchObject({ allowed: false, unavailable: true });

    mocks.rpcData = { retry_after_seconds: 3 };
    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "mapsKey")
    ).resolves.toMatchObject({ allowed: false, unavailable: true });

    mocks.rpcData = undefined;
    mocks.supabaseConfigured = false;
    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "mapsKey")
    ).resolves.toMatchObject({ allowed: false, unavailable: true });
    errors.mockRestore();
  });

  it("clamps a hostile retry_after_seconds to the window", async () => {
    enableFlag();
    const { rateLimit, SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");

    mocks.rpcData = [{ allowed: false, retry_after_seconds: 99999 }];
    await expect(
      rateLimit(req("http://localhost/x", { ip: "5.5.5.5" }), "mapsKey")
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: SIGNUP_RATE_LIMITS.mapsKey.windowSeconds,
    });
  });
});

describe("hash stability", () => {
  it("is deterministic per (bucket, ip) and differs across bucket, ip and salt", async () => {
    process.env.SESSION_SECRET = "salt-one";
    const { hashRequesterIp } = await import("@/lib/rateLimit");

    const a = hashRequesterIp("mapsKey", "203.0.113.7");
    expect(hashRequesterIp("mapsKey", "203.0.113.7")).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.7");
    expect(hashRequesterIp("placesPredict", "203.0.113.7")).not.toBe(a);
    expect(hashRequesterIp("mapsKey", "203.0.113.8")).not.toBe(a);

    vi.resetModules();
    process.env.SESSION_SECRET = "salt-two";
    const salted = await import("@/lib/rateLimit");
    expect(salted.hashRequesterIp("mapsKey", "203.0.113.7")).not.toBe(a);
  });

  it("takes the left-most x-forwarded-for hop, then x-real-ip", async () => {
    const { deriveRequesterIp } = await import("@/lib/rateLimit");

    expect(
      deriveRequesterIp(new Request("http://localhost/x", { headers: { "x-forwarded-for": "198.51.100.5, 10.0.0.1" } }))
    ).toBe("198.51.100.5");
    expect(
      deriveRequesterIp(new Request("http://localhost/x", { headers: { "x-real-ip": "198.51.100.9" } }))
    ).toBe("198.51.100.9");
    expect(deriveRequesterIp(new Request("http://localhost/x"))).toBe("");
  });
});

describe("places", () => {
  it("short queries return empty without spending a rate-limit slot or calling Google", async () => {
    enableFlag();
    const { POST } = await import("@/app/api/signup/places/route");
    const response = await POST(
      req("http://localhost/api/signup/places", {
        method: "POST",
        body: JSON.stringify({ query: "12" }),
        ip: "7.7.7.7",
      })
    );

    await expect(response.json()).resolves.toEqual({ ok: true, predictions: [] });
    expect(mocks.predictions).not.toHaveBeenCalled();
    expect(mocks.inserted).toHaveLength(0);
  });

  it("routes a placeId body to Place Details and a query body to Autocomplete", async () => {
    enableFlag();
    const { POST } = await import("@/app/api/signup/places/route");

    const predict = await POST(
      req("http://localhost/api/signup/places", {
        method: "POST",
        body: JSON.stringify({ query: "120 Main St", sessionToken: "tok" }),
        ip: "7.7.7.7",
      })
    );
    expect(predict.status).toBe(200);
    await expect(predict.json()).resolves.toHaveProperty("predictions");
    expect(mocks.predictions).toHaveBeenCalledWith("120 Main St", "tok");

    const details = await POST(
      req("http://localhost/api/signup/places", {
        method: "POST",
        body: JSON.stringify({ placeId: "p1", sessionToken: "tok" }),
        ip: "7.7.7.7",
      })
    );
    expect(details.status).toBe(200);
    await expect(details.json()).resolves.toHaveProperty("details");
    expect(mocks.details).toHaveBeenCalledWith("p1", "tok");

    // Two billed calls, two ledger rows — and the two halves are separate
    // buckets, so their hashes differ.
    expect(mocks.inserted).toHaveLength(2);
    expect(mocks.inserted[0].ip_hash).not.toBe(mocks.inserted[1].ip_hash);
  });

  it("429s the details half without calling Google when its window is full", async () => {
    enableFlag();
    const { SIGNUP_RATE_LIMITS } = await import("@/lib/rateLimit");
    mocks.rows = Array.from({ length: SIGNUP_RATE_LIMITS.placesDetails.max }, () => ({
      created_at: isoAgo(1),
    }));

    const { POST } = await import("@/app/api/signup/places/route");
    const response = await POST(
      req("http://localhost/api/signup/places", {
        method: "POST",
        body: JSON.stringify({ placeId: "p1" }),
        ip: "7.7.7.7",
      })
    );

    expect(response.status).toBe(429);
    expect(mocks.details).not.toHaveBeenCalled();
  });

  it("returns a generic 500 and never echoes the upstream error text (Finding #7)", async () => {
    enableFlag();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream =
      "Google Places REQUEST_DENIED: API key not valid for referer https://internal.example — key AIzaSyServerOnly";
    mocks.predictions.mockRejectedValueOnce(new Error(upstream));

    const { POST } = await import("@/app/api/signup/places/route");
    const response = await POST(
      req("http://localhost/api/signup/places", {
        method: "POST",
        body: JSON.stringify({ query: "120 Main St" }),
        ip: "7.7.7.7",
      })
    );

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("Address lookup is unavailable right now.");
    expect(body).not.toContain("REQUEST_DENIED");
    expect(body).not.toContain("AIzaSyServerOnly");
    // The diagnostic is not lost — it goes to the log.
    expect(errors.mock.calls.flat().join(" ")).toContain("[SignupPlaces] lookup-failed");
    expect(JSON.stringify(errors.mock.calls)).toContain("REQUEST_DENIED");
    errors.mockRestore();
  });
});
