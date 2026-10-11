import { describe, expect, it } from "vitest";
import {
  ADD_VENUE_STEPS,
  addVenueDraftHasAnswers,
  addVenueStepIssue,
  addVenueUrlStep,
  blankAddVenueDraft,
  buildAddVenueBody,
  formatPeriodEnd,
  interpretAddVenueReply,
  interpretQuoteReply,
  isStripeHostedUrl,
  newAttemptKey,
  resolveAddVenueStep,
  type AddVenueDraft,
} from "@/lib/addVenueFlow";
import { ADD_VENUE_MESSAGES, type AddVenueQuote } from "@/lib/multiVenueBilling";

// Multi-venue billing Phase 4 — the pure half of the Add-a-venue sheet: which screen a URL lands on,
// what each screen needs, the request body, and how every server answer is read.

const addressDraft = (): AddVenueDraft => ({
  ...blankAddVenueDraft(),
  venueName: "Murphy's Tap House",
  street: "12 Main St",
  city: "Denver",
  state: "CO",
  zipCode: "80202",
  placeId: "place-1",
});

const pinnedDraft = (): AddVenueDraft => ({ ...addressDraft(), latitude: 39.74, longitude: -104.99, radius: 150 });

const quote: AddVenueQuote = {
  currentVenueCount: 1,
  venueNumber: 2,
  thisVenueCents: 7500,
  newMonthlyListCents: 17500,
  newMonthlyTotalCents: 17500,
  dueTodayCents: 2268,
  prorationDate: 1_760_000_000,
  currentPeriodEnd: "2026-10-20T12:00:00.000Z",
  discountLabel: null,
};

describe("steps", () => {
  it("are address, map, review — and only the first has no ?step=", () => {
    expect([...ADD_VENUE_STEPS]).toEqual(["address", "map", "review"]);
    expect(addVenueUrlStep("address")).toBeNull();
    expect(addVenueUrlStep("map")).toBe("map");
    expect(addVenueUrlStep("review")).toBe("review");
  });

  it("resolve to the first screen for nothing, junk, or answers a reload lost", () => {
    const blank = blankAddVenueDraft();
    expect(resolveAddVenueStep(null, blank)).toBe("address");
    expect(resolveAddVenueStep("nonsense", pinnedDraft())).toBe("address");
    expect(resolveAddVenueStep("map", blank)).toBe("address");
    expect(resolveAddVenueStep("review", blank)).toBe("address");
  });

  it("let Review through only once the pin exists, else fall back to the map", () => {
    expect(resolveAddVenueStep("review", addressDraft())).toBe("map");
    expect(resolveAddVenueStep("map", addressDraft())).toBe("map");
    expect(resolveAddVenueStep("review", pinnedDraft())).toBe("review");
  });
});

describe("what each screen needs (the signup rules)", () => {
  it("address needs a name and a full address", () => {
    expect(addVenueStepIssue("address", blankAddVenueDraft())).toMatch(/venue name/i);
    expect(addVenueStepIssue("address", { ...addressDraft(), street: "" })).toMatch(/street/i);
    expect(addVenueStepIssue("address", addressDraft())).toBeNull();
  });

  it("map needs a pin; review needs everything", () => {
    expect(addVenueStepIssue("map", addressDraft())).toMatch(/pin/i);
    expect(addVenueStepIssue("map", pinnedDraft())).toBeNull();
    expect(addVenueStepIssue("review", addressDraft())).not.toBeNull();
    expect(addVenueStepIssue("review", pinnedDraft())).toBeNull();
  });

  it("rejects a radius outside the signup band", () => {
    expect(addVenueStepIssue("map", { ...pinnedDraft(), radius: 5000 })).toMatch(/between/i);
  });

  it("a blank draft has no answers; a typed name or a pin does", () => {
    expect(addVenueDraftHasAnswers(blankAddVenueDraft())).toBe(false);
    expect(addVenueDraftHasAnswers({ ...blankAddVenueDraft(), venueName: "  " })).toBe(false);
    expect(addVenueDraftHasAnswers({ ...blankAddVenueDraft(), venueName: "Joe's" })).toBe(true);
    expect(addVenueDraftHasAnswers({ ...blankAddVenueDraft(), latitude: 1 })).toBe(true);
  });
});

describe("buildAddVenueBody", () => {
  it("trims and upper-cases, and carries the key, the bill's venue and the quote's proration date", () => {
    const body = buildAddVenueBody({
      draft: { ...pinnedDraft(), venueName: "  Murphy's  ", state: "co" },
      idempotencyKey: "key-12345678",
      venueId: "venue-a",
      prorationDate: 1_760_000_000,
    });
    expect(body).toMatchObject({
      idempotencyKey: "key-12345678",
      venueId: "venue-a",
      venueName: "Murphy's",
      state: "CO",
      latitude: 39.74,
      longitude: -104.99,
      radius: 150,
      prorationDate: 1_760_000_000,
    });
  });

  it("omits prorationDate when there is no quote", () => {
    const body = buildAddVenueBody({ draft: pinnedDraft(), idempotencyKey: "key-12345678", venueId: "v", prorationDate: null });
    expect("prorationDate" in body).toBe(false);
  });

  it("never sends an account name, email or password", () => {
    const body = buildAddVenueBody({ draft: pinnedDraft(), idempotencyKey: "key-12345678", venueId: "v", prorationDate: null });
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["email"]));
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["password"]));
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(["name"]));
  });
});

describe("newAttemptKey", () => {
  it("is something the server accepts (8–64 of A-Za-z0-9_-) and different every time", () => {
    const a = newAttemptKey();
    const b = newAttemptKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(a).not.toBe(b);
  });
});

describe("interpretAddVenueReply", () => {
  it("paid → live, with the venue and what was charged", () => {
    expect(
      interpretAddVenueReply(200, { ok: true, status: "paid", additionId: "a", venueId: "v2", chargedTodayCents: 2268 }),
    ).toEqual({ kind: "paid", venueId: "v2", chargedTodayCents: 2268 });
  });

  it("requires_action → Stripe's own hosted page only", () => {
    const good = interpretAddVenueReply(202, {
      ok: true,
      status: "requires_action",
      additionId: "a",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_1/test_abc",
    });
    expect(good).toEqual({ kind: "requires_action", hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_1/test_abc" });

    for (const url of ["http://invoice.stripe.com/x", "https://evil.example.com/pay", "javascript:alert(1)", "https://stripe.com.evil.io/x"]) {
      const bad = interpretAddVenueReply(202, { ok: true, status: "requires_action", additionId: "a", hostedInvoiceUrl: url });
      expect(bad).toEqual({ kind: "requires_action", hostedInvoiceUrl: null });
    }
  });

  it("processing → ask again with the same key", () => {
    expect(interpretAddVenueReply(202, { ok: true, status: "processing", additionId: "a" })).toEqual({ kind: "processing" });
  });

  it("payment_unconfirmed → never invites a new attempt", () => {
    const outcome = interpretAddVenueReply(503, { ok: false, code: "payment_unconfirmed", error: "Not sure yet." });
    expect(outcome).toEqual({ kind: "unconfirmed", message: "Not sure yet." });
  });

  it("a gateway page with no JSON body on a 5xx is unconfirmed, not a refusal", () => {
    expect(interpretAddVenueReply(502, null)).toMatchObject({ kind: "unconfirmed" });
  });

  it("a declined card is a refusal that sends the partner to Billing", () => {
    const outcome = interpretAddVenueReply(402, { ok: false, code: "card_declined", error: ADD_VENUE_MESSAGES.card_declined });
    expect(outcome).toMatchObject({ kind: "refused", code: "card_declined", link: "billing" });
  });

  it("billing-state refusals link to Billing; address refusals do not", () => {
    for (const code of ["bill_not_active", "cancel_scheduled", "no_bill"] as const) {
      expect(interpretAddVenueReply(409, { ok: false, code, error: "x" })).toMatchObject({ link: "billing" });
    }
    for (const code of ["venue_exists", "offline_bill", "custom_rate", "invalid_request"] as const) {
      expect(interpretAddVenueReply(409, { ok: false, code, error: "x" })).toMatchObject({ kind: "refused", link: null });
    }
  });

  it("uses the shared copy when the server sent a code but no text", () => {
    expect(interpretAddVenueReply(409, { ok: false, code: "offline_bill" })).toMatchObject({
      message: ADD_VENUE_MESSAGES.offline_bill,
    });
  });

  it("an unknown code is a plain, retryable refusal", () => {
    expect(interpretAddVenueReply(400, { ok: false, code: "something_new" })).toMatchObject({
      kind: "refused",
      code: "unknown",
      link: null,
    });
  });

  it("addition_in_progress keeps the earlier add's payment link, if it is Stripe's", () => {
    const outcome = interpretAddVenueReply(409, {
      ok: false,
      code: "addition_in_progress",
      error: "x",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_1/test_abc",
    });
    expect(outcome).toMatchObject({ kind: "refused", hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_1/test_abc" });
  });
});

describe("interpretQuoteReply", () => {
  it("reads a good quote", () => {
    expect(interpretQuoteReply(200, { ok: true, quote })).toEqual({ ok: true, quote });
  });

  it("reads a refusal with its code and Billing link", () => {
    expect(interpretQuoteReply(409, { ok: false, code: "bill_not_active", error: "Not active." })).toMatchObject({
      ok: false,
      code: "bill_not_active",
      link: "billing",
    });
  });

  it("treats a malformed or empty answer as billing being unavailable", () => {
    expect(interpretQuoteReply(200, { ok: true, quote: { venueNumber: 2 } })).toMatchObject({ ok: false, code: "stripe_unavailable" });
    expect(interpretQuoteReply(502, null)).toMatchObject({ ok: false, code: "stripe_unavailable" });
  });
});

describe("isStripeHostedUrl / formatPeriodEnd", () => {
  it("accepts https stripe.com hosts only", () => {
    expect(isStripeHostedUrl("https://invoice.stripe.com/i/x")).toBe(true);
    expect(isStripeHostedUrl("https://stripe.com/x")).toBe(true);
    expect(isStripeHostedUrl("https://notstripe.com/x")).toBe(false);
    expect(isStripeHostedUrl(null)).toBe(false);
    expect(isStripeHostedUrl("not a url")).toBe(false);
  });

  it("formats a period end as 'Oct 20' and tolerates nothing", () => {
    expect(formatPeriodEnd("2026-10-20T12:00:00.000Z")).toBe("Oct 20");
    expect(formatPeriodEnd(null)).toBeNull();
    expect(formatPeriodEnd("garbage")).toBeNull();
  });
});
