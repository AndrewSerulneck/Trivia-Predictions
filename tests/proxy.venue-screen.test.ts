import { describe, expect, it } from "vitest";
import { isVenueScreenPath } from "@/proxy";

describe("venue screen proxy routing", () => {
  it("treats the public venue screen route as shareable", () => {
    expect(isVenueScreenPath("/venue/brunswick-grove/screen")).toBe(true);
    expect(isVenueScreenPath("/venue/brunswick-grove/screen/")).toBe(true);
  });

  it("does not make the full venue hub public", () => {
    expect(isVenueScreenPath("/venue/brunswick-grove")).toBe(false);
    expect(isVenueScreenPath("/venue/brunswick-grove/redeem")).toBe(false);
  });
});
