import { formatCentsShort } from "@/lib/merchPricing";
import {
  VENUE_CHANGE_MESSAGES,
  type BillAccount,
  type BillAccountVenue,
  type VenueBillChangeResult,
  type VenueChangeFailureCode,
} from "@/lib/multiVenueBilling";

// The Billing page's account view (docs/multi-venue-volume-billing-plan.md §4.5, Phase 5): which
// button each venue gets, the band line, and how a Remove / Undo answer reads. Pure — no React, no
// fetch — so every rule is unit-tested. Every number comes from the server (`account`); this file
// only formats it and never prices anything.

/** "1 × $100 · 3 × $75" — the bands of the next renewal. */
export const breakdownLabel = (account: Pick<BillAccount, "breakdown">): string =>
  account.breakdown.map((line) => `${line.venues} × ${formatCentsShort(line.unitAmountCents)}`).join(" · ");

/** The one action a venue row offers, or null. */
export type BillVenueAction = "remove" | "undo" | "add_back" | null;

/**
 * Remove — a billed venue, while at least one OTHER venue stays billed (the last one is a Cancel,
 * which the page already has), and only on a card bill that can change.
 * Undo — a venue set to leave. Add back — a venue that has left (a paid add).
 */
export const venueAction = (
  venue: Pick<BillAccountVenue, "state">,
  account: Pick<BillAccount, "billedVenueCount">,
  bill: { isManual: boolean; cancelAtPeriodEnd: boolean; status: string }
): BillVenueAction => {
  if (bill.isManual || bill.cancelAtPeriodEnd || bill.status === "cancelled") return null;
  if (venue.state === "billed") return account.billedVenueCount > 1 ? "remove" : null;
  if (venue.state === "leaving") return "undo";
  return bill.status === "active" ? "add_back" : null;
};

/** "Oct 20" for a leaving date, or null. */
export const formatLeaveDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** The confirm question before a Remove. No amounts: the page never prices anything. */
export const removeConfirmText = (venueName: string, removeAtIso: string | null): string => {
  const until = formatLeaveDate(removeAtIso);
  return (
    `Take ${venueName} off your bill?\n\n` +
    `${until ? `It stays live for players until ${until} (the end of the month you've paid for), then leaves.` : "It stays live until the end of the month you've paid for, then leaves."} ` +
    "Your bill goes down from the next renewal. There's no refund for this month, and you can undo this until then."
  );
};

/** What the page does with one answer from `POST /api/owner/venues/remove`. */
export type VenueChangeReply =
  | { kind: "done"; change: VenueBillChangeResult }
  /** The server couldn't confirm it. Refresh rather than pressing again. */
  | { kind: "unconfirmed"; message: string }
  | { kind: "refused"; code: VenueChangeFailureCode | "unknown"; message: string };

const isChangeCode = (value: unknown): value is VenueChangeFailureCode =>
  typeof value === "string" && value in VENUE_CHANGE_MESSAGES;

const isChange = (value: unknown): value is VenueBillChangeResult => {
  if (!value || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  return (change.action === "remove" || change.action === "undo") && typeof change.venueId === "string";
};

export const interpretVenueChangeReply = (httpStatus: number, body: unknown): VenueChangeReply => {
  const reply = body && typeof body === "object" ? (body as { ok?: unknown; change?: unknown; code?: unknown; error?: unknown }) : {};
  if (reply.ok === true && isChange(reply.change)) return { kind: "done", change: reply.change };
  const code = isChangeCode(reply.code) ? reply.code : "unknown";
  const message =
    typeof reply.error === "string" && reply.error
      ? reply.error
      : code === "unknown"
        ? VENUE_CHANGE_MESSAGES.change_failed
        : VENUE_CHANGE_MESSAGES[code];
  if (code === "change_unconfirmed" || (code === "unknown" && httpStatus >= 500)) {
    return { kind: "unconfirmed", message: code === "unknown" ? VENUE_CHANGE_MESSAGES.change_unconfirmed : message };
  }
  return { kind: "refused", code, message };
};

/** The banner after a successful change. */
export const changeDoneMessage = (venueName: string, change: VenueBillChangeResult): string => {
  if (change.action === "undo") return `${venueName} stays on your bill.`;
  const until = formatLeaveDate(change.removeAt);
  return until ? `${venueName} stays live until ${until}, then leaves your bill.` : `${venueName} will leave your bill at the end of this month.`;
};
