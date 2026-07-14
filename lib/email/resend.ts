import "server-only";
import { Resend } from "resend";

/**
 * Shared Resend client, or null when RESEND_API_KEY is not configured. Mirrors
 * the lib/stripe.ts / lib/supabaseAdmin.ts null-check pattern — callers must
 * null-check and no-op (never throw) so a missing key doesn't break billing.
 */
export const resend: Resend | null = process.env.RESEND_API_KEY?.trim()
  ? new Resend(process.env.RESEND_API_KEY.trim())
  : null;

/** "From" address for all outbound app email. Must be a domain verified in Resend. */
export function getEmailFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS?.trim() || "Hightop Challenge <no-reply@hightopchallenge.com>";
}
