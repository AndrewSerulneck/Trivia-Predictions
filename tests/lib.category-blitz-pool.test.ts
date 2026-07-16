import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  // The row `maybeSingle()` resolves to for the next resolveContinuousConfig call.
  configRow: null as Record<string, unknown> | null,
  configError: null as { message: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import {
  resolveContinuousConfig,
  CONTINUOUS_DEFAULT_ROUND_DURATION_SECONDS,
  CONTINUOUS_DEFAULT_INTERMISSION_SECONDS,
  CONTINUOUS_DEFAULT_MODE_SELECTION,
  CONTINUOUS_DEFAULT_MIN_CATEGORIES_PER_LETTER,
} from "@/lib/categoryBlitzPool";

function installConfigTableMock() {
  mocks.from.mockImplementation((table: string) => {
    expect(table).toBe("category_blitz_continuous_config");
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: mocks.configRow,
            error: mocks.configError,
          })),
        })),
      })),
    };
  });
}

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;

describe("resolveContinuousConfig", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.configRow = null;
    mocks.configError = null;
    installConfigTableMock();
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;
    } else {
      process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = ORIGINAL_FLAG;
    }
  });

  it("returns the override row when present and active", async () => {
    mocks.configRow = {
      is_active: true,
      round_duration_seconds: 90,
      intermission_seconds: 45,
      mode_selection: "weighted_reverse",
      category_pool: ["Fruits", "Animals"],
      min_categories_per_letter: 8,
    };
    // Flag off — an active override still wins regardless of the default flag.
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;

    const config = await resolveContinuousConfig("venue-1");
    expect(config).toEqual({
      isActive: true,
      roundDurationSeconds: 90,
      intermissionSeconds: 45,
      modeSelection: "weighted_reverse",
      categoryPool: ["Fruits", "Animals"],
      minCategoriesPerLetter: 8,
    });
  });

  it("treats an inactive override row as an explicit opt-out (null) even when the flag is on", async () => {
    mocks.configRow = {
      is_active: false,
      round_duration_seconds: 180,
      intermission_seconds: 300,
      mode_selection: "random",
      category_pool: [],
      min_categories_per_letter: 12,
    };
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";

    expect(await resolveContinuousConfig("venue-1")).toBeNull();
  });

  it("returns the global default when no row exists and the flag is on", async () => {
    mocks.configRow = null;
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";

    const config = await resolveContinuousConfig("venue-1");
    expect(config).toEqual({
      isActive: true,
      roundDurationSeconds: CONTINUOUS_DEFAULT_ROUND_DURATION_SECONDS,
      intermissionSeconds: CONTINUOUS_DEFAULT_INTERMISSION_SECONDS,
      modeSelection: CONTINUOUS_DEFAULT_MODE_SELECTION,
      categoryPool: [],
      minCategoriesPerLetter: CONTINUOUS_DEFAULT_MIN_CATEGORIES_PER_LETTER,
    });
  });

  it("returns null when no row exists and the flag is off (legacy behavior)", async () => {
    mocks.configRow = null;
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT;

    expect(await resolveContinuousConfig("venue-1")).toBeNull();
  });

  it("fails safe to null on a read error, even with the flag on", async () => {
    mocks.configRow = null;
    mocks.configError = { message: "boom" };
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";

    expect(await resolveContinuousConfig("venue-1")).toBeNull();
  });
});
