import "server-only";
import { gameUrl } from "@/lib/domainSplit";
import { getEmailFromAddress, resend } from "@/lib/email/resend";
import { buildWelcomeEmail } from "@/lib/email/welcomeEmail";

export type SendWelcomeEmailInput = {
  toEmail: string;
  ownerName: string;
  venueName: string;
  planAmountCents: number;
};

/**
 * Send the one-time partner welcome email. No-ops (returns false) when Resend
 * isn't configured rather than throwing — a missing email provider must never
 * fail the Stripe webhook that keeps billing_subscriptions in sync.
 */
export async function sendWelcomeEmail(input: SendWelcomeEmailInput): Promise<boolean> {
  if (!resend) return false;

  const { subject, html, text } = buildWelcomeEmail({
    venueName: input.venueName,
    ownerName: input.ownerName,
    planAmountCents: input.planAmountCents,
    tvSetupUrl: gameUrl("/tv"),
    billingUrl: gameUrl("/owner/billing"),
  });

  const { error } = await resend.emails.send({
    from: getEmailFromAddress(),
    to: input.toEmail,
    subject,
    html,
    text,
  });

  return !error;
}
