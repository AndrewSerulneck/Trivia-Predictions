import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Plan 6.3 (§13 F2): no PostgREST request carries more than POSTGREST_ID_CHUNK ids in its URL.

type Call = { overlaps: number };
const calls: Call[] = [];
const rowsByVenue = new Map<string, { id: string; created_at: string; venue_ids: string[] }>();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => {
  const query = () => {
    let wanted: string[] = [];
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      overlaps: (_col: string, values: string[]) => {
        calls.push({ overlaps: values.length });
        wanted = values;
        return builder;
      },
      returns: () => builder,
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
        const seen = new Map<string, unknown>();
        for (const venue of wanted) {
          const row = rowsByVenue.get(venue);
          if (row) seen.set(row.id, row);
        }
        return Promise.resolve(resolve({ data: [...seen.values()], error: null }));
      },
    };
    return builder;
  };
  return { supabaseAdmin: { from: () => query() } };
});

import { POSTGREST_ID_CHUNK, chunkIds } from "@/lib/postgrestIds";
import { listActiveSquaresPrizeCampaigns } from "@/lib/challengeCampaigns";
import { squaresBlockedLabel } from "@/lib/squares";

describe("chunkIds", () => {
  it("splits into lists of at most POSTGREST_ID_CHUNK, in order", () => {
    expect(POSTGREST_ID_CHUNK).toBe(150);
    const ids = Array.from({ length: 301 }, (_, i) => i);
    const chunks = chunkIds(ids);
    expect(chunks.map((c) => c.length)).toEqual([150, 150, 1]);
    expect(chunks.flat()).toEqual(ids);
    expect(chunkIds([])).toEqual([]);
    expect(chunkIds([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

describe("listActiveSquaresPrizeCampaigns", () => {
  it("reads in chunks of venues and returns each prize once, oldest first", async () => {
    const venues = Array.from({ length: 320 }, (_, i) => `venue-${i}`);
    const shared = { id: "prize-shared", created_at: "2027-01-20T10:00:00.000+00:00", venue_ids: ["venue-1", "venue-200"] };
    const early = { id: "prize-early", created_at: "2027-01-10T10:00:00.000+00:00", venue_ids: ["venue-300"] };
    rowsByVenue.set("venue-1", shared);
    rowsByVenue.set("venue-200", shared);
    rowsByVenue.set("venue-300", early);
    const prizes = await listActiveSquaresPrizeCampaigns(venues);
    expect(calls.map((c) => c.overlaps)).toEqual([150, 150, 20]);
    expect(prizes.map((p) => p.id)).toEqual(["prize-early", "prize-shared"]);
  });
});

describe("Squares id lists stay chunked (contract)", () => {
  it("every .in()/.overlaps() over a list in the Squares payers goes through chunkIds", () => {
    for (const file of ["lib/squaresSettlement.ts", "lib/squaresPrizeAwards.ts"]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      const lists = [...source.matchAll(/\.(?:in|overlaps)\("[a-z_]+",\s*([A-Za-z_.]+)\)/g)].map((m) => m[1]);
      expect(lists.length, file).toBeGreaterThan(0);
      for (const list of lists) expect(list, `${file}: ${list}`).toBe("chunk");
    }
  });
});

describe("squaresBlockedLabel", () => {
  it("counts results that need a look", () => {
    expect(squaresBlockedLabel(1)).toBe("1 result needs a look");
    expect(squaresBlockedLabel(3)).toBe("3 results need a look");
  });
});
