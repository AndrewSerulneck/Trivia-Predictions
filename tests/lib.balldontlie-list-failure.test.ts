import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Pick 'Em Phase 7.4: fetchBallDontLieJson turns a network error or a non-2xx reply into `{}`,
// which reads exactly like "no games". The optional `failure` box tells the two apart, so
// settlement never cancels a college pick because the provider was down.

vi.mock("server-only", () => ({}));

let fetchBallDontLieList: typeof import("@/lib/balldontlie").fetchBallDontLieList;

beforeAll(async () => {
  vi.stubEnv("BALLDONTLIE_API_KEY", "test-key");
  ({ fetchBallDontLieList } = await import("@/lib/balldontlie"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reply = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))));

describe("fetchBallDontLieList failure box", () => {
  it("stays clear on a real reply, even an empty one", async () => {
    reply(200, { data: [], meta: { next_cursor: null } });
    const failure = { failed: false };
    expect(await fetchBallDontLieList("/ncaaf/v1/games", new URLSearchParams(), 2, undefined, failure)).toEqual([]);
    expect(failure.failed).toBe(false);
  });

  it("is set on a non-2xx reply", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reply(503, { error: "unavailable" });
    const failure = { failed: false };
    expect(await fetchBallDontLieList("/ncaaf/v1/games", new URLSearchParams(), 2, undefined, failure)).toEqual([]);
    expect(failure.failed).toBe(true);
  });

  it("is set on a network error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("socket hang up"))));
    const failure = { failed: false };
    await fetchBallDontLieList("/ncaaf/v1/games", new URLSearchParams(), 2, undefined, failure);
    expect(failure.failed).toBe(true);
  });

  it("callers without a box behave as before", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reply(500, {});
    expect(await fetchBallDontLieList("/ncaaf/v1/games", new URLSearchParams())).toEqual([]);
  });
});
