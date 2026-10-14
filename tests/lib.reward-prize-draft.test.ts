import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIZE_DRAFT,
  MIN_PLAYERS_RANGE_MESSAGE,
  derivePrizeFromDraft,
  parseMinPlayersInput,
  placePrizeFromInput,
} from "@/lib/rewardPrizeDraft";

const NO_POS = { posConnected: false, posIntegrations: false };

describe("derivePrizeFromDraft", () => {
  it("the untouched draft is the wizard's long-standing default prize", () => {
    expect(derivePrizeFromDraft(DEFAULT_PRIZE_DRAFT, NO_POS).prize).toEqual({
      prizeKind: "menu_item",
      menuItem: "appetizer",
      menuItemName: null,
      discountKind: "percent",
      discountValue: 50,
    });
  });

  it("a gift card is its amount, never below a cent", () => {
    expect(derivePrizeFromDraft({ ...DEFAULT_PRIZE_DRAFT, choice: "gift_card", giftCardAmount: "30" }, NO_POS).prize).toEqual({
      prizeKind: "gift_card",
      amount: 30,
    });
    expect(derivePrizeFromDraft({ ...DEFAULT_PRIZE_DRAFT, choice: "gift_card", giftCardAmount: "" }, NO_POS).prize).toEqual({
      prizeKind: "gift_card",
      amount: 0.01,
    });
  });

  it("an 'other' item carries its trimmed name; any other item carries none", () => {
    const other = derivePrizeFromDraft({ ...DEFAULT_PRIZE_DRAFT, menuItem: "other", menuItemName: "  Nachos " }, NO_POS).prize;
    expect(other).toMatchObject({ menuItem: "other", menuItemName: "Nachos" });
    const named = derivePrizeFromDraft({ ...DEFAULT_PRIZE_DRAFT, menuItem: "dessert", menuItemName: "ignored" }, NO_POS).prize;
    expect(named).toMatchObject({ menuItem: "dessert", menuItemName: null });
  });

  it("the register limit is asked only with a POS, optional, and sent in cents", () => {
    const draft = { ...DEFAULT_PRIZE_DRAFT, posValue: "12.50" };
    expect(derivePrizeFromDraft(draft, NO_POS)).toMatchObject({ asksPosValue: false, posValueCents: null, posValueInvalid: false });
    const withPos = derivePrizeFromDraft(draft, { posConnected: true, posIntegrations: false });
    expect(withPos).toMatchObject({ asksPosValue: true, posValueCents: 1250, posValueInvalid: false });
    expect(withPos.prize).toMatchObject({ posValueCents: 1250 });
    const blank = derivePrizeFromDraft({ ...draft, posValue: "" }, { posConnected: true, posIntegrations: false });
    expect(blank).toMatchObject({ posValueCents: null, posValueInvalid: false });
    const bad = derivePrizeFromDraft({ ...draft, posValue: "twelve" }, { posConnected: true, posIntegrations: false });
    expect(bad.posValueInvalid).toBe(true);
  });

  it("a Square gift card is sent only for a dollar-off prize with the POS switch on", () => {
    const dollar = { ...DEFAULT_PRIZE_DRAFT, discountKind: "dollar" as const, scannableGiftCard: true };
    const on = { posConnected: false, posIntegrations: true };
    expect(derivePrizeFromDraft(dollar, on).prize).toMatchObject({ posDelivery: "gift_card" });
    expect(derivePrizeFromDraft(dollar, NO_POS).prize).not.toHaveProperty("posDelivery");
    expect(derivePrizeFromDraft({ ...dollar, discountKind: "percent" }, on).prize).not.toHaveProperty("posDelivery");
  });
});

describe("placePrizeFromInput", () => {
  it("maps a gift card and a menu item onto the stored place prize", () => {
    expect(placePrizeFromInput(1, { prizeKind: "gift_card", amount: 30 })).toEqual({
      place: 1,
      prizeKind: "gift_card",
      prizeGiftCertificateAmount: 30,
      prizeMenuItem: null,
      prizeMenuItemName: null,
      prizeDiscountKind: null,
      prizeDiscountValue: null,
      prizePosValueCents: null,
      prizePosDelivery: null,
    });
    expect(
      placePrizeFromInput(2, {
        prizeKind: "menu_item",
        menuItem: "appetizer",
        menuItemName: null,
        discountKind: "percent",
        discountValue: 100,
        posValueCents: 1200,
      }),
    ).toEqual({
      place: 2,
      prizeKind: "menu_item",
      prizeGiftCertificateAmount: null,
      prizeMenuItem: "appetizer",
      prizeMenuItemName: null,
      prizeDiscountKind: "percent",
      prizeDiscountValue: 100,
      prizePosValueCents: 1200,
      prizePosDelivery: null,
    });
  });
});

describe("parseMinPlayersInput", () => {
  it("accepts whole numbers from 2 to 100", () => {
    expect(parseMinPlayersInput("2")).toEqual({ ok: true, value: 2 });
    expect(parseMinPlayersInput(" 100 ")).toEqual({ ok: true, value: 100 });
  });
  it("refuses everything else with the one sentence", () => {
    for (const bad of ["", "1", "101", "2.5", "-3", "abc", "1e2", "0x10"]) {
      expect(parseMinPlayersInput(bad)).toEqual({ ok: false, message: MIN_PLAYERS_RANGE_MESSAGE });
    }
  });
});
