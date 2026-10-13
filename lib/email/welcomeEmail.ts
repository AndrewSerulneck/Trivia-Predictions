import { marketingUrl } from "@/lib/domainSplit";
import { PARTNER_EMAIL_THEME as theme } from "@/lib/themeTokens";
import { WELCOME_EMAIL } from "@/lib/email/partnerEmailCopy";
import { escapeHtml, fillTemplate, formatEmailAmount } from "@/lib/email/emailFormat";

/**
 * One-time partner welcome email. Wording lives in partnerEmailCopy.ts;
 * colours mirror the design system through PARTNER_EMAIL_THEME.
 * Tables, inline styles, absolute PNG URLs and solid background fallbacks
 * keep the layout usable in mail clients without modern CSS or web fonts.
 * Preview locally with `npm run email:preview`.
 */
export type WelcomeEmailInput = {
  venueName: string;
  ownerName: string;
  planAmountCents: number;
  dashboardUrl: string;
};

export type WelcomeEmailContent = {
  subject: string;
  html: string;
  text: string;
};

const assetUrl = (filename: string): string => marketingUrl(`/brand/email/${filename}`);

export const buildWelcomeEmail = (input: WelcomeEmailInput): WelcomeEmailContent => {
  const copy = WELCOME_EMAIL;
  const planAmount = formatEmailAmount(input.planAmountCents);
  const greeting = input.ownerName
    ? fillTemplate(copy.greetingWithName, { ownerName: input.ownerName })
    : copy.greetingWithoutName;
  const greetingHtml = escapeHtml(greeting);
  const confirmation = fillTemplate(copy.confirmation, { venueName: input.venueName, planAmount });
  const confirmationHtml = escapeHtml(confirmation);
  const accents = [theme.cyanLight, theme.gold, theme.violet, theme.emerald];

  const featureCardsHtml = copy.featureTour.map((feature, index) => {
    const accent = accents[index % accents.length];
    return `
      <tr>
        <td style="padding: 0 0 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${theme.elevated}" style="background-color:${theme.elevated}; border-radius:12px; border-left:4px solid ${accent};">
            <tr>
              <td width="34" valign="top" style="padding:18px 0 18px 16px; color:${accent}; font-size:22px; font-weight:800;">${String(index + 1).padStart(2, "0")}</td>
              <td style="padding:18px 16px 18px 12px;">
                <h3 style="margin:0 0 7px; font-size:17px; line-height:1.3; color:${accent};">${escapeHtml(feature.title)}</h3>
                <p style="margin:0; font-size:15px; line-height:1.65; color:${theme.secondary};">${escapeHtml(feature.body)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join("");
  const featureCardsText = copy.featureTour.map((feature) => `- ${feature.title}: ${feature.body}`).join("\n");

  const socialCardsHtml = copy.socialFollow.profiles.map((profile) => `
    <tr>
      <td style="padding:0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${theme.elevated}" style="background-color:${theme.elevated}; border:1px solid ${theme.border}; border-radius:12px;">
          <tr>
            <td width="40" valign="middle" style="padding:16px 0 16px 12px;">
              <a href="${profile.url}" aria-label="${profile.button}" style="text-decoration:none;"><img src="${assetUrl(profile.icon)}" width="40" height="40" alt="${profile.platform}" style="display:block; border:0; border-radius:10px;" /></a>
            </td>
            <td style="padding:16px 12px;">
              <a href="${profile.url}" style="display:block; text-decoration:none; color:${theme.text}; font-size:14px; font-weight:700; line-height:1.5; overflow-wrap:anywhere;">${escapeHtml(profile.handle)}</a>
              <a href="${profile.url}" style="color:${theme.cyanLight}; font-size:13px; line-height:1.5; text-decoration:underline;">${escapeHtml(profile.button)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join("");
  const socialLinksText = copy.socialFollow.profiles.map(
    (profile) => `${profile.button} (${profile.handle}): ${profile.url}`
  ).join("\n");
  const gameRows = Array.from({ length: Math.ceil(copy.games.length / 3) }, (_, row) =>
    copy.games.slice(row * 3, row * 3 + 3)
  );
  const gamesHtml = gameRows.map((games, row) => `<tr>${games.map((game, column) => `
    <td width="33.33%" align="center" valign="middle" style="padding:4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">
        <tr><td height="44" align="center" valign="middle" bgcolor="${theme.elevated}" style="padding:4px; background-color:${theme.elevated}; border:1px solid ${theme.border}; border-radius:8px; color:${accents[(row * 3 + column) % accents.length]}; font-size:13px; font-weight:700; line-height:18px;">${escapeHtml(game)}</td></tr>
      </table>
    </td>`).join("")}</tr>`).join("");

  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${escapeHtml(copy.subject)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${theme.canvas}; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:${theme.text};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${theme.canvas}" style="background-color:${theme.canvas};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${theme.surface}" style="width:100%; max-width:600px; background-color:${theme.surface}; border:1px solid ${theme.border}; border-radius:20px; overflow:hidden;">
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td height="6" bgcolor="${theme.cyan}" style="background-color:${theme.cyan}; font-size:0; line-height:0;">&nbsp;</td>
                  <td height="6" bgcolor="${theme.violet}" style="background-color:${theme.violet}; font-size:0; line-height:0;">&nbsp;</td>
                  <td height="6" bgcolor="${theme.gold}" style="background-color:${theme.gold}; font-size:0; line-height:0;">&nbsp;</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td align="center" bgcolor="${theme.surface}" style="padding:24px 24px 28px; background-color:${theme.surface}; background-image:linear-gradient(150deg, ${theme.surface}, ${theme.elevated}, ${theme.surface});">
                <img src="${assetUrl("htc-logo-v1-384.png")}" width="216" height="216" alt="Hightop Challenge" style="display:block; width:216px; max-width:100%; height:auto; margin:0 auto 12px; border:0;" />
                <p style="margin:0 0 12px; color:${theme.gold}; font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase;">${escapeHtml(copy.eyebrow)}</p>
                <h1 style="margin:0; color:${theme.text}; font-family:Georgia, 'Times New Roman', serif; font-size:30px; line-height:1.2;">${escapeHtml(copy.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px; font-size:16px; color:${theme.text};">${greetingHtml}</p>
                <p style="margin:0; padding:16px; border-left:3px solid ${theme.cyan}; background-color:${theme.elevated}; border-radius:8px; font-size:16px; color:${theme.secondary}; line-height:1.65;">${confirmationHtml}</p>
                <p style="margin:16px 0 0; font-size:16px; color:${theme.secondary}; line-height:1.65;">${escapeHtml(copy.introduction)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px;">
                <h2 style="margin:0 0 16px; font-size:19px; line-height:1.4; color:${theme.text};">${escapeHtml(copy.featureTourHeading)}</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${featureCardsHtml}</table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 0;">
                <h2 style="margin:0 0 12px; font-size:19px; text-align:center; color:${theme.text};">${escapeHtml(copy.gamesHeading)}</h2>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" align="center" style="table-layout:fixed;">${gamesHtml}</table>
                <p style="margin:16px 0 0; text-align:center; font-size:14px; color:${theme.secondary}; line-height:1.65;">${escapeHtml(copy.gamesUpdateNote)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;" align="center">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td align="center" bgcolor="${theme.cyan}" style="background-color:${theme.cyan}; border-radius:10px;">
                    <a href="${input.dashboardUrl}" style="display:inline-block; padding:16px 22px; border:1px solid ${theme.cyan}; border-radius:10px; color:${theme.canvas}; font-size:15px; font-weight:800; line-height:1.4; text-decoration:none;">${escapeHtml(copy.dashboardLink)}</a>
                  </td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 20px; border-top:1px solid ${theme.border};">
                <h2 style="margin:20px 0 10px; font-size:19px; color:${theme.gold};">${escapeHtml(copy.socialFollow.heading)}</h2>
                <p style="margin:0 0 18px; font-size:15px; color:${theme.secondary}; line-height:1.65;">${escapeHtml(copy.socialFollow.body)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${socialCardsHtml}</table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 28px;">
                <p style="margin:0; font-size:14px; color:${theme.muted}; line-height:1.7;">${escapeHtml(copy.signOff).replace(/\n/g, "<br />")}</p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = `${greeting}

${copy.heading}
${confirmation}

${copy.introduction}

${copy.featureTourHeading}
${featureCardsText}

${copy.gamesHeading}:
${gameRows.map((games) => games.join(" · ")).join("\n")}
${copy.gamesUpdateNote}

${copy.dashboardLink}: ${input.dashboardUrl}

${copy.socialFollow.heading}
${copy.socialFollow.body}
${socialLinksText}

${copy.signOff}`;

  return { subject: copy.subject, html, text };
};
