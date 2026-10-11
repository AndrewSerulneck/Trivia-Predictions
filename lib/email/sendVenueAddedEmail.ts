import "server-only";
import { gameUrl } from "@/lib/domainSplit";
import { getEmailFromAddress, resend } from "@/lib/email/resend";
import { buildVenueAddedEmail, type VenueAddedEmailInput } from "@/lib/email/venueAddedEmail";

export type SendVenueAddedEmailInput = Omit<VenueAddedEmailInput, "tvSetupUrl" | "dashboardUrl"> & {
  toEmail: string;
};

/**
 * Send the "venue added" email. Built in multi-venue billing Phase 1; the add-a-venue flow
 * (Phase 3) calls it once the prorated charge has succeeded and the venue is live.
 *
 * Same contract as sendWelcomeEmail: no-ops (returns false) when Resend isn't configured and
 * never throws — an email problem must never undo or fail a paid venue add. The CALLER owns
 * "send once" (e.g. a sent-at stamp on the billing_venue_additions ledger row), because Stripe
 * webhooks and route retries can both reach the completion path.
 */
export async function sendVenueAddedEmail(input: SendVenueAddedEmailInput): Promise<boolean> {
  if (!resend) return false;

  try {
    const { toEmail, ...content } = input;
    const { subject, html, text } = buildVenueAddedEmail({
      ...content,
      tvSetupUrl: gameUrl("/tv"),
      dashboardUrl: gameUrl("/owner/dashboard"),
    });

    const { error } = await resend.emails.send({
      from: getEmailFromAddress(),
      to: toEmail,
      subject,
      html,
      text,
    });
    return !error;
  } catch {
    return false;
  }
}
