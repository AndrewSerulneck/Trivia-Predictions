import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getCheckoutPriceId, getStripeGraduatedPriceId, getStripePriceId } from "@/lib/stripe";

/**
 * Multi-venue billing Phase 2: new subscriptions start on the graduated Price when
 * STRIPE_GRADUATED_PRICE_ID is set, else on the flat list price — so the env var and the code can
 * deploy in either order without breaking signup.
 */
const saved = {
  list: process.env.STRIPE_PRICE_ID,
  graduated: process.env.STRIPE_GRADUATED_PRICE_ID,
};

const restore = (key: string, value: string | undefined) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

describe("Stripe price readers", () => {
  afterEach(() => {
    restore("STRIPE_PRICE_ID", saved.list);
    restore("STRIPE_GRADUATED_PRICE_ID", saved.graduated);
  });

  it("Checkout uses the graduated Price when it is configured", () => {
    process.env.STRIPE_PRICE_ID = "price_list";
    process.env.STRIPE_GRADUATED_PRICE_ID = " price_graduated ";
    expect(getStripeGraduatedPriceId()).toBe("price_graduated");
    expect(getCheckoutPriceId()).toBe("price_graduated");
    // The list price reader is unchanged (custom rates hang off its Product).
    expect(getStripePriceId()).toBe("price_list");
  });

  it("falls back to the flat list price when the graduated Price is unset or blank", () => {
    process.env.STRIPE_PRICE_ID = "price_list";
    delete process.env.STRIPE_GRADUATED_PRICE_ID;
    expect(getCheckoutPriceId()).toBe("price_list");
    process.env.STRIPE_GRADUATED_PRICE_ID = "   ";
    expect(getCheckoutPriceId()).toBe("price_list");
  });

  it("is the only reader of STRIPE_GRADUATED_PRICE_ID, and Checkout goes through it", () => {
    const root = process.cwd();
    const checkout = readFileSync(path.join(root, "app/api/owner/billing/checkout/route.ts"), "utf8");
    expect(checkout).toContain("getCheckoutPriceId()");
    expect(checkout).not.toContain("getStripePriceId()");
    expect(checkout).not.toContain("process.env.STRIPE_");
    const stripeLib = readFileSync(path.join(root, "lib/stripe.ts"), "utf8");
    expect(stripeLib.match(/process\.env\.STRIPE_GRADUATED_PRICE_ID/g)).toHaveLength(1);
  });
});
