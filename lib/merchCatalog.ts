/**
 * Join Merch catalog — THE one file to edit to change products, copy or prices.
 * Plan: docs/join-merch-store-plan.md §4. Pure data, safe in the browser.
 *
 * Money is integer cents everywhere; format only at render (`formatCents` in
 * `lib/merchPricing.ts`). SKUs are placeholders until a 3PL is chosen.
 * Descriptions are placeholder copy for Andrew to edit (plan Q3).
 */

export type MerchProductId =
  | "coasters-round"
  | "coasters-square"
  | "table-tents"
  | "table-card-set";

export type MerchPack = {
  quantity: number;
  priceCents: number;
  sku: string;
};

export type MerchPricing =
  | { kind: "pack"; packs: readonly MerchPack[] }
  | { kind: "unit"; unitPriceCents: number; maxQuantity: number; sku: string };

export type MerchImage = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export type MerchProduct = {
  id: MerchProductId;
  name: string;
  description: string;
  image: MerchImage;
  pricing: MerchPricing;
};

/** Upper bound for unit-priced items (tents, card sets) per order. */
export const MERCH_MAX_UNIT_QTY = 100;

export const MERCH_CURRENCY = "usd" as const;

/**
 * Review-step note under the total while ordering is look-only (plan §1 decision 3).
 * `MERCH_ORDER_CONTACT` is the line for partners who want merch now (plan Q2):
 * e.g. "Want merch now? Email orders@example.com." Leave null to show no contact line.
 */
export const MERCH_ORDERING_NOTE = "Online ordering is coming soon.";
export const MERCH_ORDER_CONTACT: string | null = null;

const COASTER_TIERS = [
  { quantity: 100, priceCents: 3000 },
  { quantity: 250, priceCents: 6000 },
  { quantity: 500, priceCents: 10000 },
  { quantity: 1000, priceCents: 17500 },
] as const;

const coasterPacks = (skuPrefix: string): readonly MerchPack[] =>
  COASTER_TIERS.map((tier) => ({ ...tier, sku: `${skuPrefix}-${tier.quantity}` }));

export const MERCH_CATALOG: readonly MerchProduct[] = [
  {
    id: "coasters-round",
    name: "Round Coasters",
    description: "Absorbent round coasters printed with the Hightop Challenge QR code. Guests scan to join and play.",
    image: {
      src: "/store/web/coasters_round.webp",
      width: 1200,
      height: 1200,
      alt: "Stack of round paper coasters printed with the Hightop Challenge QR code",
    },
    pricing: { kind: "pack", packs: coasterPacks("HTC-CST-RND") },
  },
  {
    id: "coasters-square",
    name: "Square Coasters",
    description: "Square coasters printed with the Hightop Challenge QR code. Same prices as round.",
    image: {
      src: "/store/web/coasters_square.webp",
      width: 1200,
      height: 800,
      alt: "Stack of square paper coasters printed with the Hightop Challenge QR code",
    },
    pricing: { kind: "pack", packs: coasterPacks("HTC-CST-SQ") },
  },
  {
    id: "table-tents",
    name: "Table Tents",
    description: "Fold-flat table tents with the Hightop Challenge QR code, sold individually.",
    image: {
      src: "/store/web/table_tents.webp",
      width: 1200,
      height: 900,
      alt: "Table tents printed with the Hightop Challenge QR code",
    },
    pricing: { kind: "unit", unitPriceCents: 400, maxQuantity: MERCH_MAX_UNIT_QTY, sku: "HTC-TENT" },
  },
  {
    id: "table-card-set",
    name: "Table Card with Holder",
    description: "One set is a printed QR table card plus a chrome holder to stand it up.",
    image: {
      src: "/store/web/card_holders.webp",
      width: 1200,
      height: 900,
      alt: "Table cards printed with the Hightop Challenge QR code in chrome holders",
    },
    pricing: { kind: "unit", unitPriceCents: 800, maxQuantity: MERCH_MAX_UNIT_QTY, sku: "HTC-CARDSET" },
  },
];

export const getMerchProduct = (id: MerchProductId): MerchProduct | undefined =>
  MERCH_CATALOG.find((product) => product.id === id);
