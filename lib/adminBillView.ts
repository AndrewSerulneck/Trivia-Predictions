import { formatCentsShort } from "@/lib/merchPricing";
import type { AdminAttachPreview } from "@/lib/multiVenueBilling";

// Admin Partner Billing — how a multi-venue bill reads in the list (docs/multi-venue-volume-billing-plan.md
// Phase 6). Pure: no React, no fetch. Every number comes from `GET /api/admin/billing` (`bill`), which
// prices it with lib/venuePricing.ts; this file only formats it.

/** The bill a partner row's venue is on, as `GET /api/admin/billing` returns it. Money is integer cents. */
export type AdminPartnerBill = {
  id: string;
  isAnchor: boolean;
  anchorVenueId: string;
  /** The anchor venue's name, read before the list's search filter (null if it could not be read). */
  anchorVenueName: string | null;
  /** Venues billed on the next renewal (not leaving, not removed). */
  billedVenueCount: number;
  /** Venues set to leave at the period end. */
  leavingVenueCount: number;
  rate: "graduated" | "per_venue";
  breakdown: Array<{ venues: number; unitAmountCents: number }>;
  /** Next renewal's list total before discount: offline = the admin's amount; card = rate × billed venues. */
  monthlyListCents: number;
  /** Card bills: Stripe's quantity mirror when it differs from `billedVenueCount` (drift hint). */
  stripeQuantity: number | null;
  /** Offline bills: the graduated total for the venues billed — the grant form's suggestion. */
  suggestedOfflineCents: number | null;
  /** This venue on the bill: billed, leaving (Remove pressed) or removed. */
  venueState: "billed" | "leaving" | "removed";
};

/**
 * A venue taken OFF a bill (Phase 5's Remove) and on no bill now (Phase 6.3) — never shown as "Comped".
 * `anchorVenueId` is that bill's anchor venue today (null if it could not be read).
 */
export type AdminRemovedFrom = { anchorVenueId: string | null; anchorVenueName: string | null; removedAt: string | null };

/** "Removed from Pacific Street's bill (Oct 31, 2026)" */
export const removedFromLine = (removed: AdminRemovedFrom, options: { anchorName: string | null; formatDate: (iso: string | null) => string }): string => {
  const where = options.anchorName ? `Removed from ${options.anchorName}'s bill` : "Removed from its bill";
  return removed.removedAt ? `${where} (${options.formatDate(removed.removedAt)})` : where;
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "1 × $100 · 2 × $75" */
export const breakdownText = (bill: Pick<AdminPartnerBill, "breakdown">): string =>
  bill.breakdown.map((line) => `${line.venues} × ${formatCentsShort(line.unitAmountCents)}`).join(" · ");

/**
 * The one line under a venue's name. Anchor row: the whole bill. Any other venue on the bill: where
 * it is billed (actions live on the anchor's row).
 */
export const billSummaryLine = (
  bill: AdminPartnerBill,
  options: { isManual: boolean; anchorName: string }
): string => {
  const state = bill.venueState === "leaving" ? " · leaving at period end" : bill.venueState === "removed" ? " · removed" : "";
  if (!bill.isAnchor) return `On ${options.anchorName}'s bill${state}`;

  const parts = [plural(bill.billedVenueCount, "venue")];
  if (options.isManual) {
    parts.push(`${formatCentsShort(bill.monthlyListCents)}/mo by check`);
    if (bill.suggestedOfflineCents !== null && bill.suggestedOfflineCents !== bill.monthlyListCents) {
      parts.push(`bands say ${formatCentsShort(bill.suggestedOfflineCents)}`);
    }
  } else {
    parts.push(`${breakdownText(bill)} = ${formatCentsShort(bill.monthlyListCents)}/mo`);
    if (bill.rate === "per_venue") parts.push("custom per-venue rate");
  }
  if (bill.leavingVenueCount > 0) parts.push(`${bill.leavingVenueCount} leaving`);
  if (bill.stripeQuantity !== null) parts.push(`⚠ Stripe bills ${plural(bill.stripeQuantity, "venue")}`);
  return parts.join(" · ") + state;
};

/** The admin sentence for an "Add to their bill" / "Comped" preview, before Confirm. */
export const attachPreviewText = (preview: AdminAttachPreview): string => {
  const who = preview.owner.email || preview.owner.name || "this partner";
  if (preview.mode === "comped") {
    return `${preview.venue.name} goes on ${who}'s account for free. It is on no bill and nothing is charged.`;
  }
  if (preview.offline) {
    return (
      `${preview.venue.name} joins ${who}'s check-billed account (${plural(preview.offline.billedVenueCountAfter, "venue")}). ` +
      `Nothing is charged. Their amount stays ${formatCentsShort(preview.offline.currentMonthlyCents)}/mo until you change it — ` +
      `the bands for ${plural(preview.offline.billedVenueCountAfter, "venue")} come to ${formatCentsShort(preview.offline.suggestedMonthlyCents)}/mo.`
    );
  }
  if (preview.quote) {
    const quote = preview.quote;
    return (
      `${preview.venue.name} becomes venue #${quote.venueNumber} on ${who}'s bill at ${formatCentsShort(quote.thisVenueCents)}/mo. ` +
      `New monthly total ${formatCentsShort(quote.newMonthlyTotalCents)}. ` +
      `Their card on file is charged ${formatCentsShort(quote.dueTodayCents)} today (rest of this month).`
    );
  }
  return `${preview.venue.name} goes on ${who}'s bill.`;
};
