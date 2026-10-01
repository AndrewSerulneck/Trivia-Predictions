/**
 * Pure pricing + cart math for the Join Merch store. No I/O, no React.
 * Plan: docs/join-merch-store-plan.md §4. Every price is recomputed from
 * `lib/merchCatalog.ts`; UI state is never trusted for money.
 */
import {
  MERCH_CATALOG,
  MERCH_CURRENCY,
  getMerchProduct,
  type MerchPack,
  type MerchProduct,
  type MerchProductId,
} from "@/lib/merchCatalog";

/** Cart state: product id -> quantity (pack size for coasters, count for units). */
export type MerchCart = Partial<Record<MerchProductId, number>>;

export type MerchVenueRef = { id: string; name: string };

/**
 * One order line. `quantity` is pieces: the pack size for coasters (the SKU names
 * the pack), the count for unit items. No per-piece price is derived — a pack is
 * priced as a whole, and a unit item's price is in the catalog.
 */
export type MerchOrderLine = {
  sku: string;
  productId: MerchProductId;
  quantity: number;
  lineTotalCents: number;
};

export type MerchOrderDraft = {
  venueId: string;
  lines: MerchOrderLine[];
  subtotalCents: number;
  currency: typeof MERCH_CURRENCY;
};

export type MerchCartSummary = {
  /** Number of distinct lines in the order. */
  lineCount: number;
  /** Total physical pieces (coasters + tents + sets). */
  pieceCount: number;
  subtotalCents: number;
};

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatCents = (cents: number): string => currencyFormatter.format(cents / 100);

const wholeDollarFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** "$60" for whole dollars, else "$4.50" — for prices in labels (the pack dropdown, "$4 each"). Totals use `formatCents`. */
export const formatCentsShort = (cents: number): string =>
  cents % 100 === 0 ? wholeDollarFormatter.format(cents / 100) : formatCents(cents);

/**
 * Coerces typed input to a whole quantity in [0, max]. Anything that is not a
 * plain non-negative integer string/number (NaN, "12abc", "") becomes 0.
 */
export const clampUnitQuantity = (value: unknown, max: number): number => {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && /^\s*-?\d+\s*$/.test(value)) n = Number(value);
  else return 0;
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), max);
};

export const findPack = (product: MerchProduct, quantity: number): MerchPack | undefined =>
  product.pricing.kind === "pack" ? product.pricing.packs.find((p) => p.quantity === quantity) : undefined;

export const isValidPack = (product: MerchProduct, quantity: number): boolean =>
  findPack(product, quantity) !== undefined;

/** Price for one cart entry. Invalid pack sizes and non-positive quantities price at 0. */
export const lineTotalCents = (product: MerchProduct, quantity: number): number => {
  if (product.pricing.kind === "pack") return findPack(product, quantity)?.priceCents ?? 0;
  return clampUnitQuantity(quantity, product.pricing.maxQuantity) * product.pricing.unitPriceCents;
};

const lineFor = (product: MerchProduct, quantity: number): MerchOrderLine | null => {
  if (product.pricing.kind === "pack") {
    const pack = findPack(product, quantity);
    if (!pack) return null;
    return {
      sku: pack.sku,
      productId: product.id,
      quantity: pack.quantity,
      lineTotalCents: pack.priceCents,
    };
  }
  const qty = clampUnitQuantity(quantity, product.pricing.maxQuantity);
  if (qty <= 0) return null;
  return {
    sku: product.pricing.sku,
    productId: product.id,
    quantity: qty,
    lineTotalCents: qty * product.pricing.unitPriceCents,
  };
};

/** Valid order lines for the cart, in catalog order. Zero/invalid entries are dropped. */
export const cartLines = (cart: MerchCart): MerchOrderLine[] =>
  MERCH_CATALOG.flatMap((product) => {
    const line = lineFor(product, cart[product.id] ?? 0);
    return line ? [line] : [];
  });

export const cartSummary = (cart: MerchCart): MerchCartSummary => {
  const lines = cartLines(cart);
  return {
    lineCount: lines.length,
    pieceCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
  };
};

/**
 * The order object a future checkout / 3PL call will receive. The Review screen
 * renders from this, so what the partner saw is exactly what gets submitted.
 */
export const buildMerchOrderDraft = (cart: MerchCart, venue: MerchVenueRef): MerchOrderDraft => {
  const lines = cartLines(cart);
  return {
    venueId: venue.id,
    lines,
    subtotalCents: lines.reduce((sum, l) => sum + l.lineTotalCents, 0),
    currency: MERCH_CURRENCY,
  };
};
