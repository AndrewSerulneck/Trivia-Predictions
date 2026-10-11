import { WELCOME_EMAIL } from "@/lib/email/partnerEmailCopy";
import { escapeHtml, fillTemplate, formatEmailAmount } from "@/lib/email/emailFormat";

/**
 * Partner welcome email — sent once, when a venue's Stripe subscription first
 * activates (see app/api/webhooks/stripe/route.ts).
 *
 * THE WORDING IS NOT IN THIS FILE. To change what the email says — subject line,
 * feature tour, buttons, sign-off — edit WELCOME_EMAIL in
 * lib/email/partnerEmailCopy.ts and preview with `npm run email:preview`. This
 * file only lays the copy out.
 *
 * Most email clients strip complex CSS, so the HTML below intentionally stays
 * simple/inline rather than reusing lib/themeTokens.ts. Partner-typed names are
 * escaped in the HTML only (see escapeHtml in lib/email/emailFormat.ts).
 */

export type WelcomeEmailInput = {
  venueName: string;
  ownerName: string;
  planAmountCents: number;
  tvSetupUrl: string;
  billingUrl: string;
};

export type WelcomeEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export const buildWelcomeEmail = (input: WelcomeEmailInput): WelcomeEmailContent => {
  const copy = WELCOME_EMAIL;
  const planAmount = formatEmailAmount(input.planAmountCents);
  const greeting = input.ownerName
    ? fillTemplate(copy.greetingWithName, { ownerName: input.ownerName })
    : copy.greetingWithoutName;
  const greetingHtml = input.ownerName
    ? fillTemplate(copy.greetingWithName, { ownerName: escapeHtml(input.ownerName) })
    : copy.greetingWithoutName;
  const confirmation = fillTemplate(copy.confirmation, { venueName: input.venueName, planAmount });
  const confirmationHtml = fillTemplate(copy.confirmation, { venueName: escapeHtml(input.venueName), planAmount });

  const featureCardsHtml = copy.featureTour.map(
    (feature) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #111;">${feature.title}</p>
          <p style="margin: 0; font-size: 14px; color: #555;">${feature.body}</p>
        </td>
      </tr>`
  ).join("");

  const featureCardsText = copy.featureTour.map((feature) => `- ${feature.title}: ${feature.body}`).join("\n");

  const html = `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding: 32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius: 12px; overflow: hidden;">
            <tr>
              <td style="padding: 32px 32px 8px;">
                <p style="margin: 0 0 16px; font-size: 14px; color: #888;">${greetingHtml}</p>
                <h1 style="margin: 0 0 12px; font-size: 22px; color: #111;">${copy.heading}</h1>
                <p style="margin: 0 0 24px; font-size: 15px; color: #333; line-height: 1.5;">${confirmationHtml}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${featureCardsHtml}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 32px 8px;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #111;">${copy.gamesHeading}</p>
                <p style="margin: 0; font-size: 14px; color: #555;">${copy.games.join(" · ")}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 32px 32px;" align="center">
                <a href="${input.tvSetupUrl}" style="display:inline-block; background:#111; color:#fff; text-decoration:none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-bottom: 12px;">${copy.tvButton}</a>
                <br /><br />
                <a href="${input.billingUrl}" style="display:inline-block; color:#111; text-decoration:underline; font-size: 13px;">${copy.dashboardLink}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 32px; border-top: 1px solid #eee;">
                <p style="margin: 24px 0 0; font-size: 13px; color: #888; white-space: pre-line;">${copy.signOff}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = `${greeting}

${confirmation}

${copy.featureTourHeading}
${featureCardsText}

${copy.gamesHeading}: ${copy.games.join(", ")}

${copy.tvButton}: ${input.tvSetupUrl}
${copy.dashboardLink}: ${input.billingUrl}

${copy.signOff}`;

  return { subject: copy.subject, html, text };
};
