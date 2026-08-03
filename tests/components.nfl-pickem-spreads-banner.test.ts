import { describe, expect, it } from "vitest";
import { getSpreadsBannerState } from "@/components/nfl-pickem/NFLPickEmGameList";

describe("getSpreadsBannerState", () => {
  it("is null for a healthy standard-mode venue (both flags undefined)", () => {
    expect(
      getSpreadsBannerState({ scoringModeUnresolved: undefined, spreadsUnavailable: undefined })
    ).toBeNull();
  });

  it("is null for a healthy spread-mode venue (lines present)", () => {
    expect(
      getSpreadsBannerState({ scoringModeUnresolved: undefined, spreadsUnavailable: false })
    ).toBeNull();
  });

  it("is 'unavailable' when a spread venue's lines failed to load", () => {
    expect(
      getSpreadsBannerState({ scoringModeUnresolved: undefined, spreadsUnavailable: true })
    ).toBe("unavailable");
  });

  it("is 'unresolved' when the venue's scoring mode could not be confirmed", () => {
    expect(
      getSpreadsBannerState({ scoringModeUnresolved: true, spreadsUnavailable: undefined })
    ).toBe("unresolved");
  });

  it("prefers 'unresolved' over 'unavailable' if somehow both are set", () => {
    expect(
      getSpreadsBannerState({ scoringModeUnresolved: true, spreadsUnavailable: true })
    ).toBe("unresolved");
  });
});
