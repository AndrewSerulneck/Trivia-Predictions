import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARTNER_MANUAL } from "@/lib/partnerManual";
import {
  GUEST_SQUARE_GIFT_CARD_LINE,
  PARTNER_MANUAL_POS_BODY,
  STAFF_DISCOUNT_STEPS,
  STAFF_FALLBACK_TEXT,
  STAFF_GIFT_CARD_STEPS,
  STAFF_SHEET_PATH,
} from "@/lib/posStaffInstructions";

const read = (path: string) => readFileSync(path, "utf8");

describe("POS staff instructions (Phase 2e)", () => {
  it("the Partner Manual carries the Square section from the shared copy, without 'click'", () => {
    const section = PARTNER_MANUAL.sections.find((s) => s.heading === "Point of Sale (Square)");
    expect(section?.body).toBe(PARTNER_MANUAL_POS_BODY);
    expect(PARTNER_MANUAL_POS_BODY).not.toMatch(/[Cc]lick/);
  });

  it("the Partner Manual carries the staff steps as their own section, from the shared copy", () => {
    const section = PARTNER_MANUAL.sections.find((s) => s.heading === "How Staff Take a Prize (Square)");
    expect(section?.subsections?.map((sub) => sub.steps ?? sub.body)).toEqual([
      STAFF_GIFT_CARD_STEPS,
      STAFF_DISCOUNT_STEPS,
      STAFF_FALLBACK_TEXT,
    ]);
  });

  it("staff copy names the real register taps and the discount prefix", () => {
    expect(STAFF_GIFT_CARD_STEPS.join(" ")).toContain("Gift card");
    expect(STAFF_DISCOUNT_STEPS.join(" ")).toContain("Hightop prize");
    expect(STAFF_DISCOUNT_STEPS.join(" ")).toContain("Confirm Redemption");
  });

  it("the sheet shows the checklist before connecting and a short staff pointer after, with a print link", () => {
    const sheet = read("components/owner/pos/PosConnectionsSheet.tsx");
    expect(sheet).toContain("SQUARE_SETUP_STEPS");
    expect(sheet).toContain("data-pos-staff-help");
    // The full steps live in the Partner Manual, not the sheet (Andrew, 2026-10-07).
    expect(sheet).not.toContain("STAFF_GIFT_CARD_STEPS");
    expect(sheet).not.toContain("RedeemedRewardsList");
    expect(sheet).toContain("STAFF_SHEET_PATH");
    expect(STAFF_SHEET_PATH).toBe("/owner/pos-staff-sheet");
  });

  it("the printable page is flag-gated, uses OwnerShell backTo, and the app bar hides when printing", () => {
    const page = read("app/owner/pos-staff-sheet/page.tsx");
    expect(page).toContain("isPosIntegrationsEnabled()");
    expect(page).toContain("backTo=");
    expect(page).not.toContain("fetch(");
    expect(read("components/owner/OwnerAppBar.tsx")).toContain("print:hidden");
  });

  it("the guest gift card offer tells the guest what to say", () => {
    expect(read("components/prizes/SquareGiftCardPanel.tsx")).toContain("GUEST_SQUARE_GIFT_CARD_LINE");
    expect(GUEST_SQUARE_GIFT_CARD_LINE).toContain("Square gift card");
  });

  it("scannable dollar-off prizes are explained in the manual and the wizard choice reads from one home", () => {
    expect(PARTNER_MANUAL_POS_BODY).toContain("Scannable gift card");
    expect(read("components/rewards/CreateRewardWizard.tsx")).toContain("SCANNABLE_CHOICE_GIFT_CARD");
    expect(read("components/prizes/PrizeWalletPanel.tsx")).toContain("SCANNABLE_COUPON_LINE");
  });
});
