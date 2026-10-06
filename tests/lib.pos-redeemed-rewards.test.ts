import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const read = (path: string): string => readFileSync(path, "utf8");

describe("Phase 2f redeemed rewards", () => {
  it("maps redeemed_method to the partner-facing way", async () => {
    const { redeemedHow } = await import("@/lib/pos/redeemedRewards");
    expect(redeemedHow("pos_square")).toBe("square_gift_card");
    expect(redeemedHow("guest_confirm")).toBe("guest_confirm");
    expect(redeemedHow(null)).toBe("guest_confirm");
    expect(redeemedHow("pos_clover")).toBe("other");
  });

  it("the route is flag-gated, owner-authed, venue-checked", () => {
    // The flag + owner-auth + venue-ownership gate is the shared guard (lib/pos/ownerPosGuard.ts).
    const route = read("app/api/owner/pos/redeemed/route.ts");
    expect(route).toContain("guardOwnerPosVenue(request, venueId)");
    const guard = read("lib/pos/ownerPosGuard.ts");
    expect(guard).toContain("isPosIntegrationsEnabled()");
    expect(guard).toContain("requireOwnerAuth");
    expect(guard).toContain("auth.venueIds.includes(venueId)");
  });

  it("never selects or returns card ids, merchant ids or user ids, and makes no Square call", () => {
    const lib = read("lib/pos/redeemedRewards.ts");
    expect(lib).not.toMatch(/external_ref|merchant_id|gift_card_id|squareGiftCards|fetch\(/);
    expect(lib).not.toMatch(/\buserId\s*:/);
  });
});
