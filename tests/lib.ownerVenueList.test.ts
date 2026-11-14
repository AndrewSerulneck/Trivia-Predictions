import { beforeEach, describe, expect, it, vi } from "vitest";

// listOwnerVenues: the display code is read only when asked for (the Display page), in the
// same query, so the dashboard's first load is unchanged.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  rows: [] as Record<string, unknown>[],
  missingColumn: false,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const chain = {
    select: (columns: string) => {
      mocks.select(columns);
      return chain;
    },
    in: () => chain,
    returns: () => {
      const columns = mocks.select.mock.lastCall?.[0] as string;
      if (mocks.missingColumn && columns.includes("display_code")) {
        return Promise.resolve({ data: null, error: { code: "42703", message: "column venues.display_code does not exist" } });
      }
      return Promise.resolve({ data: mocks.rows, error: null });
    },
  };
  return { supabaseAdmin: { from: () => chain } };
});

import { listOwnerVenues } from "@/lib/ownerVenueList";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.missingColumn = false;
  mocks.rows = [{ id: "v1", name: "Bar", display_name: "The Bar", display_code: "K7M2" }];
});

describe("listOwnerVenues", () => {
  it("leaves the display code out by default", async () => {
    expect(await listOwnerVenues(["v1"])).toEqual([{ id: "v1", name: "The Bar" }]);
    expect(mocks.select).toHaveBeenCalledWith("id, name, display_name");
  });

  it("adds it with withDisplayCode", async () => {
    expect(await listOwnerVenues(["v1"], { withDisplayCode: true })).toEqual([
      { id: "v1", name: "The Bar", displayCode: "K7M2" },
    ]);
    expect(mocks.select).toHaveBeenCalledWith("id, name, display_name, display_code");
  });

  it("falls back to no codes when the column isn't there yet (deploy before db push)", async () => {
    mocks.missingColumn = true;
    mocks.rows = [{ id: "v1", name: "Bar", display_name: null }];
    expect(await listOwnerVenues(["v1"], { withDisplayCode: true })).toEqual([
      { id: "v1", name: "Bar", displayCode: null },
    ]);
    expect(mocks.select).toHaveBeenLastCalledWith("id, name, display_name");
  });
});
