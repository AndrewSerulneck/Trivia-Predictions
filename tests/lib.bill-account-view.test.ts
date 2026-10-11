import { describe, expect, it } from "vitest";
import {
  breakdownLabel,
  changeDoneMessage,
  interpretVenueChangeReply,
  removeConfirmText,
  venueAction,
} from "@/lib/billAccountView";
import { VENUE_CHANGE_MESSAGES } from "@/lib/multiVenueBilling";

const card = { isManual: false, cancelAtPeriodEnd: false, status: "active" };

describe("billAccountView (multi-venue billing Phase 5)", () => {
  it("formats the band line from the server's breakdown", () => {
    expect(
      breakdownLabel({
        breakdown: [
          { venues: 1, unitAmountCents: 10000, subtotalCents: 10000 },
          { venues: 3, unitAmountCents: 7500, subtotalCents: 22500 },
        ],
      })
    ).toBe("1 × $100 · 3 × $75");
  });

  it("offers Remove only while another venue stays billed, Undo while leaving, Add back once off", () => {
    expect(venueAction({ state: "billed" }, { billedVenueCount: 2 }, card)).toBe("remove");
    expect(venueAction({ state: "billed" }, { billedVenueCount: 1 }, card)).toBeNull();
    expect(venueAction({ state: "leaving" }, { billedVenueCount: 1 }, card)).toBe("undo");
    expect(venueAction({ state: "removed" }, { billedVenueCount: 1 }, card)).toBe("add_back");
    expect(venueAction({ state: "removed" }, { billedVenueCount: 1 }, { ...card, status: "past_due" })).toBeNull();
  });

  it("offers nothing on a check-billed, cancelling or cancelled bill", () => {
    for (const bill of [
      { ...card, isManual: true },
      { ...card, cancelAtPeriodEnd: true },
      { ...card, status: "cancelled" },
    ]) {
      expect(venueAction({ state: "billed" }, { billedVenueCount: 3 }, bill)).toBeNull();
      expect(venueAction({ state: "leaving" }, { billedVenueCount: 3 }, bill)).toBeNull();
    }
  });

  it("the Remove question names the date and promises no refund, with no prices", () => {
    const text = removeConfirmText("Second Bar", "2026-10-20T15:00:00.000Z");
    expect(text).toContain("Second Bar");
    expect(text).toContain("Oct 20");
    expect(text).toContain("no refund");
    expect(text).not.toMatch(/\$\d/);
  });

  it("reads answers: done, refused (with the server's words), unconfirmed on 5xx", () => {
    const change = { action: "remove", venueId: "v", removeAt: "2026-10-20T15:00:00.000Z", billedVenueCount: 2 };
    expect(interpretVenueChangeReply(200, { ok: true, change })).toEqual({ kind: "done", change });
    expect(interpretVenueChangeReply(409, { ok: false, code: "last_venue", error: "Only one." })).toEqual({
      kind: "refused",
      code: "last_venue",
      message: "Only one.",
    });
    expect(interpretVenueChangeReply(503, { ok: false, code: "change_unconfirmed" })).toEqual({
      kind: "unconfirmed",
      message: VENUE_CHANGE_MESSAGES.change_unconfirmed,
    });
    expect(interpretVenueChangeReply(502, null).kind).toBe("unconfirmed");
    expect(interpretVenueChangeReply(400, null)).toEqual({ kind: "refused", code: "unknown", message: VENUE_CHANGE_MESSAGES.change_failed });
  });

  it("says what happens next", () => {
    expect(changeDoneMessage("Second Bar", { action: "undo", venueId: "v", removeAt: null, billedVenueCount: 3 })).toBe(
      "Second Bar stays on your bill."
    );
    expect(
      changeDoneMessage("Second Bar", { action: "remove", venueId: "v", removeAt: "2026-10-20T15:00:00.000Z", billedVenueCount: 2 })
    ).toContain("Oct 20");
  });
});
