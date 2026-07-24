# Partner Account Password Reset Email Plan

## Goal

Let a logged-in partner request a temporary password-reset email from **Account
Settings** without typing their current password.

The email must go only to the email address already on file for their owner
account (`venue_owners.email`). The partner clicks the temporary link, lands on
the existing `/owner/reset-password` page, and sets a new password.

## Plain-English Answer

Yes, we can do this.

The app already has most of the flow:

- `POST /api/owner/auth/forgot-password` sends a Supabase password-reset email.
- `/owner/reset-password` reads the temporary recovery token from the email link.
- `POST /api/owner/auth/reset-password` verifies the token and updates the
  Supabase Auth password.

The new work is to add a logged-in Account Settings action that sends the same
kind of temporary reset link to the partner's current saved email, instead of
asking the partner to type an email address.

## Product Behavior

On `/owner/account`, add a third compact section or a secondary action inside
the password section:

- Label: `Email me a reset link`
- Supporting copy: `Send a temporary password-reset link to {current email}.`
- Success message: `Password reset email sent. Check your inbox.`
- Generic failure message: `We couldn't send that email right now. Please try again.`

This action should not reveal any other account email. It uses the authenticated
owner session to load the current owner row and sends only to `owner.email`.

## Security Decisions

- This flow is allowed without the current password because the reset link is
  delivered only to the already-saved owner email.
- The request must require a valid `tp_owner_sess` through `requireOwnerAuth()`.
- The API must ignore any email provided by the browser. The destination email
  always comes from `venue_owners.email`.
- Keep the response generic enough that it does not disclose unrelated account
  existence.
- Keep the existing owner session active after sending the email.
- The actual password change still depends on Supabase's temporary recovery
  token and the existing reset-password endpoint.
- Add lightweight throttling or abuse protection so a logged-in shared-device
  session cannot spam the account inbox.

## Phase 1 — Contract Check

**Work**

- Confirm current Supabase password reset settings:
  - recovery link expiration
  - redirect URL allow-list includes `/owner/reset-password`
  - email template is acceptable for partner accounts
- Confirm which base URL should be used for reset links:
  - likely `NEXT_PUBLIC_BASE_URL + /owner/reset-password`
  - domain-split follow-up: make sure the link lands on the Partner Dashboard
    host, not the player `play.` host.
- Decide whether the button lives as a separate card or inside the Password
  section.

**Best Codex model:** Codex 5.4  
**Intelligence level:** Medium  
**Why:** Mostly discovery and product fit. The existing forgot/reset flow is
already present.

### Phase 1 Execution Notes (2026-07-24)

Status: partially confirmed in-repo; Supabase dashboard settings still require
operator verification.

Confirmed from the current codebase:

- The owner forgot/reset flow already exists and is wired as described:
  - `app/api/owner/auth/forgot-password/route.ts`
  - `app/api/owner/auth/reset-password/route.ts`
  - `app/owner/reset-password/page.tsx`
- The logged-in account page already has a dedicated Password card in
  `app/owner/account/page.tsx`, so the new action should live **inside the
  existing Password section** as a secondary action, not as a separate third
  card. That keeps both password paths together:
  - direct password change with current password
  - email-on-file reset fallback
- The reset-link base URL should **not** keep using
  `NEXT_PUBLIC_BASE_URL + /owner/reset-password` for the new authenticated flow.
  Under the domain split, `/owner/*` is explicitly classified as a
  **marketing/Partner Dashboard host** route in `lib/domainSplit.ts`, while
  `play.` is reserved for game routes.
- The correct redirect target for reset emails is therefore:
  `marketingUrl("/owner/reset-password")`
  This resolves to the apex/Partner Dashboard host once the split is enabled,
  and stays safe before the split because `marketingUrl()` falls back to the
  current single-origin base.
- There is an existing implementation gap to clean up while touching this area:
  `app/api/owner/auth/forgot-password/route.ts` still builds `redirectTo` from
  `NEXT_PUBLIC_BASE_URL`. Phase 2 should switch that logic to the
  domain-split-aware helper so both the public forgot-password flow and the new
  logged-in flow use the same correct destination.

Not confirmable from this repository alone:

- Supabase recovery-link expiration
- Supabase Auth redirect allow-list contents
- Supabase reset email template copy / branding

Those settings appear to be operator-managed in Supabase Auth, not committed in
this repo. Before Phase 2 ships, verify in the Supabase dashboard that:

- the recovery redirect allow-list includes the absolute
  `/owner/reset-password` URL for the production Partner Dashboard host
- the recovery-link lifetime is acceptable for partner use
- the current Supabase reset email wording is acceptable for owner/partner
  accounts

Phase 1 decision summary:

- **Placement:** inside the existing Password card as a secondary action
- **Redirect base:** `marketingUrl("/owner/reset-password")`
- **Blocker status:** no code blocker; only Supabase dashboard settings need
  verification before rollout

## Phase 2 — Backend API

**Work**

Add an authenticated endpoint:

- `POST /api/owner/account/password-reset-email`
  - calls `requireOwnerAuth(request)`
  - loads the owner profile via the existing `loadOwnerAccountProfile(ownerId)`
  - sends `supabaseAdmin.auth.resetPasswordForEmail(owner.email, { redirectTo })`
  - returns `{ ok: true }` on success
  - returns a generic 500 message if Supabase or configuration fails

Important details:

- Do not accept an email in the request body.
- Log failures with owner id and destination email for support repair.
- Consider rate limiting:
  - simple first pass: in-memory or existing rate-limit helper if one exists
  - stronger pass: database-backed timestamp such as
    `venue_owners.password_reset_requested_at`
  - practical target: max one reset email per owner every 2-5 minutes

**Best Codex model:** Codex 5.5  
**Intelligence level:** High  
**Why:** This is account-security work. The endpoint is small, but the important
part is avoiding email injection, session bypasses, and reset-email spam.

## Phase 3 — Account Settings UI

**Work**

Update `app/owner/account/page.tsx`:

- Add a button that calls `POST /api/owner/account/password-reset-email`.
- Show loading state while sending.
- On `401`, redirect to `/owner/login`.
- On success, show `Password reset email sent. Check your inbox.`
- On failure, show `We couldn't send that email right now. Please try again.`
- Keep the existing direct password-change form for partners who know their
  current password.

Recommended UX:

- Keep both options:
  - `Update password` with current password
  - `Email me a reset link` for the email-on-file fallback

**Best Codex model:** Codex 5.4  
**Intelligence level:** Medium  
**Why:** Straightforward UI wiring, with a small amount of auth-aware response
handling.

## Phase 4 — Tests

**Work**

Add focused Vitest coverage:

- authenticated owner sends reset email to `venue_owners.email`
- request body email is ignored if supplied
- unauthenticated request returns 401
- missing owner profile returns generic failure
- Supabase reset failure logs and returns generic failure
- rate-limit path returns a clear non-sensitive message, if rate limiting is
  implemented in this phase

Also add a UI-level test only if the repo already has a good owner page testing
pattern. Otherwise, API tests plus TypeScript/build verification are enough.

**Best Codex model:** Codex 5.5  
**Intelligence level:** High  
**Why:** Tests need to prove the endpoint cannot be tricked into sending reset
links to a user-controlled email.

## Phase 5 — Verification

**Work**

Run:

- `npm run test -- tests/api.owner.account.test.ts`
- `npm run test`
- `npx tsc --noEmit`
- `npm run build`

Manual checks:

- Log in as a partner.
- Open `/owner/account`.
- Click `Email me a reset link`.
- Confirm the email arrives at the current account email.
- Click the temporary link.
- Set a new password.
- Sign out.
- Confirm the old password fails and the new password succeeds.
- Confirm the owner session behavior is acceptable if the partner also had an
  existing dashboard tab open.

**Best Codex model:** Codex 5.4  
**Intelligence level:** Medium  
**Why:** Mostly running verification and checking the real email-provider path.

## Phase 6 — Diagnose Live Reset Link Routing

**Problem observed**

The reset email link received on the live site currently lands on the game
sign-in host (`play.hightopchallenge.com`) instead of taking the partner to the
Partner Dashboard reset-password screen.

**Likely causes to check**

- Supabase Auth URL Configuration still has the **Site URL** set to the player
  game host, and the recovery email template may be using `{{ .SiteURL }}`
  instead of the passed `{{ .ConfirmationURL }}` or `{{ .RedirectTo }}`.
- The production Supabase redirect allow-list may not include the apex Partner
  Dashboard reset URL:
  `https://hightopchallenge.com/owner/reset-password`
- The live environment variables used by `marketingUrl("/owner/reset-password")`
  may point at the wrong host:
  - `NEXT_PUBLIC_SITE_URL`
  - `NEXT_PUBLIC_APEX_HOST`
  - `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`
  - any production/preview overrides that affect the apex base URL
- The public forgot-password route and the logged-in account reset route must
  both generate the same Partner Dashboard redirect target.

**Work**

1. Add or confirm a route-handler test that proves both owner reset-email entry
   points call Supabase with:
   `redirectTo: "https://hightopchallenge.com/owner/reset-password"` when the
   production apex URL is configured.
2. Inspect the live deployment environment values without exposing secrets.
   Confirm the apex URL values are consistent with the domain split plan.
3. Inspect Supabase Auth URL Configuration in the dashboard:
   - Site URL should be the apex/Partner Dashboard host, or at minimum the
     recovery template must not rely on a player-host `{{ .SiteURL }}`.
   - Redirect URLs must include the exact Partner Dashboard reset URL.
4. Send one live reset email after configuration changes and copy the raw link
   target into the verification notes, redacting tokens.

**Expected result**

Clicking the email link should first verify the Supabase recovery token, then
redirect the partner to:

`https://hightopchallenge.com/owner/reset-password`

It must not land on `/`, the JoinFlow, or `play.hightopchallenge.com`.

**Best Codex model:** Codex 5.5  
**Intelligence level:** High  
**Why:** This is a cross-system auth redirect problem involving app code,
deployment environment, Supabase dashboard configuration, and live manual
verification. A wrong fix can strand partners on the player login or break the
temporary recovery token flow.

### Phase 6 Execution Notes (2026-07-24)

Status: partially complete. The app-code and Vercel environment pieces are
confirmed; the remaining blocker is Supabase dashboard configuration and one
real email-link verification.

Confirmed in code:

- `app/api/owner/account/password-reset-email/route.ts` uses
  `marketingUrl("/owner/reset-password")` for authenticated Account Settings
  reset emails.
- `app/api/owner/auth/forgot-password/route.ts` also uses
  `marketingUrl("/owner/reset-password")` for public forgot-password emails.
- Added route-handler tests in `tests/api.owner.account.test.ts` proving both
  reset-email entry points call Supabase with:
  `redirectTo: "https://hightopchallenge.com/owner/reset-password"` when
  `NEXT_PUBLIC_SITE_URL` is configured as the production apex URL.

Confirmed in Vercel production env without exposing secret values:

- Vercel project: `andrewserulnecks-projects/hightop-challenge`
- Supabase project linked in CLI: `Trivia-Predictions`
  (`pkmxupsayzshvpirkaav`)
- `NEXT_PUBLIC_SITE_URL="https://hightopchallenge.com"`
- `NEXT_PUBLIC_APEX_HOST="hightopchallenge.com"`
- `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED="true"`
- `NEXT_PUBLIC_PLAY_URL="https://play.hightopchallenge.com"`
- `NEXT_PUBLIC_PLAY_HOST="play.hightopchallenge.com"`
- `NEXT_PUBLIC_COOKIE_DOMAIN=".hightopchallenge.com"`

Automated verification run:

- `npm run test -- tests/api.owner.account.test.ts` passed
  (`17` tests)
- `npx tsc --noEmit` passed

Supabase dashboard/config status:

- Supabase CLI is authenticated and linked, but this CLI version does not expose
  a safe read command for hosted Auth URL Configuration or Auth email templates;
  `supabase config` only exposes `push`.
- User-supplied Supabase dashboard values:
  - Auth Site URL: `http://localhost:3000`
  - Redirect URLs: none configured
  - Reset Password subject: `Reset Your Password`
  - Reset Password template uses `{{ .ConfirmationURL }}` for the clickable
    reset link
- The recovery template link variable is correct. The redirect issue is
  therefore caused by Supabase URL Configuration, not by app code or template
  link construction.
- Because no Redirect URLs are configured, the production
  `redirectTo: "https://hightopchallenge.com/owner/reset-password"` value sent
  by the app is not allow-listed for Supabase recovery redirects. The Site URL
  is also still a localhost development value, which is incorrect for the hosted
  production project.

Remaining Phase 6 manual action:

1. In the Supabase dashboard for project `Trivia-Predictions`, open
   Authentication → URL Configuration.
2. Change Site URL from `http://localhost:3000` to:
   `https://hightopchallenge.com`
3. Add this exact Redirect URL:
   `https://hightopchallenge.com/owner/reset-password`
4. Optional but recommended for local development, add:
   `http://localhost:3000/owner/reset-password`
5. Leave the Reset Password template button pointed at
   `{{ .ConfirmationURL }}`.
6. Send one live reset email, click the link, and verify the raw target
   redirects to `https://hightopchallenge.com/owner/reset-password` after
   Supabase verifies the recovery token. Redact token values in any notes.

## Phase 7 — Brand The Sender And Recovery Email Template

**Can we make the email come from `Hightop Challenge Password Reset`?**

Yes, but this is primarily Supabase/Auth email-provider configuration, not a
Next.js code change.

For hosted Supabase projects, sender branding is controlled through custom SMTP
configuration. Supabase's default SMTP is meant for development/testing, has
tight delivery limits, and is not the right production sender identity. Configure
custom SMTP with:

- From/admin email: a verified sender address such as
  `password-reset@hightopchallenge.com` or `support@hightopchallenge.com`
- Sender display name: `Hightop Challenge Password Reset`

The exact available fields depend on whether this is configured in the Supabase
dashboard or via the Management API, but Supabase's Auth SMTP configuration
supports a sender email and sender name.

**Can the content match normal password reset emails?**

Yes. Supabase Auth has a dedicated **Reset Password / recovery** email template.
The recovery template should be edited in the Supabase dashboard for hosted
projects. It should keep the language familiar and security-focused:

- clear subject, likely `Reset your Hightop Challenge password`
- short explanation that a password reset was requested
- single prominent reset button
- statement that the link is temporary
- statement that the recipient can ignore the email if they did not request it
- minimal product copy; this is transactional auth email, not marketing

**Important template implementation detail**

Use Supabase's recovery confirmation URL variable for the clickable reset link,
not a hand-built link to the app. The template should preserve the token-bearing
Supabase verification link so Supabase can verify the recovery token before
redirecting to `/owner/reset-password`.

Recommended button target:

`{{ .ConfirmationURL }}`

Avoid using only `{{ .SiteURL }}` for the reset button, because that can send
the partner to the default site homepage instead of the recovery redirect.

**Work**

1. Choose the sender address and confirm DNS/provider readiness:
   - SPF
   - DKIM
   - DMARC alignment, if available
2. Configure Supabase custom SMTP for production.
3. Set the SMTP sender display name to:
   `Hightop Challenge Password Reset`
4. Update the Supabase Auth recovery template in the hosted dashboard.
5. Keep the template's reset button pointed at `{{ .ConfirmationURL }}`.
6. Send test emails to at least:
   - one internal admin address
   - one real partner-style account
7. Verify the visible sender, subject, body copy, and reset URL behavior.

**Suggested recovery template language**

Subject:

`Reset your Hightop Challenge password`

Body copy:

```html
<h2>Reset your Hightop Challenge password</h2>
<p>We received a request to reset the password for your Partner Dashboard account.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>This link is temporary. If you did not request a password reset, you can ignore this email.</p>
```

The dashboard editor can wrap this copy in the existing Supabase template
structure or a branded HTML shell. Keep the message short and transactional.

**Best Codex model:** Codex 5.4  
**Intelligence level:** Medium  
**Why:** The hard part is knowing which settings live outside the repo. The copy
and template are straightforward, but the sender identity requires careful email
provider/DNS configuration.

### Phase 7 Execution Notes (2026-07-24)

Status: app-side and send-trigger verification complete; inbox/result
inspection still needs user confirmation.

User-supplied current recovery template:

```html
<h2>Reset HighTop Challenge Partner Password</h2>

<p>Follow this link to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>

<p>If you did not ask to reset your HighTop Challenge Partner password, please ignore this email.</p>
```

Template sanity check:

- `{{ .ConfirmationURL }}` is the correct Supabase variable for the reset link.
- No app-code source contains the old sent-email sentence
  `Follow this link to reset the password for your user:`.
- If the live email still contains that old sentence after saving the dashboard
  template and sending a fresh reset email, the likely issues are outside the
  Next.js app:
  - the wrong Supabase project/template was edited,
  - the dashboard edit did not persist,
  - Supabase is sending through/defaulting to an unchanged hosted Auth template,
    or
  - the email being inspected was generated before the template update.

Recommended final copy normalization:

- Use `Hightop` casing consistently in prose unless the brand is deliberately
  `HighTop` in the dashboard/email channel.
- Recommended subject:
  `Reset your Hightop Challenge Partner password`
- Recommended body:

```html
<h2>Reset your Hightop Challenge Partner password</h2>

<p>We received a request to reset the password for your Partner Dashboard account.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>

<p>This link is temporary. If you did not request a password reset, you can ignore this email.</p>
```

Recommended SMTP path:

- Use the existing production email provider if possible. The Vercel project
  already has a `RESEND_API_KEY` environment variable, so Resend is the likely
  simplest provider if the `hightopchallenge.com` sender domain is verified
  there.
- Supabase custom SMTP settings for Resend:
  - Host: `smtp.resend.com`
  - Port: `465`
  - Username: `resend`
  - Password: a Resend API key with send permissions
  - Sender email: `password-reset@hightopchallenge.com` or
    `support@hightopchallenge.com`
  - Sender name: `Hightop Challenge Password Reset`
- Disable email click/open tracking in the email provider for Supabase Auth
  messages so tracking rewrites do not interfere with `{{ .ConfirmationURL }}`.

What is needed to finish Phase 7:

1. Confirm which sender email to use:
   `password-reset@hightopchallenge.com`, `support@hightopchallenge.com`, or
   another verified `@hightopchallenge.com` address.
2. Confirm the provider/domain is verified and has SPF/DKIM configured.
3. Provide a safe way to configure Supabase custom SMTP:
   - preferred: user enters the SMTP settings directly in Supabase dashboard, or
   - provide a short-lived Supabase Management API access token plus SMTP
     credentials for Codex to apply via the Management API.
4. Send a fresh reset email after saving SMTP/template settings and verify:
   - visible sender is `Hightop Challenge Password Reset`,
   - subject/body match the approved copy,
   - the reset button still uses the Supabase recovery confirmation URL and
     lands on `/owner/reset-password`.

Phase 7 live send attempt:

- User configured Supabase SMTP through Resend.
- Expected sender email: `password-reset@hightopchallenge.com`
- Test recipient: `andrewserulneck@gmail.com`
- Triggered production endpoint:
  `POST https://hightopchallenge.com/api/owner/auth/forgot-password`
- Production response: `{ "ok": true }`
- Inbox verification:
  - email arrived,
  - sender/content looked correct,
  - reset link still did not land on the reset-password page.
- Observed redirect behavior: Supabase verified the recovery link and redirected
  to the apex Site URL root with a `type=recovery` URL fragment containing the
  recovery session, instead of preserving `/owner/reset-password`.
- Fix added in app code:
  - `lib/ownerRecoveryRedirect.ts`
  - `components/owner/OwnerRecoveryRedirectGuard.tsx`
  - mounted globally in `app/layout.tsx`
- The guard detects Supabase recovery fragments (`type=recovery` +
  `access_token`) anywhere outside `/owner/reset-password`, then client-side
  replaces the URL with `/owner/reset-password#...` while preserving the full
  fragment. This covers Supabase landing on `https://hightopchallenge.com/#...`
  and the domain-split apex root rewrite to `/info`.
- Added `tests/lib.ownerRecoveryRedirect.test.ts`.
- Verification run:
  - `npm run test -- tests/lib.ownerRecoveryRedirect.test.ts tests/api.owner.account.test.ts` passed
  - `npx tsc --noEmit` passed
  - `npm run build` passed
- Production deployment:
  - `vercel --prod --yes` completed successfully
  - aliased to `https://hightopchallenge.com`
- Fresh post-deploy reset email request:
  - `POST https://hightopchallenge.com/api/owner/auth/forgot-password`
  - recipient `andrewserulneck@gmail.com`
  - response `{ "ok": true }`
- Remaining confirmation from inbox:
  - click the fresh post-deploy reset email,
  - confirm the root recovery fragment is redirected to
    `/owner/reset-password`,
  - set a new password successfully.
- User confirmed the fresh post-deploy reset email worked.

## Phase 8 — End-To-End Production Reset Verification

**Work**

Run the complete live-path verification after Phases 6 and 7:

1. Log in as a partner on the Partner Dashboard.
2. Open `/owner/account`.
3. Click `Email me a reset link`.
4. Confirm the message arrives from:
   `Hightop Challenge Password Reset`
5. Confirm the subject/body use the approved recovery language.
6. Click the email reset button.
7. Confirm the browser lands on:
   `https://hightopchallenge.com/owner/reset-password`
8. Set a new password.
9. Sign out.
10. Confirm the old password fails.
11. Confirm the new password works on the Partner Dashboard.
12. Confirm the flow does not accidentally open the player game login at
    `play.hightopchallenge.com`.

**Automated checks to run before the live manual test**

- `npm run test -- tests/api.owner.account.test.ts`
- `npm run test`
- `npx tsc --noEmit`
- `npm run build`

**Best Codex model:** Codex 5.4  
**Intelligence level:** Medium  
**Why:** This phase is mostly verification, but it crosses app code, Supabase
Auth, email delivery, DNS-backed sender identity, and the production domain
split.

### Phase 8 Execution Notes (2026-07-24)

Status: complete.

Confirmed by live production test:

- Supabase/Resend password reset email arrives with correct sender/content.
- Fresh reset link lands on the Partner Dashboard reset-password screen.
- Partner can set a new password.
- Signing out and using the old password fails.
- Signing in with the new password succeeds.
- Partner lands in the Partner Dashboard after login.

## Suggested Build Order

1. Add the authenticated reset-email API.
2. Add API tests proving the destination email is server-owned.
3. Add the Account Settings button and UI states.
4. Diagnose and fix the live reset-link host so recovery lands on the Partner
   Dashboard reset screen, not the player game login.
5. Configure the Supabase/custom SMTP sender identity and recovery email
   template.
6. Run automated verification.
7. Do one real email reset test in a development or staging environment.
8. Do one production reset test after Supabase dashboard and SMTP settings are
   updated.

## Out of Scope

- Changing the account email through the reset link.
- Admin-triggered password reset emails.
- MFA.
- Forced sign-out of other sessions after password reset.
- Marketing email redesign. The Supabase recovery email may be lightly branded
  and rewritten for clarity, but it should stay a transactional password-reset
  email.

## Follow-Up Recommendation

Before building this, fix the existing Account Settings UI/API drift where
`Current password is incorrect.` responses use HTTP 401 and the page interprets
that as “send the partner to login.” That is separate from this plan, but it
touches the same password section and is easiest to correct before adding the
new reset-email action.
