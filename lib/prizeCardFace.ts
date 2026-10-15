import { isSquareGiftCardPrize, squareGiftCardDollars } from "@/lib/pos/prizeDelivery";
import { placeOrdinal } from "@/lib/rankedPlaceRewards";
import { withIndefiniteArticle } from "@/lib/rewardDefinitions";
import type { ChallengeCampaignWin, RewardMenuItem } from "@/types";

/**
 * What a prize's gift card shows on its face (docs/prize-gift-card-redesign-plan.md §2.2).
 *
 * Pure, no React: `components/prizes/PrizeCard.tsx` draws a face, and the Partner Manual and
 * the email picture draw `SAMPLE_PRIZE_CARD_FACE` without a fake win. Only three things go on
 * the card — the headline ("$25" / "Free Appetizer"), the venue and a small label; what it was
 * won for and when it expires sit under the card, never on it.
 */

export type PrizeCardLabel = "GIFT CARD" | "REWARD";
export type PrizeCardStatus = "ready" | "redeemed" | "used";

export type PrizeCardFace = {
  /** "$25", "$12.50", "Free Appetizer", "50% Off Entrée". */
  headline: string;
  /** "amount" draws the big tabular number; "phrase" the two-line prize name. */
  headlineKind: "amount" | "phrase";
  label: PrizeCardLabel;
  /** Shown uppercase on the card; null = no venue line (never an id). */
  venueName: string | null;
  status: PrizeCardStatus;
  /** The face in one sentence: "$25 gift card, Pacific Street, redeemed". */
  ariaLabel: string;
};

const MENU_ITEM_LABEL: Record<RewardMenuItem, string> = {
  whole_order: "Whole Order",
  appetizer: "Appetizer",
  entree: "Entrée",
  dessert: "Dessert",
  wine_bottle: "Bottle of Wine",
  other: "Menu Item",
};

/** "$25" for whole dollars, "$12.50" otherwise (rounded to the cent first). */
export const formatPrizeDollars = (dollars: number): string => {
  const cents = Math.round(dollars * 100);
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
};

/** The menu item a prize is for, title case. An "other" item keeps the partner's own wording. */
export const menuItemLabel = (win: Pick<ChallengeCampaignWin, "prizeMenuItem" | "prizeMenuItemName">): string => {
  if (win.prizeMenuItem === "other") return win.prizeMenuItemName?.trim() || MENU_ITEM_LABEL.other;
  return win.prizeMenuItem ? MENU_ITEM_LABEL[win.prizeMenuItem] : MENU_ITEM_LABEL.other;
};

/** "Free", "50% Off", "$10 Off", or "" with no discount. `formatDollars` picks the money style. */
export const discountLabel = (
  win: Pick<ChallengeCampaignWin, "prizeDiscountKind" | "prizeDiscountValue">,
  formatDollars: (dollars: number) => string = formatPrizeDollars,
): string => {
  if (win.prizeDiscountKind === "percent" && win.prizeDiscountValue != null) {
    return win.prizeDiscountValue >= 100 ? "Free" : `${win.prizeDiscountValue}% Off`;
  }
  if (win.prizeDiscountKind === "dollar" && win.prizeDiscountValue != null) {
    return `${formatDollars(win.prizeDiscountValue)} Off`;
  }
  return "";
};

const amountOrPhrase = (dollars: number | null | undefined): Pick<PrizeCardFace, "headline" | "headlineKind"> =>
  dollars != null && Number.isFinite(dollars)
    ? { headline: formatPrizeDollars(dollars), headlineKind: "amount" }
    : { headline: "Gift Card", headlineKind: "phrase" };

const headlineOf = (win: ChallengeCampaignWin): Pick<PrizeCardFace, "headline" | "headlineKind" | "label"> => {
  // A coupon that has become a real Square gift card shows the card's amount, whatever prize it was.
  if (isSquareGiftCardPrize(win) && (win.squareGiftCard === "issued" || win.squareGiftCard === "used")) {
    return { ...amountOrPhrase(squareGiftCardDollars(win)), label: "GIFT CARD" };
  }
  // Same precedence as the wallet: the Rewards prize model first (the backend derives
  // prizeKind from a legacy prizeType when it is null), then the legacy types.
  if (win.prizeKind === "gift_card" || (!win.prizeKind && win.prizeType === "gift_certificate")) {
    return { ...amountOrPhrase(win.prizeGiftCertificateAmount), label: "GIFT CARD" };
  }
  if (win.prizeKind === "menu_item") {
    const item = menuItemLabel(win);
    const discount = discountLabel(win);
    return { headline: discount ? `${discount} ${item}` : item, headlineKind: "phrase", label: "REWARD" };
  }
  if (win.prizeType === "wine_bottle") return { headline: "Bottle of Wine", headlineKind: "phrase", label: "REWARD" };
  if (win.prizeType === "free_appetizer") return { headline: "Free Appetizer", headlineKind: "phrase", label: "REWARD" };
  return { headline: "Reward", headlineKind: "phrase", label: "REWARD" };
};

const statusOf = (win: ChallengeCampaignWin): PrizeCardStatus => {
  const squareCard = isSquareGiftCardPrize(win);
  // Redeemed in our records, but still spendable at Square until the balance is gone.
  if (squareCard && win.squareGiftCard === "issued") return "ready";
  if (!win.prizeRedeemedAt) return "ready";
  return squareCard && win.squareGiftCard === "used" ? "used" : "redeemed";
};

const ariaLabelOf = (face: Omit<PrizeCardFace, "ariaLabel">): string => {
  const kind = face.label === "GIFT CARD" ? "gift card" : "reward";
  const what = face.headline === "Gift Card" ? "Gift card" : `${face.headline} ${kind}`;
  return [what, face.venueName, face.status === "ready" ? null : face.status]
    .filter((part): part is string => Boolean(part))
    .join(", ");
};

const buildFace = (face: Omit<PrizeCardFace, "ariaLabel">): PrizeCardFace => ({
  ...face,
  ariaLabel: ariaLabelOf(face),
});

/** THE face of a won prize. `venueName` comes from the wallet response; empty → no venue line. */
export const prizeCardFace = (win: ChallengeCampaignWin, venueName: string | null): PrizeCardFace =>
  buildFace({
    ...headlineOf(win),
    venueName: venueName?.trim() || null,
    status: statusOf(win),
  });

/** The card drawn in the Partner Manual and the welcome-email picture. */
export const SAMPLE_PRIZE_CARD_FACE: PrizeCardFace = buildFace({
  headline: "$25",
  headlineKind: "amount",
  label: "GIFT CARD",
  venueName: "YOUR VENUE",
  status: "ready",
});

// ── The lines around the card (wallet meta line now; the card's back in Phase 4) ──

/**
 * What the guest won the prize for ("You got the most NFL picks right in Week 2"); legacy rewards keep "Won from".
 * A weekly places coupon always says its place: the reward's own sentence names it ("You finished 1st in
 * Live Trivia the week of Oct 7"), and one whose reward was edited or deleted since falls back to the
 * place stored on the coupon, so a backfilled or older coupon still reads "1st place".
 */
export const wonForLine = (win: ChallengeCampaignWin): string => {
  if (win.place) return win.winDescription ?? `${placeOrdinal(win.place)} place: ${win.challengeName}`;
  return win.winDescription ?? `Won from: ${win.challengeName}`;
};

export type PrizeExpiryTone = "urgent" | "soon" | "normal";

/** "Expires today!" (≤24 h, urgent), "Expires tomorrow" (≤48 h, soon), else "Expires in N days". */
export const prizeExpiryInfo = (expiresAt: string, now: number = Date.now()): { label: string; tone: PrizeExpiryTone } => {
  const hours = (new Date(expiresAt).getTime() - now) / (1000 * 60 * 60);
  if (hours <= 24) return { label: "Expires today!", tone: "urgent" };
  if (hours <= 48) return { label: "Expires tomorrow", tone: "soon" };
  return { label: `Expires in ${Math.ceil(hours / 24)} days`, tone: "normal" };
};

// ── The back of the card (docs/prize-gift-card-redesign-plan.md §2.8, Phase 4) ──

export type PrizeCardBackRow = {
  key: "won" | "for" | "terms" | "expires";
  label: string;
  value: string;
  /** Expiry urgency (the list's amber/red), only while the prize can still be redeemed. */
  tone?: "urgent" | "soon";
};

export type PrizeCardBack = {
  /** Won / For / Terms / Expires, in that order; a row with no data is left out, never empty. */
  rows: PrizeCardBackRow[];
  /** "Redeemed Oct 15, 2026, 9:42 PM" once redeemed (date AND time: staff can spot an early tap). */
  stamp: string | null;
};

const validDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
};

const backDate = (date: Date): string =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const backDateTime = (date: Date): string =>
  date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const withTime = (words: string, iso: string | null | undefined): string => {
  const date = validDate(iso);
  return date ? `${words} ${backDateTime(date)}` : words;
};

/** A Square gift card that exists already: its own terms, and the coupon's expiry no longer applies. */
const isIssuedSquareCard = (win: ChallengeCampaignWin): boolean =>
  isSquareGiftCardPrize(win) && (win.squareGiftCard === "issued" || win.squareGiftCard === "used");

/**
 * "one Appetizer" / "your whole order": what a menu prize is for, inside a sentence. A partner's
 * own "other" wording takes the reward sentence's article rule instead ("a Pitcher of Beer",
 * "2 Tacos"), never "one 2 Tacos".
 */
const menuItemPhrase = (win: ChallengeCampaignWin, free: boolean): string => {
  if (win.prizeMenuItem === "whole_order") return free ? "your whole order, free" : "your whole order";
  const custom = win.prizeMenuItem === "other" ? win.prizeMenuItemName?.trim() : "";
  if (custom) return withIndefiniteArticle(free ? `free ${custom}` : custom);
  return `one ${free ? "free " : ""}${menuItemLabel(win)}`;
};

/** What the prize is good for, from the prize fields alone. Null = nothing to say (row left out). */
const termsOf = (win: ChallengeCampaignWin): string | null => {
  if (isIssuedSquareCard(win)) return "Spend it at the register over one or more visits";
  if (win.prizeKind === "gift_card" || (!win.prizeKind && win.prizeType === "gift_certificate")) {
    const amount = win.prizeGiftCertificateAmount;
    return amount != null && Number.isFinite(amount) ? `Good for ${formatPrizeDollars(amount)} off your bill` : null;
  }
  if (win.prizeKind === "menu_item") {
    const value = win.prizeDiscountValue;
    if (win.prizeDiscountKind === "percent" && value != null) {
      return value >= 100 ? `Good for ${menuItemPhrase(win, true)}` : `Good for ${value}% off ${menuItemPhrase(win, false)}`;
    }
    if (win.prizeDiscountKind === "dollar" && value != null) {
      return `Good for ${formatPrizeDollars(value)} off ${menuItemPhrase(win, false)}`;
    }
    return `Good for ${menuItemPhrase(win, false)}`;
  }
  if (win.prizeType === "wine_bottle") return "Good for one Bottle of Wine";
  if (win.prizeType === "free_appetizer") return "Good for one free Appetizer";
  return null;
};

const stampOf = (win: ChallengeCampaignWin): string | null => {
  if (isIssuedSquareCard(win)) {
    // "Used up", not the front chip's "Used": the back says what happened, the front only flags it.
    return win.squareGiftCard === "used" ? "Used up" : withTime("Turned into a Square gift card", win.prizeRedeemedAt);
  }
  return win.prizeRedeemedAt ? withTime("Redeemed", win.prizeRedeemedAt) : null;
};

const expiryRowOf = (win: ChallengeCampaignWin, now: number): PrizeCardBackRow | null => {
  // A Square gift card outlives the coupon it came from, so the coupon's date would mislead.
  if (isIssuedSquareCard(win)) return null;
  const expires = validDate(win.prizeExpiresAt);
  if (!expires) return { key: "expires", label: "Expires", value: "No expiry date" };
  const row: PrizeCardBackRow = { key: "expires", label: "Expires", value: backDate(expires) };
  // Urgency only while it can still be used; a redeemed prize's date is just a fact.
  if (win.prizeRedeemedAt || !win.prizeExpiresAt) return row;
  const { tone } = prizeExpiryInfo(win.prizeExpiresAt, now);
  return tone === "normal" ? row : { ...row, tone };
};

/**
 * THE back of a won prize: when it was won, for what, what it is good for, when it expires, and
 * once redeemed a stamp with the date and time. Every field is already in the wallet response
 * (no new requests). `now` only sets the expiry urgency, so tests can pin it.
 */
export const prizeCardBack = (win: ChallengeCampaignWin, now: number = Date.now()): PrizeCardBack => {
  const won = validDate(win.claimedAt);
  const terms = termsOf(win);
  const rows: (PrizeCardBackRow | null)[] = [
    won ? { key: "won", label: "Won", value: backDate(won) } : null,
    { key: "for", label: "For", value: wonForLine(win) },
    terms ? { key: "terms", label: "Terms", value: terms } : null,
    expiryRowOf(win, now),
  ];
  return { rows: rows.filter((row): row is PrizeCardBackRow => row !== null), stamp: stampOf(win) };
};
