import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// proxy.ts IS the active edge gate in Next.js 16 (auto-detected — Next 16 renamed
// the `middleware.ts` convention to `proxy.ts`; the build lists it as "Proxy
// (Middleware)"). These tests pin its LIVE behavior:
//   - The cookie auth-gate is always on (redirects unauthenticated non-public
//     requests to `/`) — this is production behavior, not a flag.
//   - The Phase 6 domain split is layered in front, inert unless
//     NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED is on (see tests/lib.domainSplit.test.ts
//     for exhaustive decision coverage).

const SPLIT_KEYS = [
  "NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED",
  "NEXT_PUBLIC_APEX_HOST",
  "NEXT_PUBLIC_PLAY_HOST",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of SPLIT_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of SPLIT_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const makeRequest = (path: string, opts: { host?: string; cookie?: string } = {}): NextRequest => {
  const host = opts.host ?? "hightopchallenge.com";
  const headers: Record<string, string> = { host };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new NextRequest(new URL(`https://${host}${path}`), { headers });
};

const isPassThrough = (res: ReturnType<typeof proxy>): boolean =>
  res.headers.get("x-middleware-next") === "1";

describe("proxy auth-gate (domain split off — default/production)", () => {
  it("passes public routes straight through", () => {
    for (const path of ["/", "/info", "/join", "/faqs", "/advertise", "/owner/dashboard", "/api/trivia", "/admin"]) {
      expect(isPassThrough(proxy(makeRequest(path))), `expected pass-through for ${path}`).toBe(true);
    }
  });

  it("passes the public venue screen through but gates the venue hub", () => {
    expect(isPassThrough(proxy(makeRequest("/venue/brunswick-grove/screen")))).toBe(true);
    const hub = proxy(makeRequest("/venue/brunswick-grove"));
    expect(hub.status).toBe(307);
    expect(hub.headers.get("location")).toContain("/?v=brunswick-grove");
  });

  it("redirects an unauthenticated non-public route to /", () => {
    const res = proxy(makeRequest("/trivia"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
  });

  it("passes the TV pairing page + its APIs through with no cookies (Phase 5b)", () => {
    // The TV has no auth cookies — /tv and /api/tv-pair/* must be public.
    for (const path of ["/tv", "/api/tv-pair", "/api/tv-pair/XK49PM"]) {
      expect(isPassThrough(proxy(makeRequest(path))), `expected pass-through for ${path}`).toBe(true);
    }
    // The owner claim API is under /api (public at the edge) but self-guards with
    // requireOwnerAuth — the gate must still let it reach the handler.
    expect(isPassThrough(proxy(makeRequest("/api/owner/tv-pair/claim")))).toBe(true);
  });

  it("still gates an unrelated non-public route after adding the /tv carve-out", () => {
    // Guards against the carve-out accidentally widening the gate: /tvxyz is NOT /tv.
    const res = proxy(makeRequest("/tvshows"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
  });

  it("allows a gated route when identity cookies are present", () => {
    const res = proxy(makeRequest("/venue/brunswick-grove", { cookie: "tp_venue_id=brunswick-grove; tp_user_id=u_123" }));
    expect(isPassThrough(res)).toBe(true);
  });

  it("allows a gated route with a fresh entry handoff (no cookies)", () => {
    const at = Date.now();
    const res = proxy(
      makeRequest(`/venue/brunswick-grove?entryUser=u_123&entryVenue=brunswick-grove&entryAt=${at}`),
    );
    expect(isPassThrough(res)).toBe(true);
  });
});

describe("proxy domain split (flag on) layers in front of the auth-gate", () => {
  const enableSplit = () => {
    process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = "true";
    process.env.NEXT_PUBLIC_APEX_HOST = "hightopchallenge.com";
    process.env.NEXT_PUBLIC_PLAY_HOST = "play.hightopchallenge.com";
  };

  it("redirects a game route on the apex to play. (before any auth check)", () => {
    enableSplit();
    const res = proxy(makeRequest("/venue/brunswick-grove", { host: "hightopchallenge.com" }));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://play.hightopchallenge.com/venue/brunswick-grove");
  });

  it("rewrites apex / to the marketing /info experience", () => {
    enableSplit();
    const res = proxy(makeRequest("/", { host: "hightopchallenge.com" }));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/info");
  });

  it("still applies the auth-gate to game routes served on the play host", () => {
    enableSplit();
    const res = proxy(makeRequest("/venue/brunswick-grove", { host: "play.hightopchallenge.com" }));
    // No cookies/handoff → the auth-gate redirects to / (on the play host).
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/?v=brunswick-grove");
  });
});
