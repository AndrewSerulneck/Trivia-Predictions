import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MERCH_CATALOG, MERCH_MAX_UNIT_QTY, getMerchProduct, type MerchProduct } from "@/lib/merchCatalog";
import {
  buildMerchOrderDraft,
  cartLines,
  cartSummary,
  clampUnitQuantity,
  formatCents,
  formatCentsShort,
  isValidPack,
  lineTotalCents,
} from "@/lib/merchPricing";

const product = (id: Parameters<typeof getMerchProduct>[0]): MerchProduct => {
  const found = getMerchProduct(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("merch pricing", () => {
  it.each(["coasters-round", "coasters-square"] as const)("%s pack prices", (id) => {
    const p = product(id);
    expect([100, 250, 500, 1000].map((q) => lineTotalCents(p, q))).toEqual([3000, 6000, 10000, 17500]);
  });

  it("rejects non-tier coaster quantities", () => {
    const p = product("coasters-round");
    expect(isValidPack(p, 250)).toBe(true);
    expect(isValidPack(p, 300)).toBe(false);
    expect(lineTotalCents(p, 300)).toBe(0);
    expect(lineTotalCents(p, 0)).toBe(0);
  });

  it("prices tents at $4 and card sets at $8", () => {
    expect(lineTotalCents(product("table-tents"), 6)).toBe(2400);
    expect(lineTotalCents(product("table-card-set"), 3)).toBe(2400);
    expect(lineTotalCents(product("table-tents"), 1000)).toBe(MERCH_MAX_UNIT_QTY * 400);
  });

  it("clamps typed quantities", () => {
    expect(clampUnitQuantity(-1, 100)).toBe(0);
    expect(clampUnitQuantity(0, 100)).toBe(0);
    expect(clampUnitQuantity(100, 100)).toBe(100);
    expect(clampUnitQuantity(101, 100)).toBe(100);
    expect(clampUnitQuantity(NaN, 100)).toBe(0);
    expect(clampUnitQuantity("12abc", 100)).toBe(0);
    expect(clampUnitQuantity("", 100)).toBe(0);
    expect(clampUnitQuantity(" 12 ", 100)).toBe(12);
    expect(clampUnitQuantity(2.9, 100)).toBe(2);
    expect(clampUnitQuantity(Infinity, 100)).toBe(0);
  });

  it("handles an empty cart", () => {
    expect(cartSummary({})).toEqual({ lineCount: 0, pieceCount: 0, subtotalCents: 0 });
    expect(cartLines({})).toEqual([]);
  });

  it("totals a mixed cart", () => {
    const cart = { "coasters-round": 250, "table-tents": 6, "table-card-set": 2 };
    expect(cartSummary(cart)).toEqual({ lineCount: 3, pieceCount: 258, subtotalCents: 6000 + 2400 + 1600 });
  });

  it("builds draft lines only for quantity > 0, in catalog order", () => {
    const draft = buildMerchOrderDraft(
      { "table-card-set": 2, "coasters-square": 100, "table-tents": 0, "coasters-round": 7 },
      { id: "venue-1", name: "Test Bar" },
    );
    expect(draft.venueId).toBe("venue-1");
    expect(draft.currency).toBe("usd");
    expect(draft.lines.map((l) => [l.productId, l.sku, l.quantity, l.lineTotalCents])).toEqual([
      ["coasters-square", "HTC-CST-SQ-100", 100, 3000],
      ["table-card-set", "HTC-CARDSET", 2, 1600],
    ]);
    expect(draft.subtotalCents).toBe(4600);
  });

  it("formats money", () => {
    expect(formatCents(3000)).toBe("$30.00");
    expect(formatCents(17500)).toBe("$175.00");
  });

  it("derives no per-piece price: every draft line is whole, integer cents", () => {
    const draft = buildMerchOrderDraft(
      { "coasters-round": 1000, "coasters-square": 250, "table-tents": 3 },
      { id: "venue-1", name: "Test Bar" },
    );
    for (const line of draft.lines) {
      expect(Object.keys(line).sort()).toEqual(["lineTotalCents", "productId", "quantity", "sku"]);
      expect(Number.isInteger(line.lineTotalCents)).toBe(true);
    }
  });
});

describe("merch catalog", () => {
  const skus = MERCH_CATALOG.flatMap((p) =>
    p.pricing.kind === "pack" ? p.pricing.packs.map((k) => k.sku) : [p.pricing.sku],
  );

  it("has four products with unique ids and SKUs", () => {
    expect(MERCH_CATALOG).toHaveLength(4);
    expect(new Set(MERCH_CATALOG.map((p) => p.id)).size).toBe(4);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("keeps pack tiers ascending in quantity and price, all in integer cents", () => {
    for (const p of MERCH_CATALOG) {
      if (p.pricing.kind !== "pack") continue;
      const { packs } = p.pricing;
      for (let i = 1; i < packs.length; i++) {
        expect(packs[i].quantity).toBeGreaterThan(packs[i - 1].quantity);
        expect(packs[i].priceCents).toBeGreaterThan(packs[i - 1].priceCents);
      }
      for (const pack of packs) expect(Number.isInteger(pack.priceCents)).toBe(true);
    }
  });

  it("points every image at an existing file", () => {
    for (const p of MERCH_CATALOG) {
      expect(p.image.src.startsWith("/store/web/")).toBe(true);
      expect(existsSync(join(process.cwd(), "public", p.image.src))).toBe(true);
      expect(p.image.alt.length).toBeGreaterThan(10);
    }
  });

  it("formatCentsShort drops .00 only for whole dollars", () => {
    expect([3000, 17500, 400, 0, 450, 1999].map(formatCentsShort)).toEqual(["$30", "$175", "$4", "$0", "$4.50", "$19.99"]);
    expect(formatCentsShort(100000)).toBe("$1,000");
  });
});
