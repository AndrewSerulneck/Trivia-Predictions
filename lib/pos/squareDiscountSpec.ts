import { POS_VALUE_MAX_CENTS } from "@/lib/pos/prizeValue";
import type { RewardDiscountKind, RewardMenuItem, RewardPrizeKind } from "@/types";

// Menu-item prizes at a Square register (docs/pos-rewards-integration-plan.md Phase 2d,
// Andrew 2026-10-06: "Preset discount per prize").
//
// Square's API can't put a discount on a ticket that is open on the register (plan §2), so each
// menu-item prize becomes ONE ready-made discount in the partner's Square catalog, named after
// its terms — "Hightop prize: 50% off Appetizer (max $12)". Staff tap that name; Square does the
// percentage and the cap. Then staff confirm the coupon as before (once-only RPC).
//
// THE NAME IS THE IDENTITY. lib/pos/squareDiscounts.ts finds the discount by searching the
// partner's catalog for this exact name and creates it when it's missing, so we store nothing.
// Every term that changes what comes off the bill is therefore in the name; two rewards with the
// same terms share one discount. Changing this wording creates new discounts at every connected
// partner on next use (the old ones stay in their Square until they delete them) — don't, unless
// that is the intent.
//
// Pure and client-safe.

/** Square's limit is 255; ours keeps the register screen readable. */
const MAX_NAME_LENGTH = 120;
const MAX_ITEM_NAME_LENGTH = 60;

const NAME_PREFIX = "Hightop prize:";

const MENU_ITEM_LABEL: Record<RewardMenuItem, string> = {
  whole_order: "Whole Order",
  appetizer: "Appetizer",
  entree: "Entrée",
  dessert: "Dessert",
  wine_bottle: "Bottle of Wine",
  other: "Menu Item",
};

export type SquareDiscountPrize = {
  prizeKind: RewardPrizeKind | null;
  prizeMenuItem: RewardMenuItem | null;
  prizeMenuItemName: string | null;
  prizeDiscountKind: RewardDiscountKind | null;
  prizeDiscountValue: number | null;
  /** The optional register limit for a percent-off prize (cents); null = no limit. */
  prizePosValueCents: number | null;
};

/** What Square should create (lib/pos/square.ts createSquareDiscount). */
export type SquareDiscountInput = {
  name: string;
  kind: "FIXED_AMOUNT" | "FIXED_PERCENTAGE";
  /** FIXED_AMOUNT only. */
  amountCents: number | null;
  /** FIXED_PERCENTAGE only, e.g. "50". */
  percentage: string | null;
  /** FIXED_PERCENTAGE only; null = no limit. */
  maxCents: number | null;
};

/** "$12" for whole dollars, "$12.50" otherwise. */
const money = (cents: number): string =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

const itemLabel = (prize: SquareDiscountPrize): string => {
  if (prize.prizeMenuItem === "other") {
    const custom = (prize.prizeMenuItemName ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_NAME_LENGTH).trim();
    return custom || MENU_ITEM_LABEL.other;
  }
  return prize.prizeMenuItem ? MENU_ITEM_LABEL[prize.prizeMenuItem] : MENU_ITEM_LABEL.other;
};

const validCap = (cents: number | null): number | null =>
  cents !== null && Number.isInteger(cents) && cents >= 1 && cents <= POS_VALUE_MAX_CENTS ? cents : null;

/**
 * The Square discount for a prize, or null when the prize can't be one (a gift card — those
 * become Square gift cards — or a menu-item prize missing its discount terms).
 *
 *   $5 off an entrée            → FIXED_AMOUNT $5         "Hightop prize: $5 off Entrée"
 *   50% off an appetizer, ≤ $12 → FIXED_PERCENTAGE 50, max "Hightop prize: 50% off Appetizer (max $12)"
 *   free dessert (100%), no cap → FIXED_PERCENTAGE 100     "Hightop prize: free Dessert"
 */
export const squareDiscountSpec = (prize: SquareDiscountPrize): SquareDiscountInput | null => {
  if (prize.prizeKind !== "menu_item") return null;
  const value = prize.prizeDiscountValue;
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const item = itemLabel(prize);

  if (prize.prizeDiscountKind === "dollar") {
    const cents = Math.min(POS_VALUE_MAX_CENTS, Math.round(value * 100));
    if (cents < 1) return null;
    return {
      name: `${NAME_PREFIX} ${money(cents)} off ${item}`.slice(0, MAX_NAME_LENGTH),
      kind: "FIXED_AMOUNT",
      amountCents: cents,
      percentage: null,
      maxCents: null,
    };
  }

  if (prize.prizeDiscountKind === "percent") {
    // Whole percents only (lib/rewards.ts stores percent prizes rounded), 1–100.
    const percent = Math.min(100, Math.round(value));
    if (percent < 1) return null;
    const cap = validCap(prize.prizePosValueCents);
    const what = percent >= 100 ? `free ${item}` : `${percent}% off ${item}`;
    return {
      name: `${NAME_PREFIX} ${what}${cap !== null ? ` (max ${money(cap)})` : ""}`.slice(0, MAX_NAME_LENGTH),
      kind: "FIXED_PERCENTAGE",
      amountCents: null,
      percentage: String(percent),
      maxCents: cap,
    };
  }

  return null;
};
