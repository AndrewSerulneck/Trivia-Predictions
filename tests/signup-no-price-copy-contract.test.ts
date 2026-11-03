import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SIGNUP_CHECKOUT_COPY } from "@/lib/selfServeSignup";

// No plan name and no price before Stripe Checkout
// (docs/signup-price-copy-and-partner-geofence-plan.md Phase 1, D1/D2).
//
// A partner may enter a promo code at Stripe, so an amount shown on our side can
// be wrong, and "Venue Pro" implies there are other plans. Stripe shows the real
// price. /info, partner emails, /owner/billing and the add-venue quote are out of
// scope: they show the real amount from Stripe or the bill.

const FILES = [
  "components/signup/steps/ReviewStep.tsx",
  "components/signup/SignupWizard.tsx",
  "app/owner/billing/setup/page.tsx",
  "lib/selfServeSignup.ts",
];

describe("signup + billing setup show no plan name or price", () => {
  for (const file of FILES) {
    it(`${file} has no "Venue Pro" and no dollar amount`, () => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/Venue Pro/);
      expect(source).not.toMatch(/\$\d/);
    });
  }

  it("the checkout copy names no price and mentions the promo code", () => {
    expect(SIGNUP_CHECKOUT_COPY.button).toBe("Continue to checkout");
    expect(SIGNUP_CHECKOUT_COPY.note).toMatch(/promo code/);
    expect(SIGNUP_CHECKOUT_COPY.note).not.toMatch(/\$\d/);
  });
});
