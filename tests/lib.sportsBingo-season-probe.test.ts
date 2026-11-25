import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hasUpcomingGamesInWindow } from "@/lib/sportsBingo";

const respond = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe("hasUpcomingGamesInWindow probe", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is true when more games exist (next_cursor) and is cached as an answer", async () => {
    const fetchMock = respond({ data: [{ id: 1 }], meta: { next_cursor: 2 } });
    vi.stubGlobal("fetch", fetchMock);
    expect(await hasUpcomingGamesInWindow("basketball_nba", 14)).toBe(true);
    expect(await hasUpcomingGamesInWindow("basketball_nba", 14)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("still treats a failed fetch as false with the short TTL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await hasUpcomingGamesInWindow("baseball_mlb", 14)).toBe(false);
  });
});
