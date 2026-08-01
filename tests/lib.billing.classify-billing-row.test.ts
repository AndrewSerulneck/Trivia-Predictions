import { describe, expect, it } from "vitest";

import { classifyBillingRow } from "@/lib/billing";

describe("classifyBillingRow", () => {
  it("treats active as live", () => {
    expect(classifyBillingRow({ status: "active", stripe_subscription_id: "sub_1" })).toEqual({
      live: true,
      reason: "active",
    });
  });

  it("treats past_due as live (card declined but still retrying at Stripe)", () => {
    expect(classifyBillingRow({ status: "past_due", stripe_subscription_id: "sub_1" })).toEqual({
      live: true,
      reason: "past_due",
    });
  });

  it("treats cancelled as not live", () => {
    expect(classifyBillingRow({ status: "cancelled", stripe_subscription_id: "sub_1" })).toEqual({
      live: false,
      reason: "cancelled",
    });
  });

  it("treats a missing stripe_subscription_id as no_stripe_object, even if status says active", () => {
    expect(classifyBillingRow({ status: "active", stripe_subscription_id: null })).toEqual({
      live: false,
      reason: "no_stripe_object",
    });
  });
});
