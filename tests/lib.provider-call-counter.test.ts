import { afterEach, describe, expect, it, vi } from "vitest";
import { countProviderCall, resetProviderCallCounter } from "@/lib/providerCallCounter";

// Away-mode plan B2: the BallDontLie call baseline Vercel can't give us. One summary line per
// instance at most every 10 minutes; feeds only, never ids or query strings.

describe("the provider call counter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs one summary per 10 minutes, by feed, with ids folded", () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    resetProviderCallCounter(0);
    countProviderCall("bdl", "/ncaaf/v1/games", 1_000);
    countProviderCall("bdl", "/ncaaf/v1/odds", 2_000);
    countProviderCall("bdl", "/mma/v1/fighters/123", 3_000);
    countProviderCall("bdl", "/ncaaf/v1/games", 599_999);
    expect(log).not.toHaveBeenCalled();

    countProviderCall("bdl", "/mma/v1/fighters/456?x=1", 600_000);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe(
      "[provider-calls] minutes=10 bdl/mma/v1/fighters/:id=2 bdl/ncaaf/v1/games=2 bdl/ncaaf/v1/odds=1",
    );

    countProviderCall("bdl", "/ncaaf/v1/games", 600_001);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("is called by every BallDontLie fetch site", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["lib/balldontlie.ts", "lib/ballDontLieClient.ts", "lib/pickem.ts"]) {
      const source = readFileSync(file, "utf8");
      const fetches = source.match(/await fetch\(/g)?.length ?? 0;
      const counts = source.match(/countProviderCall\("bdl"/g)?.length ?? 0;
      expect(counts, file).toBe(fetches);
    }
  });
});
