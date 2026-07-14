/**
 * Partner welcome email — sent once, when a venue's Stripe subscription first
 * activates (see app/api/webhooks/stripe/route.ts). This is the file to edit
 * to change what the email says: subject line, feature tour copy, and the
 * TV-setup callout below are all plain data — edit them directly, no HTML
 * knowledge required beyond not breaking the {{ }} placeholders.
 *
 * Most email clients strip complex CSS, so the HTML below intentionally stays
 * simple/inline rather than reusing lib/themeTokens.ts.
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

// ── Edit below this line to change the email's copy ──────────────────────────

/** Subject line. */
const SUBJECT = "Welcome to Hightop Challenge — you're live!";

/** Short confirmation line under the header. {planAmount} is substituted below. */
const CONFIRMATION_LINE = (venueName: string, planAmount: string) =>
  `Your Hightop Challenge subscription for ${venueName} is active — you're all set at ${planAmount}/mo.`;

/** The feature-tour section: one card per Partner Dashboard pillar + player game lineup. */
const FEATURE_TOUR: Array<{ title: string; body: string }> = [
  {
    title: "Schedule live games",
    body: "Put Category Blitz or Live Trivia on the calendar for game nights — pick a time, we handle the rest.",
  },
  {
    title: "Put it on your TVs",
    body: "Link a TV in seconds with a pairing code, no typing URLs. Great for game nights and general ambiance between rounds.",
  },
  {
    title: "Manage billing anytime",
    body: "View invoices, update your card, or change plans from the Partner Dashboard whenever you need to.",
  },
];

/** Player-facing games, listed so partners know what they're offering guests. */
const PLAYER_GAMES = ["Trivia", "Category Blitz", "Pick'em", "Bingo", "Predictions", "Fantasy"];

/** Call-to-action button copy pointing at the TV pairing flow. */
const TV_CTA_LABEL = "Set up your TVs";

/** Call-to-action button copy pointing at the billing/dashboard home. */
const DASHBOARD_CTA_LABEL = "Open your Partner Dashboard";

const SIGN_OFF = "See you on game night,\nThe Hightop Challenge team";

// ── End editable section — everything below assembles the copy above ────────

const formatAmount = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export const buildWelcomeEmail = (input: WelcomeEmailInput): WelcomeEmailContent => {
  const planAmount = formatAmount(input.planAmountCents);
  const greeting = input.ownerName ? `Hi ${input.ownerName},` : "Hi there,";
  const confirmation = CONFIRMATION_LINE(input.venueName, planAmount);

  const featureCardsHtml = FEATURE_TOUR.map(
    (feature) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #111;">${feature.title}</p>
          <p style="margin: 0; font-size: 14px; color: #555;">${feature.body}</p>
        </td>
      </tr>`
  ).join("");

  const featureCardsText = FEATURE_TOUR.map((feature) => `- ${feature.title}: ${feature.body}`).join("\n");

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
                <p style="margin: 0 0 16px; font-size: 14px; color: #888;">${greeting}</p>
                <h1 style="margin: 0 0 12px; font-size: 22px; color: #111;">Welcome to Hightop Challenge</h1>
                <p style="margin: 0 0 24px; font-size: 15px; color: #333; line-height: 1.5;">${confirmation}</p>
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
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #111;">Games your guests can play</p>
                <p style="margin: 0; font-size: 14px; color: #555;">${PLAYER_GAMES.join(" · ")}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 32px 32px;" align="center">
                <a href="${input.tvSetupUrl}" style="display:inline-block; background:#111; color:#fff; text-decoration:none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-bottom: 12px;">${TV_CTA_LABEL}</a>
                <br /><br />
                <a href="${input.billingUrl}" style="display:inline-block; color:#111; text-decoration:underline; font-size: 13px;">${DASHBOARD_CTA_LABEL}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 32px; border-top: 1px solid #eee;">
                <p style="margin: 24px 0 0; font-size: 13px; color: #888; white-space: pre-line;">${SIGN_OFF}</p>
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

What you can do from your Partner Dashboard:
${featureCardsText}

Games your guests can play: ${PLAYER_GAMES.join(", ")}

Set up your TVs: ${input.tvSetupUrl}
Open your Partner Dashboard: ${input.billingUrl}

${SIGN_OFF}`;

  return { subject: SUBJECT, html, text };
};
