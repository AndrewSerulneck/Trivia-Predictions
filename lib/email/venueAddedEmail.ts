import { VENUE_ADDED_EMAIL } from "@/lib/email/partnerEmailCopy";
import { escapeHtml, fillTemplate, formatEmailAmount } from "@/lib/email/emailFormat";

/**
 * "Venue added" email — sent when a partner adds another venue to their bill
 * (docs/multi-venue-volume-billing-plan.md; Andrew 2026-10-11: send our own email as
 * well as Stripe's receipt). Phase 1 builds it; Phase 3's add-a-venue flow sends it via
 * lib/email/sendVenueAddedEmail.ts once the prorated charge has succeeded.
 *
 * THE WORDING IS NOT IN THIS FILE — edit VENUE_ADDED_EMAIL in
 * lib/email/partnerEmailCopy.ts and preview with `npm run email:preview`.
 *
 * Same layout as the welcome email (simple inline HTML; mail clients strip real CSS).
 */

export type VenueAddedEmailInput = {
  /** The venue that was just added. */
  venueName: string;
  ownerName: string;
  /** Venues on the bill AFTER the add (≥ 2). */
  venueCount: number;
  /** The added venue's band price per month (lib/venuePricing.ts `nextVenuePriceCents`). */
  thisVenueCents: number;
  /**
   * The bill's new monthly total. Phase 3 decides list vs. after-discount; the copy says
   * "New monthly total", so pass what the partner will actually be billed (Stripe's preview).
   */
  newMonthlyTotalCents: number;
  /** What Stripe charged today for the rest of the month; null/0 leaves the line out. */
  chargedTodayCents: number | null;
  tvSetupUrl: string;
  dashboardUrl: string;
};

export type VenueAddedEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export const buildVenueAddedEmail = (input: VenueAddedEmailInput): VenueAddedEmailContent => {
  const copy = VENUE_ADDED_EMAIL;

  const amounts = {
    thisVenueAmount: formatEmailAmount(input.thisVenueCents),
    monthlyTotal: formatEmailAmount(input.newMonthlyTotalCents),
    chargedToday: formatEmailAmount(input.chargedTodayCents ?? 0),
    venueCount: String(input.venueCount),
  };
  // Partner-typed names are escaped for the HTML version only (see escapeHtml).
  const textValues = { ...amounts, venueName: input.venueName, ownerName: input.ownerName };
  const htmlValues = { ...amounts, venueName: escapeHtml(input.venueName), ownerName: escapeHtml(input.ownerName) };

  const text = (line: string) => fillTemplate(line, textValues);
  const html = (line: string) => fillTemplate(line, htmlValues);

  const greeting = input.ownerName ? copy.greetingWithName : copy.greetingWithoutName;
  const billingLines = [
    copy.thisVenueLine,
    copy.monthlyTotalLine,
    ...(input.chargedTodayCents ? [copy.chargedTodayLine] : []),
  ];

  const billingLinesHtml = billingLines
    .map((line) => `<p style="margin: 0 0 6px; font-size: 14px; color: #333;">${html(line)}</p>`)
    .join("");
  const billingNoteHtml = copy.billingNote
    ? `<p style="margin: 10px 0 0; font-size: 13px; color: #777;">${html(copy.billingNote)}</p>`
    : "";

  const nextStepsHtml = copy.nextSteps
    .map(
      (step) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #111;">${html(step.title)}</p>
          <p style="margin: 0; font-size: 14px; color: #555;">${html(step.body)}</p>
        </td>
      </tr>`
    )
    .join("");

  const htmlBody = `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding: 32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 32px 32px 8px;">
                <p style="margin: 0 0 16px; font-size: 14px; color: #888;">${html(greeting)}</p>
                <h1 style="margin: 0 0 12px; font-size: 22px; color: #111;">${html(copy.heading)}</h1>
                <p style="margin: 0 0 24px; font-size: 15px; color: #333; line-height: 1.5;">${html(copy.intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f8; border-radius: 8px;">
                  <tr>
                    <td style="padding: 16px 18px;">
                      <p style="margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #111;">${html(copy.billingHeading)}</p>
                      ${billingLinesHtml}
                      ${billingNoteHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 32px 0;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111;">${html(copy.nextStepsHeading)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${nextStepsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 32px 32px;" align="center">
                <a href="${input.tvSetupUrl}" style="display:inline-block; background:#111; color:#fff; text-decoration:none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-bottom: 12px;">${html(copy.tvButton)}</a>
                <br /><br />
                <a href="${input.dashboardUrl}" style="display:inline-block; color:#111; text-decoration:underline; font-size: 13px;">${html(copy.dashboardLink)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 32px; border-top: 1px solid #eee;">
                <p style="margin: 24px 0 0; font-size: 13px; color: #888; white-space: pre-line;">${html(copy.signOff)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const textBody = [
    text(greeting),
    "",
    text(copy.intro),
    "",
    `${text(copy.billingHeading)}:`,
    ...billingLines.map((line) => `- ${text(line)}`),
    ...(copy.billingNote ? ["", text(copy.billingNote)] : []),
    "",
    `${text(copy.nextStepsHeading)}:`,
    ...copy.nextSteps.map((step) => `- ${text(step.title)}: ${text(step.body)}`),
    "",
    `${text(copy.tvButton)}: ${input.tvSetupUrl}`,
    `${text(copy.dashboardLink)}: ${input.dashboardUrl}`,
    "",
    text(copy.signOff),
  ].join("\n");

  return { subject: text(copy.subject), html: htmlBody, text: textBody };
};
