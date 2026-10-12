import { describe, expect, it } from "vitest";

import {
  LAPSED_LINE,
  attachPreviewText,
  attachVenueOptionLabel,
  billSummaryLine,
  removedFromLine,
  type AdminPartnerBill,
} from "@/lib/adminBillView";

/** Multi-venue billing Phase 6 — how a bill reads in Admin → Partner Billing. */

const bill = (overrides: Partial<AdminPartnerBill> = {}): AdminPartnerBill => ({
  id: "bill-1",
  isAnchor: true,
  anchorVenueId: "venue-a",
  anchorVenueName: "Pacific Street",
  billedVenueCount: 3,
  leavingVenueCount: 0,
  rate: "graduated",
  breakdown: [
    { venues: 1, unitAmountCents: 10000 },
    { venues: 2, unitAmountCents: 7500 },
  ],
  monthlyListCents: 25000,
  stripeQuantity: null,
  suggestedOfflineCents: null,
  venueState: "billed",
  ...overrides,
});

describe("billSummaryLine", () => {
  it("anchor row of a card bill: venues, bands and the monthly total", () => {
    expect(billSummaryLine(bill(), { isManual: false, anchorName: "A" })).toBe("3 venues · 1 × $100 · 2 × $75 = $250/mo");
  });

  it("names a per-venue custom rate, venues leaving, and Stripe drift", () => {
    const line = billSummaryLine(
      bill({
        rate: "per_venue",
        breakdown: [{ venues: 3, unitAmountCents: 7000 }],
        monthlyListCents: 21000,
        leavingVenueCount: 1,
        stripeQuantity: 4,
      }),
      { isManual: false, anchorName: "A" }
    );
    expect(line).toBe("3 venues · 3 × $70 = $210/mo · custom per-venue rate · 1 leaving · ⚠ Stripe bills 4 venues");
  });

  it("check-billed: the admin's amount, and the bands when they differ", () => {
    expect(
      billSummaryLine(bill({ billedVenueCount: 2, monthlyListCents: 10000, suggestedOfflineCents: 17500 }), { isManual: true, anchorName: "A" })
    ).toBe("2 venues · $100/mo by check · bands say $175");
    expect(billSummaryLine(bill({ billedVenueCount: 1, monthlyListCents: 10000, suggestedOfflineCents: 10000 }), { isManual: true, anchorName: "A" })).toBe(
      "1 venue · $100/mo by check"
    );
  });

  it("any other venue on the bill points at the anchor", () => {
    expect(billSummaryLine(bill({ isAnchor: false }), { isManual: false, anchorName: "Anchor Bar" })).toBe("On Anchor Bar's bill");
    expect(billSummaryLine(bill({ isAnchor: false, venueState: "leaving" }), { isManual: false, anchorName: "Anchor Bar" })).toBe(
      "On Anchor Bar's bill · leaving at period end"
    );
  });
});

describe("attachPreviewText", () => {
  const base = { venue: { id: "v", name: "Second Bar" }, owner: { id: "o", email: "pat@example.com", name: "Pat" } };

  it("comped, offline and card previews say what happens to money", () => {
    expect(attachPreviewText({ ...base, mode: "comped", quote: null, offline: null })).toContain("for free");
    expect(
      attachPreviewText({
        ...base,
        mode: "bill",
        quote: null,
        offline: { billedVenueCountAfter: 2, suggestedMonthlyCents: 17500, currentMonthlyCents: 10000 },
      })
    ).toContain("Nothing is charged. Their amount stays $100/mo");
    expect(
      attachPreviewText({
        ...base,
        mode: "bill",
        offline: null,
        quote: {
          currentVenueCount: 1,
          venueNumber: 2,
          thisVenueCents: 7500,
          newMonthlyListCents: 17500,
          newMonthlyTotalCents: 17500,
          dueTodayCents: 3750,
          prorationDate: 1,
          currentPeriodEnd: null,
          discountLabel: null,
        },
      })
    ).toBe(
      "Second Bar becomes venue #2 on pat@example.com's bill at $75/mo. New monthly total $175. Their card on file is charged $37.50 today (rest of this month)."
    );
  });
});

describe("removedFromLine (Phase 6.3)", () => {
  const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

  it("names the bill the venue left and when", () => {
    expect(
      removedFromLine({ anchorVenueId: "venue-a", anchorVenueName: "Pacific Street", removedAt: "2026-10-31T00:00:00Z" }, { anchorName: "Pacific Street", formatDate })
    ).toBe("Removed from Pacific Street's bill (2026-10-31)");
  });

  it("still reads sensibly without an anchor name or date", () => {
    expect(removedFromLine({ anchorVenueId: null, anchorVenueName: null, removedAt: null }, { anchorName: null, formatDate })).toBe("Removed from its bill");
  });
});

describe("Link a venue picker labels (Phase 6.7)", () => {
  const venue = (state: "unlinked" | "comped" | "lapsed" | "removed") => ({ id: "v", name: "Bravo", ownerId: state === "unlinked" ? null : "o", state });

  it("says what each venue is and whose bill it can rejoin", () => {
    expect(attachVenueOptionLabel(venue("unlinked"), null)).toBe("Bravo");
    expect(attachVenueOptionLabel(venue("comped"), "a@b.com")).toBe("Bravo — free on a@b.com");
    expect(attachVenueOptionLabel(venue("lapsed"), "a@b.com")).toBe("Bravo — bill cancelled, rejoin a@b.com");
    expect(attachVenueOptionLabel(venue("removed"), null)).toBe("Bravo — removed from a bill, rejoin a partner");
  });

  it("the list line for a lapsed venue", () => {
    expect(LAPSED_LINE).toBe("Bill cancelled — can rejoin their bill");
  });
});
