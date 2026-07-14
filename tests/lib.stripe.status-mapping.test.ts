import { describe, expect, it } from "vitest";
import { mapStripeSubscriptionStatus } from "@/lib/stripe";

describe("mapStripeSubscriptionStatus", () => {
  it("maps active-equivalent Stripe statuses to 'active'", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("active");
  });

  it("maps recoverable payment problems to 'past_due'", () => {
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("past_due");
  });

  it("maps terminal Stripe statuses to 'cancelled'", () => {
    expect(mapStripeSubscriptionStatus("canceled")).toBe("cancelled");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("cancelled");
    expect(mapStripeSubscriptionStatus("paused")).toBe("cancelled");
  });

  it("defaults unknown statuses to the safe 'past_due' (never silently active)", () => {
    expect(mapStripeSubscriptionStatus("something_new")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("")).toBe("past_due");
  });
});
