import { describe, expect, it } from "vitest";

import { ADMIN_ADD_IN_PROGRESS_MESSAGE, interpretAdminAttachReply } from "@/lib/adminAttachFlow";
import { refusalEndsAttempt } from "@/lib/addVenueFlow";
import { VENUE_PRICE_TIERS, venuePriceBandsLabel } from "@/lib/venuePricing";

/**
 * Multi-venue billing Phase 6.4 (review #5): the admin "Link a venue" screen keeps its idempotency key
 * unless the answer PROVES nothing was charged.
 */

describe("refusalEndsAttempt", () => {
  it("is true only for a 4xx that is not 'another add holds the bill'", () => {
    expect(refusalEndsAttempt(402, "card_declined")).toBe(true);
    expect(refusalEndsAttempt(409, "venue_has_owner")).toBe(true);
    expect(refusalEndsAttempt(400, "invalid_request")).toBe(true);
    expect(refusalEndsAttempt(409, "addition_in_progress")).toBe(false);
    expect(refusalEndsAttempt(500, "addition_failed")).toBe(false);
    expect(refusalEndsAttempt(502, "addition_failed")).toBe(false);
    expect(refusalEndsAttempt(503, "stripe_unavailable")).toBe(false);
    expect(refusalEndsAttempt(200, "unknown")).toBe(false);
  });
});

describe("interpretAdminAttachReply", () => {
  it("reads the non-card successes", () => {
    expect(interpretAdminAttachReply(200, { ok: true, kind: "comped", venueId: "v" })).toEqual({ kind: "comped" });
    expect(interpretAdminAttachReply(200, { ok: true, kind: "already_on_bill", venueId: "v" })).toEqual({ kind: "already_on_bill" });
    expect(
      interpretAdminAttachReply(200, { ok: true, kind: "offline_attached", billedVenueCount: 2, suggestedMonthlyCents: 17500, currentMonthlyCents: 10000 })
    ).toEqual({ kind: "offline_attached", billedVenueCount: 2, suggestedMonthlyCents: 17500, currentMonthlyCents: 10000 });
  });

  it("reads the card outcomes with the partner flow's own classifier", () => {
    expect(interpretAdminAttachReply(200, { ok: true, kind: "card_add", status: "paid", chargedTodayCents: 5000 })).toEqual({
      kind: "paid",
      chargedTodayCents: 5000,
    });
    expect(
      interpretAdminAttachReply(202, { ok: true, kind: "card_add", status: "requires_action", hostedInvoiceUrl: "https://invoice.stripe.com/i/x" })
    ).toEqual({ kind: "requires_action", hostedInvoiceUrl: "https://invoice.stripe.com/i/x" });
    expect(interpretAdminAttachReply(202, { ok: true, kind: "card_add", status: "processing" })).toEqual({ kind: "processing" });
  });

  it("a definitive 4xx refusal ends the attempt (a fresh key next time)", () => {
    expect(interpretAdminAttachReply(402, { ok: false, code: "card_declined", error: "Declined." })).toEqual({ kind: "refused", message: "Declined.", requote: false });
    expect(interpretAdminAttachReply(409, { ok: false, code: "venue_has_owner", error: "Another partner's." })).toEqual({
      kind: "refused",
      message: "Another partner's.",
      requote: false,
    });
    // An admin-only code the partner flow does not know is still a clean refusal.
    expect(interpretAdminAttachReply(409, { ok: false, code: "venue_hidden" }).kind).toBe("refused");
  });

  it("a quote_changed refusal ends the attempt AND asks for a fresh preview (Phase 6.5)", () => {
    expect(interpretAdminAttachReply(409, { ok: false, code: "quote_changed", error: "The price changed." })).toEqual({
      kind: "refused",
      message: "The price changed.",
      requote: true,
    });
  });

  it("keeps the key (unconfirmed) when the outcome is unknown: 5xx, payment_unconfirmed, a dropped page", () => {
    expect(interpretAdminAttachReply(500, { ok: false, code: "addition_failed", error: "Something went wrong. Please try again." })).toEqual({
      kind: "unconfirmed",
      message: "Something went wrong. Please try again.",
    });
    expect(interpretAdminAttachReply(500, { ok: false, code: "invalid_request", error: "boom" }).kind).toBe("unconfirmed");
    expect(interpretAdminAttachReply(503, { ok: false, code: "payment_unconfirmed" }).kind).toBe("unconfirmed");
    expect(interpretAdminAttachReply(502, { ok: false, code: "addition_failed" }).kind).toBe("unconfirmed");
    expect(interpretAdminAttachReply(502, null).kind).toBe("unconfirmed");
  });

  it("keeps the key while another add holds the bill", () => {
    expect(interpretAdminAttachReply(409, { ok: false, code: "addition_in_progress", error: "You're already adding a venue." })).toEqual({
      kind: "unconfirmed",
      message: ADMIN_ADD_IN_PROGRESS_MESSAGE,
    });
  });

  it("an answer it does not recognise never reads as a clean refusal", () => {
    expect(interpretAdminAttachReply(200, { ok: true, kind: "something-new" }).kind).toBe("unconfirmed");
  });
});

describe("venuePriceBandsLabel (review #8)", () => {
  it("is built from VENUE_PRICE_TIERS", () => {
    expect(venuePriceBandsLabel()).toBe("$100 / $75 / $60 / $45");
    expect(venuePriceBandsLabel().split(" / ")).toHaveLength(VENUE_PRICE_TIERS.length);
  });
});
