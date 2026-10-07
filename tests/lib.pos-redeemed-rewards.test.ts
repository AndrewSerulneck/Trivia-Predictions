import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A minimal PostgREST stand-in for listRedeemedRewards: every filter is accepted, each table
// answers with its fixed rows.
const tables = vi.hoisted(() => ({ rows: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/lib/supabaseAdmin", () => {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      returns: () => builder,
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: tables.rows[table] ?? [], error: null }).then(resolve),
    };
    return builder;
  };
  return { supabaseAdmin: { from } };
});

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

  // docs/square-scannable-prizes-plan.md Phase S2: no change was needed — a scannable coupon is
  // claimed with pos_square like any Square gift card, so the list labels it by method.
  it("Phase S2: a scannable dollar menu prize reads as its terms, taken as a Square gift card", async () => {
    tables.rows = {
      challenge_campaign_redemptions: [
        {
          id: "r1",
          winner_user_id: "u1",
          prize_redeemed_at: "2026-10-07T01:00:00Z",
          redeemed_method: "pos_square",
          prize_type: null,
          prize_gift_certificate_amount: null,
          prize_kind: "menu_item",
          prize_menu_item: "appetizer",
          prize_menu_item_name: null,
          prize_discount_kind: "dollar",
          prize_discount_value: 5,
        },
      ],
      pos_reward_applications: [
        { redemption_id: "r1", status: "succeeded", amount_cents: 500, external_detail: { balance_cents: 200, first_redeemed_at: "x", last_activity_at: "2026-10-07T02:00:00Z" } },
      ],
      users: [{ id: "u1", username: "pat" }],
    };
    const { listRedeemedRewards } = await import("@/lib/pos/redeemedRewards");
    const [row] = await listRedeemedRewards("venue-1");
    expect(row).toMatchObject({ how: "square_gift_card", amountCents: 500, balanceCents: 200, username: "pat" });
    expect(row.prize).toMatch(/\$5 off/i);
  });
});
