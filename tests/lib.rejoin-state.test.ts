import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import { classifyRejoin } from "@/lib/venueBilling";
import { ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES, ON_PARTNER_BILL_MESSAGES, onPartnerBillMessageKey } from "@/lib/multiVenueBilling";

/**
 * Multi-venue billing Phase 6.6 — the rejoin rule (`classifyRejoin`, lib/venueBilling.ts): where a
 * venue stands relative to the partner's live bill it is being added (back) to.
 */

const NOW = Date.parse("2026-10-11T12:00:00Z");
const PAST = "2026-10-01T00:00:00Z";
const FUTURE = "2026-11-01T00:00:00Z";
const TARGET = "bill-live";
const live = (id: string, owner = "owner-1") => ({ id, status: "active", owner_id: owner });
const dead = (id: string, owner = "owner-1") => ({ id, status: "cancelled", owner_id: owner });
const row = (subscriptionId: string, removeAt: string | null = null, removedAt: string | null = null) => ({
  subscription_id: subscriptionId,
  remove_at: removeAt,
  removed_at: removedAt,
});

describe("classifyRejoin", () => {
  it("on the target bill: billed, leaving (Undo) or left (Add back)", () => {
    expect(classifyRejoin(TARGET, row(TARGET), null, null, NOW)).toEqual({ kind: "billed_here" });
    expect(classifyRejoin(TARGET, row(TARGET, FUTURE), null, null, NOW)).toEqual({ kind: "leaving_here" });
    expect(classifyRejoin(TARGET, row(TARGET, PAST), null, null, NOW)).toEqual({ kind: "left_here" });
    expect(classifyRejoin(TARGET, row(TARGET, PAST, PAST), null, null, NOW)).toEqual({ kind: "left_here" });
  });

  it("anchoring a live bill: the target (billed) or another one (refused)", () => {
    expect(classifyRejoin(TARGET, null, live(TARGET), null, NOW)).toEqual({ kind: "billed_here" });
    expect(classifyRejoin(TARGET, row("bill-x"), live("bill-x"), live("bill-x"), NOW)).toEqual({ kind: "other_live_bill", billId: "bill-x" });
  });

  it("#1: its own bill was cancelled (row on it, or no row at all) → may rejoin", () => {
    expect(classifyRejoin(TARGET, row("bill-old"), dead("bill-old"), dead("bill-old"), NOW)).toEqual({
      kind: "dead_bill",
      fromBillId: "bill-old",
      fromOwnerId: "owner-1",
    });
    expect(classifyRejoin(TARGET, null, dead("bill-old", "owner-9"), null, NOW)).toEqual({
      kind: "dead_bill",
      fromBillId: "bill-old",
      fromOwnerId: "owner-9",
    });
  });

  it("#2: removed from (or still on) a chain bill that was cancelled → may rejoin", () => {
    expect(classifyRejoin(TARGET, row("bill-chain", PAST, PAST), null, dead("bill-chain"), NOW)).toMatchObject({ kind: "dead_bill", fromBillId: "bill-chain" });
    expect(classifyRejoin(TARGET, row("bill-chain"), null, dead("bill-chain"), NOW)).toMatchObject({ kind: "dead_bill" });
  });

  it("on another LIVE bill, or a bill we could not read → refused; no history → never billed", () => {
    expect(classifyRejoin(TARGET, row("bill-x", PAST, PAST), null, live("bill-x"), NOW)).toEqual({ kind: "other_live_bill", billId: "bill-x" });
    expect(classifyRejoin(TARGET, row("bill-x"), null, null, NOW)).toEqual({ kind: "other_live_bill", billId: "bill-x" });
    expect(classifyRejoin(TARGET, null, null, null, NOW)).toEqual({ kind: "never_billed" });
  });
});

describe("on_partner_bill copy (Phase 6.6)", () => {
  const card = { billId: "bill-a", byCard: true };
  const check = { billId: "bill-a", byCard: false };
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED;
  });

  it("lapsed points at Add back; removed with no live bill to return to points at support", () => {
    process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED = "true";
    for (const audience of ["partner", "admin"] as const) {
      expect(onPartnerBillMessageKey({ kind: "lapsed", ownerBillId: "bill-a", rejoin: card }, audience)).toBe("lapsed");
      expect(onPartnerBillMessageKey({ kind: "removed", ownerBillId: "bill-a", rejoin: card }, audience)).toBe("removed");
      expect(onPartnerBillMessageKey({ kind: "removed", ownerBillId: null, rejoin: null }, audience)).toBe("removed_no_bill");
      expect(onPartnerBillMessageKey({ kind: "comped", ownerBillId: "bill-a" }, audience)).toBe("comped");
      expect(onPartnerBillMessageKey({ kind: "unbilled", ownerBillId: "bill-a" }, audience)).toBe("shared");
    }
  });

  it("Phase 6.9: 'Add it back' only where that button exists", () => {
    // Flag off: no partner Add back at all; the admin can still put it on a check bill, not a card bill.
    expect(onPartnerBillMessageKey({ kind: "lapsed", ownerBillId: "bill-a", rejoin: card }, "partner")).toBe("rejoin_unavailable");
    expect(onPartnerBillMessageKey({ kind: "removed", ownerBillId: "bill-a", rejoin: card }, "partner")).toBe("rejoin_unavailable");
    expect(onPartnerBillMessageKey({ kind: "lapsed", ownerBillId: "bill-a", rejoin: card }, "admin")).toBe("rejoin_unavailable");
    expect(onPartnerBillMessageKey({ kind: "lapsed", ownerBillId: "bill-a", rejoin: check }, "admin")).toBe("lapsed");
    // Flag on: a check-billed partner has no Add back (card-only); the admin path takes both.
    process.env.NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED = "true";
    expect(onPartnerBillMessageKey({ kind: "lapsed", ownerBillId: "bill-a", rejoin: check }, "partner")).toBe("rejoin_unavailable");
    expect(onPartnerBillMessageKey({ kind: "lapsed", ownerBillId: "bill-a", rejoin: check }, "admin")).toBe("lapsed");
    expect(ON_PARTNER_BILL_MESSAGES.rejoin_unavailable).toContain("@");
  });

  it("every partner key has an admin sentence", () => {
    for (const key of Object.keys(ON_PARTNER_BILL_MESSAGES)) {
      expect(ADMIN_GRANT_ON_PARTNER_BILL_MESSAGES).toHaveProperty(key);
    }
    expect(ON_PARTNER_BILL_MESSAGES.removed_no_bill).toContain("@");
  });
});
