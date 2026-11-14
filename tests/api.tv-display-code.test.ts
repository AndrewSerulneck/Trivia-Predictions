import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/live-trivia-pregame-and-display-cleanup-plan.md Phase 4 — GET /tv/<code>, the short
// display link. Known code → that venue's display; anything else → /info. A malformed code
// never reaches the database.

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const chain = {
    select: (columns: string) => {
      mocks.select(columns);
      return chain;
    },
    eq: (column: string, value: string) => {
      mocks.eq(column, value);
      return chain;
    },
    maybeSingle: () => mocks.maybeSingle(),
  };
  return {
    supabaseAdmin: {
      from: (table: string) => {
        mocks.from(table);
        return chain;
      },
    },
  };
});

import { GET } from "@/app/tv/[code]/route";
import { gameUrl, marketingUrl } from "@/lib/domainSplit";

const call = (code: string) =>
  GET(new Request(`https://hightopchallenge.com/tv/${code}`) as never, { params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.maybeSingle.mockResolvedValue({ data: { id: "venue-abc" }, error: null });
});

describe("GET /tv/<code>", () => {
  it("redirects a known code to the venue's display (307, no-store)", async () => {
    const res = await call("K7M2");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(gameUrl("/venue/venue-abc/screen"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.from).toHaveBeenCalledWith("venues");
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(mocks.eq).toHaveBeenCalledWith("display_code", "K7M2");
  });

  it("is case-insensitive", async () => {
    await call("k7m2");
    expect(mocks.eq).toHaveBeenCalledWith("display_code", "K7M2");
  });

  it("sends an unknown code to /info", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await call("ZZZZ");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(marketingUrl("/info"));
  });

  it("sends a database error to /info", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "down" } });
    const res = await call("K7M2");
    expect(res.headers.get("location")).toBe(marketingUrl("/info"));
  });

  it.each(["K7M", "K7M22", "IL0U", "K7M%", "help", ""])("sends malformed %j to /info without a read", async (code) => {
    const res = await call(code);
    expect(res.headers.get("location")).toBe(marketingUrl("/info"));
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
