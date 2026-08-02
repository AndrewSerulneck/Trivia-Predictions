import { describe, expect, it } from "vitest";
import { shouldShowLegalNotice } from "@/components/ui/AppShell";

describe("shouldShowLegalNotice", () => {
  it("shows on a non-venue, non-admin, non-fullscreen route", () => {
    expect(shouldShowLegalNotice("/join")).toBe(true);
    expect(shouldShowLegalNotice("/owner/billing")).toBe(true);
    expect(shouldShowLegalNotice("/redeem-prizes")).toBe(true);
  });

  it("is suppressed on /info (a fullscreen route)", () => {
    expect(shouldShowLegalNotice("/info")).toBe(false);
  });

  it("is suppressed on the venue home page (fullscreen route)", () => {
    expect(shouldShowLegalNotice("/venue/abc123")).toBe(false);
  });

  it("is suppressed on admin routes", () => {
    expect(shouldShowLegalNotice("/admin")).toBe(false);
    expect(shouldShowLegalNotice("/admin/rewards")).toBe(false);
  });

  it("is suppressed on fullscreen game routes", () => {
    expect(shouldShowLegalNotice("/trivia")).toBe(false);
    expect(shouldShowLegalNotice("/category-blitz")).toBe(false);
    expect(shouldShowLegalNotice("/pickem")).toBe(false);
  });
});
