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

const makeRequest = (path: string, opts: { host?: string; cookie?: string; userAgent?: string } = {}): NextRequest => {
  const host = opts.host ?? "hightopchallenge.com";
  const headers: Record<string, string> = { host };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.userAgent) headers["user-agent"] = opts.userAgent;
  return new NextRequest(new URL(`https://${host}${path}`), { headers });
};

const isPassThrough = (res: ReturnType<typeof proxy>): boolean =>
  res.headers.get("x-middleware-next") === "1";

describe("proxy auth-gate (domain split off — default/production)", () => {
  it("passes public routes straight through", () => {
    for (const path of ["/", "/info", "/join", "/faqs", "/advertise", "/privacy", "/terms", "/rules", "/support", "/owner/dashboard", "/api/trivia", "/admin"]) {
      expect(isPassThrough(proxy(makeRequest(path))), `expected pass-through for ${path}`).toBe(true);
    }
  });

  it("serves the play subdomain root as the game (Coming Soon placeholder retired)", () => {
    // With the placeholder gone, play./ is just the public "/" → game login,
    // pass-through on every host (the split flag is off in this describe block).
    const playRoot = proxy(makeRequest("/", { host: "play.hightopchallenge.com" }));
    expect(isPassThrough(playRoot)).toBe(true);

    const apexRoot = proxy(makeRequest("/", { host: "hightopchallenge.com" }));
    expect(isPassThrough(apexRoot)).toBe(true);

    const playJoin = proxy(makeRequest("/join", { host: "play.hightopchallenge.com" }));
    expect(isPassThrough(playJoin)).toBe(true);
  });

  it("does not expose the Coming Soon route on the apex site", () => {
    const res = proxy(makeRequest("/coming-soon", { host: "hightopchallenge.com" }));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/");
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

  it("serves play / as the game (no Coming Soon rewrite) once the split is on", () => {
    enableSplit();
    const res = proxy(makeRequest("/", { host: "play.hightopchallenge.com" }));
    // play. + "/" is a game route on the game host → no split action, and "/" is
    // public → pass-through to the game login.
    expect(isPassThrough(res)).toBe(true);
  });

  it("still applies the auth-gate to game routes served on the play host", () => {
    enableSplit();
    const res = proxy(makeRequest("/venue/brunswick-grove", { host: "play.hightopchallenge.com" }));
    // No cookies/handoff → the auth-gate redirects to / (on the play host).
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/?v=brunswick-grove");
  });
});

describe("proxy: app-link trust files (native app Phase 3)", () => {
  const WELL_KNOWN = ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"];

  it("are never touched by the matcher (they contain a dot)", async () => {
    const { config } = await import("@/proxy");
    const [pattern] = config.matcher;
    const matcher = new RegExp(`^${pattern}$`);
    for (const path of WELL_KNOWN) {
      expect(matcher.test(path), path).toBe(false);
    }
    // Sanity: the same matcher does gate an ordinary game route.
    expect(matcher.test("/venue/brunswick-grove")).toBe(true);
  });

  it("pass straight through on both hosts, with no cookies, split on or off", () => {
    for (const split of [false, true]) {
      if (split) {
        process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = "true";
        process.env.NEXT_PUBLIC_APEX_HOST = "hightopchallenge.com";
        process.env.NEXT_PUBLIC_PLAY_HOST = "play.hightopchallenge.com";
      }
      for (const host of ["hightopchallenge.com", "play.hightopchallenge.com"]) {
        for (const path of WELL_KNOWN) {
          expect(isPassThrough(proxy(makeRequest(path, { host }))), `${host}${path} split=${split}`).toBe(true);
        }
      }
    }
  });

  it("the allowance is narrow: other dot-folders and lookalikes are still gated", () => {
    expect(proxy(makeRequest("/well-known/apple-app-site-association")).status).toBe(307);
    expect(proxy(makeRequest("/.well-knownx/apple-app-site-association")).status).toBe(307);
  });
});


describe("proxy: the native app is player-only (Phase 3B.1)", () => {
  const APP_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 HightopChallengeApp/1.0.0 (ios)";
  const SAFARI_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const rewriteTarget = (res: Response): string | null => {
    const header = res.headers.get("x-middleware-rewrite");
    return header ? new URL(header).pathname : null;
  };

  it("rewrites every partner page, /tv and /admin to its static notice inside the app, on both hosts", () => {
    const cases: Array<[string, string]> = [
      ["/owner/login", "/in-app-notice/owner"],
      ["/owner/dashboard?sheet=store", "/in-app-notice/owner"],
      ["/owner/billing/setup", "/in-app-notice/owner"],
      ["/owner/signup", "/in-app-notice/owner"],
      ["/owner/display?code=AB12", "/in-app-notice/owner"],
      ["/owner", "/in-app-notice/owner"],
      ["/tv", "/in-app-notice/tv"],
      ["/admin", "/in-app-notice/admin"],
    ];
    for (const host of ["hightopchallenge.com", "play.hightopchallenge.com"]) {
      for (const [path, notice] of cases) {
        expect(rewriteTarget(proxy(makeRequest(path, { host, userAgent: APP_UA }))), `${host}${path}`).toBe(notice);
      }
    }
    // The rewrite drops the query, so the notice page stays one static page.
    const header = proxy(makeRequest("/owner/display?code=AB12", { userAgent: APP_UA })).headers.get("x-middleware-rewrite");
    expect(new URL(header ?? "https://x").search).toBe("");
  });

  it("browsers are untouched: the same pages pass straight through, with or without a UA", () => {
    for (const userAgent of [SAFARI_UA, undefined]) {
      for (const path of ["/owner/login", "/owner/dashboard", "/owner/billing/setup", "/tv", "/admin"]) {
        const res = proxy(makeRequest(path, { userAgent }));
        expect(isPassThrough(res), `${path} ua=${userAgent ? "safari" : "none"}`).toBe(true);
        expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      }
    }
  });

  it("player pages, legal pages and lookalikes are not rewritten in the app", () => {
    for (const path of ["/", "/privacy", "/support", "/delete-account", "/ownership", "/tvguide", "/administrator"]) {
      expect(rewriteTarget(proxy(makeRequest(path, { userAgent: APP_UA }))), path).toBeNull();
    }
  });

  it("with the split on, a partner page on play. still goes to the apex first (the shell then opens the browser)", () => {
    process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = "true";
    process.env.NEXT_PUBLIC_APEX_HOST = "hightopchallenge.com";
    process.env.NEXT_PUBLIC_PLAY_HOST = "play.hightopchallenge.com";
    const res = proxy(makeRequest("/owner/login", { host: "play.hightopchallenge.com", userAgent: APP_UA }));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://hightopchallenge.com/owner/login");
    expect(rewriteTarget(proxy(makeRequest("/owner/login", { host: "hightopchallenge.com", userAgent: APP_UA })))).toBe(
      "/in-app-notice/owner",
    );
  });
});
