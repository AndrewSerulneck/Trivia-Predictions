# Partner welcome email assets

The welcome email uses the same logo artwork as the sign-in pages, exported as
a small PNG for email clients. Instagram and Facebook marks reuse the shapes on
`app/info/page.tsx`, with coloured backgrounds. No new image generation API is used.

Regenerate with `node scripts/build-partner-email-assets.cjs`, then preview with
`npm run email:preview`. The preview HTML uses local images so it works before
deployment. Actual emails use absolute site URLs built with `marketingUrl()`.
Deploy `public/brand/email/` with the email template before sending the new design.
Keep versioned assets available for old emails; new artwork needs new filenames.

Copy: `lib/email/partnerEmailCopy.ts`. Layout: `lib/email/welcomeEmail.ts`.
Inline colours: `PARTNER_EMAIL_THEME` in `lib/themeTokens.ts`, mapped from existing
tokens in `design-system/hightop-challenge-design-system/project/colors_and_type.css`.
The main button opens `/owner/dashboard`, on the marketing host.

## Size and recurring usage baseline (2026-10-12)

The prior welcome email had no image requests. The source logo is 1,694,390 bytes;
serving that file for every open would be unnecessary bandwidth. New PNGs total
54,190 bytes (logo 51,771; Instagram 1,876; Facebook 543). The rendered preview
HTML is approximately 12 KB. Rendering adds no API calls, database queries,
scheduled work, extra sends or attachments.

Actual subscriber/open volume and hosting charges were not inspected. Estimates
assume one uncached image load per email, with all three images requested:

| New subscribers/month | Extra image requests/month | Image transfer/month | Average/day |
| --- | --- | --- | --- |
| 100 | 300 | 5.4 MB | 0.18 MB |
| 10,000 | 30,000 | 542 MB | 18.1 MB |

Three uncached opens/retries per recipient triple these numbers; image proxy and
browser caching can reduce them. Each load is bounded to three static files.
No deployment or real email send was performed for this change, so post-release
usage and actual Gmail/Outlook/Apple Mail inbox rendering remain unmeasured.

## Verification

- `npx tsc --noEmit`: passed.
- ESLint on the changed TypeScript, tests and scripts: passed.
- `npx vitest run tests/lib.email.welcomeEmail.test.ts tests/lib.email.venueAddedEmail.test.ts tests/api.webhooks.stripe-unfinished-signup.test.ts tests/api.webhooks.stripe.reveal-venue.test.ts tests/brand-logo-assets-contract.test.ts tests/fonts-contract.test.ts`: 47 passed.
- Local Chromium previews at 320, 375 and 900 px: no horizontal overflow, centered
  logo, all three PNGs loaded, correct dashboard and social links. Screenshots are
  ignored artifacts under `tmp/email-previews/`.
- Production HTML checked for absolute PNG URLs, escaped partner names, social
  links in HTML and text, and promotion guidance between scheduling and TVs.

This is a standalone email redesign, not a phase of an existing implementation plan.
