import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Round 3 Phase 3: the odds feed returns one row per game per sportsbook, so a
// caller paging it (e.g. fetchNFLSpreadLinesFromBDL in lib/nflPickEm.ts) can
// truncate a real week's data if the page cap is too low. These tests cover
// fetchBallDontLieList's own paging/truncation-detection contract directly,
// independent of any one caller.

describe("fetchBallDontLieList paging", () => {
  const originalKey = process.env.BALLDONTLIE_API_KEY;

  beforeEach(() => {
    process.env.BALLDONTLIE_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.BALLDONTLIE_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("aggregates rows across multiple pages, including one landing on the last page within the cap", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ id: 1 }, { id: 2 }], meta: { next_cursor: "page2" } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 3 }], meta: { next_cursor: null } }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchBallDontLieList<{ id: number }>("/nfl/v1/odds", new URLSearchParams({ per_page: "100" }), 4);

    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks truncation when the page cap is hit while more pages remain", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ data: [{ id: 1 }], meta: { next_cursor: "keeps-going" } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const truncation = { truncated: false };
    const rows = await fetchBallDontLieList<{ id: number }>(
      "/nfl/v1/odds",
      new URLSearchParams({ per_page: "100" }),
      3,
      truncation
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(3);
    expect(truncation.truncated).toBe(true);
  });

  it("does not mark truncation when the last page has no next_cursor", async () => {
    const { fetchBallDontLieList } = await import("@/lib/balldontlie");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 1 }], meta: { next_cursor: null } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const truncation = { truncated: false };
    await fetchBallDontLieList<{ id: number }>("/nfl/v1/odds", new URLSearchParams({ per_page: "100" }), 4, truncation);

    expect(truncation.truncated).toBe(false);
  });
});
