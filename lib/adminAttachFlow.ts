import { interpretAddVenueReply, refusalEndsAttempt } from "@/lib/addVenueFlow";

// Admin → Partner Billing → "Link a venue to a partner": how one answer from
// `POST /api/admin/billing` (`action: "attach-venue"`, preview false) is read (docs/multi-venue-volume-billing-plan.md
// Phase 6.4, review #5). Pure — no React, no fetch. The card-charge answers are read by the partner flow's
// own `interpretAddVenueReply` (lib/addVenueFlow.ts); this adds only the admin's non-card answers and the one
// decision the screen needs: may the NEXT Confirm use a fresh idempotency key?

export type AdminAttachConfirmOutcome =
  | { kind: "comped" }
  | { kind: "already_on_bill" }
  | { kind: "offline_attached"; billedVenueCount: number | null; suggestedMonthlyCents: number; currentMonthlyCents: number }
  /** The card was charged and the venue is on the bill. */
  | { kind: "paid"; chargedTodayCents: number | null }
  /** The bank wants 3-D Secure on Stripe's page. Same key to re-check. */
  | { kind: "requires_action"; hostedInvoiceUrl: string | null }
  /** Payment is being confirmed. Same key to re-check. */
  | { kind: "processing" }
  /** We can't tell whether the card was charged (a 5xx, a dropped page, another add holding the bill). SAME key to ask again. */
  | { kind: "unconfirmed"; message: string }
  /**
   * Nothing was charged or written. The next Confirm gets a NEW key. `requote`: the price moved since the
   * preview (`quote_changed`) — the preview must be run again before Confirm can succeed.
   */
  | { kind: "refused"; message: string; requote: boolean };

/** Said when another add holds the partner's bill; the server's own sentence is worded for the partner. */
export const ADMIN_ADD_IN_PROGRESS_MESSAGE =
  "Another add is in progress on this partner's bill. Check again in a moment — it re-asks with the same key, so it can't charge twice.";

const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export const interpretAdminAttachReply = (httpStatus: number, body: unknown): AdminAttachConfirmOutcome => {
  const reply = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (reply.ok === true && httpStatus < 300) {
    if (reply.kind === "comped") return { kind: "comped" };
    if (reply.kind === "already_on_bill") return { kind: "already_on_bill" };
    if (reply.kind === "offline_attached") {
      return {
        kind: "offline_attached",
        billedVenueCount: typeof reply.billedVenueCount === "number" ? reply.billedVenueCount : null,
        suggestedMonthlyCents: numberOr(reply.suggestedMonthlyCents, 0),
        currentMonthlyCents: numberOr(reply.currentMonthlyCents, 0),
      };
    }
  }

  const outcome = interpretAddVenueReply(httpStatus, body);
  if (outcome.kind === "paid") return { kind: "paid", chargedTodayCents: outcome.chargedTodayCents };
  if (outcome.kind === "requires_action") return { kind: "requires_action", hostedInvoiceUrl: outcome.hostedInvoiceUrl };
  if (outcome.kind === "processing") return { kind: "processing" };
  if (outcome.kind === "unconfirmed") return { kind: "unconfirmed", message: outcome.message };

  if (outcome.code === "addition_in_progress") return { kind: "unconfirmed", message: ADMIN_ADD_IN_PROGRESS_MESSAGE };
  return refusalEndsAttempt(httpStatus, outcome.code)
    ? { kind: "refused", message: outcome.message, requote: outcome.code === "quote_changed" }
    : { kind: "unconfirmed", message: outcome.message };
};
