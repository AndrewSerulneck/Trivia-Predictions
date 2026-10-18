import { describe, expect, it } from "vitest";
import {
  discountLabel,
  formatPrizeDollars,
  menuItemLabel,
  prizeCardBack,
  prizeCardFace,
  prizeExpiryInfo,
  SAMPLE_PRIZE_CARD_FACE,
  wonForLine,
} from "@/lib/prizeCardFace";
import type { ChallengeCampaignWin } from "@/types";

// docs/prize-gift-card-redesign-plan.md §2.2: every prize gets one card face — a headline, a
// label and the venue — from one pure function. Each row of the plan's vocabulary table is pinned.

const win = (fields: Partial<ChallengeCampaignWin> = {}): ChallengeCampaignWin => ({
  redemptionId: "r1",
  challengeId: "c1",
  venueId: "v1",
  challengeName: "Live Trivia",
  challengeRules: "",
  winnerUserId: "u1",
  ...fields,
});

const face = (fields: Partial<ChallengeCampaignWin>, venue: string | null = "Pacific Street") =>
  prizeCardFace(win(fields), venue);

describe("formatPrizeDollars", () => {
  it("drops the cents on whole dollars and keeps them otherwise", () => {
    expect(formatPrizeDollars(25)).toBe("$25");
    expect(formatPrizeDollars(12.5)).toBe("$12.50");
    expect(formatPrizeDollars(0.99)).toBe("$0.99");
    expect(formatPrizeDollars(1000)).toBe("$1,000");
  });

  it("rounds to the cent first, so float noise never shows", () => {
    expect(formatPrizeDollars(25.000000001)).toBe("$25");
    expect(formatPrizeDollars(0.1 + 0.2)).toBe("$0.30");
  });
});

describe("prizeCardFace — the §2.2 vocabulary table", () => {
  it("gift_card → the amount, GIFT CARD", () => {
    expect(face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 })).toMatchObject({
      headline: "$25",
      headlineKind: "amount",
      label: "GIFT CARD",
    });
    expect(face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 12.5 }).headline).toBe("$12.50");
  });

  it("legacy gift_certificate (no prizeKind) → the amount, GIFT CARD", () => {
    expect(face({ prizeType: "gift_certificate", prizeGiftCertificateAmount: 40 })).toMatchObject({
      headline: "$40",
      label: "GIFT CARD",
    });
  });

  it("a gift card with no amount says Gift Card rather than an empty number", () => {
    expect(face({ prizeKind: "gift_card" })).toMatchObject({ headline: "Gift Card", headlineKind: "phrase", label: "GIFT CARD" });
  });

  it("menu_item at 100% or more → Free {item}, PRIZE", () => {
    expect(
      face({ prizeKind: "menu_item", prizeMenuItem: "appetizer", prizeDiscountKind: "percent", prizeDiscountValue: 100 }),
    ).toMatchObject({ headline: "Free Appetizer", headlineKind: "phrase", label: "PRIZE" });
  });

  it("menu_item percent → {n}% Off {item}, PRIZE", () => {
    expect(
      face({ prizeKind: "menu_item", prizeMenuItem: "entree", prizeDiscountKind: "percent", prizeDiscountValue: 50 }),
    ).toMatchObject({ headline: "50% Off Entrée", label: "PRIZE" });
  });

  it("menu_item dollar → ${n} Off {item}, PRIZE", () => {
    expect(
      face({ prizeKind: "menu_item", prizeMenuItem: "whole_order", prizeDiscountKind: "dollar", prizeDiscountValue: 10 }),
    ).toMatchObject({ headline: "$10 Off Whole Order", label: "PRIZE" });
    expect(
      face({ prizeKind: "menu_item", prizeMenuItem: "dessert", prizeDiscountKind: "dollar", prizeDiscountValue: 7.5 }).headline,
    ).toBe("$7.50 Off Dessert");
  });

  it("menu_item other → the partner's own item name, as typed", () => {
    expect(
      face({
        prizeKind: "menu_item",
        prizeMenuItem: "other",
        prizeMenuItemName: "  Pint of IPA ",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 100,
      }).headline,
    ).toBe("Free Pint of IPA");
    expect(face({ prizeKind: "menu_item", prizeMenuItem: "other", prizeMenuItemName: "  " }).headline).toBe("Menu Item");
  });

  it("menu_item with no discount → just the item", () => {
    expect(face({ prizeKind: "menu_item", prizeMenuItem: "wine_bottle" }).headline).toBe("Bottle of Wine");
  });

  it("legacy wine_bottle and free_appetizer → title-case phrases, PRIZE", () => {
    expect(face({ prizeType: "wine_bottle" })).toMatchObject({ headline: "Bottle of Wine", label: "PRIZE" });
    expect(face({ prizeType: "free_appetizer" })).toMatchObject({ headline: "Free Appetizer", label: "PRIZE" });
  });

  it("prizeKind wins over a legacy prizeType (the wallet's precedence)", () => {
    expect(
      face({ prizeKind: "menu_item", prizeType: "gift_certificate", prizeMenuItem: "dessert", prizeDiscountKind: "percent", prizeDiscountValue: 100 })
        .headline,
    ).toBe("Free Dessert");
  });

  it("an issued Square gift card shows its original amount as a GIFT CARD", () => {
    expect(
      face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, prizeRedeemedAt: "2026-10-01T00:00:00Z", squareGiftCard: "issued" }),
    ).toMatchObject({ headline: "$25", label: "GIFT CARD", status: "ready" });
  });

  it("a scannable dollar-off menu prize becomes a GIFT CARD once it is a Square card", () => {
    const scannable = {
      prizeKind: "menu_item" as const,
      prizeMenuItem: "whole_order" as const,
      prizeDiscountKind: "dollar" as const,
      prizeDiscountValue: 15,
      prizePosDelivery: "gift_card" as const,
    };
    // Not yet a card: still the discount phrase.
    expect(face({ ...scannable, squareGiftCard: "available" })).toMatchObject({ headline: "$15 Off Whole Order", label: "PRIZE" });
    expect(face({ ...scannable, squareGiftCard: "issued", prizeRedeemedAt: "2026-10-01T00:00:00Z" })).toMatchObject({
      headline: "$15",
      headlineKind: "amount",
      label: "GIFT CARD",
      status: "ready",
    });
  });

  it("uses title case on the face, never the old all-caps", () => {
    const headlines = [
      face({ prizeType: "free_appetizer" }).headline,
      face({ prizeKind: "menu_item", prizeMenuItem: "entree", prizeDiscountKind: "percent", prizeDiscountValue: 50 }).headline,
    ];
    for (const headline of headlines) expect(headline).not.toBe(headline.toUpperCase());
  });
});

describe("prizeCardFace — status", () => {
  it("is ready until redeemed", () => {
    expect(face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 }).status).toBe("ready");
  });

  it("is redeemed once redeemed", () => {
    expect(face({ prizeType: "wine_bottle", prizeRedeemedAt: "2026-10-01T00:00:00Z" }).status).toBe("redeemed");
  });

  it("is used when its Square gift card is spent", () => {
    expect(
      face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, prizeRedeemedAt: "2026-10-01T00:00:00Z", squareGiftCard: "used" }).status,
    ).toBe("used");
  });

  it("a non-scannable menu prize never reads Used, whatever squareGiftCard says", () => {
    expect(
      face({
        prizeKind: "menu_item",
        prizeMenuItem: "entree",
        prizeDiscountKind: "percent",
        prizeDiscountValue: 50,
        prizeRedeemedAt: "2026-10-01T00:00:00Z",
        squareGiftCard: "used",
      }).status,
    ).toBe("redeemed");
  });
});

describe("prizeCardFace — venue and aria label", () => {
  it("reads the face in one sentence", () => {
    expect(face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 }).ariaLabel).toBe("$25 gift card, Pacific Street");
    expect(face({ prizeType: "free_appetizer", prizeRedeemedAt: "2026-10-01T00:00:00Z" }).ariaLabel).toBe(
      "Free Appetizer prize, Pacific Street, redeemed",
    );
  });

  it("has no venue line (and no venue in the label) when the name is empty", () => {
    for (const venue of [null, "", "   "]) {
      const result = face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 }, venue);
      expect(result.venueName).toBeNull();
      expect(result.ariaLabel).toBe("$25 gift card");
    }
  });

  it("trims the venue name", () => {
    expect(face({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25 }, "  The Tap Room ").venueName).toBe("The Tap Room");
  });
});

describe("the moved label helpers", () => {
  it("discountLabel is title case and takes the caller's money style", () => {
    expect(discountLabel({ prizeDiscountKind: "percent", prizeDiscountValue: 100 })).toBe("Free");
    expect(discountLabel({ prizeDiscountKind: "percent", prizeDiscountValue: 25 })).toBe("25% Off");
    expect(discountLabel({ prizeDiscountKind: "dollar", prizeDiscountValue: 10 })).toBe("$10 Off");
    expect(discountLabel({ prizeDiscountKind: "dollar", prizeDiscountValue: 10 }, (n) => `$${n.toFixed(2)}`)).toBe("$10.00 Off");
    expect(discountLabel({ prizeDiscountKind: null, prizeDiscountValue: null })).toBe("");
  });

  it("menuItemLabel names every menu item in title case", () => {
    expect(menuItemLabel({ prizeMenuItem: "whole_order" })).toBe("Whole Order");
    expect(menuItemLabel({ prizeMenuItem: "wine_bottle" })).toBe("Bottle of Wine");
    expect(menuItemLabel({ prizeMenuItem: null })).toBe("Menu Item");
  });
});

describe("SAMPLE_PRIZE_CARD_FACE", () => {
  it("is a ready $25 gift card at YOUR VENUE", () => {
    expect(SAMPLE_PRIZE_CARD_FACE).toEqual({
      headline: "$25",
      headlineKind: "amount",
      label: "GIFT CARD",
      venueName: "YOUR VENUE",
      status: "ready",
      ariaLabel: "$25 gift card, YOUR VENUE",
    });
  });
});

// Phase 3 moved these out of PrizeWalletPanel (one home; Phase 4's card back reuses them).
describe("wonForLine", () => {
  it("prefers the reward's own sentence, then the place, then 'Won from'", () => {
    expect(wonForLine(win({ winDescription: "You won Live Trivia on Tue, Sep 29" }))).toBe("You won Live Trivia on Tue, Sep 29");
    expect(wonForLine(win({ place: 2 }))).toBe("2nd place: Live Trivia");
    expect(wonForLine(win({ place: 1, winDescription: "You finished 1st" }))).toBe("You finished 1st");
    expect(wonForLine(win())).toBe("Won from: Live Trivia");
  });
});

describe("prizeExpiryInfo", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const inHours = (hours: number) => new Date(now + hours * 3_600_000).toISOString();

  it("keeps the wallet's thresholds: today (≤24 h), tomorrow (≤48 h), then days", () => {
    expect(prizeExpiryInfo(inHours(5), now)).toEqual({ label: "Expires today!", tone: "urgent" });
    expect(prizeExpiryInfo(inHours(24), now)).toEqual({ label: "Expires today!", tone: "urgent" });
    expect(prizeExpiryInfo(inHours(30), now)).toEqual({ label: "Expires tomorrow", tone: "soon" });
    expect(prizeExpiryInfo(inHours(49), now)).toEqual({ label: "Expires in 3 days", tone: "normal" });
    expect(prizeExpiryInfo(inHours(24 * 6), now)).toEqual({ label: "Expires in 6 days", tone: "normal" });
  });
});

// ── Phase 4: the back of the card (plan §2.8) ────────────────────────────────

describe("prizeCardBack", () => {
  const NOW = new Date(2026, 9, 15, 12, 0).getTime();
  const HOUR = 3_600_000;
  const back = (fields: Partial<ChallengeCampaignWin>, now = NOW) => prizeCardBack(win(fields), now);
  const rows = (fields: Partial<ChallengeCampaignWin>, now = NOW) =>
    Object.fromEntries(back(fields, now).rows.map((row) => [row.key, row]));
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const claimedAt = new Date(2026, 9, 12, 20, 15).toISOString();
  const prizeExpiresAt = new Date(2026, 9, 30, 23, 59).toISOString();

  it("reads Won / For / Terms / Expires, in that order", () => {
    const result = back({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, claimedAt, prizeExpiresAt, winDescription: "You finished 1st in Live Trivia" });
    expect(result.rows.map((row) => [row.label, row.value])).toEqual([
      ["Won", date(claimedAt)],
      ["For", "You finished 1st in Live Trivia"],
      ["Terms", "Good for $25 off your bill"],
      ["Expires", date(prizeExpiresAt)],
    ]);
    expect(result.stamp).toBeNull();
  });

  it("For is the wallet's own won-for line (one home)", () => {
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5 }).for.value).toBe("Won from: Live Trivia");
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5, place: 2 }).for.value).toBe("2nd place: Live Trivia");
  });

  it("says what each prize kind is good for", () => {
    const terms = (fields: Partial<ChallengeCampaignWin>) => rows(fields).terms?.value;
    expect(terms({ prizeKind: "gift_card", prizeGiftCertificateAmount: 12.5 })).toBe("Good for $12.50 off your bill");
    expect(terms({ prizeType: "gift_certificate", prizeGiftCertificateAmount: 40 })).toBe("Good for $40 off your bill");
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "appetizer", prizeDiscountKind: "percent", prizeDiscountValue: 100 })).toBe(
      "Good for one free Appetizer",
    );
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "entree", prizeDiscountKind: "percent", prizeDiscountValue: 50 })).toBe(
      "Good for 50% off one Entrée",
    );
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "whole_order", prizeDiscountKind: "dollar", prizeDiscountValue: 10 })).toBe(
      "Good for $10 off your whole order",
    );
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "whole_order", prizeDiscountKind: "percent", prizeDiscountValue: 100 })).toBe(
      "Good for your whole order, free",
    );
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "other", prizeMenuItemName: "Chef's Tasting Platter", prizeDiscountKind: "percent", prizeDiscountValue: 100 })).toBe(
      "Good for a free Chef's Tasting Platter",
    );
    // A partner's own wording takes the reward sentence's article rule, never "one 2 Tacos".
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "other", prizeMenuItemName: "2 Tacos", prizeDiscountKind: "dollar", prizeDiscountValue: 5 })).toBe(
      "Good for $5 off 2 Tacos",
    );
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "other", prizeMenuItemName: "Pitcher of Beer" })).toBe("Good for a Pitcher of Beer");
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "other", prizeDiscountKind: "percent", prizeDiscountValue: 50 })).toBe(
      "Good for 50% off one Menu Item",
    );
    expect(terms({ prizeKind: "menu_item", prizeMenuItem: "dessert" })).toBe("Good for one Dessert");
    expect(terms({ prizeType: "wine_bottle" })).toBe("Good for one Bottle of Wine");
    expect(terms({ prizeType: "free_appetizer" })).toBe("Good for one free Appetizer");
  });

  it("leaves out a row with no data, never shows it empty", () => {
    const result = rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: null, claimedAt: null });
    expect(result.won).toBeUndefined();
    expect(result.terms).toBeUndefined();
    expect(Object.keys(result)).toEqual(["for", "expires"]);
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5, claimedAt: "not a date" }).won).toBeUndefined();
  });

  it("says 'No expiry date' when the prize has none", () => {
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5, prizeExpiresAt: null }).expires).toEqual({
      key: "expires",
      label: "Expires",
      value: "No expiry date",
    });
  });

  it("colours the expiry with the wallet's urgency while the prize can still be used", () => {
    const at = (hours: number) => new Date(NOW + hours * HOUR).toISOString();
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5, prizeExpiresAt: at(12) }).expires.tone).toBe("urgent");
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5, prizeExpiresAt: at(36) }).expires.tone).toBe("soon");
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5, prizeExpiresAt: at(96) }).expires.tone).toBeUndefined();
    // Redeemed: the date is a fact, not a warning.
    expect(rows({ prizeKind: "gift_card", prizeGiftCertificateAmount: 5, prizeExpiresAt: at(12), prizeRedeemedAt: at(-1) }).expires.tone).toBeUndefined();
  });

  it("stamps a redeemed prize with the date AND the time, and keeps every row", () => {
    const prizeRedeemedAt = new Date(2026, 9, 15, 21, 42).toISOString();
    const result = back({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, claimedAt, prizeExpiresAt, prizeRedeemedAt });
    expect(result.stamp).toMatch(/^Redeemed Oct 15, 2026,? 9:42\sPM$/);
    expect(result.rows.map((row) => row.key)).toEqual(["won", "for", "terms", "expires"]);
  });

  it("a Square gift card says it became one (with the time), spends over visits, and drops the coupon's expiry", () => {
    const prizeRedeemedAt = new Date(2026, 9, 15, 21, 42).toISOString();
    const issued = back({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, squareGiftCard: "issued", prizeRedeemedAt, prizeExpiresAt });
    expect(issued.stamp).toMatch(/^Turned into a Square gift card Oct 15, 2026,? 9:42\sPM$/);
    const issuedRows = Object.fromEntries(issued.rows.map((row) => [row.key, row]));
    expect(issuedRows.terms.value).toBe("Spend it at the register over one or more visits");
    expect(issuedRows.expires).toBeUndefined();
    expect(back({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, squareGiftCard: "used", prizeRedeemedAt }).stamp).toBe("Used up");
    // Not yet a card ("available"): an ordinary coupon's back.
    expect(back({ prizeKind: "gift_card", prizeGiftCertificateAmount: 25, squareGiftCard: "available" }).stamp).toBeNull();
    // A non-scannable menu prize is never a Square card, whatever squareGiftCard says.
    expect(back({ prizeKind: "menu_item", prizeMenuItem: "appetizer", squareGiftCard: "issued", prizeRedeemedAt }).stamp).toMatch(/^Redeemed /);
  });
});
