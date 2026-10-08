// Plain-words Square instructions for partners and their staff
// (docs/pos-rewards-integration-plan.md Phase 2e). One home for the copy: the Point of Sale sheet,
// the printable staff sheet and the Partner Manual all read it, so the three never disagree.
//
// The register taps are written from Square's documented flow, not from a device we've held.
// They are worded loosely ("find", "add") on purpose; confirm them on a real register in Phase 2h.

export const SQUARE_SETUP_STEPS: readonly string[] = [
  "Tap Connect on the Square row and allow access in Square.",
  "If your Square account has more than one location, choose the one that gives out gift cards.",
  "Print the staff sheet and tape it by the register.",
  "Tell staff: when a guest shows a prize, follow the sheet, then tap Confirm Redemption on the guest's phone.",
];

export const STAFF_GIFT_CARD_STEPS: readonly string[] = [
  "The guest shows a Square gift card with a long number and a barcode.",
  "Ring up the sale as usual and tap Charge.",
  "Choose Gift card, then type the number or scan the barcode.",
  "Square takes what's on the card. Any balance stays for the guest's next visit.",
];

export const STAFF_DISCOUNT_STEPS: readonly string[] = [
  "The guest shows a green box that says \"For staff · Square register\" and a discount name.",
  "Add the item to the sale, then find that exact discount in Square's Discounts list (it starts with \"Hightop prize\") and add it.",
  "Square takes off the right amount and applies any dollar limit by itself.",
  "Then ask the guest to tap Confirm Redemption on their phone.",
];

export const STAFF_FALLBACK_TEXT =
  "If there's no green box or gift card, or Square is slow, just give the prize by hand as written on the coupon, then have the guest tap Confirm Redemption. A prize can only be used once.";

export const STAFF_SHEET_TITLE = "How to take a Hightop prize";
export const STAFF_SHEET_INTRO = "A guest shows a prize on their phone. Look at what it shows, then follow one of these.";
export const STAFF_SHEET_PRINT_LABEL = "Print this sheet";
export const STAFF_SHEET_LINK_LABEL = "Print the staff sheet";
export const STAFF_SHEET_PATH = "/owner/pos-staff-sheet";

/** One line on the guest's Square gift card offer. */
export const GUEST_SQUARE_GIFT_CARD_LINE = "At the register, tell staff you'll pay with a Square gift card.";

/** Shown on a dollar-off coupon the partner set to "Scannable gift card" (Square plan S3). */
export const SCANNABLE_COUPON_LINE = "Paid as a Square gift card. Use it on anything.";

/** The wizard's per-prize choice for a dollar-off prize at a Square register (Square plan S3). */
export const SCANNABLE_CHOICE_QUESTION = "How should staff take this prize at a Square register?";
export const SCANNABLE_CHOICE_DISCOUNT = {
  label: "Apply a discount",
  help: "Staff tap the ready-made Hightop discount. Works only on this item.",
};
export const SCANNABLE_CHOICE_GIFT_CARD = {
  label: "Scannable gift card",
  help: "Staff scan or type a Square gift card for the dollar amount. It can be used on anything, and leftover balance stays on the card.",
};

/** Partner Manual "How Staff Take a Prize" section intro (lib/partnerManual.ts). */
export const PARTNER_MANUAL_STAFF_INTRO =
  "Once Square is connected, a guest's prize shows one of two things at the register. Here's what staff do for each. You can print these steps from the Point of Sale screen and keep them by the register.";

/** Partner Manual section copy (lib/partnerManual.ts). */
export const PARTNER_MANUAL_POS_BODY =
  "If you use Square, connect it so guests' prizes work right at your register. Tap the arrow in the top-left corner to open the menu, then tap Point of Sale and connect Square. Gift card prizes become real Square gift cards. Free-item and dollar or percent off prizes get a ready-made \"Hightop prize\" discount in your Square for staff to tap. A dollar off prize can instead be set to \"Scannable gift card\", which staff scan or type like any Square gift card. The Point of Sale screen has a staff sheet you can print and tape by the register. Prizes always still work with the normal coupon, connected or not.";
