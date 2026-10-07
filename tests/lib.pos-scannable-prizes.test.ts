import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/square-scannable-prizes-plan.md Phase S1 — the prize_pos_delivery column, its award-time
// snapshot and the save plumbing. The money path (Phase S2) is tested in
// tests/lib.pos-square-gift-cards.test.ts and tests/lib.pos-square-discounts.test.ts; the
// "never both" rule between the two is pinned here.

const read = (path: string): string => readFileSync(join(__dirname, "..", path), "utf8");

const writes = vi.hoisted(() => ({ insert: [] as Record<string, unknown>[], update: [] as Record<string, unknown>[] }));

const from = vi.hoisted(() =>
  vi.fn((table: string) => {
    let payload: Record<string, unknown> = {};
    const builder = {
      insert(row: Record<string, unknown>) {
        writes.insert.push(row);
        payload = row;
        return builder;
      },
      update(row: Record<string, unknown>) {
        writes.update.push(row);
        payload = row;
        return builder;
      },
      select: () => builder,
      eq: () => builder,
      async single() {
        if (table !== "challenge_campaigns") return { data: null, error: { message: "unexpected table" } };
        return {
          data: { id: "camp-1", created_at: "2026-10-06T00:00:00Z", name: "R", rules: "r", winner_user_id: null, ...payload },
          error: null,
        };
      },
    };
    return builder;
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from } }));

import {
  PRIZE_POS_DELIVERY_INVALID_MESSAGE,
  createChallengeCampaign,
  redemptionPrizeSnapshot,
  updateChallengeCampaign,
} from "@/lib/challengeCampaigns";
import {
  isScannableGiftCardPrize,
  isSquareGiftCardPrize,
  normalizePrizePosDelivery,
  prizeCanBeScannableGiftCard,
  squareGiftCardDollars,
} from "@/lib/pos/prizeDelivery";
import { squareDiscountSpec } from "@/lib/pos/squareDiscountSpec";

beforeEach(() => {
  writes.insert.length = 0;
  writes.update.length = 0;
});

describe("lib/pos/prizeDelivery.ts", () => {
  it("normalizes: only the two known values survive", () => {
    expect(normalizePrizePosDelivery("gift_card")).toBe("gift_card");
    expect(normalizePrizePosDelivery("discount")).toBe("discount");
    for (const other of [null, undefined, "", "GIFT_CARD", "card", 1, {}]) expect(normalizePrizePosDelivery(other)).toBeNull();
  });

  it("only a dollar-off menu prize can be a scannable gift card", () => {
    expect(prizeCanBeScannableGiftCard("menu_item", "dollar")).toBe(true);
    expect(prizeCanBeScannableGiftCard("menu_item", "percent")).toBe(false);
    expect(prizeCanBeScannableGiftCard("gift_card", null)).toBe(false);
    expect(prizeCanBeScannableGiftCard(null, null)).toBe(false);
  });

  it("the predicate needs BOTH the choice and the prize shape", () => {
    const dollar = { prizeKind: "menu_item", prizeDiscountKind: "dollar" } as const;
    expect(isScannableGiftCardPrize({ ...dollar, prizePosDelivery: "gift_card" })).toBe(true);
    expect(isScannableGiftCardPrize({ ...dollar, prizePosDelivery: "discount" })).toBe(false);
    expect(isScannableGiftCardPrize({ ...dollar, prizePosDelivery: null })).toBe(false);
    // A forged or stale value on any other prize is ignored.
    expect(isScannableGiftCardPrize({ prizeKind: "menu_item", prizeDiscountKind: "percent", prizePosDelivery: "gift_card" })).toBe(false);
    expect(isScannableGiftCardPrize({ prizeKind: "gift_card", prizeDiscountKind: null, prizePosDelivery: "gift_card" })).toBe(false);
  });
});

describe("squareGiftCardDollars — valued by prizePosValueCents (the one home)", () => {
  it("dollars for a scannable prize or a gift card, capped like the funding; null otherwise", () => {
    const scannable = { prizeKind: "menu_item", prizeDiscountKind: "dollar", prizePosDelivery: "gift_card" } as const;
    expect(squareGiftCardDollars({ ...scannable, prizeDiscountValue: 5 })).toBe(5);
    expect(squareGiftCardDollars({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 })).toBe(25);
    expect(squareGiftCardDollars({ ...scannable, prizeDiscountValue: 15_000 })).toBe(10_000);
    expect(squareGiftCardDollars({ ...scannable, prizePosDelivery: null, prizeDiscountValue: 5 })).toBeNull();
  });
});

describe("Phase S2: a coupon is a Square gift card OR a Square discount, never both", () => {
  it("isSquareGiftCardPrize: gift cards, legacy gift certificates, and scannable dollar prizes only", () => {
    const base = { prizeType: null, prizeDiscountKind: null, prizePosDelivery: null };
    expect(isSquareGiftCardPrize({ ...base, prizeKind: "gift_card" })).toBe(true);
    expect(isSquareGiftCardPrize({ ...base, prizeKind: null, prizeType: "gift_certificate" })).toBe(true);
    expect(isSquareGiftCardPrize({ ...base, prizeKind: "menu_item", prizeDiscountKind: "dollar", prizePosDelivery: "gift_card" })).toBe(true);
    expect(isSquareGiftCardPrize({ ...base, prizeKind: "menu_item", prizeDiscountKind: "dollar" })).toBe(false);
    expect(isSquareGiftCardPrize({ ...base, prizeKind: "menu_item", prizeDiscountKind: "dollar", prizePosDelivery: "discount" })).toBe(false);
    expect(isSquareGiftCardPrize({ ...base, prizeKind: "menu_item", prizeDiscountKind: "percent", prizePosDelivery: "gift_card" })).toBe(false);
    // A snapshotted new-model kind wins over the legacy prize_type.
    expect(isSquareGiftCardPrize({ ...base, prizeKind: "menu_item", prizeType: "gift_certificate" })).toBe(false);
  });

  it("over every prize shape, the wallet's two offers never overlap", () => {
    // attachSquareGiftCardStates offers a card when isSquareGiftCardPrize; attachSquareDiscountStates
    // offers a discount when squareDiscountSpec is non-null AND the prize is not scannable.
    const kinds = ["gift_card", "menu_item", null] as const;
    const discountKinds = ["dollar", "percent", null] as const;
    const deliveries = ["gift_card", "discount", null, "forged"];
    let scannable = 0;
    for (const prizeKind of kinds)
      for (const prizeDiscountKind of discountKinds)
        for (const prizePosDelivery of deliveries) {
          const prize = { prizeKind, prizeDiscountKind, prizePosDelivery, prizeType: null };
          const card = isSquareGiftCardPrize(prize);
          const discount =
            !isScannableGiftCardPrize(prize) &&
            squareDiscountSpec({
              prizeKind,
              prizeMenuItem: "appetizer",
              prizeMenuItemName: null,
              prizeDiscountKind,
              prizeDiscountValue: 5,
              prizePosValueCents: null,
            }) !== null;
          expect({ prize, both: card && discount }).toEqual({ prize, both: false });
          if (card && prizeKind === "menu_item") scannable += 1;
        }
    // Exactly one shape is a scannable menu card: dollar + gift_card.
    expect(scannable).toBe(1);
  });
});

describe("createChallengeCampaign — prize_pos_delivery", () => {
  const base = { name: "Live Trivia Challenge", rules: "Win.", prizeKind: "menu_item" as const, prizeMenuItem: "appetizer" as const };

  it("writes 'gift_card' for a dollar-off menu prize", async () => {
    await createChallengeCampaign({ ...base, prizeDiscountKind: "dollar", prizeDiscountValue: 5, prizePosDelivery: "gift_card" });
    expect(writes.insert[0].prize_pos_delivery).toBe("gift_card");
  });

  it("never sends the column otherwise (deploy-skew safety: null and 'discount' mean the same)", async () => {
    await createChallengeCampaign({ ...base, prizeDiscountKind: "dollar", prizeDiscountValue: 5 });
    await createChallengeCampaign({ ...base, prizeDiscountKind: "dollar", prizeDiscountValue: 5, prizePosDelivery: "discount" });
    await createChallengeCampaign({ ...base, prizeDiscountKind: "dollar", prizeDiscountValue: 5, prizePosDelivery: null });
    for (const row of writes.insert) expect(row).not.toHaveProperty("prize_pos_delivery");
  });

  it("refuses 'gift_card' on a percent-off or gift-card prize", async () => {
    await expect(
      createChallengeCampaign({ ...base, prizeDiscountKind: "percent", prizeDiscountValue: 50, prizePosDelivery: "gift_card" }),
    ).rejects.toThrow(PRIZE_POS_DELIVERY_INVALID_MESSAGE);
    await expect(
      createChallengeCampaign({ name: "GC", rules: "Win.", prizeKind: "gift_card", prizeGiftCertificateAmount: 25, prizePosDelivery: "gift_card" }),
    ).rejects.toThrow(PRIZE_POS_DELIVERY_INVALID_MESSAGE);
    expect(writes.insert).toHaveLength(0);
  });
});

describe("updateChallengeCampaign — prize_pos_delivery", () => {
  const dollarPrize = { id: "camp-1", prizeKind: "menu_item" as const, prizeMenuItem: "appetizer" as const, prizeDiscountKind: "dollar" as const, prizeDiscountValue: 5 };

  it("sets and clears it alongside the prize", async () => {
    await updateChallengeCampaign({ ...dollarPrize, prizePosDelivery: "gift_card" });
    await updateChallengeCampaign({ ...dollarPrize, prizePosDelivery: "discount" });
    expect(writes.update.map((row) => row.prize_pos_delivery)).toEqual(["gift_card", null]);
  });

  it("leaves the column untouched when not sent (every existing caller)", async () => {
    await updateChallengeCampaign({ id: "camp-1", isActive: false });
    await updateChallengeCampaign(dollarPrize);
    for (const row of writes.update) expect(row).not.toHaveProperty("prize_pos_delivery");
  });

  it("refuses 'gift_card' on another prize shape, or without the prize", async () => {
    await expect(
      updateChallengeCampaign({ ...dollarPrize, prizeDiscountKind: "percent", prizePosDelivery: "gift_card" }),
    ).rejects.toThrow(PRIZE_POS_DELIVERY_INVALID_MESSAGE);
    await expect(updateChallengeCampaign({ id: "camp-1", prizePosDelivery: "gift_card" })).rejects.toThrow(/together with prizeKind/);
    expect(writes.update).toHaveLength(0);
  });

  it("a prize edit to a shape that can't be scannable clears it instead of tripping the shape check", async () => {
    await updateChallengeCampaign({ ...dollarPrize, prizeDiscountKind: "percent" });
    await updateChallengeCampaign({ id: "camp-1", prizeKind: "gift_card", prizeGiftCertificateAmount: 10 });
    expect(writes.update.map((row) => row.prize_pos_delivery)).toEqual([null, null]);
  });
});

describe("leaderboard coupons keep today's behaviour", () => {
  it("redemptionPrizeSnapshot does not carry the delivery (see its doc comment)", () => {
    const snapshot = redemptionPrizeSnapshot({
      name: "R",
      prizeType: null,
      prizeGiftCertificateAmount: null,
      prizeKind: "menu_item",
      prizeMenuItem: "appetizer",
      prizeMenuItemName: null,
      prizeDiscountKind: "dollar",
      prizeDiscountValue: 5,
    });
    expect(snapshot).not.toHaveProperty("prize_pos_delivery");
  });

  it("the campaign SELECT list stays without the column (deploy-skew rule, like prize_pos_value_cents)", () => {
    const source = read("lib/challengeCampaigns.ts");
    const selectList = source.match(/const CAMPAIGN_SELECT_COLUMNS =\s*"([^"]+)"/)?.[1] ?? "";
    expect(selectList).toContain("prize_discount_value");
    expect(selectList).not.toContain("prize_pos_delivery");
  });
});

describe("migration 20261007030714_square_scannable_prizes.sql", () => {
  const sql = read("supabase/migrations/20261007030714_square_scannable_prizes.sql");

  it("adds the column to both tables with the value check, and the shape check on campaigns only", () => {
    for (const table of ["challenge_campaigns", "challenge_campaign_redemptions"]) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table}\\s+add column if not exists prize_pos_delivery text[\\s\\S]*?in \\('discount', 'gift_card'\\)`),
      );
    }
    expect(sql).toContain("add constraint challenge_campaigns_prize_pos_delivery_shape_check");
    // NULL-safe comparisons: a legacy row with prize_kind NULL must FAIL the check.
    expect(sql).toContain("prize_kind is not distinct from 'menu_item' and prize_discount_kind is not distinct from 'dollar'");
    expect(sql).not.toMatch(/challenge_campaign_redemptions\s+add constraint/);
  });

  it("re-creates award_cycle_winner identically except for the snapshotted delivery", () => {
    const body = (text: string) =>
      (text.match(/as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "")
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, " ")
        .trim();
    const before = body(read("supabase/migrations/20261004192844_pos_foundation.sql"));
    const after = body(sql);
    expect(after).not.toBe("");
    expect(after).toContain("c.prize_pos_value_cents, c.prize_pos_delivery");
    expect(
      after
        .replace(", prize_pos_value_cents, prize_pos_delivery", ", prize_pos_value_cents")
        .replace(", c.prize_pos_value_cents, c.prize_pos_delivery", ", c.prize_pos_value_cents"),
    ).toBe(before);
  });

  it("keeps the function's signature, revoke and grant", () => {
    const sig = "public.award_cycle_winner(uuid, timestamptz, uuid, text, integer, integer, text, numeric, timestamptz)";
    expect(sql).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
    expect(sql).toContain(`grant execute on function ${sig} to service_role;`);
    expect(sql).not.toMatch(/drop function/i);
  });
});
